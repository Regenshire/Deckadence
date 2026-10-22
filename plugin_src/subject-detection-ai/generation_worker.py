"""Optional local image-generation process. Never imported by detection tools.

Model downloads are an explicit command; generation uses local files only.
The host owns/cancels this process and persists the finished PNG separately.
"""
import argparse
import json
import math
import os
from pathlib import Path

CATALOG=json.loads(Path(__file__).with_name('generation_models.json').read_text(encoding='utf-8'))


def hardware_device(hardware):
    import torch
    if hardware=='cpu':return 'cpu'
    if not torch.cuda.is_available():raise RuntimeError('The selected GPU runtime cannot access a compatible GPU. Check its driver or choose CPU.')
    hip=bool(torch.version.hip)
    if hardware=='amd' and not hip:raise RuntimeError('This runtime is not using AMD ROCm.')
    if hardware=='nvidia' and (hip or not torch.version.cuda):raise RuntimeError('This runtime is not using NVIDIA CUDA.')
    if hardware=='nvidia' and torch.cuda.get_device_capability()[0]<12:
        raise RuntimeError('This option is for NVIDIA RTX 50-series GPUs.')
    # Verify a real GPU kernel, rather than relying only on driver detection.
    (torch.ones((16,16),device='cuda') @ torch.ones((16,16),device='cuda')).sum().item()
    return 'cuda'


def model_size(dimensions,budget):
    aspect=max(.25,min(4,dimensions[0]/dimensions[1]))
    return tuple(max(64,round(v/32)*32) for v in (math.sqrt(budget*aspect),math.sqrt(budget/aspect)))


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


def flux_expansion_prompt(expanded_size,padding):
    """Request a wider continuous view, without teaching Klein an inset layout.

    Its reference editor can relocate scenery even with latent-mask clamping.
    Hard-pasting the old center afterwards then doubles those features at the
    boundary. Keep the whole widened result instead; small details can change.
    """
    core_size=tuple(v-2*p for v,p in zip(expanded_size,padding))
    factor=max(v/c for v,c in zip(expanded_size,core_size))
    return (f'Zoom out by {factor:.2f} times. Reveal more background scenery on all four sides of this illustration. '
            f'Keep the same subjects centered, now {100/factor:.0f}% as tall in the canvas. '
            'Retain the exact same character designs, poses, art style and lighting. '
            'One coherent continuous scene, with each existing subject appearing once. '
            'The extra space is quiet background environment and atmosphere, without additional focal objects. '
            'Continue the existing landscape naturally. Artwork only, without text, frames or panels.')


