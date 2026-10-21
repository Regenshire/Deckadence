"""Provider-independent, cancellable scene generation; never writes card records."""
import base64
from contextlib import closing
from io import BytesIO
import math
import threading
import time
from uuid import uuid4

from flask import jsonify, request
from PIL import Image
from .mirror_shards import THEMES, decode_scene, validate_custom_prompt, expanded_scene_geometry
from .local_mirror import LocalMirrorError, local_mirror, register_local_mirror_routes

THEME_PROMPTS={
 'dark':'Reinterpret the same subjects in a dark fantasy setting: brooding atmosphere, midnight materials, cool luminous accents and readable faces.',
 'spooky':'A haunted spectral counterpart: eerie mist, subtle ghostly light, unsettling atmosphere and weathered details. No gore.',
 'normal':'A natural alternate version of the same scene, retaining its original visual style, identities and mood, with subtle new details.',
 'modern':'A contemporary-world counterpart: reinterpret clothing, objects and environment with modern materials and design, retaining the subject and pose.',
 'echo':'An ethereal counterpart: luminous light trails around the original subjects and soft atmospheric echoes. Keep each face and body singular.',
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
 'echo':'Turn the subject into an ethereal luminous counterpart with soft light trails and glowing contours. Preserve the same face and pose; do not duplicate the figure.',
 'angelic':'Turn the subject into an angel with white feathered wings, a luminous halo and ivory and gold clothing. Preserve the face, pose and composition.',
 'demonic':'Turn the subject into a demon with curved horns, crimson eyes and black infernal armor under sinister red light. Preserve the face, pose and composition. No gore.',
}

ARTWORK_ONLY=' Artwork only. No text, symbols, borders, frames or card layout.'
MAINTAIN_STYLE=(' Match the source artwork\'s artistic medium, brushwork or linework, texture, shading, '
                'level of detail and rendering style. Apply the theme to the scene and subject design while '
                'keeping that visual style; do not convert it into photography, 3D rendering or a different art medium.')
SCENE_NEGATIVE='text, letters, typography, watermark, logo, mana symbols, card frame, card border, title panel, rules panel, card layout, collage, inset picture, split screen, panels, repeated portraits, duplicate faces, extra heads, extra limbs, distorted face, nudity'
OUTPAINT_STYLES={'dark':'dark fantasy, midnight shadows','spooky':'haunted, spectral and misty','normal':'natural painterly',
                'modern':'contemporary urban','echo':'ethereal luminous','angelic':'celestial ivory and gold','demonic':'demonic obsidian and crimson','custom':'matching the supplied artwork'}

BACKGROUND_PROMPT=('Extend the surrounding background into a seamless continuation of the illustration. '
                   'Continue the surrounding scenery across every edge with exactly matching exposure, contrast, color and lighting. '
                   'The result must be one uninterrupted edge-to-edge painting, with no visible rectangle, inset picture, border, haze or gray fill. '
                   'Keep the existing main subject centered at the same size and position. '
                   'Add only quiet background scenery and atmosphere outside the existing scene. '
                   'No new people, creatures, body parts, faces or focal objects. Do not extend the subject into the border. '
                   'No text, lettering, symbols, card borders or frames.')
BACKGROUND_DESCRIPTION=('Continuous quiet background scenery and atmosphere, soft distant environmental detail, '
                        'matching the existing illustration, seamless background only, no focal objects.')
BACKGROUND_NEGATIVE=SCENE_NEGATIVE+', person, character, face, head, body, hands, limbs, creature, animal, focal object, inset picture, rectangular border, gray border'


def outpaint_prompt(theme):
    return ('Extend the artwork into the gray margins. Continue the clothing and scenery naturally in a '+OUTPAINT_STYLES[theme]+
            ' style. Fill the entire portrait canvas with one continuous illustration. No text, symbols, borders or frames.')


def outpaint_description(theme,custom_prompt='',maintain_style=False):
    direction=(validate_custom_prompt(custom_prompt)+'. ') if theme=='custom' and custom_prompt else ''
    return (direction+'A single continuous '+OUTPAINT_STYLES[theme]+' illustration of a fully clothed character in an expansive environment, '
            'detailed atmosphere and ground, naturally continuing costume and scenery, seamless edge-to-edge artwork.'+
            (MAINTAIN_STYLE if maintain_style else ''))


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
    direction=validate_custom_prompt(custom_prompt) if theme=='custom' else THEME_PROMPTS[theme]
    if not direction:raise ValueError('Enter a prompt for the Custom theme.')
    return (direction+' Create one continuous portrait illustration from this cropped artwork. '
            'Preserve the original subjects, recognizable faces, hairstyles, poses and camera viewpoint. '
            'Each original subject appears once, with one head and a continuous body. Keep the main composition centered. '
            'Outpaint one continuous scene by extending the surrounding environment above and below the cropped reference '
            'to fill the tall image naturally. One camera view, uninterrupted scenery, edge-to-edge artwork. '
            'No repeated portraits, duplicate subjects, inset pictures, panels, collage, split screen or reflections. '
            'Exclude all text, lettering, typography, logos, game symbols, title and rules panels, card borders and frames. '
            'If any such elements remain in the reference, replace them with natural scene details. '
            'Do not draw a card, glass, mirrors or shards.'+(MAINTAIN_STYLE if maintain_style else ''))


