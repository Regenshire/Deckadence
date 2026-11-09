"""Fast, deterministic print adjustments. Originals and spot masks stay intact."""
from collections import OrderedDict
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

CONFIG_KEY = "print_tuning_preferences"
PROFILES = [
    {"id": "neutral", "name": "Neutral", "description": "No visual-profile correction. Non-foil semi-gloss starts with every adjustment at zero.",
     "adjustments": {}},
    {"id": "balanced", "name": "Balanced", "description": "Gentle correction that keeps the character of each card.",
     "adjustments": {"brightness": 2, "contrast": 4, "vibrance": 3, "shadows": 3, "highlights": 2}},
    {"id": "pop", "name": "Color Pop", "description": "Richer muted colors, with restrained contrast and protected highlights.",
     "adjustments": {"contrast": 8, "vibrance": 22, "shadows": 3, "highlights": 6}},
    {"id": "rescue", "name": "Contrast Rescue", "description": "Separate muddy tones and bring out low-contrast artwork.",
     "adjustments": {"brightness": 4, "contrast": 22, "shadows": 12, "highlights": 4, "clarity": 12}},
    {"id": "shadow", "name": "Shadow Detail", "description": "Reveal dark artwork while keeping a solid black point.",
     "adjustments": {"brightness": 3, "contrast": 4, "shadows": 30, "highlights": 3}},
    {"id": "matte", "name": "Matte Paper Lift", "description": "A brighter starting point for dull prints. Test on your own paper.",
     "adjustments": {"brightness": 10, "contrast": 4, "vibrance": 10, "shadows": 10}},
    {"id": "gray", "name": "Grayscale Clarity", "description": "Readable monochrome with stronger tonal separation.",
     "adjustments": {"contrast": 16, "saturation": -100, "clarity": 8, "highlights": 4}},
]
# These are editable starting recipes, not measured printer/ink/media ICC profiles.
PAPERS = [
    {"id": "standard", "name": "Non-Foil Semi-Gloss Card Stock",
     "description": "Selecting this stock starts with Neutral and zero adjustments. You can choose a different profile or edit sliders afterward.",
     "adjustments": {}},
    {"id": "photo-gloss", "name": "Glossy Photo Paper",
     "description": "Very light shadow and highlight adjustments as a starting point for glossy photo prints.",
     "adjustments": {"shadows": 1, "highlights": 2}},
    {"id": "photo-matte-laminate", "name": "Glossy Photo Paper with Matte Laminate",
     "description": "A modest contrast, color and detail lift for prints that look muted after matte lamination.",
     "adjustments": {"brightness": 2, "contrast": 6, "shadows": 3, "vibrance": 4, "clarity": 4}},
    {"id": "photo-gloss-laminate", "name": "Glossy Photo Paper with Glossy Laminate",
     "description": "Restrained tonal separation for gloss-laminated photo prints. This adjusts artwork; it does not remove surface glare.",
     "adjustments": {"contrast": 3, "shadows": 2, "highlights": 3, "vibrance": 2, "clarity": 3}},
    {"id": "rainbow-foil", "name": "Rainbow Foil",
     "description": "Moderate midtone and shadow lift with clearer tonal separation, as a starting point for rainbow foil stock.",
     "adjustments": {"brightness": 4, "contrast": 8, "shadows": 9, "vibrance": 5, "clarity": 5}},
    {"id": "surge-foil", "name": "Surge Foil",
     "description": "Stronger contrast and local detail to help artwork remain readable against the foil pattern.",
     "adjustments": {"brightness": 4, "contrast": 12, "shadows": 10, "vibrance": 5, "clarity": 10}},
    {"id": "subtle-pattern-foil", "name": "Subtle Patterned Foils",
     "description": "A restrained shadow and detail lift for foil with a subtle pattern.",
     "adjustments": {"brightness": 3, "contrast": 6, "shadows": 7, "vibrance": 3, "clarity": 5}},
    {"id": "intense-pattern-foil", "name": "Intense Patterned Foils",
     "description": "The strongest starting compensation for prominent patterns: more tonal separation, shadow detail and local contrast.",
     "adjustments": {"brightness": 5, "contrast": 16, "shadows": 12, "vibrance": 4, "clarity": 14}},
    # Keep the original IDs and recipes so saved setups retain their behavior.
    {"id": "foil", "name": "Plain Silver Foil", "group": "Other paper / film setups",
     "description": "For plain reflective foil without a strong pattern. Starts with lifted midtones and clearer separation in dark artwork.",
     "adjustments": {"brightness": 6, "contrast": 9, "shadows": 12, "vibrance": 6, "clarity": 6}},
    {"id": "holographic", "name": "Holographic Foil (General)", "group": "Other paper / film setups",
     "description": "For printing directly on patterned holographic stock. Emphasizes tonal separation and local detail to help artwork stand out.",
     "adjustments": {"brightness": 5, "contrast": 13, "shadows": 10, "vibrance": 5, "clarity": 10}},
    {"id": "film-foil", "name": "Transparent Film over Foil", "group": "Other paper / film setups",
     "description": "For clear printed film mounted over foil. Starts with stronger midtone separation, shadow detail and color; the backing still affects the result.",
     "adjustments": {"brightness": 7, "contrast": 11, "shadows": 14, "saturation": 4, "vibrance": 7, "clarity": 8}},
    {"id": "pearl", "name": "Pearlescent / Metallic Photo Paper", "group": "Other paper / film setups",
     "description": "A gentler lift for pearl and metallic photo coatings, with restrained color and contrast adjustments.",
     "adjustments": {"brightness": 3, "contrast": 4, "shadows": 5, "vibrance": 4}},
    {"id": "matte", "name": "Matte / Uncoated Cardstock", "group": "Other paper / film setups",
     "description": "Starts with brighter midtones, shadow lift and added color for dull-looking matte prints.",
     "adjustments": {"brightness": 6, "contrast": 5, "shadows": 8, "vibrance": 8}},
    {"id": "gloss", "name": "Glossy / Coated Cardstock", "group": "Other paper / film setups",
     "description": "Restrained shadow and highlight adjustments for coated stock. Use your printer/paper ICC when available.",
     "adjustments": {"shadows": 3, "highlights": 4, "clarity": 3}},
    {"id": "holo-laminate", "name": "Holographic Laminate over White", "group": "Other paper / film setups",
     "description": "For artwork printed on white stock with a holographic overlay. Adds definition without the stronger lift used for a foil backing.",
     "adjustments": {"contrast": 7, "vibrance": 4, "clarity": 7}},
]
COLOR_RANGES = [
    ("color_red", "Red", 0), ("color_orange", "Orange", 30),
    ("color_yellow", "Yellow", 60), ("color_green", "Green", 120),
    ("color_cyan", "Cyan", 180), ("color_blue", "Blue", 240),
    ("color_purple", "Purple", 270), ("color_magenta", "Magenta", 300),
]
ADJUSTMENTS = [
    ("brightness", "Brightness", -30, 30), ("contrast", "Contrast", -30, 30),
    ("vibrance", "Vibrance", -30, 30), ("hue", "Hue", -180, 180),
    ("shadows", "Shadow lift", 0, 40),
    ("highlights", "Highlight recovery", 0, 40), ("saturation", "Saturation", -100, 30),
    ("warmth", "Temperature (cool / warm)", -20, 20),
    ("tint", "Tint (green / magenta)", -20, 20), ("clarity", "Local contrast", 0, 30),
] + [(key, name, -100, 100) for key, name, _ in COLOR_RANGES]


