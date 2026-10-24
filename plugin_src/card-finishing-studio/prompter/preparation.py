from PIL import Image, ImageChops, ImageFilter, ImageStat
from .contracts import PlannerError
import math

def generation_blend_mask(alpha):
    """Feather inward only, retaining user opacity and all unselected pixels."""
    box = alpha.getbbox()
    if not box:
        return alpha.copy()
    radius = max(2, min(16, round(min(box[2]-box[0], box[3]-box[1]) * .04)))
    core = alpha.point(lambda value: 255 if value else 0)
    # Accumulate distance from the selection edge without blurring across it.
    ramp = core.point(lambda value: round(value / (radius + 1)))
    for _ in range(radius):
        core = core.filter(ImageFilter.MinFilter(3))
        ramp = ImageChops.add(ramp, core.point(lambda value: round(value / (radius + 1))))
    ramp = ImageChops.lighter(ramp, core)
    return ImageChops.darker(alpha, ramp)

def removal_reference(source, alpha):
    """Remove selected visual information before asking AI to rebuild it."""
    selected = alpha.point(lambda value:255 if value else 0)
    context = ImageChops.invert(selected)
    if not context.getbbox():
        raise PlannerError('Leave some surrounding artwork outside the selection for object removal.')
    color = tuple(round(v) for v in ImageStat.Stat(source.convert('RGB'),context).mean)
    return Image.composite(Image.new('RGBA',source.size,(*color,255)),source,selected)

def clean_outpaint_bounds(source, bounds, excluded):
    """Find the largest rectangular art sample containing no detected frame or text."""
    from PIL import ImageDraw
    w=378;h=round(w*source.height/source.width)
    blocked=excluded.resize((w,h),Image.Resampling.BOX).point(lambda v:255 if v else 0).filter(ImageFilter.MaxFilter(5))
    allowed=Image.new('L',(w,h));box=(math.ceil(bounds[0]*w),math.ceil(bounds[1]*h),math.floor(bounds[2]*w),math.floor(bounds[3]*h))
    ImageDraw.Draw(allowed).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=255)
    allowed=ImageChops.subtract(allowed,blocked)
    best=_largest_rectangle(allowed)
    if best[0]<w*h*.02:
        raise PlannerError('Too little clean artwork remains after frame and text detection. Adjust the art box and retry.')
    # Contour masks can miss a thin art-window rim. Keep the sample safely inside it.
    l,t,r,b=best[1];inset=max(2,round(min(r-l,b-t)*.015))
    if r-l<=2*inset or b-t<=2*inset:raise PlannerError('The clean artwork sample is too narrow.')
    normalized=[v/(w if i%2==0 else h) for i,v in enumerate((l+inset,t+inset,r-inset,b-inset))]
    return trim_uniform_art_rim(source,normalized)


def _largest_rectangle(allowed):
    w,h=allowed.size
    rows=list(allowed.getdata());heights=[0]*w;best=(0,None)
    for y in range(h):
        for x in range(w):heights[x]=heights[x]+1 if rows[y*w+x] else 0
        stack=[]
        for x in range(w+1):
            height=heights[x] if x<w else 0;start=x
            while stack and stack[-1][1]>height:
                left,old=stack.pop();area=(x-left)*old
                if area>best[0]:best=(area,(left,y-old+1,x,y+1))
                start=left
            if not stack or stack[-1][1]<height:stack.append((start,height))
    return best


def unselected_outpaint_bounds(source, bounds, selection):
    """Find a clean rectangular sample for artwork analysis.

    Generation retains all clean unselected pixels, including those outside
    this analysis rectangle. Application uses the original selection.
    """
    from PIL import ImageDraw
    box=tuple(round(v*source.size[i%2]) for i,v in enumerate(bounds))
    if not selection.crop(box).getbbox():
        return list(bounds)
    w=378;h=round(w*source.height/source.width)
    selected=selection.point(lambda v:255 if v else 0).resize((w,h),Image.Resampling.BOX).point(lambda v:255 if v else 0)
    allowed=Image.new('L',(w,h))
    area=(math.ceil(bounds[0]*w),math.ceil(bounds[1]*h),math.floor(bounds[2]*w),math.floor(bounds[3]*h))
    ImageDraw.Draw(allowed).rectangle((area[0],area[1],area[2]-1,area[3]-1),fill=255)
    best=_largest_rectangle(ImageChops.subtract(allowed,selected))
    if best[0]<w*h*.02:
        raise PlannerError('Leave some central artwork unselected so Extend artwork has a clean reference.')
    l,t,r,b=best[1]
    pixels=(math.ceil(l*source.width/w),math.ceil(t*source.height/h),math.floor(r*source.width/w),math.floor(b*source.height/h))
    if selection.crop(pixels).getbbox():
        raise PlannerError('The selection leaves no clean rectangular artwork reference. Adjust the selection and retry.')
    return [v/source.size[i%2] for i,v in enumerate(pixels)]


