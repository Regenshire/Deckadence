"""Reference-inspired printable foil patterns, with reusable mask geometry.

These simulate the visible treatment. Physical reflective/raised finishes still
come from the independent foil and gloss plates, which can reuse the paths.
"""
from functools import lru_cache
from io import BytesIO
import math
from pathlib import Path
import random
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageFilter

EFFECTS = {
    'silver_black': 'Silver & Black Art',
    'oil_slick': 'Oil Slick Rainbow',
    'phyrexian': 'Step-and-Compleat · Phyrexian Symbols',
    'mana_foil': 'Mana Symbol Foil',
    'dragonscale': 'Dragonscale Foil',
    'gilded': 'Gilded Filigree',
    'halo': 'Halo Foil',
    'ripple': 'Ripple Foil',
    'neon_ink': 'Neon Ink',
}
# Kept only to read/render previously saved cards. Never offered for new effects.
RETIRED_EFFECTS = frozenset(('invisible_ink',))
PATH_EFFECTS = frozenset(('phyrexian', 'mana_foil', 'dragonscale', 'gilded', 'invisible_ink'))
COLORS = {key: '#FFFFFF' for key in ('phyrexian', 'mana_foil', 'dragonscale', 'halo', 'ripple')}
COLORS.update(gilded='#F4CA70', invisible_ink='#B7A1FF', neon_ink='#FF298A')
ASSETS = Path(__file__).resolve().parents[1] / 'static/img/symbols'


@lru_cache(maxsize=5)
def _mana(symbol):
    # The app's actual mana silhouettes, without the colored circular backing.
    root = ET.parse(ASSETS / (symbol + '.svg')).getroot()
    paths = ''.join(ET.tostring(node, encoding='unicode') for node in root
                    if node.tag.rsplit('}', 1)[-1] == 'path')
    return f'<svg viewBox="{root.attrib["viewBox"]}" width="100" height="100">{paths}</svg>'


