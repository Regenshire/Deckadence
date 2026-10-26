"""Bounded artwork crops for micro scenes; no model or renderer dependencies."""
import math
import random


def validate_regions(value):
    if not isinstance(value, dict) or set(value) != {'face', 'body'}:
        raise ValueError('Target observations must contain face and body regions.')
    result = {}
    for kind, boxes in value.items():
        if not isinstance(boxes, list) or len(boxes) > 24:
            raise ValueError('Invalid target region list.')
        result[kind] = []
        for box in boxes:
            if (not isinstance(box, list) or len(box) != 4 or
                    any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1000 for v in box) or
                    box[2] <= box[0] or box[3] <= box[1]):
                raise ValueError('Target boxes must be ordered coordinates from 0 to 1000.')
            result[kind].append(list(box))
    return result


def crop_boxes(size, target, count, seed, regions=None):
    """Return crops in source pixels, retaining context around real detected subjects.

    Random uses stratified, shuffled cells so every mirror has a different
    reference region. No face/body found is an explicit fallback, never a
    guessed face in the upper half of an image.
    """
    width, height = size
    boxes = (regions or {}).get(target, []) if target != 'random' else []
    fallback = target != 'random' and not boxes
    rng = random.Random(seed)
    if boxes:
        # Sort spatially rather than trusting the analyzer's response ordering.
        boxes = sorted(boxes, key=lambda b: (b[0], b[1]))
        crops = []
        for i in range(count):
            l, t, r, b = boxes[i % len(boxes)]
            cx, cy = (l+r)*width/2000, (t+b)*height/2000
            # Include hair/neck for faces and surrounding context for bodies.
            extent = max((r-l)*width/1000, (b-t)*height/1000)*(1.7 if target == 'face' else 1.12)
            crops.append(_square(size, cx, cy, extent))
        return crops, fallback
    cols = max(1, math.ceil(math.sqrt(count*width/height)))
    rows = math.ceil(count/cols)
    cells = [(x, y) for y in range(rows) for x in range(cols)]
    rng.shuffle(cells)
    extent = min(width, height)*min(.62, max(.24, 1.15/math.sqrt(count)))
    crops = [_square(size, (x+.5+rng.uniform(-.16,.16))*width/cols,
                     (y+.5+rng.uniform(-.16,.16))*height/rows, extent) for x,y in cells[:count]]
    return crops, fallback


def focus_boxes(source_size, artwork_box, selections):
    """Map explicit card-coordinate crops into the fixed art box, without recentering.

    A changed art box must not silently move a user's chosen face/detail. Only
    subpixel rounding at the art-box edge is allowed; otherwise reselect it.
    """
    left,top,right,bottom=artwork_box
    result=[]
    for selection in selections:
        if not isinstance(selection,list) or len(selection)!=4:
            raise ValueError('Choose a focus area for every micro scene being generated.')
        if any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in selection):
            raise ValueError('Choose a valid focus area.')
        l,t,r,b=(round(v*source_size[i%2]) for i,v in enumerate(selection))
        if l<left-1 or t<top-1 or r>right+1 or b>bottom+1 or r-l<2 or b-t<2:
            raise ValueError('A focus area is outside the current art box or too small. Select it again.')
        result.append((max(left,l)-left,max(top,t)-top,min(right,r)-left,min(bottom,b)-top))
    return result


def _square(size, cx, cy, extent):
    w,h = size
    extent = max(8, min(w,h,extent))
    left = max(0, min(w-extent, cx-extent/2))
    top = max(0, min(h-extent, cy-extent/2))
    return tuple(round(v) for v in (left,top,left+extent,top+extent))
