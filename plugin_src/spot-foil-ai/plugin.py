"""Local text-region detection. Card artwork never leaves this computer.

RapidOCR (Apache-2.0): https://github.com/RapidAI/RapidOCR/tree/v1.4.4
The dependency supplies the PaddleOCR detector and its model assets.
"""
import base64
from contextlib import redirect_stdout
from io import BytesIO
import json
import math
import sys


def detect_text(payload):
    from PIL import Image
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    encoded = payload.get("image", "")
    if not isinstance(encoded, str) or len(encoded) > 6_000_000:
        raise ValueError("Use a card image smaller than 6 MB.")
    raw = base64.b64decode(encoded, validate=True)
    with Image.open(BytesIO(raw)) as image:
        if image.width * image.height > 4_000_000:
            raise ValueError("Use a card image of 4 megapixels or less.")
        image = image.convert("RGB")
    width, height = image.size
    engine = RapidOCR(det_limit_side_len=1280, det_limit_type="max",
                      intra_op_num_threads=2, inter_op_num_threads=2)
    polygons = []
    # Angled and quarter-turn passes catch non-horizontal lettering. The
    # returned regions are suggestions, not a guarantee of complete OCR.
    for angle in (0, -25, 25, 90):
        rotated = image.rotate(angle, expand=True)
        cosine, sine = math.cos(math.radians(angle)), math.sin(math.radians(angle))
        boxes, _ = engine(np.asarray(rotated)[:, :, ::-1].copy(), use_cls=False, use_rec=True, text_score=.35)
        if boxes is None:
            continue
        for box, text, confidence in boxes:
            if confidence < .35 or not text.strip():
                continue
            points = []
            for x, y in box:
                dx, dy = x - rotated.width / 2, y - rotated.height / 2
                x, y = dx * cosine - dy * sine + width / 2, dx * sine + dy * cosine + height / 2
                points.append([round(max(0, min(1, float(x) / width)), 5),
                               round(max(0, min(1, float(y) / height)), 5)])
            polygons.append(points)
    return {"ok": True, "regions": polygons[:400], "engine": "RapidOCR / PP-OCRv4"}


if __name__ == "__main__":
    try:
        command = sys.argv[1] if len(sys.argv) > 1 else "info"
        with redirect_stdout(sys.stderr):
            if command == "detect_text":
                result = detect_text(json.load(sys.stdin))
            elif command in ("info", "health"):
                import rapidocr_onnxruntime
                result = {"ok": True, "plugin_id": "spot-foil-ai", "commands": ["detect_text"]}
            else:
                raise ValueError("Unsupported spot-foiling command.")
        print(json.dumps(result, allow_nan=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
