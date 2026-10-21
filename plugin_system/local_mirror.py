"""Generative Art AI: opt-in image generation, separate from detection.

The existing component directory and API names remain stable so installed
models, active downloads and saved settings survive the display-name change.
"""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time

from flask import jsonify, request
from paths import BUNDLE_BASE_DIR, PLUGIN_ROOT_DIR

SOURCE = Path(BUNDLE_BASE_DIR, 'plugin_src', 'subject-detection-ai')
MODELS = json.loads((SOURCE / 'generation_models.json').read_text(encoding='utf-8'))
DEFAULT_MODEL = 'sd_turbo'
RUNTIME_VERSION = 1
COMMON_PACKAGES = ['diffusers==0.41.0', 'transformers==5.20.2', 'accelerate==1.15.0',
                   'safetensors>=0.6,<1', 'sentencepiece>=0.2,<1', 'Pillow>=11.3,<13']
HARDWARE = {
    'nvidia': {'name': 'NVIDIA RTX 50 series', 'description': 'CUDA runtime for RTX 50-series cards. Requires 64-bit Python 3.10–3.13 and a current NVIDIA driver.'},
    'amd': {'name': 'AMD Radeon · ROCm', 'description': 'Supported Radeon GPUs only. Windows requires Python 3.12 and a compatible AMD ROCm driver.'},
    'cpu': {'name': 'CPU', 'description': 'Requires 64-bit Python 3.10–3.13. No GPU required; uses substantial system RAM and can take a long time per scene.'},
}


class LocalMirrorError(RuntimeError):
    """A safe, user-facing setup or inference failure."""


def runtime_packages(hardware):
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


