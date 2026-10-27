"""Transporter artwork shared by preview, saved print pixels and Copy Path."""
from functools import lru_cache
from io import BytesIO
import colorsys
import math
from pathlib import Path
import random
import re

from PIL import Image, ImageChops, ImageDraw, ImageFilter

EMBLEMS = {
    'tos_badge': 'TOS Badge',
    'tng_badge': 'TNG Communicator Badge',
    'generations_badge': 'Generations Communicator Badge',
    'federation': 'Federation of Planets',
    'starfleet': 'Starfleet Command',
    'borg': 'Borg Emblem',
    'klingon': 'Klingon Emblem',
    'romulan': 'Romulan Emblem',
}
STYLES = {'multicolor': 'Multi-color Transporter Effect',
          'tos': 'TOS Transporter Effect', 'tng': 'TNG Transporter Effect',
          'none': 'Emblem only'}
ALIGNMENTS = {'emblem': 'Starts at emblem', 'bottom': 'Bottom of Card'}
RENDER_VERSION = 3
ASSETS = Path(__file__).resolve().parents[1] / 'static/img/card-effects/federation-transporter'
# Canonical geometry keeps random details stable across preview and print sizes.
# The affine transform never allocates a giant intermediate for the size slider.
SIZE = (1512, 2112)


@lru_cache(maxsize=4)
def _emblem(key, mode, pixels):
    import cairosvg
    # Render real vector paths at print resolution, with a consistent box and
    # preserved aspect ratio for tall badges and wide insignia alike.
    data = cairosvg.svg2png(url=str(ASSETS / f'{key}-{mode}.svg'),
                           output_width=pixels, output_height=round(pixels*340/370))
    return Image.open(BytesIO(data)).convert('RGBA')


BEAM_DEFAULTS = dict(x=50, y=41, width=100, height=82, size=100, rotation=0,
                     strength=100, color='#FFFFFF', density=100, style='multicolor',
                     cascade=35, base_rounding=0)
EMBLEM_DEFAULTS = dict(x=50, y=82, size=100, rotation=0, strength=100,
                       color='#FFFFFF', color_mode='single')


