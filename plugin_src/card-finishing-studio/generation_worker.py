"""Optional local image-generation process. Never imported by detection tools.

Model downloads are an explicit command; generation uses local files only.
The host owns/cancels this process and persists the finished PNG separately.
"""
import argparse
import json
import math
import os
from pathlib import Path
import sys
sys.dont_write_bytecode = True
# -I omits the script folder; explicitly load this bundled plugin package.
sys.path.insert(0, str(Path(__file__).resolve().parent))

OUTPAINT=json.loads(Path(__file__).with_name('generation_outpaint.json').read_text(encoding='utf-8'))

ANALYZER=json.loads(Path(__file__).with_name('generation_analyzer.json').read_text(encoding='utf-8'))

CATALOG=json.loads(Path(__file__).with_name('generation_models.json').read_text(encoding='utf-8'))


def prompt_parts(model):
    return json.loads(Path(__file__).with_name('generation_prompts.json').read_text(encoding='utf-8'))['models'][model]


def hardware_device(hardware):
    import torch
    if hardware=='cpu':return 'cpu'
    if not torch.cuda.is_available():raise RuntimeError('The selected GPU runtime cannot access a compatible GPU. Check its driver or choose CPU.')
    hip=bool(torch.version.hip)
    if hardware=='amd' and not hip:raise RuntimeError('This runtime is not using AMD ROCm.')
    if hardware=='nvidia' and (hip or not torch.version.cuda):raise RuntimeError('This runtime is not using NVIDIA CUDA.')
    if hardware=='nvidia' and torch.cuda.get_device_capability()[0]<8:
        raise RuntimeError('The shared artwork analyzer requires native BF16 support, such as NVIDIA RTX 30-series or newer.')
    # Verify a real GPU kernel, rather than relying only on driver detection.
    for dtype in (torch.float16,torch.bfloat16):
        (torch.ones((16,16),device='cuda',dtype=dtype) @ torch.ones((16,16),device='cuda',dtype=dtype)).sum().item()
    return 'cuda'


def model_size(dimensions,budget):
    aspect=max(.25,min(4,dimensions[0]/dimensions[1]))
    return tuple(max(64,round(v/32)*32) for v in (math.sqrt(budget*aspect),math.sqrt(budget/aspect)))


def check_health(hardware, output=None, outpaint=False):
    """Separate damaged libraries from processor/driver failures for recovery."""
    phase='runtime'
    try:
        import torch
        from diffusers import (Flux2KleinPipeline, Flux2KleinInpaintPipeline, StableDiffusionXLImg2ImgPipeline, StableDiffusionXLInpaintPipeline,
                               StableDiffusionImg2ImgPipeline, StableDiffusionInpaintPipeline, StableDiffusionInstructPix2PixPipeline,
                               EulerAncestralDiscreteScheduler)
        from transformers import AutoProcessor, AutoModelForImageTextToText
        if outpaint:
            import peft
            if peft.__version__!=OUTPAINT['peft']:
                raise RuntimeError('The installed outpainting loader does not match the package version.')
        phase='processor'
        device=hardware_device(hardware)
        result=dict(ok=True,device=torch.cuda.get_device_name(0) if device=='cuda' else 'CPU',torch=torch.__version__)
    except Exception as exc:
        if output:Path(output).write_text(json.dumps(dict(ok=False,component=phase,error=type(exc).__name__)),encoding='utf-8')
        raise
    if output:Path(output).write_text(json.dumps(result),encoding='utf-8')
    print(json.dumps(result))


def outpaint_canvas(art,size,canvas_size,image_box):
    """Build an image-only guide. Gray pixels are missing artwork, not card data."""
    from PIL import Image,ImageDraw
    x0,y0,x1,y1=[round(v*size[i%2]/canvas_size[i%2]) for i,v in enumerate(image_box)]
    canvas=Image.new('RGB',size,(127,127,127))
    canvas.paste(art.resize((x1-x0,y1-y0),Image.Resampling.LANCZOS),(x0,y0))
    missing=Image.new('L',size,255)
    # Include a small overlap inside the reference for a continuous seam.
    overlap=max(2,round(min(size)*.012))
    ImageDraw.Draw(missing).rectangle((x0+overlap,y0+overlap,x1-overlap-1,y1-overlap-1),fill=0)
    return canvas,missing


def rendered_image(result):
    if any(getattr(result,'nsfw_content_detected',None) or []):
        raise RuntimeError('Image model declined this render.')
    return result.images[0].convert('RGB')


