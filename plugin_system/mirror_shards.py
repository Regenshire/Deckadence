"""Exact glass templates shared by generated-scene clipping and glass overlays."""
from functools import lru_cache
import base64
from io import BytesIO
from pathlib import Path
import math
import re
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw, ImageChops, UnidentifiedImageError

TEMPLATES={'falling':'Falling shards','impact':'Mirror impact','diagonal':'Diagonal split','frame':'Fractured frame',
           'radiant':'Radiant burst','spell':'Spell splinters','cascade':'Crystal cascade','revelation':'Mirror revelation'}
THEMES={
    'dark':'Dark','spooky':'Spooky','normal':'Normal','modern':'Modern',
    'echo':'Echo','angelic':'Angelic','demonic':'Demonic','custom':'Custom',
}
ASSET_ROOT=Path(__file__).resolve().parents[1]/'static/img/card-effects/mirror-shards'
SCENE_SELECTION_BYTES=756*1056//8


def validate_custom_prompt(prompt):
    if not isinstance(prompt,str) or len(prompt)>1000:
        raise ValueError('Use a custom theme prompt of up to 1,000 characters.')
    return prompt.strip()


def expanded_scene_geometry(size,margin):
    """Symmetric background padding, bounded by the saved scene image limits."""
    factor=1+margin/50
    scale=min(1,4096/(size[0]*factor),6144/(size[1]*factor))
    core=tuple(max(64,math.floor(v*scale)) for v in size)
    padding=tuple(math.floor(v*margin/100) for v in core)
    return tuple(v+2*p for v,p in zip(core,padding)),padding


