"""Varied material motifs for printable effects; all placement is seed-stable."""
from functools import lru_cache
import math
from pathlib import Path
import random

from PIL import Image, ImageOps, ImageDraw, ImageChops, ImageEnhance, ImageFilter

MATERIAL_EFFECTS = {
    'confetti': 'Confetti Foil',
    'flame_1': 'Flame Foil 1',
    'flame_2': 'Flame Foil 2',
    'water_beads': 'Water Beads',
    'frost': 'Frost Foil',
}
ASSET_ROOT = Path(__file__).resolve().parents[1] / 'static/img/card-effects'
# Independently drawn motifs share a sheet. Bounds follow the transparent
# gutters, which are not perfectly centered in the authored material assets.
ASSET_BOXES = {
    'confetti': ((0,0,768,512),(768,0,1536,512),(0,512,768,1024),(768,512,1536,1024)),
    'flame_1': ((0,0,657,609),(657,0,1315,607),(0,609,657,1197),(657,607,1315,1197)),
    'flame_2': ((0,0,627,627),(627,0,1254,610),(0,627,627,1254),(627,610,1254,1254)),
    'water_beads': ((0,0,667,589),(667,0,1335,589),(0,589,667,1178),(667,589,1335,1178)),
    'frost': ((0,0,768,512),(768,0,1536,512),(0,512,768,1024),(768,512,1536,1024)),
    'galaxy': ((0,0,643,611),(643,0,1286,611),(0,611,643,1223),(643,611,1286,1223)),
}


@lru_cache(maxsize=6)
def material_variants(finish):
    path = ASSET_ROOT / (finish.replace('_','-') + '-variants-v1.png')
    with Image.open(path) as source:
        source = source.convert('RGBA')
    variants = []
    for box in ASSET_BOXES[finish]:
        sprite = source.crop(box)
        # Ignore near-invisible export padding when measuring the motif size.
        bounds = sprite.getchannel('A').point(lambda value:255 if value>16 else 0).getbbox()
        if bounds is None:
            raise ValueError('Finishing material contains an empty motif.')
        variants.append(sprite.crop(bounds))
    return tuple(variants)


