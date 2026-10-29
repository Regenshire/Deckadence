"""Disintegrate Foil: reusable AI background, procedural energy and foil plate."""
import base64
from functools import lru_cache
from io import BytesIO
import math
import random
import re

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, UnidentifiedImageError

RENDER_VERSION = 8
STYLES = {'burn': 'Burn-through', 'spark': 'Spark breakup', 'flash': 'Energy flash', 'dust': 'Particle dissolve'}
BEAMS = {'continuous': 'Continuous', 'plasma_beam': 'Plasma beam', 'particle': 'Particle beam',
         'phase': 'Phase beam', 'disrupter': 'Disrupter Ray', 'pulse': 'Pulse',
         'rapid': 'Rapid shot', 'ray': 'Ray gun', 'plasma': 'Plasma bolt'}
DEFAULTS = dict(style='burn', target='impact', amount=68, size=62, x=50, y=35,
                stretch=115, rotation=0, roughness=55, beam=True, beam_type='continuous',
                source_x=4, source_y=42, beam_width=5, beam_opacity=100,
                beam_source_width=100, beam_target_width=100,
                beam_inner='#FFF7D7', edge_inner='#FFF2C7', spacing=60, flare=75,
                beam_path=True, glow=78, density=85, edge_width=4, particle_size=3,
                scatter=42, drift=-35, brightness=100, opacity=100,
                outer_edge_reveal=0, edge_disintegration=True, inside_edge_color='#FF9D35',
                subject_outline=True, subject_outline_width=4, subject_outline_opacity=100,
                subject_outline_color='',
                scene='', subject='', prompt='')
LIMITS = dict(amount=(0,100), size=(10,180), x=(0,100), y=(0,100), stretch=(30,250),
              rotation=(-180,180), roughness=(0,100), source_x=(-50,150), source_y=(-50,150),
              beam_width=(1,24), beam_opacity=(0,100), beam_source_width=(10,400),
              beam_target_width=(10,400), spacing=(15,150), flare=(0,100),
              glow=(0,100), density=(0,200), edge_width=(0,14), particle_size=(0,9),
              scatter=(0,100), drift=(-180,180), brightness=(25,200), opacity=(0,100),
              outer_edge_reveal=(0,100), subject_outline_width=(0,14), subject_outline_opacity=(0,100))


@lru_cache(maxsize=4)
def decode_scene(value):
    try:
        raw = base64.b64decode(value, validate=True)
        with Image.open(BytesIO(raw)) as image:
            w,h = image.size
            if image.format != 'PNG' or image.mode != 'RGBA' or not 756 <= w <= 3024 or abs(h-w*1056/756)>1:
                raise ValueError('Use a card-sized RGBA reconstruction.')
            image.load()
            return image.copy()
    except (UnidentifiedImageError, OSError, base64.binascii.Error) as exc:
        raise ValueError('The Disintegrate reconstruction could not be read.') from exc


def validate_settings(raw):
    if not isinstance(raw,dict) or set(raw)-set(DEFAULTS)-{'scene_source','scene_selection'}:
        raise ValueError('Choose valid Disintegrate Foil settings.')
    value = {**DEFAULTS, **raw}
    # Existing cards retain their former outline width. Once loaded, this
    # independent value no longer changes when the disintegration rim changes.
    if 'subject_outline_width' not in raw:
        value['subject_outline_width']=value['edge_width']
    # Ignore the retired artwork fingerprint on previously saved effects.
    value.pop('scene_source',None)
    value.pop('scene_selection',None)
    if not isinstance(value['prompt'],str) or len(value['prompt'])>1200:
        raise ValueError('Keep the optional reconstruction prompt within 1,200 characters.')
    for key, choices in (('style',STYLES),('target',('impact','subject')),('beam_type',BEAMS)):
        if not isinstance(value[key],str) or value[key] not in choices:
            raise ValueError('Choose a valid disintegration or beam type.')
    for key,(low,high) in LIMITS.items():
        number=value[key]
        if type(number) not in (int,float) or not math.isfinite(number) or not low<=number<=high:
            raise ValueError(f'Disintegrate {key} must be between {low} and {high}.')
        value[key]=round(number,3)
    for key in ('beam','beam_path','edge_disintegration','subject_outline'):
        if type(value[key]) is not bool:raise ValueError('Disintegrate toggles must be booleans.')
    for key in ('beam_inner','edge_inner','inside_edge_color','subject_outline_color'):
        # An unset outline color preserves a saved effect's two-tone rim until
        # the user chooses a dedicated outline color.
        if key=='subject_outline_color' and value[key]=='':continue
        if not isinstance(value[key],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value[key]):
            raise ValueError('Choose a valid beam or edge inner color.')
        value[key]=value[key].upper()
    for key in ('scene','subject'):
        if not isinstance(value[key],str) or len(value[key])>32_000_000:
            raise ValueError('The reconstruction or subject cutout is too large.')
        if value[key]:decode_scene(value[key])
    return value


