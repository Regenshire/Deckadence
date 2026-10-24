"""Local text-region detection. Card artwork never leaves this computer.

RapidOCR (Apache-2.0): https://github.com/RapidAI/RapidOCR/tree/v1.4.4
The dependency supplies the PaddleOCR detector and its model assets.
"""
import base64
from io import BytesIO
import math


def detect_symbols(image, regions):
    """Find closed circular game symbols near text, including unreadable pips.

    OCR recognition is deliberately not used to identify their internal glyph.
    Require a continuous contrasting rim so nearby artwork is not a symbol.
    """
    import cv2
    import numpy as np
    if not regions:return []
    gray=cv2.cvtColor(np.asarray(image),cv2.COLOR_RGB2GRAY)
    height,width=gray.shape
    polygons=[np.asarray(p,dtype=np.float32)*[width,height] for p in regions]
    circles=cv2.HoughCircles(cv2.GaussianBlur(gray,(5,5),.8),cv2.HOUGH_GRADIENT,1,
        minDist=max(5,width*.014),param1=80,param2=26,
        minRadius=max(4,round(width*.009)),maxRadius=max(5,round(width*.035)))
    candidates=list(circles[0]) if circles is not None else []
    # A symbol's internal glyph can pull the Hough center off its printed
    # circle. Closed contours supply accurate candidates for those small pips.
    for threshold in (64,96,128,160,192,224):
        contours,_=cv2.findContours((gray>threshold).astype(np.uint8),cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours:
            x,y,cw,ch=cv2.boundingRect(contour)
            if not .8<cw/ch<1.25 or not width*.018<min(cw,ch)<width*.07:continue
            if cv2.contourArea(contour)/(np.pi*cw*ch/4)<.85:continue
            candidates.append((x+(cw-1)/2,y+(ch-1)/2,(cw+ch)/4))
    angles=np.linspace(0,2*np.pi,72,endpoint=False)
    found=[]
    for x,y,radius in candidates:
        nearby=False
        for polygon in polygons:
            line_height=min(np.linalg.norm(polygon[i]-polygon[(i+1)%4]) for i in range(4))
            in_title_row=(y<height*.23 and x>width*.4 and x>polygon[:,0].max()
                          and abs(y-polygon[:,1].mean())<line_height*.65)
            if (.7*line_height<2*radius<1.65*line_height and (in_title_row or
                cv2.pointPolygonTest(polygon.astype(np.float32),(float(x),float(y)),True)>-radius*1.8)):
                nearby=True;break
        if not nearby or x-radius<1 or y-radius<1 or x+radius>=width-1 or y+radius>=height-1:continue
        radii=np.linspace(.82,1.18,13)*radius
        samples=cv2.remap(gray,(x+radii[:,None]*np.cos(angles)).astype(np.float32),
            (y+radii[:,None]*np.sin(angles)).astype(np.float32),cv2.INTER_LINEAR).astype(np.float32)
        if np.mean(samples.max(axis=0)-samples.min(axis=0)>25)<.9:continue
        if np.argmax(np.abs(np.diff(samples,axis=0)),axis=0).std()>2.8:continue
        ys,xs=np.mgrid[int(y-radius):int(y+radius)+1,int(x-radius):int(x+radius)+1]
        interior=gray[ys,xs][(xs-x)**2+(ys-y)**2<(radius*.65)**2].astype(np.float32)
        outside=cv2.remap(gray,(x+radius*1.28*np.cos(angles)).astype(np.float32),
            (y+radius*1.28*np.sin(angles)).astype(np.float32),cv2.INTER_LINEAR).astype(np.float32)
        # A printed disk differs from its surroundings through its center.
        # The hole in an ordinary O/o matches the surrounding background.
        if np.mean(np.abs(interior-np.median(outside))>25)<.65:continue
        if any(math.hypot(x-cx,y-cy)<max(radius,cr) for cx,cy,cr in found):continue
        found.append((float(x),float(y),float(radius)))
    # Include the outer printed rim as well as the enclosed number/mana glyph.
    return [[[round((x-radius-1)/width,5),round((y-radius-1)/height,5)],
             [round((x+radius+1)/width,5),round((y-radius-1)/height,5)],
             [round((x+radius+1)/width,5),round((y+radius+1)/height,5)],
             [round((x-radius-1)/width,5),round((y+radius+1)/height,5)]]
            for x,y,radius in found[:100]]


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
    engine = RapidOCR(det_limit_side_len=1600, det_limit_type="max",
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
    regions=polygons[:400]
    return {"ok": True, "regions": regions, "symbols":detect_symbols(image,regions), "engine": "RapidOCR / PP-OCRv4"}


