"""Editable mirror objects and deterministic print rendering, without inference."""
import math
import re
import random
from PIL import Image, ImageChops, ImageDraw
from .mirror_shards import THEMES, TEMPLATES, decode_scene, shard_polygons, transform_image

SHAPES = {'sphere': 'Spheres', 'square': 'Square Mirrors', 'oval': 'Oval Mirrors'}
LIGHT_DEFAULTS = dict(x=20,y=5,height=65,size=24,color='#F4FAFF',strength=100)
MODES = {'continuous': 'Large scene across all mirrors', 'replicated': 'One scene replicated in every mirror',
         'individual': 'Individual micro scenes'}
VARIATIONS = {'automatic': 'Automatic variations', 'shared': 'Shared theme and style', 'per_object': 'Styles / prompts per mirror'}
TARGETS = {'face': 'Face', 'body': 'Body', 'random': 'Random', 'focus': 'Focus'}
LAYOUTS = {'organic': 'Floating depths', 'downward_v': 'Downward V from head', 'scatter': 'Scattered depths', 'ring': 'Surround the subject', 'diagonal': 'Drifting upward', 'grid': 'Grid',
           **{'shard_'+key: label+' arrangement' for key, label in TEMPLATES.items()}}
MAX_OBJECTS = 24
IMAGE_DEFAULTS = dict(x=0, y=0, zoom=100, rotation=0, rotation_x=0, rotation_y=0, skew=0, flip_x=False, flip_y=False)
OBJECT_LIMITS = (('x',-100,200),('y',-100,200),('width',1,200),('height',1,200),('size',25,300),('rotation',-180,180),('rotation_x',-180,180),('rotation_y',-180,180),('skew',-60,60))
TRANSFORM_KEYS = {key for key,_,_ in OBJECT_LIMITS} | {'flip_x','flip_y'}


def object_transform(value):
    if not isinstance(value,dict) or set(value)!=TRANSFORM_KEYS:
        raise ValueError('Invalid mirror reset position.')
    result={key:number(value[key],'Mirror '+key,low,high) for key,low,high in OBJECT_LIMITS}
    for key in ('flip_x','flip_y'):
        if type(value[key]) is not bool:raise ValueError('Mirror flips must be true or false.')
        result[key]=value[key]
    return result


def number(value, name, low, high):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}.')
    return round(value, 3)


def text(value, name, limit=1000):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError(f'{name} must be text of at most {limit} characters.')
    return value.strip()


def image_options(value):
    if not isinstance(value, dict) or set(value)-set(IMAGE_DEFAULTS):
        raise ValueError('Choose valid mirror image controls.')
    result = {**IMAGE_DEFAULTS, **value}
    for key in ('flip_x', 'flip_y'):
        if type(result[key]) is not bool: raise ValueError('Mirror flips must be true or false.')
    for key, low, high in (('x', -200, 200), ('y', -200, 200), ('zoom', 10, 500), ('rotation', -180, 180), ('rotation_x', -180, 180), ('rotation_y', -180, 180), ('skew', -60, 60)):
        result[key] = number(result[key], 'Image '+key, low, high)
    return result


def layout_origin(value):
    if not isinstance(value,(list,tuple)) or len(value)!=2:
        raise ValueError('Choose the V origin on the card.')
    return [number(v,'V origin',0,100) for v in value]


def focus_region(value):
    """A user-selected rectangle in normalized, edited-card coordinates."""
    if value is None:return None
    if (not isinstance(value,list) or len(value)!=4 or
            any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in value) or
            value[2]-value[0]<.001 or value[3]-value[1]<.001):
        raise ValueError('Choose a valid focus area for each micro scene.')
    return list(value)


