"""Local, image-contoured frame selection using Segment Anything (SAM).

Layout hints locate candidate components; they are never rasterized as masks.
Model contours are refined against image pixels in a narrow boundary band.
Uncertain candidates are omitted, not replaced by geometric templates.
Copyrights/licenses: see NOTICE.txt.
"""
import base64
from io import BytesIO

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

from plugin import model_file, read_image

MODELS = (
    ("sam_vit_b_01ec64.encoder.quant.onnx", "181301ce3500a86c38450b56e2b71dab8008a13b1812a0d6cc812f22651e143a"),
    ("sam_vit_b_01ec64.decoder.quant.onnx", "b11465135b7c93a1fd65141a4e2a96f1ddf2e3dab09b5eeab640bdf5f10aadbe"),
)
LAYOUTS = ("auto", "m15", "retro", "extended", "borderless")


def solid(mask):
    """Fill enclosed lettering, retaining cuts connected to the outside."""
    binary = (mask > 0).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    result = np.zeros_like(binary)
    minimum = max(8, binary.size * .00025)
    for contour in contours:
        if cv2.contourArea(contour) >= minimum:
            cv2.drawContours(result, [contour], -1, 1, cv2.FILLED)
    return result


def extent(mask):
    ys, xs = np.where(mask)
    return None if not len(xs) else (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def panel_component(mask):
    """A panel is one connected shape, not every similarly colored SAM blob."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    if count <= 1:
        return np.zeros_like(mask)
    selected = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == selected).astype(np.uint8)


def refine_boundary(image, mask):
    """Recover thin rims that fall between SAM's lower-resolution mask pixels."""
    bounds = extent(mask)
    if bounds is None:
        return mask
    w, h = image.size
    radius = max(2, round(min(w, h) * .006))
    l, t, r, b = bounds
    pad = radius * 3
    l, t, r, b = max(0, l-pad), max(0, t-pad), min(w, r+pad), min(h, b+pad)
    source = np.asarray(image.crop((l, t, r, b)).convert("RGB"))
    region = mask[t:b, l:r]
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius*2+1, radius*2+1))
    core = cv2.erode(region, kernel, borderType=cv2.BORDER_CONSTANT, borderValue=0)
    support = cv2.dilate(region, kernel)
    # GrabCut needs foreground/background samples. Keep an ambiguous or tiny
    # component unchanged rather than manufacturing a boundary for it.
    if core.sum() < 10 or np.count_nonzero(support == 0) < 10 or source.reshape(-1, 3).std(axis=0).max() < 1:
        return mask
    labels = np.full(region.shape, cv2.GC_BGD, np.uint8)
    labels[support > 0] = cv2.GC_PR_BGD
    labels[region > 0] = cv2.GC_PR_FGD
    labels[core > 0] = cv2.GC_FGD
    cv2.setRNGSeed(0)
    cv2.grabCut(source, labels, None, np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_MASK)
    refined = ((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)).astype(np.uint8)
    # Only retain components attached to the confirmed panel interior; nearby
    # artwork with a matching color must not become an isolated piece of frame.
    _, components = cv2.connectedComponents(refined, connectivity=8)
    anchored = np.unique(components[core > 0])
    refined = solid(np.isin(components, anchored[anchored != 0])) & support
    if np.count_nonzero(refined != region) > region.sum() * .12:
        return mask
    result = mask.copy()
    result[t:b, l:r] = refined
    return result


def outer_border(image):
    """Separate a connected black/white stock border using actual pixels."""
    pixels = np.asarray(image, dtype=np.int16)
    edge = np.concatenate((pixels[0],pixels[-1],pixels[:,0],pixels[:,-1]))
    color = np.median(edge,axis=0)
    if not (color.max() < 35 or color.min() > 225):
        return np.zeros(pixels.shape[:2],np.uint8)
    matching = (np.max(np.abs(pixels-color),axis=2) < 24).astype(np.uint8)
    _, labels = cv2.connectedComponents(matching,connectivity=4)
    touching = np.unique(np.concatenate((labels[0],labels[-1],labels[:,0],labels[:,-1])))
    return np.isin(labels,touching[touching!=0]).astype(np.uint8)


