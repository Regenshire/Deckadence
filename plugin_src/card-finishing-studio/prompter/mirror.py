"""Mirror-scene stages using the same planner and executor as artwork edits."""
from io import BytesIO
from PIL import Image, ImageDraw, ImageChops
from .contracts import PlannerError, image_digest

# A protected 480px view plus 50% extra artwork on every side. Even a full
# 24-object batch stays below the scene collection's 24-megapixel limit.
MICRO_CORE_SIZE = 480
MICRO_MARGIN = 50


def micro_geometry():
    pad=MICRO_CORE_SIZE*MICRO_MARGIN//100
    side=MICRO_CORE_SIZE+2*pad
    return (side,side),[pad,pad]


def extend_micro_scene(generate, *, artwork, seed, model, cancel, progress,
                       maintain_style, custom_style='', analysis=None,
                       on_plan=None, on_diagnostics=None):
    """Generate surrounding pixels without changing the micro scene's framing.

    The caller retains its model session across theme and outpaint stages and
    the whole batch. No analyzer is loaded between successive image stages.
    """
    size,padding=micro_geometry()
    core=artwork.convert('RGBA').resize((MICRO_CORE_SIZE,MICRO_CORE_SIZE),Image.Resampling.LANCZOS)
    box=(padding[0],padding[1],size[0]-padding[0],size[1]-padding[1])
    reference,mask=placed_reference(core,size,box)
    # Give outpainting a narrow overlap at the viewport edge, then blend there.
    # A hard rectangular paste makes the retained crop visibly float over it.
    keep=Image.new('L',size);draw=ImageDraw.Draw(keep);overlap=32
    for inset in range(overlap+1):
        draw.rectangle((box[0]+inset,box[1]+inset,box[2]-1-inset,box[3]-1-inset),fill=round(255*inset/overlap))
    mask.putalpha(ImageChops.invert(keep))
    # Full-card colors/edge captions may describe clothes or scenery that the
    # micro-scene prompt just replaced. Continue the newly generated core.
    observed=dict(analysis) if analysis else None
    if observed:
        from .color_reference import measure_palette
        for key in ('scene','left','right','top','bottom','background_summary','lighting','texture'):observed[key]=''
        palette=measure_palette(core,Image.new('L',core.size))
        observed['palette']=palette['description'] if palette else ''
        observed['style_summary']='; '.join(observed[k] for k in ('medium','palette','brushwork','linework') if observed.get(k))
    if cancel.is_set():raise PlannerError('Render cancelled.')
    if on_diagnostics:
        on_diagnostics('margin-reference.png',reference);on_diagnostics('margin-mask.png',mask)
    progress('preparing','Extending surrounding artwork for repositioning and zoom.')
    output=generate(image=png(reference),mask=png(mask),theme='custom',prompt='',user_prompt='',
        seed=(seed+1)%2147483648,model=model,edit_mode='outpaint',cancel=cancel,progress=progress,
        maintain_style=maintain_style and not custom_style,
        planning=dict(style_mode='custom' if custom_style else 'match' if maintain_style else 'none',
            custom_style=custom_style,analysis_image=png(core),analysis=observed,
            geometry=dict(feature='mirror_layers',stage='micro_margin',canvas_size=list(size),
                clean_art_box=list(box),source_hash=image_digest(core),directions=['left','right','top','bottom'])),
        on_plan=on_plan,on_diagnostics=on_diagnostics)
    if cancel.is_set():raise PlannerError('Render cancelled.')
    with Image.open(BytesIO(output)) as result:
        if result.size!=size:raise PlannerError('The micro scene extension returned the wrong image size.')
        result=result.convert('RGBA')
    # Preserve the central subject, feathering only the narrow edge overlap.
    result=Image.composite(reference,result,keep)
    return png(result),padding


def png(image):
    output=BytesIO();image.save(output,format='PNG');return output.getvalue()


def placed_reference(artwork, size, box):
    """Known illustration at its true position; all surrounding pixels unknown."""
    reference=Image.new('RGBA',size,(127,127,127,255))
    artwork=artwork.resize((box[2]-box[0],box[3]-box[1]),Image.Resampling.LANCZOS)
    reference.paste(artwork,box[:2])
    missing=Image.new('L',size,255)
    ImageDraw.Draw(missing).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=0)
    mask=Image.new('RGBA',size,'white');mask.putalpha(missing)
    return reference,mask


def generate_scene(generate, *, artwork, canvas_size, image_box, expanded_size, padding,
                   theme, instruction, maintain_style, seed, model, cancel, progress,
                   on_plan=None, on_diagnostics=None, on_stage=None):
    """Theme a clean crop, fill the card, then extend an optional outer margin.

    Every stage has an explicit model-specific plan. Later stages preserve the
    already generated illustration and observe its colors and rendering.
    """
    def stage(name, operation, reference, mask, analysis, geometry, stage_seed, style_mode, prompt=''):
        if cancel.is_set():raise PlannerError('Render cancelled.')
        if on_stage:on_stage(geometry['stage'])
        def report(key,message):progress(key,name+' · '+message)
        def planned(plan,ref,selected):
            if on_plan:on_plan(name,plan,ref,selected)
        def capture(filename,value):
            if on_diagnostics:on_diagnostics(name.lower().replace(' ','-')+'-'+filename,value)
        report('preparing','Preparing artwork and reference.')
        result=generate(image=png(reference),mask=png(mask),theme=theme if operation=='mirror' else 'custom',
                        prompt=prompt,user_prompt=prompt,seed=stage_seed,cancel=cancel,model=model,
                        edit_mode=operation,maintain_style=style_mode=='match',progress=report,
                        planning=dict(style_mode=style_mode,analysis_image=png(analysis),geometry=geometry),
                        on_plan=planned,on_diagnostics=capture if on_diagnostics else None)
        if cancel.is_set():raise PlannerError('Render cancelled.')
        with Image.open(BytesIO(result)) as output:
            if output.size!=reference.size:raise PlannerError('The mirror generation stage returned the wrong image size.')
            return output.convert('RGBA')

    geometry=dict(feature='mirror_shards',stage='theme',theme=theme,canvas_size=list(artwork.size),
                  source_hash=image_digest(artwork),source_art_box=list(image_box),directions=[])
    themed=stage('Mirror artwork','mirror',artwork,Image.new('RGBA',artwork.size,'white'),artwork,
                 geometry,seed,'match' if maintain_style else 'none',instruction)
    reference,mask=placed_reference(themed,canvas_size,image_box)
    geometry=dict(feature='mirror_shards',stage='canvas',canvas_size=list(canvas_size),clean_art_box=list(image_box),
                  source_hash=image_digest(themed),directions=['left','right','top','bottom'])
    core=stage('Fill canvas','outpaint',reference,mask,themed,geometry,(seed+1)%2147483648,'match')
    if not any(padding):return png(core)
    # Large margins may require a bounded central size to respect saved-image limits.
    box=(padding[0],padding[1],expanded_size[0]-padding[0],expanded_size[1]-padding[1])
    reference,mask=placed_reference(core,expanded_size,box)
    geometry=dict(feature='mirror_shards',stage='margin',canvas_size=list(expanded_size),clean_art_box=list(box),
                  source_hash=image_digest(core),directions=['left','right','top','bottom'])
    expanded=stage('Extend margin','outpaint',reference,mask,core,geometry,(seed+2)%2147483648,'match')
    return png(expanded)
