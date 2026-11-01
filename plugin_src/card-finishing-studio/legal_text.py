"""Conservative footer-only OCR and locally matched legal lettering replacement.

Executed by the host with Studio's existing Python dependencies. No model
downloads or plugin reinstall are needed. Coordinates always refer to the
trimmed card, not an artwork selection or an image with added print bleed.
"""
import json
import math
import re
import sys
from contextlib import redirect_stdout
from difflib import SequenceMatcher
import unicodedata
from pathlib import Path

# Modern notices occupy the lower right; classic notices sit below Illus.
SEARCH = (.54, .86, .97, .99)
CLASSIC_SEARCH = (.08, .885, .97, .987)
LEGAL = re.compile(r'wizards|\bcoast\b|(?:\b|\d)cbs\b|s[qo]uare\s*enix|copyright|'
                   r'[©Ⓒ]\s*(?:19|20)\d{2}|\b(?:tm|trademark)\b.*(?:19|20)\d{2}|'
                   r'\bmtgstory\s*\.\s*com\b', re.I)
GAME = re.compile(r'[/⁄／]|'
                  r'\b(?:power|toughness|creature|damage|life|illustration|artist|illus)\b', re.I)
ILLUSTRATOR = re.compile(r'^(?:ill?us|[ilmt]lus)(?:\s*\.\s*|\s+)\S', re.I)
YEAR = re.compile(r'(?:19|20)\d{2}')
CLASSIC_LEGAL = re.compile(r'wizards|copyright|[©Ⓒ]|(?:\bTM\b|@)\s*&?\s*(?:[©ⒸO0@]\s*)?(?:19|20)\d{2}', re.I)


def legal_geometry(points, width, height, min_width=.045, layout='modern'):
    """The same footer/print-size limits apply even with source confirmation."""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    left, right, top, bottom = min(xs)/width, max(xs)/width, min(ys)/height, max(ys)/height
    # Oversized/merged boxes (including legal plus P/T) are never erased.
    classic = layout == 'classic'
    return (all(math.isfinite(v) for v in (left, right, top, bottom))
            and (.1 if classic else .54) <= left < right <= (.8 if classic else .97)
            and (.918 if classic else .928) <= top < bottom <= (.963 if classic else .987)
            and .005 <= bottom-top <= (.022 if classic else .021)
            and min_width <= right-left <= (.7 if classic else .43)
            and abs(points[0][1]-points[1][1])/height < (.005 if classic else .004))


def legal_line(points, text, confidence, width, height, layout='modern'):
    """Require agreement between location, print size, and recognized content."""
    return (isinstance(text, str) and confidence >= .65 and not GAME.search(text)
            and bool(CLASSIC_LEGAL.search(text) and YEAR.search(text) if layout == 'classic' else LEGAL.search(text))
            and legal_geometry(points, width, height, layout=layout))


def ocr_records(image, area, scan_width):
    import numpy as np
    from PIL import Image
    from text_detection import text_engine

    width, height = image.size
    left, top, right, bottom = [round(v*d) for v, d in zip(area, (width, height, width, height))]
    crop = image.crop((left, top, right, bottom)).convert('RGB')
    # Tiny footer glyphs need more resolution than a whole-card OCR pass gives.
    scale = scan_width / crop.width
    crop = crop.resize((scan_width, round(crop.height*scale)), Image.Resampling.LANCZOS)
    lines, _ = text_engine()(np.asarray(crop)[:, :, ::-1].copy(),
                             use_cls=False, use_rec=True, text_score=.35)
    records = []
    for points, text, confidence in lines or []:
        points = [[float(x)/scale+left, float(y)/scale+top] for x, y in points]
        records.append(dict(points=points, text=text, confidence=float(confidence)))
    return records


def bounds(line, width, height):
    xs, ys = zip(*line['points'])
    return min(xs)/width, min(ys)/height, max(xs)/width, max(ys)/height


