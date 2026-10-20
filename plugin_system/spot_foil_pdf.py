"""Registered ink separations from saved foil-reveal masks (not screen effects)."""
import base64
from collections import deque
from contextlib import closing
from io import BytesIO
import json
import math

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ArrayObject, BooleanObject, DecodedStreamObject,
                           DictionaryObject, FloatObject, NameObject, NumberObject,
                           TextStringObject)

from .card_spot_foil import ensure_schema, read_record
from .foil_workflows import PRESETS, validate_options, normalize_display_color

MM = 72 / 25.4


def _numbers(values):
    return ArrayObject([FloatObject(v) for v in values])


def _spot_space(name, display_color='#FF00FF'):
    color = normalize_display_color(display_color)
    # Preserve the established CMYK magenta default. Custom hex colors carry
    # exact RGB alternate values so Illustrator can show the entered swatch.
    space, paper, ink = '/DeviceCMYK', [0, 0, 0, 0], [0, 1, 0, 0]
    if color != '#FF00FF':
        space, paper = '/DeviceRGB', [1, 1, 1]
        ink = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return ArrayObject([NameObject('/Separation'), NameObject('/'+name), NameObject(space),
        DictionaryObject({NameObject('/FunctionType'): NumberObject(2), NameObject('/Domain'): _numbers([0, 1]),
            NameObject('/C0'): _numbers(paper), NameObject('/C1'): _numbers(ink),
            NameObject('/N'): NumberObject(1)})])


def _coverage_group(writer, image_ref):
    """A grayscale opacity mask for an actual spot-filled path.

    Keep the named ink on vector paint, where Illustrator exposes a Fill
    swatch, instead of burying it in a Separation raster's color space.
    Luminosity is the saved ink percentage; no RGB/magenta conversion occurs.
    """
    group = DecodedStreamObject()
    group.set_data(b'q 1 0 0 1 0 0 cm /Coverage Do Q')
    group.update({NameObject('/Type'): NameObject('/XObject'), NameObject('/Subtype'): NameObject('/Form'),
        NameObject('/BBox'): _numbers([0, 0, 1, 1]),
        NameObject('/Group'): DictionaryObject({NameObject('/S'): NameObject('/Transparency'),
            NameObject('/CS'): NameObject('/DeviceGray'), NameObject('/I'): BooleanObject(True)}),
        NameObject('/Resources'): DictionaryObject({NameObject('/XObject'):
            DictionaryObject({NameObject('/Coverage'): image_ref})})})
    return writer._add_object(group.flate_encode())


def _morph(image, radius, grow):
    """Separable square dilation/erosion, linear in pixels even for large chokes."""
    if not radius:
        return image
    for _ in range(2):
        width, height = image.size
        source = image.tobytes()
        result = bytearray(width * height)
        for y in range(height):
            row = bytes(radius) + source[y*width:(y+1)*width] + bytes(radius)
            queue = deque()
            for i, value in enumerate(row):
                while queue and queue[0] < i - 2*radius:
                    queue.popleft()
                while queue and (row[queue[-1]] <= value if grow else row[queue[-1]] >= value):
                    queue.pop()
                queue.append(i)
                if i >= 2*radius:
                    result[y*width+i-2*radius] = row[queue[0]]
        image = Image.frombytes('L', (width, height), bytes(result)).transpose(Image.Transpose.TRANSPOSE)
    return image


