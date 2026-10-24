"""Local, structured artwork observation. Never supplies executable instructions."""
import json
from pathlib import Path
from .contracts import validate_analysis, PlannerError

def model_loading_options(model_path, device, torch):
    """Reserve inference space before assigning analyzer weights to a GPU."""
    if device == 'cpu':
        return {}
    weight_bytes = sum(path.stat().st_size for path in Path(model_path).glob('*.safetensors'))
    free, _ = torch.cuda.mem_get_info()
    gib = 1024 ** 3
    reserve = max(2 * gib, min(4 * gib, free // 4))
    if weight_bytes and weight_bytes + reserve <= free:
        return {}
    import psutil
    gpu_budget = free - reserve
    cpu_available = psutil.virtual_memory().available
    cpu_budget = cpu_available - max(2 * gib, cpu_available // 10)
    if gpu_budget < gib or cpu_budget < max(gib, weight_bytes - gpu_budget + gib):
        raise RuntimeError('Not enough memory for artwork analysis. Close other GPU and memory-heavy apps, or choose CPU with enough system RAM.')
    return dict(device_map='auto', max_memory={torch.cuda.current_device(): gpu_budget, 'cpu': cpu_budget}, offload_buffers=True)


def report_progress(request, message):
    if not request.get('progress_path'):
        return
    path = Path(request['progress_path'])
    temporary = path.with_suffix('.tmp')
    try:
        temporary.write_text(json.dumps(dict(stage='analyzing', message=message)), encoding='utf-8')
        temporary.replace(path)
    except OSError:
        pass  # Progress polling must not fail a successful analysis on Windows.


def infer(request):
    import torch
    from PIL import Image
    from transformers import AutoProcessor, AutoModelForImageTextToText
    device = 'cpu' if request['hardware'] == 'cpu' else 'cuda'
    dtype = torch.float32 if device == 'cpu' else torch.bfloat16
    loading = model_loading_options(request['model_path'], device, torch)
    shared = bool(loading)
    report_progress(request, 'Loading the artwork analyzer with weights shared between GPU and system RAM. Analysis may take longer.' if shared else 'Loading the artwork analyzer.')
    processor = AutoProcessor.from_pretrained(request['model_path'], local_files_only=True)
    model = AutoModelForImageTextToText.from_pretrained(request['model_path'], local_files_only=True,
                                                      dtype=dtype, attn_implementation='sdpa', **loading)
    if not shared:
        model = model.to(device)
    elif all(value == 'cpu' for value in model.hf_device_map.values()):
        device = 'cpu'
    local = bool(request.get('context_image') and request.get('context_mask'))
    # For replacement/removal, analyze the actual neighborhood. A second,
    # distant art sample can dominate the palette even when labeled otherwise.
    image = Image.open(request['context_image'] if local else request['image']).convert('RGB')
    image.thumbnail((768, 768), Image.Resampling.LANCZOS)
    content = [{'type':'text','text':'Local edit neighborhood:' if local else 'Complete clean artwork:'},{'type':'image','image':image}]
    if local:
        mask=Image.open(request['context_mask']).getchannel('A').resize(image.size,Image.Resampling.NEAREST).convert('RGB')
        content.extend([{'type':'text','text':'Edit location guide (white marks selected pixels; black marks surrounding context):'},{'type':'image','image':mask}])
    else:
        w,h=image.size;sw=max(16,round(w*.18));sh=max(16,round(h*.18))
        for side,box in [('left',(0,0,sw,h)),('right',(w-sw,0,w,h)),('top',(0,0,w,sh)),('bottom',(0,h-sh,w,h))]:
            content.extend([{'type':'text','text':side+' edge strip (background observation only):'},{'type':'image','image':image.crop(box)}])
    content.append({'type':'text','text':'Describe the visual rendering and boundary backgrounds using the required JSON fields.'})
    messages = [{'role': 'system', 'content': request['instruction']}, {'role':'user','content':content}]
    inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                            return_dict=True, return_tensors='pt').to(device)
    report_progress(request, 'Analyzing the artwork with GPU and system RAM. Analysis may take longer.' if shared else 'Analyzing the artwork medium, palette, texture, lighting and boundaries.')
    with torch.inference_mode():
        output = model.generate(**inputs, max_new_tokens=request['max_new_tokens'], do_sample=False)
    text = processor.batch_decode(output[:, inputs['input_ids'].shape[1]:], skip_special_tokens=True)[0].strip()
    if text.startswith('```'): text = text.split('\n', 1)[1].rsplit('```', 1)[0]
    try: observations = validate_analysis(json.loads(text))
    except (ValueError, TypeError) as exc:
        raise PlannerError('The analyzer did not return usable observations. Retry or use a custom description.') from exc
    Path(request['output']).write_text(json.dumps(observations, ensure_ascii=False), encoding='utf-8')