def refine_panel_bottom(image, mask):
    """Follow the visible lower rim, rejecting footer spill joined to a panel."""
    bounds = extent(mask)
    if bounds is None:
        return mask
    h, w = mask.shape
    l, t, r, _ = bounds
    inset = max(2, round(w * .015))
    xs = np.arange(l + inset, r - inset)
    if len(xs) < 10:
        return mask
    bottom = h - 1 - np.argmax(mask[::-1], axis=0)
    # A robust estimate locates the search band only. The final contour comes
    # from image edges, including curved stamp notches and stepped badges.
    window = max(5, round(w * .17) | 1)
    padded = np.pad(bottom[xs], (window//2, window//2), mode="edge")
    baseline = np.median(np.lib.stride_tricks.sliding_window_view(padded, window), axis=1)
    lab = cv2.cvtColor(np.asarray(image.convert("RGB"), dtype=np.float32)/255, cv2.COLOR_RGB2Lab)
    colored_trim = (np.linalg.norm(lab[:, :, 1:], axis=2) > 12) & (lab[:, :, 0] > 25)
    lab = cv2.GaussianBlur(lab, (3, 3), .6)
    gradient = np.pad(np.linalg.norm(lab[2:] - lab[:-2], axis=2)/2, ((1, 1), (0, 0)))
    ys = np.arange(max(t, int(baseline.min()-w*.05)), min(h-2, int(baseline.max()+w*.025))+1)
    if not len(ys):
        return mask
    costs = -np.minimum(gradient[ys[:, None], xs], 30) + np.abs(ys[:, None]-baseline)*.35
    previous = costs[:, 0].copy()
    back = np.zeros(costs.shape, np.int32)
    states = np.arange(len(ys))
    for column in range(1, len(xs)):
        choices = []
        for step in range(-3, 4):
            shifted = np.roll(previous, step) + abs(step)*3
            if step > 0:
                shifted[:step] = np.inf
            elif step < 0:
                shifted[step:] = np.inf
            choices.append(shifted)
        choices = np.asarray(choices)
        best = choices.argmin(axis=0)
        back[:, column] = states - (best-3)
        previous = costs[:, column] + choices[best, states]
    path = np.empty(len(xs), np.int32)
    state = int(previous.argmin())
    for column in range(len(xs)-1, -1, -1):
        path[column] = ys[state]
        state = back[state, column]
    # Low-contrast artwork is not evidence of a frame boundary.
    if np.median(gradient[path, xs]) < 5:
        return mask
    result = mask.copy()
    for x, y in zip(xs, path):
        result[y+1:, x] = 0
    removed = (mask > 0) & (result == 0)
    # Reject a shortcut through colored trim or an ornamental tab. Dark footer
    # spill can be removed without sacrificing those visible frame details.
    if not removed.any() or colored_trim[removed].mean() > .15:
        return mask
    if mask.sum()-result.sum() > mask.sum()*.05:
        return mask
    return panel_component(result)


class Contours:
    def __init__(self):
        options = ort.SessionOptions()
        options.intra_op_num_threads = options.inter_op_num_threads = 2
        self.encoder, self.decoder = [ort.InferenceSession(str(model_file(*model)), sess_options=options,
            providers=["CPUExecutionProvider"]) for model in MODELS]

    def encode(self, image):
        # This particular encoder export has a fixed 684x1024 preprocessing
        # canvas. Letterboxing is essential; arbitrary portrait input shifts
        # decoded contours even though the exported input has dynamic axes.
        scale = min(1024 / image.width, 684 / image.height)
        size = (round(image.width * scale), round(image.height * scale))
        canvas = Image.new("RGB", (1024, 684))
        canvas.paste(image.resize(size, Image.Resampling.BILINEAR), (0, 0))
        embedding = self.encoder.run(None, {"input_image": np.asarray(canvas, dtype=np.float32)})[0]
        return embedding, size, image.size

    def segment(self, encoded, box, positive=(), negative=()):
        embedding, size, original = encoded
        points = [*positive, *negative, (box[0], box[1]), (box[2], box[3])]
        coords = np.array([[[x * size[0], y * size[1]] for x, y in points]], dtype=np.float32)
        labels = np.array([[1] * len(positive) + [0] * len(negative) + [2, 3]], dtype=np.float32)
        masks, scores, _ = self.decoder.run(None, dict(image_embeddings=embedding, point_coords=coords,
            point_labels=labels, mask_input=np.zeros((1, 1, 256, 256), np.float32),
            has_mask_input=np.zeros(1, np.float32), orig_im_size=np.array([684, 1024], np.float32)))
        if not np.isfinite(masks).all() or not np.isfinite(scores).all():
            raise RuntimeError("Frame detection returned an invalid contour.")
        mask = cv2.resize(masks[0, 0, :size[1], :size[0]], original, interpolation=cv2.INTER_LINEAR)
        return solid(mask > 0), float(scores[0, 0])

    def panel(self, image, encoded, kind, box):
        coarse, score = self.segment(encoded, box)
        coarse = panel_component(coarse)
        bounds = extent(coarse)
        empty = np.zeros_like(coarse)
        if bounds is None or score < .88:
            return empty, empty
        w, h = image.size
        l, t, r, b = bounds
        span = ((r-l)/w, (b-t)/h)
        occupancy = float(coarse.sum()) / ((r-l)*(b-t))
        # Reject artwork/lettering masquerading as a panel. Validation never
        # clips the result to the hint, so curved/legendary edges are retained.
        if kind in ("title", "type"):
            valid = span[0] > .65 and .025 < span[1] < .18 and occupancy > (.60 if kind=="title" else .70)
        elif kind == "rules":
            valid = span[0] > .60 and .16 < span[1] < .40 and occupancy > .85
        else:
            valid = .08 < span[0] < .25 and .025 < span[1] < .12 and occupancy > .65
        if not valid or t/h < box[1]-.04 or b/h > box[3]+.04:
            return empty, empty
        # Re-encode the actual detected component at higher detail to separate
        # the frame rim/crown from its inset panel and preserve art overlaps.
        pad = max(4, round(w*.025))
        cl, ct, cr, cb = max(0,l-pad), max(0,t-pad), min(w,r+pad), min(h,b+pad)
        crop = image.crop((cl,ct,cr,cb)); detail = self.encode(crop)
        cw, ch = crop.size
        outer_box = ((l-cl)/cw, (t-ct)/ch, (r-cl)/cw, (b-ct)/ch)
        outer, outer_score = self.segment(detail, outer_box)
        outer = panel_component(outer)
        support = cv2.dilate(coarse[ct:cb,cl:cr], np.ones((5,5), np.uint8))
        if outer_score >= .88 and np.sum(outer & support) >= coarse.sum()*.70:
            # A detail pass can confidently choose the inset instead of the
            # whole frame. Keep the outer rim found by the first pass.
            coarse[ct:cb,cl:cr] |= outer & support
        # The coarse support is deliberately conservative. Refine against the
        # full image afterwards so that it cannot clip off a recovered rim.
        coarse = panel_component(refine_boundary(image, coarse))
        if kind == "rules":
            coarse = refine_panel_bottom(image, coarse)
        dx = (r-l) * (.07 if kind == "title" else .025)
        top = (b-t) * (.32 if kind == "title" else .16 if kind == "type" else .04)
        bottom = (b-t) * (.15 if kind in ("title","type") else .04)
        inner_box = ((l+dx-cl)/cw,(t+top-ct)/ch,(r-dx-cl)/cw,(b-bottom-ct)/ch)
        inner, inner_score = self.segment(detail, inner_box)
        inner = panel_component(inner)
        panel = empty.copy(); panel[ct:cb,cl:cr] = inner
        panel &= coarse
        if inner_score < .88 or panel.sum() < coarse.sum()*.35:
            # No confidently distinct inset: keep the component in the
            # combined selection, but do not invent a fixed-width rim.
            panel = coarse.copy()
        if kind == "title" and np.count_nonzero(coarse & (1-panel)) < coarse.sum()*.025:
            # Large illustrated lettering can resemble a title bar to SAM.
            # Require a distinct surrounding frame before calling it one.
            return empty, empty
        return coarse, panel

    def sides(self, image, art_bounds):
        """Revisit thin frame material that a whole-image pass can miss."""
        w,h=image.size; l,t,r,b=art_bounds
        combined=np.zeros((h,w),np.uint8)
        for flip, edge in ((False,l),(True,w-r)):
            source=image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) if flip else image
            left=max(0,edge-round(w*.055)); right=min(w,edge+round(w*.12))
            top=max(0,t-round(h*.025)); bottom=min(h,round(h*.94))
            crop=source.crop((0,top,right,bottom)); cw,ch=crop.size
            center=max(left+1,edge-round(w*.022))/cw
            position=(b-top)/ch
            region,score=self.segment(self.encode(crop),(left/cw,0,edge/cw,1),
                [(center,position*.25),(center,position*.70)])
            bounds=extent(region)
            if bounds and score>.89:
                ml,mt,mr,mb=bounds
                # Refuse an artwork/background selection instead of clipping
                # it into an artificial strip.
                if mr<=edge+w*.016 and ml>=left-w*.025 and mb-mt>h*.30:
                    patch=np.zeros_like(combined);patch[top:bottom,:right]=region
                    combined|=np.fliplr(patch) if flip else patch
        return combined & (1-outer_border(image))


def encode_mask(alpha, size):
    # Subpixel smoothing is confined to model contours; no noisy gray fill.
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (3,3), .55)
    mask = Image.fromarray(np.rint(np.clip(alpha,0,1)*255).astype(np.uint8))
    mask = mask.resize(size, Image.Resampling.LANCZOS)
    output = BytesIO(); mask.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def detect_frame(payload):
    layout = payload.get("layout", "auto")
    layout = {"modern":"m15", "classic":"retro"}.get(layout,layout)
    if layout not in LAYOUTS:
        raise ValueError("Choose a valid frame layout.")
    image = read_image(payload); size = image.size
    image.thumbnail((1000,1400), Image.Resampling.LANCZOS)
    w,h = image.size
    engine = Contours(); encoded = engine.encode(image)
    all_frame = np.zeros((h,w),np.uint8); interiors = all_frame.copy()
    pieces = []
    boxes = dict(title=(.025,.015,.975,.14),type=(.03,.55,.97,.64),
                 rules=(.035,.615,.965,.94),power=(.77,.86,.96,.96))
    if layout == "retro":
        boxes = dict(rules=(.08,.57,.92,.90))
    for kind, box in boxes.items():
        outer, inner = engine.panel(image,encoded,kind,box)
        if outer.any():
            all_frame |= outer; interiors |= inner; pieces.append(kind)
    # Standard frames have a separate art window. Use its actual AI contour
    # and the AI card-body contour; never subtract a hard-coded rectangle.
    body = np.zeros_like(all_frame)
    if layout in ("auto","m15","retro"):
        art, art_score = engine.segment(encoded,(.07,.115,.93,.565) if layout!="retro" else (.10,.09,.90,.56))
        bounds = extent(art)
        if bounds:
            l,t,r,b = bounds
            rectangularity = art.sum()/((r-l)*(b-t))
            if art_score > .90 and rectangularity > .80 and .70 < (r-l)/w < .91 and .32 < (b-t)/h < .50 and .08 < t/h < .21 and .49 < b/h < .64:
                card, card_score = engine.segment(encoded,(.05,.035,.95,.955))
                # A card body must enclose the art and both lower corners.
                if rectangularity > .94 and card_score > .93 and np.mean(card[art>0]) > .98 and card.mean() > .70:
                    body = card & (1-art) & (1-outer_border(image))
                    all_frame |= body; pieces.append("surround")
                    all_frame &= (1-outer_border(image))
                else:
                    sides=engine.sides(image,bounds)
                    if sides.any():
                        all_frame |= sides;pieces.append("surround")
    material = all_frame & (1-interiors)
    return dict(ok=True, material=encode_mask(material,size), panels=encode_mask(all_frame,size),
                found=bool(all_frame.any()), parts=pieces, engine="Segment Anything", layout=layout,
                width=size[0],height=size[1])