def classic_footer(records, width, height):
    """Require an intact illustrator credit above a centered, smaller notice."""
    artists = []
    for line in records:
        left, top, right, bottom = bounds(line, width, height)
        if (line['confidence'] >= .75 and ILLUSTRATOR.search(line['text'])
                and .12 <= left < right <= .88 and .885 <= top < bottom <= .936
                and .012 <= bottom-top <= .042 and .42 <= (left+right)/2 <= .58):
            artists.append(line)
    if not artists:
        return None
    accepted, protected = [], []
    for line in records:
        line = dict(line, layout='classic')
        left, top, right, bottom = bounds(line, width, height)
        below_artist = False
        for artist in artists:
            al, at, ar, ab = bounds(artist, width, height)
            if (top >= ab-.003 and bottom-top <= (ab-at)*.95
                    and abs((left+right-al-ar)/2) <= .06):
                below_artist = True
        if below_artist and legal_line(line['points'], line['text'], line['confidence'], width, height, 'classic'):
            accepted.append(line)
        else:
            protected.append(line)
    # Some OCR engines split the collector number off the same legal baseline.
    # Never treat a fraction/stat or a number beside the illustrator as a suffix.
    for record in protected[:]:
        if record['confidence'] < .65 or not re.fullmatch(r'\d{1,4}', record['text'].strip()):
            continue
        left, top, right, bottom = bounds(record, width, height)
        for line in accepted:
            ll, lt, lr, lb = bounds(line, width, height)
            if (0 <= left-lr <= .025 and abs((top+bottom-lt-lb)/2) <= .004
                    and .5 <= (bottom-top)/(lb-lt) <= 1.25 and right <= .8):
                points = [[ll*width, min(top,lt)*height], [right*width, min(top,lt)*height],
                          [right*width, max(bottom,lb)*height], [ll*width, max(bottom,lb)*height]]
                if legal_geometry(points, width, height, layout='classic'):
                    line['points'] = points
                    line['text'] += ' '+record['text']
                    protected.remove(record)
                    break
    return accepted, protected


def detect_lines(image):
    width, height = image.size
    wide = ocr_records(image, CLASSIC_SEARCH, 2400)
    classic = classic_footer(wide, width, height)
    if classic is not None:
        # Even an uncertain classic notice must never fall back to a cropped
        # modern search, which could erase only "the Coast" and leave the rest.
        accepted, protected = classic
        return accepted, protect_stats(protected)
    accepted, protected = [], []
    for record in ocr_records(image, SEARCH, 1200):
        (accepted if legal_line(record['points'], record['text'], record['confidence'], width, height) else protected).append(record)
    for record in wide:
        left, top, right, bottom = bounds(record, width, height)
        if left < SEARCH[0]-.01 < right and .918 <= top < bottom <= .987 and bottom-top <= .035:
            # Without a reliable layout anchor, preserve text crossing the crop
            # boundary instead of treating its right half as a complete notice.
            protected.append(record)
    # Recognition can split off a tiny trademark prefix. Only join a literal
    # legal marker on the same baseline, immediately beside an accepted notice.
    for record in protected[:]:
        if not re.fullmatch(r'[™®©Ⓒ&\s.]*|(?:TM)[™®©Ⓒ&\s.]*', record['text'], re.I):
            continue
        xs, ys = zip(*record['points'])
        for line in accepted:
            lx, ly = zip(*line['points'])
            if (0 <= min(lx)-max(xs) <= width*.025 and min(xs) >= width*.54
                    and min(ys) >= height*.928 and max(ys) <= height*.987
                    and max(ys)-min(ys) <= height*.021
                    and abs((min(ys)+max(ys))-(min(ly)+max(ly))) < height*.008):
                line['points'] = [[min(xs), min(min(ys),min(ly))], [max(lx), min(min(ys),min(ly))],
                                  [max(lx), max(max(ys),max(ly))], [min(xs), max(max(ys),max(ly))]]
                protected.remove(record)
                break
    return accepted, protect_stats(protected)


def protect_stats(protected):
    # Protect the stat panel around P/T too, not just the recognized digits.
    # The legal notices beside/below it remain independent candidates.
    for record in protected:
        if re.search(r'[/⁄／]', record['text']):
            xs, ys = zip(*record['points'])
            padding = (max(ys)-min(ys))
            left, right = min(xs)-padding*.85, max(xs)+padding*.85
            top, bottom = min(ys)-padding*.35, max(ys)+padding*.25
            record['points'] = [[left, top], [right, top], [right, bottom], [left, bottom]]
    return protected


