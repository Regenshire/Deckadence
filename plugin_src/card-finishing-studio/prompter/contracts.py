"""JSON contracts shared by the planner and execution worker."""
import hashlib
import json
import math

class PlannerError(ValueError):
    pass

EDIT_OPERATIONS = ('replace', 'remove_object', 'outpaint')
OPERATIONS = (*EDIT_OPERATIONS, 'mirror', 'micro_scene')
PIPELINES = {
    'flux_klein': ('Flux2KleinPipeline', 'Flux2KleinInpaintPipeline'),
    'sdxl': ('StableDiffusionXLInpaintPipeline', 'StableDiffusionXLImg2ImgPipeline'),
    'sd15': ('StableDiffusionInpaintPipeline', 'StableDiffusionImg2ImgPipeline'),
    'sd_turbo': ('StableDiffusionInpaintPipeline', 'StableDiffusionImg2ImgPipeline'),
    'instruct_pix2pix': ('StableDiffusionInstructPix2PixPipeline',),
}
ANALYSIS_FIELDS = ('medium', 'palette', 'brushwork', 'texture', 'linework', 'lighting', 'scene', 'left', 'right', 'top', 'bottom', 'uncertainty', 'style_summary', 'background_summary')

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def image_digest(image):
    return hashlib.sha256(str((image.size, image.mode)).encode() + image.tobytes()).hexdigest()

def validate_analysis(value):
    if not isinstance(value, dict) or set(value)-{'regions'} != set(ANALYSIS_FIELDS):
        raise PlannerError('Artwork analysis returned incomplete observations. Retry analysis or enter a custom description.')
    if any(not isinstance(value[k], str) or len(value[k]) > 1500 for k in ANALYSIS_FIELDS):
        raise PlannerError('Artwork analysis returned invalid observations.')
    result = {k: value[k].strip() for k in ANALYSIS_FIELDS}
    if 'regions' in value:
        from .targets import validate_regions
        try: result['regions'] = validate_regions(value['regions'])
        except ValueError as exc: raise PlannerError(str(exc)) from None
    return result

def validate_plan(plan):
    if not isinstance(plan, dict) or plan.get('version') != 1 or plan.get('operation') not in OPERATIONS:
        raise PlannerError('Invalid generation plan.')
    if plan.get('id') != digest({k: v for k, v in plan.items() if k != 'id'}):
        raise PlannerError('The generation plan changed after preparation. Prepare it again.')
    if plan.get('pipeline') not in PIPELINES.get(plan.get('model'), ()):
        raise PlannerError('The generation plan does not name a supported pipeline for this model. Prepare it again.')
    if type(plan.get('seed')) is not int or not 0 <= plan['seed'] < 2147483648:
        raise PlannerError('Invalid generation seed.')
    if not isinstance(plan.get('prompt'), str) or not plan['prompt'].strip():
        raise PlannerError('The generation prompt is empty.')
    if not isinstance(plan.get('parameters'), dict) or any(type(v) not in (int, float) or not math.isfinite(v) for v in plan['parameters'].values()):
        raise PlannerError('Invalid generation parameters.')
    dimensions = plan.get('dimensions')
    if not isinstance(dimensions, list) or len(dimensions) != 2 or any(type(v) is not int or not 64 <= v <= 8192 or v % 32 for v in dimensions):
        raise PlannerError('Invalid generation dimensions.')
    if plan.get('hardware') not in ('nvidia', 'amd', 'mps', 'cpu'):
        raise PlannerError('Invalid generation processor.')
    return plan
