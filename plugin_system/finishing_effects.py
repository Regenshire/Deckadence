"""Deterministic printable artwork overlays. Masks/settings remain the source of truth."""
import colorsys
from functools import lru_cache
import hashlib
from io import BytesIO
import json
import math
from pathlib import Path
import random
import re
import tempfile

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageMath
from foil_effects import custom_pattern_alpha
from paths import IMAGE_CACHE_DIR
from .finishing_wind_waves import EFFECTS as WIND_WAVE_EFFECTS, render_wind_waves
from .finishing_ukiyo import TYPES as UKIYO_TYPES, render_ukiyo
from .finishing_solar import validate_solar, render_solar, soft_light, RENDER_VERSION as SOLAR_RENDER_VERSION
from .finishing_materials import MATERIAL_EFFECTS, render_material
from .finishing_patterns import EFFECTS as PATTERN_EFFECTS, COLORS as PATTERN_COLORS, PATH_EFFECTS, RETIRED_EFFECTS, render_pattern
from .mirror_shards import validate_shards, decode_scene, render_shards, transform_image
from .mirror_layers import validate_mirrors, render_mirrors, has_strength_overrides
from .dragon_strike import EMBLEMS as DRAGON_EMBLEMS, TRAILS as DRAGON_TRAILS, LEGACY_TRAILS as LEGACY_DRAGON_TRAILS, selection as dragon_selection
from .dragon_strike import RENDER_VERSION as DRAGON_RENDER_VERSION, ALIGNMENTS as DRAGON_ALIGNMENTS
from .dragon_strike import COLOR_EFFECTS as DRAGON_COLOR_EFFECTS, color_overlay as dragon_color_overlay
from .finishing_disintegrate import validate_settings as validate_disintegrate, render_disintegrate, RENDER_VERSION as DISINTEGRATE_RENDER_VERSION
from .federation_transporter import (EMBLEMS as TRANSPORTER_EMBLEMS, STYLES as TRANSPORTER_STYLES,
    ALIGNMENTS as TRANSPORTER_ALIGNMENTS, RENDER_VERSION as TRANSPORTER_RENDER_VERSION, render_transporter,
    layout_settings as transporter_layout_settings)

CACHE_ROOT = Path(IMAGE_CACHE_DIR) / "finishing_effects"
RENDER_VERSION = 36
CONFETTI_GLITTER_TYPES = {"glitter_1":"Glitter - Type 1","glitter_2":"Glitter - Type 2","glitter_3":"Glitter - Type 3","confetti":"Confetti Foil"}
PARTICLE_PATH_EFFECTS = frozenset(('galaxy','confetti','glitter_1','glitter_2','glitter_3','halftone','stars','water_beads'))
COLOR_DEFAULTS = {'stars':'#FFF4C3','halftone':'#121930','neon':'#46F5FF','mirror_shards':'#B8EFFF','mirror_layers':'#B8EFFF','chocobo_tracks':'#FFFFFF'}
COLOR_DEFAULTS['ukiyo_e']='#FFFFFF'
COLOR_DEFAULTS['confetti_glitter']='#FFFFFF'
COLOR_DEFAULTS['dragon_strike']='#FFFFFF'
COLOR_DEFAULTS['federation_transporter']='#FFFFFF'
COLOR_DEFAULTS['raised_solar']='#E8B94F'
COLOR_DEFAULTS['disintegrate']='#FF9D35'
COLOR_DEFAULTS.update(PATTERN_COLORS)
COLOR_DEFAULTS.update(dict.fromkeys(WIND_WAVE_EFFECTS, "#FFFFFF"))
MATERIAL_PATH = Path(__file__).resolve().parents[1] / 'static/img/card-effects/fracture-foil-material-v1.png'
EFFECT_TYPES = {
    "confetti_glitter": "Confetti / Glitter",
    "stars": "Big Stars", "gold": "Gold Foil Effect", "silver": "Silver Foil Effect",
    "galaxy": "Galaxy Foil Effect", "fracture": "Fracture Foil Effect",
    "chocobo_tracks": "Chocobo Track",
    "dragon_strike": "Dragon Strike Foil",
    "federation_transporter": "Trek Transport Foil",
    "disintegrate": "Disintegrate Foil · AI Effect",
    "raised_solar": "Raised Solar Pattern",
    "pearl": "Pearlescent Wash", "etched": "Etched Metal", "watercolor": "Watercolor Texture",
    "halftone": "Halftone Dots", "neon": "Neon Edge Glow",
    **{key:label for key,label in MATERIAL_EFFECTS.items() if key not in CONFETTI_GLITTER_TYPES},
    "ukiyo_e": "Ukiyo-e Style",
    **PATTERN_EFFECTS,
    'mirror_shards':'Dark Mirror Shards · AI Effect',
    'mirror_layers':'Mirror Layers - AI Effect',
}


