"""Disposable, content-addressed artwork with printable effects baked in.

The source image, masks and layer settings remain authoritative. Foil and gloss
never enter this cache. All callers use the same ordered artwork compositor.
"""
import base64
import hashlib
import json
from pathlib import Path
import tempfile
import threading

from PIL import Image, ImageOps

from paths import IMAGE_CACHE_DIR
from . import finishing_effects as effects

CACHE_ROOT = Path(IMAGE_CACHE_DIR) / "finishing_bakes"
BAKE_VERSION = 1
# Bound lock storage, while serializing simultaneous requests for the same bake.
_locks = [threading.Lock() for _ in range(32)]


def artwork_layers(settings, enabled=("effect1", "effect2")):
    return [dict(settings[name], png=base64.b64decode(settings[name]["mask_png_base64"]))
            for name in ("effect1", "effect2") if name in enabled and settings.get(name)]


def cached_artwork(image, layers, trim_size=None, *, rotation=0, extend_bleed=False):
    """Return a lossless cache file; identity includes pixels, masks and settings.

    Print sources may already be rotated and include bleed. Unrotate before
    applying card-space masks, then restore the supplied placement orientation.
    Identical content can safely share a bake across scopes and consumers.
    """
    oriented = ImageOps.exif_transpose(image)
    source = oriented.convert("RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB")
    rotation = int(rotation) % 360
    if rotation not in (0, 90, 180, 270):
        raise ValueError("Choose a right-angle print rotation.")
    metadata = [BAKE_VERSION, effects.RENDER_VERSION, source.mode, source.size,
                trim_size, rotation, bool(extend_bleed)]
    digest = hashlib.sha256(json.dumps(metadata).encode())
    digest.update(source.tobytes())
    for layer in layers:
        digest.update(json.dumps(effects.parameters(layer), sort_keys=True).encode())
        digest.update(layer["png"])
    key = digest.hexdigest()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    target = CACHE_ROOT / (key + ".png")
    with _locks[int(key[:8], 16) % len(_locks)]:
        if not target.is_file():
            if rotation:
                source = source.transpose({90: Image.Transpose.ROTATE_90,
                    180: Image.Transpose.ROTATE_180, 270: Image.Transpose.ROTATE_270}[rotation])
            result = effects.composite_effects(source, layers, trim_size, extend_bleed=extend_bleed)
            if rotation:
                result = result.transpose({90: Image.Transpose.ROTATE_270,
                    180: Image.Transpose.ROTATE_180, 270: Image.Transpose.ROTATE_90}[rotation])
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=CACHE_ROOT, suffix=".tmp", delete=False) as output:
                    temporary = Path(output.name)
                    result.save(output, format="PNG")
                temporary.replace(target)
            finally:
                if temporary:
                    temporary.unlink(missing_ok=True)
    return target


def baked_image(image, layers, trim_size=None, **options):
    if not layers:
        return image.copy()
    with Image.open(cached_artwork(image, layers, trim_size, **options)) as baked:
        return baked.copy()
