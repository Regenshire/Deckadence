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
    'echo':'Echo','angelic':'Angelic','demonic':'Demonic',
}
ASSET_ROOT=Path(__file__).resolve().parents[1]/'static/img/card-effects/mirror-shards'
SCENE_SELECTION_BYTES=756*1056//8


def validate_shards(value):
    if not isinstance(value,dict) or set(value)-{'template','theme','mirror','tint','scene','scene_theme','scene_source','scene_selection','scene_rotation','scene_zoom','scene_skew'}:
        raise ValueError('Choose valid mirror shard settings.')
    value={'template':'falling','theme':'dark','mirror':False,'tint':18,'scene':'',**value}
    value.setdefault('scene_theme',value['theme'])
    value.setdefault('scene_source','')
    value.setdefault('scene_selection','')
    value.setdefault('scene_rotation',0)
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
    if value['scene']:decode_scene(value['scene'])
    if value['mirror'] and not value['scene']:
        raise ValueError('Generate a mirror scene before applying Mirror.')
    if not isinstance(value['scene_theme'],str) or value['scene_theme'] not in THEMES:
        raise ValueError('The rendered scene has an invalid theme.')
    if value['mirror'] and value['scene_theme']!=value['theme']:
        raise ValueError('Generate a new mirror scene for the selected theme.')
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


def rotated_polygons(template,width,height,rotation=0):
    if rotation%360==0:
        return [[(x*width/1000,y*height/1400) for x,y in polygon] for polygon in shard_polygons(template)]
    angle=math.radians(rotation);c,s=math.cos(angle),math.sin(angle)
    cx,cy=width/2,height/2
    return [[(cx+(x*width/1000-cx)*c-(y*height/1400-cy)*s,
              cy+(x*width/1000-cx)*s+(y*height/1400-cy)*c) for x,y in polygon]
            for polygon in shard_polygons(template)]


def transform_image(image,degrees=0,zoom=100,skew=0):
    """Center rotation and horizontal shear, with 100% zoom covering the canvas.

    Zoom below 100% deliberately reveals space around the alternate image.
    Transform only the artwork; shard geometry and the user's mask stay fixed.
    """
    if degrees%360==0 and zoom==100 and skew==0:return image
    width,height=image.size;cx,cy=width/2,height/2
    angle=math.radians(degrees);c,s=math.cos(angle),math.sin(angle)
    shear=math.tan(math.radians(skew))
    # Inverse of rotation * horizontal shear, for Pillow's output-to-input map.
    a,b,d,e=c+shear*s,s-shear*c,-s,c
    scale=max(abs(a)+abs(b)*height/width,abs(d)*width/height+abs(e))*zoom/100
    a,b,d,e=a/scale,b/scale,d/scale,e/scale
    return image.transform(image.size,Image.Transform.AFFINE,
                           (a,b,cx-a*cx-b*cy,d,e,cy-d*cx-e*cy),Image.Resampling.BICUBIC)


def shard_selection(template,width,height,rotation=0):
    mask=Image.new('L',(width,height))
    draw=ImageDraw.Draw(mask)
    for polygon in rotated_polygons(template,width,height,rotation):
        draw.polygon(polygon,fill=255)
    return mask


def render_shards(template,color,tint,width,height,scene=None,rotation=0,scene_rotation=0,scene_zoom=100,scene_skew=0):
    """Render clean glass or one aligned scene inside the same exact shards.

    `scene` is already-generated artwork, never a procedural AI substitute.
    Selection masks and layer strength are applied by the common effect renderer.
    """
    rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
    unit=width/756
    result=Image.new('RGBA',(width,height))
    if scene is not None:
        result=scene.convert('RGBA').resize((width,height),Image.Resampling.LANCZOS)
        result=transform_image(result,scene_rotation,scene_zoom,scene_skew)
        # Clip the scene without making its transparent pixels opaque. Glass
        # reflections still render over those areas as they do in glass mode.
        result.putalpha(ImageChops.multiply(result.getchannel('A'),shard_selection(template,width,height,rotation)))
    glass=Image.new('RGBA',result.size)
    for index,points in enumerate(rotated_polygons(template,width,height,rotation)):
        left=max(0,math.floor(min(x for x,y in points))-2)
        top=max(0,math.floor(min(y for x,y in points))-2)
        right=min(width,math.ceil(max(x for x,y in points))+3)
        bottom=min(height,math.ceil(max(y for x,y in points))+3)
        if right<=left or bottom<=top:continue
        local=[(x-left,y-top) for x,y in points]
        shape=Image.new('L',(right-left,bottom-top));ImageDraw.Draw(shape).polygon(local,fill=255)
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
        edge.line(local+[local[0]],fill=(8,20,35,125),width=max(1,round(4*unit)))
        for i,(start,end) in enumerate(zip(local,local[1:]+local[:1])):
            light=(end[0]-start[0])-(end[1]-start[1])>0
            bevel=tuple(min(255,round(c*.65+88)) for c in rgb) if light else tuple(round(c*.36) for c in rgb)
            edge.polygon([start,end,inset[(i+1)%len(inset)],inset[i]],fill=(*bevel,165 if light else 115))
            edge.line([start,end],fill=(*([min(255,c+55) for c in rgb] if light else [round(c*.55) for c in rgb]),225 if light else 170),width=max(1,round(2.1*unit)))
            edge.line([inset[i],inset[(i+1)%len(inset)]],fill=(245,255,255,200 if light else 65),width=max(1,round(.85*unit)))
        if template in ('radiant','spell','cascade','revelation'):
            # Traced glass has concave notches; keep its bevel inside the pane.
            surface.putalpha(ImageChops.multiply(surface.getchannel('A'),shape))
        glass.alpha_composite(surface,(left,top))
    return Image.alpha_composite(result,glass)