def validate_shards(value):
    if not isinstance(value,dict) or set(value)-{'template','template_scale','template_x','template_y','theme','mirror','tint','scene','scene_theme','scene_source','scene_selection','scene_rotation','scene_zoom','scene_skew','scene_x','scene_y','scene_flip_horizontal','scene_flip_vertical','custom_prompt','scene_custom_prompt','prompt_details','scene_prompt_details','outpaint_margin','scene_margin','scene_padding','maintain_style','scene_maintain_style'}:
        raise ValueError('Choose valid mirror shard settings.')
    value={'template':'falling','theme':'dark','mirror':False,'tint':18,'scene':'',**value}
    value.setdefault('scene_theme',value['theme'])
    value.setdefault('scene_source','')
    value.setdefault('scene_selection','')
    value.setdefault('scene_rotation',0)
    for key in ('scene_flip_horizontal','scene_flip_vertical'):
        value.setdefault(key,False)
        if type(value[key]) is not bool:
            raise ValueError('Choose a valid horizontal or vertical image flip.')
    value.setdefault('scene_margin',0)
    value.setdefault('outpaint_margin',value['scene_margin'] if value['scene'] else 30)
    value.setdefault('scene_padding',[0,0])
    value.setdefault('maintain_style',not bool(value['scene']))
    value.setdefault('scene_maintain_style',False)
    for key in ('maintain_style','scene_maintain_style'):
        if type(value[key]) is not bool:raise ValueError('Choose whether to maintain the source art style.')
    for key in ('custom_prompt','scene_custom_prompt','prompt_details','scene_prompt_details'):
        value[key]=validate_custom_prompt(value.get(key,''))
    for key in ('outpaint_margin','scene_margin'):
        if type(value[key]) is not int or not 0<=value[key]<=100:
            raise ValueError('Choose an outpainting margin from 0 to 100%.')
    padding=value['scene_padding']
    if not isinstance(padding,(list,tuple)) or len(padding)!=2 or any(type(v) is not int or v<0 for v in padding):
        raise ValueError('The rendered scene has invalid background padding.')
    value.setdefault('template_scale',100)
    if type(value['template_scale']) is not int or not 25<=value['template_scale']<=200:
        raise ValueError('Choose a shard size from 25 to 200%.')
    for key in ('scene_x','scene_y','template_x','template_y'):
        value.setdefault(key,0)
        if type(value[key]) is not int or not -100<=value[key]<=100:
            raise ValueError('Choose shard and image positions from -100 to 100%.')
    if type(value['scene_rotation']) is not int or not -180<=value['scene_rotation']<=180:
        raise ValueError('Choose an alternate image rotation from -180 to 180 degrees.')
    for key,default,low,high in (('scene_zoom',100,50,300),('scene_skew',0,-60,60)):
        value.setdefault(key,default)
        if type(value[key]) is not int or not low<=value[key]<=high:
            raise ValueError('Choose image zoom from 50 to 300% and skew from -60 to 60 degrees.')
    if not isinstance(value['template'],str) or not isinstance(value['theme'],str) or value['template'] not in TEMPLATES or value['theme'] not in THEMES:
        raise ValueError('Choose a mirror template and theme.')
    if type(value['mirror']) is not bool or type(value['tint']) is not int or not 0<=value['tint']<=100:
        raise ValueError('Choose a valid mirror state and tint from 0 to 100%.')
    if not isinstance(value['scene'],str) or len(value['scene'])>20_000_000:
        raise ValueError('The rendered mirror scene is too large.')
    if value['scene']:
        scene=decode_scene(value['scene'])
        if any(v-2*p<64 for v,p in zip(scene.size,padding)):
            raise ValueError('The rendered scene has invalid background padding.')
    if value['mirror'] and not value['scene']:
        raise ValueError('Generate a mirror scene before applying Mirror.')
    if not isinstance(value['scene_theme'],str) or value['scene_theme'] not in THEMES:
        raise ValueError('The rendered scene has an invalid theme.')
    if value['mirror'] and value['scene_theme']!=value['theme']:
        raise ValueError('Generate a new mirror scene for the selected theme.')
    if value['mirror'] and value['maintain_style']!=value['scene_maintain_style']:
        raise ValueError('Generate a new mirror scene to apply the art style setting.')
    if value['mirror'] and value['prompt_details']!=value['scene_prompt_details']:
        raise ValueError('Generate a new mirror scene to apply the additional prompt details.')
    if value['mirror'] and (value['outpaint_margin']!=value['scene_margin'] or
                           value['theme']=='custom' and (not value['custom_prompt'] or value['custom_prompt']!=value['scene_custom_prompt'])):
        raise ValueError('Generate a new mirror scene for the selected prompt and outpainting margin.')
    if not isinstance(value['scene_source'],str) or not re.fullmatch(r'(?:[0-9a-f]{8})?',value['scene_source']):
        raise ValueError('The rendered scene has an invalid artwork signature.')
    selection=value['scene_selection']
    if not isinstance(selection,str) or len(selection) not in (0,SCENE_SELECTION_BYTES*4//3):
        raise ValueError('The rendered scene has an invalid generation selection.')
    if selection:
        try:
            if len(base64.b64decode(selection,validate=True))!=SCENE_SELECTION_BYTES:
                raise ValueError('The rendered scene has an invalid generation selection.')
        except base64.binascii.Error as exc:
            raise ValueError('The rendered scene has an invalid generation selection.') from exc
    return value


def decode_scene(encoded):
    try:
        raw=base64.b64decode(encoded,validate=True)
        with Image.open(BytesIO(raw)) as source:
            if source.format!='PNG' or not 64<=source.width<=4096 or not 64<=source.height<=6144:
                raise ValueError('Use a rendered PNG scene up to 4096 x 6144 pixels.')
            return source.convert('RGBA')
    except (OSError,UnidentifiedImageError,base64.binascii.Error) as exc:
        raise ValueError('The rendered mirror scene could not be read.') from exc


@lru_cache(maxsize=8)
def shard_polygons(template):
    if template not in TEMPLATES:
        raise ValueError('Choose a mirror shard template.')
    root=ET.parse(ASSET_ROOT/(template+'.svg')).getroot()
    polygons=[]
    for node in root.findall('{http://www.w3.org/2000/svg}polygon'):
        polygons.append(tuple(tuple(float(v) for v in point.split(',')) for point in node.attrib['points'].split()))
    return tuple(polygons)


def rotated_polygons(template,width,height,rotation=0,scale=100,offset_x=0,offset_y=0):
    """Scale and rotate about the card center, then translate in card axes."""
    dx,dy=width*offset_x/100,height*offset_y/100
    if rotation%360==0 and scale==100:
        return [[(x*width/1000+dx,y*height/1400+dy) for x,y in polygon] for polygon in shard_polygons(template)]
    angle=math.radians(rotation);c,s=math.cos(angle)*scale/100,math.sin(angle)*scale/100
    cx,cy=width/2,height/2
    return [[(cx+(x*width/1000-cx)*c-(y*height/1400-cy)*s+dx,
              cy+(x*width/1000-cx)*s+(y*height/1400-cy)*c+dy) for x,y in polygon]
            for polygon in shard_polygons(template)]


def transform_image(image,degrees=0,zoom=100,skew=0,output_size=None,offset_x=0,offset_y=0,content_padding=(0,0),cover_rotation=True):
    """Center rotation and horizontal shear, with 100% zoom covering the canvas.

    Zoom below 100% deliberately reveals space around the alternate image.
    Transform only the artwork; shard geometry and the user's mask stay fixed.
    """
    width,height=output_size or image.size;cx,cy=width/2,height/2
    source_width,source_height=image.size
    core_width,core_height=source_width-2*content_padding[0],source_height-2*content_padding[1]
    if not any(content_padding) and degrees%360==0 and zoom==100 and skew==0 and offset_x==0 and offset_y==0 and source_width*height==source_height*width:
        return image if image.size==(width,height) else image.resize((width,height),Image.Resampling.LANCZOS)
    angle=math.radians(degrees);c,s=math.cos(angle),math.sin(angle)
    shear=math.tan(math.radians(skew))
    # Inverse of rotation * horizontal shear, for Pillow's output-to-input map.
    a,b,d,e=c+shear*s,s-shear*c,-s,c
    # Cover-fit the original artwork without stretching it. Retain off-canvas
    # source pixels so zooming out can reveal the rest of a landscape art crop.
    # Fit the protected center, leaving generated background outside the normal
    # view for translation/zoom. Fitting the whole padded PNG would lose it.
    scale=max((abs(a)*width+abs(b)*height)/core_width,
              (abs(d)*width+abs(e)*height)/core_height)*zoom/100
    if not cover_rotation:
        # Effect rotation changes orientation only, never the pattern size.
        scale=max(width/core_width,height/core_height)*zoom/100
    a,b,d,e=a/scale,b/scale,d/scale,e/scale
    cx+=width*offset_x/100;cy+=height*offset_y/100
    return image.transform((width,height),Image.Transform.AFFINE,
                           (a,b,source_width/2-a*cx-b*cy,d,e,source_height/2-d*cx-e*cy),Image.Resampling.BICUBIC)


def _edge_sampling(width):
    # Resolve fractional coverage even for high-resolution print masks, while
    # keeping the working surfaces bounded at larger output sizes.
    return 4 if width<=756 else 3 if width<=1512 else 2


def shard_selection(template,width,height,rotation=0,scale=100,offset_x=0,offset_y=0):
    sampling=_edge_sampling(width)
    mask=Image.new('L',(width*sampling,height*sampling))
    draw=ImageDraw.Draw(mask)
    for polygon in rotated_polygons(template,width,height,rotation,scale,offset_x,offset_y):
        draw.polygon([(x*sampling,y*sampling) for x,y in polygon],fill=255)
    return mask.resize((width,height),Image.Resampling.LANCZOS)


def render_shards(template,color,tint,width,height,scene=None,rotation=0,scene_rotation=0,scene_zoom=100,scene_skew=0,template_scale=100,scene_x=0,scene_y=0,scene_padding=(0,0),template_x=0,template_y=0,scene_flip_horizontal=False,scene_flip_vertical=False):
    """Render clean glass or one aligned scene inside the same exact shards.

    `scene` is already-generated artwork, never a procedural AI substitute.
    Selection masks and layer strength are applied by the common effect renderer.
    """
    rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
    unit=width/756*template_scale/100
    sampling=_edge_sampling(width)
    result=Image.new('RGBA',(width,height))
    if scene is not None:
        # Flip the saved artwork on its own axes before rotation/placement.
        # The symmetric generated margin and shard geometry stay aligned.
        scene=scene.convert('RGBA')
        if scene_flip_horizontal:scene=scene.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if scene_flip_vertical:scene=scene.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        # Keep scene scale independent of its angle; the generated margin is
        # available to cover exposed edges without automatically zooming in.
        result=transform_image(scene,scene_rotation,scene_zoom,scene_skew,output_size=(width,height),offset_x=scene_x,offset_y=scene_y,content_padding=scene_padding,cover_rotation=False)
        # Clip the scene without making its transparent pixels opaque. Glass
        # reflections still render over those areas as they do in glass mode.
        result.putalpha(ImageChops.multiply(result.getchannel('A'),shard_selection(template,width,height,rotation,template_scale,template_x,template_y)))
    glass=Image.new('RGBA',result.size)
    for index,points in enumerate(rotated_polygons(template,width,height,rotation,template_scale,template_x,template_y)):
        padding=max(2,math.ceil(2*unit)+2)
        left=max(0,math.floor(min(x for x,y in points))-padding)
        top=max(0,math.floor(min(y for x,y in points))-padding)
        right=min(width,math.ceil(max(x for x,y in points))+padding+1)
        bottom=min(height,math.ceil(max(y for x,y in points))+padding+1)
        if right<=left or bottom<=top:continue
        local=[((x-left)*sampling,(y-top)*sampling) for x,y in points]
        shape=Image.new('L',((right-left)*sampling,(bottom-top)*sampling));ImageDraw.Draw(shape).polygon(local,fill=255)
        # Thin transparent panes, with a broad reflection across the face.
        surface=Image.new('RGBA',(32,32))
        pixels=[]
        for y in range(32):
            for x in range(32):
                band=max(0,1-abs(x/31+y/48-((index%4)*.15+.4))/.22)
                alpha=round(tint*.9+band*27)
                pixels.append((*[round(c+(255-c)*band*.45) for c in rgb],min(120,alpha)))
        surface.putdata(pixels)
        surface=surface.resize(shape.size,Image.Resampling.BICUBIC)
        surface.putalpha(ImageChops.multiply(surface.getchannel('A'),shape))
        edge=ImageDraw.Draw(surface)
        cx=sum(x for x,y in local)/len(local);cy=sum(y for x,y in local)/len(local)
        inset=[(cx+(x-cx)*.94,cy+(y-cy)*.94) for x,y in local]
        edge.line(local+[local[0]],fill=(8,20,35,125),width=max(1,round(4*unit*sampling)))
        for i,(start,end) in enumerate(zip(local,local[1:]+local[:1])):
            light=(end[0]-start[0])-(end[1]-start[1])>0
            bevel=tuple(min(255,round(c*.65+88)) for c in rgb) if light else tuple(round(c*.36) for c in rgb)
            edge.polygon([start,end,inset[(i+1)%len(inset)],inset[i]],fill=(*bevel,165 if light else 115))
            edge.line([start,end],fill=(*([min(255,c+55) for c in rgb] if light else [round(c*.55) for c in rgb]),225 if light else 170),width=max(1,round(2.1*unit*sampling)))
            edge.line([inset[i],inset[(i+1)%len(inset)]],fill=(245,255,255,200 if light else 65),width=max(1,round(.85*unit*sampling)))
        if template in ('radiant','spell','cascade','revelation'):
            # Traced glass has concave notches; keep its bevel inside the pane.
            surface.putalpha(ImageChops.multiply(surface.getchannel('A'),shape))
        # Downsample the glass as RGBA so edge colors stay clean on both light
        # and dark artwork; the scene itself stays at its native resolution.
        glass.alpha_composite(surface.resize((right-left,bottom-top),Image.Resampling.LANCZOS),(left,top))
    return Image.alpha_composite(result,glass)