def layout_settings(effect):
    """Validate independent objects; v1 settings still load without data loss."""
    value = effect.get('transporter_layout')
    if value is None and 'transporter_layout' not in effect:
        # Keep the old layer-wide transform/strength for old saved records.
        # New clients explicitly move those values into the independent objects.
        return dict(version=1, beams=[] if effect.get('transporter_style') == 'none' else
                    [dict(BEAM_DEFAULTS, id='beam1', density=effect.get('density', 100),
                          style=effect.get('transporter_style', 'multicolor'))],
                    emblem=dict(EMBLEM_DEFAULTS, color_mode='multi'))
    if not isinstance(value, dict) or set(value) != {'version', 'beams', 'emblem'} or type(value['version']) is not int or value['version'] != 1:
        raise ValueError('Choose valid Trek Transport Foil settings.')
    beams = value['beams']
    if not isinstance(beams, list) or len(beams) > 8:
        raise ValueError('Choose up to eight transporter beams.')
    def component(raw, defaults, beam=False):
        allowed = set(defaults) | ({'id'} if beam else set())
        if not isinstance(raw, dict) or set(raw) - allowed:
            raise ValueError('Choose valid transporter component settings.')
        item = {**defaults, **raw}
        limits = [('x', -100, 200), ('y', -100, 200), ('size', 10, 500),
                  ('rotation', -180, 180), ('strength', 0, 100)]
        if beam:
            limits += [('width', 1, 200), ('height', 1, 200), ('density', 1, 200),
                       ('cascade', 0, 100), ('base_rounding', 0, 100)]
            if not isinstance(item.get('id'), str) or not re.fullmatch(r'beam[0-9]{1,8}', item['id']):
                raise ValueError('Choose a valid transporter beam identifier.')
            if not isinstance(item['style'], str) or item['style'] not in STYLES or item['style'] == 'none':
                raise ValueError('Choose a transporter beam style.')
        elif not isinstance(item['color_mode'], str) or item['color_mode'] not in ('single', 'multi'):
            raise ValueError('Choose single-color or multi-color emblems.')
        for key, low, high in limits:
            number = item[key]
            if type(number) not in (int, float) or not math.isfinite(number) or not low <= number <= high:
                raise ValueError(f'Transporter {key} must be between {low} and {high}.')
            item[key] = round(number, 3)
        if not isinstance(item['color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', item['color']):
            raise ValueError('Choose a valid transporter color.')
        item['color'] = item['color'].upper()
        return item
    result = dict(version=1, beams=[component(item, BEAM_DEFAULTS, True) for item in beams],
                  emblem=component(value['emblem'], EMBLEM_DEFAULTS))
    if len({item['id'] for item in result['beams']}) != len(result['beams']):
        raise ValueError('Each transporter beam must have its own identifier.')
    return result


def _rainbow(x):
    # Magenta -> red -> gold -> green -> cyan -> blue, as in the reference.
    hue = (.88 + x*.78) % 1
    return tuple(round(c*255) for c in colorsys.hsv_to_rgb(hue, .8, 1))


@lru_cache(maxsize=8)
def _beam(style, density, seed, alignment, cascade=35, base_rounding=0):
    width, height = SIZE
    bottom = 1.02
    top = -.035
    image = Image.new('RGBA', SIZE)
    if style == 'none':
        return image
    rng = random.Random(seed)
    # Broad translucent columns, with a soft perimeter and no opaque backdrop.
    small = Image.new('RGBA', (189, 264))
    pixels = []
    for y in range(small.height):
        ny = y/(small.height-1)
        end = min(1, max(0, (bottom-ny)/.075))
        for x in range(small.width):
            nx = x/(small.width-1)
            edge = max(0, 1-abs((nx-.5)/.405)**6)
            if style == 'multicolor':
                rgb = _rainbow((nx-.095)/.81)
                light = .6+.4*math.sin(nx*94+math.sin(nx*13))**2
                alpha = round(122*edge*end*light)
            elif style == 'tos':
                rgb = (255, 187, 53)
                # Uneven gold patches between clear gaps, not a uniform wash.
                cloud = max(0, math.sin(nx*35+math.sin(ny*21))*math.cos(ny*31+nx*13))
                alpha = round(100*edge*end*cloud)
            else:
                rgb = (129, 139, 255)
                alpha = round(31*edge*end)
            pixels.append((*rgb, alpha))
    small.putdata(pixels)
    image = small.resize(SIZE, Image.Resampling.BICUBIC)
    light = Image.new('RGBA', SIZE)
    draw = ImageDraw.Draw(light)
    count = round((85 if style == 'multicolor' else 145)*density/100)
    if style != 'tos':
        for _ in range(count):
            nx = rng.uniform(.12, .88)
            start = rng.uniform(0, .42)*cascade/100
            stop = bottom-rng.uniform(0, .025)
            if style == 'multicolor':
                rgb = _rainbow((nx-.095)/.81)
                rgb = tuple(round(c*.45+255*.55) for c in rgb)
            else:
                rgb = rng.choice([(203, 245, 255), (213, 204, 255), (242, 252, 255)])
            line_width = rng.choice([1, 1, 2, 2, 3, 5])
            draw.line((nx*width, start*height, nx*width, stop*height),
                      fill=(*rgb, rng.randint(90, 225)), width=line_width)
    # Sparkles cluster along the column, with TOS's much denser gold granules.
    count = round({'tos': 8500, 'tng': 1200, 'multicolor': 420}[style]*density/100)
    for _ in range(count):
        nx = rng.uniform(.115, .885)
        ny = rng.uniform(max(0, top), min(1, bottom))
        edge = max(0, 1-abs((nx-.5)/.39)**4)
        end = min(1, max(0, (bottom-ny)/.055))
        if style == 'tos':
            cluster = .65+.35*abs(math.sin(nx*29+math.sin(ny*19))*math.cos(ny*24))
            radius = rng.uniform(.7, 4.5)
            rgb = rng.choice([(255, 199, 66), (255, 226, 132), (255, 246, 196)])
        else:
            cluster = .55+.45*math.sin(ny*17+nx*8)**2
            radius = rng.uniform(1.4, 5) if style == 'tng' else rng.uniform(1, 3.5)
            if style == 'tng' and rng.random() < .16:
                radius *= 1.8
            rgb = (224, 246, 255) if style == 'tng' else (255, 250, 230)
        alpha = round(rng.randint(140, 255)*edge*end*cluster)
        x, y = nx*width, ny*height
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=(*rgb, alpha))
        if style != 'tos' and rng.random() < .2:
            draw.line((x, y-radius*3.6, x, y+radius*3.6), fill=(*rgb, alpha), width=1)
            draw.line((x-radius*2, y, x+radius*2, y), fill=(*rgb, alpha), width=1)
    # Blurring premultiplied color avoids dark outlines on pale artwork.
    glow = light.convert('RGBa').filter(ImageFilter.GaussianBlur(8 if style == 'tng' else 3)).convert('RGBA')
    glow.putalpha(glow.getchannel('A').point(lambda a: min(255, round(a*(1.8 if style == 'tng' else .9)))))
    image = Image.alpha_composite(Image.alpha_composite(image, glow), light)
    # Stepped column tops and an elliptical lower edge shape the entire beam,
    # including its glow, so stray particles never escape the chosen outline.
    shape = Image.new('L', (378, 528))
    shape_rng = random.Random(seed + 19471)
    steps = [shape_rng.uniform(.04, .95) for _ in range(31)]
    pixels = []
    for y in range(shape.height):
        ny = y/(shape.height-1)
        for x in range(shape.width):
            nx = x/(shape.width-1)
            start = steps[min(30, int(nx*31))]*.42*cascade/100
            horizontal = min(1, abs((nx-.5)/.405))
            end = 1-.42*base_rounding/100*(1-math.sqrt(1-horizontal*horizontal))
            top_alpha = 1 if cascade == 0 else min(1, max(0, (ny-start)/.008))
            base_alpha = 1 if base_rounding == 0 else min(1, max(0, (end-ny)/.008))
            pixels.append(round(255*top_alpha*base_alpha))
    shape.putdata(pixels)
    image.putalpha(ImageChops.multiply(image.getchannel('A'), shape.resize(SIZE, Image.Resampling.LANCZOS)))
    return image


