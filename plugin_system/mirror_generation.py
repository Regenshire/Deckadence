"""Provider-independent, cancellable scene generation; never writes card records."""
import base64
from contextlib import closing
from io import BytesIO
import math
import threading
import time
from uuid import uuid4

from flask import abort, jsonify, request, send_file
from PIL import Image
from . import ai_prompts
from .mirror_shards import THEMES, decode_scene, validate_custom_prompt, expanded_scene_geometry
from .local_mirror import LocalMirrorError, local_mirror, register_local_mirror_routes, MODELS
from .studio_prompter import contracts, diagnostics, mirror, targets, compiler
from .mirror_layers import VARIATIONS, TARGETS, MAX_OBJECTS, text as mirror_text, focus_region

def artwork_box(size):
    width,height=size
    return (math.ceil(width*.08),math.ceil(height*.13),math.floor(width*.92),math.floor(height*.56))


def artwork_inputs(source):
    """Only the existing Fixed Art Box may reach the generative model.

    The user's effect mask is applied when rendering the shards, not used to
    carry untouched card panels back into the generated artwork.
    """
    artwork=source.crop(artwork_box(source.size))
    if min(artwork.size)<64:
        scale=64/min(artwork.size)
        artwork=artwork.resize(tuple(math.ceil(v*scale) for v in artwork.size),Image.Resampling.LANCZOS)
    image=BytesIO();artwork.save(image,format='PNG')
    selection=BytesIO();Image.new('RGBA',artwork.size,'white').save(selection,format='PNG')
    return image.getvalue(),selection.getvalue()


def scene_prompt(theme,custom_prompt='',maintain_style=False):
    if theme not in THEMES:raise ValueError('Choose a mirror theme.')
    prompt=validate_custom_prompt(custom_prompt) if theme=='custom' else ''
    if theme=='custom' and not prompt:raise ValueError('Enter a prompt for the Custom theme.')
    return ai_prompts.resolve('flux_klein','mirror',prompt,theme,maintain_style)['prompt']


def generator_ready(app):
    return callable(app.config.get('MIRROR_IMAGE_GENERATOR')) or bool(local_mirror(app).active())


