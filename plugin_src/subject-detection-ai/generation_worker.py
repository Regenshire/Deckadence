"""Optional local image-generation process. Never imported by detection tools.

Model downloads are an explicit command; generation uses local files only.
The host owns/cancels this process and persists the finished PNG separately.
"""
import argparse
import json
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
    size=(768,1088) if device!='cpu' and model in ('flux_klein','sdxl') else (512,704)
    reference=source.resize(size,Image.Resampling.LANCZOS)
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
    with torch.inference_mode():result=pipe(**arguments).images[0].convert('RGB').resize(source.size,Image.Resampling.LANCZOS)
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
