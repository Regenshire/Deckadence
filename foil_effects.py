"""Foil artwork presets and non-destructive print compositing.

Custom presets use a white SVG silhouette: reflected color appears only inside
its filled geometry. Add a mask entry here and a matching presentation rule in
card_effects.css when introducing another named finish.
"""
from functools import lru_cache
from pathlib import Path
from io import BytesIO
import colorsys
import json
import math
import re
from PIL import Image, ImageChops, ImageColor

ASSETS = Path(__file__).resolve().parent / "static" / "img" / "card-effects"
CUSTOM_FOIL_MASKS = {"chocobo": "chocobo-tracks.svg"}
FOIL_TYPES = {"foil", "surge", *CUSTOM_FOIL_MASKS}

def foil_settings(finish):
    """Read on demand so placement edits do not require a server restart."""
    settings = json.loads((ASSETS / "foil-settings.json").read_text(encoding="utf-8-sig")).get(finish, {})
    def number(key, default, minimum, maximum):
        try:
            value = float(settings.get(key, default))
            return max(minimum, min(maximum, value)) if math.isfinite(value) else default
        except (ValueError, TypeError):
            return default
    color = settings.get("color", "#ffffff")
    blend = settings.get("blend_mode", "normal")
    return dict(scale=number("scale", 1, .1, 2), x_percent=number("x_percent", 0, -100, 100),
                y_percent=number("y_percent", 0, -100, 100), strength=number("strength", .65, 0, 1),
                color=color if isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color) else "#ffffff",
                blend_mode=blend if blend in {"normal", "screen", "overlay", "soft-light"} else "normal")

def _custom_mask(finish, width, height):
    settings = foil_settings(finish)
    return _positioned_mask(finish, width, height, settings["scale"], settings["x_percent"], settings["y_percent"])

@lru_cache(maxsize=8)
def custom_pattern_alpha(finish, pattern_width):
    """Rasterize the complete SVG before placement or clipping to a card."""
    import cairosvg
    import xml.etree.ElementTree as ET
    viewbox = ET.parse(ASSETS / CUSTOM_FOIL_MASKS[finish]).getroot().get("viewBox").split()
    pattern_height = max(1, round(pattern_width * float(viewbox[3]) / float(viewbox[2])))
    data = cairosvg.svg2png(url=str(ASSETS / CUSTOM_FOIL_MASKS[finish]),
                           output_width=pattern_width, output_height=pattern_height)
    return Image.open(BytesIO(data)).convert("RGBA").getchannel("A")


@lru_cache(maxsize=8)
def _positioned_mask(finish, width, height, scale, x_percent, y_percent):
    pattern_width = max(1, round(width * scale))
    pattern = custom_pattern_alpha(finish, pattern_width)
    mask = Image.new("L", (width, height), 0)
    mask.paste(pattern, (round((width - pattern_width) / 2 + width * x_percent / 100), round(height * y_percent / 100)))
    return mask

def normalize_print_foil_intensity(value):
    try:
        value = float(value)
        return max(0, min(200, round(value))) if math.isfinite(value) else 100
    except (TypeError, ValueError):
        return 100


def render_print_foil(source_path, output_path, finish="foil", intensity=100):
    """Write a static reflected-light overlay; never modify the source/cache."""
    if finish not in FOIL_TYPES:
        finish = "foil"
    with Image.open(source_path) as source:
        card = source.convert("RGB")
    strength_multiplier = normalize_print_foil_intensity(intensity) / 100
    width, height = card.size
    # A small gradient is scaled once, avoiding Python work per print-resolution pixel.
    gradient = Image.new("RGB", (128, 128))
    gradient.putdata([tuple(round(c * 255) for c in colorsys.hsv_to_rgb(
        ((x + y * .55) / 160) % 1, .45, 1)) for y in range(128) for x in range(128)])
    gradient = gradient.resize(card.size, Image.Resampling.BICUBIC)
    if finish == "surge":
        with Image.open(ASSETS / "surge-foil.png") as texture:
            texture = texture.convert("RGB").resize(card.size, Image.Resampling.LANCZOS)
        # Mirror the foil overlay, not the underlying card artwork.
        gradient = ImageChops.multiply(gradient, texture).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    reflected = ImageChops.screen(card, gradient)
    if finish in CUSTOM_FOIL_MASKS:
        settings = foil_settings(finish)
        gradient = ImageChops.multiply(gradient, Image.new("RGB", card.size, ImageColor.getrgb(settings["color"])))
        blend = {"normal": lambda a, b: b, "screen": ImageChops.screen,
                 "overlay": ImageChops.overlay, "soft-light": ImageChops.soft_light}[settings["blend_mode"]]
        reflected = blend(card, gradient)
        mask = _custom_mask(finish, width, height).point(lambda value: round(value * min(1, settings["strength"] * .65 * strength_multiplier)))
        output = Image.composite(reflected, card, mask)
    else:
        output = Image.blend(card, reflected, min(1, (.25 if finish == "surge" else .18) * strength_multiplier))
    output.save(output_path, "PNG")
