"""Opt-in exports of development previews; never enabled in frozen releases."""
from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

from PIL import Image, ImageChops, ImageFilter, ImageStat


def enabled():
    # Packaged Deckadence uses a frozen executable. Source runs are DEV copies.
    return not getattr(sys, 'frozen', False)


def development_root():
    # This module lives in plugin_src/card-finishing-studio/prompter.
    return Path(__file__).resolve().parents[3] / '.dev_prompts' / 'ai_work' / 'generation-diagnostics'


def png(image):
    out = BytesIO()
    image.save(out, format='PNG')
    return out.getvalue()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')


def capture_pipeline(folder, arguments, result, mask=None):
    folder = Path(folder)
    # A child Python worker is not frozen even in a packaged app. Constrain
    # captures to the source checkout's designated development artifact tree.
    if not enabled() or not folder.resolve().is_relative_to(development_root().resolve()):
        return
    try:
        folder.mkdir(parents=True, exist_ok=True)
        images = arguments['image']
        if isinstance(images, Image.Image): images = [images]
        for index, image in enumerate(images, 1):
            image.save(folder / ('model-input-' + str(index) + '.png'), format='PNG')
        mask = arguments.get('mask_image',mask)
        if mask is not None:mask.save(folder / 'model-mask.png', format='PNG')
        result.save(folder / 'model-output-raw.png', format='PNG')
    except Exception as exc:
        try: (folder/'capture-error.json').write_bytes(json_bytes({'error':type(exc).__name__}))
        except OSError: pass


def capture_color_matching(folder, result, metadata):
    folder = Path(folder)
    if not enabled() or not folder.resolve().is_relative_to(development_root().resolve()):
        return
    try:
        folder.mkdir(parents=True, exist_ok=True)
        result.save(folder / 'model-output-color-matched.png', format='PNG')
        (folder / 'color-matching.json').write_bytes(json_bytes(metadata))
    except OSError:
        pass  # Development capture must not fail a generation.


class Capture:
    """Compressed snapshots retained only with the bounded, expiring Edit job."""
    LIMIT = 96 * 1024 * 1024

    def __init__(self, metadata):
        self.metadata = dict(metadata, captured_at=datetime.now(timezone.utc).isoformat())
        self.files = {}
        self.omissions = []
        self.size = 0
        root=Path(__file__).resolve().parents[3]
        paths=[*Path(__file__).parent.glob('*.py'),Path(__file__).parents[1]/'generation_worker.py',
               root/'plugin_system/art_edit.py',root/'plugin_system/local_mirror.py',root/'static/js/card_art_edit.js',
               root/'plugin_system/mirror_generation.py',root/'static/js/card_spot_foil.js']
        self.metadata['implementation_hashes']={}
        for path in paths:
            try:self.metadata['implementation_hashes'][str(path.relative_to(root)).replace('\\','/')]=sha256(path.read_bytes()).hexdigest()
            except OSError:self.omissions.append('Implementation fingerprint unavailable: '+path.name)

    def add(self, name, data):
        try:
            if isinstance(data, Image.Image): data = png(data)
            if not isinstance(data, bytes): data = json_bytes(data)
            size = self.size - len(self.files.get(name, b'')) + len(data)
            if size > self.LIMIT:
                self.omissions.append(name + ': development capture size limit reached')
                return
            self.files[name] = data
            self.size = size
        except Exception as exc:
            # Diagnostics must never turn a successful image generation into a failure.
            self.omissions.append(name + ': capture failed (' + type(exc).__name__ + ')')

    def archive(self):
        files = dict(self.files)
        try: files['color-report.json'] = json_bytes(color_report(files))
        except Exception as exc:
            files['color-report.json'] = json_bytes({'unavailable': type(exc).__name__})
        if self.metadata.get('feature')=='mirror_shards':
            for prefix in ('mirror-artwork-','fill-canvas-','extend-margin-'):
                stage={key[len(prefix):]:value for key,value in files.items() if key.startswith(prefix)}
                if stage:
                    try: files[prefix+'color-report.json']=json_bytes(color_report(stage))
                    except Exception as exc: files[prefix+'color-report.json']=json_bytes({'unavailable':type(exc).__name__})
        files['README.txt'] = README.encode('utf-8')
        manifest = dict(schema_version=1, **self.metadata, omissions=list(self.omissions), files={})
        for name, data in files.items():
            entry = dict(bytes=len(data), sha256=sha256(data).hexdigest())
            if name.endswith('.png'):
                with Image.open(BytesIO(data)) as image:
                    entry.update(size=list(image.size), mode=image.mode)
            manifest['files'][name] = entry
        out = BytesIO()
        with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
            for name, data in files.items(): archive.writestr(name, data)
            archive.writestr('manifest.json', json_bytes(manifest))
        return out.getvalue()