def trademark_fragment(text):
    """Recognizable prefix glyphs, including common tiny-symbol OCR errors."""
    return bool(re.fullmatch(r'TM[Il1|]?[\s&©Ⓒ®™08.]*|[&©Ⓒ®™][\s&©Ⓒ®™().]*', text, re.I))


def reference_text_matches(text, source_text):
    """Tolerate OCR damage, but not unrelated words occupying the same space."""
    def compact(value):
        return ''.join(c for c in unicodedata.normalize('NFKD', value).casefold() if c.isalnum())
    value, source = compact(text), compact(source_text)
    if len(value) >= 8 and SequenceMatcher(None, value, source, autojunk=False).ratio() >= .7:
        return True
    # A separated prefix can read as 'TM 8', 'TMI', or '&('. The original
    # must contain TM, and the caller also limits this to the notice's start.
    return source.startswith('tm') and trademark_fragment(text)


def confirm_from_reference(image, accepted, protected, reference):
    """Confirm garbled output OCR using the same notice on the original face.

    Never paint a source-image box onto the output: recovery still requires
    actual output OCR boxes of legal print size, on the same baseline and with
    nearly the same extent. Unrelated regions and stat panels stay protected.
    """
    if reference is None or abs(image.width/image.height-reference.width/reference.height) > .005:
        return accepted, protected
    uncertain = [line for line in protected if line['confidence'] >= .65
                 and not GAME.search(line['text'])
                 and (sum(c.isalpha() for c in line['text']) >= 2 or trademark_fragment(line['text']))
                 and legal_geometry(line['points'], image.width, image.height, min_width=.015, layout=line.get('layout', 'modern'))]
    if not uncertain:
        return accepted, protected
    reference_lines, _ = detect_lines(reference)

    for source in reference_lines:
        layout = source.get('layout', 'modern')
        sl, st, sr, sb = bounds(source, reference.width, reference.height)
        matches = []
        for line in accepted + uncertain:
            if line.get('layout', 'modern') != layout:
                continue
            if line in uncertain and not reference_text_matches(line['text'], source['text']):
                continue
            left, top, right, bottom = bounds(line, image.width, image.height)
            prefix = line in uncertain and trademark_fragment(line['text'])
            if prefix:
                # Prefix recovery cannot consume stray symbols elsewhere in a
                # notice or near the stat panel. Require a short leading box.
                if right > sl+(sr-sl)*.25 or right-left > (sr-sl)*.2:
                    continue
            intersection = max(0, min(right, sr)-max(left, sl))*max(0, min(bottom, sb)-max(top, st))
            if (intersection/((right-left)*(bottom-top)) >= .75
                    and abs((top+bottom-st-sb)/2) <= .006
                    # Superscript TM is smaller than the rest of the notice.
                    and (.35 if prefix else .5) <= (bottom-top)/(sb-st) <= 1.5):
                matches.append(line)
        if not any(line in uncertain for line in matches):
            continue
        xs = [x for line in matches for x, _ in line['points']]
        ys = [y for line in matches for _, y in line['points']]
        # A tiny fragment or number cannot stand in for an entire legal notice.
        if not .75 <= (max(xs)-min(xs))/image.width/(sr-sl) <= 1.2:
            continue
        points = [[min(xs), min(ys)], [max(xs), min(ys)], [max(xs), max(ys)], [min(xs), max(ys)]]
        confidence = min(line['confidence'] for line in matches)
        if not legal_line(points, source['text'], confidence, image.width, image.height, layout):
            continue
        accepted = [line for line in accepted if line not in matches]
        protected = [line for line in protected if line not in matches]
        uncertain = [line for line in uncertain if line not in matches]
        accepted.append(dict(points=points, text=source['text'], confidence=confidence, source_confirmed=True, layout=layout))
    return accepted, protected