def _place(target, source, settings):
    """Transform only the visible bounds, keeping many narrow beams inexpensive."""
    width, height = target.size
    cx, cy = width*settings['x']/100, height*settings['y']/100
    tw = width*settings['width']/100*settings['size']/100
    th = height*settings['height']/100*settings['size']/100
    angle = math.radians(settings['rotation'])
    c, s = math.cos(angle), math.sin(angle)
    half_w, half_h = (abs(c)*tw+abs(s)*th)/2, (abs(s)*tw+abs(c)*th)/2
    left, top = max(0, math.floor(cx-half_w)), max(0, math.floor(cy-half_h))
    right, bottom = min(width, math.ceil(cx+half_w)), min(height, math.ceil(cy+half_h))
    if right <= left or bottom <= top or not settings['strength']:
        return
    a, b = c*source.width/tw, s*source.width/tw
    d, e = -s*source.height/th, c*source.height/th
    transform = (a, b, source.width/2+a*(left-cx)+b*(top-cy),
                 d, e, source.height/2+d*(left-cx)+e*(top-cy))
    image = source.transform((right-left, bottom-top), Image.Transform.AFFINE,
                             transform, Image.Resampling.BICUBIC)
    alpha = image.getchannel('A').point(lambda v: round(v*settings['strength']/100))
    if settings['color'] != '#FFFFFF':
        image = ImageChops.multiply(image.convert('RGB'), Image.new('RGB', image.size, settings['color'])).convert('RGBA')
    image.putalpha(alpha)
    target.alpha_composite(image, (left, top))


def render_transporter(effect, width, height, *, selection=False):
    emblem = effect.get('transporter_emblem', 'tos_badge')
    style = effect.get('transporter_style', 'multicolor')
    alignment = effect.get('transporter_alignment', 'emblem')
    if not isinstance(emblem, str) or emblem not in EMBLEMS:
        raise ValueError('Choose a valid transporter emblem.')
    if not isinstance(style, str) or style not in STYLES:
        raise ValueError('Choose a valid transporter effect.')
    if not isinstance(alignment, str) or alignment not in ALIGNMENTS:
        raise ValueError('Choose a valid transporter path alignment.')
    layout = layout_settings(effect)
    # New layouts render directly at output size, with each object independent.
    target_size = (width, height) if 'transporter_layout' in effect else SIZE
    pattern = Image.new('RGBA', target_size)
    for beam in layout['beams']:
        # Stable IDs keep an existing beam's particles unchanged when another
        # beam is selected, removed or reordered.
        source = _beam(beam['style'], beam['density'], effect['seed'] + int(beam['id'][4:])*271, 'bottom', beam['cascade'], beam['base_rounding'])
        _place(pattern, source, beam)
    badge = layout['emblem']
    badge_pixels = max(128, min(4096, math.ceil(target_size[0]*370/SIZE[0]*badge['size']/100*1.5)))
    _place(pattern, _emblem(emblem, badge['color_mode'], badge_pixels),
           dict(badge, width=370/SIZE[0]*100, height=340/SIZE[1]*100))
    if 'transporter_layout' in effect:
        return pattern.getchannel('A') if selection else pattern
    if effect['color'].upper() != '#FFFFFF':
        alpha = pattern.getchannel('A')
        pattern = ImageChops.multiply(pattern.convert('RGB'), Image.new('RGB', SIZE, effect['color'])).convert('RGBA')
        pattern.putalpha(alpha)
    pattern_width = max(1, width*effect['scale']/100)
    ratio = SIZE[0]/pattern_width
    left, top = (width-pattern_width)/2, (height-pattern_width*SIZE[1]/SIZE[0])/2
    cx, cy = width/2, height/2
    dx, dy = width*effect.get('position_x', 0)/100, height*effect.get('position_y', 0)/100
    angle = math.radians(effect.get('rotation', 0))
    c, s = math.cos(angle), math.sin(angle)
    inverse = (c, s, cx-left-c*(cx+dx)-s*(cy+dy),
               -s, c, cy-top+s*(cx+dx)-c*(cy+dy))
    transform = tuple(value*ratio for value in inverse)
    if selection:
        return pattern.getchannel('A').transform((width, height), Image.Transform.AFFINE, transform, Image.Resampling.BICUBIC)
    return pattern.transform((width, height), Image.Transform.AFFINE, transform, Image.Resampling.BICUBIC)
