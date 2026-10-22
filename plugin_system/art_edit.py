"""Portable artwork edits and explicit, scoped local generative fill jobs."""
import base64
from contextlib import closing
from io import BytesIO
import math
import re
import threading
import time
from uuid import uuid4

from flask import jsonify, request
from PIL import Image, UnidentifiedImageError
from .local_mirror import local_mirror, LocalMirrorError

FONTS = ('Beleren Proxy','Plantin MT Pro','Beleren Small Caps','ProxyGlyph',
         'Georgia','Arial','Times New Roman','Courier New')


def image_png(value):
    if not isinstance(value, str) or not value.startswith('data:image/png;base64,') or len(value)>32_000_000:
        raise ValueError('Provide an artwork PNG smaller than 32 MB when encoded.')
    try:
        raw=base64.b64decode(value.split(',',1)[1],validate=True)
        with Image.open(BytesIO(raw)) as image:
            w,h=image.size
            if image.format!='PNG' or image.mode!='RGBA' or not 756<=w<=3024 or abs(h-w*1056/756)>1:
                raise ValueError('Use card-proportioned RGBA artwork from 756 to 3024 pixels wide.')
            image.load();out=BytesIO();image.save(out,format='PNG');return out.getvalue()
    except (UnidentifiedImageError,OSError,base64.binascii.Error) as exc:
        raise ValueError('The artwork PNG could not be read.') from exc


def validate_edit(value):
    if value is None:return None
    if not isinstance(value,dict) or set(value)!={'image_data','paint_data','texts','palette'}:
        raise ValueError('Provide valid Edit layer data.')
    images=[image_png(value[key]) for key in ('image_data','paint_data')]
    with Image.open(BytesIO(images[0])) as image:dimensions=image.size
    with Image.open(BytesIO(images[1])) as paint:paint_dimensions=paint.size
    if dimensions!=paint_dimensions:
        raise ValueError('Edit layer images must have matching dimensions.')
    texts=value['texts'];palette=value['palette']
    if not isinstance(texts,list) or len(texts)>50:raise ValueError('Use at most 50 text items.')
    if not isinstance(palette,list) or len(palette)>12:raise ValueError('Use at most 12 palette colors.')
    def color(v):return isinstance(v,str) and bool(re.fullmatch(r'#[0-9a-fA-F]{6}',v))
    if not all(color(v) for v in palette):raise ValueError('Choose valid palette colors.')
    for item in texts:
        if not isinstance(item,dict) or set(item)!={'type','text','font','size','color','x','y','width','height','bold','italic','align','line_height','autofit'}:
            raise ValueError('Provide valid text items.')
        if not isinstance(item['text'],str) or len(item['text'])>2000 or item['font'] not in FONTS or not color(item['color']):
            raise ValueError('Choose valid text, fonts and colors.')
        if item['type'] not in ('title','mana','type','rules','flavor','artist','legal','power','custom'):
            raise ValueError('Choose a valid text block.')
        if item['align'] not in ('left','center','right') or any(type(item[k]) is not bool for k in ('bold','italic','autofit')):
            raise ValueError('Choose valid text formatting.')
        for key,lo,hi in (('size',6,200),('x',0,1),('y',0,1),('width',.01,1),('height',.01,1),('line_height',.8,3)):
            if type(item[key]) not in (int,float) or not math.isfinite(item[key]) or not lo<=item[key]<=hi:
                raise ValueError('Text size or position is outside the card.')
    return dict(version=1,width=dimensions[0],height=dimensions[1],png_base64=base64.b64encode(images[0]).decode(),
                paint_png_base64=base64.b64encode(images[1]).decode(),texts=texts,palette=palette)


