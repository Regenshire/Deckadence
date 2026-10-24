"""Shipped recipes plus explicit user overrides; no inference dependencies."""
from copy import deepcopy
import json
import math
from pathlib import Path
import string
import threading
from .contracts import PlannerError, OPERATIONS

DEFAULT_PATH = Path(__file__).resolve().parents[1] / 'generation_prompts.json'
LOCK = threading.RLock()
TOKENS = {'user_prompt', 'style', 'theme_direction', 'theme_style', 'zoom', 'subject_percent'}
EDIT_TOKENS = {'style', 'instruction', 'scene', 'boundary', 'directions'}

def defaults():
    return json.loads(DEFAULT_PATH.read_text(encoding='utf-8'))

def template(text, tokens):
    if not isinstance(text, str) or len(text) > 20000:
        raise PlannerError('Prompt pieces must be text of at most 20,000 characters.')
    try:
        for _, field, spec, conversion in string.Formatter().parse(text):
            if field is not None and (field not in tokens or spec or conversion):
                raise ValueError('Use only the documented simple placeholders.')
    except ValueError as exc:
        raise PlannerError(str(exc)) from None

def validate(value):
    base = defaults()
    if not isinstance(value, dict) or set(value) != set(base) or value.get('version') != 2:
        raise PlannerError('Keep the AI Prompt Dictionary version, help, models, and planner sections.')
    if not isinstance(value['models'], dict) or set(value['models']) != set(base['models']):
        raise PlannerError('Keep each supported model in the dictionary.')
    for model, parts in value['models'].items():
        if not isinstance(parts, dict) or set(parts) != set(base['models'][model]):
            raise PlannerError('Keep all prompt keys for ' + model + '.')
        for text in parts.values(): template(text, TOKENS)
    planner = value['planner']
    if not isinstance(planner, dict) or set(planner) != {'revision', 'analysis_prompt', 'recipes'} or type(planner['revision']) is not int or planner['revision'] < 1:
        raise PlannerError('Keep the planner revision, analysis_prompt and recipes.')
    # Analyzer instructions are literal text, so JSON examples need no escaping.
    if not isinstance(planner['analysis_prompt'], str) or not planner['analysis_prompt'].strip() or len(planner['analysis_prompt']) > 20000:
        raise PlannerError('Artwork analysis instructions must be text of at most 20,000 characters.')
    if not isinstance(planner['recipes'], dict) or set(planner['recipes']) != set(base['models']):
        raise PlannerError('Keep recipes for every supported model.')
    for model, operations in planner['recipes'].items():
        if not isinstance(operations, dict) or set(operations) != set(OPERATIONS): raise PlannerError('Keep all Edit and Mirror operations.')
        for op, recipe in operations.items():
            expected = base['planner']['recipes'][model][op]
            if not isinstance(recipe, dict) or set(recipe) != set(expected): raise PlannerError('Keep the recipe fields for ' + model + '/' + op + '.')
            # Image protocol and adapter identity are implementation contracts,
            # not arbitrary executable settings supplied by a dictionary.
            if any(recipe[key] != expected[key] for key in ('pipeline','conditioning','adapter')):
                raise PlannerError('Keep the supported pipeline, conditioning and adapter for this recipe.')
            if recipe['status'] not in ('experimental', 'validated', 'unsupported') or (expected['status'] == 'unsupported' and recipe['status'] != 'unsupported'):
                raise PlannerError('Choose a supported recipe status.')
            template(recipe['prompt'], EDIT_TOKENS); template(recipe['prompt_compact'], EDIT_TOKENS); template(recipe['negative_prompt'], EDIT_TOKENS)
            if 'match_style' in recipe:
                template(recipe['match_style'], set())
                if not recipe['match_style'].strip(): raise PlannerError('Reference style guidance cannot be empty.')
            if 'analysis_focus' in recipe:
                if not isinstance(recipe['analysis_focus'],str) or len(recipe['analysis_focus'])>4000:
                    raise PlannerError('Artwork analysis focus must be text of at most 4,000 characters.')
            if recipe.get('palette_source','analysis') not in ('analysis','reference'):
                raise PlannerError('Choose analysis or reference for palette_source.')
            if not recipe['prompt'].strip(): raise PlannerError('A recipe prompt cannot be empty.')
            if model in ('flux_klein', 'sd_turbo') and recipe['negative_prompt']: raise PlannerError('This recipe does not use negative prompts.')
            for key, low, high in [('revision', 1, 100000), ('pixel_budget', 65536, 4194304), ('cpu_pixel_budget', 65536, 4194304), ('prompt_tokens', 32, 512 if model == 'flux_klein' else 77)]:
                if type(recipe[key]) is not int or not low <= recipe[key] <= high: raise PlannerError('Invalid recipe ' + key + '.')
            if not isinstance(recipe['parameters'], dict) or set(recipe['parameters']) != set(expected['parameters']): raise PlannerError('Keep the supported model parameters.')
            limits = {'num_inference_steps': (1, 100), 'guidance_scale': (0, 20), 'image_guidance_scale': (0, 5), 'strength': (.01, 1)}
            for key, number in recipe['parameters'].items():
                if type(number) not in (int, float) or not math.isfinite(number) or not limits[key][0] <= number <= limits[key][1]: raise PlannerError('Invalid ' + key + '.')
                if key == 'num_inference_steps' and type(number) is not int: raise PlannerError('Steps must be a whole number.')
            if 'strength' in recipe['parameters'] and int(recipe['parameters']['strength']*recipe['parameters']['num_inference_steps'])<1:
                raise PlannerError('Strength and inference steps must allow at least one generation step.')
            if 'normal_parameters' in recipe:
                parameters=recipe['normal_parameters']
                if not isinstance(parameters,dict) or set(parameters)!=set(recipe['parameters']):
                    raise PlannerError('Keep the supported Normal theme parameters.')
                for key,number in parameters.items():
                    if type(number) not in (int,float) or not math.isfinite(number) or not limits[key][0]<=number<=limits[key][1]:
                        raise PlannerError('Invalid Normal theme '+key+'.')
                    if key=='num_inference_steps' and type(number) is not int:
                        raise PlannerError('Normal theme steps must be a whole number.')
                if 'strength' in parameters and int(parameters['strength']*parameters['num_inference_steps'])<1:
                    raise PlannerError('Normal theme must allow at least one generation step.')
    if len(json.dumps(value).encode()) > 512000: raise PlannerError('Dictionary must be smaller than 512 KB.')
    return value