def _smooth(low, high, value):
    t=np.clip((value-low)/(high-low),0,1)
    return t*t*(3-2*t)


def _outer_edge_layers(settings, target, seed):
    """Original surface returns in coherent patches, from the silhouette inward.

    A bounded card-coordinate field keeps preview and print patterns identical.
    Only the small scalar fields are resampled; the actual subject alpha and
    reconstructed artwork retain their full resolution. No AI work is needed.
    """
    alpha=np.asarray(target.resize((756,1056),Image.Resampling.LANCZOS))
    distance=np.pad(np.where(alpha>127,10000.,0.).astype(np.float32),1)
    ramp=np.arange(distance.shape[1],dtype=np.float32)
    # Two chamfer passes, with vectorized horizontal propagation. Padding also
    # handles subjects touching the card edge and an implicit whole-card mask.
    for y in range(1,distance.shape[0]-1):
        row=distance[y]
        row[1:-1]=np.minimum(row[1:-1],np.minimum(distance[y-1,1:-1]+1,
            np.minimum(distance[y-1,:-2],distance[y-1,2:])+math.sqrt(2)))
        row[:]=np.minimum.accumulate(row-ramp)+ramp
    for y in range(distance.shape[0]-2,0,-1):
        row=distance[y]
        row[1:-1]=np.minimum(row[1:-1],np.minimum(distance[y+1,1:-1]+1,
            np.minimum(distance[y+1,:-2],distance[y+1,2:])+math.sqrt(2)))
        row[:]=(np.minimum.accumulate(row[::-1]-ramp)+ramp)[::-1]
    distance=distance[1:-1,1:-1]
    # Match the approved mockup's three-octave, smoothly interpolated patches.
    yy,xx=np.mgrid[:1056,:756].astype(np.float32)
    xx*=512/756/26;yy*=512/756/26
    def noise(x,y):
        ix=np.floor(x);iy=np.floor(y)
        u=_smooth(0,1,x-ix);v=_smooth(0,1,y-iy)
        def hashed(a,b):
            n=np.sin(a.astype(np.float64)*127.1+b.astype(np.float64)*311.7+seed)*43758.5453
            return (n-np.floor(n)).astype(np.float32)
        return (1-v)*((1-u)*hashed(ix,iy)+u*hashed(ix+1,iy))+v*((1-u)*hashed(ix,iy+1)+u*hashed(ix+1,iy+1))
    patches=.64*noise(xx,yy)+.26*noise(xx*2.2,yy*2.2)+.10*noise(xx*5,yy*5)
    field=distance/max(1,float(distance.max()))*.95+(patches-.18)*.65
    amount=settings['outer_edge_reveal']/100
    visible=_smooth(field-.075,field+.075,amount*.72)*_smooth(0,.12,amount)
    # Keep the center absent even at 100%; this control restores the outer
    # surface, while Disintegrated continues to control the overall removal.
    def scaled(values):
        return Image.fromarray(np.rint(np.clip(values,0,1)*255).astype(np.uint8)).resize(target.size,Image.Resampling.BICUBIC)
    missing=scaled(1-visible)
    inner=Image.new('L',target.size)
    if settings['edge_disintegration'] and settings['edge_width']:
        radius=max(1,round(settings['edge_width']*.75))
        padded=np.pad(visible,radius,mode='edge')
        high=visible.copy();low=visible.copy()
        for offset in {radius,max(1,radius//2)}:
            for dx,dy in ((offset,0),(-offset,0),(0,offset),(0,-offset)):
                neighbor=padded[radius+dy:radius+dy+1056,radius+dx:radius+dx+756]
                np.maximum(high,neighbor,out=high);np.minimum(low,neighbor,out=low)
        gradient=high-low
        # Exclude the original silhouette. Color the boundary facing the
        # missing area, leaving restored subject pixels and the outer rim clear.
        interior=_smooth(3,7.5,distance)
        edge=np.clip(gradient*2.4,0,1)*(1-_smooth(.45,.85,visible))*interior
        inner=scaled(edge)
    return missing,inner


def removal_mask(settings, target, seed):
    """Geometry is stable in card coordinates at preview and print resolution."""
    s=settings; w,h=target.size; unit=w/756
    result=Image.new('L',target.size)
    if not s['amount']:return result
    if s['target']=='subject' and s['amount']==100:return target.copy()
    x,y=w*s['x']/100,h*s['y']/100
    rx=w*.28*s['size']/100*math.sqrt(s['amount']/100);ry=rx*s['stretch']/100
    if s['target']=='subject':
        # Expand from the chosen impact so placement remains meaningful for
        # both extent modes. At 100%, the selected subject disappears fully.
        rx=w*(.025+.67*s['amount']/100)*s['size']/62
        ry=h*(.025+.66*s['amount']/100)*s['size']/62
    angle=math.radians(s['rotation']);points=[]
    for i in range(240):
        a=math.tau*i/240
        rough=s['roughness']/100
        noise=1+rough*(.07*math.sin(a*13+seed)+.035*math.sin(a*29+seed*.3)+.018*math.cos(a*51))
        u,v=math.cos(a)*rx*noise,math.sin(a)*ry*noise
        points.append((x+u*math.cos(angle)-v*math.sin(angle),y+u*math.sin(angle)+v*math.cos(angle)))
    # Cairo computes subpixel coverage for curves and angled edges instead of
    # rounding the geometry to whole pixels. A black base retains that coverage
    # when converting this vector silhouette into a grayscale application mask.
    shapes=[f'<rect width="{w}" height="{h}" fill="black"/>',_polygon(points,'white')]
    rng=random.Random(seed)
    if s['style']=='dust' and s['amount']<100:
        for _ in range(260):
            px=x+rng.uniform(-rx,rx);py=y+rng.uniform(-ry,ry);r=rng.uniform(1,5)*unit
            shapes.append(f'<rect x="{px}" y="{py}" width="{r}" height="{r*1.4}" fill="black"/>')
    result=_vector_image(target.size,shapes).convert('L')
    return ImageChops.multiply(result,target)


def _vector_image(size,shapes):
    import cairosvg
    width,height=size
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'+''.join(shapes)+'</svg>'
    with Image.open(BytesIO(cairosvg.svg2png(bytestring=svg.encode('utf-8')))) as image:
        return image.convert('RGBA')


def _polygon(points,color):
    coords=' '.join(f'{x:.4f},{y:.4f}' for x,y in points)
    return f'<polygon points="{coords}" fill="{color}"/>'


def _circle(x,y,r,color):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/>'


def _line(points,color,width):
    coords=' '.join(f'{x:.4f},{y:.4f}' for x,y in points)
    return f'<polyline points="{coords}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'


def _ribbon(points,radii,color):
    """A continuously tapered vector stroke with antialiased rounded ends."""
    left=[];right=[]
    for i,((x,y),radius) in enumerate(zip(points,radii)):
        a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)]
        dx,dy=b[0]-a[0],b[1]-a[1];length=max(.001,math.hypot(dx,dy))
        nx,ny=-dy/length,dx/length
        left.append((x+nx*radius,y+ny*radius));right.append((x-nx*radius,y-ny*radius))
    return (_polygon(left+list(reversed(right)),color)+_circle(*points[0],radii[0],color)
            +_circle(*points[-1],radii[-1],color))