def register_mirror_generation_routes(app,get_connection,resolve_context,api_errors,decode_mask,card_key):
    jobs={};lock=threading.Lock()
    register_local_mirror_routes(app)

    @app.get('/cards/spot-foil/mirror-generation-status')
    def card_mirror_provider_status():
        response=jsonify(ok=True,ready=generator_ready(app))
        response.cache_control.no_store=True
        return response

    def context_key(card_uuid,face):
        card=card_key(dict(card_uuid=card_uuid,face=face))
        with closing(get_connection()) as conn:
            context=resolve_context(conn,False)
        return (context.scope_id or 'global',*card)

    def prune():
        for key,job in list(jobs.items()):
            # CPU inference may be slow. Retain active work for the bounded
            # two-job queue, but release finished image bytes after 30 minutes.
            retention=14700 if job['state'] in ('queued','running') else 1800
            if time.monotonic()-job.get('finished',job['created'])>retention:
                job['cancel'].set();del jobs[key]

    def execute_micro_scenes(job,generator,source,theme,seed,prompt_details,maintain_style,source_bounds,model,batch,progress,phase):
        from .art_edit import detect_outpaint_bounds
        from contextlib import nullcontext
        target=batch.get('target','face')
        # Focus is an explicit crop of the fixed artwork box shown in the UI.
        # Detection must not shift or replace the selected face/detail.
        bounds=source_bounds if target=='focus' else detect_outpaint_bounds(source,source_bounds,job['cancel'],progress)
        box=tuple(round(v*source.size[i%2]) for i,v in enumerate(bounds))
        artwork=source.crop(box)
        analysis_art=artwork.copy();analysis_art.thumbnail((768,768),Image.Resampling.LANCZOS)
        full_reference=mirror.png(analysis_art)
        provider=local_mirror(app) if not callable(generator) else None
        dictionary=ai_prompts.load(provider.root if provider else None)
        parts=dictionary['models'][model or 'flux_klein']
        variations=parts['mirror_micro_variations'].split('|')
        capture=job.get('diagnostics')
        if capture:
            capture.metadata.update(detected_art_bounds=bounds,source_art_box=list(box),canvas_size=list(source.size))
            capture.add('source-edited.png',source);capture.add('source-artwork.png',artwork)
            capture.add('micro-scenes.json',dict(**batch,shared_theme=theme,shared_prompt=prompt_details,
                maintain_style=maintain_style,seed=seed,model=model,source_bounds=bounds))
        # One session owns all images in the batch: no repeated weight loads.
        with provider.generation_session(job['cancel'],progress) if provider else nullcontext():
            observations=None
            need_style=maintain_style and (compiler.needs_analysis(dictionary,model or 'flux_klein','outpaint','match') or
                any(not obj['style'] and compiler.needs_analysis(dictionary,model or 'flux_klein','micro_scene','match',
                    bool(prompt_details.strip() or obj['prompt'].strip())) for obj in batch['objects']))
            detect_targets=target in ('face','body')
            if provider and (detect_targets or need_style):
                instruction=dictionary['planner']['analysis_prompt']
                if detect_targets:instruction=parts['mirror_target_analysis']
                focus=dictionary['planner']['recipes'][model]['micro_scene'].get('analysis_focus','')
                analysis_dictionary={**dictionary,'planner':{**dictionary['planner'],'analysis_prompt':instruction+'\n'+focus}}
                observations=provider.analyze_artwork(full_reference,provider.generation_selection(model),analysis_dictionary,job['cancel'],progress,target_regions=detect_targets)
            regions=(observations or {}).get('regions',{})
            if target=='focus':crops,fallback=targets.focus_boxes(source.size,box,[obj['focus'] for obj in batch['objects']]),False
            else:crops,fallback=targets.crop_boxes(artwork.size,target,len(batch['objects']),seed,regions)
            target_message=(f'No {target} detected; using different artwork regions.' if fallback else
                            f'Target: {TARGETS[target]}.')
            with lock:job['target_message']=target_message
            if capture:
                capture.add('micro-targets.json',dict(target=target,fallback=fallback,regions=regions,
                    crops={obj['id']:list(box) for obj,box in zip(batch['objects'],crops)}))
                if observations:capture.add('target-analysis.json',observations)
            for index,obj in enumerate(batch['objects']):
                if job['cancel'].is_set():return
                with lock:job.update(completed=index,total=len(batch['objects']),object_id=obj['id'])
                variation=variations[(index+seed)%len(variations)] if batch['variation']=='automatic' else ''
                style=obj['style']
                has_requested_change=bool(prompt_details.strip() or obj['prompt'].strip() or style.strip())
                # Independent seeds already vary prompted scenes. Do not dilute
                # their requested changes with additional automatic directions.
                user=' '.join(p for p in (obj['prompt'],prompt_details,variation if not has_requested_change else '') if p)
                instruction=ai_prompts.render(parts,'mirror_micro_'+batch['variation'],user_prompt=user,style=style)
                object_theme=obj.get('theme','inherit')
                if object_theme=='inherit':object_theme=theme
                reference=artwork.crop(crops[index])
                # Keep native source detail when cropping. Small targets still
                # get a useful generated texture instead of shrinking a 512px
                # model result back to a tiny face-detection thumbnail.
                side=max(512,min(768,max(reference.size)))
                reference=reference.resize((side,side),Image.Resampling.LANCZOS)
                image=mirror.png(reference);mask=mirror.png(Image.new('RGBA',reference.size,'white'))
                if capture:capture.add(obj['id']+'-target-reference.png',reference)
                object_seed=(seed+index*104729)%2147483648
                phase('theme')
                def report(stage,message):progress(stage,f'Mirror {index+1} of {len(batch["objects"])} · '+target_message+' '+message)
                def planned(plan,reference,selected):
                    with lock:
                        if job['cancel'].is_set():return
                        job['plans'].append(dict(stage=obj['id'],plan=plan))
                    if capture:capture.add(obj['id']+'-plan.json',plan)
                if provider:
                    output=provider.generate(image=image,mask=mask,theme=object_theme,prompt=instruction,user_prompt=instruction,
                        seed=object_seed,model=model,edit_mode='micro_scene',maintain_style=maintain_style and not style,
                        cancel=job['cancel'],progress=report,on_plan=planned,
                        planning=dict(style_mode='custom' if style else 'match' if maintain_style else 'none',custom_style=style,
                                      analysis_image=full_reference,analysis=observations,
                                      geometry=dict(feature='mirror_layers',stage='micro_scene',object_id=obj['id'],theme=object_theme,has_requested_change=has_requested_change,target=target,target_fallback=fallback,target_box=list(crops[index]),source_size=list(artwork.size))),
                        on_diagnostics=(lambda name,value:capture.add(obj['id']+'-'+name,value)) if capture else None)
                    if job['cancel'].is_set():return
                    themed=decode_scene(base64.b64encode(output).decode('ascii'))
                    if themed.size!=reference.size:raise contracts.PlannerError('The micro scene returned the wrong image size.')
                    if capture:capture.add(obj['id']+'-themed-core.png',themed)
                    phase('margin')
                    def margin_plan(plan,reference,selected):
                        with lock:
                            if job['cancel'].is_set():return
                            job['plans'].append(dict(stage=obj['id']+'-margin',plan=plan))
                        if capture:capture.add(obj['id']+'-margin-plan.json',plan)
                    output,padding=mirror.extend_micro_scene(provider.generate,artwork=themed,seed=object_seed,
                        model=model,cancel=job['cancel'],progress=report,maintain_style=maintain_style,
                        custom_style=style,analysis=observations,on_plan=margin_plan,
                        on_diagnostics=(lambda name,value:capture.add(obj['id']+'-margin-'+name,value)) if capture else None)
                else:
                    core=reference.resize((mirror.MICRO_CORE_SIZE,mirror.MICRO_CORE_SIZE),Image.Resampling.LANCZOS)
                    output=generator(image=mirror.png(core),mask=mirror.png(Image.new('RGBA',core.size,'white')),
                                     theme=object_theme,prompt=instruction,seed=object_seed,cancel=job['cancel'],
                                     canvas_size=core.size,image_box=(0,0,*core.size),outpaint_margin=mirror.MICRO_MARGIN)
                    _,padding=mirror.micro_geometry()
                if job['cancel'].is_set():return
                encoded=base64.b64encode(output).decode('ascii');decoded=decode_scene(encoded)
                if decoded.size!=mirror.micro_geometry()[0]:raise contracts.PlannerError('The generator did not return the expanded micro scene.')
                with lock:
                    if job['cancel'].is_set():return
                    job.setdefault('scenes',{})[obj['id']]=dict(image=encoded,padding=padding,seed=object_seed)
                    job['completed']=index+1
                if capture:capture.add(obj['id']+'-result.png',decoded)
        with lock:
            if not job['cancel'].is_set():job.update(state='complete',stage='complete',phase='review',message='Micro scenes ready. '+target_message+' Review each mirror.',finished=time.monotonic())

    def execute(job,generator,source,theme,seed,custom_prompt,prompt_details,margin,maintain_style,source_bounds,model,batch=None):
        def progress(stage,message):
            with lock:
                if not job['cancel'].is_set():job.update(stage=stage,message=message)
        def phase(value):
            with lock:
                if not job['cancel'].is_set():job['phase']=value
        try:
            with lock:
                if job['cancel'].is_set():return
                job['state']='running'
            canvas_size=source.size
            if batch:
                execute_micro_scenes(job,generator,source,theme,seed,' '.join(p for p in (custom_prompt if theme=='custom' else '',prompt_details) if p),
                                     maintain_style,source_bounds,model,batch,progress,phase)
                return
            expanded_size,padding=expanded_scene_geometry(canvas_size,margin)
            if callable(generator):
                # Explicit provider adapters own their rendering protocol.
                image_box=artwork_box(canvas_size);image,mask=artwork_inputs(source)
                phase('theme')
                output=generator(image=image,mask=mask,theme=theme,prompt=' '.join(part for part in (scene_prompt(theme,custom_prompt,maintain_style),prompt_details) if part),seed=seed,cancel=job['cancel'],
                                 canvas_size=canvas_size,image_box=image_box,outpaint_margin=margin)
            else:
                from .art_edit import detect_outpaint_bounds
                bounds=detect_outpaint_bounds(source,source_bounds,job['cancel'],progress)
                image_box=tuple(round(v*source.size[i%2]) for i,v in enumerate(bounds))
                artwork=source.crop(image_box)
                capture=job.get('diagnostics')
                if capture:
                    capture.metadata.update(detected_art_bounds=bounds,source_art_box=list(image_box),canvas_size=list(canvas_size),expanded_size=list(expanded_size))
                    capture.add('source-edited.png',source);capture.add('source-artwork.png',artwork)
                def planned(name,plan,reference,mask):
                    with lock:
                        if not job['cancel'].is_set():job['plans'].append(dict(stage=name,plan=plan))
                    if capture:
                        prefix=name.lower().replace(' ','-')+'-'
                        capture.add(prefix+'plan.json',plan);capture.add(prefix+'reference-prepared.png',reference);capture.add(prefix+'generation-mask.png',mask)
                provider=local_mirror(app)
                with provider.generation_session(job['cancel'],progress):
                    output=mirror.generate_scene(provider.generate,artwork=artwork,canvas_size=canvas_size,image_box=image_box,
                        expanded_size=expanded_size,padding=padding,theme=theme,instruction=' '.join(part for part in (custom_prompt if theme=='custom' else '',prompt_details) if part),maintain_style=maintain_style,
                        seed=seed,model=model,cancel=job['cancel'],progress=progress,on_plan=planned,on_diagnostics=capture.add if capture else None,on_stage=phase)
                if capture:capture.add('result-scene.png',output)
            if job['cancel'].is_set():return
            if not isinstance(output,bytes) or len(output)>15_000_000:
                raise ValueError('Generator returned an invalid scene.')
            encoded=base64.b64encode(output).decode('ascii')
            if decode_scene(encoded).size!=expanded_size:raise ValueError('Generator did not return the full expanded canvas.')
            with lock:
                if not job['cancel'].is_set():job.update(state='complete',stage='complete',phase='review',message='Mirror scene ready. Review the generated artwork.',scene=encoded,scene_padding=padding,scene_margin=margin,
                                                       scene_custom_prompt=custom_prompt if theme=='custom' else '',
                                                       scene_prompt_details=prompt_details,
                                                       scene_maintain_style=maintain_style,finished=time.monotonic())
        except Exception as exc:
            app.logger.warning('Mirror scene generation failed (%s)',type(exc).__name__)
            with lock:
                if not job['cancel'].is_set():job.update(state='failed',stage='failed',finished=time.monotonic(),message=(str(exc) if isinstance(exc,(LocalMirrorError,contracts.PlannerError)) else 'Mirror generation failed. Your previous layer is unchanged.'))

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-generation',methods=['POST'])
    @api_errors
    def card_mirror_generate(card_uuid,face):
        owner=context_key(card_uuid,face)
        if not generator_ready(app):
            return jsonify(ok=False,message='Install and enable a complete generation package in Card Finishing Studio settings.'),503
        if request.content_length and request.content_length>30_100_000:
            return jsonify(ok=False,message='The scene or selection is too large.'),413
        payload=request.get_json(silent=True)
        required={'image','mask_data','theme','seed'}
        if not isinstance(payload,dict) or not required<=set(payload) or set(payload)-required-{'custom_prompt','prompt_details','outpaint_margin','maintain_style','source_bounds','micro_scenes'}:
            raise ValueError('Provide the source scene, selection and theme.')
        theme=payload['theme'];seed=payload['seed']
        if not isinstance(theme,str) or theme not in THEMES or type(seed) is not int or not 0<=seed<=2147483647:
            raise ValueError('Choose a valid theme and pattern.')
        custom_prompt=validate_custom_prompt(payload.get('custom_prompt',''))
        prompt_details=validate_custom_prompt(payload.get('prompt_details',''))
        batch=payload.get('micro_scenes')
        if batch is not None:
            if not isinstance(batch,dict) or set(batch)-{'target'}!={'variation','objects'} or not isinstance(batch['variation'],str) or batch['variation'] not in VARIATIONS or not isinstance(batch['objects'],list) or not 1<=len(batch['objects'])<=MAX_OBJECTS:
                raise ValueError('Choose valid micro-scene generation settings.')
            batch.setdefault('target','face')
            if not isinstance(batch['target'],str) or batch['target'] not in TARGETS:raise ValueError('Choose Face, Body, Random, or Focus.')
            ids=set()
            for obj in batch['objects']:
                if not isinstance(obj,dict) or set(obj)-{'theme','focus'}!={'id','prompt','style'}:raise ValueError('Choose valid per-mirror prompts.')
                obj.setdefault('theme','inherit')
                if 'focus' in obj:obj['focus']=focus_region(obj['focus'])
                if batch['target']=='focus' and not obj.get('focus'):raise ValueError('Choose a focus area for every micro scene being generated.')
                if not isinstance(obj['theme'],str) or obj['theme'] not in {'inherit',*THEMES}:raise ValueError('Choose a valid per-mirror theme.')
                identifier=mirror_text(obj['id'],'Mirror identifier',40)
                if not identifier or identifier in ids or not all(c.isascii() and (c.isalnum() or c in '_-') for c in identifier):raise ValueError('Mirror identifiers must be unique.')
                ids.add(identifier)
                obj['id']=identifier
                obj['prompt']=mirror_text(obj['prompt'],'Object prompt');obj['style']=mirror_text(obj['style'],'Object style',500)
                if obj['theme']=='custom' and not (obj['prompt'] or obj['style'] or custom_prompt or prompt_details):raise ValueError('Enter a prompt or style for each Custom micro-scene theme.')
        if theme=='custom' and not custom_prompt and not (batch and all(obj['theme']!='inherit' or obj['prompt'] or obj['style'] or prompt_details for obj in batch['objects'])):
            raise ValueError('Enter a shared prompt, or a prompt/style for each mirror being generated.')
        margin=payload.get('outpaint_margin',30)
        if type(margin) is not int or not 0<=margin<=100:raise ValueError('Choose an outpainting margin from 0 to 100%.')
        maintain_style=payload.get('maintain_style',True)
        if type(maintain_style) is not bool:raise ValueError('Choose whether to maintain the source art style.')
        source_bounds=payload.get('source_bounds',[.06,.12,.94,.56])
        if (not isinstance(source_bounds,list) or len(source_bounds)!=4 or
                any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in source_bounds) or
                source_bounds[2]-source_bounds[0]<.01 or source_bounds[3]-source_bounds[1]<.01):
            raise ValueError('Choose a valid artwork box.')
        if not isinstance(payload['image'],str) or len(payload['image'])>20_000_000:
            raise ValueError('The source scene is too large.')
        source=decode_scene(payload['image']);mask=decode_mask(payload['mask_data'])
        if batch and batch['target']=='focus':
            box=tuple(round(v*source.size[i%2]) for i,v in enumerate(source_bounds))
            targets.focus_boxes(source.size,box,[obj['focus'] for obj in batch['objects']])
        with Image.open(BytesIO(mask)) as selection:
            if not selection.getchannel('A').getbbox():
                full=Image.new('RGBA',selection.size,'white');output=BytesIO();full.save(output,format='PNG');mask=output.getvalue()
        generator=app.config.get('MIRROR_IMAGE_GENERATOR')
        model=None
        if not callable(generator):
            model=local_mirror(app).generation_selection()['model']
            if model=='instruct_pix2pix':raise ValueError('Choose a generation package with outpainting support for Mirror scenes.')
        with lock:
            prune()
            if sum(j['state'] in ('queued','running') for j in jobs.values())>=2:
                return jsonify(ok=False,message='Two mirror scenes are already rendering. Try again when one finishes.'),429
            # Bound retained generated images as well as concurrent work.
            finished=[key for key,j in jobs.items() if j['state'] not in ('queued','running')]
            for key in finished[:-3]:del jobs[key]
            key=uuid4().hex
            job={'owner':owner,'state':'queued','stage':'queued','phase':'prepare','message':'Preparing the mirror scene.','plans':[],
                 'model_label':MODELS[model]['name']+' · on this PC' if model else 'Configured image generator',
                 'created':time.monotonic(),'cancel':threading.Event(),'total':len(batch['objects']) if batch else 1,'completed':0}
            if diagnostics.enabled() and not callable(generator):
                job['diagnostics']=diagnostics.Capture(dict(feature='mirror_layers' if batch else 'mirror_shards',operation='micro_scene' if batch else 'mirror',seed=seed,theme=theme,
                    instruction=custom_prompt,prompt_details=prompt_details,maintain_style=maintain_style,requested_model=model,configured_art_bounds=source_bounds))
            jobs[key]=job
        threading.Thread(target=execute,args=(job,generator,source,theme,seed,custom_prompt,prompt_details,margin,maintain_style,source_bounds,model,batch),daemon=True).start()
        return jsonify(ok=True,job=key,state='queued'),202

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-generation/<job_id>',methods=['GET','DELETE'])
    @api_errors
    def card_mirror_generation_status(card_uuid,face,job_id):
        owner=context_key(card_uuid,face)
        with lock:
            prune();job=jobs.get(job_id)
            if job is None or job['owner']!=owner:raise LookupError('This render is no longer available.')
            if request.method=='DELETE':
                job['cancel'].set();job.update(state='cancelled',finished=time.monotonic(),message='Generation cancelled. Completed scenes are available to review and save.')
            # Poll only new images; completed results survive failure/cancellation
            # for the same bounded retention period as successful jobs.
            known = set(request.args.get('known_scenes', '').split(','))
            scenes = {key: value for key, value in job.get('scenes', {}).items() if key not in known}
            response=jsonify(ok=True,state=job['state'],scene=job.get('scene'),message=job.get('message'),source_region='fixed_art_box',
                             stage=job['stage'],phase=job['phase'],model_label=job['model_label'],elapsed_seconds=round(job.get('finished',time.monotonic())-job['created'],1),
                             diagnostics_available=bool(job.get('diagnostics')) and diagnostics.enabled(),scene_prompt_details=job.get('scene_prompt_details'),
                             scenes=scenes,target_message=job.get('target_message',''),completed=job.get('completed',0),total=job.get('total',1),object_id=job.get('object_id'),
                             scene_padding=job.get('scene_padding'),scene_margin=job.get('scene_margin'),scene_custom_prompt=job.get('scene_custom_prompt'),
                             scene_maintain_style=job.get('scene_maintain_style'))
        response.cache_control.no_store=True
        return response

    @app.get('/cards/spot-foil/<card_uuid>/<face>/mirror-generation/<job_id>/diagnostics')
    @api_errors
    def card_mirror_generation_diagnostics(card_uuid,face,job_id):
        if not diagnostics.enabled():abort(404)
        owner=context_key(card_uuid,face)
        with lock:
            prune();job=jobs.get(job_id)
            if not job or job['owner']!=owner:raise LookupError('This render is no longer available. Generate a new scene to export diagnostics.')
            capture=job.get('diagnostics')
            if job['state']!='complete' or not capture:
                return jsonify(ok=False,message='Diagnostics require a completed scene from this development session.'),409
        data=capture.archive();filename='mirror-generation-diagnostics-'+job_id+'.zip'
        folder=diagnostics.development_root()/'exports';folder.mkdir(parents=True,exist_ok=True)
        (folder/filename).write_bytes(data)
        response=send_file(BytesIO(data),mimetype='application/zip',as_attachment=True,download_name=filename)
        response.cache_control.no_store=True
        return response
