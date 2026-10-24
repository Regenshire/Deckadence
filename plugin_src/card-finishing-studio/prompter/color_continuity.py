"""Match an outpaint to retained artwork without recoloring protected pixels.

The model may re-expose its entire reference. We estimate only the smooth,
paired RGB change within that reference and carry it across the boundary.
No source texture or objects are copied into the generated area.
"""
import numpy as np
from PIL import Image, ImageFilter


def _smooth(values, radius):
    """Three separable box passes approximate a Gaussian without extra packages."""
    result = values.astype(np.float64)
    for _ in range(3):
        for axis in (0, 1):
            padding = [(0, 0)] * result.ndim
            padding[axis] = (radius, radius)
            padded = np.pad(result, padding, mode='edge')
            summed = np.cumsum(padded, axis=axis)
            shape = list(summed.shape); shape[axis] = 1
            summed = np.concatenate((np.zeros(shape), summed), axis=axis)
            before = [slice(None)] * result.ndim
            after = list(before)
            before[axis] = slice(0, -2 * radius - 1)
            after[axis] = slice(2 * radius + 1, None)
            result = (summed[tuple(after)] - summed[tuple(before)]) / (2 * radius + 1)
    return result


def match_outpaint(reference, generated, mask):
    """Return corrected RGB and diagnostic evidence, or the unchanged result.

    Calibrate from a clean rectangle inside the retained reference. This also
    supports selections that cut into the reference without discarding other
    context. Missing evidence or large structural changes skip correction.
    Call only for outpainting in Match artwork mode, before restoring the exact
    source. Custom styling and replacement/removal must retain their intent.
    """
    info = dict(version=2, applied=False, method='paired_reference_low_frequency')
    if reference.size != generated.size or mask.size != generated.size:
        return generated, dict(info, reason='Input and output dimensions differ.')
    source = np.asarray(reference.convert('RGB'), dtype=np.float32)
    raw = np.asarray(generated.convert('RGB'), dtype=np.float32)
    protected = np.asarray(mask.convert('L')) == 0
    if protected.all():
        return generated, dict(info, reason='No generated area to calibrate.')
    # Keep interpolation, green padding, and the known/unknown boundary out of
    # calibration. Erode with explicit zero padding, including the image edges.
    padded = Image.new('L', (mask.width+6, mask.height+6))
    padded.paste(Image.fromarray(protected.astype('uint8')*255), (3, 3))
    valid = np.asarray(padded.filter(ImageFilter.MinFilter(7)).crop((3,3,mask.width+3,mask.height+3))) > 0
    ys, xs = np.nonzero(valid)
    if len(xs) < 4096:
        return generated, dict(info, reason='Too little retained reference.')
    left, top, right, bottom = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
    # Resampling can create isolated one-pixel zero-mask rings. Erosion above
    # removes these before validating the retained sample's rectangular shape.
    if not valid[top:bottom, left:right].all():
        from .preparation import _largest_rectangle
        area, box = _largest_rectangle(Image.fromarray(valid.astype('uint8')*255))
        if area < 4096:
            return generated, dict(info, reason='Too little contiguous retained reference.')
        left, top, right, bottom = box
        valid = np.zeros_like(valid)
        valid[top:bottom,left:right] = True
    if min(right-left, bottom-top) < 32:
        return generated, dict(info, reason='Retained reference is too narrow.')
    info['reference_sample_box'] = [left, top, right, bottom]
    a, b = source[valid], raw[valid]
    luma = np.array([.2126, .7152, .0722], dtype=np.float32)
    al, bl = a @ luma, b @ luma
    flat = float(al.std()) < 4 and float(bl.std()) < 8
    correlation = float(np.corrcoef(al, bl)[0,1]) if min(al.std(), bl.std()) > .1 else 0.
    info.update(reference_pixels=int(valid.sum()), reference_luma_correlation=round(correlation,4),
                raw_reference_mae=np.abs(b-a).mean(axis=0).astype(float).round(3).tolist())
    if not flat and correlation < .90:
        return generated, dict(info, reason='Reference structure changed too much for reliable calibration.')
    radius = max(3, min(16, round(min(reference.size)*.012), (min(right-left,bottom-top)-9)//2))
    weight = valid.astype(np.float32)
    support = _smooth(weight, radius)
    residual = raw-source
    field = _smooth(residual*weight[:,:,None], radius) / np.maximum(support[:,:,None], .0001)
    # Extrapolate a smooth color offset, not the reference image. Clamping to an
    # interior band makes this deterministic for any of the four extended edges.
    yy, xx = np.indices(protected.shape)
    xx = np.clip(xx, left+radius, right-1-radius)
    yy = np.clip(yy, top+radius, bottom-1-radius)
    field = np.clip(field[yy,xx], -96, 96)
    corrected = np.clip(raw-field, 0, 255).round().astype('uint8')
    # This helper itself must never alter reference pixels; the worker restores
    # full-resolution originals afterward, independently of calibration.
    corrected[protected] = raw.astype('uint8')[protected]
    selected = ~protected
    info.update(applied=True, radius=radius, max_channel_adjustment=96,
                mean_generated_adjustment=(-field[selected]).mean(axis=0).round(3).tolist())
    return Image.fromarray(corrected), info
