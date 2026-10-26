"""Dragon Strike Foil geometry shared by preview, saved bakes and Copy Path."""
from functools import lru_cache
from io import BytesIO
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps

EMBLEMS = {
    'bolas_command': 'Bolas · Command',
    'ugin_ascendant': 'Ugin · Ascendant',
    'ugin_glide': 'Ugin · Glide',
    'bolas_dominion': 'Bolas · Dominion',
    'bolas_sovereign': 'Bolas · Sovereign',
}
TRAILS = {
    'winding_magic': 'Wandering magic',
    'border_wisps': 'Border wisps',
    'diagonal_surge': 'Diagonal surge',
    'vortex_arc': 'Spiral wake',
    'none': 'Emblem only',
}
ALIGNMENTS = {'dragon': 'Starts at dragon', 'bottom': 'Bottom of Card'}
COLOR_EFFECTS = {
    'normal': 'Normal',
    'neon_cyan': 'Neon cyan',
    'neon_magenta': 'Neon magenta',
    'neon_lime': 'Neon lime',
    'gold': 'Gold',
    'silver': 'Silver',
    'fire': 'Fire',
    'lightning': 'Lightning',
}
# Keep early saved drafts readable, without offering the superseded geometric
# concepts in the new-path picker.
LEGACY_TRAILS = {'spirit_ribbons': 'Spirit ribbons', 'arc_lightning': 'Arc lightning',
                 'entwined_streams': 'Entwined streams', 'arcane_wake': 'Arcane wake'}
ASSETS = Path(__file__).resolve().parents[1] / 'static/img/card-effects/dragon-strike'
VIEWBOX = (179.09, 223.52)
RENDER_VERSION = 4


@lru_cache(maxsize=7)
def _color_texture(style):
    """Small, resolution-independent color fields; geometry stays full resolution."""
    palettes = {
        'neon_cyan': ('075297', '007DCB', '00DFFF', 'AAFFFF'),
        'neon_magenta': ('6700AB', 'B700ED', 'FF19B8', 'FFC4F6'),
        'neon_lime': ('146527', '20AF16', '9CFF00', 'EDFFC0'),
        'gold': ('63330B', 'AE6814', 'E9AF35', 'FFE8A3', 'FFFCDB'),
        'silver': ('344357', '78899B', 'BBC8D4', 'F6FCFF', 'FFFFFF'),
        'fire': ('8F1206', 'DD2904', 'FF6A00', 'FFCA23', 'FFF3AD'),
        'lightning': ('35229B', '355AEF', '279FFF', 'B1E7FF', 'FFFFFF'),
    }
    colors = [tuple(int(c[i:i+2], 16) for i in (0, 2, 4)) for c in palettes[style]]
    pixels = []
    for y in range(224):
        ny = y/223
        for x in range(160):
            nx = x/159
            sweep = nx*.8+ny*.65
            if style in ('gold', 'silver'):
                # Broad reflected bands with narrow bright catches, no grain.
                wave = math.sin((sweep+.045*math.sin(ny*7))*math.tau*2.4)
                level = .22+.65*(.5+.5*wave)**1.5
                level += .13*max(0, math.cos((sweep-.13)*math.tau*5))**12
            elif style == 'fire':
                wave = math.sin((ny*1.9+nx*.65+.12*math.sin(nx*12-ny*8))*math.tau)
                level = .25+.7*(.5+.5*wave)
            elif style == 'lightning':
                zigzag = abs(((ny*3.5)%1)*2-1)
                wave = math.sin((nx*2.8+ny*1.8+zigzag*.3)*math.tau)
                level = .3+.7*(.5+.5*wave)**3
            else:
                level = .4+.5*(.5+.5*math.sin((sweep+.08*math.sin(ny*9))*math.tau))
            position = max(0, min(1, level))*(len(colors)-1)
            index = min(len(colors)-2, int(position)); amount = position-index
            pixels.append(tuple(round(a+(b-a)*amount) for a,b in zip(colors[index],colors[index+1])))
    texture = Image.new('RGB', (160, 224)); texture.putdata(pixels)
    return texture


def color_overlay(alpha, style, tint='#FFFFFF'):
    """Render color and inner light inside the exact approved foil silhouette."""
    image = _color_texture(style).resize(alpha.size, Image.Resampling.BICUBIC)
    unit = alpha.width/756
    if style.startswith('neon_') or style == 'lightning':
        # A bright inner core gives the light its depth. The alpha is unchanged:
        # even the glow is contained in the selected shape, including at print DPI.
        core = alpha.filter(ImageFilter.GaussianBlur(2.2*unit))
        core = core.point(lambda v: round(max(0, v-155)*1.45))
        image = Image.composite(Image.new('RGB',alpha.size,'#F1FFFF'),image,core)
    elif style in ('gold', 'silver'):
        # A fine inner bevel complements the broad metallic highlight bands.
        inner = ImageChops.subtract(alpha,alpha.filter(ImageFilter.GaussianBlur(1.8*unit)))
        inner = inner.point(lambda v: min(170, v*2))
        highlight = '#FFF2B8' if style == 'gold' else '#F5FAFF'
        image = Image.composite(Image.new('RGB',alpha.size,highlight),image,inner)
    image = ImageChops.multiply(image,Image.new('RGB',alpha.size,tint)).convert('RGBA')
    image.putalpha(alpha)
    return image