class LocalMirror:
    def __init__(self, root=None):
        self.root = Path(root or Path(PLUGIN_ROOT_DIR, 'card-finishing-generation'))
        self.lock = threading.RLock()
        self.render_lock = threading.Lock()
        self.cancel = threading.Event()
        self.setup = {'running': False, 'stage': 'Not downloaded', 'message': ''}

    def runtime(self, hardware):
        return self.root / 'runtimes' / (hardware + '-v' + str(RUNTIME_VERSION))

    def python(self, hardware):
        return self.runtime(hardware) / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')

    def model_path(self, model):
        return self.root / 'models' / model / MODELS[model]['revision']

    def runtime_ready(self, hardware):
        return (isinstance(hardware, str) and hardware in HARDWARE and self.python(hardware).is_file()
                and read_json(self.runtime(hardware) / 'ready.json').get('version') == RUNTIME_VERSION)

    def model_ready(self, model):
        return isinstance(model, str) and model in MODELS and read_json(self.model_path(model) / 'ready.json').get('revision') == MODELS[model]['revision']

    def active(self):
        selected = read_json(self.root / 'active.json')
        if selected.get('enabled') and self.runtime_ready(selected.get('hardware')) and self.model_ready(selected.get('model')):
            return selected
        return None

    def status(self):
        # Merely opening settings must never create directories, load torch,
        # start a process, or download anything.
        with self.lock:
            active = self.active()
            setup = dict(self.setup)
            if active and setup['stage'] == 'Not downloaded':
                setup.update(stage='Ready', message='Local AI is ready. Saved scenes can also be used with local AI disabled.')
            return dict(ok=True, ready=bool(active), active=active, setup=setup, default_model=DEFAULT_MODEL,
                        models=[dict(id=key, **value, downloaded=self.model_ready(key))
                                for key, value in sorted(MODELS.items(), key=lambda item: item[1]['download_gb'])],
                        hardware=[dict(id=key, **value, installed=self.runtime_ready(key)) for key, value in HARDWARE.items()])

    def select(self, model, hardware):
        if not isinstance(model, str) or not isinstance(hardware, str) or model not in MODELS or hardware not in HARDWARE:
            raise LocalMirrorError('Choose a listed model and processor.')
        if sys.platform not in ('win32', 'linux'):
            raise LocalMirrorError('Generative Art AI currently supports Windows and Linux.')

    def start(self, model, hardware):
        self.select(model, hardware)
        with self.lock:
            if self.setup['running']:
                raise LocalMirrorError('A local AI download is already running.')
            self.cancel = threading.Event()
            self.setup = dict(running=True, stage='Preparing', message='Preparing the optional local AI download.', model=model, hardware=hardware)
            threading.Thread(target=self.install, args=(model, hardware, self.cancel), daemon=True).start()

    def stage(self, stage, message):
        with self.lock:
            self.setup.update(stage=stage, message=message)

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
        return env

    def run(self, command, cancel, log, timeout=7200):
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
                    if 'option is for nvidia rtx 50' in failure:
                        raise LocalMirrorError('The NVIDIA option requires an RTX 50-series GPU. Choose a compatible processor.')
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
        from .manager import _resolve_python_command
        candidates = []
        try:
            candidates.append(_resolve_python_command())
        except RuntimeError:
            pass
        if os.name == 'nt':
            candidates.extend([['py', '-3.12'], ['py', '-3.13'], ['py', '-3.11'], ['python']])
        else:
            candidates.extend([['python3.12'], ['python3.13'], ['python3.11'], ['python3']])
        amd_windows = hardware == 'amd' and os.name == 'nt'
        version_check = 'sys.version_info[:2]==(3,12)' if amd_windows else '(3,10)<=sys.version_info[:2]<(3,14)'
        seen = set()
        for candidate in candidates:
            if tuple(candidate) in seen: continue
            seen.add(tuple(candidate))
            try:
                self.run(candidate + ['-c', 'import sys;sys.exit(0 if ' + version_check + ' and sys.maxsize>2**32 else 1)'], cancel, log, 30)
                return candidate
            except (OSError, LocalMirrorError):
                if cancel.is_set(): raise
        required = '3.12' if amd_windows else '3.10–3.13'
        raise LocalMirrorError('This processor option requires 64-bit Python ' + required + '. Install it, then retry the optional download.')

    def install(self, model, hardware, cancel):
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            log = self.root / 'installation.log'
            if not self.model_ready(model):
                needed = (MODELS[model]['download_gb'] + (0 if self.runtime_ready(hardware) else 9) + 3) * 1024**3
                if shutil.disk_usage(self.root).free < needed:
                    raise LocalMirrorError('There is not enough free disk space for this model and its runtime.')
            if not self.runtime_ready(hardware):
                python = self.resolve_python(hardware, cancel, log)
                self.stage('Installing runtime', 'Downloading the selected processor libraries. This may take several minutes.')
                self.run(python + ['-m', 'venv', str(self.runtime(hardware))], cancel, log, 120)
                pip = [self.python(hardware), '-I', '-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:']
                # A cancelled pip extraction can leave a partial distribution.
                # Rebuild this unready runtime, without reinstalling it once its
                # processor health check has succeeded.
                self.run(pip + ['--force-reinstall'] + runtime_packages(hardware), cancel, log)
                self.run(pip + COMMON_PACKAGES, cancel, log)
                self.stage('Checking processor', 'Testing the selected processor before downloading model weights.')
                self.run([self.python(hardware), '-I', SOURCE / 'generation_worker.py', 'health', '--hardware', hardware], cancel, log, 180)
                write_json(self.runtime(hardware) / 'ready.json', dict(version=RUNTIME_VERSION))
            if not self.model_ready(model):
                self.stage('Downloading model', 'Downloading ' + MODELS[model]['name'] + '. Interrupted downloads can be resumed.')
                self.run([self.python(hardware), '-I', SOURCE / 'generation_worker.py', 'download', '--model', model,
                          '--destination', self.model_path(model)], cancel, log)
            with self.lock:
                if cancel.is_set(): raise LocalMirrorError('Cancelled. Existing models and saved scenes are unchanged.')
                write_json(self.root / 'active.json', dict(enabled=True, model=model, hardware=hardware))
                self.setup.update(stage='Ready', message='Generative Art AI is ready for features that use local image generation.')
        except Exception as exc:
            message = str(exc) if isinstance(exc, LocalMirrorError) else 'Local AI setup failed. Check installation.log in the local generation plugin folder.'
            self.stage('Cancelled' if cancel.is_set() else 'Setup failed', message)
        finally:
            with self.lock:
                self.setup['running'] = False

    def disable(self):
        with self.lock:
            self.cancel.set()
            selected = read_json(self.root / 'active.json')
            if selected:
                write_json(self.root / 'active.json', dict(selected, enabled=False))

    def generate(self, *, image, mask, theme, prompt, seed, cancel, compact_prompt=None, negative_prompt=None, canvas_size=None, image_box=None, outpaint_prompt=None, outpaint_description=None, outpaint_margin=0, background_prompt=None, background_description=None, background_negative=None):
        selected = self.active()
        if not selected:
            raise LocalMirrorError('Download and enable a local AI model in Card Finishing Studio settings.')
        if canvas_size is not None and selected['model']=='instruct_pix2pix':
            raise LocalMirrorError('InstructPix2Pix does not support full-canvas outpainting. Enable SD-Turbo, Stable Diffusion 1.5, SDXL or FLUX in Generative Art AI settings. Your previous scene is unchanged.')
        # Serialize GPU inference, keeping queued jobs cancellable.
        while not self.render_lock.acquire(timeout=.25):
            if cancel.is_set(): raise LocalMirrorError('Render cancelled.')
        try:
            if cancel.is_set(): raise LocalMirrorError('Render cancelled.')
            jobs = self.root / 'jobs'; jobs.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='scene-', dir=jobs) as folder:
                folder = Path(folder)
                (folder / 'source.png').write_bytes(image); (folder / 'mask.png').write_bytes(mask)
                model_prompt = compact_prompt if compact_prompt and selected['model'] != 'flux_klein' else prompt
                payload = dict(selected, model_path=str(self.model_path(selected['model'])), prompt=model_prompt, seed=seed,
                               image=str(folder / 'source.png'), mask=str(folder / 'mask.png'), output=str(folder / 'scene.png'))
                if negative_prompt: payload['negative_prompt'] = negative_prompt
                if canvas_size is not None:
                    from .mirror_shards import expanded_scene_geometry
                    expanded_size,padding=expanded_scene_geometry(canvas_size,outpaint_margin)
                    payload.update(canvas_size=canvas_size,image_box=image_box,outpaint_prompt=outpaint_prompt or model_prompt,
                                   outpaint_description=outpaint_description or outpaint_prompt or model_prompt,
                                   expanded_size=expanded_size,scene_padding=padding,background_prompt=background_prompt,
                                   background_description=background_description,background_negative=background_negative)
                write_json(folder / 'request.json', payload)
                self.run([self.python(selected['hardware']), '-I', SOURCE / 'generation_worker.py', 'generate',
                          '--request', folder / 'request.json'], cancel, self.root / 'generation.log', 7200)
                output = folder / 'scene.png'
                if output.stat().st_size > 15_000_000:
                    raise LocalMirrorError('The generated scene is too large. Your saved layer is unchanged.')
                return output.read_bytes()
        finally:
            self.render_lock.release()


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
                if not isinstance(payload, dict) or set(payload) != {'model', 'hardware'}:
                    raise LocalMirrorError('Choose a model and processor.')
                manager.start(payload['model'], payload['hardware'])
            elif request.method == 'DELETE':
                manager.disable()
            response = jsonify(manager.status())
            response.cache_control.no_store = True
            return response
        except LocalMirrorError as exc:
            return jsonify(ok=False, message=str(exc)), 400

    @app.post('/plugins/card-finishing-generation/cancel')
    def local_mirror_cancel():
        manager = local_mirror(app)
        with manager.lock:
            manager.cancel.set()
        return jsonify(manager.status())