def credit_protection(pixels, protected):
    """Keep illustrator ink/shadows, without protecting legal ink in OCR padding."""
    import cv2
    import numpy as np

    height, width = pixels.shape[:2]
    guard = np.zeros((height, width), np.uint8)
    for record in protected:
        if record.get('layout') != 'classic' or not ILLUSTRATOR.search(record['text']):
            continue
        polygon = np.round(record['points']).astype(np.int32)
        l, t = np.maximum(0, polygon.min(axis=0)-2)
        r, b = np.minimum([width, height], polygon.max(axis=0)+3)
        region = np.zeros((b-t, r-l), np.uint8)
        cv2.fillPoly(region, [polygon-[l,t]], 255)
        gray = cv2.cvtColor(pixels[t:b, l:r], cv2.COLOR_RGB2GRAY)
        detail = cv2.absdiff(gray, cv2.GaussianBlur(gray, (0,0), max(1,(b-t)*.08)))
        cutoff, _ = cv2.threshold(detail[region>0], 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        ink = ((detail > max(10, cutoff*.65)) & (region > 0)).astype(np.uint8)
        count, labels, _, _ = cv2.connectedComponentsWithStats(ink)
        # The lower edge of an OCR quadrilateral includes padding. Only extend
        # protection into it for strokes connected to the actual credit row.
        core = region.copy()
        core[round((b-t)*.8):] = 0
        connected = np.unique(labels[(core>0)&(ink>0)])
        kept = np.isin(labels, connected[connected>0]).astype(np.uint8)*255
        kept = np.maximum(kept, core)
        guard[t:b,l:r] = np.maximum(guard[t:b,l:r], kept)
    pad = max(1, round(width/1200))
    return cv2.dilate(guard, np.ones((pad*2+1,)*2, np.uint8))


def lettering_mask(pixels, lines, protected):
    """Resolve glyph strokes rather than painting an opaque footer rectangle."""
    import cv2
    import numpy as np

    height, width = pixels.shape[:2]
    combined = np.zeros((height, width), np.uint8)
    credit_guard = credit_protection(pixels, protected)
    colors = []
    for line in lines:
        points = np.asarray(line['points'], np.float32)
        line_height = float(points[:, 1].max()-points[:, 1].min())
        # Copyright symbols are often omitted by OCR at the start of a notice.
        # Include a small leading margin on this baseline, still inside the ROI.
        points[[0, 3], 0] = np.maximum(width*(.1 if line.get('layout') == 'classic' else .54),
                                     points[[0, 3], 0]-min(width*.026, line_height*1.5))
        spread = max(1, round(line_height*.16))
        margin = spread+3
        left, top = np.maximum(0, np.floor(points.min(axis=0)).astype(int)-margin)
        right, bottom = np.minimum([width, height], np.ceil(points.max(axis=0)).astype(int)+margin+1)
        region = np.zeros((bottom-top, right-left), np.uint8)
        cv2.fillPoly(region, [np.round(points-[left, top]).astype(np.int32)], 255)
        region = cv2.dilate(region, np.ones((3, 3), np.uint8))
        # Classic OCR boxes can overlap the descenders/padding of the larger
        # illustrator row. Exclude that row before looking for legal strokes.
        region[credit_guard[top:bottom, left:right] > 0] = 0
        if not np.any(region):
            return None, None
        patch = pixels[top:bottom, left:right]
        gray = cv2.cvtColor(patch, cv2.COLOR_RGB2GRAY)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(3, round(line_height*.65)) | 1,)*2)
        split, _ = cv2.threshold(gray[region > 0], 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        dark_ink = np.median(gray[region > 0]) > split
        contrast = (cv2.subtract(cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel), gray) if dark_ink
                    else cv2.subtract(gray, cv2.morphologyEx(gray, cv2.MORPH_OPEN, kernel)))
        threshold, _ = cv2.threshold(contrast[region > 0], 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
        strokes = ((contrast > max(6, threshold*.5)) & (region > 0)).astype(np.uint8)*255
        count, labels, stats, _ = cv2.connectedComponentsWithStats(strokes)
        for index in range(1, count):
            _, _, cw, ch, area = stats[index]
            if (cw > line_height*2.5 and ch < line_height*.25) or area < 2:
                strokes[labels == index] = 0
        coverage = np.count_nonzero(strokes)/max(1, np.count_nonzero(region))
        if not .01 < coverage < .65:
            return None, None  # Partial removal would leave a broken notice.
        ink = patch[strokes > 0]
        luminance = cv2.cvtColor(ink[None, ...], cv2.COLOR_RGB2GRAY)[0]
        cutoff = np.percentile(luminance, 25 if dark_ink else 75)
        solid = ink[luminance <= cutoff] if dark_ink else ink[luminance >= cutoff]
        colors.extend(solid.tolist())
        strokes = cv2.dilate(strokes, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (spread*2+1,)*2))
        strokes[credit_guard[top:bottom, left:right] > 0] = 0
        combined[top:bottom, left:right] = np.maximum(combined[top:bottom, left:right], strokes)
    # A separate OCR region can be a stat, artist credit, or a panel edge.
    for line in protected:
        if line.get('layout') == 'classic' and ILLUSTRATOR.search(line['text']):
            continue  # Already excluded precisely, including its ink/shadows.
        exclusion = np.zeros_like(combined)
        cv2.fillPoly(exclusion, [np.round(line['points']).astype(np.int32)], 255)
        exclusion = cv2.dilate(exclusion, np.ones((5, 5), np.uint8))
        if np.any((combined > 0) & (exclusion > 0)):
            return None, None
    return combined, tuple(int(v) for v in np.median(colors, axis=0)) if colors else None


