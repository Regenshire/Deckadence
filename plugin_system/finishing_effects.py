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
from paths import IMAGE_CACHE_DIR
from .finishing_materials import MATERIAL_EFFECTS, render_material

CACHE_ROOT = Path(IMAGE_CACHE_DIR) / "finishing_effects"
RENDER_VERSION = 8
COLOR_DEFAULTS = {'stars':'#FFF4C3','halftone':'#121930','neon':'#46F5FF'}
MATERIAL_PATH = Path(__file__).resolve().parents[1] / 'static/img/card-effects/fracture-foil-material-v1.png'
EFFECT_TYPES = {
    "glitter_1": "Glitter - Type 1", "glitter_2": "Glitter - Type 2", "glitter_3": "Glitter - Type 3",
    "stars": "Big Stars", "gold": "Gold Foil Effect", "silver": "Silver Foil Effect",
    "galaxy": "Galaxy Foil Effect", "fracture": "Fracture Foil Effect",
    "pearl": "Pearlescent Wash", "etched": "Etched Metal", "watercolor": "Watercolor Texture",
    "halftone": "Halftone Dots", "neon": "Neon Edge Glow",
    **MATERIAL_EFFECTS,
}


def validate_effect(value):
    if not isinstance(value, dict) or set(value)-{'color','translucence'} != {"finish", "strength", "scale", "density", "seed"}:
        raise ValueError("Choose valid finishing effect settings.")
    if not isinstance(value["finish"],str) or value["finish"] not in EFFECT_TYPES:
        raise ValueError("Choose a supported finishing effect.")
    for key, low, high in (("strength", 1, 100), ("scale", 25, 200), ("density", 25, 200), ("seed", 0, 2147483647)):
        if type(value[key]) is not int or not low <= value[key] <= high:
            raise ValueError("Choose valid effect strength, size, density, and pattern.")
    color=value.get('color',COLOR_DEFAULTS.get(value['finish'],'#FFE7A0'))
    if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color):
        raise ValueError('Choose a valid effect color.')
    translucence=value.get('translucence',0)
    if type(translucence) is not int or not 0 <= translucence <= 100:
        raise ValueError('Choose translucence from 0 to 100%.')
    return dict(value,color=color.upper(),translucence=translucence)


def parameters(value):
    return {**{key: value[key] for key in ("finish", "strength", "scale", "density", "seed")},
            'color':value.get('color',COLOR_DEFAULTS.get(value['finish'],'#FFE7A0')),
            'translucence':value.get('translucence',0)}


def translucence_amount(effect):
    return effect.get('translucence',0)/100 if effect.get('finish')=='fracture' else 0


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


def blend_overlay(backdrop, overlay, translucence):
    """Bake the two preview blend passes into one exportable RGBA layer."""
    if not translucence:
        return overlay
    normal=overlay.copy()
    normal.putalpha(overlay.getchannel('A').point(lambda v:round(v*(1-translucence))))
    beneath=Image.alpha_composite(backdrop.convert('RGBA'),normal)
    glaze=_color_blend(beneath,overlay).convert('RGBA')
    glaze.putalpha(overlay.getchannel('A').point(lambda v:round(v*translucence)))
    return Image.alpha_composite(normal,glaze)


def _rainbow(rng, alpha=255):
    return (*[round(v * 255) for v in colorsys.hsv_to_rgb(rng.random(), .28 + rng.random() * .6, .85 + rng.random() * .15)], alpha)


def _watercolor_rainbow(rng, alpha=255):
    return (*[round(v * 255) for v in colorsys.hsv_to_rgb(rng.random(), .65 + rng.random() * .3, 1)], alpha)


@lru_cache(maxsize=1)
def _fracture_material():
    with Image.open(MATERIAL_PATH) as source:
        return source.convert('RGBA')


@lru_cache(maxsize=3)
def _texture(finish, scale, density, seed, width, height, color='#FFE7A0'):
    if finish in MATERIAL_EFFECTS or finish=='galaxy':
        return render_material(finish,scale,density,seed,width,height)
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


def render_overlay(mask_png, effect, width=None):
    effect=validate_effect(effect)
    with Image.open(BytesIO(mask_png)) as source:
        width=min(3024,width or source.width)
        size=(width,round(width*source.height/source.width))
        alpha=source.getchannel("A").resize(size,Image.Resampling.LANCZOS)
    unit=width/756
    if effect["finish"]=="neon":
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
        image=Image.new("RGBA",size,rgb);image.putalpha(ImageChops.multiply(glow,alpha))
    else:
        image=_texture(effect["finish"],effect["scale"],effect["density"],effect["seed"],*size,effect["color"]).copy()
        image.putalpha(ImageChops.multiply(image.getchannel("A"),alpha))
    image.putalpha(image.getchannel("A").point(lambda v:round(v*effect["strength"]/100)))
    output=BytesIO();image.save(output,format="PNG");return output.getvalue()


def cached_overlay(mask_png, effect, width=1512):
    texture_parameters=parameters(effect)
    texture_parameters.pop('translucence')  # Applied over the artwork at display/export time.
    key=hashlib.sha256(mask_png+json.dumps([RENDER_VERSION,texture_parameters,width],sort_keys=True).encode()).hexdigest()
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


def composite_effects(image, layers, trim_size=None):
    """Composite ordered artwork layers, with an optional centered trim footprint."""
    result=image.convert("RGBA")
    size=trim_size or image.size
    offset=((image.width-size[0])//2,(image.height-size[1])//2)
    for layer in layers:
        overlay=Image.open(BytesIO(render_overlay(layer['png'],parameters(layer),min(3024,size[0]))))
        overlay=overlay.resize(size,Image.Resampling.LANCZOS)
        backdrop=result.crop((*offset,offset[0]+size[0],offset[1]+size[1]))
        result.alpha_composite(blend_overlay(backdrop,overlay,translucence_amount(layer)),offset)
    return result.convert(image.mode)