def material_placements(finish, scale, density, seed):
    """Coordinates use the standard card size, independent of output DPI."""
    rng = random.Random(seed)
    size, amount = scale/100, density/100
    count = max(4,round({'confetti':24,'flame_1':54,'flame_2':64,
                         'water_beads':155,'frost':16,'galaxy':44}[finish]*amount/(size*size)))
    # Shuffle a bag of all four variants; even sparse settings use every asset.
    bag = []
    columns = max(1,round(math.sqrt(count*756/1056*1.65)))
    rows = count/columns
    for index in range(count):
        if not bag:
            bag=list(range(4));rng.shuffle(bag)
        variant=bag.pop()
        if finish in ('confetti','frost'):
            # Overlapping, staggered surface patches avoid isolated objects and
            # visible tile boundaries. Each patch contains hundreds of details.
            x=((index%columns)+rng.uniform(.1,.9))*756/columns
            y=((index//columns)+rng.uniform(.1,.9))*1056/rows
            extent=rng.uniform(*( (320,470) if finish=='confetti' else (410,540)))*size
            angle=rng.uniform(0,360)
            mirror=rng.random()<.5
        elif finish=='galaxy':
            x,y=rng.uniform(-8,764),rng.uniform(-8,1064)
            # A few large foreground planets, many smaller distant discs.
            extent=rng.uniform(*( (36,76) if index%4==0 else (10,28)))*size
            angle=rng.uniform(0,360)
            mirror=rng.random()<.5
        elif finish.startswith('flame'):
            # Loose, staggered rows keep flames upright without a rigid tile.
            x=((index%columns)+rng.uniform(.05,.95))*756/columns
            y=((index//columns)+rng.uniform(.05,.95))*1056/rows
            extent=rng.uniform(135,235)*size
            angle=rng.uniform(-16,16)
            mirror=rng.random()<.5
        else:
            x,y=rng.uniform(-8,764),rng.uniform(-8,1064)
            mirror=False
            extent=(rng.uniform(30,66) if index%4==0 else rng.uniform(9,29))*size
            angle=rng.uniform(-12,12)  # All beads share the same lighting.
        yield variant,x,y,extent,angle,mirror


def _motif_selection(sprite):
    """Opaque footprint, including transparent interiors of glass droplets."""
    alpha=sprite.getchannel('A').point(lambda a:255 if a>16 else 0)
    # Flood only the outside; enclosed clear centers belong to the droplet.
    padded=Image.new('L',(alpha.width+2,alpha.height+2))
    padded.paste(alpha,(1,1))
    ImageDraw.floodfill(padded,(0,0),128)
    alpha=padded.point(lambda a:0 if a==128 else 255).crop((1,1,alpha.width+1,alpha.height+1))
    result=Image.new('RGBA',sprite.size,'white');result.putalpha(alpha)
    return result


def render_material(finish, scale, density, seed, width, height, *, selection=False, stacked=False):
    if finish in ('flame_1','flame_2'):
        return _flowing_flames(finish,scale,density,seed,width,height,stacked=stacked,selection=selection)
    if selection and finish=='confetti':
        image=Image.new('RGBA',(width,height),'white')
        image.putalpha(_confetti_grains(scale,density,seed,width,height,solid=True))
        return image
    image=_galaxy_background(scale,density,seed,width,height,selection=selection) if finish=='galaxy' else Image.new('RGBA',(width,height))
    variants=material_variants(finish)
    unit=width/756
    # Downsample once per asset, rather than resampling a large source thousands
    # of times when the user chooses very small, dense confetti or water beads.
    limit=max(1,math.ceil({'confetti':470,'flame_1':235,'flame_2':235,
                          'water_beads':66,'frost':540,'galaxy':76}[finish]*scale/100*unit))
    prepared=[]
    for source in variants:
        sprite=_motif_selection(source) if selection else source.copy()
        if finish=='confetti':
            # Keep bright grains, without painting a milky film over the art.
            sprite.putalpha(sprite.getchannel('A').point(lambda a:round(max(0,a-65)*1.15)))
        elif finish=='frost':
            sprite.putalpha(sprite.getchannel('A').point(lambda a:round(a*.52)))
        sprite.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        prepared.append(sprite)
    for variant,x,y,extent,angle,mirror in material_placements(finish,scale,density,seed):
        source=prepared[variant]
        factor=extent*unit/max(source.size)
        sprite=source.resize((max(1,round(source.width*factor)),max(1,round(source.height*factor))),Image.Resampling.LANCZOS)
        if mirror:sprite=ImageOps.mirror(sprite)
        sprite=sprite.rotate(angle,Image.Resampling.BICUBIC,expand=True)
        image.alpha_composite(sprite,(round(x*unit-sprite.width/2),round(y*height/1056-sprite.height/2)))
    if finish=='confetti':
        # The material supplies varied reflective color; discrete grains supply
        # open space. This prevents densely overlapping patches hiding the art.
        grain=_confetti_grains(scale,density,seed,width,height)
        alpha=ImageChops.multiply(image.getchannel('A'),grain)
        image=ImageEnhance.Color(image).enhance(1.35)
        image.putalpha(alpha)
    return image


def _confetti_grains(scale, density, seed, width, height, *, solid=False):
    rng=random.Random(seed ^ 0x464C454B)
    # Supersample only the small grain mask; large print masks are native size.
    sampling=2 if width<=756 else 1
    mask=Image.new('L',(width*sampling,height*sampling))
    draw=ImageDraw.Draw(mask)
    unit=width/756*sampling
    size=scale/100
    for _ in range(round(15500*density/100/(size*size))):
        x,y=rng.uniform(0,756),rng.uniform(0,1056)
        extent=rng.uniform(.9,2.7)*size
        angle=rng.uniform(0,math.tau)
        aspect=rng.uniform(.5,1)
        # Tiny asymmetric clipped foil chips, rather than stars or ribbons.
        points=[]
        for index in range(5):
            a=angle+index*math.tau/5
            radius=extent*rng.uniform(.65,1)
            points.append(((x+math.cos(a)*radius)*unit,(y+math.sin(a)*radius*aspect)*height/1056*sampling))
        coverage=rng.randint(220,255)
        draw.polygon(points,fill=255 if solid else coverage)
    return mask.resize((width,height),Image.Resampling.LANCZOS) if sampling>1 else mask


def _galaxy_background(scale, density, seed, width, height, *, selection=False):
    """A faint spectral sky behind the larger foil discs, never opaque ink."""
    rng=random.Random(seed ^ 0x47584C59)
    phase=rng.uniform(0,math.tau)
    sky=Image.new('RGBA',(96,134))
    colors=[]
    for y in range(134):
        for x in range(96):
            shift=(math.sin(x*.075+y*.033+phase)+1)/2
            glow=(math.sin(x*.14-y*.06+phase)+1)/2
            colors.append((round(35+50*shift),round(36+46*glow),round(110+70*glow),round(12+14*shift)))
    sky.putdata(colors)
    image=Image.new('RGBA',(width,height)) if selection else sky.resize((width,height),Image.Resampling.BICUBIC)
    draw=ImageDraw.Draw(image)
    unit=width/756
    palette=((215,255,250),(100,242,255),(75,189,255),(220,226,255),(255,241,184))
    size=scale/100
    for index in range(round(2100*density/100/(size*size))):
        x,y=rng.uniform(0,width),rng.uniform(0,height)
        radius=rng.uniform(.55,2.1)*size*unit
        if index%19==0:radius*=2
        rgb=palette[rng.randrange(len(palette))]
        alpha=rng.randint(135,250)
        draw.ellipse((x-radius,y-radius,x+radius,y+radius),fill=(255,255,255,255) if selection else (*rgb,alpha))
    return image


def _flowing_flames(finish, scale, density, seed, width, height, *, stacked=False, selection=False):
    """Soft Bezier fire and embers, like the Pack Simulator; no sprite motifs.

    Render at a fixed working resolution so print and preview share contours.
    Stacked rows overlap and fade at both ends, avoiding horizontal seams.
    """
    w,h=756,1056
    rng=random.Random(seed)
    blue=finish=='flame_2'
    red,hot=((40,82,203),(133,229,255)) if blue else ((218,55,49),(245,112,55))
    size=scale/100
    flame_height=(260 if blue else 210)*size
    count=max(5,round((22 if blue else 20)*density/100/size))
    result=Image.new('RGBA',(w,h))
    spacing=flame_height*.6
    bases=[h] if not stacked else [h-i*spacing for i in range(math.ceil(h/spacing)+1)]
    def bezier(points):
        return [tuple(sum(points[k][axis]*weight for k,weight in enumerate(((1-t)**3,3*(1-t)**2*t,3*(1-t)*t*t,t**3))) for axis in (0,1)) for t in (j/24 for j in range(25))]
    for baseline in reversed(bases):
        # A broad diffuse glow merges adjacent tongues into one body of fire.
        glow=Image.new('RGBA',(1,h))
        glow.putdata([(*red,round(45*max(0,1-abs(y-baseline)/(flame_height*1.1))**2)) for y in range(h)])
        if not stacked:result.alpha_composite(glow.resize((w,h)))
        for layer,factor in enumerate((1.15,.8,.42)):
            for i in range(-1,count+1):
                n=rng.random();x=(i+rng.uniform(.2,.8))*w/count
                length=flame_height*(.48+n*.65)*factor
                base=w/count*(.9 if blue else 1.15)*(.45+n*.3)
                sway=rng.uniform(-.85,.85)*base
                local_base=baseline+rng.uniform(-spacing*.65,spacing*.65) if stacked else baseline
                bottom=local_base+(length*.6 if stacked else 8)
                left=math.floor(x-base*2-10);top=math.floor(local_base-length-10)
                sw=math.ceil(base*4+20);sh=math.ceil(bottom-top+10)
                coverage=Image.new('L',(sw,sh));draw=ImageDraw.Draw(coverage)
                points=bezier(((x-base,bottom),(x-base*1.5,local_base-length*.4),(x+sway+base,local_base-length*.6),(x+sway,local_base-length)))
                points+=bezier(((x+sway,local_base-length),(x+sway+4,local_base-length*.5),(x+base,local_base-length*.35),(x+base,bottom)))
                draw.polygon([(px-left,py-top) for px,py in points],fill=255)
                coverage=coverage.filter(ImageFilter.GaussianBlur(3))
                gradient=Image.new('RGBA',(1,sh));pixels=[]
                for y in range(sh):
                    above=max(0,(local_base-y-top)/length)
                    below=max(0,(y+top-local_base)/(length*.6)) if stacked else 0
                    mix=min(1,above*2) if layer<2 else 1
                    rgb=tuple(round(a+(b-a)*mix) for a,b in zip(red,hot))
                    opacity=.52*max(0,1-above)**1.3*max(0,1-below)**2
                    pixels.append((*rgb,round(255*opacity)))
                gradient.putdata(pixels);wash=gradient.resize((sw,sh))
                wash.putalpha(ImageChops.multiply(wash.getchannel('A'),coverage));result.alpha_composite(wash,(left,top))
    sparks=ImageDraw.Draw(result)
    for _ in range(round((100 if stacked else 24)*density/100)):
        x=rng.uniform(0,w);y=rng.uniform(0,h) if stacked else h-rng.uniform(15,flame_height*1.8)
        r=rng.uniform(.6,1.6)*size
        sparks.ellipse((x-r*.6,y-r,x+r*.6,y+r),fill=(*hot,rng.randint(55,170)))
    if selection:
        white=Image.new('RGBA',(w,h),'white');white.putalpha(result.getchannel('A'));result=white
    return result.resize((width,height),Image.Resampling.LANCZOS)