def validate_effect(value):
    if not isinstance(value, dict) or set(value)-{'disintegrate','color','translucence','solar','shards','mirrors','rotation','position_x','position_y','transparency','black_depth','silver_brightness','stacked','disabled','origin_x','origin_y','ukiyo_type','sparse','flip_horizontal','particle_type','dragon_emblem','dragon_trail','dragon_alignment','dragon_color_effect','transporter_emblem','transporter_style','transporter_alignment','transporter_layout'} != {"finish", "strength", "scale", "density", "seed"}:
        raise ValueError("Choose valid finishing effect settings.")
    if not isinstance(value["finish"],str) or (value["finish"] not in EFFECT_TYPES and value["finish"] not in RETIRED_EFFECTS and value["finish"] not in WIND_WAVE_EFFECTS and value["finish"] not in CONFETTI_GLITTER_TYPES):
        raise ValueError("Choose a supported finishing effect.")
    for key, low, high in (("strength", 1, 100), ("scale", 25, 1000), ("density", 1, 200), ("seed", 0, 2147483647)):
        if type(value[key]) is not int or not low <= value[key] <= high:
            raise ValueError("Choose valid effect strength, size, density, and pattern.")
    if value['finish']=='disintegrate':
        value=dict(value,disintegrate=validate_disintegrate(value.get('disintegrate',{})))
    elif 'disintegrate' in value:
        raise ValueError('Disintegration settings only apply to Disintegrate Foil.')
    if value['finish']=='raised_solar':
        value=dict(value,solar=validate_solar(value.get('solar',{})))
    elif 'solar' in value:
        raise ValueError('Solar settings only apply to Raised Solar Pattern.')
    if value['finish']=='federation_transporter':
        value=dict(value)
        for key, choices in (('transporter_emblem',TRANSPORTER_EMBLEMS),('transporter_style',TRANSPORTER_STYLES),('transporter_alignment',TRANSPORTER_ALIGNMENTS)):
            chosen=value.get(key,next(iter(choices)))
            if not isinstance(chosen,str) or chosen not in choices:
                raise ValueError('Choose a valid transporter emblem, effect and path alignment.')
            value[key]=chosen
        if 'transporter_layout' in value:
            value['transporter_layout'] = transporter_layout_settings(value)
    elif {'transporter_emblem','transporter_style','transporter_alignment','transporter_layout'} & set(value):
        raise ValueError('Transporter settings only apply to Trek Transport Foil.')
    if value['finish']=='dragon_strike':
        value=dict(value)
        for key, choices in (('dragon_emblem',DRAGON_EMBLEMS),('dragon_trail',DRAGON_TRAILS),('dragon_alignment',DRAGON_ALIGNMENTS),('dragon_color_effect',DRAGON_COLOR_EFFECTS)):
            chosen=value.get(key,next(iter(choices)))
            if not isinstance(chosen,str) or chosen not in choices and not (key=='dragon_trail' and chosen in LEGACY_DRAGON_TRAILS):
                raise ValueError('Choose a valid Dragon Strike Foil emblem, path, alignment and color effect.')
            value[key]=chosen
    elif {'dragon_emblem','dragon_trail','dragon_alignment','dragon_color_effect'} & set(value):
        raise ValueError('Dragon settings only apply to Dragon Strike Foil.')
    if value['finish']=='ukiyo_e':
        value=dict(value)
        key=value.get('ukiyo_type','wind_ribbons')
        if not isinstance(key,str) or key not in UKIYO_TYPES:
            raise ValueError('Choose a valid Ukiyo-e type.')
        value['ukiyo_type']=key
        for key in ('sparse','flip_horizontal'):
            if type(value.get(key,False)) is not bool:
                raise ValueError('Ukiyo-e toggles must be booleans.')
            value[key]=value.get(key,False)
    elif {'ukiyo_type','sparse'} & set(value):
        raise ValueError('Ukiyo-e settings only apply to Ukiyo-e Style.')
    if value['finish']=='confetti_glitter':
        value=dict(value)
        kind=value.get('particle_type','glitter_1')
        if not isinstance(kind,str) or kind not in CONFETTI_GLITTER_TYPES:
            raise ValueError('Choose a valid Confetti / Glitter type.')
        value['particle_type']=kind
        value['flip_horizontal']=value.get('flip_horizontal',False)
    elif 'particle_type' in value:
        raise ValueError('Particle type only applies to Confetti / Glitter.')
    if 'flip_horizontal' in value and (value['finish'] not in ('ukiyo_e','confetti_glitter') or type(value['flip_horizontal']) is not bool):
        raise ValueError('Horizontal flip must be a boolean for a grouped effect.')
    if 'disabled' in value and type(value['disabled']) is not bool:
        raise ValueError('Effect disabled must be a boolean.')
    if 'stacked' in value and (value['finish'] not in ('flame_1','flame_2') or type(value['stacked']) is not bool):
        raise ValueError('Stacked flames must be a boolean for a flame effect.')
    if value['finish'] == 'ripple':
        value = dict(value)
        for key, default in (('origin_x',20),('origin_y',72)):
            number = value.get(key,default)
            if type(number) is not int or not 0 <= number <= 100:
                raise ValueError('Choose a ripple origin from 0 to 100%.')
            value[key] = number
    elif {'origin_x','origin_y'} & set(value):
        raise ValueError('Origin settings only apply to Ripple Foil.')
    color=value.get('color',COLOR_DEFAULTS.get(value['finish'],'#FFE7A0'))
    if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color):
        raise ValueError('Choose a valid effect color.')
    if value['finish']=='raised_solar':
        value=dict(value,solar=validate_solar(value['solar'],color))
    translucence=value.get('translucence',0)
    rotation=value.get('rotation',0)
    if type(rotation) is not int or not -180<=rotation<=180:
        raise ValueError('Choose an effect rotation from -180 to 180 degrees.')
    if type(translucence) is not int or not 0 <= translucence <= 100:
        raise ValueError('Choose translucence from 0 to 100%.')
    if value['finish']=='mirror_shards':
        value=dict(value,shards=validate_shards(value.get('shards',{})))
    elif 'shards' in value:
        raise ValueError('Shard settings only apply to Dark Mirror Shards.')
    if value['finish']=='mirror_layers':
        value=dict(value,mirrors=validate_mirrors(value.get('mirrors',{})))
    elif 'mirrors' in value:
        raise ValueError('Mirror object settings only apply to Mirror Layers.')
    track_keys={'position_x','position_y','transparency'}
    if value['finish'] in ('chocobo_tracks','dragon_strike','federation_transporter','ukiyo_e','confetti_glitter') or value['finish'] in PATH_EFFECTS:
        value=dict(value)
        for key,low,high in (('position_x',-100,100),('position_y',-100,100),('transparency',0,100)):
            number=value.get(key,0)
            if type(number) is not int or not low<=number<=high:
                raise ValueError('Choose valid pattern position and transparency settings.')
            value[key]=number
    elif track_keys & set(value):
        raise ValueError('Position and transparency only apply to shape patterns.')
    if value['finish']=='silver_black':
        value=dict(value)
        for key,default in (('black_depth',0),('silver_brightness',90)):
            number=value.get(key,default)
            if type(number) is not int or not 0<=number<=100:
                raise ValueError('Choose black depth and silver brightness from 0 to 100%.')
            value[key]=number
    elif {'black_depth','silver_brightness'} & set(value):
        raise ValueError('Black depth and silver brightness only apply to Silver & Black Art.')
    return dict(value,color=color.upper(),translucence=translucence,rotation=rotation)


