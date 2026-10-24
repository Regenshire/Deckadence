"""Compile a generation stage once; the worker executes this exact plan."""
from copy import deepcopy
import math
from .contracts import PlannerError, OPERATIONS, ANALYSIS_FIELDS, digest, image_digest, validate_analysis, validate_plan
from .color_reference import measure_palette

def needs_analysis(dictionary, model, operation, style_mode):
    if style_mode != 'match':
        return False
    recipe = dictionary['planner']['recipes'][model][operation]
    templates = ' '.join(recipe[key] for key in ('prompt','prompt_compact','negative_prompt'))
    return any(token in templates for token in ('{boundary}','{scene}')) or ('{style}' in templates and not recipe.get('match_style'))


def compile_plan(*, dictionary, model, model_revision, hardware, operation, instruction, style_mode,
                 custom_style, analysis, reference, mask, seed, geometry, adapter=None, analyzer=None):
    if operation not in OPERATIONS:
        raise PlannerError('Choose a supported generation operation.')
    try:
        recipe = deepcopy(dictionary['planner']['recipes'][model][operation])
    except KeyError:
        raise PlannerError('This model has no recipe for the selected operation.') from None
    if recipe['status'] == 'unsupported':
        raise PlannerError('This model does not support this operation. Choose another downloaded model.')
    if operation == 'mirror' and geometry.get('theme') == 'normal':
        recipe['parameters'] = recipe.get('normal_parameters', recipe['parameters'])
    if style_mode not in ('match', 'custom', 'none'):
        raise PlannerError('Choose Match artwork, Custom description, or No style guidance.')
    analysis = validate_analysis(analysis) if analysis else dict.fromkeys(ANALYSIS_FIELDS, '')
    if needs_analysis(dictionary, model, operation, style_mode) and not any(analysis[k] for k in ANALYSIS_FIELDS[:6]):
        raise PlannerError('Match artwork requires the local artwork analyzer. Install it in Generative Art AI settings, or enter a custom style description.')
    if style_mode == 'custom' and not custom_style.strip():
        raise PlannerError('Enter a custom artwork style description.')
    style_observations=dict(analysis)
    color_reference=None
    if style_mode=='match' and recipe.get('palette_source')=='reference' and not recipe.get('match_style'):
        if operation == 'mirror':
            from PIL import Image
            color_reference=measure_palette(reference,Image.new('L',reference.size))
        else:
            color_reference=measure_palette(reference,mask)
        if color_reference:
            style_observations['palette']=color_reference['description']
            style_observations['style_summary']='; '.join(style_observations[key] for key in ('medium','palette','texture') if style_observations[key])
    style = custom_style.strip() if style_mode == 'custom' else '; '.join(style_observations[k] for k in ANALYSIS_FIELDS[:6] if style_observations[k]) if style_mode == 'match' else ''
    if style_mode == 'match' and recipe.get('match_style'):
        style = recipe['match_style']
    directions = geometry.get('directions') or ['selected']
    boundary = '; '.join(f'{side}: {analysis[side]}' for side in directions if side in analysis and analysis[side])
    # Replacements and mirror transformations use the full scene description. Outpainting and removal
    # use boundary context so the subject caption does not request new subjects.
    context = dict(style=style, instruction=instruction.strip(), scene=analysis['scene'] if operation in ('replace','mirror') else '',
                   boundary=boundary, directions=', '.join(directions))
    prompt = recipe['prompt'].format_map(context).strip(' .\n')
    negative = recipe['negative_prompt'].format_map(context).strip()
    budget = recipe['cpu_pixel_budget'] if hardware == 'cpu' else recipe['pixel_budget']
    ratio = reference.width / reference.height
    dimensions = [max(64, round(v / 32) * 32) for v in (math.sqrt(budget * ratio), math.sqrt(budget / ratio))]
    if recipe['adapter'] and not adapter:
        raise PlannerError('Install the required outpainting adapter before generating.')
    warnings = ['This recipe is experimental; inspect the result before applying it.'] if recipe['status'] == 'experimental' else []
    if operation == 'outpaint' and (mask.width * mask.height - mask.histogram()[0]) / (mask.width * mask.height) > .6:
        warnings.append('This extension is mostly new pixels. A smaller selected extension is more reliable; inspect subject continuity carefully.')
    if analysis['uncertainty']:
        warnings.append('Analyzer uncertainty: ' + analysis['uncertainty'])
    plan = dict(version=1, operation=operation, model=model, model_revision=model_revision, hardware=hardware,
                recipe_revision=recipe['revision'], recipe_status=recipe['status'], dictionary_hash=digest(dictionary),
                prompt=prompt, negative_prompt=negative, style=style, style_mode=style_mode, analysis=analysis, analyzer=deepcopy(analyzer),
                color_reference=color_reference,
                pipeline=recipe['pipeline'], conditioning=recipe['conditioning'], parameters=recipe['parameters'], dimensions=dimensions,
                prompt_tokens=recipe['prompt_tokens'], seed=seed, adapter=adapter if recipe['adapter'] else None,
                reference_hash=image_digest(reference), mask_hash=image_digest(mask), geometry=deepcopy(geometry), warnings=warnings,
                postprocessing={'color_continuity': 'paired_reference_v1'} if operation == 'outpaint' and style_mode == 'match' else {})
    candidates = [prompt]
    # Keep complete observations: word clipping can destroy their meaning.
    compact = dict(context)
    if style_mode == 'match': compact['style'] = style if recipe.get('match_style') else style_observations['style_summary'] or style
    if operation != 'mirror': compact['scene'] = ''
    candidates.append(recipe['prompt_compact'].format_map(compact).strip(' .\n'))
    compact['boundary'] = analysis['background_summary'] or boundary
    candidates.append(recipe['prompt_compact'].format_map(compact).strip(' .\n'))
    if style_mode == 'match': compact['style'] = style if recipe.get('match_style') else '; '.join(style_observations[k] for k in ('medium','palette') if style_observations[k])
    candidates.append(recipe['prompt_compact'].format_map(compact).strip(' .\n'))
    plan['prompt_candidates'] = list(dict.fromkeys(candidates))
    plan['id'] = digest(plan)
    return validate_plan(plan)