def register_art_edit_routes(app,get_connection,resolve_context,api_errors,decode_mask,card_key):
    jobs={};lock=threading.Lock()
    def owner(card_uuid,face):
        card=card_key(dict(card_uuid=card_uuid,face=face))
        with closing(get_connection()) as conn:
            context=resolve_context(conn,False)
            if not conn.execute('SELECT 1 FROM chaos_cards WHERE card_uuid=?',(card_uuid,)).fetchone():
                raise LookupError('This card printing is no longer available.')
        return (context.scope_id or 'global',*card)
    def prune():
        for key,job in list(jobs.items()):
            if time.monotonic()-job.get('finished',job['created'])>(14700 if job['state'] in ('queued','running') else 1800):
                job['cancel'].set();del jobs[key]
    def execute(job,source,mask,mode,prompt,seed):
        try:
            with lock:
                if job['cancel'].is_set():return
                job['state']='running'
            # Supply selected artwork with neighboring context, at the original
            # coordinates. Never ask the model to reconstruct a whole card.
            alpha=mask.getchannel('A').resize(source.size,Image.Resampling.LANCZOS)
            l,t,r,b=alpha.getbbox();pad=max(32,round(max(r-l,b-t)*.3))
            box=(max(0,l-pad),max(0,t-pad),min(source.width,r+pad),min(source.height,b+pad))
            crop=source.crop(box);selection=Image.new('RGBA',crop.size,'white');selection.putalpha(alpha.crop(box))
            def encoded(im):
                out=BytesIO();im.save(out,format='PNG');return out.getvalue()
            direction=('Remove all lettering in the missing area and reconstruct only the underlying background. '
                       'Continue the surrounding colors, texture, lighting and scenery seamlessly. No new objects or text.'
                       if mode=='remove_text' else prompt)
            instruction=(direction+' Preserve the reference illustration style, brushwork, perspective and composition. '
                         'One continuous image at the same scale and position. No panels, frames, repeated subjects, labels or watermarks.')
            generator=app.config.get('ART_EDIT_GENERATOR')
            if not callable(generator):generator=local_mirror(app).generate
            output=generator(image=encoded(crop),mask=encoded(selection),theme='custom',prompt=instruction,
                             seed=seed,cancel=job['cancel'],edit_mode=mode,
                             negative_prompt='text, letters, watermark, collage, panels, duplicate characters, borders')
            if job['cancel'].is_set():return
            if not isinstance(output,bytes) or len(output)>20_000_000:raise ValueError('Invalid generated artwork.')
            with Image.open(BytesIO(output)) as generated:
                if generated.width*generated.height>24_000_000:raise ValueError('Generated artwork is too large.')
                patch=generated.convert('RGBA').resize(crop.size,Image.Resampling.LANCZOS)
            patch.putalpha(alpha.crop(box))
            result=Image.new('RGBA',source.size);result.paste(patch,box[:2])
            with lock:
                if not job['cancel'].is_set():job.update(state='complete',image_data='data:image/png;base64,'+base64.b64encode(encoded(result)).decode(),finished=time.monotonic())
        except Exception as exc:
            app.logger.warning('Artwork edit failed (%s)',type(exc).__name__)
            with lock:
                if not job['cancel'].is_set():job.update(state='failed',finished=time.monotonic(),message=str(exc) if isinstance(exc,LocalMirrorError) else 'The local AI edit failed. Your artwork is unchanged.')

    @app.post('/cards/spot-foil/<card_uuid>/<face>/art-generation')
    @api_errors
    def card_art_generate(card_uuid,face):
        scope=owner(card_uuid,face)
        if not callable(app.config.get('ART_EDIT_GENERATOR')) and not local_mirror(app).active():
            return jsonify(ok=False,message='Download and enable a model in Generative Art AI settings first.'),503
        if request.content_length and request.content_length>60_000_000:
            return jsonify(ok=False,message='The selected artwork is too large.'),413
        payload=request.get_json(silent=True)
        if not isinstance(payload,dict) or set(payload)!={'image_data','mask_data','mode','prompt','seed'}:
            raise ValueError('Provide artwork, selection and an edit instruction.')
        mode=payload['mode'];prompt=payload['prompt'];seed=payload['seed']
        if mode not in ('remove_text','replace') or not isinstance(prompt,str) or len(prompt)>2000 or (mode=='replace' and not prompt.strip()):
            raise ValueError('Enter an instruction for the selected area.')
        if type(seed) is not int or not 0<=seed<=2147483647:raise ValueError('Choose a valid variation.')
        source=Image.open(BytesIO(image_png(payload['image_data']))).convert('RGBA')
        selection=Image.open(BytesIO(decode_mask(payload['mask_data']))).convert('RGBA')
        if not selection.getchannel('A').getbbox():raise ValueError('Select an area first.')
        with lock:
            prune()
            if sum(j['state'] in ('queued','running') for j in jobs.values())>=2:
                return jsonify(ok=False,message='Two artwork edits are rendering. Wait for one to finish.'),429
            for key in [k for k,j in jobs.items() if j['state'] not in ('queued','running')][:-3]:del jobs[key]
            key=uuid4().hex;job=dict(owner=scope,state='queued',created=time.monotonic(),cancel=threading.Event());jobs[key]=job
        threading.Thread(target=execute,args=(job,source,selection,mode,prompt.strip(),seed),daemon=True).start()
        return jsonify(ok=True,job=key,state='queued'),202

    @app.route('/cards/spot-foil/<card_uuid>/<face>/art-generation/<job_id>',methods=['GET','DELETE'])
    @api_errors
    def card_art_generation_status(card_uuid,face,job_id):
        scope=owner(card_uuid,face)
        with lock:
            prune();job=jobs.get(job_id)
            if not job or job['owner']!=scope:raise LookupError('This artwork edit is no longer available.')
            if request.method=='DELETE':
                job['cancel'].set();job.update(state='cancelled',finished=time.monotonic());job.pop('image_data',None)
            response=jsonify(ok=True,state=job['state'],image_data=job.get('image_data'),message=job.get('message'))
        response.cache_control.no_store=True
        return response