def restore_classic_texture(pixels, mask, lines, protected, card_height, footer_top, base):
    """Fill legal glyphs with nearby frame texture, keeping every other pixel.

    Exemplar patches avoid the flat band left by diffusion on marbled/printed
    classic frames. Donors exclude all lettering and stay within the footer.
    """
    import cv2
    import numpy as np

    height, width = pixels.shape[:2]
    radius = max(4, min(20, round(width/100)))
    side = radius*2+1
    allowed = np.zeros((height,width), np.uint8)
    top, bottom = max(0,round(card_height*.918)-footer_top), min(height,round(card_height*.957)-footer_top)
    allowed[top:bottom,round(width*.12):round(width*.8)] = 1
    for line in lines+protected:
        cv2.fillPoly(allowed,[np.round(line['points']).astype(np.int32)],0)
    allowed[mask>0] = 0
    dl, dr = round(width*.12), round(width*.8)
    source = pixels[top:bottom,dl:dr].astype(np.float32)
    if min(source.shape[:2]) < side+4:
        return None
    sigma = max(1, radius*.35)
    detail = source-cv2.GaussianBlur(source,(0,0),sigma)
    donor_area = allowed[top:bottom,dl:dr].copy()
    # Sample the frame grain, avoiding a copied crack or decorative stroke.
    strong = (np.max(np.abs(detail),axis=2)>25).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(strong)
    for index in range(1,count):
        if stats[index,cv2.CC_STAT_AREA] >= max(3,radius//2):
            donor_area[labels==index] = 0
    donor_border = radius+math.ceil(sigma*3)
    donors = cv2.erode(donor_area,np.ones((donor_border*2+1,)*2,np.uint8),
                       borderType=cv2.BORDER_CONSTANT,borderValue=0)[radius:bottom-top-radius,radius:dr-dl-radius]
    if not np.any(donors):
        return None
    output = pixels.copy()
    texture = np.zeros_like(pixels,dtype=np.float32)
    holes = (mask>0).astype(np.uint8)
    source_y, source_x = np.mgrid[top+radius:bottom-radius,dl+radius:dr-radius]
    # Each iteration fills at least the selected pixel; a bounded fallback
    # avoids pathological work on an unexpected OCR/mask shape.
    for _ in range(600):
        if not np.any(holes):
            # Keep the locally restored color/gradient, adding only sampled
            # frame detail. This avoids patch seams and shifts in hue.
            feather = np.minimum(1,cv2.distanceTransform(mask,cv2.DIST_L2,3)/max(1,width/600))
            return np.clip(np.round(base.astype(np.float32)+texture*feather[:,:,None]),0,255).astype(np.uint8)
        known = cv2.boxFilter(1-holes,cv2.CV_32F,(side,side),normalize=False)
        priority = np.where(holes>0,known,-1)
        priority[:radius] = priority[-radius:] = -1
        priority[:,:radius] = priority[:,-radius:] = -1
        y,x = np.unravel_index(priority.argmax(),priority.shape)
        if priority[y,x] < 0:
            return None
        patch = output[y-radius:y+radius+1,x-radius:x+radius+1].astype(np.float32)
        missing = holes[y-radius:y+radius+1,x-radius:x+radius+1]>0
        context = (~missing).astype(np.uint8)
        score = cv2.matchTemplate(source,patch,cv2.TM_SQDIFF,mask=context)/max(1,int(context.sum())*3)
        # Prefer nearby texture when boundary matches have comparable error.
        score += ((source_x-x)**2+(source_y-y)**2)*(.5/width)**2
        score[donors==0] = np.inf
        dy,dx = np.unravel_index(np.nanargmin(score),score.shape)
        donor = source[dy:dy+side,dx:dx+side].copy()
        correction = np.mean(patch[~missing]-donor[~missing],axis=0)
        donor = np.clip(np.round(donor+correction),0,255).astype(np.uint8)
        target = output[y-radius:y+radius+1,x-radius:x+radius+1]
        target[missing] = donor[missing]
        texture[y-radius:y+radius+1,x-radius:x+radius+1][missing] = detail[dy:dy+side,dx:dx+side][missing]
        holes[y-radius:y+radius+1,x-radius:x+radius+1][missing] = 0
    return None


def proxy_overlay(size, lines, protected, text, color, font_path, credit_guard=None):
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    width, height = size
    left = math.floor(min(p[0] for line in lines for p in line['points']))
    right = math.ceil(max(p[0] for line in lines for p in line['points']))
    top = math.floor(min(p[1] for line in lines for p in line['points']))
    bottom = math.ceil(max(p[1] for line in lines for p in line['points']))
    centered = all(line.get('layout') == 'classic' for line in lines)
    if centered:
        classic_font = Path(font_path).with_name('PlantinMTProRg.TTF')
        if classic_font.is_file():
            font_path = str(classic_font)
    rows = text.split('\n')
    line_height = sorted(max(p[1] for p in line['points'])-min(p[1] for p in line['points']) for line in lines)[len(lines)//2]
    if centered:
        line_height = sum((line['points'][3][1]-line['points'][0][1]+line['points'][2][1]-line['points'][1][1])/2 for line in lines)/len(lines)
    # Never grow into the space above the original notice, even with two lines.
    for font_size in range(max(6, round(line_height*(1.05 if centered else 1.45))), max(5, round(height*.006)), -1):
        font = ImageFont.truetype(font_path, font_size*3)
        boxes = [font.getbbox(row) for row in rows]
        gap = max(2, round(font_size*.25))*3
        ink_height = sum(box[3]-box[1] for box in boxes)+gap*(len(rows)-1)
        if max(box[2]-box[0] for box in boxes) > (right-left)*3 or ink_height > (bottom-top)*3:
            continue
        # Match the original footer alignment: centered on classic frames.
        overlay = Image.new('RGBA', ((right-left+4)*3, (bottom-top+4)*3))
        draw = ImageDraw.Draw(overlay)
        y = (bottom-top+2)*3-ink_height
        for row, box in zip(rows, boxes):
            x = ((right-left+4)*3-(box[2]-box[0]))/2 if centered else (right-left+2)*3-(box[2]-box[0])
            draw.text((x-box[0], y-box[1]), row, font=font, fill=(*color, 255))
            y += box[3]-box[1]+gap
        overlay = overlay.resize((right-left+4, bottom-top+4), Image.Resampling.LANCZOS)
        full = Image.new('RGBA', size)
        full.paste(overlay, (left-2, top-2))
        # Guard against an upper right stat box inside a multi-line notice's bounds.
        guard = np.zeros((height, width), np.uint8)
        for line in protected:
            if credit_guard is not None and line.get('layout') == 'classic' and ILLUSTRATOR.search(line['text']):
                continue
            cv2.fillPoly(guard, [np.round(line['points']).astype(np.int32)], 255)
        guard = cv2.dilate(guard, np.ones((5, 5), np.uint8))
        if credit_guard is not None:
            guard = np.maximum(guard,credit_guard)
        if np.any((guard > 0) & (np.asarray(full.getchannel('A')) > 0)):
            continue
        return full
    return None


def process(image, replacement, custom_text, font_path, detector=detect_lines, reference=None):
    import cv2
    import numpy as np
    from PIL import Image
    from text_repair import smooth_letter_fill

    info = dict(replacement=replacement, detected=False, applied=False, reason='not_detected', regions=[])
    if replacement == 'none':
        info['reason'] = 'kept'
        return image, info
    # Sideways, untrimmed, and unusual aspect-ratio images need manual finishing.
    if not .69 <= image.width/image.height <= .74:
        info['reason'] = 'unsupported_layout'
        return image, info
    lines, protected = detector(image)
    lines, protected = confirm_from_reference(image, lines, protected, reference)
    if not lines:
        return image, info
    info['detected'] = True
    info['source_confirmed_lines'] = sum(bool(line.get('source_confirmed')) for line in lines)
    info['regions'] = [[[round(x/image.width, 5), round(y/image.height, 5)] for x, y in line['points']] for line in lines]
    # Work only in the footer to bound memory and avoid full-resolution inpainting.
    classic = all(line.get('layout') == 'classic' for line in lines)
    footer_top = round(image.height*(.885 if classic else .91))
    pixels = np.asarray(image.convert('RGB'))[footer_top:].copy()
    def local(records):
        return [{**line, 'points': [[x, y-footer_top] for x, y in line['points']]} for line in records]
    mask, color = lettering_mask(pixels, local(lines), local(protected))
    if mask is None or not np.any(mask):
        info['reason'] = 'uncertain_background'
        return image, info
    overlay = None
    if replacement == 'custom':
        guard = np.zeros((image.height,image.width),np.uint8)
        guard[footer_top:] = credit_protection(pixels,local(protected))
        overlay = proxy_overlay(image.size, lines, protected, custom_text, color, font_path, credit_guard=guard)
        if overlay is None:
            info['reason'] = 'text_does_not_fit'
            return image, info
    radius = max(2, min(9, round(image.width/300)))
    filled = cv2.inpaint(pixels, mask, radius, cv2.INPAINT_NS)
    filled = smooth_letter_fill(pixels, mask, filled)
    if classic:
        textured = restore_classic_texture(pixels, mask, local(lines), local(protected), image.height, footer_top, filled)
        if textured is not None:
            filled = textured
    # Exact unmasked pixels are retained; this also protects nearby frame edges.
    pixels[mask > 0] = filled[mask > 0]
    result = image.convert('RGBA')
    patch = Image.fromarray(pixels).convert('RGBA')
    patch.putalpha(result.getchannel('A').crop((0, footer_top, image.width, image.height)))
    result.paste(patch, (0, footer_top))
    if overlay is not None:
        result = Image.alpha_composite(result, overlay)
    info.update(applied=True, reason='replaced' if overlay is not None else 'removed',
                text_color='#' + ''.join(f'{value:02x}' for value in color), line_count=len(lines))
    return result, info


def run(payload):
    from PIL import Image
    with Image.open(payload['path']) as source:
        if source.width*source.height > 50_000_000:
            raise ValueError('The upscaled card is too large for legal text replacement.')
        image = source.convert('RGBA')
    reference = None
    if payload.get('source_path'):
        with Image.open(payload['source_path']) as source:
            if source.width*source.height > 50_000_000:
                raise ValueError('The source card is too large for legal text detection.')
            reference = source.convert('RGB')
    result, info = process(image, payload['replacement'], payload['custom_text'], payload['font_path'], reference=reference)
    if info['applied']:
        result.save(payload['path'], format='PNG')
    return dict(ok=True, **info)


if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        with redirect_stdout(sys.stderr):
            result = run(payload)
        print(json.dumps(result, allow_nan=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