def appearance_options(value):
    if not isinstance(value,dict) or set(value)-{'tint','color','strength','reflection'}:
        raise ValueError('Choose valid per-mirror appearance overrides.')
    result={}
    for key in ('tint','strength'):
        if key in value:result[key]=number(value[key],'Mirror '+key,0,100)
    if 'color' in value:
        if not isinstance(value['color'],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',value['color']):
            raise ValueError('Choose a valid mirror tint color.')
        result['color']=value['color'].upper()
    # Discard the superseded decorative preset when opening an existing edit.
    # All objects now reflect the same configurable light source.
    if 'reflection' in value and value['reflection'] not in ('soft','window','ribbon','twin','iridescent'):
        raise ValueError('Choose valid mirror appearance settings.')
    return result


def light_options(value):
    if not isinstance(value,dict) or set(value)-set(LIGHT_DEFAULTS):
        raise ValueError('Choose valid reflection light settings.')
    result={**LIGHT_DEFAULTS,**value}
    for key,low,high in (('x',-100,200),('y',-100,200),('height',5,200),('size',1,100),('strength',0,200)):
        result[key]=number(result[key],'Reflection light '+key,low,high)
    if not isinstance(result['color'],str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',result['color']):
        raise ValueError('Choose a valid reflection light color.')
    result['color']=result['color'].upper()
    return result


def has_strength_overrides(options):
    return any('strength' in o.get('appearance',{}) for o in options['objects'])


def layout_objects(shape='sphere', layout='organic', count=6, seed=0, origin=None):
    if not isinstance(shape,str) or shape not in SHAPES or not isinstance(layout,str) or layout not in LAYOUTS or type(count) is not int or not 0 <= count <= MAX_OBJECTS:
        raise ValueError('Choose a mirror shape, layout and count from 0 to 24.')
    if type(seed) is not int or not 0 <= seed <= 2147483647:
        raise ValueError('Choose a valid layout seed.')
    origin=layout_origin([50,22] if origin is None else origin)
    if count==0:return
    rng = random.Random(seed + 173)
    columns = max(1, round(math.sqrt(count*756/1056)))
    rows = math.ceil(count/columns)
    size = min(72/columns, 74/rows*1056/756, 48)
    if layout=='downward_v':size=24*math.sqrt(3/max(3,math.ceil(count/2)))
    points = []
    if layout.startswith('shard_'):
        polygons = shard_polygons(layout[6:])
        for i in range(count):
            polygon = polygons[i % len(polygons)]
            x = sum(p[0] for p in polygon)/len(polygon)/10
            y = sum(p[1] for p in polygon)/len(polygon)/14
            cycle=i//len(polygons)
            if cycle:
                angle=cycle*2.39996322973;c,s=math.cos(angle),math.sin(angle)
                dx,dy=(x-50)*(.85**cycle),(y-50)*(.85**cycle)
                x,y=50+c*dx-s*dy,50+s*dx+c*dy
            points.append((x, y, (i%3-1)*12))
    placements=[]
    for i in range(count):
        factor=1
        if layout == 'grid':
            row, col = divmod(i, columns)
            used = min(columns, count-row*columns)
            x, y, angle = 50+(col-(used-1)/2)*84/columns, 50+(row-(rows-1)/2)*80/rows, 0
        elif layout == 'organic':
            # Foreground / middle distance / background, leaving the central
            # subject readable. Deliberately unequal spacing and apparent size.
            anchors=[(21,70,1.35),(80,32,.92),(17,20,.65),(76,82,1.12),(60,9,.43),(86,57,.56),
                     (9,47,.4),(50,91,.62),(38,15,.35),(90,15,.38),(40,73,.49),(10,90,.32)]
            x,y,factor=anchors[i%len(anchors)]
            if i>=len(anchors):x,y,factor=rng.uniform(8,92),rng.uniform(8,92),rng.uniform(.25,.55)
            if seed:x+=rng.uniform(-9,9);y+=rng.uniform(-7,7);factor*=rng.uniform(.8,1.15)
            angle=rng.uniform(-32,32)
        elif layout == 'ring':
            a = i*2*math.pi/count-math.pi/2+rng.uniform(-.19,.19)
            x,y,angle=50+rng.uniform(30,39)*math.cos(a),50+rng.uniform(32,41)*math.sin(a),rng.uniform(-30,30)
            factor=rng.uniform(.45,1.35)
        elif layout == 'diagonal':
            f = i/max(1, count-1)
            x,y,angle=20+60*f+rng.uniform(-14,14),84-68*f+rng.uniform(-6,6),rng.uniform(-35,15)
            factor=1.4-f*.95
        elif layout == 'downward_v':
            # A broad fan beside the face, with larger foreground mirrors
            # stepping outward and down. Keep a clear gap around the head.
            side=-1 if i%2==0 else 1
            arm_count=(count+1)//2 if side<0 else count//2
            t=(i//2)/max(1,arm_count-1)
            reach=min(38,max(0,origin[0]-10 if side<0 else 90-origin[0]))
            start=min(16,reach*.6)
            x=origin[0]+side*(start+(reach-start)*t)
            y=origin[1]+min(30,max(4,83-origin[1]))*(.2+.8*t)
            x+=rng.uniform(-.8,.8);y+=rng.uniform(-.6,.6)
            angle=side*(2+15*t)+rng.uniform(-1.5,1.5)
            factor=(.88+.32*t)*rng.uniform(.97,1.03)
        elif layout == 'scatter':
            x,y,angle=rng.uniform(8,92),rng.uniform(8,92),rng.uniform(-38,38)
            factor=rng.uniform(.38,1.4)
        else:
            x,y,angle=points[i]
            polygon=polygons[i%len(polygons)]
            area=abs(sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(polygon,polygon[1:]+polygon[:1])))/2
            factor=max(.38,min(1.45,math.sqrt(area)/190))
            angle+=rng.uniform(-15,15)
        extent=size*factor
        height=extent*756/1056*(1.4 if shape=='oval' else 1)
        skew=0;rotation_x=rotation_y=0
        if layout!='grid':
            if shape=='sphere':angle=0
            elif layout=='downward_v':
                # Paired planes turn inward toward the subject, then fan out
                # gently in Z. Random axes made the old arrangement incoherent.
                rotation_x=4-8*t+rng.uniform(-2,2)
                rotation_y=-side*(28-12*t)+rng.uniform(-3,3)
            else:
                rotation_x=rng.uniform(-38,38)
                rotation_y=rng.uniform(-45,45)
        placements.append(dict(x=x,y=y,width=extent,height=height,rotation=angle,rotation_x=rotation_x,rotation_y=rotation_y,skew=skew))
    # Smaller mirrors sit behind larger foreground objects. This also sets the
    # initial stacking order, which the editor can subsequently change.
    if layout!='grid':placements.sort(key=lambda p:p['width']*p['height'])
    for i,p in enumerate(placements):
        home=dict(**{k:round(v,3) for k,v in p.items()},size=100,flip_x=False,flip_y=False)
        yield dict(id=f'm{i+1}',**home,home=dict(home),
                   image=dict(IMAGE_DEFAULTS),scene='',prompt='',style='',theme='inherit',
                   appearance={})


def validate_mirrors(value):
    allowed = {'version','shape','layout','layout_seed','layout_origin','mirror','mode','variation','target','mirror_angle','theme','prompt','maintain_style','curvature','tint','light','objects','scenes','shared_scene','image'}
    if not isinstance(value,dict) or set(value)-allowed: raise ValueError('Choose valid Mirror Layers settings.')
    result = dict(version=1,shape='sphere',layout='organic',layout_seed=0,mirror=bool(value.get('shared_scene') or value.get('scenes')),
                  mode='replicated',variation='automatic',target='face',mirror_angle=False,theme='normal',prompt='',
                  maintain_style=True,curvature=65,tint=12,scenes={},shared_scene='',image={})
    result.update(value)
    if type(result['version']) is not int or result['version'] != 1: raise ValueError('Unsupported Mirror Layers version.')
    for key, choices in (('shape',SHAPES),('layout',LAYOUTS),('mode',MODES),('variation',VARIATIONS),('target',TARGETS),('theme',THEMES)):
        if not isinstance(result[key],str) or result[key] not in choices: raise ValueError('Choose a valid mirror '+key+'.')
    if type(result['maintain_style']) is not bool: raise ValueError('Choose whether to maintain art style.')
    if type(result['mirror']) is not bool: raise ValueError('Choose whether to show scene images.')
    if type(result['mirror_angle']) is not bool: raise ValueError('Choose whether to reflect by mirror angle.')
    result['layout_seed']=int(number(result['layout_seed'],'Layout seed',0,2147483647))
    if 'layout_origin' in result:result['layout_origin']=layout_origin(result['layout_origin'])
    result['prompt'] = text(result['prompt'],'Mirror prompt')
    result['curvature'] = number(result['curvature'],'Orb curvature',0,100)
    result['tint'] = number(result['tint'],'Glass tint',0,100)
    result['light'] = light_options(result.get('light',{}))
    result['image'] = image_options(result['image'])
    objects = result.get('objects',list(layout_objects(result['shape'],result['layout'],seed=result['layout_seed'],origin=result.get('layout_origin'))))
    if not isinstance(objects,list) or not 0 <= len(objects) <= MAX_OBJECTS: raise ValueError('Use 0 to 24 mirror objects.')
    ids=set(); cleaned=[]
    keys={'id','x','y','width','height','rotation','skew','flip_x','flip_y','image','scene','prompt','style'}
    for obj in objects:
        if not isinstance(obj,dict) or set(obj)-{'home','size','rotation_x','rotation_y','theme','focus','appearance'}!=keys: raise ValueError('Invalid mirror object settings.')
        obj=dict(obj)
        if 'appearance' in obj:obj['appearance']=appearance_options(obj['appearance'])
        obj.setdefault('size',100)
        obj.setdefault('rotation_x',0);obj.setdefault('rotation_y',0)
        obj.setdefault('theme','inherit')
        if 'focus' in obj:obj['focus']=focus_region(obj['focus'])
        if not isinstance(obj['theme'],str) or obj['theme'] not in {'inherit',*THEMES}: raise ValueError('Choose a valid per-mirror theme.')
        if not isinstance(obj['id'],str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,40}',obj['id']) or obj['id'] in ids:
            raise ValueError('Mirror objects need unique identifiers.')
        ids.add(obj['id'])
        for key,low,high in OBJECT_LIMITS:
            obj[key]=number(obj[key],'Mirror '+key,low,high)
        for key in ('flip_x','flip_y'):
            if type(obj[key]) is not bool: raise ValueError('Mirror flips must be true or false.')
        home=obj.get('home',{k:obj[k] for k in TRANSFORM_KEYS})
        obj['home']=object_transform({'size':100,'rotation_x':0,'rotation_y':0,**home} if isinstance(home,dict) else home)
        obj['image']=image_options(obj['image'])
        obj['prompt']=text(obj['prompt'],'Object prompt');obj['style']=text(obj['style'],'Object style',500)
        obj['scene']=text(obj['scene'],'Scene identifier',80)
        cleaned.append(obj)
    result['objects']=cleaned
    scenes=result['scenes']
    if not isinstance(scenes,dict) or len(scenes)>MAX_OBJECTS+1: raise ValueError('Too many saved mirror scenes.')
    total=0; pixels=0; saved={}
    for key,scene in scenes.items():
        if not isinstance(key,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',key) or not isinstance(scene,dict) or set(scene)-{'image','padding','seed'}:
            raise ValueError('Invalid saved mirror scene.')
        encoded=scene.get('image');padding=scene.get('padding',[0,0]);seed=scene.get('seed',0)
        if not isinstance(encoded,str): raise ValueError('Invalid mirror image.')
        total+=len(encoded)
        if total>64_000_000: raise ValueError('Mirror images exceed the 64 MB limit. Use fewer or smaller micro scenes.')
        image=decode_scene(encoded)
        pixels+=image.width*image.height
        if pixels>24_000_000: raise ValueError('Mirror images exceed the 24 megapixel limit. Use fewer or smaller scene images.')
        if not isinstance(padding,list) or len(padding)!=2 or any(type(p) is not int or p<0 or 2*p+64>s for p,s in zip(padding,image.size)):
            raise ValueError('Invalid mirror scene padding.')
        saved[key]=dict(image=encoded,padding=padding,seed=number(seed,'Scene seed',0,2147483647))
    result['scenes']=saved;result['shared_scene']=text(result['shared_scene'],'Shared scene identifier',80)
    if any(key and key not in saved for key in [result['shared_scene'],*[obj['scene'] for obj in cleaned]]):
        raise ValueError('A mirror refers to a missing scene.')
    return result


def object_matrix(obj,width,height):
    """Project a glass plane rotated X, then Y, then Z into card space.

    The returned homography maps local coordinates [-.5,.5] to card pixels.
    Size acts in object space; the camera never auto-fits rotated bounds.
    """
    angle=math.radians(obj['rotation']);c,s=math.cos(angle),math.sin(angle)
    ax=math.radians(obj.get('rotation_x',0));ay=math.radians(obj.get('rotation_y',0))
    cx3,sx3,cy3,sy3=math.cos(ax),math.sin(ax),math.cos(ay),math.sin(ay)
    shear=math.tan(math.radians(obj['skew']))
    scale=obj.get('size',100)/100
    sx=width*obj['width']/100*scale*(-1 if obj['flip_x'] else 1)
    sy=height*obj['height']/100*scale*(-1 if obj['flip_y'] else 1)
    a=c*cy3*sx;d=s*cy3*sx
    b=(c*(cy3*shear+sy3*sx3)-s*cx3)*sy
    e=(s*(cy3*shear+sy3*sx3)+c*cx3)*sy
    zu=-sy3*sx;zv=(-sy3*shear+cy3*sx3)*sy
    # Keep even oversized off-card planes in front of the projection camera.
    distance=max(max(width,height)*1.25,(abs(zu)+abs(zv))*.6)
    g,h=-zu/distance,-zv/distance;cx,cy=width*obj['x']/100,height*obj['y']/100
    return ((a+cx*g,b+cx*h,cx),(d+cy*g,e+cy*h,cy),(g,h,1))


def edge_on(obj):
    return abs(math.cos(math.radians(obj.get('rotation_x',0)))*math.cos(math.radians(obj.get('rotation_y',0))))<1e-5


def shape_polygon(shape, obj, width, height):
    (a,b,c),(d,e,f),(g,h,_)=object_matrix(obj,width,height)
    points=[(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)] if shape=='square' else [(.5*math.cos(i*math.pi/48),.5*math.sin(i*math.pi/48)) for i in range(96)]
    return [((a*x+b*y+c)/(g*x+h*y+1),(d*x+e*y+f)/(g*x+h*y+1)) for x,y in points]


def mirror_selection(options,width,height):
    scale=3 if width<=1512 else 2
    image=Image.new('L',(width*scale,height*scale));draw=ImageDraw.Draw(image)
    for obj in options['objects']:
        if not edge_on(obj) and obj.get('appearance',{}).get('strength',100)>0:draw.polygon(shape_polygon(options['shape'],obj,width*scale,height*scale),fill=255)
    return image.resize((width,height),Image.Resampling.LANCZOS)


def reflection_uv(obj,u,v,aspect=756/1056):
    """Reflect a view ray from a positioned/rotated mirror into a 2D environment.

    The artwork supplies a finite angular view, not hidden 3D scene geometry.
    atan keeps grazing rays bounded without stretching pixels along an edge.
    Object dimensions and Z rotation affect each ray's origin; X/Y set its normal.
    """
    ax,ay,az=(math.radians(obj.get(k,0)) for k in ('rotation_x','rotation_y','rotation'))
    cx,sx,cy,sy,cz,sz=math.cos(ax),math.sin(ax),math.cos(ay),math.sin(ay),math.cos(az),math.sin(az)
    nx,ny,nz=cz*sy*cx+sz*sx,sz*sy*cx-cz*sx,cy*cx
    scale=obj.get('size',100)/100
    lx=(u-.5)*obj['width']/100*aspect*scale
    ly=(v-.5)*obj['height']/100*scale
    lx+=ly*math.tan(math.radians(obj['skew']))
    px=obj['x']/100*aspect+cz*cy*lx+(cz*sy*sx-sz*cx)*ly
    py=obj['y']/100+sz*cy*lx+(sz*sy*sx+cz*cx)*ly
    pz=-sy*lx+cy*sx*ly
    dx,dy,dz=px-aspect/2,py-.5,pz-1.25
    dot=dx*nx+dy*ny+dz*nz
    rx,ry,rz=dx-2*dot*nx,dy-2*dot*ny,dz-2*dot*nz
    # Both sides use the same art environment, with a bounded 180-degree view.
    depth=max(.12,abs(rz))
    return (.5+math.atan((px-aspect/2+rx*.35/depth)/aspect*2)/math.pi,
            .5+math.atan((py-.5+ry*.35/depth)*2)/math.pi)


def light_response(obj,settings,u,v,aspect,curved):
    """Reflect a finite area light and camera from card space into each object.

    Distance determines angular size and falloff. Position and axes determine
    the reflected highlight. This runs for previews and baking, never printing.
    """
    import numpy as np
    ax,ay,az=(math.radians(obj.get(k,0)) for k in ('rotation_x','rotation_y','rotation'))
    cx,sx,cy,sy,cz,sz=math.cos(ax),math.sin(ax),math.cos(ay),math.sin(ay),math.cos(az),math.sin(az)
    rotation=np.array(((cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx),
                       (sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx),(-sy,cy*sx,cy*cx)),dtype=np.float32)
    center=np.array((obj['x']/100*aspect,obj['y']/100,0.),dtype=np.float32)
    lamp=np.array((settings['x']/100*aspect,settings['y']/100,settings['height']/100),dtype=np.float32)
    camera=np.array((aspect*.5,.5,1.8),dtype=np.float32)
    scale=obj.get('size',100)/100
    rx=obj['width']/200*aspect*scale;ry=obj['height']/200*scale
    nx=u*(-1 if obj['flip_x'] else 1);ny=v*(-1 if obj['flip_y'] else 1)
    nz=np.sqrt(np.maximum(0,1-u*u-v*v)) if curved else np.ones_like(u)
    points=np.stack((nx*rx+ny*ry*math.tan(math.radians(obj['skew'])),ny*ry,
                     nz*min(rx,ry) if curved else np.zeros_like(u)),axis=-1)
    light=(rotation.T@(lamp-center))-points
    view=(rotation.T@(camera-center))-points
    distance=np.maximum(.02,np.linalg.norm(light,axis=-1))
    light/=distance[:,:,None]
    view/=np.maximum(.02,np.linalg.norm(view,axis=-1))[:,:,None]
    half=light+view;half/=np.maximum(.001,np.linalg.norm(half,axis=-1))[:,:,None]
    if curved:
        side=1 if (rotation.T@(camera-center))[2]>=0 else -1
        dot=np.clip(nx*half[:,:,0]+ny*half[:,:,1]+nz*half[:,:,2]*side,0,1)
        facing=np.clip(nx*light[:,:,0]+ny*light[:,:,1]+nz*light[:,:,2]*side,0,1)
    else:
        dot=np.abs(half[:,:,2]);facing=np.abs(light[:,:,2])
    spread=np.arctan((settings['size']/100*.5)/distance)
    exponent=np.clip(2/np.maximum(.002,spread*spread),4,1600)
    falloff=np.clip((settings['height']/100/distance)**2,.12,1.4)*settings['strength']/100
    specular=np.power(dot,exponent)*falloff
    projection=nx*light[:,:,0]+ny*light[:,:,1]
    return specular,projection,facing*falloff,falloff


def render_mirrors(options,color,width,height,*,surfaces_only=False,layer_strength=None):
    """Render glass surfaces, then perspective-project them using shared geometry."""
    import numpy as np
    result=[] if surfaces_only else Image.new('RGBA',(width,height))
    images={key:decode_scene(scene['image']) for key,scene in options['scenes'].items()} if options.get('mirror',True) else {}
    def fitted(key,size,controls):
        image=images[key]
        if controls['flip_x']:image=image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if controls['flip_y']:image=image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        return transform_image(image,controls['rotation'],controls['zoom'],controls['skew'],size,controls['x'],controls['y'],
                               options['scenes'][key]['padding'],cover_rotation=False)
    shared=options['shared_scene'] if options.get('mirror',True) else ''
    continuous=fitted(shared,(width,height),options['image']) if shared and options['mode']=='continuous' and not options.get('mirror_angle') else None
    def coefficients(matrix):
        return tuple((matrix/matrix[2,2]).ravel()[:8])
    for obj in options['objects']:
        appearance=obj.get('appearance',{})
        tint_color=appearance.get('color',color)
        rgb=tuple(int(tint_color[i:i+2],16) for i in (1,3,5))
        if edge_on(obj) and not surfaces_only:continue
        polygon=shape_polygon(options['shape'],obj,width,height)
        l=max(0,math.floor(min(x for x,y in polygon))-2);t=max(0,math.floor(min(y for x,y in polygon))-2)
        r=min(width,math.ceil(max(x for x,y in polygon))+3);b=min(height,math.ceil(max(y for x,y in polygon))+3)
        if (r<=l or b<=t) and not surfaces_only:continue
        scale=obj.get('size',100)/100
        sw=max(32,round(width*obj['width']/100*scale));sh=max(32,round(height*obj['height']/100*scale))
        # Bound intermediate memory when a very large shape sits partly off-card.
        ratio=min(2,2048/max(sw,sh));sw=max(32,round(sw*ratio));sh=max(32,round(sh*ratio))
        matrix=np.array(object_matrix(obj,width,height),dtype=np.float64)
        if continuous is not None:
            mapping=matrix@np.array(((1/sw,0,-.5),(0,1/sh,-.5),(0,0,1)))
            surface=continuous.transform((sw,sh),Image.Transform.PERSPECTIVE,coefficients(mapping),Image.Resampling.BICUBIC)
        else:
            key=obj['scene'] if options['mode']=='individual' and options.get('mirror',True) else shared
            controls=options['image'] if options['mode']=='continuous' else obj['image']
            surface=fitted(key,(sw,sh),controls) if key else Image.new('RGBA',(sw,sh))
            if key and options.get('mirror_angle'):
                environment=fitted(key,images[key].size,controls)
                mesh=[]
                def reflected(x,y):
                    a,b=reflection_uv(obj,x/sw,y/sh,width/height)
                    return a*environment.width,b*environment.height
                for y in range(0,sh,32):
                    for x in range(0,sw,32):
                        xr=min(sw,x+32);yb=min(sh,y+32)
                        mesh.append(((x,y,xr,yb),(*reflected(x,y),*reflected(x,yb),*reflected(xr,yb),*reflected(xr,y))))
                surface=environment.transform((sw,sh),Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
        yy,xx=np.mgrid[0:sh,0:sw].astype(np.float32);u=(xx+.5)/sw*2-1;v=(yy+.5)/sh*2-1
        radius=np.sqrt(u*u+v*v)
        controls=options['image'] if options['mode']=='continuous' else obj['image']
        if options['shape']=='sphere' and (options['curvature'] or controls.get('rotation_x') or controls.get('rotation_y')):
            # Orthographic view of a sphere mapped to its spherical surface.
            # A mesh keeps Pillow's bicubic interpolation and transparent edges.
            amount=options['curvature']/100
            ax,ay=math.radians(controls.get('rotation_x',0)),math.radians(controls.get('rotation_y',0))
            cx,sx,cy,sy=math.cos(ax),math.sin(ax),math.cos(ay),math.sin(ay)
            def sample(x,y):
                ux=x/sw*2-1;vy=y/sh*2-1;rad=min(1,math.hypot(ux,vy))
                factor=1+amount*(math.asin(rad)/(math.pi/2)/max(rad,1e-6)-1)
                if ax or ay:
                    z=math.sqrt(max(0,1-ux*ux-vy*vy))
                    ux,vy,z=cy*ux+sy*(sx*vy+cx*z),cx*vy-sx*z,-sy*ux+cy*(sx*vy+cx*z)
                return (ux*factor+1)*sw/2,(vy*factor+1)*sh/2
            mesh=[];step=24
            for y in range(0,sh,step):
                for x in range(0,sw,step):
                    xr=min(sw,x+step);yb=min(sh,y+step)
                    mesh.append(((x,y,xr,yb),(*sample(x,y),*sample(x,yb),*sample(xr,yb),*sample(xr,y))))
            surface=surface.transform((sw,sh),Image.Transform.MESH,mesh,Image.Resampling.BICUBIC)
        edge=1-np.maximum(np.abs(u),np.abs(v)) if options['shape']=='square' else 1-radius
        alpha=np.clip(edge*min(sw,sh)/2+.5,0,1)
        # Layered optical shading: a clear centre, curved environment reflections,
        # an inner caustic and a thin Fresnel edge. Empty glass uses the same
        # treatment as populated mirrors, rather than disappearing without AI.
        def light(color, opacity):
            layer=np.empty((sh,sw,4),dtype=np.uint8)
            layer[:,:,:3]=color
            layer[:,:,3]=(np.clip(opacity,0,1)*255).astype(np.uint8)
            return Image.fromarray(layer)
        tint=appearance.get('tint',options['tint'])/100
        lighting={**LIGHT_DEFAULTS,**options.get('light',{})}
        light_color=tuple(int(lighting['color'][i:i+2],16) for i in (1,3,5))
        specular,direction,facing,energy=light_response(obj,lighting,u,v,width/height,options['shape']=='sphere')
        if options['shape']=='sphere':
            fresnel=np.clip(radius,0,1)**5
            outer=np.exp(-((radius-.987)/.012)**2)
            inner=np.exp(-((radius-.935)/.025)**2)
            crescent=np.exp(-((radius-.89)/.048)**2)*np.clip(direction,0,1)**3*energy
            caustic=np.exp(-((radius-.91)/.052)**2)*np.clip(-direction,0,1)**4*energy
            haze=facing*.035
            dark=np.clip(fresnel*(.2+.20*np.clip(-direction,0,1))+.035,0,.5)
            surface=Image.alpha_composite(surface,light((8,21,33),dark))
            surface=Image.alpha_composite(surface,light(rgb,tint*.48+haze))
            surface=Image.alpha_composite(surface,light(light_color,inner*(.15+.44*np.abs(direction))*energy+caustic*.65))
            surface=Image.alpha_composite(surface,light(light_color,outer*(.25+.65*np.abs(direction))*energy+crescent*.78+specular*.92))
        else:
            # Bevel facets have different light values, giving an inset mirror
            # face and visible glass thickness, as in the existing shards.
            bevel=np.clip((.065-edge)*min(sw,sh)/2,0,1)
            rim=np.exp(-((edge-.012)/.008)**2)
            inner=np.exp(-((edge-.065)/.009)**2)
            stripe=specular*.75
            surface=Image.alpha_composite(surface,light((13,28,39),.08+bevel*(.42-.22*direction)))
            surface=Image.alpha_composite(surface,light(rgb,tint*.65))
            surface=Image.alpha_composite(surface,light(light_color,bevel*np.clip(direction,0,1)*.7*energy+stripe))
            surface=Image.alpha_composite(surface,light(light_color,(rim*(.48+.4*direction)+inner*(.4-.28*direction))*energy))
        surface.putalpha(ImageChops.multiply(surface.getchannel('A'),Image.fromarray((alpha*255).astype(np.uint8))))
        if layer_strength is not None or 'strength' in appearance:
            strength=appearance.get('strength',layer_strength)
            surface.putalpha(surface.getchannel('A').point(lambda v:round(v*strength/100)))
        if surfaces_only:
            result.append((obj['id'],surface))
            continue
        mapping=np.array(((sw,0,sw/2),(0,sh,sh/2),(0,0,1)))@np.linalg.inv(matrix)@np.array(((1,0,l),(0,1,t),(0,0,1)))
        local=surface.transform((r-l,b-t),Image.Transform.PERSPECTIVE,coefficients(mapping),Image.Resampling.BICUBIC)
        result.alpha_composite(local,(l,t))
    return result
