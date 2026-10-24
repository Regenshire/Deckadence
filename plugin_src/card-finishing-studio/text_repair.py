"""Detect lettering and restore its small holes from neighboring image pixels.

Runs in the existing detection runtime; no diffusion model or download is used.
The user's selection bounds the search. It is never treated as a fill rectangle.
"""
import argparse
import json
from pathlib import Path


def text_mask(image, selection, progress=lambda *args: None):
    import cv2
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    height, width = image.shape[:2]
    progress('detecting', 'Detecting lettering inside the selected area.')
    engine = RapidOCR(det_limit_side_len=1600, det_limit_type='max',
                      intra_op_num_threads=2, inter_op_num_threads=2)
    # OCR locates text lines. The next step resolves their individual strokes,
    # keeping the original background between letters and between lines.
    lines, _ = engine(image[:, :, ::-1].copy(), use_cls=False, use_rec=True, text_score=.4)
    combined = np.zeros((height, width), dtype=np.uint8)
    count = 0
    for points, text, confidence in lines or []:
        if confidence < .4 or not text.strip():
            continue
        points = np.asarray(points, dtype=np.float32)
        line_height = max(4, min(np.linalg.norm(points[0]-points[3]), np.linalg.norm(points[1]-points[2])))
        spread = max(2, round(line_height * .12))
        margin = spread + 3
        l, t = np.maximum(0, np.floor(points.min(axis=0)).astype(int)-margin)
        r, b = np.minimum([width, height], np.ceil(points.max(axis=0)).astype(int)+margin+1)
        if r <= l or b <= t or not np.any(selection[t:b, l:r]):
            continue
        region = np.zeros((b-t, r-l), np.uint8)
        cv2.fillPoly(region, [np.round(points-[l, t]).astype(np.int32)], 255)
        region = cv2.dilate(region, np.ones((2*spread+1, 2*spread+1), np.uint8))
        if not np.any((region > 0) & (selection[t:b, l:r] > 0)):
            continue
        gray = cv2.cvtColor(image[t:b, l:r], cv2.COLOR_RGB2GRAY)
        # Closing/opening estimate the local surface through dark/light glyphs.
        # Unlike a whole-selection average, these follow lighting gradients.
        diameter = max(3, round(line_height * .65)) | 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (diameter, diameter))
        dark = cv2.subtract(cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel), gray)
        light = cv2.subtract(gray, cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel))
        inside = region > 0
        # The majority tone is the background. Using contrast strength alone
        # mistakes bright gaps between dark letters for white lettering.
        split, _ = cv2.threshold(gray[inside], 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        contrast = dark if np.median(gray[inside]) > split else light
        threshold, _ = cv2.threshold(contrast[inside], 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        strokes = ((contrast > max(7, threshold * .65)) & inside).astype(np.uint8) * 255
        # OCR boxes can graze a nearby panel rule. Do not turn that border into
        # a letter stroke merely because it has the same color as the ink.
        components, labels, stats, _ = cv2.connectedComponentsWithStats(strokes)
        for component in range(1, components):
            _, _, cw, ch, area = stats[component]
            if (cw > line_height*2.5 and ch < line_height*.2) or area < 2:
                strokes[labels == component] = 0
        coverage = np.count_nonzero(strokes) / max(1, np.count_nonzero(region))
        if not .005 < coverage < .75:
            continue
        # Include antialiasing, outlines and small shadows before filling.
        strokes = cv2.dilate(strokes, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*spread+1, 2*spread+1)))
        combined[t:b, l:r] = np.maximum(combined[t:b, l:r], strokes)
        count += 1
    combined[selection == 0] = 0
    return combined, count


def smooth_letter_fill(image, mask, initial):
    """Continue local background gradients inside holes, fixing their boundary.

    Navier-Stokes filling can leave flat bands through large letter strokes.
    Harmonic relaxation removes those bands without blurring unmasked artwork.
    Work only on the mask's bounding rectangle to keep small repairs inexpensive.
    """
    import cv2
    import numpy as np

    x, y, width, height = cv2.boundingRect(mask)
    if not width or not height:
        return initial
    left, top = max(0, x-1), max(0, y-1)
    right, bottom = min(image.shape[1], x+width+1), min(image.shape[0], y+height+1)
    holes = mask[top:bottom, left:right]
    work = image[top:bottom, left:right].astype(np.float32)
    cv2.copyTo(initial[top:bottom, left:right].astype(np.float32), holes, work)
    kernel = np.array([[0, .25, 0], [.25, 0, .25], [0, .25, 0]], np.float32)
    for iteration in range(600):
        neighbors = cv2.filter2D(work, -1, kernel)
        # Checking periodically avoids allocating a difference for every pass.
        settled = iteration % 20 == 19 and np.max(np.abs(neighbors[holes > 0]-work[holes > 0])) < .02
        cv2.copyTo(neighbors, holes, work)
        if settled:
            break
    result = initial.copy()
    result[top:bottom, left:right] = np.clip(np.round(work), 0, 255).astype(np.uint8)
    return result


def repair(image, selection, progress=lambda *args: None):
    import cv2
    import numpy as np

    mask, count = text_mask(image, selection, progress)
    if not np.any(mask):
        raise ValueError('No text was detected inside this selection. Select the complete lettering with a little surrounding background and try again. Nothing was filled.')
    progress('repairing', f'Repairing {count} detected text regions from their surrounding background.')
    radius = max(3, min(9, round(min(image.shape[:2]) / 200)))
    # The core (including shadows) is fully removed. Only a small outer fringe
    # blends into untouched pixels; the original text cannot bleed back in.
    fringe = cv2.GaussianBlur(mask, (0, 0), .65)
    blend = np.maximum(mask, fringe)
    blend[selection == 0] = 0
    fringe_mask = (blend > 0).astype(np.uint8)*255
    filled = cv2.inpaint(image, fringe_mask, radius, cv2.INPAINT_NS)
    progress('repairing', 'Matching background gradients inside the detected lettering.')
    filled = smooth_letter_fill(image, fringe_mask, filled)
    weight = blend[:, :, None].astype(np.float32)/255
    result = np.round(filled*weight + image*(1-weight)).clip(0, 255).astype(np.uint8)
    progress('rendering', 'Blending repaired letter edges and preserving the surrounding artwork.')
    return result, blend, count


def run(request):
    import numpy as np
    from PIL import Image

    def progress(stage, message):
        if request.get('progress_path'):
            path = Path(request['progress_path']); temporary = path.with_suffix('.tmp')
            temporary.write_text(json.dumps(dict(stage=stage, message=message)), encoding='utf-8')
            temporary.replace(path)
    with Image.open(request['image']) as supplied:
        if supplied.width * supplied.height > 13_000_000:
            raise ValueError('The selected artwork is too large for text repair.')
        image = supplied.convert('RGB')
    with Image.open(request['mask']) as supplied:
        selection = supplied.getchannel('A').resize(image.size, Image.Resampling.LANCZOS)
    result, _, count = repair(np.asarray(image), np.asarray(selection), progress)
    Image.fromarray(result).save(request['output'], format='PNG')
    return dict(ok=True, text_regions=count)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--request', required=True)
    args = parser.parse_args()
    request = json.loads(Path(args.request).read_text(encoding='utf-8'))
    try:
        print(json.dumps(run(request)))
    except ValueError as exc:
        # Bounded user-facing failures are returned separately from native logs.
        Path(request['output']).with_suffix('.error.json').write_text(json.dumps(dict(message=str(exc))), encoding='utf-8')
        raise