def _refine_trail(alpha, trail):
    """Place the left wisps on the border, preserving the right-hand artwork."""
    width, height = alpha.size
    if trail == 'border_wisps':
        # The source's last left-hand ribbon continues beyond its canvas.
        # Pinch just that terminal segment into a point, following its existing
        # curve. Keep solid foil coverage rather than fading the cut edge.
        x0, y0 = round(width*.22), round(height*.925)
        tail = alpha.crop((x0, y0, width//2, height))
        mesh = []
        for y in range(tail.height):
            bounds = tail.crop((0, y, tail.width, y+1)).point(lambda p: 255 if p > 128 else 0).getbbox()
            center = (bounds[0]+bounds[2])/2 if bounds else tail.width/2
            t = y/max(1, tail.height-1)
            factor = max(.001, 1-t*t*(3-2*t))
            left, right = center-center/factor, center+(tail.width-center)/factor
            mesh.append(((0, y, tail.width, y+1), (left, y, left, y+1, right, y+1, right, y)))
        alpha.paste(tail.transform(tail.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC), (x0, y0))
    shift = {'border_wisps': .04, 'vortex_arc': .06}.get(trail, 0)
    if shift:
        # Move the left edge uniformly, blending back to the original curve
        # before the midpoint so connected ribbons have no seam.
        half = width//2
        left = alpha.crop((0, 0, half, height))
        def source_x(x):
            t = max(0, min(1, (x/width-.22)/.28))
            return x+width*shift*(1-t*t*(3-2*t))
        mesh = []
        for i in range(32):
            x0, x1 = round(half*i/32), round(half*(i+1)/32)
            a, b = source_x(x0), source_x(x1)
            mesh.append(((x0, 0, x1, height), (a, 0, a, height, b, height, b, 0)))
        alpha.paste(left.transform(left.size, Image.Transform.MESH, mesh, Image.Resampling.BICUBIC), (0, 0))
    return alpha


@lru_cache(maxsize=5)
def _emblem(key):
    # These are the exact approved source images. Interpret their white ink as
    # coverage; the charcoal presentation background must never become a plate.
    with Image.open(ASSETS / (key + '.png')) as source:
        alpha = source.convert('L').point(lambda value: max(0, min(255, round((value-64)*255/160))))
    return alpha.crop(alpha.getbbox())


@lru_cache(maxsize=4)
def _pattern(emblem, trail, width, alignment):
    legacy = trail in LEGACY_TRAILS or trail == 'none'
    height = round(width * (VIEWBOX[1] / VIEWBOX[0] if legacy else 1056/756))
    # Measure the chosen dragon first: the trail's lower end is anchored to its
    # lower body, not to the bottom edge of the card-sized source asset.
    unit = width / VIEWBOX[0]
    box = (round(38.0752*unit), round(43.5515*unit))
    dragon = ImageOps.contain(_emblem(emblem), box, Image.Resampling.LANCZOS)
    left = round(71.517*unit + (box[0]-dragon.width)/2)
    top = round(177.7324*unit + (box[1]-dragon.height)/2 + (0 if legacy else height*.0224))
    alpha = Image.new('L', (width, height))
    if trail in LEGACY_TRAILS:
        import cairosvg
        png = cairosvg.svg2png(url=str(ASSETS / (trail + '.svg')), output_width=width, output_height=height)
        with Image.open(BytesIO(png)) as source:
            alpha = source.getchannel('A')
    elif trail != 'none':
        with Image.open(ASSETS / (trail + '.png')) as source:
            alpha = source.getchannel('A').resize((width, height), Image.Resampling.LANCZOS)
        bottom = alpha.getbbox()[3]
        alpha = _refine_trail(alpha, trail)
        if alignment == 'dragon':
            anchor_y = round(top + dragon.height*.72)
            aligned = Image.new('L', alpha.size)
            aligned.paste(alpha, (0, anchor_y-(bottom-1)))
            alpha = aligned
    # Original Chocobo emblem footprint. Preserve each approved dragon's aspect
    # ratio while giving all five the same available area at the end of the path.
    emblem_alpha = Image.new('L', alpha.size)
    emblem_alpha.paste(dragon, (left, top))
    return ImageChops.lighter(alpha, emblem_alpha)


def selection(width, height, scale=100, rotation=0, position_x=0, position_y=0,
              emblem='bolas_command', trail='winding_magic', alignment='dragon'):
    if emblem not in EMBLEMS or trail not in TRAILS and trail not in LEGACY_TRAILS:
        raise ValueError('Choose a valid Dragon Strike Foil emblem and magic path.')
    if alignment not in ALIGNMENTS:
        raise ValueError('Choose a valid Dragon Strike Foil path alignment.')
    pattern_width = max(1, round(width*scale/100))
    # Keep zoomed patterns bounded: a 1000% slider must not allocate a 30k raster.
    raster_width = min(4096, max(756, pattern_width))
    alpha = _pattern(emblem, trail, raster_width, alignment)
    ratio = raster_width / pattern_width
    left = round((width-pattern_width)/2)
    top = round(height*.0224) if trail in LEGACY_TRAILS or trail=='none' else round((height-pattern_width*1056/756)/2)
    cx, cy = width/2, height/2
    dx, dy = round(width*position_x/100), round(height*position_y/100)
    angle = math.radians(rotation); c, s = math.cos(angle), math.sin(angle)
    inverse = (c, s, cx-left-c*(cx+dx)-s*(cy+dy),
               -s, c, cy-top+s*(cx+dx)-c*(cy+dy))
    return alpha.transform((width, height), Image.Transform.AFFINE,
                           tuple(value*ratio for value in inverse), Image.Resampling.BICUBIC)