def color_report(files):
    report = dict(units='Encoded RGB, 0–255; no ICC conversion or color correction applied.',
        interpretation='Paired differences include changes in content or registration as well as color. These measurements are diagnostic, not a quality score.')
    required = ('model-input-1.png', 'model-mask.png', 'model-output-raw.png')
    if not all(name in files for name in required):
        return dict(report, unavailable='Raw model input, mask or output was not captured for this run.')
    reference, mask, raw = [Image.open(BytesIO(files[name])) for name in required]
    reference = reference.convert('RGB'); raw = raw.convert('RGB'); mask = mask.convert('L')
    if raw.size != reference.size or mask.size != raw.size:
        return dict(report, unavailable='Model output dimensions differ from the input; no unregistered pixel comparison was made.')
    # Stay away from padding/interpolation at the edit edge when measuring drift.
    protected = mask.point(lambda value: 255 if value == 0 else 0).filter(ImageFilter.MinFilter(5))
    selected = mask.point(lambda value: 255 if value > 127 else 0)
    def stats(image, region):
        count = region.histogram()[255]
        if not count: return None
        values = ImageStat.Stat(image, region)
        return dict(pixels=count, mean_rgb=[round(v, 3) for v in values.mean],
                    stddev_rgb=[round(v, 3) for v in values.stddev])
    before, after = stats(reference, protected), stats(raw, protected)
    report.update(model_size=list(raw.size), protected_reference=before, protected_raw_output=after,
                  generated_area=stats(raw, selected),
                  sampling='Protected pixels have a zero model mask, eroded by 2 pixels. Generated area uses mask >127. Same coordinates are compared before resize, masking and feathering.')
    if before and after:
        report['protected_drift'] = dict(mean_rgb_bias=[round(b-a, 3) for a,b in zip(before['mean_rgb'],after['mean_rgb'])],
            mean_absolute_rgb_difference=[round(v, 3) for v in ImageStat.Stat(ImageChops.difference(reference,raw),protected).mean])
    return report


README = """Card Finishing Studio - DEV generation diagnostics

This is a local snapshot of one preview, not an applied or saved card edit.
Start with comparison.png, result-composited.png, color-report.json and plan.json.

For Dark Mirror Shards, start with source-artwork.png and result-scene.png.
Stage files use mirror-artwork-, fill-canvas- and extend-margin- prefixes.
Each stage includes its own compiled plan, prepared reference and actual model
outputs. The mirror transformation intentionally changes content; its color
differences are not a calibration target. Margin stages retain completed art.

source-edited.png: the exact full card submitted, including enabled painted edits.
Editable text objects, finish effects, foil and gloss are not AI image inputs.
selection-original.png: selection before artwork protection (white = selected).
selection-effective.png: actual full-card application mask after protection.
source-crop.png: edited source at the generation crop coordinates.
reference-prepared.png: crop after frame/text exclusion or object blanking.
generation-mask.png: generation mask at crop size (may exceed application mask).
analysis-source.png / analysis-mask.png: source inputs to artwork analysis, when used.
model-input-*.png / model-mask.png: actual images and mask passed to the pipeline.
model-output-raw.png: model output before color matching, resizing or restoring original pixels.
model-output-color-matched.png: output after guarded color matching for Match artwork
  outpaints. color-matching.json records whether matching was applied or skipped,
  the reference evidence and adjustments. Raw model output remains available.
worker-output.png: resized output with unselected generation pixels restored.
blend-mask.png: final application alpha in crop coordinates.
result-overlay.png: full-card transparent overlay offered by Apply result.
result-composited.png: edited source with that overlay applied, without editable text.
comparison.png: reduced side-by-side before (left) and result (right).
plan.json: exact prompt, negative prompt, seed, model/adapter revisions, settings,
  analyzer observations, geometry, hashes and runtime versions.
prompt-dictionary.json: effective dictionary snapshot used by this generation.
model-catalog.json: pinned model sources, including dedicated Edit checkpoints.
package-catalog.json: package/provider definitions at generation time.
manifest.json: capture metadata, image dimensions, checksums, implementation
  fingerprints (including uncommitted source changes) and any omissions.

All full-sized PNGs retain their native captured dimensions. Only comparison.png
is reduced. Crop positions use left, top, right, bottom in full-card pixels.
Analysis internally thumbnails its input to 768px and adds edge strips (outpaint)
or the mask guide (other edits); its observations are recorded in plan.json.
Missing raw files are reported, never reconstructed or presented as originals.
RGB statistics do not prove a perceptual color match or isolate content changes.
No model weights, credentials or unrelated job logs are included. Nothing uploads.
"""