def _geometry(finish, scale, density, seed):
    """Coordinates include overscan so rotation/translation never cut a tile."""
    rng = random.Random(seed)
    size = scale / 100
    spacing = size / math.sqrt(density / 100)
    items = []
    if finish in ('phyrexian', 'mana_foil'):
        pitch = 116 * spacing
        symbol_size = 62 * size
        columns=5 if finish=='mana_foil' else 1
        for row in range(-1,3):
            y = row * pitch
            for col in range(-1,columns+1):
                x = (col + (row % 2) * .5) * pitch
                if finish == 'phyrexian':
                    shape = '<circle cx="50" cy="50" r="30" fill="none" stroke="white" stroke-width="10"/><path d="M44 0H56V100H44Z" fill="white"/>'
                else:
                    shape = _mana('WUBRG'[(row * 2 + col + seed) % 5])
                items.append(f'<g transform="translate({x} {y}) scale({symbol_size/100})">{shape}</g>')
    elif finish == 'dragonscale':
        pitch = 64 * spacing
        for row in range(-1,3):
            for col in range(-1,2):
                x = (col + row % 2 * .5) * pitch
                y = row * pitch * .69
                # Pointed overlapping shields: open, transparent scale centers.
                items.append(f'<path transform="translate({x} {y}) scale({pitch/64})" d="M-30 -10 Q-32 15 0 39 Q32 15 30 -10 M-24 -5 Q-22 14 0 30 Q22 14 24 -5" fill="none" stroke="white" stroke-width="4"/>')
    elif finish == 'gilded':
        # Broad tapered gold inlays give the corner fans substance at card
        # size. Open spaces between the inlays keep the central artwork clear.
        for x, y, angle in ((30,30,0),(726,30,90),(726,1026,180),(30,1026,270)):
            paths = []
            for i in range(1,6):
                a=i*math.pi/12
                c,s=math.cos(a),math.sin(a)
                points=[(18,18),(c*143-s*8,s*143+c*8),(c*210,s*210),(c*143+s*8,s*143-c*8)]
                paths.append('<polygon points="'+' '.join(f'{px},{py}' for px,py in points)+'" fill="white" stroke="none"/>')
            paths.append('<path d="M0 220V0H220 M12 195V12H195 M27 160V27H160 M0 82Q82 82 82 0 M0 122Q122 122 122 0"/>')
            items.append(f'<g transform="translate({x} {y}) rotate({angle})" fill="none" stroke="white" stroke-width="6.5">{"".join(paths)}</g>')
        items.append('<path d="M30 275V781M43 295V761M726 275V781M713 295V761M275 30H481M295 43H461M275 1026H481M295 1013H461" fill="none" stroke="white" stroke-width="5"/>')
        for x,y,angle in ((30,528,0),(726,528,0),(378,30,90),(378,1026,90)):
            items.append(f'<g transform="translate({x} {y}) rotate({angle})"><path d="M0 -25L15 0 0 25-15 0Z" fill="none" stroke="white" stroke-width="6"/><path d="M0 -12L6 0 0 12-6 0Z" fill="white"/></g>')
    elif finish == 'invisible_ink':
        # Several handwritten annotations, underlines and clue diagrams.
        for _ in range(round(13*density/100)):
            x,y = rng.uniform(40,620),rng.uniform(50,980)
            angle = rng.uniform(-18,18)
            marks=[]
            for j in range(rng.randint(6,12)):
                h=rng.uniform(5,17)
                marks.append(f'M{j*9} 0q-3 {-h} 3 {-h*.5}t6 {h*.5}l-5 5')
            marks.append('M0 12q40 -4 90 0')
            if rng.random()>.5: marks.append('M90 12q35 12 38 40m-8-6 8 6 3-12')
            items.append(f'<path transform="translate({x} {y}) rotate({angle}) scale({size})" d="{" ".join(marks)}" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/>')
        items.append('<g fill="none" stroke="white" stroke-width="2"><ellipse cx="560" cy="230" rx="73" ry="41" transform="rotate(-12 560 230)"/><path d="M480 230q80 -73 160 0-80 73-160 0M520 275l-45 60m4-18-4 18 18-4"/><circle cx="560" cy="230" r="16"/></g>')
    if finish in ('phyrexian','mana_foil','dragonscale'):
        tile_width=pitch*(columns if finish!='dragonscale' else 1)
        tile_height=pitch*(1.38 if finish=='dragonscale' else 2)
        return f'<defs><pattern id="motif" width="{tile_width}" height="{tile_height}" patternUnits="userSpaceOnUse" x="{seed%37}" y="{seed%43}">{"".join(items)}</pattern></defs><rect x="-1900" y="-1900" width="4556" height="4856" fill="url(#motif)"/>'
    geometry=''.join(items)
    return f'<g transform="translate(378 528) scale({size}) translate(-378 -528)">{geometry}</g>' if finish=='gilded' else geometry


@lru_cache(maxsize=6)
def pattern_selection(finish, width, height, scale=100, density=100, seed=0, rotation=0, position_x=0, position_y=0):
    import cairosvg
    if finish not in PATH_EFFECTS:
        raise ValueError('This effect has no copyable geometry.')
    geometry = _geometry(finish, scale, density, seed)
    dx,dy = 756*position_x/100,1056*position_y/100
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 756 1056"><g transform="translate({dx} {dy}) rotate({rotation} 378 528)">{geometry}</g></svg>'
    return Image.open(BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).getchannel('A')