def _tint(alpha,color):
    result=Image.new('RGBA',alpha.size,color);result.putalpha(alpha);return result


def _rim(alpha,radius):
    expanded=alpha.copy()
    for i in range(12):
        dx=round(radius*math.cos(i*math.tau/12));dy=round(radius*math.sin(i*math.tau/12))
        shifted=Image.new('L',alpha.size);shifted.paste(alpha,(dx,dy))
        expanded=ImageChops.lighter(expanded,shifted)
    return ImageChops.subtract(expanded,alpha)


def _separate_rim(removed,subject,radius,*,outline):
    edge=_rim(removed,radius)
    silhouette=_rim(subject,radius)
    # Subtraction excludes the antialiased silhouette from the impact rim,
    # avoiding a residual bright hairline when the subject outline is hidden.
    return ImageChops.darker(edge,silhouette) if outline else ImageChops.subtract(edge,silhouette)


def _energy_edge(removed,subject,width,color,core,settings,unit,*,outline=False):
    if not width:return Image.new('RGBA',subject.size)
    edge=_separate_rim(removed,subject,max(1,width*unit),outline=outline)
    colored=_tint(edge,color)
    result=Image.alpha_composite(_glow(colored,(2+settings['glow']*.18)*unit,settings['glow']/60),colored)
    if settings['style']!='dust':
        inner=_separate_rim(removed,subject,max(1,width*.3*unit),outline=outline)
        result=Image.alpha_composite(result,_tint(inner,core))
    return result