def generation_step_callback(progress):
    """Report completed sampler work without inspecting or changing tensors."""
    def completed(pipe, step, timestep, values):
        total=getattr(pipe,'num_timesteps',None)
        if total is None:total=len(pipe.scheduler.timesteps)
        progress('generating',f'Generating artwork: {step+1} of {total} steps complete.')
        return values
    return completed


def background_canvas(core,size,expanded_size,padding,soft_guide=False):
    """Expose only the new background border to inpainting, never the center."""
    from PIL import Image,ImageDraw,ImageFilter
    px,py=padding;ew,eh=expanded_size
    box=(round(px*size[0]/ew),round(py*size[1]/eh),round((ew-px)*size[0]/ew),round((eh-py)*size[1]/eh))
    guide=Image.new('RGB',size,(127,127,127))
    reference=core.resize((box[2]-box[0],box[3]-box[1]),Image.Resampling.LANCZOS)
    guide.paste(reference,box[:2])
    if soft_guide:
        # A gray surround is interpreted as a picture mat by reference editors.
        # Supply only a soft continuation of boundary colors as conditioning.
        # These pixels are all regenerated, never used as the finished border.
        left,top,right,bottom=box;rw,rh=reference.size
        if left:guide.paste(reference.crop((0,0,1,rh)).resize((left,rh)),(0,top))
        if right<size[0]:guide.paste(reference.crop((rw-1,0,rw,rh)).resize((size[0]-right,rh)),(right,top))
        if top:guide.paste(guide.crop((0,top,size[0],top+1)).resize((size[0],top)),(0,0))
        if bottom<size[1]:guide.paste(guide.crop((0,bottom-1,size[0],bottom)).resize((size[0],size[1]-bottom)),(0,bottom))
        guide=guide.filter(ImageFilter.GaussianBlur(max(2,min(size)*.025)))
        guide.paste(reference,box[:2])
    missing=Image.new('L',size,255)
    ImageDraw.Draw(missing).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=0)
    return guide,missing


def preserve_scene_center(background,core,expanded_size,padding):
    """Restore exact center pixels after decoding for every model."""
    from PIL import Image
    result=background.resize(expanded_size,Image.Resampling.LANCZOS)
    core_size=tuple(v-2*p for v,p in zip(expanded_size,padding))
    if core.size!=core_size:core=core.resize(core_size,Image.Resampling.LANCZOS)
    result.paste(core,tuple(padding))
    return result


def flux_expansion_prompt(expanded_size,padding,parts=None):
    core_size=tuple(v-2*p for v,p in zip(expanded_size,padding))
    factor=max(v/c for v,c in zip(expanded_size,core_size))
    return (parts or prompt_parts('flux_klein'))['mirror_expansion'].format(
        zoom=f'{factor:.2f}',subject_percent=f'{100/factor:.0f}',user_prompt='',style='',theme_direction='',theme_style='')


