"""Portable artwork edits and explicit, scoped local generative fill jobs."""
import base64
from contextlib import closing
from io import BytesIO
import math
import re
import threading
import time
from uuid import uuid4

from flask import abort, jsonify, request, send_file
from PIL import Image, ImageChops, ImageFilter, ImageStat, UnidentifiedImageError
from .studio_prompter import preparation, compiler, contracts, diagnostics
generation_blend_mask = preparation.generation_blend_mask
removal_reference = preparation.removal_reference
clean_outpaint_bounds = preparation.clean_outpaint_bounds
outpaint_inputs = preparation.outpaint_inputs
unselected_outpaint_bounds = preparation.unselected_outpaint_bounds
from .local_mirror import local_mirror, LocalMirrorError, MODELS

FONTS = ('Beleren Proxy','Plantin MT Pro','Beleren Small Caps','ProxyGlyph',
         'Georgia','Arial','Times New Roman','Courier New')


def detect_outpaint_bounds(source,bounds,cancel,progress):
    from PIL import ImageDraw
    from .card_spot_foil import text_detection_plugin, validate_generation, _subject_detection_lock, _text_detection_lock
    from .manager import run_plugin_json
    detector=text_detection_plugin()
    if not detector:raise LocalMirrorError('Install Card Finishing Studio AI detection to prepare a clean artwork reference, or use a custom style for replacement or removal.')
    image=source.convert('RGB');image.thumbnail((1512,2112),Image.Resampling.LANCZOS)
    out=BytesIO();image.save(out,format='JPEG',quality=95);payload={'image':base64.b64encode(out.getvalue()).decode('ascii')}
    progress('detecting','Detecting frame and text panels to exclude them from the artwork reference.')
    with _subject_detection_lock:
        if cancel.is_set():raise LocalMirrorError('Render cancelled.')
        frame=run_plugin_json('card-finishing-studio','detect_frame',{**payload,'layout':'auto'},timeout=480)
    with _text_detection_lock:
        if cancel.is_set():raise LocalMirrorError('Render cancelled.')
        text=run_plugin_json(detector,'detect_text',payload,timeout=90)
    excluded=Image.new('L',image.size)
    for key in ('material','panels'):
        with Image.open(BytesIO(base64.b64decode(frame[key],validate=True))) as mask:
            if mask.mode!='L' or mask.width*mask.height>4_000_000:raise ValueError('Invalid frame mask.')
            excluded=ImageChops.lighter(excluded,mask.resize(image.size,Image.Resampling.LANCZOS))
    draw=ImageDraw.Draw(excluded)
    for polygon in validate_generation({'text_regions':text.get('regions',[])})['text_regions']:
        draw.polygon([(round(x*image.width),round(y*image.height)) for x,y in polygon],fill=255)
    return clean_outpaint_bounds(source,bounds,excluded)


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
        required={'type','text','font','size','color','x','y','width','height','bold','italic','align','line_height','autofit'}
        if not isinstance(item,dict) or not required<=set(item) or set(item)-required-{'paragraph_spacing','styles'}:
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
        if 'paragraph_spacing' in item and (type(item['paragraph_spacing']) not in (int,float) or not math.isfinite(item['paragraph_spacing']) or not 0<=item['paragraph_spacing']<=3):
            raise ValueError('Choose paragraph spacing between 0 and 3.')
        # Textarea selections use UTF-16 offsets. Accept only ordered, nonoverlapping
        # ranges at character boundaries, including text containing emoji.
        boundaries={0};length=0
        for character in item['text']:
            length+=2 if ord(character)>0xffff else 1;boundaries.add(length)
        styles=item.get('styles',[]);previous_end=0
        if not isinstance(styles,list) or len(styles)>2000:
            raise ValueError('Provide valid text emphasis ranges.')
        for span in styles:
            if (not isinstance(span,dict) or set(span)!={'start','end','bold','italic'}
                    or type(span['start']) is not int or type(span['end']) is not int
                    or not previous_end<=span['start']<span['end']<=length
                    or span['start'] not in boundaries or span['end'] not in boundaries
                    or type(span['bold']) is not bool or type(span['italic']) is not bool):
                raise ValueError('Provide valid text emphasis ranges.')
            previous_end=span['end']
    return dict(version=1,width=dimensions[0],height=dimensions[1],png_base64=base64.b64encode(images[0]).decode(),
                paint_png_base64=base64.b64encode(images[1]).decode(),texts=texts,palette=palette)