def defaults():
    return {"mode": "none", "profile": "neutral", "paper": "standard", "strength": 60,
            "adjustments": {key: 0 for key, *_ in ADJUSTMENTS},
            "output": "current", "icc": "", "intent": "relative", "black_point": True}


def validate_settings(value):
    if isinstance(value, str):
        if len(value) > 8192:
            raise ValueError("Print Tuning settings are too large.")
        try:
            value = json.loads(value)
        except (ValueError, TypeError) as exc:
            raise ValueError("Print Tuning settings are invalid. Reopen Print Tuning.") from exc
    if not isinstance(value, dict) or set(value) - set(defaults()):
        raise ValueError("Provide valid Print Tuning settings.")
    result = {**defaults(), **value}
    for key, choices in (("mode", ("none", "auto", "manual")),
                         ("profile", tuple(p["id"] for p in PROFILES)),
                         ("paper", tuple(p["id"] for p in PAPERS)),
                         ("output", ("current", "icc")), ("intent", ("relative", "perceptual"))):
        if result[key] not in choices:
            raise ValueError("Choose a supported Print Tuning " + key + ".")
    def number(raw, low, high):
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw) or not low <= raw <= high:
            raise ValueError("Print Tuning adjustments are outside their allowed range.")
        return round(raw, 2)
    result["strength"] = number(result["strength"], 0, 100)
    adjustments = result["adjustments"]
    if not isinstance(adjustments, dict) or set(adjustments) - set(defaults()["adjustments"]):
        raise ValueError("Provide valid brightness and color adjustments.")
    result["adjustments"] = {key: number(adjustments.get(key, 0), low, high)
                             for key, _, low, high in ADJUSTMENTS}
    if type(result["black_point"]) is not bool or not isinstance(result["icc"], str) or len(result["icc"]) > 200:
        raise ValueError("Choose valid printer color settings.")
    if result["mode"] != "none" and result["output"] == "icc" and not result["icc"]:
        raise ValueError("Choose a printer / paper ICC profile.")
    return result