def _spectrum(width, height, seed, scale=100, style='oil_slick'):
    """Smooth thin-film bands; no straight scan lines or repeated image tiles."""
    import colorsys
    rng=random.Random(seed)
    phase=rng.random()*6.28
    waves=style in ('halo','ripple')
    # Resolve the reflection edges before reducing to card size. The former
    # tiny texture plus low alpha lost the bands against light artwork.
    sw,sh=(512,716) if waves else (256,358)
    small=Image.new('RGBA',(sw,sh)); pixels=[]
    size=scale/100
    for iy in range(sh):
        y=iy/sh
        for ix in range(sw):
            x=ix/sw
            flow=x*.72+y*.25+.10*math.sin(y*5+phase)+.05*math.cos(x*7-y*3+phase)
            if style=='halo':
                r=math.hypot((x-.35)*1.25,y-.38)
                angle=math.atan2(y-.38,(x-.35)*1.25)
                flow=r*7/size+.38*math.sin(angle*3+r*8+phase)+.16*math.cos(x*13-y*9)
            elif style=='ripple':
                flow=math.hypot(x-.2,y-.72)*14/size+.18*math.sin(x*15+y*7+phase)
            hue=(.11+(flow/size if style=='oil_slick' else x*.7+y*.33)+phase*.025)%1
            if waves:
                # A bright face and an adjacent dark reflection keep the
                # ridges visible on both pale and dark art. Gaps stay clear.
                crest=190*max(0,math.cos(flow*math.tau))**3
                trough=105*max(0,math.cos(flow*math.tau+1.15))**8
                coverage=crest+trough
                bright=colorsys.hsv_to_rgb(hue,.52,1)
                dark=colorsys.hsv_to_rgb(hue,.48,.12)
                rgb=tuple((a*crest+b*trough)/coverage if coverage else 0 for a,b in zip(bright,dark))
                pixels.append((*[round(c*255) for c in rgb],round(min(255,coverage))))
                continue
            rgb=colorsys.hsv_to_rgb(hue,.58 if style=='oil_slick' else .30,1)
            light=(.5+.5*math.sin(flow*math.tau))
            alpha=158 if style=='oil_slick' else round(3+53*light**8)
            pixels.append((*[round(c*255) for c in rgb],alpha))
    small.putdata(pixels)
    return small.resize((width,height),Image.Resampling.BICUBIC)


def render_pattern(effect, width, height):
    finish=effect['finish']
    if finish=='silver_black':
        # Coverage carrier; the source artwork is transformed at composition.
        return Image.new('RGBA',(width,height),'white')
    if finish=='neon_ink':
        return Image.new('RGBA',(width,height),effect['color'])
    sheet=_spectrum(width,height,effect['seed'],effect['scale'],finish)
    if finish not in PATH_EFFECTS:
        if finish in COLORS:
            colored=ImageChops.multiply(sheet.convert('RGB'),Image.new('RGB',sheet.size,effect['color'])).convert('RGBA')
            colored.putalpha(sheet.getchannel('A'));sheet=colored
        return sheet
    alpha=pattern_selection(finish,width,height,effect['scale'],effect['density'],effect['seed'],effect['rotation'],effect.get('position_x',0),effect.get('position_y',0))
    if finish in ('gilded','invisible_ink'):
        sheet=Image.new('RGBA',(width,height),effect['color'])
    else:
        sheet=ImageChops.multiply(sheet.convert('RGB'),Image.new('RGB',sheet.size,effect['color'])).convert('RGBA')
    # Paired highlights/shadows give the pattern an embossed reflective edge.
    shift=max(1,round(width/756*(1 if finish in RETIRED_EFFECTS else 1.5)))
    def shifted(dx,dy):
        return alpha.transform(alpha.size,Image.Transform.AFFINE,(1,0,-dx,0,1,-dy))
    highlight=ImageChops.subtract(alpha,shifted(shift,shift))
    shade=ImageChops.subtract(alpha,shifted(-shift,-shift))
    sheet.putalpha(alpha.point(lambda p:round(p*(.36 if finish=='invisible_ink' else .88))))
    if finish=='invisible_ink':
        glow=Image.new('RGBA',sheet.size,effect['color']);glow.putalpha(alpha.filter(ImageFilter.GaussianBlur(3*shift)).point(lambda p:p//3))
        sheet=Image.alpha_composite(glow,sheet)
    else:
        for color,coverage in (('#111727',shade),('#FFFFF0',highlight)):
            bevel=Image.new('RGBA',sheet.size,color);bevel.putalpha(coverage.point(lambda p:round(p*.8)))
            sheet=Image.alpha_composite(sheet,bevel)
    return sheet