def ink_mask(record, card_width_mm, card_height_mm, tone='grayscale'):
    options = record['options']
    with Image.open(BytesIO(record['png'])) as image:
        mask = image.convert('RGBA').getchannel('A')
    # The editor always stores foil visibility. White ink must cover its inverse.
    if options['layer_type'] == 'white_underbase':
        mask = ImageOps.invert(mask)
    binary = tone == 'binary' or PRESETS[record['workflow_id']]['mask_tones'] == ['binary']
    if binary:
        mask = mask.point(lambda value: 255 if value >= 128 else 0)
    edge = options['edge_adjustment_mm']
    if edge:
        mask = _morph(mask, round(abs(edge)*mask.width/card_width_mm), edge > 0)
    margin = options['safe_margin_mm']
    if margin:
        x, y = math.ceil(margin*mask.width/card_width_mm), math.ceil(margin*mask.height/card_height_mm)
        inset = Image.new('L', mask.size)
        if x*2 < mask.width and y*2 < mask.height:
            inset.paste(mask.crop((x, y, mask.width-x, mask.height-y)), (x, y))
        mask = inset
    maximum = options['coverage_percent'] / 100
    if maximum != 1:
        mask = mask.point(lambda value: round(value*maximum))
    ppi = options['resolution_ppi']
    size = (max(1, round(card_width_mm/25.4*ppi)), max(1, round(card_height_mm/25.4*ppi)))
    return mask.resize(size, Image.Resampling.NEAREST if binary else Image.Resampling.BILINEAR)