def preferences(config):
    result = {"default": defaults(), "presets": []}
    try:
        value = json.loads(config.get(CONFIG_KEY) or "{}")
        result["default"] = validate_settings(value.get("default", defaults()))
        for item in value.get("presets", [])[:50]:
            if isinstance(item.get("name"), str) and 0 < len(item["name"]) <= 60:
                result["presets"].append({"name": item["name"], "settings": validate_settings(item["settings"])})
    except (ValueError, TypeError, KeyError, AttributeError):
        pass
    return result


def validate_output(settings):
    if settings["mode"] != "none" and settings["output"] == "icc":
        from plugin_system.print_color import profile_bytes
        profile_bytes(settings["icc"])


def analyze(image):
    sample = image.convert("RGB")
    sample.thumbnail((512, 512), Image.Resampling.LANCZOS)
    w, h = sample.size
    sample = sample.crop((int(w * .06), int(h * .06), max(int(w * .94), 1), max(int(h * .94), 1)))
    pixels = np.asarray(sample, dtype=np.float32) / 255
    luminance = pixels @ np.array([.2126, .7152, .0722], dtype=np.float32)
    # Exclude pure borders and paper-white fields from the automatic target.
    valid = (luminance > .025) & (luminance < .965)
    values = luminance[valid] if np.count_nonzero(valid) >= 64 else luminance.ravel()
    low, high = np.percentile(values, [10, 90])
    chroma = pixels.max(axis=2) - pixels.min(axis=2)
    return {"mean": float(values.mean()), "spread": float(high - low),
            "dark": float((values < .23).mean()), "saturation": float(chroma.mean())}


def needs_analysis(settings):
    return settings["mode"] == "auto" and (settings["profile"] != "neutral" or settings["paper"] != "standard")


def parameters(settings, stats):
    values = {key: 0.0 for key, *_ in ADJUSTMENTS}
    if needs_analysis(settings):
        flat = max(0, 1 - stats["spread"] / .67)
        low = max(0, (.43 - stats["mean"]) / .43)
        profile = settings["profile"]
        if profile != "neutral":
            values.update(brightness=low * 12, contrast=flat * 14, shadows=stats["dark"] * 12)
        if profile == "pop":
            values.update(vibrance=12 + max(0, .35 - stats["saturation"]) * 35,
                          contrast=values["contrast"] + 5, highlights=6)
        elif profile == "rescue":
            values.update(contrast=values["contrast"] + 10 + flat * 9,
                          shadows=values["shadows"] + 8, clarity=12)
        elif profile == "shadow":
            values.update(shadows=values["shadows"] + 18 + low * 10, contrast=values["contrast"] + 3)
        elif profile == "matte":
            values.update(brightness=values["brightness"] + 8, shadows=values["shadows"] + 6, vibrance=7)
        elif profile == "gray":
            values.update(contrast=values["contrast"] + 9, clarity=8)
        paper = next(p for p in PAPERS if p["id"] == settings["paper"])
        for key, amount in paper["adjustments"].items():
            if profile == "gray" and key in ("vibrance", "saturation", "hue", "warmth", "tint"):
                continue
            # Apply less paper lift to already-bright cards, and more separation
            # to flat artwork. Hue/tint are always explicit user adjustments.
            if key in ("brightness", "shadows"):
                amount *= .35 + .65 * max(low, stats["dark"])
            elif key in ("contrast", "clarity"):
                amount *= .6 + .4 * flat
            values[key] += amount
        values = {key: value * settings["strength"] / 100 for key, value in values.items()}
    if settings["mode"] != "none":
        values = {key: value + settings["adjustments"][key] for key, value in values.items()}
        if (settings["mode"] == "auto" and settings["profile"] == "gray") or values["saturation"] <= -100:
            for key, _, _ in COLOR_RANGES:
                values[key] = 0.0
    return values