def compact_scene_prompt(theme,custom_prompt='',maintain_style=False):
    direction=validate_custom_prompt(custom_prompt) if theme=='custom' else THEME_EDITS[theme]
    style=' Keep the source art medium, brushwork, linework, texture and shading style.' if maintain_style else ''
    return 'Same subjects, faces and poses; one continuous scene, each subject once.'+style+' '+direction+ARTWORK_ONLY


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

    def execute(job,generator,source,mask,theme,seed,canvas_size,image_box,custom_prompt,margin,maintain_style):
        try:
            with lock:
                if job['cancel'].is_set():return
                job['state']='running'
            # Adapter must respect cancellation and bound its own model/network
            # calls. Never access card data or settings from this worker.
            output=generator(image=source,mask=mask,theme=theme,prompt=scene_prompt(theme,custom_prompt,maintain_style),seed=seed,cancel=job['cancel'],
                             canvas_size=canvas_size,image_box=image_box,outpaint_margin=margin)
            if job['cancel'].is_set():return
            if not isinstance(output,bytes) or len(output)>15_000_000:
                raise ValueError('Generator returned an invalid scene.')
            encoded=base64.b64encode(output).decode('ascii')
            expanded_size,padding=expanded_scene_geometry(canvas_size,margin)
            if decode_scene(encoded).size!=expanded_size:raise ValueError('Generator did not return the full expanded canvas.')
            with lock:
                if not job['cancel'].is_set():job.update(state='complete',scene=encoded,scene_padding=padding,scene_margin=margin,
                                                       scene_custom_prompt=custom_prompt if theme=='custom' else '',
                                                       scene_maintain_style=maintain_style,finished=time.monotonic())
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
        required={'image','mask_data','theme','seed'}
        if not isinstance(payload,dict) or not required<=set(payload) or set(payload)-required-{'custom_prompt','outpaint_margin','maintain_style'}:
            raise ValueError('Provide the source scene, selection and theme.')
        theme=payload['theme'];seed=payload['seed']
        if not isinstance(theme,str) or theme not in THEMES or type(seed) is not int or not 0<=seed<=2147483647:
            raise ValueError('Choose a valid theme and pattern.')
        custom_prompt=validate_custom_prompt(payload.get('custom_prompt',''))
        if theme=='custom' and not custom_prompt:raise ValueError('Enter a prompt for the Custom theme.')
        margin=payload.get('outpaint_margin',30)
        if type(margin) is not int or not 0<=margin<=100:raise ValueError('Choose an outpainting margin from 0 to 100%.')
        maintain_style=payload.get('maintain_style',True)
        if type(maintain_style) is not bool:raise ValueError('Choose whether to maintain the source art style.')
        if not isinstance(payload['image'],str) or len(payload['image'])>20_000_000:
            raise ValueError('The source scene is too large.')
        source=decode_scene(payload['image']);mask=decode_mask(payload['mask_data'])
        with Image.open(BytesIO(mask)) as selection:
            if not selection.getchannel('A').getbbox():raise ValueError('Select an area for the mirror scene first.')
        canvas_size=source.size;image_box=artwork_box(canvas_size)
        source,mask=artwork_inputs(source)
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
                return local_mirror(app).generate(**kwargs, compact_prompt=compact_scene_prompt(theme,custom_prompt,maintain_style),
                                                  negative_prompt=SCENE_NEGATIVE,outpaint_prompt=outpaint_prompt(kwargs['theme']),
                                                  outpaint_description=outpaint_description(kwargs['theme'],custom_prompt,maintain_style),background_prompt=BACKGROUND_PROMPT,
                                                  background_description=BACKGROUND_DESCRIPTION,background_negative=BACKGROUND_NEGATIVE)
        threading.Thread(target=execute,args=(job,generator,source,mask,theme,seed,canvas_size,image_box,custom_prompt,margin,maintain_style),daemon=True).start()
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
            response=jsonify(ok=True,state=job['state'],scene=job.get('scene'),message=job.get('message'),source_region='fixed_art_box',
                             scene_padding=job.get('scene_padding'),scene_margin=job.get('scene_margin'),scene_custom_prompt=job.get('scene_custom_prompt'),
                             scene_maintain_style=job.get('scene_maintain_style'))
        response.cache_control.no_store=True
        return response