def merge(base, overrides):
    result = deepcopy(base)
    for key, value in overrides.items():
        if key not in base: raise PlannerError('Unknown override: ' + key)
        if isinstance(base[key], dict):
            if not isinstance(value, dict): raise PlannerError('Invalid override: ' + key)
            result[key] = merge(base[key], value)
        else: result[key] = value
    return result

def difference(value, base):
    result = {}
    for key, item in value.items():
        if isinstance(item, dict) and isinstance(base.get(key), dict):
            nested = difference(item, base[key])
            if nested: result[key] = nested
        elif item != base.get(key): result[key] = item
    return result

def load(path):
    with LOCK:
        try:
            if not path.exists(): return validate(defaults())
            saved = json.loads(path.read_text(encoding='utf-8-sig'))
            if set(saved) != {'version', 'overrides'} or saved['version'] != 2 or not isinstance(saved['overrides'], dict):
                raise PlannerError('Invalid prompt overrides file. Import the effective dictionary through Studio Settings.')
            return validate(merge(defaults(), saved['overrides']))
        except (OSError, ValueError, TypeError) as exc:
            raise PlannerError('Could not load AI Prompt Dictionary: ' + str(exc)) from None

def save(value, path):
    validate(value)
    with LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'version': 2, 'overrides': difference(value, defaults())}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(path)
    return path
