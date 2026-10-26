"""Card Finishing Studio: local text, subject, and frame detection.

IS-Net general-use model: https://github.com/xuebinqin/DIS (Apache-2.0).
ONNX conversion and preprocessing reference: https://github.com/danielgatis/rembg
Card pixels are processed locally; only the fixed model download uses the network.
"""
import base64
from contextlib import redirect_stdout
from functools import lru_cache
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from urllib.request import urlopen

sys.dont_write_bytecode = True

MODEL_URL = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"
MODEL_SHA256 = "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a"


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def model_file(name="isnet-general-use.onnx", checksum=MODEL_SHA256):
    folder = Path(os.environ.get("DECKADENCE_SUBJECT_MODELS") or Path(__file__).parent / "models")
    path = folder / name
    if path.is_file() and digest(path) == checksum:
        return path
    folder.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        deadline = time.monotonic() + 240
        url = "https://github.com/danielgatis/rembg/releases/download/v0.0.0/" + name
        with urlopen(url, timeout=30) as source, tempfile.NamedTemporaryFile(dir=folder, suffix=".part", delete=False) as target:
            temporary = Path(target.name)
            size = 0
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > 200_000_000 or time.monotonic() > deadline:
                    raise RuntimeError("AI model download took too long. Check your connection and retry.")
                target.write(chunk)
        if digest(temporary) != checksum:
            raise RuntimeError("AI model verification failed. Retry the download.")
        temporary.replace(path)
        return path
    except OSError as exc:
        raise RuntimeError("Could not download the AI model. Connect to the internet and retry.") from exc
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def read_image(payload):
    from PIL import Image, ImageOps

    encoded = payload.get("image") if isinstance(payload, dict) else None
    if not isinstance(encoded, str) or len(encoded) > 6_000_000:
        raise ValueError("Provide a card image smaller than 6 MB.")
    with Image.open(BytesIO(base64.b64decode(encoded, validate=True))) as source:
        if source.width * source.height > 4_000_000 or min(source.size) < 16:
            raise ValueError("Use an image between 16 pixels and 4 megapixels.")
        return ImageOps.exif_transpose(source).convert("RGB")


@lru_cache(maxsize=1)
def subject_engine():
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 2
    return ort.InferenceSession(str(model_file()), sess_options=options, providers=["CPUExecutionProvider"])


def detect_subject(payload):
    import numpy as np
    from PIL import Image
    image = read_image(payload)
    engine = subject_engine()
    samples = np.asarray(image.resize((1024, 1024), Image.Resampling.LANCZOS), dtype=np.float32)
    samples = samples / max(float(samples.max()), 1e-6) - 0.5
    tensor = np.ascontiguousarray(samples.transpose(2, 0, 1)[None, ...])
    output = engine.run([engine.get_outputs()[0].name], {engine.get_inputs()[0].name: tensor})[0][0, 0]
    if not np.isfinite(output).all():
        raise RuntimeError("The subject model returned an invalid mask.")
    low, high = float(output.min()), float(output.max())
    if high - low < 1e-6:
        raise RuntimeError("No distinct subject found. Try a different region or use the selection tools.")
    # Segmentation confidence is not ink coverage. Keep the detected subject
    # solid and use resampling only for its edge; the editor sets coverage.
    alpha = ((output - low) / (high - low) >= .5).astype(np.uint8) * 255
    mask = Image.fromarray(alpha).resize(image.size, Image.Resampling.LANCZOS)
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    return {"ok": True, "mask": base64.b64encode(buffer.getvalue()).decode("ascii"),
            "width": mask.width, "height": mask.height, "engine": "IS-Net general-use"}


def execute(command, payload):
    if command == 'detect_text':
        from text_detection import detect_text
        return detect_text(payload)
    if command == 'detect_subject':
        return detect_subject(payload)
    if command == 'detect_frame':
        from frame_detection import detect_frame
        return detect_frame(payload)
    if command in ('info', 'health'):
        import numpy, onnxruntime, PIL
        import cv2, rapidocr_onnxruntime
        return {'ok': True, 'plugin_id': 'card-finishing-studio', 'commands': ['detect_text', 'detect_subject', 'detect_frame']}
    raise ValueError('Unsupported Card Finishing Studio command.')


def worker():
    previous = None
    for line in sys.stdin:
        try:
            request = json.loads(line)
            command = request['command']
            with redirect_stdout(sys.stderr):
                if command != previous:
                    # Keep only one detector's weights resident at a time.
                    subject_engine.cache_clear()
                    for name, factory in (('text_detection', 'text_engine'), ('frame_detection', 'frame_engine')):
                        module = sys.modules.get(name)
                        if module:
                            getattr(module, factory).cache_clear()
                    import gc
                    gc.collect()
                previous = command
                result = execute(command, request.get('payload', {}))
            print(json.dumps({'ok': True, 'result': result}, allow_nan=False), flush=True)
        except Exception as exc:
            print(json.dumps({'ok': False, 'error': str(exc)}), flush=True)
            return  # The host discards failed workers, including their model state.


if __name__ == '__main__':
    sys.modules.setdefault('plugin', sys.modules[__name__])
    try:
        command = sys.argv[1] if len(sys.argv) > 1 else 'info'
        if command == 'worker':
            worker()
        else:
            with redirect_stdout(sys.stderr):
                result = execute(command, json.load(sys.stdin) if command.startswith('detect_') else {})
            print(json.dumps(result, allow_nan=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