def conditioning_images(plan, reference, mask):
    from PIL import Image
    validate_plan(plan)
    size=tuple(plan['dimensions'])
    if reference.size!=size: reference=reference.resize(size,Image.Resampling.LANCZOS)
    if mask.size!=size: mask=mask.resize(size,Image.Resampling.LANCZOS)
    selected = mask.point(lambda v: 255 if v else 0)
    if plan['conditioning'] == 'green_padding':
        return [Image.composite(Image.new('RGB', reference.size, (0, 255, 0)), reference.convert('RGB'), selected)]
    if plan['conditioning'] == 'reference_and_mask':
        return [reference.convert('RGB'), selected.convert('RGB')]
    return [reference.convert('RGB')]


def finalize_plan(plan, tokenizers):
    """Select a complete recipe variant using exact tokenizer lengths, before review."""
    validate_plan(plan)
    plan = deepcopy(plan)
    candidates = plan.pop('prompt_candidates')
    budget = plan['prompt_tokens']
    counts = lambda text: [len(t(text, truncation=False, add_special_tokens=True, verbose=False)['input_ids']) for t in tokenizers]
    chosen = next(((text, counts(text)) for text in candidates if max(counts(text)) <= budget), None)
    if not chosen:
        raise PlannerError('The instruction or custom style is too long for this model. Shorten it or choose FLUX Klein; user instructions are never silently truncated.')
    plan['prompt'], plan['token_counts'] = chosen
    if plan['prompt'] != candidates[0]: plan['warnings'].append('A concise artwork description was selected to fit this model; your instruction and custom style were preserved.')
    if plan['negative_prompt'] and max(counts(plan['negative_prompt'])) > budget:
        raise PlannerError('The negative prompt exceeds this model token limit. Shorten the recipe in Studio Settings.')
    from importlib.metadata import version, PackageNotFoundError
    plan['runtime_versions'] = {}
    for package in ('torch','transformers','diffusers','peft'):
        try: plan['runtime_versions'][package] = version(package)
        except PackageNotFoundError: pass
    plan.pop('id'); plan['id'] = digest(plan)
    return validate_plan(plan)