def trim_uniform_art_rim(source, bounds):
    """Exclude a thin, flat art-window rim missed by the contour detector.

    Require a nearly constant edge strip followed by distinct textured artwork.
    Do not trim a flat background that continues beyond the narrow search band.
    This changes the generation reference only, never the source artwork.
    """
    box=[round(v*source.size[i%2]) for i,v in enumerate(bounds)]
    sample=source.crop(box).convert('RGB')
    def width(image):
        limit=min(64,round(image.width*.03))
        if limit<3 or image.height<40:return 0
        top=round(image.height*.1);bottom=round(image.height*.9)
        first=ImageStat.Stat(image.crop((0,top,1,bottom)))
        if max(first.stddev)>1.2:return 0
        count=0
        for x in range(limit):
            column=ImageStat.Stat(image.crop((x,top,x+1,bottom)))
            if max(column.stddev)>1.2 or max(abs(a-b) for a,b in zip(column.mean,first.mean))>3:break
            count+=1
        if count<2 or count>=limit:return 0
        following=ImageStat.Stat(image.crop((count+1,top,min(image.width,count+5),bottom)))
        if max(following.stddev)<max(2.,max(first.stddev)*3):return 0
        if max(abs(a-b) for a,b in zip(following.mean,first.mean))<2:return 0
        return min(limit,count+2)
    trims=[width(sample),width(sample.transpose(Image.Transpose.TRANSPOSE)),
           width(sample.transpose(Image.Transpose.FLIP_LEFT_RIGHT)),
           width(sample.transpose(Image.Transpose.FLIP_TOP_BOTTOM).transpose(Image.Transpose.TRANSPOSE))]
    box=[box[0]+trims[0],box[1]+trims[1],box[2]-trims[2],box[3]-trims[3]]
    return [v/source.size[i%2] for i,v in enumerate(box)]

def outpaint_inputs(source, alpha, bounds):
    """Retain every clean unselected pixel and mask the rest for generation."""
    from PIL import ImageDraw
    box=tuple(round(value*source.size[index%2]) for index,value in enumerate(bounds))
    editable=alpha.copy()
    ImageDraw.Draw(editable).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=0)
    if not editable.getbbox():
        raise PlannerError('Select an area outside the art box to extend into.')
    missing=Image.new('L',source.size,255)
    ImageDraw.Draw(missing).rectangle((box[0],box[1],box[2]-1,box[3]-1),fill=0)
    missing=ImageChops.lighter(missing,alpha.point(lambda value:255 if value else 0))
    reference=Image.composite(Image.new('RGBA',source.size,(127,127,127,255)),source,missing)
    return reference,missing


def extension_directions(selection, art_box):
    """Count selected pixels beside each art edge without double-counting corners."""
    l,t,r,b=art_box;w,h=selection.size
    bands=[('left',(0,t,l,b)),('right',(r,t,w,b)),('top',(l,0,r,t)),('bottom',(l,b,r,h))]
    directions=[side for side,region in bands if region[2]>region[0] and region[3]>region[1] and selection.crop(region).getbbox()]
    if directions:
        return directions
    # A selection confined to a corner really does extend in two directions.
    corners=[(('left','top'),(0,0,l,t)),(('right','top'),(r,0,w,t)),
             (('left','bottom'),(0,b,l,h)),(('right','bottom'),(r,b,w,h))]
    found=set()
    for sides,region in corners:
        if region[2]>region[0] and region[3]>region[1] and selection.crop(region).getbbox():found.update(sides)
    return [side for side in ('left','right','top','bottom') if side in found]
