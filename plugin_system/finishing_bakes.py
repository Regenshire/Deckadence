"""Saved printable effect rasters and disposable composed artwork caches.

Effect pixels are baked at save time and travel with the editable record.
Print/export only places those pixels; it never runs effect renderers. Foil and
gloss remain independent plates. Composed artwork caches may be discarded.
"""
import base64
from contextlib import closing
import hashlib
import json
from pathlib import Path
import tempfile
import threading
from io import BytesIO

from PIL import Image, ImageOps

from paths import IMAGE_CACHE_DIR
from . import finishing_effects as effects

CACHE_ROOT = Path(IMAGE_CACHE_DIR) / "finishing_bakes"
BAKE_VERSION = 2
EFFECT_BAKE_VERSION = 1
EFFECT_BAKE_WIDTH = 3024
# Bound lock storage, while serializing simultaneous requests for the same bake.
_locks = [threading.Lock() for _ in range(32)]
_upgrade_lock = threading.Lock()


def _mask_bytes(layer):
    return layer['png'] if 'png' in layer else base64.b64decode(layer['mask_png_base64'])


def _effect_key(layer, renderer, key_version=2):
    digest = hashlib.sha256(_mask_bytes(layer))
    digest.update(json.dumps([EFFECT_BAKE_VERSION, renderer, EFFECT_BAKE_WIDTH,
                              (effects.visual_parameters(layer) if key_version >= 2 else effects.parameters(layer))], sort_keys=True).encode())
    return digest.hexdigest()


def prepare_effect_bakes(settings, previous=None):
    """Bake changed effects before committing the card; reuse unchanged pixels."""
    result = dict(settings)
    for name in ('effect1', 'effect2'):
        layer = result.get(name)
        if not layer:
            continue
        renderer = effects.renderer_version(layer)
        key = _effect_key(layer, renderer)
        old = (previous or {}).get(name) or {}
        saved = old.get('baked_overlay')
        if saved and saved.get('renderer') == renderer and _effect_key(old, renderer) == key:
            try:
                saved_overlay(old)
                # Upgrade the key without changing already validated print pixels.
                saved = dict(saved, key=key, key_version=2)
            except ValueError:
                saved = None
        else:
            saved = None
        if not saved:
            png = effects.render_overlay(_mask_bytes(layer), effects.parameters(layer), EFFECT_BAKE_WIDTH)
            saved = dict(version=EFFECT_BAKE_VERSION, renderer=renderer, key=key, key_version=2,
                         sha256=hashlib.sha256(png).hexdigest(), png_base64=base64.b64encode(png).decode('ascii'))
        result[name] = dict(layer, baked_overlay=saved)
    return result


def saved_overlay(layer):
    """Read durable pixels. A missing/stale bake must never trigger rendering."""
    saved = layer.get('baked_overlay')
    message = 'This effect needs a saved print bake. Open Card Finishing Studio and save this card before exporting.'
    if (not isinstance(saved, dict) or saved.get('version') != EFFECT_BAKE_VERSION
            or saved.get('key') != _effect_key(layer, saved.get('renderer'), saved.get('key_version', 1))):
        raise ValueError(message)
    try:
        png = base64.b64decode(saved['png_base64'], validate=True)
        if hashlib.sha256(png).hexdigest() != saved['sha256']:
            raise ValueError(message)
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(message) from error
    return png


def ensure_record_effect_bakes(get_connection, key):
    """Complete saved records created before durable bakes were introduced.

    Used by the card-view upgrade path, never by print/export. Render outside
    the database transaction; compare-and-swap protects concurrent card edits.
    Keep the user's revision, masks, generated scenes and all settings intact.
    Valid existing pixels are retained even after a renderer version change.
    """
    with _upgrade_lock:
        for _ in range(3):
            with closing(get_connection()) as conn:
                row = conn.execute('SELECT revision,settings FROM card_spot_foil '
                    'WHERE scope_token=? AND card_uuid=? AND face=?', key).fetchone()
            if row is None:
                return {}
            revision, original = row
            settings = json.loads(original)
            updated = dict(settings)
            for name in ('effect1', 'effect2'):
                layer = settings.get(name)
                if not layer:
                    continue
                try:
                    saved_overlay(layer)
                except ValueError:
                    updated[name] = prepare_effect_bakes({name: layer})[name]
            if updated == settings:
                return settings
            with closing(get_connection()) as conn, conn:
                changed = conn.execute('UPDATE card_spot_foil SET settings=? '
                    'WHERE scope_token=? AND card_uuid=? AND face=? AND revision=? AND settings=?',
                    (json.dumps(updated, allow_nan=False), *key, revision, original)).rowcount
            if changed:
                return updated
        raise ValueError('This card changed while its saved effects were being prepared. Reload the card.')


def cached_saved_overlay(layer, width=1512):
    """Resize a saved bake for display without rebuilding its effect geometry."""
    png = saved_overlay(layer)
    key = hashlib.sha256(png + str(width).encode()).hexdigest()
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    target = CACHE_ROOT / ('overlay-' + key + '.png')
    with _locks[int(key[:8], 16) % len(_locks)]:
        if not target.is_file():
            with Image.open(BytesIO(png)) as source:
                image = source.resize((width, round(width*source.height/source.width)), Image.Resampling.LANCZOS)
                _write_png(image, target)
    return target


def _write_png(image, target):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=CACHE_ROOT, suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            image.save(output, format='PNG')
        temporary.replace(target)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def artwork_layers(settings, enabled=("effect1", "effect2")):
    edits=[dict(finish='art_edit',png=base64.b64decode(settings['edit']['png_base64']))] if settings.get('edit') else []
    return edits+[dict(settings[name], png=base64.b64decode(settings[name]["mask_png_base64"]))
            for name in ("effect1", "effect2") if name in enabled and settings.get(name) and not settings[name].get("disabled",False)]


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
        digest.update(json.dumps({'finish':'art_edit'} if layer.get('finish')=='art_edit' else effects.visual_parameters(layer), sort_keys=True).encode())
        digest.update(layer["png"])
        if layer.get('finish') != 'art_edit':
            # Validate even on a cache hit. Export never accepts stale pixels.
            digest.update(hashlib.sha256(saved_overlay(layer)).digest())
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
            _write_png(result, target)
    return target


def baked_image(image, layers, trim_size=None, **options):
    if not layers:
        return image.copy()
    with Image.open(cached_artwork(image, layers, trim_size, **options)) as baked:
        return baked.copy()
