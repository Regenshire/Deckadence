"""Describe colors actually present beside an edit, excluding selected pixels."""
import colorsys
from PIL import Image, ImageFilter, ImageChops


def color_name(rgb):
    r,g,b=rgb
    hue,saturation,_=colorsys.rgb_to_hsv(r/255,g/255,b/255)
    hue*=360
    light=.2126*r+.7152*g+.0722*b
    if max(rgb)<46:return 'charcoal'
    if max(rgb)-min(rgb)<14 or saturation<.12:
        return 'dark gray' if light<100 else 'gray' if light<190 else 'pale gray' if light<240 else 'off-white'
    name=('red' if hue<15 or hue>=345 else 'orange' if hue<45 else 'yellow' if hue<65 else
          'yellow-green' if hue<95 else 'green' if hue<155 else 'teal' if hue<195 else
          'blue' if hue<255 else 'violet' if hue<285 else 'pink')
    if name=='orange' and light<150:name='brown'
    if light<95:return 'dark '+name
    if light>185 and saturation<.55:return 'pale '+name
    if saturation<.45:return 'muted '+name
    return name


def measure_palette(reference, mask):
    """A small, deterministic palette for language encoders, not an image filter.

    Sample an inward band of known artwork beside the selection. Do not infer
    colors from padding, the removed object, or transparent reference pixels.
    Keep the measured RGB values and coverage for generation diagnostics.
    """
    image=reference.convert('RGBA')
    image.thumbnail((256,256),Image.Resampling.LANCZOS)
    selected=mask.resize(image.size,Image.Resampling.NEAREST).point(lambda value:255 if value else 0)
    opaque=image.getchannel('A').point(lambda value:255 if value>=128 else 0)
    # Lanczos resizing can mix padding/object colors into nearby known pixels.
    # Exclude its three-pixel support on both selection and transparency edges.
    known=ImageChops.subtract(opaque.filter(ImageFilter.MinFilter(7)),selected.filter(ImageFilter.MaxFilter(7)))
    band=ImageChops.darker(ImageChops.subtract(selected.filter(ImageFilter.MaxFilter(41)),selected),known)
    if sum(1 for value in band.getdata() if value)<100:
        band=known
    pixels=[rgb for rgb,value in zip(image.convert('RGB').getdata(),band.getdata()) if value]
    if len(pixels)<32:return None
    strip=Image.new('RGB',(len(pixels),1));strip.putdata(pixels)
    quantized=strip.quantize(colors=16,method=Image.Quantize.MEDIANCUT)
    colors=quantized.getpalette();groups={}
    for count,index in quantized.getcolors():
        rgb=tuple(colors[index*3:index*3+3])
        groups.setdefault(color_name(rgb),[]).append((count,rgb))
    samples=[]
    for name,items in sorted(groups.items(),key=lambda item:sum(count for count,_ in item[1]),reverse=True):
        count=sum(count for count,_ in items)
        if count/len(pixels)<.025:continue
        rgb=[round(sum(count*rgb[channel] for count,rgb in items)/count) for channel in range(3)]
        samples.append(dict(name=name,rgb=rgb,fraction=round(count/len(pixels),3)))
        if len(samples)==4:break
    return dict(method='boundary_palette_v1',description=', '.join(item['name'] for item in samples),samples=samples,pixels=len(pixels))