def _extend(mask, width, height):
    # Match the artwork's centered finished-card rectangle and duplicated bleed.
    left, top = max(0, (width-mask.width)//2), max(0, (height-mask.height)//2)
    result = Image.new('L', (width, height))
    result.paste(mask, (left, top))
    if left:
        result.paste(mask.crop((0, 0, 1, mask.height)).resize((left, mask.height)), (0, top))
    right = width-mask.width-left
    if right > 0:
        result.paste(mask.crop((mask.width-1, 0, mask.width, mask.height)).resize((right, mask.height)), (left+mask.width, top))
    if top:
        result.paste(result.crop((0, top, width, top+1)).resize((width, top)), (0, 0))
    bottom = height-mask.height-top
    if bottom > 0:
        result.paste(result.crop((0, top+mask.height-1, width, top+mask.height)).resize((width, bottom)), (0, top+mask.height))
    return result


def _clip_path(slot, radius):
    w, h = slot.get('finished_card_width_mm', slot['width_mm']), slot.get('finished_card_height_mm', slot['height_mm'])
    if int(slot.get('rotation_degrees', 0)) % 180:
        w, h = h, w
    w, h = min(w, slot['width_mm']), min(h, slot['height_mm'])
    x, y = slot['x_mm']+(slot['width_mm']-w)/2, slot['y_mm']+(slot['height_mm']-h)/2
    x, y, w, h, r = [v*MM for v in (x, y, w, h, min(radius, w/2, h/2))]
    k = .5522847498307936*r
    return (f'{x+r} {y} m {x+w-r} {y} l {x+w-r+k} {y} {x+w} {y+r-k} {x+w} {y+r} c '
            f'{x+w} {y+h-r} l {x+w} {y+h-r+k} {x+w-r+k} {y+h} {x+w-r} {y+h} c '
            f'{x+r} {y+h} l {x+r-k} {y+h} {x} {y+h-r+k} {x} {y+h-r} c '
            f'{x} {y+r} l {x} {y+r-k} {x+r-k} {y} {x+r} {y} c h W n\n')


class SpotFoilPdfJob:
    def __init__(self, get_connection, output='spot_pdf', tone='grayscale', display_colors=None):
        if output not in ('spot_pdf', 'mask_pdf') or tone not in ('grayscale', 'binary'):
            raise ValueError('Choose a valid spot-foiling PDF format and ink coverage mode.')
        self.get_connection, self.output, self.tone = get_connection, output, tone
        self.mask_only = output == 'mask_pdf'
        self.records, self.placements = {}, []
        self.display_colors = {key: normalize_display_color(value) for key, value in (display_colors or {}).items()}

    def record_for(self, entry):
        card = dict(entry.get('card_row') or {})
        if not card or entry.get('is_default_back') or entry.get('page_kind') == 'title':
            return None
        key = (entry.get('spot_foil_scope', card.get('image_scope_id')) or 'global',
               entry.get('spot_foil_card_uuid') or entry.get('card_uuid'),
               entry.get('spot_foil_face') or ('back' if entry.get('page_kind') in ('back', 'card_back') else 'front'))
        if key not in self.records:
            with closing(self.get_connection()) as conn, conn:
                ensure_schema(conn)
                row = read_record(conn, key)
            record = None
            if row:
                settings = json.loads(row['settings'])
                record = dict(workflow_id=settings['workflow_id'], revision=row['revision'],
                              options=validate_options(settings['workflow_id'], settings['workflow_options']),
                              png=base64.b64decode(row['mask_png_base64']))
                if settings['workflow_id'] in self.display_colors:
                    record['options']['spot_display_color'] = self.display_colors[settings['workflow_id']]
            self.records[key] = record
        return self.records[key]

    def place(self, page, entry, slot, bleed=False, round_corners=False, radius=0):
        record = self.record_for(entry)
        if record:
            self.placements.append((page, record, dict(slot), bleed, round_corners, radius))

    def finish(self, source, allow_empty=False):
        if not self.placements and not allow_empty:
            raise ValueError('No saved spot foiling was found for the selected cards in this image library. Save a card mask first, or turn off spot-ink export.')
        channels = {(r['options']['spot_name'], r['options']['layer_type']) for _, r, *_ in self.placements}
        if len({name for name, _ in channels}) != len(channels):
            raise ValueError('The same spot name is assigned to different materials. Give each ink a distinct name before exporting.')
        if self.mask_only and len(channels) > 1:
            raise ValueError('Black-only mask PDFs support one ink at a time. Export these workflows separately, or choose named spot layers.')
        display_colors = {}
        for _, record, *_ in self.placements:
            options = record['options']
            name, color = options['spot_name'], options['spot_display_color']
            if not self.mask_only and name in display_colors and display_colors[name] != color:
                raise ValueError('Workflows sharing a spot name must use the same display color. Match their Spot display color settings before exporting.')
            display_colors[name] = color
        source.seek(0)
        writer = PdfWriter(); writer.clone_document_from_reader(PdfReader(source))
        writer.pdf_header = '%PDF-1.5'
        groups = []

        def group(name, channel=None):
            obj = DictionaryObject({NameObject('/Type'): NameObject('/OCG'), NameObject('/Name'): TextStringObject(name),
                NameObject('/Usage'): DictionaryObject({NameObject('/Print'): DictionaryObject({NameObject('/PrintState'): NameObject('/ON')})})})
            if channel:
                obj[NameObject('/DeckadenceInkName')] = TextStringObject(channel[0])
                obj[NameObject('/DeckadenceInkPurpose')] = TextStringObject(channel[1])
                if not self.mask_only:
                    obj[NameObject('/DeckadenceInkDisplayColor')] = TextStringObject(display_colors[channel[0]])
            ref = writer._add_object(obj)
            groups.append(ref); return ref

        artwork = group('Artwork and registration')
        layers = {key: group(f'{key[0]} - ' + {'white_underbase':'White ink (hides foil)', 'foil_application':'Foil / adhesive', 'varnish':'Varnish'}[key[1]], key) for key in sorted(channels)}
        per_page = {}
        for placement in self.placements:
            per_page.setdefault(placement[0], []).append(placement)
        cached = {}
        for index, page in enumerate(writer.pages):
            resources = page.setdefault(NameObject('/Resources'), DictionaryObject()).get_object()
            properties = resources.setdefault(NameObject('/Properties'), DictionaryObject()).get_object()
            properties[NameObject('/DeckadenceArtwork')] = artwork
            objects = resources.setdefault(NameObject('/XObject'), DictionaryObject()).get_object()
            colors = resources.setdefault(NameObject('/ColorSpace'), DictionaryObject()).get_object()
            states = resources.setdefault(NameObject('/ExtGState'), DictionaryObject()).get_object()
            for enabled in (False, True):
                states[NameObject('/DeckadenceOP'+str(int(enabled)))] = DictionaryObject({NameObject('/Type'):NameObject('/ExtGState'),
                    NameObject('/op'):BooleanObject(enabled), NameObject('/OP'):BooleanObject(enabled), NameObject('/OPM'):NumberObject(1)})
            original = page.get_contents()
            content = b'/OC /DeckadenceArtwork BDC\n' + (original.get_data() if original is not None else b'') + b'\nEMC\n'
            for number, (_, record, slot, bleed, round_corners, radius) in enumerate(per_page.get(index, [])):
                options = record['options']; channel = (options['spot_name'], options['layer_type'])
                footprint = {k: v for k, v in slot.items() if k in ('width_mm', 'height_mm', 'finished_card_width_mm', 'finished_card_height_mm', 'rotation_degrees')}
                key = (record['revision'], json.dumps(options, sort_keys=True), json.dumps(footprint, sort_keys=True), bleed, self.tone)
                if key not in cached:
                    cw, ch = slot.get('finished_card_width_mm', slot['width_mm']), slot.get('finished_card_height_mm', slot['height_mm'])
                    mask = ink_mask(record, cw, ch, self.tone)
                    rotation = int(slot.get('rotation_degrees', 0)) % 360
                    if rotation:
                        mask = mask.transpose({90:Image.Transpose.ROTATE_270, 180:Image.Transpose.ROTATE_180, 270:Image.Transpose.ROTATE_90}[rotation])
                    ppi = options['resolution_ppi']
                    size = (max(1, round(slot['width_mm']/25.4*ppi)), max(1, round(slot['height_mm']/25.4*ppi)))
                    resampling = Image.Resampling.NEAREST if self.tone == 'binary' or PRESETS[record['workflow_id']]['mask_tones'] == ['binary'] else Image.Resampling.BILINEAR
                    if bleed:
                        # Clamp oversized trim footprints just as the artwork compositor does.
                        mask = mask.resize((min(size[0], mask.width), min(size[1], mask.height)), resampling)
                        mask = _extend(mask, *size)
                    else:
                        mask = mask.resize(size, resampling)
                    image = DecodedStreamObject()
                    if self.mask_only:
                        zero = Image.new('L', mask.size)
                        image.set_data(Image.merge('CMYK', (zero, zero, zero, mask)).tobytes())
                        color_space = NameObject('/DeviceCMYK')
                    else:
                        image.set_data(mask.tobytes())
                        color_space = NameObject('/DeviceGray')
                    image.update({NameObject('/Type'):NameObject('/XObject'), NameObject('/Subtype'):NameObject('/Image'),
                        NameObject('/Width'):NumberObject(mask.width), NameObject('/Height'):NumberObject(mask.height),
                        NameObject('/ColorSpace'):color_space, NameObject('/BitsPerComponent'):NumberObject(8), NameObject('/Interpolate'):BooleanObject(False)})
                    image_ref = writer._add_object(image.flate_encode())
                    cached[key] = image_ref if self.mask_only else _coverage_group(writer, image_ref)
                image_name, layer_name = f'/DeckadenceInk{number}', f'/DeckadenceLayer{number}'
                objects[NameObject(image_name)] = cached[key]; properties[NameObject(layer_name)] = layers[channel]
                clip = _clip_path(slot, radius) if round_corners else ''
                paint = f'{image_name} Do'
                if not self.mask_only:
                    color_name, state_name = f'/DeckadenceSpot{number}', f'/DeckadenceCoverage{number}'
                    colors[NameObject(color_name)] = _spot_space(options['spot_name'], options['spot_display_color'])
                    states[NameObject(state_name)] = DictionaryObject({
                        NameObject('/Type'): NameObject('/ExtGState'),
                        NameObject('/SMask'): DictionaryObject({NameObject('/S'): NameObject('/Luminosity'),
                            NameObject('/G'): cached[key], NameObject('/BC'): _numbers([0])})})
                    # Apply the mask after the card transform: its unit-square
                    # coordinate space must follow this placement, not the page.
                    paint = f'{state_name} gs {color_name} cs 1 scn 0 0 1 1 re f'
                command = (f'/OC {layer_name} BDC q\n/DeckadenceOP{int(options["overprint"])} gs\n{clip}'
                           f'{slot["width_mm"]*MM} 0 0 {slot["height_mm"]*MM} {slot["x_mm"]*MM} {slot["y_mm"]*MM} cm\n{paint}\nQ EMC\n')
                content += command.encode('ascii')
            stream = DecodedStreamObject(); stream.set_data(content)
            page[NameObject('/Contents')] = writer._add_object(stream.flate_encode())
        writer._root_object[NameObject('/OCProperties')] = DictionaryObject({NameObject('/OCGs'):ArrayObject(groups),
            NameObject('/D'):DictionaryObject({NameObject('/BaseState'):NameObject('/ON'), NameObject('/ON'):ArrayObject(groups), NameObject('/Order'):ArrayObject(groups)})})
        writer.add_metadata({'/Subject':'Saved card spot masks. Spot plates use the configured display colors; their names select physical inks in the RIP. White underbase is the inverse of foil visibility.',
                             '/Keywords':', '.join(sorted(name for name, _ in channels)),
                             '/DeckadenceSpotOutput': self.output})
        output = BytesIO(); writer.write(output); output.seek(0); return output


def place_spot_foil(canvas, entry, slot, **kwargs):
    job = getattr(canvas, 'spot_foil_job', None)
    if job:
        job.place(canvas.getPageNumber()-1, entry, slot, **kwargs)


def draw_print_artwork(canvas, *args, **kwargs):
    """Suppress card pixels only for mask-only exports; keep registration marks."""
    if not getattr(getattr(canvas, 'spot_foil_job', None), 'mask_only', False):
        return canvas.drawImage(*args, **kwargs)


def append_print_pdf(writer, source):
    """Remember spot export intent even when an intermediate pack has no masks."""
    source.seek(0)
    reader = PdfReader(source)
    output = (reader.metadata or {}).get('/DeckadenceSpotOutput')
    if output:
        writer.deckadence_spot_output = output
    writer.append(reader)


def finish_print_pdf_merge(writer):
    """Restore the layer catalog after pypdf merges separate pack documents."""
    output = getattr(writer, 'deckadence_spot_output', None)
    if not output:
        return
    groups, inks, display_colors = {}, {}, {}
    for page in writer.pages:
        properties = page.get('/Resources', {}).get('/Properties', {})
        for name, ref in list(properties.items()):
            if not name.startswith('/Deckadence'):
                continue
            obj = ref.get_object()
            if obj.get('/Type') != '/OCG':
                continue
            ink, purpose = obj.get('/DeckadenceInkName'), obj.get('/DeckadenceInkPurpose')
            if ink:
                if ink in inks and inks[ink] != purpose:
                    raise ValueError('The same spot name is assigned to different materials across these packs. Give each ink a distinct name.')
                inks[ink] = purpose
                color = obj.get('/DeckadenceInkDisplayColor', '#FF00FF')
                if output == 'spot_pdf' and ink in display_colors and display_colors[ink] != color:
                    raise ValueError('Workflows sharing a spot name must use the same display color across packs.')
                display_colors[ink] = color
            key = str(obj['/Name'])
            properties[name] = groups.setdefault(key, ref)
    if not inks:
        raise ValueError('No saved spot foiling was found in the selected packs. Save a card mask first, or turn off spot-ink export.')
    if output == 'mask_pdf' and len(inks) > 1:
        raise ValueError('Black-only mask PDFs support one ink at a time. Export workflows separately, or choose named spot layers.')
    refs = ArrayObject(list(groups.values()))
    writer._root_object[NameObject('/OCProperties')] = DictionaryObject({NameObject('/OCGs'):refs,
        NameObject('/D'):DictionaryObject({NameObject('/BaseState'):NameObject('/ON'), NameObject('/ON'):refs, NameObject('/Order'):refs})})
    writer.pdf_header = '%PDF-1.5'
    writer.add_metadata({'/DeckadenceSpotOutput': output, '/Keywords':', '.join(sorted(inks)),
                         '/Subject':'Saved card spot masks. Spot plates use the configured display colors; white ink covers the inverse of foil visibility.'})