def generate(request):
    import torch
    from PIL import Image
    from diffusers import (Flux2KleinPipeline, StableDiffusionXLImg2ImgPipeline,
                           StableDiffusionImg2ImgPipeline, StableDiffusionInstructPix2PixPipeline,
                           EulerAncestralDiscreteScheduler)
    device=hardware_device(request['hardware']);model=request['model']
    pipelines={'flux_klein':Flux2KleinPipeline, 'sdxl':StableDiffusionXLImg2ImgPipeline,
               'sd15':StableDiffusionImg2ImgPipeline, 'sd_turbo':StableDiffusionImg2ImgPipeline,
               'instruct_pix2pix':StableDiffusionInstructPix2PixPipeline}
    cls=pipelines[model]
    dtype=torch.float32 if device=='cpu' else torch.bfloat16 if model=='flux_klein' else torch.float16
    with Image.open(request['image']) as supplied:
        original=supplied.convert('RGBA')
    source=original.convert('RGB')
    # Generate one registered scene, never one independent picture per shard.
    budget=768*1088 if device!='cpu' and model in ('flux_klein','sdxl') else 512*704
    size=model_size(source.size,budget)
    reference=source.resize(size,Image.Resampling.LANCZOS)
    canvas_size=tuple(request['canvas_size']) if request.get('canvas_size') else None
    if canvas_size and model=='instruct_pix2pix':
        raise RuntimeError('InstructPix2Pix does not support full-canvas outpainting.')
    if canvas_size and model=='flux_klein':
        # FLUX edits by reference, not by a protected pixel mask. A crop pasted
        # inside a gray card-sized guide teaches it an inset/panel composition
        # and can produce additional portraits. Supply the clean crop directly
        # and request one continuous scene at the target portrait dimensions.
        size=model_size(canvas_size,budget)
    # CPU loads the same compact files and promotes weights to float32.
    options={} if model=='flux_klein' else {'variant':'fp16'}
    pipe=cls.from_pretrained(request['model_path'],torch_dtype=dtype,local_files_only=True,use_safetensors=True,**options)
    if model=='instruct_pix2pix':
        pipe.scheduler=EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    pipe.set_progress_bar_config(disable=True)
    if device=='cuda':pipe.enable_model_cpu_offload()
    else:pipe.to('cpu')
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
            negative_prompt='collage, new text, watermark, changed pose, extra limbs, distorted face')
    if request.get('negative_prompt') and model in ('instruct_pix2pix','sd15','sdxl'):
        arguments['negative_prompt']=request['negative_prompt']
    if request.get('edit_mode'):
        with Image.open(request['mask']) as supplied_mask:
            edit_mask=supplied_mask.getchannel('A').resize(size,Image.Resampling.LANCZOS)
        if model in ('sd15','sdxl','sd_turbo'):
            from diffusers import StableDiffusionInpaintPipeline,StableDiffusionXLInpaintPipeline
            pipe.remove_all_hooks()
            cls=StableDiffusionXLInpaintPipeline if model=='sdxl' else StableDiffusionInpaintPipeline
            pipe=cls.from_pipe(pipe,torch_dtype=dtype);pipe.set_progress_bar_config(disable=True)
            if device=='cuda':pipe.enable_model_cpu_offload()
            else:pipe.to('cpu')
            arguments.update(mask_image=edit_mask,height=size[1],width=size[0],strength=1.0)
        elif request['edit_mode']=='remove_text':
            # Instruction models receive a clean hole instead of the letters
            # they would otherwise tend to reproduce. AI fills it using context.
            from PIL import ImageStat,ImageChops
            outside=ImageChops.invert(edit_mask)
            rgb=tuple(round(v) for v in ImageStat.Stat(reference,outside).mean) if outside.getbbox() else (128,128,128)
            arguments['image']=Image.composite(Image.new('RGB',size,rgb),reference,edit_mask)
            arguments['prompt']='Fill the blank region with the surrounding background. '+request['prompt']
    with torch.inference_mode():result=rendered_image(pipe(**arguments))
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
                arguments=dict(image=result,prompt=flux_expansion_prompt(expanded_size,padding),generator=generator,
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
    result=result.resize(source.size,Image.Resampling.LANCZOS)
    # Keep pixels outside the selected scene exactly as supplied. Selection
    # strength belongs to the later effect compositing pass, not this scene.
    with Image.open(request['mask']) as selection:
        selected=selection.getchannel('A').resize(source.size,Image.Resampling.NEAREST).point(lambda v:255 if v else 0)
    result=Image.composite(result.convert('RGBA'),original,selected)
    result.save(request['output'],format='PNG')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=['health','download','generate'])
    parser.add_argument('--hardware',choices=['nvidia','amd','cpu'],default='cpu')
    parser.add_argument('--model',choices=list(CATALOG))
    parser.add_argument('--destination')
    parser.add_argument('--request')
    args=parser.parse_args()
    if args.command=='health':
        import torch
        from diffusers import (Flux2KleinPipeline, StableDiffusionXLImg2ImgPipeline,
                               StableDiffusionImg2ImgPipeline, StableDiffusionInstructPix2PixPipeline,
                               EulerAncestralDiscreteScheduler)
        device=hardware_device(args.hardware)
        print(json.dumps({'ok':True,'device':torch.cuda.get_device_name(0) if device=='cuda' else 'CPU','torch':torch.__version__}))
    elif args.command=='download':
        from huggingface_hub import snapshot_download
        model=CATALOG[args.model]
        snapshot_download(model['repository'],revision=model['revision'],local_dir=args.destination,allow_patterns=model['patterns'],token=False)
        Path(args.destination,'ready.json').write_text(json.dumps({'revision':model['revision']}),encoding='utf-8')
    else:
        os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
        generate(json.loads(Path(args.request).read_text(encoding='utf-8')))

if __name__=='__main__':main()
