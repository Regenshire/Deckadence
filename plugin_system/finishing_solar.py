"""Raised, concentric zig-zag foil ridges in card-relative coordinates."""
import math
import re
import colorsys

import numpy as np
from PIL import Image

RENDER_VERSION = 8
DEFAULTS = dict(center_x=50, center_y=50, sun_size=300, sun_opacity=100, spacing=100, thickness=38, depth=55,
                rays=18, band_width=4, off_brightness=45, off_opacity=100, off_color='#8B6329',
                relief=70, opacity=0, background_opacity=100, off_auto=True,
                radial_bands=True, ring_bands=False)
LIMITS = dict(center_x=(0, 100), center_y=(0, 100), sun_size=(0, 1500), sun_opacity=(0, 100), spacing=(25, 300),
              thickness=(10, 85), depth=(0, 100), rays=(8, 96),
              band_width=(1, 12), off_brightness=(0, 100), off_opacity=(0, 100), relief=(0, 100),
              opacity=(0, 100), background_opacity=(0, 100))


def shifted_color(color):
    """A warmer, deeper companion tone; shared with the Studio color picker."""
    if not isinstance(color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
        raise ValueError('Choose a valid effect color.')
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    hue, saturation, value = colorsys.rgb_to_hsv(*rgb)
    rgb = colorsys.hsv_to_rgb((hue - 8 / 360) % 1, min(1, saturation * 1.06), value * .6)
    return '#' + ''.join(f'{math.floor(component * 255 + .5):02X}' for component in rgb)


DEFAULTS['off_color'] = shifted_color('#E8B94F')


def validate_solar(value, color=None):
    if not isinstance(value, dict) or set(value) - DEFAULTS.keys():
        raise ValueError('Choose valid Raised Solar Pattern settings.')
    result = {**DEFAULTS, **value}
    # Earlier saved manual colors remain manual when no Auto setting exists.
    if 'off_color' in value and 'off_auto' not in value:
        result['off_auto'] = False
    for key in ('off_auto', 'radial_bands', 'ring_bands'):
        if type(result[key]) is not bool:
            raise ValueError(f'Solar {key.replace("_", " ")} must be a boolean.')
    for key, (low, high) in LIMITS.items():
        if type(result[key]) is not int or not low <= result[key] <= high:
            raise ValueError(f'Choose solar {key.replace("_", " ")} from {low} to {high}.')
    if not isinstance(result['off_color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', result['off_color']):
        raise ValueError('Choose a valid solar off-band color.')
    result['off_color'] = result['off_color'].upper()
    if result['off_auto'] and color is not None:
        result['off_color'] = shifted_color(color)
    return result


def render_solar(effect, width, height, *, selection=False):
    """Resolve ridges at output resolution, in bounded strips for print bakes.

    Each ring is a star polygon with truly straight edges between alternating
    inner and outer vertices. Analytic ray/edge intersections keep the geometry
    sharp at any resolution. The distance gradient keeps ridge thickness
    consistent along the sloping facets.
    """
    options = validate_solar(effect.get('solar', {}), effect['color'])
    unit = width / 756
    pitch = 13 * effect['scale'] / 100 * options['spacing'] / 100
    half_width = pitch * options['thickness'] / 200
    angle_offset = math.radians(effect.get('rotation', 0))
    phase = (effect['seed'] * .61803398875) % 1
    gold = np.array([int(effect['color'][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255
    off = np.array([int(options['off_color'][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255
    result = Image.new('L' if selection else 'RGBA', (width, height))
    x = (np.arange(width, dtype=np.float32)[None, :] + .5 - width * options['center_x'] / 100) / unit
    center_y = height * options['center_y'] / 100
    teeth = options['rays']
    # Limit the slope, including at high ray counts; rings never fold over.
    amplitude = options['depth'] / 100 * math.pi / teeth * .48
    for top in range(0, height, 128):
        y = (np.arange(top, min(height, top + 128), dtype=np.float32)[:, None] + .5 - center_y) / unit
        radius = np.hypot(x, y)
        angle = np.arctan2(y, x) - angle_offset
        tooth = np.mod(angle * teeth / math.tau + phase, 1)
        sector = math.pi / teeth
        local = np.mod(tooth * 2, 1) * sector
        start = np.where(tooth < .5, 1 - amplitude, 1 + amplitude)
        end = np.where(tooth < .5, 1 + amplitude, 1 - amplitude)
        denominator = end * np.sin(sector - local) + start * np.sin(local)
        fold = start * end * math.sin(sector) / denominator
        unfolded = radius / fold
        slope_ratio = (end * np.cos(sector - local) - start * np.cos(local)) / denominator
        gradient = np.sqrt(1 + slope_ratio ** 2) / fold
        ring = unfolded / pitch + phase
        distance = (np.mod(ring + .5, 1) - .5) * pitch / gradient
        # Pixel-wide antialiasing remains stable between preview and print.
        coverage = np.clip((half_width - np.abs(distance)) * unit + .5, 0, 1)
        # Every straight facet keeps one color from the sun to the card edge.
        # Color boundaries share the star vertices, with pixel-wide smoothing
        # measured perpendicular to each radial boundary.
        band = np.ones_like(radius)
        if options['radial_bands']:
            edge_distance = radius * np.sin(np.minimum(local, sector - local))
            band = np.clip(.5 + np.where(tooth < .5, 1, -1) * edge_distance * unit, 0, 1)
        if options['ring_bands']:
            # Optional legacy ring bands can stand alone or swap the radial
            # section colors in alternating groups of ridges.
            ring_band = .5 + .5 * np.tanh(np.sin((ring + .5) * math.pi / options['band_width']) * 4)
            band = band * ring_band + (1 - band) * (1 - ring_band)
        ridge_coverage = coverage * (band + (1 - band) * options['off_opacity'] / 100)
        if selection:
            # Copy the visible ridges and sun at their independent opacities.
            # Background never belongs to the copyable geometry.
            if options['sun_size']:
                sun = np.clip((options['sun_size'] / 2 - radius) * unit + .5, 0, 1)
                ridge_coverage = sun * options['sun_opacity'] / 100 + ridge_coverage * (1 - sun)
            result.paste(Image.fromarray(np.rint(ridge_coverage * 255).astype(np.uint8)), (0, top))
            continue
        profile = np.clip(distance / max(half_width, .001), -1, 1)
        brightness = options['off_brightness'] / 100
        tint = off + (gold - off) * band[..., None]
        reflection = .5 + .5 * np.cos(angle - .65 + slope_ratio * 1.2)
        relief = options['relief'] / 100
        face = .53 + .22 * reflection + .25 * profile * relief
        face *= brightness + (1 - brightness) * band
        # Neutral gaps preserve the source in soft-light mode; a little gold
        # gives opaque mode a continuous metallic substrate.
        substrate = .44 + .12 * tint
        ridge = tint * (.48 + face[..., None] * .6)
        specular = np.clip(profile, 0, 1) ** 3 * relief * (.25 + .65 * reflection)
        ridge += (1 - ridge) * specular[..., None]
        shadow = np.clip(-profile, 0, 1) ** 3 * relief * .65
        ridge *= (1 - shadow[..., None])
        # Subtle deterministic machining grain follows each ridge, not a tile.
        grain = np.sin(unfolded * 2.1 + np.sin(angle * teeth * 3 + phase * math.tau)) * .015 * relief
        # Gaps keep their own opacity; fading a ridge does not fill its place
        # with background or change the sun's independent opacity.
        background = options['background_opacity'] / 100 * (1 - coverage)
        alpha = background + ridge_coverage
        rgb = (substrate * background[..., None] + (ridge + grain[..., None]) * ridge_coverage[..., None]) / np.maximum(alpha[..., None], .00001)
        if options['sun_size']:
            # A circular sun replaces the central ridges. Size is its
            # diameter in the same 756px card coordinates as ridge spacing,
            # so preview and print agree. Zero explicitly removes the disc.
            sun = np.clip((options['sun_size'] / 2 - radius) * unit + .5, 0, 1)
            bevel_width = min(6, max(1.5, options['sun_size'] * .018))
            rim = np.clip(1 - (options['sun_size'] / 2 - radius) / bevel_width, 0, 1) * relief
            light = np.clip(-(x + y) / (np.maximum(radius, .001) * math.sqrt(2)), -1, 1)
            sun_rgb = gold + (1 - gold) * (rim * np.maximum(light, 0) * .85)[..., None]
            sun_rgb *= (1 - rim * np.maximum(-light, 0) * .65)[..., None]
            beneath = alpha * (1 - sun)
            # Fading the sun reveals the artwork, not hidden ridges beneath
            # it. Setting the diameter to zero restores those center ridges.
            sun_coverage = sun * options['sun_opacity'] / 100
            alpha = sun_coverage + beneath
            rgb = (sun_rgb * sun_coverage[..., None] + rgb * beneath[..., None]) / np.maximum(alpha[..., None], .00001)
        rgba = np.empty((*radius.shape, 4), dtype=np.uint8)
        rgba[..., :3] = np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)
        rgba[..., 3] = np.rint(alpha * 255).astype(np.uint8)
        result.paste(Image.fromarray(rgba), (0, top))
    return result


def soft_light(backdrop, source):
    """W3C soft-light, matching the live CSS blend (including dark colors)."""
    result = Image.new('RGB', source.size)
    for top in range(0, source.height, 128):
        box = (0, top, source.width, min(source.height, top + 128))
        base = np.asarray(backdrop.crop(box).convert('RGB'), dtype=np.float32) / 255
        color = np.asarray(source.crop(box).convert('RGB'), dtype=np.float32) / 255
        curve = np.where(base <= .25, ((16 * base - 12) * base + 4) * base, np.sqrt(base))
        mixed = np.where(color <= .5, base - (1 - 2 * color) * base * (1 - base),
                         base + (2 * color - 1) * (curve - base))
        result.paste(Image.fromarray(np.rint(np.clip(mixed, 0, 1) * 255).astype(np.uint8)), (0, top))
    return result