def _glow(image,radius,strength=1):
    result=image.convert('RGBa').filter(ImageFilter.GaussianBlur(radius)).convert('RGBA')
    if strength!=1:result.putalpha(result.getchannel('A').point(lambda p:round(min(255,p*strength))))
    return result


def _beam(s,size,color,hit,seed=0):
    w,h=size;unit=w/756;result=Image.new('RGBA',size)
    if not s['beam'] or not s['beam_opacity'] or not s['amount']:return result
    start=(s['source_x']/100*w,s['source_y']/100*h)
    dx,dy=hit[0]-start[0],hit[1]-start[1];length=max(1,math.hypot(dx,dy));ux,uy=dx/length,dy/length
    width=s['beam_width']*unit;spacing=s['spacing']*unit
    shapes=[];cores=[];haze=[];rng=random.Random(seed+9137)
    def point(t,offset=0):return (start[0]+ux*t-uy*offset,start[1]+uy*t+ux*offset)
    def width_at(t):
        mix=max(0,min(1,t/length))
        return width*((1-mix)*s.get('beam_source_width',100)+mix*s.get('beam_target_width',100))/100
    def ribbon(a,b,factor,fill,offset=0):
        return _ribbon([point(a,offset),point(b,offset)],[width_at(a)*factor,width_at(b)*factor],fill)
    def stroke(a,b,weight=1):
        shapes.append(ribbon(a,b,weight,color))
        cores.append(ribbon(a,b,.325*weight,s['beam_inner']))
    def bolt(a,b,weight=1,identity='bolt'):
        # A fading tail and rounded luminous head, rather than a diamond.
        first,last=point(a),point(b)
        for items,name,tint in ((shapes,identity,color),(cores,identity+'core',s['beam_inner'])):
            items.append(f'<defs><linearGradient id="{name}" gradientUnits="userSpaceOnUse" x1="{first[0]}" y1="{first[1]}" x2="{last[0]}" y2="{last[1]}"><stop offset="0" stop-color="{tint}" stop-opacity="0"/><stop offset=".45" stop-color="{tint}" stop-opacity=".6"/><stop offset=".85" stop-color="{tint}"/><stop offset="1" stop-color="{tint}" stop-opacity=".8"/></linearGradient></defs>')
        samples=[i/48 for i in range(49)]
        pts=[point(a+(b-a)*t) for t in samples]
        radii=[width_at(a+(b-a)*t)*weight*(math.sin(math.pi*t)**.35)*t**1.4 for t in samples]
        shapes.append(_ribbon(pts,radii,f'url(#{identity})'))
        ca=a+(b-a)*.12
        cores.append(_ribbon([point(ca+(b-ca)*t) for t in samples],
            [width_at(ca+(b-ca)*t)*weight*.32*math.sin(math.pi*t)**.3*t**1.8 for t in samples],f'url(#{identity}core)'))
        tip=a+(b-a)*.92
        cores.append(_circle(*point(tip),width_at(tip)*weight*.24,s['beam_inner']))
        # Fine, fading filaments give the streak a lively tail and hot tip.
        for lane in (-1,1):
            samples=[i/32 for i in range(33)]
            pts=[point(a+(b-a)*t,width_at(a+(b-a)*t)*weight*lane*(.13+.12*math.sin(t*23+seed))*math.sin(math.pi*t)) for t in samples]
            shapes.append(_line(pts,f'url(#{identity}core)',max(.3*unit,width_at(tip)*weight*.06)))
    kind=s['beam_type']
    if kind=='continuous':stroke(0,length)
    elif kind=='pulse':
        step=spacing*1.5
        for i in range(min(300,math.ceil(length/step)+1)):
            end=length-i*step
            if end<0:break
            stroke(max(0,end-step*.65),end,1.7)
    elif kind=='rapid':
        end=length
        for i in range(300):
            if end<=0:break
            span=spacing*rng.uniform(.65,1.9)
            bolt(max(0,end-span),end,rng.uniform(.8,1.25),'shot'+str(i))
            end-=span+spacing*rng.uniform(.25,.65)
    elif kind=='plasma':
        bolt(max(0,length-max(spacing*2.5,width*20)),length,1.7)
    elif kind=='plasma_beam':
        samples=[length*i/160 for i in range(161)]
        wave=lambda t:1+.09*math.sin(t/max(unit,19*unit))+.055*math.sin(t/max(unit,7*unit)+seed)
        shapes.append(_ribbon([point(t) for t in samples],[width_at(t)*1.6*wave(t) for t in samples],color))
        cores.append(_ribbon([point(t) for t in samples],[width_at(t)*.92*wave(t) for t in samples],s['beam_inner']))
        # The reference has a brilliant emitter and short rays around its mouth.
        radius=width_at(0)
        shapes.append(_circle(*start,radius*2.5,color));cores.append(_circle(*start,radius*1.3,s['beam_inner']))
        for i in range(9):
            angle=i*math.tau/9+.3
            end=(start[0]+math.cos(angle)*radius*rng.uniform(4,7),start[1]+math.sin(angle)*radius*rng.uniform(4,7))
            shapes.append(f'<g opacity=".25">'+_line((start,end),color,max(unit,radius*.12))+'</g>')
    elif kind=='particle':
        samples=[length*i/160 for i in range(161)]
        pts=[point(t,width_at(t)*.07*math.sin(t/(8*unit)+seed)) for t in samples]
        shapes.append(_ribbon(pts,[width_at(t)*.55 for t in samples],color))
        cores.append(_ribbon(pts,[width_at(t)*.20 for t in samples],s['beam_inner']))
        for i in range(min(300,math.ceil(length/(12*unit)))):
            t=min(length,(i+rng.random())*12*unit)
            cores.append(_circle(*point(t,width_at(t)*rng.uniform(-.12,.12)),width_at(t)*rng.uniform(.18,.28),s['beam_inner']))
    elif kind=='phase':
        haze.append('<g opacity=".24">'+ribbon(0,length,2.8,color)+'</g>')
        for i in range(9):
            lane=(i-4)*.58;phase=rng.random()*math.tau
            samples=[length*j/120 for j in range(121)]
            pts=[point(t,width_at(t)*(lane+.13*math.sin(t/(29*unit)+phase))) for t in samples]
            shapes.append(f'<g opacity="{rng.uniform(.25,.55):.3f}">'+_ribbon(pts,[max(.28*unit,width_at(t)*.11) for t in samples],color)+'</g>')
            if i%2==0:
                cores.append(f'<g opacity="{rng.uniform(.25,.55):.3f}">'+_ribbon(pts,[max(.15*unit,width_at(t)*.035) for t in samples],s['beam_inner'])+'</g>')
    elif kind=='disrupter':
        stroke(0,length,.65)
        for i in range(min(60,max(5,round(length/(25*unit))))):
            a=rng.uniform(0,max(0,length-20*unit));b=min(length,a+rng.uniform(30,90)*unit)
            sign=rng.choice((-1,1));height=rng.uniform(1.5,4.5)
            pts=[]
            count=max(15,round((b-a)/(1.6*unit)))
            for j in range(count):
                mix=j/(count-1);t=a+(b-a)*mix
                offset=sign*width_at(t)*math.sin(math.pi*mix)*(height+rng.uniform(-.6,.6))
                pts.append(point(t,offset))
            shapes.append(_ribbon(pts,[max(.6*unit,width_at(a+(b-a)*j/(count-1))*.18) for j in range(count)],color))
            cores.append('<g opacity=".85">'+_line(pts,s['beam_inner'],.75*unit)+'</g>')
    elif kind=='ray':
        stroke(0,length,.7)
        for sign in (-1,1):
            samples=[length*i/160 for i in range(161)]
            points=[point(t,sign*width_at(t)*2.7*math.sin(t/max(1,spacing)*math.tau)) for t in samples]
            shapes.append(_ribbon(points,[width_at(t)*.275 for t in samples],color))
    shape=_vector_image(size,shapes);core=_vector_image(size,cores)
    glow_radius={'plasma_beam':22,'particle':5,'phase':9,'disrupter':14,'plasma':9,'rapid':5}.get(kind,12)*unit
    energy=kind in ('plasma_beam','particle','phase','disrupter','plasma','rapid')
    result=_glow(shape,glow_radius,.65 if kind=='phase' else 1.4 if kind=='plasma_beam' else 1)
    if haze:result=Image.alpha_composite(result,_glow(_vector_image(size,haze),7*unit))
    result=Image.alpha_composite(result,_glow(shape,2*unit) if energy else shape)
    if energy:result=Image.alpha_composite(result,_glow(core,3*unit,1.4))
    result=Image.alpha_composite(result,_glow(core,.55*unit) if energy else core)
    if s['flare']:
        r=(2+s['flare']*.12)*unit
        flare=_vector_image(size,[_circle(*hit,r,s['beam_inner'])])
        result=Image.alpha_composite(result,_glow(_tint(flare.getchannel('A'),color),r*1.5,1.7))
        result=Image.alpha_composite(result,_glow(flare,max(1,r*.2)))
    result.putalpha(result.getchannel('A').point(lambda a:round(a*s['beam_opacity']/100)))
    return result