def parameters(value):
    return {**{key: value[key] for key in ("finish", "strength", "scale", "density", "seed")},
            'color':value.get('color',COLOR_DEFAULTS.get(value['finish'],'#FFE7A0')),
            'translucence':value.get('translucence',0),
            'rotation':value.get('rotation',0),
            'disabled':value.get('disabled',False),
            **({'disintegrate':validate_disintegrate(value.get('disintegrate',{}))} if value['finish']=='disintegrate' else {}),
            **({'solar':validate_solar(value.get('solar',{}),value.get('color',COLOR_DEFAULTS['raised_solar']))} if value['finish']=='raised_solar' else {}),
            **({'transporter_emblem':value.get('transporter_emblem','tos_badge'),'transporter_style':value.get('transporter_style','multicolor'),'transporter_alignment':value.get('transporter_alignment','emblem')} if value['finish']=='federation_transporter' else {}),
            **({'transporter_layout':value['transporter_layout']} if value['finish']=='federation_transporter' and 'transporter_layout' in value else {}),
            **({'dragon_emblem':value.get('dragon_emblem','bolas_command'),'dragon_trail':value.get('dragon_trail','winding_magic')} if value['finish']=='dragon_strike' else {}),
            # Preserve the hash of saved bakes from before alignment was selectable.
            **({'dragon_alignment':value['dragon_alignment']} if value['finish']=='dragon_strike' and 'dragon_alignment' in value else {}),
            **({'dragon_color_effect':value['dragon_color_effect']} if value['finish']=='dragon_strike' and 'dragon_color_effect' in value else {}),
            **({'particle_type':value.get('particle_type','glitter_1'),'flip_horizontal':value.get('flip_horizontal',False)} if value['finish']=='confetti_glitter' else {}),
            **({'ukiyo_type':value.get('ukiyo_type','wind_ribbons'),'sparse':value.get('sparse',False),'flip_horizontal':value.get('flip_horizontal',False)} if value['finish']=='ukiyo_e' else {}),
            **({'origin_x':value.get('origin_x',20),'origin_y':value.get('origin_y',72)} if value['finish']=='ripple' else {}),
            **({'stacked':value.get('stacked',False)} if value['finish'] in ('flame_1','flame_2') else {}),
            **({'black_depth':value.get('black_depth',0),'silver_brightness':value.get('silver_brightness',90)} if value['finish']=='silver_black' else {}),
            **({key:value.get(key,0) for key in ('position_x','position_y','transparency')} if value['finish'] in ('chocobo_tracks','dragon_strike','federation_transporter','ukiyo_e','confetti_glitter') or value['finish'] in PATH_EFFECTS else {}),
            **({'shards':value.get('shards',{})} if value['finish']=='mirror_shards' else {}),
            **({'mirrors':value.get('mirrors',{})} if value['finish']=='mirror_layers' else {})}


