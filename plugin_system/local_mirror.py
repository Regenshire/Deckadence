"""Generative Art AI: opt-in image generation, separate from detection.

The existing component directory and API names remain stable so installed
models, active downloads and saved settings survive the display-name change.
"""
import atexit
import json
import math
import os
import platform
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager

from flask import jsonify, request
from paths import BUNDLE_BASE_DIR, PLUGIN_ROOT_DIR
from . import ai_prompts
from .studio_prompter import compiler, contracts, diagnostics

SOURCE = Path(BUNDLE_BASE_DIR, 'plugin_src', 'card-finishing-studio')
MODELS = json.loads((SOURCE / 'generation_models.json').read_text(encoding='utf-8'))
OUTPAINT = json.loads((SOURCE / 'generation_outpaint.json').read_text(encoding='utf-8'))
ANALYZER = json.loads((SOURCE / 'generation_analyzer.json').read_text(encoding='utf-8'))
PACKAGE_CATALOG = json.loads((SOURCE / 'generation_packages.json').read_text(encoding='utf-8'))
PACKAGES = PACKAGE_CATALOG['packages']
DEFAULT_MODEL = 'sd_turbo'
RUNTIME_VERSION = 1
COMMON_PACKAGES = ['diffusers==0.41.0', 'transformers==5.20.2', 'accelerate==1.15.0',
                   'safetensors>=0.6,<1', 'sentencepiece>=0.2,<1', 'Pillow>=11.3,<13']
HARDWARE = {
    'mps': {'name': 'Apple Silicon GPU · Metal', 'description': 'M-series Mac with macOS 14 or newer. Uses the Apple GPU and unified memory. Setup tests the GPU before downloading models; private Python is installed automatically.'},
    'nvidia': {'name': 'NVIDIA CUDA', 'description': 'RTX 30-series or newer, or an equivalent NVIDIA GPU with native BF16 support. Setup tests the GPU before downloading models. Requires a current NVIDIA driver; private Python is installed automatically.'},
    'amd': {'name': 'AMD Radeon · ROCm', 'description': 'Supported Radeon GPUs with a compatible AMD ROCm driver. Private Python 3.12 is installed automatically.'},
    'cpu': {'name': 'CPU', 'description': 'No GPU required; uses substantial system RAM and can take a long time per scene. Private Python is installed automatically.'},
}


class LocalMirrorError(RuntimeError):
    """A safe, user-facing setup or inference failure."""


def available_hardware():
    if sys.platform == 'darwin':
        keys = ('mps', 'cpu') if platform.machine().lower() in ('arm64', 'aarch64') else ()
    else:
        keys = ('nvidia', 'amd', 'cpu') if sys.platform in ('win32', 'linux') else ()
    return {key: HARDWARE[key] for key in keys}


def validate_processor(hardware):
    if sys.platform == 'darwin':
        if platform.machine().lower() not in ('arm64', 'aarch64'):
            raise LocalMirrorError('Generative Art AI on macOS requires Apple Silicon and the native Apple Silicon version of Deckadence.')
        version = platform.mac_ver()[0].split('.')
        if not version[0].isdigit() or int(version[0]) < 14:
            raise LocalMirrorError('Generative Art AI on Mac requires macOS 14 or newer.')
    if hardware not in available_hardware():
        raise LocalMirrorError('Choose a processor available on this operating system.')


def runtime_packages(hardware):
    validate_processor(hardware)
    if sys.platform == 'darwin':
        # Official arm64 wheels include both Metal and CPU; CUDA/ROCm indexes do not.
        return ['torch==2.11.0', 'torchvision==0.26.0']
    if hardware == 'nvidia':
        return ['--index-url', 'https://download.pytorch.org/whl/cu128', 'torch==2.11.0+cu128', 'torchvision==0.26.0+cu128']
    if hardware == 'amd':
        if os.name == 'nt':
            return ['--extra-index-url', 'https://stable.repo.amd.com/rocm/whl-next/',
                    'rocm[libraries,device-all]==10.0.0', 'torch[device-all]==2.11.0+rocm10.0.0',
                    'torchvision[device-all]==0.26.0+rocm10.0.0']
        return ['--index-url', 'https://download.pytorch.org/whl/rocm7.2', 'torch==2.11.0', 'torchvision==0.26.0']
    return ['--index-url', 'https://download.pytorch.org/whl/cpu', 'torch==2.11.0+cpu', 'torchvision==0.26.0+cpu']


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    temporary.replace(path)


def weights_ready(folder):
    """Check local snapshot structure without loading weights or hashing gigabytes."""
    try:
        weights=list(folder.glob('*.safetensors'))
        if not weights or any(path.stat().st_size==0 for path in weights):return False
        for index in folder.glob('*.index.json'):
            mapping=read_json(index).get('weight_map')
            if not isinstance(mapping,dict) or not mapping:return False
            for filename in set(mapping.values()):
                if not isinstance(filename,str) or Path(filename).name!=filename or (folder/filename).stat().st_size==0:return False
        return True
    except (OSError,TypeError):return False