def render_disintegrate(effect,target,*,selection=False):
    s=effect['disintegrate'];w,h=target.size;unit=w/756
    result=Image.new('RGBA',target.size)
    if not s['amount'] or effect.get('disabled'):return result
    # Keep the application mask separate from subject geometry. Clip once,
    # after compositing, so beams, particles and blurred glow obey it too.
    application=target if target.getbbox() else Image.new('L',target.size,255)
    target=Image.new('L',target.size,255)
    if s.get('subject'):
        # The original subject is a stable foreground cutout. Studio masks only
        # limit where its transparency changes; clearing them means whole card.
        subject=decode_scene(s['subject']).resize(target.size,Image.Resampling.LANCZOS)
        target=subject.getchannel('A')
    removed=removal_mask(s,target,effect['seed'])
    if not removed.getbbox():return result
    outer_removed=removed
    inner=Image.new('L',target.size)
    if s['target']=='subject' and s.get('outer_edge_reveal',0):
        missing,inner=_outer_edge_layers(s,target,effect['seed'])
        inner=ImageChops.multiply(inner,removed)
        removed=ImageChops.multiply(removed,missing)
    fx=_energy_edge(outer_removed,target,s['edge_width'],effect['color'],s['edge_inner'],s,unit)
    if s.get('subject_outline',True) and s.get('subject_outline_opacity',100):
        outline_color=s.get('subject_outline_color','')
        outline=_energy_edge(outer_removed,target,s.get('subject_outline_width',s['edge_width']),
            outline_color or effect['color'],outline_color or s['edge_inner'],s,unit,outline=True)
        outline.putalpha(outline.getchannel('A').point(lambda a:round(a*s.get('subject_outline_opacity',100)/100)))
        fx=Image.alpha_composite(fx,outline)
    if s['style']=='flash':
        alpha=removed.point(lambda a:round(a*(1-s['amount']/100)*.94))
        fx=Image.alpha_composite(fx,_tint(alpha,s['edge_inner']))
    if inner.getbbox():
        colored_inner=_tint(inner,s['inside_edge_color'])
        fx=Image.alpha_composite(fx,_glow(colored_inner,6*unit,s['glow']/100))
        fx=Image.alpha_composite(fx,colored_inner)
    # Sample a fixed-resolution boundary so the same particles survive export.
    small=removed.resize((756,1056),Image.Resampling.NEAREST)
    boundary=ImageChops.subtract(small,small.filter(ImageFilter.MinFilter(3)))
    pixels=boundary.load();points=[(x*unit,y*unit) for y in range(0,1056,2) for x in range(0,756,2) if pixels[x,y]>30]
    rng=random.Random(effect['seed']);shapes=[]
    direction=math.radians(s['drift'])
    for _ in range(round(s['density']*2.1) if s['particle_size'] else 0):
        if not points:break
        px,py=rng.choice(points);distance=rng.random()**2*s['scatter']*1.7*unit
        px+=math.cos(direction)*distance+rng.uniform(-9,9)*unit;py+=math.sin(direction)*distance+rng.uniform(-9,9)*unit
        r=rng.uniform(.35,1.2)*s['particle_size']*unit
        color=s['edge_inner'] if rng.random()>.6 else effect['color'];opacity=rng.randint(100,255)/255
        shapes.append(f'<g opacity="{opacity}">')
        if s['style']=='dust':shapes.append(f'<rect x="{px-r}" y="{py-r}" width="{r*2}" height="{r*2}" fill="{color}"/>')
        else:shapes.append(_circle(px,py,r,color))
        if s['style']=='spark' and rng.random()<.2:
            shapes.append(_line(((px-r*3,py),(px+r*3,py)),color,unit))
            shapes.append(_line(((px,py-r*3),(px,py+r*3)),color,unit))
        shapes.append('</g>')
    particles=_vector_image(target.size,shapes)
    fx=Image.alpha_composite(fx,_glow(particles,2*unit,s['glow']/100))
    fx=Image.alpha_composite(fx,particles)
    center=(s['x']/100*w,s['y']/100*h);source=(s['source_x']/100*w,s['source_y']/100*h)
    vx,vy=source[0]-center[0],source[1]-center[1];distance=max(1,math.hypot(vx,vy))
    radius=w*.28*s['size']/100*math.sqrt(s['amount']/100)
    aim=(center[0]+vx/distance*radius*.8,center[1]+vy/distance*radius*s['stretch']/100*.8)
    hit=min(points,key=lambda p:(p[0]-aim[0])**2+(p[1]-aim[1])**2) if points else center
    if not selection or s['beam_path']:fx=Image.alpha_composite(_beam(s,target.size,effect['color'],hit,effect['seed']),fx)
    if s['brightness']!=100:
        alpha=fx.getchannel('A');fx=ImageEnhance.Brightness(fx).enhance(s['brightness']/100);fx.putalpha(alpha)
    fx.putalpha(fx.getchannel('A').point(lambda a:round(a*s['opacity']/100)))
    if selection:
        fx.putalpha(ImageChops.multiply(fx.getchannel('A'),application));return fx
    if s['scene']:
        plate=decode_scene(s['scene']).resize(target.size,Image.Resampling.LANCZOS)
        # The unchanged foreground pixels already exist in the base artwork.
        # Emit only the background revealed by the cutout's missing alpha, so
        # its preserved antialiased edges aren't composited onto themselves.
        plate.putalpha(ImageChops.multiply(plate.getchannel('A'),removed))
        result=Image.alpha_composite(result,plate)
    result=Image.alpha_composite(result,fx)
    result.putalpha(ImageChops.multiply(result.getchannel('A'),application))
    return result
