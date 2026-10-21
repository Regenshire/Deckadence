"""Provider-independent, cancellable scene generation; never writes card records."""
import base64
from contextlib import closing
from io import BytesIO
import threading
import time
from uuid import uuid4

from flask import jsonify, request
from .mirror_shards import THEMES, decode_scene
from .local_mirror import LocalMirrorError, local_mirror, register_local_mirror_routes

THEME_PROMPTS={
 'dark':'A dark mirror counterpart: brooding shadowed atmosphere, midnight materials, cool luminous accents and a dramatic but readable face.',
 'spooky':'A haunted spectral counterpart: eerie mist, subtle ghostly light, unsettling atmosphere and weathered details. No gore.',
 'normal':'A natural alternate reflection of the same scene, retaining its original visual style, identity and mood, with subtle new reflected details.',
 'modern':'A contemporary-world counterpart: reinterpret clothing, objects and environment with modern materials and design, retaining the subject and pose.',
 'echo':'An ethereal echo counterpart: faint displaced afterimages and repeated light contours around the same main subject, with a clear primary face.',
 'angelic':'An angelic counterpart: luminous ivory and gold, graceful celestial details, soft feathered or halo motifs appropriate to the subject, radiant atmosphere.',
 'demonic':'A demonic counterpart: obsidian and crimson, infernal armor or organic details, sinister eyes and horn or wing motifs appropriate to the subject. No gore.',
}

# Compact models use short editing instructions. Keep these in the mirror
# adapter; the reusable local generator does not know about mirror themes.
THEME_EDITS={
 'dark':'Turn the subject into a dark fantasy counterpart with obsidian clothing, cool luminous accents and a brooding midnight setting. Preserve the face, pose and composition.',
 'spooky':'Turn the subject into an eerie ghostly counterpart with spectral eyes, weathered clothing and haunted mist. Preserve the face, pose and composition. No gore.',
 'normal':'Redraw the same subject with subtle new clothing details and natural reflected lighting, preserving the original mood, face, pose and composition.',
 'modern':'Dress the subject in contemporary streetwear and replace the setting with a modern city. Preserve the face, pose and composition.',
 'echo':'Turn the subject into an ethereal luminous echo with faint displaced afterimages and repeated glowing contours. Preserve the primary face, pose and composition.',
 'angelic':'Turn the subject into an angel with white feathered wings, a luminous halo and ivory and gold clothing. Preserve the face, pose and composition.',
 'demonic':'Turn the subject into a demon with curved horns, crimson eyes and black infernal armor under sinister red light. Preserve the face, pose and composition. No gore.',
}


def scene_prompt(theme):
    if theme not in THEMES:raise ValueError('Choose a mirror theme.')
    return (THEME_PROMPTS[theme]+' Create a new AI-drawn alternate version of the supplied source scene in the selected mask area. '
            'The mask alpha marks the editable region. Preserve the same camera, composition, subject identity, '
            'pose and major silhouette so the new scene aligns with the original image. '
            'Keep all lettering, symbols, card frame and unmasked pixels unchanged. '
            'Return one continuous full-size scene, with the same dimensions and registration as the source. '
            'Do not draw mirrors, glass, shards, borders or a collage: the application will split this scene into its glass template afterwards.')


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

    def execute(job,generator,source,mask,theme,seed):
        try:
            with lock:
                if job['cancel'].is_set():return
                job['state']='running'
            # Adapter must respect cancellation and bound its own model/network
            # calls. Never access card data or settings from this worker.
            output=generator(image=source,mask=mask,theme=theme,prompt=scene_prompt(theme),seed=seed,cancel=job['cancel'])
            if job['cancel'].is_set():return
            if not isinstance(output,bytes) or len(output)>15_000_000:
                raise ValueError('Generator returned an invalid scene.')
            encoded=base64.b64encode(output).decode('ascii')
            decode_scene(encoded)
            with lock:
                if not job['cancel'].is_set():job.update(state='complete',scene=encoded,finished=time.monotonic())
        except Exception as exc:
            app.logger.warning('Mirror scene generation failed (%s)',type(exc).__name__)
            with lock:
                if not job['cancel'].is_set():job.update(state='failed',finished=time.monotonic(),message=(str(exc) if isinstance(exc,LocalMirrorError) else 'Mirror generation failed. Your previous layer is unchanged.'))

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-generation',methods=['POST'])
    @api_errors
    def card_mirror_generate(card_uuid,face):
        owner=context_key(card_uuid,face)
        if not generator_ready(app):
            return jsonify(ok=False,message='Download and enable local AI in Card Finishing Studio settings.'),503
        if request.content_length and request.content_length>30_100_000:
            return jsonify(ok=False,message='The scene or selection is too large.'),413
        payload=request.get_json(silent=True)
        if not isinstance(payload,dict) or set(payload)!={'image','mask_data','theme','seed'}:
            raise ValueError('Provide the source scene, selection and theme.')
        theme=payload['theme'];seed=payload['seed']
        if not isinstance(theme,str) or theme not in THEMES or type(seed) is not int or not 0<=seed<=2147483647:
            raise ValueError('Choose a valid theme and pattern.')
        if not isinstance(payload['image'],str) or len(payload['image'])>20_000_000:
            raise ValueError('The source scene is too large.')
        source=decode_scene(payload['image']);mask=decode_mask(payload['mask_data'])
        from PIL import Image
        with Image.open(BytesIO(mask)) as selection:
            if not selection.getchannel('A').getbbox():raise ValueError('Select an area for the mirror scene first.')
        output=BytesIO();source.save(output,format='PNG');source=output.getvalue()
        with lock:
            prune()
            if sum(j['state'] in ('queued','running') for j in jobs.values())>=2:
                return jsonify(ok=False,message='Two mirror scenes are already rendering. Try again when one finishes.'),429
            # Bound retained generated images as well as concurrent work.
            finished=[key for key,j in jobs.items() if j['state'] not in ('queued','running')]
            for key in finished[:-3]:del jobs[key]
            key=uuid4().hex
            job={'owner':owner,'state':'queued','created':time.monotonic(),'cancel':threading.Event()}
            jobs[key]=job
        generator=app.config.get('MIRROR_IMAGE_GENERATOR')
        if not callable(generator):
            def generator(**kwargs):
                return local_mirror(app).generate(**kwargs, compact_prompt=THEME_EDITS[kwargs['theme']])
        threading.Thread(target=execute,args=(job,generator,source,mask,theme,seed),daemon=True).start()
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
            response=jsonify(ok=True,state=job['state'],scene=job.get('scene'),message=job.get('message'))
        response.cache_control.no_store=True
        return response