class LocalMirror:
    def __init__(self, root=None):
        self.root = Path(root or Path(PLUGIN_ROOT_DIR, 'card-finishing-generation'))
        self.lock = threading.RLock()
        self.render_lock = threading.RLock()
        self._generation_session = threading.local()
        self._warm_session = None
        self._warm_timer = None
        self.worker_idle_seconds = 120
        atexit.register(self._shutdown_worker)
        self.text_repair_lock = threading.Lock()
        self.cancel = threading.Event()
        self.setup = {'running': False, 'stage': 'Not downloaded', 'message': ''}
        self._last_setup_save = 0.
        history = read_json(self.root / 'setup-state.json')
        saved = history.get('setup')
        if history.get('version') == 1 and isinstance(saved, dict) and isinstance(saved.get('stage'), str):
            self.setup.update({key:saved[key] for key in ('stage','message','package','model','hardware','operation') if isinstance(saved.get(key),str) and len(saved[key])<=1000})
            self.setup.update({key:saved[key] for key in ('started_at','finished_at','updated_at') if key in saved})
            for key in ('started_at','finished_at','updated_at'):
                value=self.setup.get(key)
                if type(value) not in (int,float) or not math.isfinite(value):self.setup.pop(key,None)
            if saved.get('running'):
                self.setup.update(stage='Interrupted',message='Package setup was interrupted. Resume setup to reuse downloaded files and finish missing components.',
                                  finished_at=self.setup.get('updated_at',time.time()))
                if self.setup.get('operation')=='verify':
                    self.setup.update(stage='Verification interrupted',message='File verification was interrupted. Run Verify files again; no download will start automatically.')

    def persist_setup(self, force=True):
        """Persist setup milestones, never auto-resume downloads at app startup."""
        now=time.monotonic()
        if not force and now-self._last_setup_save<1:return
        self.setup['updated_at']=time.time()
        try:
            write_json(self.root/'setup-state.json',dict(version=1,setup=self.setup))
            self._last_setup_save=now
        except OSError:
            # A progress receipt must not discard successfully installed models.
            pass

    def runtime(self, hardware):
        return self.root / 'runtimes' / (hardware + '-v' + str(RUNTIME_VERSION))

    def python(self, hardware):
        return self.runtime(hardware) / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')

    def model_path(self, model):
        return self.root / 'models' / model / MODELS[model]['revision']

    def edit_model_path(self, model):
        checkpoint=MODELS[model].get('edit_checkpoint')
        return self.root/'models'/(model+'-edit')/checkpoint['revision'] if checkpoint else self.model_path(model)

    def runtime_ready(self, hardware):
        return (isinstance(hardware, str) and hardware in available_hardware() and self.python(hardware).is_file()
                and read_json(self.runtime(hardware) / 'ready.json').get('version') == RUNTIME_VERSION)

    def model_ready(self, model):
        if not isinstance(model,str) or model not in MODELS:return False
        return self.model_files_ready(self.model_path(model),MODELS[model])

    def edit_model_ready(self, model):
        checkpoint=MODELS[model].get('edit_checkpoint')
        return self.model_files_ready(self.edit_model_path(model),checkpoint) if checkpoint else self.model_ready(model)

    def model_files_ready(self, folder, specification):
        if read_json(folder/'ready.json').get('revision')!=specification['revision']:return False
        if not all((folder/name).is_file() for name in specification.get('required_files',[])):return False
        index=read_json(folder/'model_index.json')
        if not index.get('_class_name'):return False
        if specification.get('pipeline') and index['_class_name']!=specification['pipeline']:return False
        if specification.get('in_channels') and read_json(folder/'unet/config.json').get('in_channels')!=specification['in_channels']:return False
        try:
            for name,component in index.items():
                if name.startswith('_') or not isinstance(component,list) or not all(component):continue
                directory=folder/name
                if not directory.is_dir() or not any(directory.iterdir()):return False
                if name in ('transformer','unet','vae','safety_checker') or name.startswith('text_encoder'):
                    if not (directory/'config.json').is_file() or not weights_ready(directory):return False
                elif name.startswith('tokenizer'):
                    if not (directory/'tokenizer_config.json').is_file():return False
                    if not (directory/'tokenizer.json').is_file() and not all((directory/file).is_file() for file in ('vocab.json','merges.txt')):return False
            return True
        except OSError:return False

    def active(self):
        selected = read_json(self.root / 'active.json')
        package=self.package_for_model(selected.get('model'))
        if selected.get('enabled') and package and self.package_ready(package,selected.get('hardware')):
            return dict(selected,package=package,provider=PACKAGES[package]['provider'])
        return None

    def package_for_model(self, model):
        return next((key for key,value in PACKAGES.items() if model in value['models']),None)

    def detection_runtime(self):
        from .manager import get_plugin_runtime_context
        return get_plugin_runtime_context('card-finishing-studio')

    def detection_ready(self):
        runtime=self.detection_runtime()
        if not runtime or not {'frame','text'}<=set(runtime['manifest'].get('capabilities',[])):return False
        folder=Path(runtime['plugin_dir'])/'models';receipt=read_json(folder/'generation-ready.json')
        if receipt.get('version')!=1 or not isinstance(receipt.get('files'),list) or len(receipt['files'])!=3:return False
        try:return all((folder/item['name']).stat().st_size==item['bytes'] for item in receipt['files'])
        except (OSError,KeyError,TypeError):return False

    def package_components(self, package, hardware):
        item=PACKAGES[package]
        parts=[dict(id='runtime',name='Processor runtime',ready=self.runtime_ready(hardware),download_gb=None)]
        parts.extend(dict(id=model,name=MODELS[model]['name'],ready=self.model_ready(model),download_gb=MODELS[model]['download_gb']) for model in item['models'])
        parts.extend(dict(id=model+'_edit',name=MODELS[model]['edit_checkpoint']['name'],ready=self.edit_model_ready(model),download_gb=MODELS[model]['edit_checkpoint']['download_gb']) for model in item['models'] if MODELS[model].get('edit_checkpoint'))
        parts.extend([dict(id='analyzer',name=ANALYZER['name'],ready=self.analyzer_ready(),download_gb=ANALYZER['download_gb']),
                      dict(id='detection',name='Frame and text detection',ready=self.detection_ready(),download_gb=.3)])
        if 'flux_outpaint' in item['dependencies']:
            parts.append(dict(id='flux_outpaint',name='FLUX outpainting adapter and loader',ready=self.outpaint_ready(hardware),download_gb=.076))
        parts.append(dict(id='planner',name='Model-specific generation planner and prompt recipes',ready=True,download_gb=0))
        return parts

    def package_ready(self, package, hardware):
        return isinstance(package,str) and package in PACKAGES and isinstance(hardware,str) and hardware in available_hardware() and all(part['ready'] for part in self.package_components(package,hardware))

    def status(self):
        # Merely opening settings must never create directories, load torch,
        # start a process, or download anything.
        with self.lock:
            active = self.active()
            setup = dict(self.setup)
            if setup.get('started_at'):
                setup['elapsed_seconds']=round((time.time() if setup['running'] else setup.get('finished_at',time.time()))-setup['started_at'])
            if active and setup['stage'] == 'Not downloaded':
                setup.update(stage='Ready', message='Local AI is ready. Saved scenes can also be used with local AI disabled.')
            return dict(ok=True, ready=bool(active), active=active, setup=setup, default_model=DEFAULT_MODEL,
                        default_package=PACKAGE_CATALOG['default_package'],providers=PACKAGE_CATALOG['providers'],
                        packages=[dict(id=key,**value,hardware={hardware:dict(ready=self.package_ready(key,hardware),components=self.package_components(key,hardware)) for hardware in available_hardware()}) for key,value in PACKAGES.items()],
                        analyzer=dict(**ANALYZER, downloaded=self.analyzer_ready()),
                        models=[dict(id=key, **value, downloaded=self.model_ready(key),package=self.package_for_model(key),ready=bool(active and self.package_ready(self.package_for_model(key),active['hardware'])),operations=list(contracts.EDIT_OPERATIONS) if key!='instruct_pix2pix' else ['replace','remove_object'])
                                for key, value in sorted(MODELS.items(), key=lambda item: item[1]['download_gb'])],
                        hardware=[dict(id=key, **value, installed=self.runtime_ready(key),outpaint_ready=self.outpaint_ready(key)) for key, value in available_hardware().items()])

    def analyzer_path(self):
        return self.root / 'analyzer' / ANALYZER['revision']

    def analyzer_ready(self):
        folder=self.analyzer_path()
        return (read_json(folder/'ready.json').get('revision')==ANALYZER['revision']
                and all((folder/file).is_file() for file in ('config.json','tokenizer_config.json','tokenizer.json','preprocessor_config.json'))
                and all((folder/file).is_file() for file in ANALYZER.get('required_files',[]))
                and weights_ready(folder))

    def analyze_artwork(self, image, selected, dictionary, cancel, progress, context_image=None, context_mask=None, *, target_regions=False):
        from io import BytesIO
        from PIL import Image
        if not self.analyzer_ready():
            raise LocalMirrorError('Finish installing your generation package in Studio settings. Its artwork analyzer is missing.')
        fingerprints=[]
        for data in (image, context_image, context_mask):
            if data:
                with Image.open(BytesIO(data)) as source: fingerprints.append(contracts.image_digest(source))
        fingerprint = contracts.digest(dict(images=fingerprints, preparation_version=2, revision=ANALYZER['revision'], instruction=dictionary['planner']['analysis_prompt'], **({'target_regions':True} if target_regions else {})))
        cache = self.root / 'analysis-cache' / (fingerprint + '.json')
        cached = read_json(cache)
        if cached:
            try:
                result = contracts.validate_analysis(cached)
                if target_regions and 'regions' not in result:raise contracts.PlannerError('Missing target regions.')
                if progress: progress('analyzing', 'Reusing analysis of this exact artwork and analyzer recipe.')
                return result
            except contracts.PlannerError: pass
        if progress: progress('analyzing', 'Locating faces and bodies and analyzing the source style once for this batch.' if target_regions else 'Analyzing the artwork medium, palette, texture, lighting and boundaries locally.')
        jobs = self.root / 'jobs'; jobs.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='analysis-', dir=jobs) as folder:
            folder = Path(folder); (folder / 'source.png').write_bytes(image)
            payload = dict(hardware=selected['hardware'], model_path=str(self.analyzer_path()), image=str(folder / 'source.png'), output=str(folder / 'analysis.json'), instruction=dictionary['planner']['analysis_prompt'], max_new_tokens=ANALYZER['max_new_tokens'])
            if target_regions:payload.update(target_regions=True,max_new_tokens=1200)
            if progress: payload['progress_path'] = str(folder / 'progress.json')
            if context_image and context_mask:
                (folder/'context.png').write_bytes(context_image);(folder/'context-mask.png').write_bytes(context_mask)
                payload.update(context_image=str(folder/'context.png'),context_mask=str(folder/'context-mask.png'))
            write_json(folder / 'request.json', payload)
            def report():
                value = read_json(folder / 'progress.json')
                if progress and value.get('stage') == 'analyzing':
                    progress('analyzing', str(value.get('message', ''))[:300])
            self.run([self.python(selected['hardware']), '-I', SOURCE / 'generation_worker.py', 'analyze', '--request', folder / 'request.json'], cancel, self.root / 'analysis.log', 1200, **({'on_tick': report} if progress else {}))
            result = contracts.validate_analysis(read_json(folder / 'analysis.json'))
            if target_regions and 'regions' not in result:raise contracts.PlannerError('Artwork targeting returned no region list. Retry analysis or choose Random.')
            write_json(cache, result)
            return result

    def record_plan(self, plan):
        """Keep a bounded local audit of exact prompts and settings, without image copies."""
        folder = self.root / 'generation-plans'
        write_json(folder / (plan['id'] + '.json'), plan)
        for path in sorted(folder.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True)[100:]:
            path.unlink(missing_ok=True)

    def outpaint_path(self):
        return self.root / 'adapters' / 'outpaint' / OUTPAINT['revision']

    def outpaint_ready(self, hardware):
        path=self.outpaint_path()
        return (hardware in available_hardware() and (path/OUTPAINT['filename']).is_file()
                and (path/OUTPAINT['filename']).stat().st_size==OUTPAINT['size_bytes']
                and read_json(path/'ready.json').get('revision')==OUTPAINT['revision']
                and read_json(self.runtime(hardware)/'outpaint-ready.json').get('peft')==OUTPAINT['peft'])

    def select(self, model, hardware):
        if not isinstance(model, str) or not isinstance(hardware, str) or model not in MODELS or hardware not in HARDWARE:
            raise LocalMirrorError('Choose a listed model and processor.')
        validate_processor(hardware)

    def start(self, package, hardware, activate=True):
        if not isinstance(package,str) or package not in PACKAGES:raise LocalMirrorError('Choose an available generation package.')
        model=PACKAGES[package]['default_model'];self.select(model, hardware)
        with self.lock:
            if self.setup['running']:
                raise LocalMirrorError('A local AI download is already running.')
            self.cancel = threading.Event()
            self.setup = dict(running=True, stage='Preparing', message='Preparing '+PACKAGES[package]['name']+'.', package=package,model=model, hardware=hardware, started_at=time.time())
            self.persist_setup()
            threading.Thread(target=self.install, args=(package, hardware, self.cancel, activate), daemon=True).start()

    def stage(self, stage, message):
        with self.lock:
            self.setup.update(stage=stage, message=message)
            self.setup.pop('download',None)
            self.persist_setup()

    @contextmanager
    def library_update(self, cancel):
        """Never replace libraries while an existing generation uses them."""
        if not self.render_lock.acquire(blocking=False):
            self.stage('Waiting for generation','Waiting for the current generation to finish before updating local AI libraries.')
            while not self.render_lock.acquire(timeout=.25):
                if cancel.is_set():raise LocalMirrorError('Package setup cancelled. Installed files are unchanged.')
        try:
            if cancel.is_set():raise LocalMirrorError('Package setup cancelled. Installed files are unchanged.')
            self.release_worker()
            yield
        finally:
            self.render_lock.release()

    def preflight_processor(self, hardware, cancel):
        """Reject a known-incompatible NVIDIA card before downloading CUDA.

        This is a lightweight hint from the installed driver, not a replacement
        for the real kernel test after installing the selected runtime.
        """
        if cancel.is_set():raise LocalMirrorError('Package setup cancelled.')
        validate_processor(hardware)
        if hardware!='nvidia':return
        executable=shutil.which('nvidia-smi')
        if not executable and os.name=='nt':
            candidate=Path(os.environ.get('SystemRoot','C:/Windows'))/'System32/nvidia-smi.exe'
            if candidate.is_file():executable=str(candidate)
        if not executable:return  # Some supported driver installations omit it.
        self.stage('Checking processor','Checking the NVIDIA card before downloading processor libraries.')
        try:
            result=subprocess.run([executable,'--query-gpu=compute_cap','--format=csv,noheader,nounits'],
                                  capture_output=True,text=True,timeout=8,check=False,
                                  creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        except (OSError,subprocess.TimeoutExpired):return
        if cancel.is_set():raise LocalMirrorError('Package setup cancelled.')
        # An older driver may not support this query. Let the runtime health
        # check decide in that case, rather than treating unknown as unsupported.
        if result.returncode:return
        try:capabilities=[float(value.strip()) for value in result.stdout.splitlines() if value.strip()]
        except ValueError:return
        if capabilities and all(math.isfinite(value) and value<8 for value in capabilities):
            raise LocalMirrorError('These generation packages require an NVIDIA GPU with native BF16 support, such as RTX 30-series or newer. Choose CPU or another supported processor; no processor libraries or model weights were downloaded.')

    def environment(self):
        env = os.environ.copy()
        for key in ('PYTHONPATH', 'PYTHONHOME', 'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN'):
            env.pop(key, None)
        env.update(HF_HOME=str(self.root / 'cache'), HF_HUB_DISABLE_IMPLICIT_TOKEN='1',
                   HF_HUB_CACHE=str(self.root / 'cache' / 'hub'), HUGGINGFACE_HUB_CACHE=str(self.root / 'cache' / 'hub'),
                   HF_HUB_DISABLE_TELEMETRY='1', DO_NOT_TRACK='1', PYTHONUNBUFFERED='1', PYTHONDONTWRITEBYTECODE='1',
                   TORCH_HOME=str(self.root / 'cache' / 'torch'), TRITON_CACHE_DIR=str(self.root / 'cache' / 'triton'),
                   CUDA_CACHE_PATH=str(self.root / 'cache' / 'cuda'),
                   TEMP=str(self.root / 'tmp'), TMP=str(self.root / 'tmp'), TMPDIR=str(self.root / 'tmp'))
        if sys.platform == 'darwin':
            # Unsupported Metal operators can run on CPU within the chosen runtime.
            env['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
        return env

    @contextmanager
    def generation_session(self, cancel, progress=None):
        """One serialized worker; reuse its one image model briefly between jobs."""
        if getattr(self._generation_session, 'active', None) is not None:
            yield
            return
        if progress:progress('queued','Waiting for the local AI processor to become available.')
        while not self.render_lock.acquire(timeout=.25):
            if cancel.is_set():raise LocalMirrorError('Render cancelled.')
        if self._warm_timer:
            self._warm_timer.cancel()
            self._warm_timer = None
        session = self._warm_session or {'process':None,'output':None,'python':None}
        self._warm_session = session
        session['idle_epoch'] = None
        failed = True
        try:
            if cancel.is_set():raise LocalMirrorError('Render cancelled.')
            self._generation_session.active=session
            yield
            failed = False
        finally:
            self._generation_session.active=None
            try:
                if failed or cancel.is_set():
                    self.release_worker()
                else:
                    epoch = session['idle_epoch'] = object()
                    timer = threading.Timer(self.worker_idle_seconds, self._expire_worker, args=(session, epoch))
                    timer.daemon = True
                    self._warm_timer = timer
                    timer.start()
            finally:
                self.render_lock.release()

    def _expire_worker(self, session, epoch):
        if self.render_lock.acquire(blocking=False):
            try:
                if self._warm_session is session and session.get('idle_epoch') is epoch:
                    self.release_worker()
            finally:
                self.render_lock.release()

    def release_worker(self):
        with self.render_lock:
            if self._warm_timer:
                self._warm_timer.cancel()
                self._warm_timer = None
            session, self._warm_session = self._warm_session, None
            if session:
                process = session['process']
                try:
                    if process is not None:
                        self.stop_process(process)
                        if process.stdin:
                            process.stdin.close()
                finally:
                    if session['output']:
                        session['output'].close()

    def _shutdown_worker(self):
        # Daemon render threads may own render_lock during app shutdown.
        if self._warm_timer:self._warm_timer.cancel()
        session = self._warm_session
        if session and session['process'] is not None:
            self.stop_process(session['process'])

    @staticmethod
    def stop_process(process):
        if process.poll() is not None:return
        if os.name=='nt':
            subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW,timeout=15,check=False)
        else:
            os.killpg(process.pid,signal.SIGTERM)
        try:process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill();process.wait(timeout=10)

    def run_session_command(self, session, command, cancel, timeout, on_tick):
        if cancel.is_set():raise LocalMirrorError('Render cancelled.')
        python=str(command[0])
        process = session['process']
        if process is not None and (process.poll() is not None or session['python'] != python):
            self.stop_process(process)
            if process.stdin:process.stdin.close()
            if session['output']:session['output'].close()
            session.update(process=None, output=None, python=None)
        if session['process'] is None:
            self.root.mkdir(parents=True,exist_ok=True)
            (self.root/'tmp').mkdir(parents=True,exist_ok=True)
            session['output']=(self.root/'generation-session.log').open('ab')
            options={'creationflags':subprocess.CREATE_NO_WINDOW|subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
            session['process']=subprocess.Popen([python,'-I',str(SOURCE/'generation_worker.py'),'session'],
                stdin=subprocess.PIPE,stdout=session['output'],stderr=session['output'],text=True,encoding='utf-8',
                env=self.environment(),**options)
            session['python']=python
        if session['python']!=python:raise LocalMirrorError('The selected processor changed. Start a new render.')
        process=session['process']
        request=Path(command[command.index('--request')+1])
        response=request.with_name('session-response.json')
        response.unlink(missing_ok=True)
        try:
            process.stdin.write(json.dumps(dict(command=command[3],request=str(request),response=str(response)))+'\n')
            process.stdin.flush()
        except OSError as exc:
            raise LocalMirrorError('The local generation session ended unexpectedly. Start a new render.') from exc
        started=time.monotonic()
        while True:
            if cancel.is_set():raise LocalMirrorError('Render cancelled.')
            if on_tick:on_tick()
            result=read_json(response)
            if result:
                if not result.get('ok'):
                    error=str(result.get('error',''))
                    if 'out of memory' in error.lower():
                        raise LocalMirrorError('The selected model ran out of memory. Close other GPU apps or choose a smaller model.')
                    if result.get('error_type') in ('PlannerError','GenerationStorageError'):
                        raise LocalMirrorError(error)
                    raise LocalMirrorError('The local generation session failed. See generation-session.log in the plugin folder.')
                return
            if process.poll() is not None:
                raise LocalMirrorError('The local generation session ended unexpectedly. See generation-session.log in the plugin folder.')
            if time.monotonic()-started>timeout:
                raise LocalMirrorError('The local AI operation timed out. Start a new render.')
            cancel.wait(.25)

    def run(self, command, cancel, log, timeout=7200, on_tick=None):
        session=getattr(self._generation_session,'active',None)
        if (session is not None and len(command)>5 and str(command[2])==str(SOURCE/'generation_worker.py')
                and command[3] in ('analyze','prepare-plan','generate') and '--request' in command):
            return self.run_session_command(session,command,cancel,timeout,on_tick)
        log.parent.mkdir(parents=True, exist_ok=True)
        (self.root / 'tmp').mkdir(parents=True, exist_ok=True)
        options = {'creationflags': subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
        with log.open('ab') as output:
            operation_start = output.tell()
            process = subprocess.Popen([str(item) for item in command], stdout=output, stderr=output,
                                       env=self.environment(), **options)
            start = time.monotonic()
            try:
                while process.poll() is None:
                    if on_tick:on_tick()
                    if cancel.wait(.25):
                        raise LocalMirrorError('Cancelled. Existing models and saved scenes are unchanged.')
                    if time.monotonic() - start > timeout:
                        raise LocalMirrorError('The local AI operation timed out. Try again or choose another processor.')
                if process.returncode:
                    output.flush()
                    with log.open('rb') as detail:
                        # An earlier failed render/install may have logged an
                        # unrelated GPU or memory error. Diagnose this process.
                        detail.seek(max(operation_start, log.stat().st_size - 8192))
                        failure = detail.read().decode('utf-8', errors='replace').lower()
                    if 'out of memory' in failure or 'not enough memory' in failure:
                        raise LocalMirrorError('The selected model ran out of memory. Close other GPU apps, choose a smaller model, or use CPU with enough system RAM.')
                    if 'image model declined this render' in failure:
                        raise LocalMirrorError('The image model declined this render. Try another theme or model. Your previous scene is unchanged.')
                    if 'cannot access a compatible gpu' in failure or 'no kernel image' in failure:
                        raise LocalMirrorError('The selected GPU runtime could not run on this GPU. Check the supported hardware and driver, or choose CPU.')
                    if 'requires native bf16 support' in failure:
                        raise LocalMirrorError('The shared artwork analyzer requires an NVIDIA GPU with native BF16 support, such as RTX 30-series or newer. Choose CPU or another supported processor.')
                    if 'plannererror:' in failure:
                        raise LocalMirrorError(failure.rsplit('plannererror:',1)[1].strip().splitlines()[0])
                    if 'generationstorageerror:' in failure:
                        raise LocalMirrorError(failure.rsplit('generationstorageerror:',1)[1].strip().splitlines()[0])
                    raise LocalMirrorError('The local AI process failed. Check the local AI log in the plugin folder; confirm your Python, driver and available memory.')
            finally:
                if process.poll() is None:
                    if os.name == 'nt':
                        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=15, check=False)
                    else:
                        os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait(timeout=10)

    def resolve_python(self, hardware, cancel, log):
        from .manager import _resolve_studio_python
        try:
            return _resolve_studio_python(cancel=cancel, progress=self.stage)
        except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
            raise LocalMirrorError(str(exc)) from exc

    def download(self, command, cancel, log):
        progress_path=self.root/'download-progress.json'
        progress_path.unlink(missing_ok=True)
        def report():
            value=read_json(progress_path)
            if value:
                with self.lock:
                    self.setup['download']=value
                    self.persist_setup(force=False)
        self.run(command+['--progress-path',progress_path],cancel,log,on_tick=report)
        report()

    def prepare_detection(self, cancel, log):
        if self.detection_ready():return
        from .manager import start_plugin_install, get_plugin_install_status
        self.stage('Preparing detection','Installing shared frame and text detection for the generation planner.')
        if not self.detection_runtime():
            start_plugin_install('card-finishing-studio')
            while True:
                if cancel.wait(.3):raise LocalMirrorError('Cancelled. Shared detection installation may finish in the background; the generation package remains disabled.')
                status=get_plugin_install_status('card-finishing-studio')
                if not status.get('is_running'):break
                self.stage('Preparing detection',status.get('message') or 'Installing shared detection libraries.')
            if status.get('error'):raise LocalMirrorError(status['error'])
        runtime=self.detection_runtime()
        if not runtime:raise LocalMirrorError('Shared detection setup did not complete. Retry the package installation.')
        folder=Path(runtime['plugin_dir'])/'models'
        if 'ocr' in read_json(folder/'generation-repair.json').get('files',[]):
            self.stage('Repairing text detection','Reinstalling the local text detector and its bundled model files.')
            self.run([runtime['plugin_python'],'-I','-m','pip','--isolated','install','--disable-pip-version-check','--no-cache-dir','--only-binary=:all:','--force-reinstall','--no-deps','rapidocr-onnxruntime==1.4.4'],cancel,log,900)
        self.stage('Verifying detection','Downloading and verifying frame models and the local text detector.')
        self.run([runtime['plugin_python'],'-I',SOURCE/'generation_dependencies.py','--models',folder],cancel,log,900)
        if not self.detection_ready():raise LocalMirrorError('Frame and text detection verification did not complete.')
        (folder/'generation-repair.json').unlink(missing_ok=True)

    def install(self, package, hardware, cancel, activate=True):
        try:
            if cancel.is_set():raise LocalMirrorError('Package installation cancelled.')
            item=PACKAGES[package];model=item['default_model']
            self.root.mkdir(parents=True, exist_ok=True)
            log = self.root / 'installation.log'
            missing=[part for part in self.package_components(package,hardware) if not part['ready']]
            needed=(sum(9 if part['download_gb'] is None else part['download_gb'] for part in missing)+3)*1024**3
            free=shutil.disk_usage(self.root).free
            if missing and free<needed:
                raise LocalMirrorError(f'This package needs approximately {needed/1024**3:.1f} GiB of free space for missing components and setup. Only {free/1024**3:.1f} GiB is available on its installation drive. Free some space and resume setup.')
            if not self.runtime_ready(hardware):
                self.preflight_processor(hardware,cancel)
                with self.library_update(cancel):
                    python = self.resolve_python(hardware, cancel, log)
                    self.stage('Installing runtime', 'Downloading the selected processor libraries. This may take several minutes.')
                    self.run(python + ['-m', 'venv', str(self.runtime(hardware))], cancel, log, 120)
                    pip = [self.python(hardware), '-I', '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:']
                    # A cancelled pip extraction can leave a partial distribution.
                    # A failed import also needs fresh files, even when installed
                    # package metadata already reports the expected version.
                    self.run(pip + ['--force-reinstall'] + runtime_packages(hardware), cancel, log)
                    repair=self.runtime(hardware)/'repair.json'
                    self.run(pip + (['--force-reinstall'] if repair.is_file() else []) + COMMON_PACKAGES, cancel, log)
                    self.stage('Checking processor', 'Testing the selected processor before downloading model weights.')
                    self.run([self.python(hardware), '-I', SOURCE / 'generation_worker.py', 'health', '--hardware', hardware], cancel, log, 180)
                    write_json(self.runtime(hardware) / 'ready.json', dict(version=RUNTIME_VERSION))
                    repair.unlink(missing_ok=True)
            for included_model in item['models']:
                if cancel.is_set():raise LocalMirrorError('Package installation cancelled.')
                if not self.model_ready(included_model):
                    self.stage('Downloading model', 'Downloading ' + MODELS[included_model]['name'] + '. Interrupted downloads can be resumed.')
                    self.download([self.python(hardware), '-I', SOURCE / 'generation_worker.py', 'download', '--model', included_model,
                              '--destination', self.model_path(included_model)], cancel, log)
                checkpoint=MODELS[included_model].get('edit_checkpoint')
                if checkpoint and not self.edit_model_ready(included_model):
                    self.stage('Downloading editing model','Downloading '+checkpoint['name']+'. Existing package components are reused.')
                    self.download([self.python(hardware),'-I',SOURCE/'generation_worker.py','download','--model',included_model,'--edit-checkpoint',
                                   '--destination',self.edit_model_path(included_model)],cancel,log)
            if 'flux_outpaint' in item['dependencies'] and not self.outpaint_ready(hardware):
                with self.library_update(cancel):
                    self.stage('Installing outpainting support','Installing the FLUX outpainting adapter (76 MB) and its loader.')
                    self.run([self.python(hardware),'-I','-m','pip','--isolated','install','--disable-pip-version-check','--no-cache-dir','--no-deps','--force-reinstall','peft=='+OUTPAINT['peft']],cancel,log)
                    self.run([self.python(hardware),'-I',SOURCE/'generation_worker.py','health','--hardware',hardware,'--with-outpaint'],cancel,log,180)
                self.download([self.python(hardware),'-I',SOURCE/'generation_worker.py','download-outpaint','--destination',self.outpaint_path()],cancel,log)
                write_json(self.runtime(hardware)/'outpaint-ready.json',dict(peft=OUTPAINT['peft']))
            if not self.analyzer_ready():
                self.stage('Downloading artwork analyzer','Installing '+ANALYZER['name']+' for model-specific style and boundary analysis.')
                self.download([self.python(hardware),'-I',SOURCE/'generation_worker.py','download-analyzer','--destination',self.analyzer_path()],cancel,log)
            self.prepare_detection(cancel,log)
            self.stage('Verifying package','Checking all package dependencies and planner recipes.')
            ai_prompts.load(self.root)
            if not self.package_ready(package,hardware):raise LocalMirrorError('Package setup is incomplete. Retry to finish the missing components.')
            with self.lock:
                if cancel.is_set(): raise LocalMirrorError('Cancelled. Existing models and saved scenes are unchanged.')
                if activate:
                    write_json(self.root / 'active.json', dict(enabled=True, package=package,provider=item['provider'],model=model, hardware=hardware))
                self.setup.update(stage='Ready', message=item['name']+(' is complete and enabled.' if activate else ' is complete. Your default package is unchanged.'))
        except Exception as exc:
            message = str(exc) if isinstance(exc, (LocalMirrorError,ai_prompts.PromptDictionaryError)) else 'Package setup failed. Check installation.log in the local generation plugin folder.'
            self.stage('Cancelled' if cancel.is_set() else 'Setup failed', message)
        finally:
            with self.lock:
                self.setup['running'] = False
                self.setup['finished_at'] = time.time()
                self.setup.pop('download',None)
                self.persist_setup()

    def disable(self):
        with self.lock:
            self.cancel.set()
            selected = read_json(self.root / 'active.json')
            if selected:
                write_json(self.root / 'active.json', dict(selected, enabled=False))
            if not self.setup['running']:
                self.setup.update(stage='Disabled',message='Generation is disabled. Installed packages and saved artwork are kept.')
                self.persist_setup()
        # Do not block the settings request behind an active render. Its session
        # still expires normally; an idle worker can release memory immediately.
        if self.render_lock.acquire(blocking=False):
            try:self.release_worker()
            finally:self.render_lock.release()

    def start_verification(self, package, hardware):
        if not isinstance(package,str) or package not in PACKAGES:raise LocalMirrorError('Choose an available generation package.')
        self.select(PACKAGES[package]['default_model'],hardware)
        if not self.runtime_ready(hardware):raise LocalMirrorError('Install this processor runtime before verifying model files.')
        with self.lock:
            if self.setup['running']:raise LocalMirrorError('A package operation is already running.')
            self.cancel=threading.Event()
            self.setup=dict(running=True,operation='verify',stage='Verifying files',message='Checking downloaded files and stored checksums. No models will be downloaded.',
                            package=package,hardware=hardware,started_at=time.time())
            self.persist_setup()
            threading.Thread(target=self.verify_package,args=(package,hardware,self.cancel),daemon=True).start()

    def verify_package(self, package, hardware, cancel):
        try:
            self.stage('Checking processor','Checking installed generation libraries and the selected processor before verifying model files.')
            health=self.root/'verification-health.json';health.unlink(missing_ok=True)
            try:
                self.run([self.python(hardware),'-I',SOURCE/'generation_worker.py','health','--hardware',hardware,'--health-output',health]+
                         (['--with-outpaint'] if 'flux_outpaint' in PACKAGES[package]['dependencies'] else []),cancel,self.root/'verification.log',180)
            except LocalMirrorError:
                # A driver/device failure is not evidence of broken model or
                # library files. Only a confirmed failed import invalidates the
                # runtime receipt; cancellation never changes readiness.
                if not cancel.is_set() and read_json(health).get('component')=='runtime':
                    runtime=self.runtime(hardware)
                    write_json(runtime/'repair.json',dict(reason='library_health_check'))
                    (runtime/'ready.json').unlink(missing_ok=True)
                    (runtime/'outpaint-ready.json').unlink(missing_ok=True)
                    self.stage('Repair needed','Local AI libraries failed their health check. Resume setup to repair the processor runtime; downloaded models are kept.')
                    return
                raise
            self.stage('Verifying files','Checking downloaded files and stored checksums. No models will be downloaded.')
            components=[dict(id=model,name=MODELS[model]['name'],path=str(self.model_path(model)),required=['model_index.json']+MODELS[model].get('required_files',[]),revision=MODELS[model]['revision']) for model in PACKAGES[package]['models']]
            components.extend(dict(id=model+'_edit',name=MODELS[model]['edit_checkpoint']['name'],path=str(self.edit_model_path(model)),required=['model_index.json']+MODELS[model]['edit_checkpoint'].get('required_files',[]),revision=MODELS[model]['edit_checkpoint']['revision']) for model in PACKAGES[package]['models'] if MODELS[model].get('edit_checkpoint'))
            components.append(dict(id='analyzer',name=ANALYZER['name'],path=str(self.analyzer_path()),required=['config.json','tokenizer.json','preprocessor_config.json']+ANALYZER.get('required_files',[]),revision=ANALYZER['revision']))
            if 'flux_outpaint' in PACKAGES[package]['dependencies']:
                components.append(dict(id='flux_outpaint',name='FLUX outpainting adapter',path=str(self.outpaint_path()),required=[OUTPAINT['filename']],checksums={OUTPAINT['filename']:OUTPAINT['sha256']},revision=OUTPAINT['revision']))
            jobs=self.root/'jobs';jobs.mkdir(parents=True,exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='verify-',dir=jobs) as temporary:
                folder=Path(temporary);output=folder/'result.json'
                write_json(folder/'request.json',dict(components=components,output=str(output)))
                self.download([self.python(hardware),'-I',SOURCE/'generation_worker.py','verify-assets','--request',folder/'request.json'],cancel,self.root/'verification.log')
                if cancel.is_set():raise LocalMirrorError('Verification cancelled. Installed files are unchanged.')
                results=read_json(output)
                if set(results)!={item['id'] for item in components}:raise LocalMirrorError('File verification did not complete. Retry verification.')
                detection=self.detection_runtime()
                if detection:
                    detection_path=Path(detection['plugin_dir'])/'models'
                    detection_output=folder/'detection.json'
                    self.download([detection['plugin_python'],'-I',SOURCE/'generation_dependencies.py','--models',detection_path,'--verify-output',detection_output],cancel,self.root/'verification.log')
                    detection_result=read_json(detection_output)
                    if not {'issues','files_checked','checksums_checked','receipt'}<=set(detection_result):raise LocalMirrorError('Detection verification did not complete. Retry verification.')
                    results['detection']=detection_result
            if cancel.is_set():raise LocalMirrorError('Verification cancelled. Installed files are unchanged.')
            damaged=0;checked=0;hashed=0
            for item in components:
                result=results[item['id']];checked+=result['files_checked'];hashed+=result['checksums_checked']
                path=Path(item['path'])
                if result['issues']:
                    damaged+=len(result['issues'])
                    # Keep the assets. Removing only the readiness receipt stops
                    # new jobs from using damaged files; setup repairs this list.
                    write_json(path/'repair.json',dict(files=list(result['issues'])))
                    (path/'ready.json').unlink(missing_ok=True)
                elif (path/'repair.json').is_file():
                    # A subsequent complete verification can confirm a manual
                    # repair without redownloading healthy model weights.
                    write_json(path/'ready.json',dict(revision=item['revision']))
                    (path/'repair.json').unlink()
            if 'detection' in results:
                result=results['detection'];checked+=result['files_checked'];hashed+=result['checksums_checked']
                if result['issues']:
                    damaged+=len(result['issues'])
                    write_json(detection_path/'generation-repair.json',dict(files=list(result['issues'])))
                    (detection_path/'generation-ready.json').unlink(missing_ok=True)
                elif (detection_path/'generation-repair.json').is_file():
                    write_json(detection_path/'generation-ready.json',result['receipt'])
                    (detection_path/'generation-repair.json').unlink()
            write_json(self.root/'verification.json',dict(package=package,hardware=hardware,checked_at=time.time(),results=results))
            if damaged:
                self.stage('Repair needed',f'Found {damaged} missing or damaged files. Resume setup to repair them; healthy files will be reused.')
            elif not self.package_ready(package,hardware):
                self.stage('Setup incomplete','Downloaded files passed verification, but this package still has missing dependencies. Resume setup to finish it.')
            else:
                self.stage('Verified',f'{PACKAGES[package]["name"]}: {checked} files checked, including {hashed} stored download checksums. Your default package is unchanged.')
        except Exception as exc:
            self.stage('Cancelled' if cancel.is_set() else 'Verification failed',str(exc) if isinstance(exc,LocalMirrorError) else 'Verification failed. Check verification.log in the generation plugin folder.')
        finally:
            with self.lock:
                self.setup.update(running=False,finished_at=time.time());self.setup.pop('download',None);self.persist_setup()

    def text_repair_runtime(self):
        from .manager import get_plugin_runtime_context
        runtime = get_plugin_runtime_context('card-finishing-studio')
        if runtime and 'text' in runtime['manifest'].get('capabilities', []):
            return runtime
        return None

    def repair_text(self, image, mask, cancel, progress=None):
        runtime = self.text_repair_runtime()
        if not runtime:
            raise LocalMirrorError('Install AI detection in Card Finishing Studio to remove text. No generative image model is needed.')
        if progress:progress('queued', 'Waiting for local text detection.')
        while not self.text_repair_lock.acquire(timeout=.25):
            if cancel.is_set():raise LocalMirrorError('Text removal cancelled.')
        try:
            if cancel.is_set():raise LocalMirrorError('Text removal cancelled.')
            jobs = self.root / 'jobs';jobs.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='text-', dir=jobs) as folder:
                folder = Path(folder)
                (folder / 'source.png').write_bytes(image);(folder / 'mask.png').write_bytes(mask)
                output = folder / 'repair.png'
                payload = dict(image=str(folder / 'source.png'), mask=str(folder / 'mask.png'),
                               output=str(output), progress_path=str(folder / 'progress.json'))
                write_json(folder / 'request.json', payload)
                if progress:progress('detecting', 'Finding text strokes, outlines and shadows inside your selection.')
                reported = None
                def report():
                    nonlocal reported
                    value = read_json(folder / 'progress.json')
                    if value and value != reported and value.get('stage') in ('detecting', 'repairing', 'rendering'):
                        reported = value
                        progress(value['stage'], str(value.get('message', ''))[:300])
                try:
                    # Use the installed detector libraries with the bundled
                    # implementation, so this fix needs no plugin reinstall.
                    self.run([runtime['plugin_python'], '-B', '-I', SOURCE / 'text_repair.py', '--request', folder / 'request.json'],
                             cancel, self.root / 'text-repair.log', 180, **({'on_tick': report} if progress else {}))
                except LocalMirrorError:
                    failure = read_json(output.with_suffix('.error.json'))
                    if failure.get('message') and not cancel.is_set():
                        raise LocalMirrorError(str(failure['message'])[:400]) from None
                    raise
                if output.stat().st_size > 20_000_000:
                    raise LocalMirrorError('The repaired artwork is too large. Your artwork is unchanged.')
                return output.read_bytes()
        finally:
            self.text_repair_lock.release()

    def generation_selection(self, model=None):
        selected = self.active()
        if not selected:
            raise LocalMirrorError('Install and enable a complete generation package in Card Finishing Studio settings.')
        if model is not None:
            package=self.package_for_model(model) if isinstance(model,str) else None
            if not package or not self.package_ready(package,selected['hardware']):
                raise LocalMirrorError('This model needs a complete package for the selected processor. Finish its package in Studio settings.')
            selected = dict(selected, model=model,package=package,provider=PACKAGES[package]['provider'])
        return selected

    def generate(self, *, image, mask, theme, prompt, seed, cancel, compact_prompt=None, negative_prompt=None, canvas_size=None, image_box=None, outpaint_prompt=None, outpaint_description=None, outpaint_margin=0, background_prompt=None, background_description=None, background_negative=None, edit_mode=None, progress=None, model=None, user_prompt=None, maintain_style=True, planning=None, on_plan=None, prepare_only=False, on_diagnostics=None):
        if edit_mode == 'remove_text':
            return self.repair_text(image, mask, cancel, progress)
        selected = self.generation_selection(model)
        if (canvas_size is not None or edit_mode=='outpaint') and selected['model']=='instruct_pix2pix':
            raise LocalMirrorError('InstructPix2Pix does not support full-canvas outpainting. Enable SD-Turbo, Stable Diffusion 1.5, SDXL or FLUX in Generative Art AI settings. Your previous scene is unchanged.')
        if edit_mode=='outpaint' and selected['model']=='flux_klein' and not self.outpaint_ready(selected['hardware']):
            raise LocalMirrorError('Install outpainting support for FLUX in Generative Art AI settings, then retry Extend artwork.')
        use_planner = edit_mode in contracts.OPERATIONS
        checkpoint=MODELS[selected['model']].get('edit_checkpoint') if edit_mode in contracts.EDIT_OPERATIONS else None
        model_spec=checkpoint or MODELS[selected['model']]
        model_path=self.edit_model_path(selected['model']) if edit_mode in contracts.EDIT_OPERATIONS else self.model_path(selected['model'])
        capture = on_diagnostics if use_planner and not prepare_only and diagnostics.enabled() else None
        try:
            dictionary = ai_prompts.load(self.root)
            if capture:
                capture('prompt-dictionary.json',dictionary)
                capture('package-catalog.json',PACKAGE_CATALOG)
                capture('model-catalog.json',MODELS)
            if use_planner and dictionary['planner']['recipes'][selected['model']][edit_mode]['status']=='unsupported':
                raise LocalMirrorError('This model does not support the selected generation operation. Choose another downloaded model.')
            prompts = dict(prompt='',negative_prompt='',prompt_parts={}) if use_planner else ai_prompts.resolve(selected['model'],'mirror',
                user_prompt if user_prompt is not None else prompt,theme,maintain_style,self.root)
        except ai_prompts.PromptDictionaryError as exc:
            raise LocalMirrorError(str(exc)) from None
        # Edit and Mirror operations share the same bounded warm worker.
        with self.generation_session(cancel, progress):
            if cancel.is_set(): raise LocalMirrorError('Render cancelled.')
            current=self.generation_selection(selected['model'])
            if current['hardware']!=selected['hardware']:
                raise LocalMirrorError('The selected processor changed while this job was waiting. Generate a new preview with the current package settings.')
            plan = None
            if use_planner:
                from io import BytesIO
                from PIL import Image
                planning = planning or {}
                style_mode = planning.get('style_mode', 'match' if maintain_style else 'none')
                needs_analysis = compiler.needs_analysis(dictionary,selected['model'],edit_mode,style_mode,
                    edit_mode=='micro_scene' and bool(planning.get('geometry',{}).get('has_requested_change')))
                whole_artwork = edit_mode in ('outpaint','mirror','micro_scene')
                if capture and needs_analysis:
                    capture('analysis-source.png',planning.get('analysis_image',image) if whole_artwork else image)
                    if not whole_artwork:capture('analysis-mask.png',mask)
                analysis_dictionary=dictionary
                focus=dictionary['planner']['recipes'][selected['model']][edit_mode].get('analysis_focus','')
                if focus:
                    analysis_dictionary={**dictionary,'planner':{**dictionary['planner'],'analysis_prompt':dictionary['planner']['analysis_prompt']+'\n'+focus}}
                # Mirror batches analyze their clean source once before loading
                # the image model, then reuse those observations for every crop.
                observations = contracts.validate_analysis(planning['analysis']) if needs_analysis and planning.get('analysis') is not None else (
                    self.analyze_artwork(planning.get('analysis_image', image), selected, analysis_dictionary, cancel, progress,
                        image if not whole_artwork else None, mask if not whole_artwork else None) if needs_analysis else None)
                if progress: progress('planning', 'Compiling the model recipe and exact generation inputs.')
                reference_image = Image.open(BytesIO(image)).convert('RGBA')
                mask_image = Image.open(BytesIO(mask)).getchannel('A')
                instruction=user_prompt if user_prompt is not None else prompt
                if edit_mode in ('mirror','micro_scene') and theme!='custom':
                    theme_key=('micro_theme_' if edit_mode=='micro_scene' else 'theme_')+theme
                    parts=dictionary['models'][selected['model']]
                    theme_direction=ai_prompts.render(parts,theme_key)
                    if edit_mode=='micro_scene':
                        instruction=ai_prompts.render(parts,'mirror_micro_context',user_prompt=instruction.strip(),theme_direction=theme_direction)
                    else:
                        instruction=' '.join(part for part in (theme_direction,instruction.strip()) if part)
                if edit_mode in ('mirror','micro_scene'):
                    planning={**planning,'geometry':{**planning.get('geometry',{}),'theme':theme}}
                plan = compiler.compile_plan(dictionary=dictionary, model=selected['model'], model_revision=model_spec['revision'], hardware=selected['hardware'], operation=edit_mode, instruction=instruction, style_mode=style_mode, custom_style=planning.get('custom_style',''), analysis=observations, reference=reference_image, mask=mask_image, seed=seed, geometry=planning.get('geometry',{}), adapter=dict(OUTPAINT) if selected['model']=='flux_klein' and edit_mode=='outpaint' else None, analyzer=dict(id=ANALYZER['id'],revision=ANALYZER['revision'],max_new_tokens=ANALYZER['max_new_tokens'],preparation_version=2,reference='clean_artwork_edges' if whole_artwork else 'local_neighborhood') if needs_analysis else None)
                jobs = self.root / 'jobs'; jobs.mkdir(parents=True, exist_ok=True)
                with tempfile.TemporaryDirectory(prefix='plan-', dir=jobs) as folder:
                    folder=Path(folder)
                    write_json(folder/'request.json',dict(model_path=str(model_path),plan=plan,output=str(folder/'plan.json')))
                    self.run([self.python(selected['hardware']),'-I',SOURCE/'generation_worker.py','prepare-plan','--request',folder/'request.json'],cancel,self.root/'planning.log',180)
                    plan=contracts.validate_plan(read_json(folder/'plan.json'))
                self.record_plan(plan)
                if on_plan: on_plan(plan, reference_image, mask_image)
                if prepare_only: return plan
            jobs = diagnostics.development_root() / 'working' if capture else self.root / 'jobs'
            jobs.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='scene-', dir=jobs) as folder:
                folder = Path(folder)
                (folder / 'source.png').write_bytes(image); (folder / 'mask.png').write_bytes(mask)
                model_prompt = prompts['prompt']
                payload = dict(selected, model_path=str(model_path), prompt=model_prompt, seed=seed,
                               image=str(folder / 'source.png'), mask=str(folder / 'mask.png'), output=str(folder / 'scene.png'))
                if capture:payload['diagnostics_dir']=str(folder/'diagnostics')
                payload.update(negative_prompt=prompts['negative_prompt'],prompt_parts=prompts['prompt_parts'])
                if edit_mode:payload['edit_mode']=edit_mode
                if plan:
                    payload['generation_plan']=plan
                    payload['prompt']=plan['prompt']
                    payload['negative_prompt']=plan['negative_prompt']
                if edit_mode=='outpaint' and selected['model']=='flux_klein':payload['outpaint_adapter']=str(self.outpaint_path()/OUTPAINT['filename'])
                if progress:payload['progress_path']=str(folder/'progress.json')
                if canvas_size is not None:
                    from .mirror_shards import expanded_scene_geometry
                    expanded_size,padding=expanded_scene_geometry(canvas_size,outpaint_margin)
                    payload.update(canvas_size=canvas_size,image_box=image_box,outpaint_prompt=prompts['outpaint_prompt'],
                                   outpaint_description=prompts['outpaint_prompt'],
                                   expanded_size=expanded_size,scene_padding=padding,background_prompt=prompts['background_prompt'],
                                   background_description=prompts['background_prompt'],background_negative=prompts['background_negative'])
                write_json(folder / 'request.json', payload)
                if progress:progress('loading','Preparing '+model_spec['name']+' on '+{'nvidia':'NVIDIA GPU','amd':'AMD GPU','mps':'Apple GPU','cpu':'CPU'}[selected['hardware']]+'. The first render can take longer.')
                reported=None
                def report():
                    nonlocal reported
                    value=read_json(folder/'progress.json')
                    if value and value!=reported and value.get('stage') in ('loading','generating','rendering'):
                        reported=value
                        progress(value['stage'],str(value.get('message',''))[:300])
                options={'on_tick':report} if progress else {}
                self.run([self.python(selected['hardware']), '-I', SOURCE / 'generation_worker.py', 'generate',
                          '--request', folder / 'request.json'], cancel, self.root / 'generation.log', 7200,**options)
                output = folder / 'scene.png'
                if output.stat().st_size > 15_000_000:
                    raise LocalMirrorError('The generated scene is too large. Your saved layer is unchanged.')
                if capture:
                    # These files are snapshots of actual pipeline arguments/output,
                    # never approximations reconstructed after the job completed.
                    for path in sorted((folder/'diagnostics').glob('*')):
                        if path.suffix in ('.png','.json') and path.stat().st_size<=32_000_000:
                            capture(path.name,path.read_bytes())
                return output.read_bytes()
