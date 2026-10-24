"""Seeded woodblock cloud and wave overlays, with genuinely sparse variants."""
from functools import lru_cache
import math
from pathlib import Path
import random
from PIL import Image, ImageOps, ImageChops, ImageColor

DESIGNS = {
    'wind_ribbons': 'Wind ribbons',
    'wind_curls': 'Curling clouds',
    'wind_storm': 'Storm canopy',
    'wind_painted': 'Painted Clouds',
    'waves_swells': 'Rolling swells',
    'waves_crests': 'Breaking crests',
    'waves_field': 'Layered wave field',
}
EFFECTS = {}
for key, name in DESIGNS.items():
    EFFECTS[key] = ('Wind - ' if key.startswith('wind_') else 'Waves - ') + name
    EFFECTS[key + '_sparse'] = ('Wind Spare - ' if key.startswith('wind_') else 'Wave Sparse - ') + name
ASSETS = Path(__file__).resolve().parents[1] / 'static/img/card-effects'


@lru_cache(maxsize=7)
def motif(key):
    with Image.open(ASSETS / (key.replace('_','-') + '-v1.png')) as image:
        result = image.convert('RGBA')
    bounds = result.getchannel('A').point(lambda a:255 if a > 8 else 0).getbbox()
    if not bounds:
        raise ValueError('The wind/wave motif is empty.')
    return result.crop(bounds)


def placements(finish, scale, density, seed):
    rng = random.Random(seed)
    sparse = finish.endswith('_sparse')
    size, amount = scale / 100, density / 100
    if sparse:
        count = max(1, round(5 * amount))
        columns = max(1, math.ceil(math.sqrt(count * 756 / 1056)))
        rows = math.ceil(count / columns)
        slots = [(x,y) for y in range(rows) for x in range(columns)]
        rng.shuffle(slots)
        for x,y in slots[:count]:
            yield ((x+rng.uniform(.35,.65))*756/columns,
                   (y+rng.uniform(.35,.65))*1056/rows,
                   rng.uniform(235,290)*size, rng.random()<.5)
    else:
        if amount < .1:
            yield 378,528,530*size,rng.random()<.5
            return
        pitch_x = 360*size/math.sqrt(amount)
        pitch_y = 225*size/math.sqrt(amount)
        # Include overscan so the dense family reaches every card edge.
        for row in range(-1,math.ceil(1056/pitch_y)+1):
            for col in range(-1,math.ceil(756/pitch_x)+1):
                yield ((col + (.5 if row%2 else 0) + rng.uniform(-.12,.12))*pitch_x,
                       (row+rng.uniform(-.12,.12))*pitch_y,
                       rng.uniform(490,570)*size, rng.random()<.5)


def render_wind_waves(finish, scale, density, seed, width, height, color="#FFFFFF"):
    key = finish.removesuffix('_sparse')
    source = motif(key)
    # White is neutral; multiply RGB without changing motif transparency.
    if color.upper() != "#FFFFFF":
        tinted = ImageChops.multiply(source.convert("RGB"), Image.new("RGB", source.size, ImageColor.getrgb(color))).convert("RGBA")
        tinted.putalpha(source.getchannel("A"))
        source = tinted
    mirrored = ImageOps.mirror(source)
    canvas = Image.new('RGBA',(width,height))
    unit = width/756
    for x,y,extent,flip in placements(finish,scale,density,seed):
        sprite = mirrored if flip else source
        target_width = extent*unit
        target_height = target_width*sprite.height/sprite.width
        left,top = x*unit-target_width/2,y*height/1056-target_height/2
        x0,y0 = max(0,math.floor(left)),max(0,math.floor(top))
        x1,y1 = min(width,math.ceil(left+target_width)),min(height,math.ceil(top+target_height))
        if x1<=x0 or y1<=y0:
            continue
        # Sample only the visible region: 1000% patterns never allocate giant sprites.
        sx,sy = sprite.width/target_width,sprite.height/target_height
        visible = sprite.transform((x1-x0,y1-y0),Image.Transform.AFFINE,
            (sx,0,(x0-left)*sx,0,sy,(y0-top)*sy),Image.Resampling.BICUBIC)
        canvas.alpha_composite(visible,(x0,y0))
    return canvas