def generate(request, runtime=None):
    if request.get('edit_mode') == 'remove_text':
        raise RuntimeError('Text removal must use the text detection and local inpainting worker.')
    def progress(stage,message):
        if request.get('progress_path'):
            path=Path(request['progress_path']);temporary=path.with_suffix('.tmp')
            try:
                temporary.write_text(json.dumps(dict(stage=stage,message=message)),encoding='utf-8')
                temporary.replace(path)
            except OSError:
                pass  # A progress-file race must not fail image generation.
    progress('loading','Loading the local image model and checking the processor.')
    import torch
    from PIL import Image
    from diffusers import (Flux2KleinPipeline, Flux2KleinInpaintPipeline, StableDiffusionXLImg2ImgPipeline, StableDiffusionXLInpaintPipeline,
                           StableDiffusionImg2ImgPipeline, StableDiffusionInpaintPipeline, StableDiffusionInstructPix2PixPipeline,
                           EulerAncestralDiscreteScheduler)
    device=hardware_device(request['hardware']);model=request['model']
    plan=request.get('generation_plan')
    checkpoint=CATALOG[model].get('edit_checkpoint') if plan and plan['operation'] not in ('mirror','micro_scene') else None
    model_spec=checkpoint or CATALOG[model]
    if request.get('edit_mode') and not plan:
        raise RuntimeError('Edit generation requires a compiled generation plan.')
    if plan:
        from prompter.contracts import validate_plan, image_digest
        from prompter.compiler import conditioning_images
        validate_plan(plan)
        if (plan['model']!=model or plan['model_revision']!=model_spec['revision']
                or plan['hardware']!=request['hardware'] or plan['operation']!=request.get('edit_mode')
                or plan['seed']!=request['seed'] or 'prompt_candidates' in plan):
            raise RuntimeError('Generation plan does not match the loaded model or was not finalized.')
        if plan['adapter'] and plan['adapter'] != OUTPAINT:
            raise RuntimeError('The outpainting adapter changed after preparation. Prepare the edit again.')
    parts=request.get('prompt_parts') or prompt_parts(model)
    pipelines={'flux_klein':Flux2KleinPipeline, 'sdxl':StableDiffusionXLImg2ImgPipeline,
               'sd15':StableDiffusionImg2ImgPipeline, 'sd_turbo':StableDiffusionImg2ImgPipeline,
               'instruct_pix2pix':StableDiffusionInstructPix2PixPipeline}
    cls=pipelines[model]
    if plan:
        edit_pipelines={pipeline.__name__:pipeline for pipeline in (Flux2KleinPipeline,Flux2KleinInpaintPipeline,StableDiffusionXLImg2ImgPipeline,StableDiffusionImg2ImgPipeline,
                       StableDiffusionXLInpaintPipeline,StableDiffusionInpaintPipeline,StableDiffusionInstructPix2PixPipeline)}
        cls=edit_pipelines[plan['pipeline']]
    if checkpoint:
        if model!='sdxl' or checkpoint['pipeline']!=cls.__name__:
            raise RuntimeError('Unsupported editing checkpoint pipeline.')
    native_flux = cls is Flux2KleinInpaintPipeline
    dtype=torch.float32 if device=='cpu' else torch.bfloat16 if model=='flux_klein' else torch.float16
    with Image.open(request['image']) as supplied:
        original=supplied.convert('RGBA')
    if plan:
        with Image.open(request['mask']) as check_mask:
            if image_digest(original)!=plan['reference_hash'] or image_digest(check_mask.getchannel('A'))!=plan['mask_hash']:
                raise RuntimeError('Generation inputs changed after planning.')
    source=original.convert('RGB')
    # Generate one registered scene, never one independent picture per shard.
    budget=768*1088 if device!='cpu' and model in ('flux_klein','sdxl') else 512*704
    size=tuple(plan['dimensions']) if plan else model_size(source.size,budget)
    reference=source.resize(size,Image.Resampling.LANCZOS)
    canvas_size=tuple(request['canvas_size']) if request.get('canvas_size') else None
    if (canvas_size or request.get('edit_mode')=='outpaint') and model=='instruct_pix2pix':
        raise RuntimeError('InstructPix2Pix does not support full-canvas outpainting.')
    if canvas_size and model=='flux_klein':
        # FLUX edits by reference, not by a protected pixel mask. A crop pasted
        # inside a gray card-sized guide teaches it an inset/panel composition
        # and can produce additional portraits. Supply the clean crop directly
        # and request one continuous scene at the target portrait dimensions.
        size=model_size(canvas_size,budget)
    # CPU loads the same compact files and promotes weights to float32.
    options={} if model=='flux_klein' else {'variant':'fp16'}
    from generation_runtime import GenerationRuntime
    runtime = runtime or GenerationRuntime()
    pipe=runtime.pipeline(cls,request['model_path'],dtype,device,options,progress)
    if checkpoint and pipe.unet.config.in_channels!=checkpoint['in_channels']:
        raise RuntimeError('This package is missing the dedicated editing model. Verify and repair the package in Studio Settings.')
    if model=='flux_klein' and request.get('edit_mode')=='outpaint':
        adapter=request.get('outpaint_adapter')
        if not adapter:raise RuntimeError('Install FLUX outpainting support in Generative Art AI settings.')
        runtime.outpaint_adapter(adapter,plan['adapter']['scale'] if plan else OUTPAINT['scale'])
    else:
        runtime.disable_adapter()
    if model=='instruct_pix2pix':
        pipe.scheduler=EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe.set_progress_bar_config(disable=True)
    runtime.configure(device,progress)
    pipe.vae.enable_tiling()
    generator=torch.Generator(device='cpu').manual_seed(request['seed'])
    arguments=dict(image=reference,prompt=request['prompt'],generator=generator)
    if model=='flux_klein':arguments.update(height=size[1],width=size[0],num_inference_steps=4,guidance_scale=1.0)
    elif model=='sd_turbo':
        # Distilled model: no classifier-free guidance; at least one effective step.
        arguments.update(strength=.25,num_inference_steps=4,guidance_scale=0.0)
    elif model=='instruct_pix2pix':
        arguments.update(num_inference_steps=25,guidance_scale=7.5,image_guidance_scale=1.5)
    else:
        arguments.update(strength=.3 if model=='sd15' else .48,num_inference_steps=30,guidance_scale=6.0,
            negative_prompt=parts['mirror_negative'])
    if request.get('negative_prompt') and model in ('instruct_pix2pix','sd15','sdxl'):
        arguments['negative_prompt']=request['negative_prompt']
    edit_mask=None
    if request.get('edit_mode'):
        with Image.open(request['mask']) as supplied_mask:
            edit_mask=supplied_mask.getchannel('A').resize(size,Image.Resampling.LANCZOS)
        if model == 'flux_klein':
            if native_flux:arguments.update(image=reference,mask_image=edit_mask)
            elif request['edit_mode'] not in ('mirror','micro_scene'):arguments['image'] = conditioning_images(plan, reference, edit_mask)
        if model in ('sd15','sdxl','sd_turbo') and request['edit_mode'] not in ('mirror','micro_scene'):
            from diffusers import StableDiffusionInpaintPipeline,StableDiffusionXLInpaintPipeline
            if not isinstance(pipe,(StableDiffusionInpaintPipeline,StableDiffusionXLInpaintPipeline)):
                pipe.remove_all_hooks()
                cls=StableDiffusionXLInpaintPipeline if model=='sdxl' else StableDiffusionInpaintPipeline
                pipe=cls.from_pipe(pipe,torch_dtype=dtype);pipe.set_progress_bar_config(disable=True)
                if device=='cuda':pipe.enable_model_cpu_offload()
                else:pipe.to('cpu')
            arguments.update(mask_image=edit_mask,height=size[1],width=size[0],strength=1.0)
    if plan:
        arguments.update(plan['parameters'], prompt=plan['prompt'])
        arguments.pop('negative_prompt',None)
        if plan['negative_prompt']:arguments['negative_prompt']=plan['negative_prompt']
        if model=='flux_klein':arguments['max_sequence_length']=plan['prompt_tokens']
    progress('generating','Encoding the prompt and artwork before the sampling steps.')
    if plan and request.get('progress_path'):
        arguments.update(callback_on_step_end=generation_step_callback(progress),callback_on_step_end_tensor_inputs=[])
    import time
    generated_at=time.monotonic()
    with torch.inference_mode():result=rendered_image(pipe(**arguments))
    print(f'IMAGE_GENERATION seconds={time.monotonic()-generated_at:.3f} operation={request.get("edit_mode","mirror")}',flush=True)
    if plan and request.get('diagnostics_dir'):
        # Set only by the source-app DEV path, never by an API request field.
        # Capturing must not change inference inputs or the returned artwork.
        from prompter.diagnostics import capture_pipeline
        capture_pipeline(request['diagnostics_dir'],arguments,result,edit_mask)
    if plan and plan.get('postprocessing',{}).get('color_continuity') == 'paired_reference_v1':
        if plan['operation'] != 'outpaint' or plan['style_mode'] != 'match':
            raise RuntimeError('Color continuity requires a Match artwork outpaint plan.')
        from prompter.color_continuity import match_outpaint
        result, color_matching = match_outpaint(reference,result,edit_mask)
        if request.get('diagnostics_dir'):
            from prompter.diagnostics import capture_color_matching
            capture_color_matching(request['diagnostics_dir'],result,color_matching)
    if canvas_size:
        if model!='flux_klein':
            # Theme the artwork first, then ask AI to fill the missing canvas.
            # Reuse the installed weights; no new model download is needed.
            size=model_size(canvas_size,budget)
            reference,missing=outpaint_canvas(result,size,canvas_size,request['image_box'])
            arguments=dict(image=reference,prompt=request['outpaint_prompt'],generator=generator,
                           negative_prompt=request.get('negative_prompt',''),num_inference_steps=30,guidance_scale=6.0)
            from diffusers import StableDiffusionInpaintPipeline,StableDiffusionXLInpaintPipeline
            pipe.remove_all_hooks()
            cls=StableDiffusionXLInpaintPipeline if model=='sdxl' else StableDiffusionInpaintPipeline
            pipe=cls.from_pipe(pipe,torch_dtype=dtype)
            pipe.set_progress_bar_config(disable=True)
            if device=='cuda':pipe.enable_model_cpu_offload()
            else:pipe.to('cpu')
            arguments.update(mask_image=missing,height=size[1],width=size[0],strength=1.0,
                             prompt=request.get('outpaint_description',request['outpaint_prompt']))
            if model=='sd_turbo':arguments.update(num_inference_steps=4,guidance_scale=0.0)
            with torch.inference_mode():result=rendered_image(pipe(**arguments))
        core=result.resize(canvas_size,Image.Resampling.LANCZOS)
        padding=request.get('scene_padding',(0,0))
        if any(padding):
            expanded_size=tuple(request['expanded_size']);size=model_size(expanded_size,budget)
            if model=='flux_klein':
                # Give the clean completed illustration as the sole reference.
                # No inset guide, cloned edges, masks or post-render center paste.
                # The compositor's padding metadata retains the central viewport.
                arguments=dict(image=result,prompt=flux_expansion_prompt(expanded_size,padding,parts),generator=generator,
                               height=size[1],width=size[0],num_inference_steps=4,guidance_scale=1.0)
                with torch.inference_mode():background=rendered_image(pipe(**arguments))
                result=background.resize(expanded_size,Image.Resampling.LANCZOS)
            else:
                reference,missing=background_canvas(core,size,expanded_size,padding)
                arguments=dict(image=reference,generator=generator,height=size[1],width=size[0],
                               prompt=request['background_description'],negative_prompt=request['background_negative'],
                               mask_image=missing,strength=1.0,num_inference_steps=30,guidance_scale=6.0)
                if model=='sd_turbo':arguments.update(num_inference_steps=4,guidance_scale=0.0)
                with torch.inference_mode():background=rendered_image(pipe(**arguments))
                result=preserve_scene_center(background,core,expanded_size,padding)
        else:result=core
        result.save(request['output'],format='PNG')
        return
    progress('rendering','Decoding the generated image and preserving unselected artwork.')
    result=result.resize(source.size,Image.Resampling.LANCZOS)
    # Keep pixels outside the selected scene exactly as supplied. Selection
    # strength belongs to the later effect compositing pass, not this scene.
    with Image.open(request['mask']) as selection:
        selected=selection.getchannel('A').resize(source.size,Image.Resampling.NEAREST).point(lambda v:255 if v else 0)
    result=Image.composite(result.convert('RGBA'),original,selected)
    result.save(request['output'],format='PNG')