def visual_parameters(value):
    """Only inputs that change pixels; future generation instructions are metadata."""
    result = parameters(value)
    if 'disintegrate' in result:
        result['disintegrate'] = {key: item for key, item in result['disintegrate'].items() if key != 'prompt'}
    if 'mirrors' in result:
        mirrors = dict(result['mirrors'])
        for key in ('target', 'variation', 'theme', 'prompt', 'maintain_style', 'layout', 'layout_seed', 'layout_origin'):
            mirrors.pop(key, None)
        mirrors['objects'] = [{key: item for key, item in obj.items()
                               if key not in ('prompt', 'theme', 'style', 'home', 'focus')}
                              for obj in mirrors.get('objects', [])]
        result['mirrors'] = mirrors
    if 'shards' in result:
        keys = ('template', 'mirror', 'scene', 'tint', 'scene_rotation', 'scene_zoom', 'scene_skew',
                'template_scale', 'scene_x', 'scene_y', 'scene_padding', 'template_x', 'template_y',
                'scene_flip_horizontal', 'scene_flip_vertical')
        result['shards'] = {key: item for key, item in result['shards'].items() if key in keys}
    return result


def translucence_amount(effect):
    if effect.get('finish')=='raised_solar':return 1-effect.get('solar',{}).get('opacity',0)/100
    if effect.get('finish')=='oil_slick':return 1
    if effect.get('finish')=='neon_ink':return .85
    return effect.get('translucence',0)/100 if effect.get('finish')=='fracture' else 0


def needs_backdrop(effect):
    return effect.get('finish')=='silver_black' or bool(translucence_amount(effect))


def composite_overlay(backdrop, overlay, effect):
    if effect.get('finish')=='silver_black':
        # Match the preview's grayscale, exposure, contrast and silver ceiling,
        # clipping between operations. Coverage/strength stay in the mask.
        gray=backdrop.convert('RGB').convert('L',(.2126,.7152,.0722,0))
        contrast=1+effect.get('density',100)*.0035
        black=effect.get('black_depth',0)*.006
        silver=effect.get('silver_brightness',90)/100
        def tone(p):
            exposed=max(0,min(255,(min(255,p*1.5)-127.5)*contrast+127.5))
            return round(max(0,(exposed-255*black)/(1-black))*silver)
        gray=gray.point(tone)
        result=gray.convert('RGBA');result.putalpha(overlay.getchannel('A'))
        return result
    return blend_overlay(backdrop,overlay,translucence_amount(effect),
                         mode='soft-light' if effect.get('finish')=='raised_solar' else 'color')


def _color_blend(backdrop, source):
    """PDF/CSS Color blend: source hue/chroma, backdrop luminance (SetLum)."""
    # Bound float intermediates at print resolution; the blend is pixel-local.
    if source.height>256:
        result=Image.new('RGB',source.size)
        for top in range(0,source.height,256):
            box=(0,top,source.width,min(source.height,top+256))
            result.paste(_color_blend(backdrop.crop(box),source.crop(box)),(0,top))
        return result
    backdrop_bands=[band.convert('F') for band in backdrop.convert('RGB').split()]
    lum=ImageMath.lambda_eval(lambda a:a['r']*.3+a['g']*.59+a['b']*.11,
                             r=backdrop_bands[0],g=backdrop_bands[1],b=backdrop_bands[2])
    bands=[band.convert('F') for band in source.convert('RGB').split()]
    def clip(args):
        r,g,b,l=args['r'],args['g'],args['b'],args['l']
        delta=l-(r*.3+g*.59+b*.11)
        values=[r+delta,g+delta,b+delta]
        low=args['min'](args['min'](*values[:2]),values[2])
        high=args['max'](args['max'](*values[:2]),values[2])
        component=values[args['channel']]
        corrected=l+(component-l)*l/args['max'](l-low,.00001)
        component=component*(low>=0)+corrected*(low<0)
        corrected=l+(component-l)*(255-l)/args['max'](high-l,.00001)
        return args['convert'](component*(high<=255)+corrected*(high>255),'L')
    return Image.merge('RGB',[ImageMath.lambda_eval(clip,r=bands[0],g=bands[1],b=bands[2],l=lum,channel=i) for i in range(3)])