def rotate_hue(pixels, degrees):
    """Rotate the RGB color wheel while preserving each pixel's min/max channels."""
    high, low = pixels.max(axis=2), pixels.min(axis=2)
    chroma = high - low
    divisor = np.where(chroma > 0, chroma, 1)
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    sector = np.where(high == red, (green - blue) / divisor,
                      np.where(high == green, 2 + (blue - red) / divisor,
                               4 + (red - green) / divisor))
    hue = (sector + degrees / 60) % 6
    ramps = np.clip(np.abs((hue[..., None] + np.array([0, 4, 2], dtype=np.float32)) % 6 - 3) - 1, 0, 1)
    return low[..., None] + chroma[..., None] * ramps


def adjust_color_strength(pixels, amounts):
    """Blend selective HSL strength changes; positive enriches and deepens a color."""
    high, low = pixels.max(axis=2), pixels.min(axis=2)
    chroma = high - low
    divisor = np.where(chroma > 0, chroma, 1)
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    hue = np.where(high == red, (green - blue) / divisor,
                   np.where(high == green, 2 + (blue - red) / divisor,
                            4 + (red - green) / divisor)) % 6
    # Interpolate between neighboring color centers, including red across 0/360.
    # Compute one combined adjustment so overlapping ranges never compound.
    centers = [center for _, _, center in COLOR_RANGES] + [360]
    strength = np.interp(hue.ravel() * 60, centers, [*amounts, amounts[0]])
    strength = strength.reshape(high.shape).astype(np.float32) / 100
    colorful = np.clip(chroma / .08, 0, 1)
    colorful = colorful * colorful * (3 - 2 * colorful)
    strength *= colorful  # Exact grays stay neutral; near-grays fade smoothly.
    lightness = (high + low) * .5
    saturation = chroma / np.maximum(1 - np.abs(2 * lightness - 1), 1e-6)
    positive = np.maximum(strength, 0)
    target_lightness = lightness - positive * .10 * (4 * lightness * (1 - lightness))
    target_saturation = np.where(strength >= 0,
                                saturation + (1 - saturation) * positive * .75,
                                saturation * (1 + strength))
    target_chroma = (1 - np.abs(2 * target_lightness - 1)) * target_saturation
    target_low = target_lightness - target_chroma * .5
    result = target_low[..., None] + (pixels - low[..., None]) / divisor[..., None] * target_chroma[..., None]
    return np.where(strength[..., None] != 0, result, pixels)