def download_progress_class(path):
    """Relay downloader counters to the parent process, including Xet transfers."""
    from tqdm.auto import tqdm
    import threading, time
    lock=threading.RLock(); counters={}; last=[0.0]
    class DownloadProgress(tqdm):
        def report(self, force=False):
            if not path:return
            unit=getattr(self,'unit',None)
            desc=str(getattr(self,'desc',''))
            key=('transfer' if 'Downloading bytes' in desc or 'Download complete'==desc else 'bytes') if unit=='B' else 'files'
            with lock:
                counters[key]={'done':max(0,int(getattr(self,'n',0) or 0)), 'total':max(0,int(getattr(self,'total',0) or 0))}
                now=time.monotonic()
                if not force and now-last[0]<.3:return
                last[0]=now
                target=Path(path);temp=target.with_suffix('.tmp')
                try:
                    temp.write_text(json.dumps(counters),encoding='utf-8');temp.replace(target)
                except OSError:
                    pass  # A progress display must never interrupt a model download.
        def update(self,n=1):
            result=super().update(n);self.report();return result
        def refresh(self,*args,**kwargs):
            result=super().refresh(*args,**kwargs);self.report();return result
        def close(self):
            self.report(True);super().close()
    return DownloadProgress


def execute_request(command, payload, runtime=None):
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
    if command=='prepare-plan':
        from transformers import AutoTokenizer
        from prompter.compiler import finalize_plan
        tokenizers=[AutoTokenizer.from_pretrained(Path(payload['model_path'])/'tokenizer',local_files_only=True)]
        if payload['plan']['model']=='sdxl': tokenizers.append(AutoTokenizer.from_pretrained(Path(payload['model_path'])/'tokenizer_2',local_files_only=True))
        plan=finalize_plan(payload['plan'],tokenizers)
        Path(payload['output']).write_text(json.dumps(plan),encoding='utf-8')
    elif command=='analyze':
        if runtime is not None:
            runtime.clear()
        from prompter.analysis import infer
        infer(payload)
    elif command=='generate':
        generate(payload,runtime)
    else:
        raise ValueError('Unsupported generation-session command.')


