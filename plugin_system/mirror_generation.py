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
from .studio_prompter import contracts, diagnostics, mirror

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

    def execute(job,generator,source,theme,seed,custom_prompt,prompt_details,margin,maintain_style,source_bounds,model):
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
                output=mirror.generate_scene(local_mirror(app).generate,artwork=artwork,canvas_size=canvas_size,image_box=image_box,
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
        if not isinstance(payload,dict) or not required<=set(payload) or set(payload)-required-{'custom_prompt','prompt_details','outpaint_margin','maintain_style','source_bounds'}:
            raise ValueError('Provide the source scene, selection and theme.')
        theme=payload['theme'];seed=payload['seed']
        if not isinstance(theme,str) or theme not in THEMES or type(seed) is not int or not 0<=seed<=2147483647:
            raise ValueError('Choose a valid theme and pattern.')
        custom_prompt=validate_custom_prompt(payload.get('custom_prompt',''))
        prompt_details=validate_custom_prompt(payload.get('prompt_details',''))
        if theme=='custom' and not custom_prompt:raise ValueError('Enter a prompt for the Custom theme.')
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
        with Image.open(BytesIO(mask)) as selection:
            if not selection.getchannel('A').getbbox():raise ValueError('Select an area for the mirror scene first.')
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
                 'created':time.monotonic(),'cancel':threading.Event()}
            if diagnostics.enabled() and not callable(generator):
                job['diagnostics']=diagnostics.Capture(dict(feature='mirror_shards',operation='mirror',seed=seed,theme=theme,
                    instruction=custom_prompt,prompt_details=prompt_details,maintain_style=maintain_style,requested_model=model,configured_art_bounds=source_bounds))
            jobs[key]=job
        threading.Thread(target=execute,args=(job,generator,source,theme,seed,custom_prompt,prompt_details,margin,maintain_style,source_bounds,model),daemon=True).start()
        return jsonify(ok=True,job=key,state='queued'),202

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-generation/<job_id>',methods=['GET','DELETE'])
    @api_errors
    def card_mirror_generation_status(card_uuid,face,job_id):
        owner=context_key(card_uuid,face)
        with lock:
            prune();job=jobs.get(job_id)
            if job is None or job['owner']!=owner:raise LookupError('This render is no longer available.')
            if request.method=='DELETE':
                job['cancel'].set();job.update(state='cancelled',finished=time.monotonic());job.pop('scene',None)
                job.pop('diagnostics',None)
            response=jsonify(ok=True,state=job['state'],scene=job.get('scene'),message=job.get('message'),source_region='fixed_art_box',
                             stage=job['stage'],phase=job['phase'],model_label=job['model_label'],elapsed_seconds=round(job.get('finished',time.monotonic())-job['created'],1),
                             diagnostics_available=bool(job.get('diagnostics')) and diagnostics.enabled(),scene_prompt_details=job.get('scene_prompt_details'),
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