def local_mirror(app):
    if 'local_mirror' not in app.extensions:
        app.extensions['local_mirror'] = LocalMirror(app.config.get('LOCAL_MIRROR_ROOT'))
    return app.extensions['local_mirror']


def register_local_mirror_routes(app):
    @app.route('/plugins/card-finishing-generation', methods=['GET', 'POST', 'DELETE'])
    def local_mirror_settings():
        manager = local_mirror(app)
        try:
            if request.method == 'POST':
                payload = request.get_json(silent=True)
                if not isinstance(payload, dict) or not {'package', 'hardware'} <= set(payload) or set(payload)-{'package','hardware','activate'}:
                    raise LocalMirrorError('Choose a package and processor.')
                if type(payload.get('activate',True)) is not bool:
                    raise LocalMirrorError('Choose whether to make this the default model.')
                manager.start(payload['package'], payload['hardware'], activate=payload.get('activate',True))
            elif request.method == 'DELETE':
                manager.disable()
            response = jsonify(manager.status())
            response.cache_control.no_store = True
            return response
        except LocalMirrorError as exc:
            return jsonify(ok=False, message=str(exc)), 400

    @app.route('/plugins/card-finishing-generation/prompt-dictionary',methods=['GET','PUT','POST','DELETE'])
    def ai_prompt_dictionary_settings():
        manager=local_mirror(app)
        try:
            if request.method=='DELETE': ai_prompts.save(ai_prompts.defaults(),manager.root)
            candidate=None
            if request.method in ('PUT','POST'):
                payload=request.get_json(silent=True)
                if not isinstance(payload,dict) or set(payload)!={'dictionary'}:
                    raise ai_prompts.PromptDictionaryError('Provide an AI Prompt Dictionary.')
                candidate=ai_prompts.validate(payload['dictionary'])
                if request.method=='PUT':ai_prompts.save(candidate,manager.root)
            response=jsonify(ok=True,dictionary=candidate or ai_prompts.load(manager.root),defaults=ai_prompts.defaults(),path=str(ai_prompts.settings_path(manager.root)),distribution_path=str(ai_prompts.DEFAULT_PATH))
            response.cache_control.no_store=True
            return response
        except (ai_prompts.PromptDictionaryError,OSError) as exc:
            return jsonify(ok=False,message=str(exc)),400

    @app.post('/plugins/card-finishing-generation/cancel')
    def local_mirror_cancel():
        manager = local_mirror(app)
        with manager.lock:
            manager.cancel.set()
        return jsonify(manager.status())

    @app.post('/plugins/card-finishing-generation/verify')
    def local_mirror_verify():
        manager=local_mirror(app)
        try:
            payload=request.get_json(silent=True)
            if not isinstance(payload,dict) or set(payload)!={'package','hardware'}:raise LocalMirrorError('Choose a package and processor.')
            manager.start_verification(payload['package'],payload['hardware'])
            return jsonify(manager.status())
        except LocalMirrorError as exc:
            return jsonify(ok=False,message=str(exc)),400