def generation_session():
    """Private stdin protocol; parent EOF/cancellation releases all model memory."""
    import time, traceback
    from generation_runtime import GenerationRuntime
    runtime=GenerationRuntime()
    for line in sys.stdin:
        request=json.loads(line)
        started=time.monotonic()
        try:
            print('SESSION_START '+request['command'],flush=True)
            payload=json.loads(Path(request['request']).read_text(encoding='utf-8'))
            execute_request(request['command'],payload,runtime)
            result={'ok':True}
        except Exception as exc:
            traceback.print_exc()
            result={'ok':False,'error':str(exc),'error_type':type(exc).__name__}
        result['elapsed_seconds']=round(time.monotonic()-started,3)
        print(f"SESSION_END {request['command']} seconds={result['elapsed_seconds']} ok={result['ok']}",flush=True)
        response=Path(request['response']);temporary=response.with_suffix('.tmp')
        temporary.write_text(json.dumps(result),encoding='utf-8');temporary.replace(response)
        if not result['ok']:
            return  # Never reuse a pipeline after a failed operation.


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['health','download','download-outpaint','download-analyzer','verify-assets','analyze','prepare-plan','generate','session'])
    parser.add_argument('--hardware',choices=['nvidia','amd','cpu'],default='cpu')
    parser.add_argument('--model',choices=list(CATALOG))
    parser.add_argument('--edit-checkpoint',action='store_true',help='Download this model’s dedicated Edit checkpoint.')
    parser.add_argument('--destination')
    parser.add_argument('--request')
    parser.add_argument('--progress-path')
    parser.add_argument('--health-output')
    parser.add_argument('--with-outpaint',action='store_true')
    args=parser.parse_args()
    if args.command=='session':
        generation_session()
    elif args.command=='health':
        check_health(args.hardware,args.health_output,args.with_outpaint)
    elif args.command=='download-outpaint':
        import hashlib, shutil
        from huggingface_hub import hf_hub_download
        destination=Path(args.destination)
        fetched=hf_hub_download(OUTPAINT['repository'],OUTPAINT['filename'],revision=OUTPAINT['revision'],token=False,tqdm_class=download_progress_class(args.progress_path),force_download=(destination/'repair.json').is_file())
        if hashlib.sha256(Path(fetched).read_bytes()).hexdigest()!=OUTPAINT['sha256']:raise RuntimeError('Outpainting adapter checksum mismatch.')
        destination=Path(args.destination);destination.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(fetched,destination/OUTPAINT['filename'])
        (destination/'ready.json').write_text(json.dumps({'revision':OUTPAINT['revision']}),encoding='utf-8')
        (destination/'repair.json').unlink(missing_ok=True)
    elif args.command=='verify-assets':
        import time
        from generation_storage import verify_snapshot
        payload=json.loads(Path(args.request).read_text(encoding='utf-8'));results={};last=[0.]
        for item in payload['components']:
            def report(filename,done,total,files_done,files_total):
                if not args.progress_path or (time.monotonic()-last[0]<.25 and files_done!=files_total):return
                last[0]=time.monotonic();path=Path(args.progress_path);temporary=path.with_suffix('.tmp')
                value=dict(component=item['name'],filename=filename,bytes=dict(done=done,total=total),files=dict(done=files_done,total=files_total))
                try:
                    temporary.write_text(json.dumps(value),encoding='utf-8');temporary.replace(path)
                except OSError:
                    pass  # Windows may briefly lock the progress file while polling.
            results[item['id']]=verify_snapshot(item['path'],item['required'],report,expected_checksums=item.get('checksums'))
        Path(payload['output']).write_text(json.dumps(results),encoding='utf-8')
    elif args.command=='download-analyzer':
        from generation_storage import download_snapshot
        download_snapshot(ANALYZER['repository'],ANALYZER['revision'],args.destination,ANALYZER['patterns'],download_progress_class(args.progress_path),required=['config.json','tokenizer.json','preprocessor_config.json']+ANALYZER.get('required_files',[]))
    elif args.command=='download':
        from generation_storage import download_snapshot
        model=CATALOG[args.model].get('edit_checkpoint') if args.edit_checkpoint else CATALOG[args.model]
        if not model:raise RuntimeError('This model has no separate editing checkpoint.')
        download_snapshot(model['repository'],model['revision'],args.destination,model['patterns'],download_progress_class(args.progress_path),required=['model_index.json']+model.get('required_files',[]))
    else:
        payload=json.loads(Path(args.request).read_text(encoding='utf-8'))
        execute_request(args.command,payload)

if __name__=='__main__':main()