def apply_tuning(image, settings, stats=None):
    if settings["mode"] == "none":
        return image
    source = image.convert("RGB")
    values = parameters(settings, (stats or analyze(source)) if needs_analysis(settings) else None)
    gray = (settings["mode"] == "auto" and settings["profile"] == "gray") or values["saturation"] <= -100
    if not gray and not any(values.values()):
        return image
    # Process strips so high-resolution cards do not require several full float arrays.
    result = Image.new("RGB", source.size)
    color_amounts = [values[key] for key, _, _ in COLOR_RANGES]
    selective_color = not gray and any(color_amounts)
    local = None
    if values["clarity"]:
        small = source.copy()
        small.thumbnail((768, 768), Image.Resampling.LANCZOS)
        local = small.convert("L").filter(ImageFilter.GaussianBlur(max(1, min(small.size) * .012)))
        local = local.resize(source.size, Image.Resampling.BILINEAR)
    for top in range(0, source.height, 128):
        box = (0, top, source.width, min(top + 128, source.height))
        pixels = np.asarray(source.crop(box), dtype=np.float32) / 255
        luminance = pixels @ np.array([.2126, .7152, .0722], dtype=np.float32)
        # Curves taper to zero at both endpoints, protecting black text and white fields.
        envelope = 4 * luminance * (1 - luminance)
        target = luminance + values["brightness"] / 100 * envelope * .45
        target += values["shadows"] / 100 * envelope * (1 - luminance) ** 2 * .65
        target -= values["highlights"] / 100 * envelope * luminance ** 2 * .45
        target += values["contrast"] / 100 * (luminance - .5) * envelope
        if local is not None:
            blur = np.asarray(local.crop(box), dtype=np.float32) / 255
            target += np.clip(luminance - blur, -.12, .12) * values["clarity"] / 100 * envelope
        target = np.clip(target, 0, 1)
        chroma = pixels.max(axis=2) - pixels.min(axis=2)
        saturation = 0 if gray else 1 + values["saturation"] / 100 + values["vibrance"] / 100 * (1 - chroma) * 1.5
        ratio = target / np.maximum(luminance, .001)
        output = target[..., None] + (pixels - luminance[..., None]) * ratio[..., None] * (saturation if gray else saturation[..., None])
        if not gray:
            output[..., 0] += values["warmth"] / 100 * envelope * .2
            output[..., 2] -= values["warmth"] / 100 * envelope * .2
            tint = values["tint"] / 100 * envelope * .2
            output[..., 0] += tint * .5
            output[..., 1] -= tint
            output[..., 2] += tint * .5
            if values["hue"]:
                output = rotate_hue(np.clip(output, 0, 1), values["hue"])
            if selective_color:
                output = adjust_color_strength(np.clip(output, 0, 1), color_amounts)
        result.paste(Image.fromarray(np.uint8(np.clip(output, 0, 1) * 255 + .5)), (0, top))
    if "A" in image.getbands():
        result.putalpha(image.getchannel("A"))
    return result


@lru_cache(maxsize=64)
def file_analysis(path, modified, size):
    with Image.open(path) as source:
        source.draft("RGB", (768, 768))
        return analyze(source.convert("RGB"))


class PrintTuningProcessor:
    """A bounded per-PDF cache; it never writes modified card files."""
    def __init__(self, settings):
        self.settings = validate_settings(settings)
        validate_output(self.settings)
        self.cache = OrderedDict()
        self.cache_bytes = 0

    def artwork(self, artwork, entry):
        if self.settings["mode"] == "none" or not entry or not entry.get("card_row"):
            return artwork
        from reportlab.lib.utils import ImageReader
        reader = artwork if isinstance(artwork, ImageReader) else ImageReader(artwork)
        pixels = reader.getRGBData()
        path = entry.get("tuning_source_path") or entry.get("temp_path")
        stat = Path(path).stat() if path else None
        key = (reader.getSize(), reader.mode, hashlib.sha256(pixels).digest(),
               path, stat.st_mtime_ns if stat else None)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key][0]
        image = Image.frombytes(reader.mode, reader.getSize(), pixels)
        stats = None
        if needs_analysis(self.settings):
            stats = file_analysis(str(path), stat.st_mtime_ns, stat.st_size) if stat else analyze(image)
        tuned = apply_tuning(image, self.settings, stats)
        if getattr(reader, "_dataA", None):
            tuned.putalpha(Image.frombytes("L", reader.getSize(), reader._dataA.getRGBData()))
        result = ImageReader(tuned)
        size = tuned.width * tuned.height * len(tuned.getbands()) * 2
        while self.cache and self.cache_bytes + size > 96 * 1024 * 1024:
            _, (_, old_size) = self.cache.popitem(last=False)
            self.cache_bytes -= old_size
        if size <= 96 * 1024 * 1024:
            self.cache[key] = (result, size)
            self.cache_bytes += size
        return result