def register_art_edit_routes(app,get_connection,resolve_context,api_errors,decode_mask,card_key):
    jobs={};lock=threading.Lock()
    @app.context_processor
    def art_development_context():
        return dict(studio_development_diagnostics=diagnostics.enabled())
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
    def execute(job,source,mask,mode,prompt,seed,maintain_style,source_bounds,model,style_mode,custom_style,prepare_only):
        capture=job.get('diagnostics')
        def progress(stage,message):
            with lock:
                if not job['cancel'].is_set():job.update(stage=stage,message=message)
        try:
            with lock:
                if job['cancel'].is_set():return
                job['state']='running'
            progress('preparing','Preparing the selected area and neighboring artwork.')
            # Supply selected artwork with neighboring context, at the original
            # coordinates. Never ask the model to reconstruct a whole card.
            alpha=mask.getchannel('A').resize(source.size,Image.Resampling.LANCZOS)
            if capture:
                capture.add('source-edited.png',source)
                capture.add('selection-original.png',alpha)
            if mode=='remove_object':
                alpha=preparation.removal_blend_mask(alpha)
            extension_reference=None
            sample_bounds=source_bounds
            if mode=='outpaint' or (mode!='remove_text' and style_mode=='match'):
                sample_bounds=detect_outpaint_bounds(source,source_bounds,job['cancel'],progress)
            analysis_bounds=sample_bounds
            if mode=='outpaint':
                # Analysis needs a clean rectangle; generation keeps all clean
                # unselected context above and below an overlapping selection.
                analysis_bounds=unselected_outpaint_bounds(source,sample_bounds,alpha)
                extension_reference,extension_mask=outpaint_inputs(source,alpha,sample_bounds)
            l,t,r,b=alpha.getbbox();pad=max(32,round(max(r-l,b-t)*.6))
            box=(max(0,l-pad),max(0,t-pad),min(source.width,r+pad),min(source.height,b+pad))
            if mode=='outpaint':
                sample_box=tuple(round(v*source.size[i%2]) for i,v in enumerate(sample_bounds))
                box=(min(l,sample_box[0]),min(t,sample_box[1]),max(r,sample_box[2]),max(b,sample_box[3]))
            crop=source.crop(box);selection=Image.new('RGBA',crop.size,'white');selection.putalpha(alpha.crop(box))
            if capture:
                capture.metadata.update(crop_box=list(box),detected_art_bounds=list(sample_bounds),analysis_bounds=list(analysis_bounds))
                capture.add('selection-effective.png',alpha)
                capture.add('source-crop.png',crop)
            if mode=='outpaint':
                selection.putalpha(extension_mask.crop(box))
            elif mode=='remove_object':
                selection.putalpha(preparation.removal_generation_mask(alpha.crop(box)))
            def encoded(im):
                out=BytesIO();im.save(out,format='PNG');return out.getvalue()
            generator=app.config.get('ART_EDIT_GENERATOR')
            options={}
            if not callable(generator):
                generator=local_mirror(app).generate
                def planned(plan, reference, selected_mask):
                    if capture:capture.add('plan.json',plan)
                    previews=[]
                    for im in compiler.conditioning_images(plan,reference,selected_mask):
                        im.thumbnail((800,1000),Image.Resampling.LANCZOS)
                        previews.append('data:image/png;base64,'+base64.b64encode(encoded(im)).decode())
                    with lock:
                        if not job['cancel'].is_set():job.update(plan=plan,reference_previews=previews)
                sample_box=tuple(round(v*source.size[i%2]) for i,v in enumerate(sample_bounds))
                analysis_box=tuple(round(v*source.size[i%2]) for i,v in enumerate(analysis_bounds))
                sides=preparation.extension_directions(alpha,sample_box)
                geometry=dict(canvas_size=list(source.size),crop_box=list(box),clean_art_box=list(sample_box),analysis_box=list(analysis_box),directions=sides,source_hash=contracts.image_digest(source),application_mask_hash=contracts.image_digest(alpha))
                options.update(progress=progress,user_prompt=prompt,maintain_style=maintain_style,
                    planning=dict(style_mode=style_mode,custom_style=custom_style,analysis_image=encoded(source.crop(analysis_box)),geometry=geometry),on_plan=planned,prepare_only=prepare_only)
                if capture:options['on_diagnostics']=capture.add
                if model is not None:options['model']=model
                instruction=prompt  # The central planner compiles the selected model's recipe.
            else:
                instruction=prompt if mode!='remove_text' else ''
            progress('detecting' if mode=='remove_text' else 'generating',
                     'Detecting lettering before repairing its strokes from the surrounding background.' if mode=='remove_text'
                     else 'The local model is working. Timing depends on your model and processor.')
            reference = extension_reference.crop(box) if mode=='outpaint' else removal_reference(crop, selection.getchannel('A')) if mode=='remove_object' else crop
            if capture:
                capture.add('reference-prepared.png',reference)
                capture.add('generation-mask.png',selection.getchannel('A'))
            output=generator(image=encoded(reference),mask=encoded(selection),theme='custom',prompt=instruction,
                             seed=seed,cancel=job['cancel'],edit_mode=mode,
                             **options)
            if job['cancel'].is_set():return
            if prepare_only and mode!='remove_text':
                with lock:job.update(state='prepared',stage='prepared',message='Generation plan ready. Inspect the reference and prompt, then generate.',finished=time.monotonic())
                return
            progress('rendering','Placing generated artwork inside the selection and preparing the comparison.')
            if not isinstance(output,bytes) or len(output)>20_000_000:raise ValueError('Invalid generated artwork.')
            with Image.open(BytesIO(output)) as generated:
                if generated.width*generated.height>24_000_000:raise ValueError('Generated artwork is too large.')
                patch=generated.convert('RGBA').resize(crop.size,Image.Resampling.LANCZOS)
            # Compare only selected pixels. This is a visibility hint, not a
            # model-quality verdict; users can still inspect and apply it.
            blend_mask = alpha.crop(box) if mode in ('remove_object','remove_text') else generation_blend_mask(alpha.crop(box))
            if capture:
                capture.add('worker-output.png',output)
                capture.add('blend-mask.png',blend_mask)
            compare_mask=blend_mask.point(lambda v:255 if v else 0)
            visible_patch=Image.composite(patch,crop,blend_mask)
            difference=ImageChops.difference(crop.convert('RGB'),visible_patch.convert('RGB'))
            mean=sum(ImageStat.Stat(difference,compare_mask).mean)/3
            channels=difference.split()
            changed=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]).point(lambda v:255 if v>8 else 0)
            changed=ImageChops.multiply(changed,compare_mask)
            fraction=ImageStat.Stat(changed).sum[0]/max(1,ImageStat.Stat(compare_mask).sum[0])
            summary=dict(mean_difference=round(mean,2),changed_percent=round(fraction*100,2),little_change=mean<1.5 and fraction<.01)
            patch.putalpha(blend_mask)
            result=Image.new('RGBA',source.size);result.paste(patch,box[:2])
            if capture:
                capture.add('result-overlay.png',result)
                combined=Image.alpha_composite(source,result)
                capture.add('result-composited.png',combined)
                before=source.convert('RGB');after=combined.convert('RGB')
                before.thumbnail((756,1056),Image.Resampling.LANCZOS);after.thumbnail(before.size,Image.Resampling.LANCZOS)
                comparison=Image.new('RGB',(before.width*2,before.height))
                comparison.paste(before,(0,0));comparison.paste(after,(before.width,0))
                capture.add('comparison.png',comparison)
                capture.metadata.update(change_summary=summary,elapsed_seconds=round(time.monotonic()-job['created'],1))
            with lock:
                if not job['cancel'].is_set():job.update(state='complete',stage='complete',change_summary=summary,image_data='data:image/png;base64,'+base64.b64encode(encoded(result)).decode(),finished=time.monotonic())
        except Exception as exc:
            app.logger.warning('Artwork edit failed (%s)',type(exc).__name__)
            with lock:
                if not job['cancel'].is_set():job.update(state='failed',finished=time.monotonic(),message=str(exc) if isinstance(exc,(LocalMirrorError,contracts.PlannerError)) else 'The local AI edit failed. Your artwork is unchanged.')

    @app.post('/cards/spot-foil/<card_uuid>/<face>/art-generation')
    @api_errors
    def card_art_generate(card_uuid,face):
        scope=owner(card_uuid,face)
        if request.content_length and request.content_length>60_000_000:
            return jsonify(ok=False,message='The selected artwork is too large.'),413
        payload=request.get_json(silent=True)
        required={'image_data','mask_data','mode','prompt','seed'}
        if not isinstance(payload,dict) or not required<=set(payload) or set(payload)-required-{'maintain_style','source_bounds','model','style_mode','custom_style','prepare_only'}:
            raise ValueError('Provide artwork, selection and an edit instruction.')
        model=payload.get('model')
        if model is not None and (not isinstance(model,str) or model not in MODELS):
            raise ValueError('Choose a listed model.')
        maintain_style=payload.get('maintain_style',True)
        if type(maintain_style) is not bool:raise ValueError('Choose whether to maintain the artwork style.')
        style_mode=payload.get('style_mode','match' if maintain_style else 'none')
        custom_style=payload.get('custom_style','');prepare_only=payload.get('prepare_only',False)
        if style_mode not in ('match','custom','none') or not isinstance(custom_style,str) or len(custom_style)>2000 or type(prepare_only) is not bool:
            raise ValueError('Choose valid style and preparation settings.')
        mode=payload['mode'];prompt=payload['prompt'];seed=payload['seed']
        if mode!='remove_text' and style_mode=='custom' and not custom_style.strip():raise ValueError('Enter a custom style description.')
        if mode not in ('remove_text','replace','remove_object','outpaint') or not isinstance(prompt,str) or len(prompt)>2000 or (mode=='replace' and not prompt.strip()):
            raise ValueError('Enter an instruction for the selected area.')
        source_bounds=payload.get('source_bounds',[.06,.12,.94,.56])
        if (not isinstance(source_bounds,list) or len(source_bounds)!=4 or
                any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in source_bounds) or
                source_bounds[2]-source_bounds[0]<.01 or source_bounds[3]-source_bounds[1]<.01):
            raise ValueError('Choose a valid artwork source box.')
        if type(seed) is not int or not 0<=seed<=2147483647:raise ValueError('Choose a valid variation.')
        if not callable(app.config.get('ART_EDIT_GENERATOR')):
            provider=local_mirror(app)
            if mode=='remove_text' and not provider.text_repair_runtime():
                return jsonify(ok=False,message='Install AI detection in Card Finishing Studio to remove text. No generative image model is needed.'),503
            if mode!='remove_text' and provider.active():
                model=provider.generation_selection(model)['model']
            if mode!='remove_text' and not provider.active():
                return jsonify(ok=False,message='Install and enable a complete package in Generative Art AI settings first.'),503
        source=Image.open(BytesIO(image_png(payload['image_data']))).convert('RGBA')
        selection=Image.open(BytesIO(decode_mask(payload['mask_data']))).convert('RGBA')
        if not selection.getchannel('A').getbbox():raise ValueError('Select an area first.')
        if mode=='remove_object' and not ImageChops.invert(selection.getchannel('A').point(lambda v:255 if v else 0)).getbbox():
            raise ValueError('Leave some surrounding artwork outside the selection for object removal.')
        with lock:
            prune()
            if sum(j['state'] in ('queued','running') for j in jobs.values())>=2:
                return jsonify(ok=False,message='Two artwork edits are rendering. Wait for one to finish.'),429
            for key in [k for k,j in jobs.items() if j['state'] not in ('queued','running')][:-3]:del jobs[key]
            key=uuid4().hex;job=dict(owner=scope,state='queued',stage='queued',message='Waiting for local AI.',
                model_label='Text detection + local inpainting · on this PC' if mode=='remove_text' else (MODELS[model]['name']+' · on this PC' if model else 'Generative Art AI · on this PC'),
                created=time.monotonic(),cancel=threading.Event());jobs[key]=job
            if diagnostics.enabled() and mode!='remove_text' and not prepare_only:
                job['diagnostics']=diagnostics.Capture(dict(job_id=key,card_uuid=card_uuid,face=face,operation=mode,seed=seed,
                    instruction=prompt.strip(),style_mode=style_mode,custom_style=custom_style,requested_model=model,configured_art_bounds=source_bounds))
        threading.Thread(target=execute,args=(job,source,selection,mode,prompt.strip(),seed,maintain_style,source_bounds,model,style_mode,custom_style,prepare_only),daemon=True).start()
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
                job.pop('diagnostics',None)
            response=jsonify(ok=True,state=job['state'],stage=job['stage'],model_label=job['model_label'],elapsed_seconds=round(job.get('finished',time.monotonic())-job['created'],1),image_data=job.get('image_data'),message=job.get('message'),change_summary=job.get('change_summary'),plan=job.get('plan'),reference_previews=job.get('reference_previews',[]))
        response.cache_control.no_store=True
        return response

    @app.get('/cards/spot-foil/<card_uuid>/<face>/art-generation/<job_id>/diagnostics')
    @api_errors
    def card_art_generation_diagnostics(card_uuid,face,job_id):
        if not diagnostics.enabled():abort(404)
        scope=owner(card_uuid,face)
        with lock:
            prune();job=jobs.get(job_id)
            if not job or job['owner']!=scope:raise LookupError('This artwork edit is no longer available. Generate a new preview to export its diagnostics.')
            capture=job.get('diagnostics')
            if job['state']!='complete' or not capture:
                return jsonify(ok=False,message='Diagnostics are available for completed previews generated in this development session.'),409
        data=capture.archive()
        filename='generation-diagnostics-'+job_id+'.zip'
        folder=diagnostics.development_root()/'exports';folder.mkdir(parents=True,exist_ok=True)
        (folder/filename).write_bytes(data)
        response=send_file(BytesIO(data),mimetype='application/zip',as_attachment=True,download_name=filename)
        response.cache_control.no_store=True
        return response