def blend_overlay(backdrop, overlay, translucence, *, mode='color'):
    """Bake the two preview blend passes into one exportable RGBA layer."""
    if not translucence:
        return overlay
    normal=overlay.copy()
    normal.putalpha(overlay.getchannel('A').point(lambda v:round(v*(1-translucence))))
    beneath=Image.alpha_composite(backdrop.convert('RGBA'),normal)
    glaze=(soft_light(beneath,overlay) if mode=='soft-light' else _color_blend(beneath,overlay)).convert('RGBA')
    glaze.putalpha(overlay.getchannel('A').point(lambda v:round(v*translucence)))
    return Image.alpha_composite(normal,glaze)


def _rainbow(rng, alpha=255):
    return (*[round(v * 255) for v in colorsys.hsv_to_rgb(rng.random(), .28 + rng.random() * .6, .85 + rng.random() * .15)], alpha)


def _watercolor_rainbow(rng, alpha=255):
    return (*[round(v * 255) for v in colorsys.hsv_to_rgb(rng.random(), .65 + rng.random() * .3, 1)], alpha)


def chocobo_selection(width, height, scale=100, rotation=0, position_x=0, position_y=0):
    """The original SVG tracks, shared by the printable layer and Copy Path.

    Preserve the original proportions and placement; per-layer size/rotation
    are independent of the legacy global foil settings.
    """
    pattern_width=max(1,round(width*scale/100))
    alpha=custom_pattern_alpha('chocobo',pattern_width)
    left,top=round((width-pattern_width)/2),round(height*.0224)
    cx,cy=width/2,height/2
    dx,dy=round(width*position_x/100),round(height*position_y/100)
    angle=math.radians(rotation);c,s=math.cos(angle),math.sin(angle)
    # Inverse of rotation around the card center, then screen-axis translation.
    # Transform the full SVG raster so moving a large pattern can reveal tracks
    # that were outside the card before the move.
    return alpha.transform((width,height),Image.Transform.AFFINE,
        (c,s,cx-left-c*(cx+dx)-s*(cy+dy),-s,c,cy-top+s*(cx+dx)-c*(cy+dy)),
        Image.Resampling.BICUBIC)


def _chocobo_overlay(width, height, effect):
    if effect['finish']=='dragon_strike' and effect.get('dragon_color_effect','normal')!='normal':
        alpha=dragon_selection(width,height,effect['scale'],effect['rotation'],effect['position_x'],effect['position_y'],effect['dragon_emblem'],effect['dragon_trail'],effect.get('dragon_alignment','dragon'))
        return dragon_color_overlay(alpha,effect['dragon_color_effect'],effect['color'])
    # Use the original print foil's reflected colors, tinted by this layer.
    gradient = Image.new('RGB', (128, 128))
    gradient.putdata([tuple(round(c * 255) for c in colorsys.hsv_to_rgb(
        ((x + y * .55) / 160) % 1, .45, 1)) for y in range(128) for x in range(128)])
    image = ImageChops.multiply(gradient.resize((width, height), Image.Resampling.BICUBIC),
                               Image.new('RGB', (width, height), effect['color'])).convert('RGBA')
    if effect['finish']=='dragon_strike':
        alpha=dragon_selection(width,height,effect['scale'],effect['rotation'],effect['position_x'],effect['position_y'],effect['dragon_emblem'],effect['dragon_trail'],effect.get('dragon_alignment','dragon'))
    else:
        alpha=chocobo_selection(width,height,effect['scale'],effect['rotation'],effect['position_x'],effect['position_y'])
    image.putalpha(alpha)
    return image


@lru_cache(maxsize=1)
def _fracture_material():
    with Image.open(MATERIAL_PATH) as source:
        return source.convert('RGBA')


