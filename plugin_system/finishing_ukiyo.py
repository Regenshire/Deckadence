"""Grouped Ukiyo-e overlays and matching copyable mask geometry."""
from functools import lru_cache
import random
from PIL import Image, ImageOps, ImageChops, ImageColor
from .finishing_wind_waves import DESIGNS, ASSETS, render_wind_waves
from .mirror_shards import transform_image

TYPES = {
    **{key: ('Clouds - ' if key.startswith('wind_') else 'Waves - ') + label for key,label in DESIGNS.items()},
    'bats_banking': 'Bats - Banking Swarm',
    'bats_ascent': 'Bats - Night Ascent',
    'ravens_windborne': 'Ravens - Windborne Murder',
    'ravens_sweeping': 'Ravens - Sweeping Flock',
    'wolves_surge': 'Wolves - Shadow Surge',
    'wolves_ghost': 'Wolves - Ghost Pack',
}

@lru_cache(maxsize=6)
def creature(key):
    with Image.open(ASSETS / (key.replace('_','-') + '-v1.png')) as image:
        return image.convert('RGBA')

def render_ukiyo(effect, width, height):
    key=effect.get('ukiyo_type','wind_ribbons')
    sparse=effect.get('sparse',False)
    if key in DESIGNS:
        image=render_wind_waves(key+('_sparse' if sparse else ''),effect['scale'],effect['density'],effect['seed'],width,height,color=effect['color'])
    else:
        source=creature(key)
        if effect['color'].upper()!='#FFFFFF':
            # Recolor the ink itself, including dark strokes, retaining tonal detail.
            rgb=ImageColor.getrgb(effect['color'])
            source=ImageOps.colorize(source.convert('L'),tuple(round(c*.3) for c in rgb),rgb).convert('RGBA')
            source.putalpha(creature(key).getchannel('A'))
        image=Image.new('RGBA',(width,height))
        rng=random.Random(effect['seed'])
        # Preserve the approved complete swarm at default settings. Sparse shrinks
        # the group to leave breathing room; density controls occupied area/groups.
        count=max(1,round(effect['density']/100))
        zoom=effect['scale']*(.62 if sparse else 1)*min(1,(effect['density']/100)**.5)
        for index in range(count):
            dx=0 if count==1 else (-22 if index==0 else 22)
            dy=0 if count==1 else (18 if index==0 else -18)
            # New pattern gives a small compositional shift, never random mirroring.
            if effect['seed'] not in (73,197):
                dx+=rng.uniform(-8,8);dy+=rng.uniform(-8,8)
            image.alpha_composite(transform_image(source,zoom=zoom,output_size=(width,height),offset_x=dx,offset_y=dy))
    if effect.get('flip_horizontal',False):
        image=ImageOps.mirror(image)
    return transform_image(image,effect.get('rotation',0),offset_x=effect.get('position_x',0),offset_y=effect.get('position_y',0),cover_rotation=False)

def ukiyo_selection(effect,width,height):
    return render_ukiyo(dict(effect,color='#FFFFFF'),width,height).getchannel('A')