@lru_cache(maxsize=3)
def _texture(finish, scale, density, seed, width, height, color='#FFE7A0', stacked=False):
    if finish in MATERIAL_EFFECTS or finish=='galaxy':
        return render_material(finish,scale,density,seed,width,height,stacked=stacked)
    if finish == "watercolor" and width > 756:
        return _texture(finish,scale,density,seed,756,1056,color).resize((width,height),Image.Resampling.LANCZOS)
    rng = random.Random(seed)
    image = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(image)
    # 100% is the useful, visible default. Size remains independent of output DPI.
    unit, size, amount = width / 756, scale / 100, density / 100
    chosen=tuple(int(color[i:i+2],16) for i in (1,3,5))
    def point(x, y): return (x * unit, y * unit)
    def polygon(points, color): draw.polygon([point(x,y) for x,y in points], fill=color)
    def dot(x,y,r,color): draw.ellipse((*point(x-r,y-r), *point(x+r,y+r)),fill=color)
    def star(x,y,r,color):
        polygon([(x + math.cos(i*math.pi/4)*r*(1 if i%2==0 else .2),
                  y + math.sin(i*math.pi/4)*r*(1 if i%2==0 else .2)) for i in range(8)],color)
    if finish in ("gold", "silver", "pearl", "etched"):
        # Smooth broad highlights plus fine brushed lines, rendered at output size.
        small = Image.new("RGBA", (128, 180)); pixels=[]
        for y in range(180):
            for x in range(128):
                light = .52 + .27*math.sin(x*.08+y*.045) + .18*math.cos(x*.19-y*.12)
                if finish=="gold": color=(int(145+110*light),int(85+155*light),int(20+140*light),255)
                elif finish=="pearl":
                    rgb=colorsys.hsv_to_rgb((x/200+y/300)%1,.22,.95)
                    color=(*[int(v*255) for v in rgb],int(90+80*light))
                else: color=(*[int(85+170*light)]*3,185 if finish=="etched" else 255)
                pixels.append(color)
        small.putdata(pixels); image=small.resize((width,height),Image.Resampling.BICUBIC);draw=ImageDraw.Draw(image)
        if finish in ("pearl", "etched"):
            for _ in range(int((2300 if finish=="etched" else 750)*amount)):
                x,y=rng.uniform(0,756),rng.uniform(0,1056)
                length=rng.uniform(6,75)*size
                draw.line([point(x,y),point(x+length,y+(length*.32 if finish=="etched" else 0))],
                          fill=(250,244,213,rng.randint(30,90)),width=max(1,round(unit*.3)))
    elif finish=="watercolor":
        for _ in range(int(50*amount)):
            x,y=rng.uniform(-50,806),rng.uniform(-50,1106);r=rng.uniform(75,210)*size
            patch=Image.new("RGBA",image.size);pd=ImageDraw.Draw(patch)
            points=[point(x+math.cos(a*math.pi/10)*r*rng.uniform(.65,1.1),y+math.sin(a*math.pi/10)*r*rng.uniform(.65,1.1)) for a in range(20)]
            pd.polygon(points,fill=_watercolor_rainbow(rng,rng.randint(75,145)))
            image=Image.alpha_composite(image,patch.filter(ImageFilter.GaussianBlur(9*unit*size)))
    elif finish=="halftone":
        step=12*size
        for row in range(int(1056/step)+1):
            for col in range(int(756/step)+1):
                x=(col+(row%2)*.5)*step;y=row*step
                radius=step*.18*amount*(1.2+.65*math.sin(x/80+y/95))
                dot(x,y,min(step*.47,radius),(*chosen,200))
    elif finish=="fracture":
        # The material is opaque at full strength; the artwork never shows
        # through its gaps. Mirrored repeats avoid a hard seam on large masks.
        source=_fracture_material()
        tile_w=max(32,round(width*.82*size/math.sqrt(amount)))
        tile_h=round(tile_w*source.height/source.width)
        offset_x,offset_y=rng.randrange(tile_w),rng.randrange(tile_h)
        tiles={(x,y):(ImageOps.flip(ImageOps.mirror(source)) if x and y else ImageOps.mirror(source) if x else ImageOps.flip(source) if y else source) for x in (0,1) for y in (0,1)}
        for row,y in enumerate(range(-offset_y,height,tile_h)):
            for col,x in enumerate(range(-offset_x,width,tile_w)):
                left,top,right,bottom=max(0,x),max(0,y),min(width,x+tile_w),min(height,y+tile_h)
                extent=((left-x)*source.width/tile_w,(top-y)*source.height/tile_h,
                        (right-x)*source.width/tile_w,(bottom-y)*source.height/tile_h)
                # Only allocate the visible tile region, even at maximum size.
                crop=tiles[(col%2,row%2)].transform((right-left,bottom-top),Image.Transform.EXTENT,extent,Image.Resampling.BICUBIC)
                image.paste(crop,(left,top))
    elif finish!="neon":
        count={"glitter_1":16000,"glitter_2":4200,"glitter_3":2300,"stars":95}[finish]
        for _ in range(int(count*amount/(size*size))):
            x,y=rng.uniform(0,756),rng.uniform(0,1056)
            r=rng.uniform(.35,1.2)*size
            color=_rainbow(rng,rng.randint(130,255))
            if finish=="glitter_1":
                dot(x,y,r,(255,241,rng.randint(175,255),rng.randint(90,250)))
            elif finish=="glitter_2":
                r*=2.4;polygon([(x-r,y),(x,y-r),(x+r,y),(x,y+r)],color)
            elif finish=="glitter_3":
                star(x,y,r*3.7,color)
            elif finish=="stars":
                star(x,y,r*13,(*chosen,245));dot(x,y,r*1.6,(255,255,255,255))
    return image


def particle_selection(finish, width, height, scale=100, density=100, seed=0, rotation=0):
    """Reuse rendered geometry at full coverage, before any painted selection."""
    if finish not in PARTICLE_PATH_EFFECTS:
        raise ValueError('This effect has no copyable particle shapes.')
    if finish in ('galaxy','confetti','water_beads'):
        alpha=render_material(finish,scale,density,seed,width,height,selection=True).getchannel('A')
    else:
        # These textures draw discrete shapes directly. Their varying opacity
        # is lighting, not geometry; Copy Path keeps every shape at full strength.
        alpha=_texture(finish,scale,density,seed,width,height).getchannel('A').point(lambda a:255 if a else 0)
    return transform_image(alpha,rotation,cover_rotation=False)


def render_confetti_glitter(effect,width,height,selection=False):
    kind=effect.get('particle_type','glitter_1')
    if selection:
        image=particle_selection(kind,width,height,effect['scale'],effect['density'],effect['seed'])
    else:
        image=_texture(kind,effect['scale'],effect['density'],effect['seed'],width,height).copy()
        if effect['color'].upper()!='#FFFFFF':
            rgb=tuple(int(effect['color'][i:i+2],16) for i in (1,3,5))
            tinted=ImageChops.multiply(image.convert('RGB'),Image.new('RGB',image.size,rgb)).convert('RGBA')
            tinted.putalpha(image.getchannel('A'));image=tinted
    if effect.get('flip_horizontal',False):image=ImageOps.mirror(image)
    return transform_image(image,effect.get('rotation',0),offset_x=effect.get('position_x',0),offset_y=effect.get('position_y',0),cover_rotation=False)


def render_overlay(mask_png, effect, width=None):
    effect=validate_effect(effect)
    with Image.open(BytesIO(mask_png)) as source:
        width=min(3024,width or source.width)
        size=(width,round(width*source.height/source.width))
        alpha=source.getchannel("A").resize(size,Image.Resampling.LANCZOS)
    if (effect['finish']=='mirror_layers' or effect['finish']=='federation_transporter' and 'transporter_layout' in effect) and not alpha.getbbox():
        # No mask means unrestricted placement. A nonempty mask still clips
        # every glass/image pixel, identically in preview and PDF export.
        alpha=Image.new('L',size,255)
    if effect.get('disabled',False):
        output=BytesIO();Image.new('RGBA',size).save(output,format='PNG');return output.getvalue()
    if effect['finish']=='disintegrate':
        # The saved subject cutout defines what disappears. The Studio mask
        # limits the effect area; an empty mask means the whole card.
        image=render_disintegrate(effect,alpha)
        image.putalpha(image.getchannel('A').point(lambda a:round(a*effect['strength']/100)))
        output=BytesIO();image.save(output,format='PNG');return output.getvalue()
    unit=width/756
    if effect['finish']=='raised_solar':
        image=render_solar(effect,*size)
    elif effect['finish']=='confetti_glitter':
        image=render_confetti_glitter(effect,*size)
    elif effect['finish']=='ukiyo_e':
        image=render_ukiyo(effect,*size)
    elif effect['finish'] in WIND_WAVE_EFFECTS:
        image=render_wind_waves(effect['finish'],effect['scale'],effect['density'],effect['seed'],*size,color=effect['color'])
    elif effect['finish'] in PATTERN_EFFECTS or effect['finish'] in RETIRED_EFFECTS:
        image=render_pattern(effect,*size)
    elif effect['finish']=='mirror_layers':
        image=render_mirrors(effect['mirrors'],effect['color'],*size,
                             layer_strength=effect['strength'] if has_strength_overrides(effect['mirrors']) else None)
    elif effect['finish']=='mirror_shards':
        options=effect['shards']
        scene=decode_scene(options['scene']) if options['mirror'] else None
        image=render_shards(options['template'],effect['color'],options['tint'],*size,scene=scene,
                            rotation=effect['rotation'],scene_rotation=options['scene_rotation'],
                            scene_zoom=options['scene_zoom'],scene_skew=options['scene_skew'],template_scale=options['template_scale'],
                            scene_x=options['scene_x'],scene_y=options['scene_y'],scene_padding=options['scene_padding'],
                            template_x=options['template_x'],template_y=options['template_y'],
                            scene_flip_horizontal=options['scene_flip_horizontal'],scene_flip_vertical=options['scene_flip_vertical'])
    elif effect['finish']=='federation_transporter':
        image=render_transporter(effect,*size)
    elif effect['finish'] in ('chocobo_tracks','dragon_strike'):
        image=_chocobo_overlay(*size,effect)
    elif effect["finish"]=="neon":
        # A clear interior with a luminous inner edge; never paints outside the mask.
        radius=max(3,round(5*effect["scale"]/100*unit))|1
        # Repeated 3x3 erosion has the same square footprint as the original
        # large minimum filter, with bounded work at print resolution.
        eroded=alpha
        for _ in range((radius-1)//2):eroded=eroded.filter(ImageFilter.MinFilter(3))
        edge=ImageChops.subtract(alpha,eroded)
        glow=ImageChops.lighter(edge,edge.filter(ImageFilter.GaussianBlur(5*unit*effect["scale"]/100)))
        glow=glow.point(lambda v:min(255,round(v*2.2*effect["density"]/100)))
        rgb=tuple(int(effect["color"][i:i+2],16) for i in (1,3,5))
        image=Image.new("RGBA",size,rgb);image.putalpha(glow)
    else:
        image=_texture(effect["finish"],effect["scale"],effect["density"],effect["seed"],*size,effect["color"],effect.get("stacked",False)).copy()
    if effect['finish'] not in ('raised_solar','mirror_layers','mirror_shards','chocobo_tracks','dragon_strike','federation_transporter','silver_black','neon_ink','ripple','ukiyo_e','confetti_glitter') and effect['finish'] not in PATH_EFFECTS:
        image=transform_image(image,effect['rotation'],cover_rotation=False)
    image.putalpha(ImageChops.multiply(image.getchannel('A'),alpha))
    if effect['finish']!='mirror_layers' or not has_strength_overrides(effect['mirrors']):
        image.putalpha(image.getchannel("A").point(lambda v:round(v*effect["strength"]/100)))
    if effect['finish'] in ('chocobo_tracks','dragon_strike','federation_transporter','ukiyo_e','confetti_glitter') or effect['finish'] in PATH_EFFECTS:
        image.putalpha(image.getchannel('A').point(lambda v:round(v*(1-effect['transparency']/100))))
    if effect['finish'] in ('mirror_shards','mirror_layers'):
        # Generated scenes are detailed even behind transparent gaps. Drop only
        # fully hidden RGB so cached/print PNGs need not retain those pixels.
        image.paste((0,0,0,0),mask=image.getchannel('A').point(lambda v:255 if v==0 else 0))
    output=BytesIO();image.save(output,format="PNG");return output.getvalue()


def renderer_version(effect):
    if effect['finish']=='disintegrate':
        return RENDER_VERSION*1000+DISINTEGRATE_RENDER_VERSION
    if effect['finish']=='raised_solar':
        return RENDER_VERSION*1000+SOLAR_RENDER_VERSION
    if effect['finish']=='federation_transporter':
        return RENDER_VERSION*1000+TRANSPORTER_RENDER_VERSION
    # A Dragon Strike geometry fix must not force unrelated effects to rebake.
    return RENDER_VERSION*1000+DRAGON_RENDER_VERSION if effect['finish']=='dragon_strike' else RENDER_VERSION


def cached_overlay(mask_png, effect, width=1512):
    texture_parameters=visual_parameters(effect)
    texture_parameters.pop('translucence')  # Applied over the artwork at display/export time.
    key=hashlib.sha256(mask_png+json.dumps([renderer_version(effect),texture_parameters,width],sort_keys=True).encode()).hexdigest()
    CACHE_ROOT.mkdir(parents=True,exist_ok=True)
    target=CACHE_ROOT/(key+".png")
    if not target.is_file():
        data=render_overlay(mask_png,parameters(effect),width)
        with tempfile.NamedTemporaryFile(dir=CACHE_ROOT,suffix=".tmp",delete=False) as output:
            temporary=Path(output.name);output.write(data)
        try: temporary.replace(target)
        finally: temporary.unlink(missing_ok=True)
        # A disposable cache; backups only need masks and settings.
        files=[]
        for path in CACHE_ROOT.glob('*.png'):
            try: files.append((path.stat().st_mtime,path))
            except FileNotFoundError: pass
        files=[path for _,path in sorted(files,reverse=True)]
        for old in files[256:]:
            if old!=target: old.unlink(missing_ok=True)
    return target


def composite_effects(image, layers, trim_size=None, *, extend_bleed=False):
    """Place saved effect pixels, with an optional centered trim footprint."""
    from .finishing_bakes import saved_overlay
    result=image.convert("RGBA")
    size=trim_size or image.size
    offset=((image.width-size[0])//2,(image.height-size[1])//2)
    for layer in layers:
        overlay=Image.open(BytesIO(layer['png'] if layer.get('finish')=='art_edit' else saved_overlay(layer)))
        overlay=overlay.resize(size,Image.Resampling.LANCZOS)
        if extend_bleed and size != image.size:
            # Continue the edge pixels into print bleed, matching the artwork.
            padded=Image.new('RGBA',image.size)
            padded.paste(overlay,offset)
            x,y=offset;w,h=size
            for left,top,right,bottom,box in (
                (0,y,x,y+h,(0,0,1,h)), (x+w,y,image.width,y+h,(w-1,0,w,h))):
                if right>left:padded.paste(overlay.crop(box).resize((right-left,bottom-top)),(left,top))
            if y:padded.paste(padded.crop((0,y,image.width,y+1)).resize((image.width,y)),(0,0))
            bottom=image.height-y-h
            if bottom>0:padded.paste(padded.crop((0,y+h-1,image.width,y+h)).resize((image.width,bottom)),(0,y+h))
            result=Image.alpha_composite(result,composite_overlay(result,padded,layer))
        else:
            backdrop=result.crop((*offset,offset[0]+size[0],offset[1]+size[1]))
            result.alpha_composite(composite_overlay(backdrop,overlay,layer),offset)
    return result.convert(image.mode)
