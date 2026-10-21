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
from .foil_workflows import PRESETS, validate_options, normalize_display_color, resolve_export_workflow
from .finishing_effects import render_overlay, parameters, needs_backdrop, composite_overlay
from .finishing_bakes import baked_image

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
    result = Image.new(mask.mode, (width, height))
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
    def __init__(self, get_connection, output='spot_pdf', tone='grayscale', display_colors=None, *, workflow=None, include_white_inverse=False, include_foil=True, include_gloss=False, include_effect1=False, include_effect2=False):
        if output not in ('spot_pdf', 'mask_pdf') or tone not in ('grayscale', 'binary'):
            raise ValueError('Choose a valid spot-foiling PDF format and ink coverage mode.')
        self.get_connection, self.output, self.tone = get_connection, output, tone
        self.mask_only = output == 'mask_pdf'
        self.include_foil, self.include_gloss = bool(include_foil), bool(include_gloss)
        self.include_effects = {"effect1":bool(include_effect1), "effect2":bool(include_effect2)}
        self.effect_placements = []
        self.has_baked_artwork = False
        if any(self.include_effects.values()) and self.mask_only:
            raise ValueError('Printable effects need artwork output. Turn off Effect 1 and Effect 2 for a black-only ink mask.')
        if self.include_gloss and self.mask_only:
            raise ValueError('Gloss needs Artwork + named spot layers. Choose that PDF format or turn off Gloss.')
        self.include_white_inverse = bool(include_white_inverse) and self.include_foil and not self.mask_only
        self.records, self.placements = {}, []
        self.display_colors = {key: normalize_display_color(value) for key, value in (display_colors or {}).items()}
        workflow = workflow or resolve_export_workflow({})
        self.workflow_id = workflow['workflow_id']
        self.options = validate_options(self.workflow_id, {k:v for k,v in workflow.items() if k != 'workflow_id'})
        if self.workflow_id in self.display_colors:
            self.options['spot_display_color'] = self.display_colors[self.workflow_id]

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
                # Legacy per-card printer metadata is deliberately ignored.
                settings = json.loads(row['settings'])
                record = dict(workflow_id=self.workflow_id, revision=row['revision'],
                              options=dict(self.options), layer='mask', enabled=settings.get('foil_enabled', True),
                              png=base64.b64decode(row['mask_png_base64']))
                for layer in self.include_effects:
                    if settings.get(layer):
                        record[layer] = dict(settings[layer], revision=row['revision']+':'+layer,
                                             png=base64.b64decode(settings[layer]['mask_png_base64']))
                gloss = settings.get('gloss')
                if gloss:
                    options = dict(self.options, layer_type='varnish', spot_name='RDG_GLOSS',
                                   spot_display_color='#00BFFF', overprint=True)
                    record['gloss'] = dict(workflow_id='spot_varnish', revision=row['revision']+':gloss',
                                          options=options, layer='gloss',
                                          png=base64.b64decode(gloss['mask_png_base64']))
            self.records[key] = record
        return self.records[key]

    def place(self, page, entry, slot, bleed=False, round_corners=False, radius=0, artwork=None, baked=False):
        record = self.record_for(entry)
        if not record or not any(enabled and record.get(layer) and needs_backdrop(record[layer])
                                 for layer,enabled in self.include_effects.items()):
            artwork = None
        if record and self.include_foil and record.get('enabled', True):
            self.placements.append((page, record, dict(slot), bleed, round_corners, radius))
        if record and self.include_gloss and record.get('gloss'):
            self.placements.append((page, record['gloss'], dict(slot), bleed, round_corners, radius))
        for layer, enabled in self.include_effects.items():
            if enabled and record and record.get(layer) and not baked:
                self.effect_placements.append((page, layer, record[layer], dict(slot), bleed, round_corners, radius, artwork))

    def bake_artwork(self, artwork, entry, slot, bleed=False):
        record = self.record_for(entry)
        layers = [record[layer] for layer, enabled in self.include_effects.items()
                  if enabled and record and record.get(layer)]
        if not layers:
            return artwork, False
        from reportlab.lib.utils import ImageReader
        reader = artwork if isinstance(artwork, ImageReader) else ImageReader(artwork)
        pixels = reader.getRGBData()
        image = Image.frombytes(reader.mode, reader.getSize(), pixels)
        rotation = int(slot.get('rotation_degrees', 0)) % 360
        trim = None
        if bleed:
            size = image.size[::-1] if rotation % 180 else image.size
            width, height = (slot['height_mm'], slot['width_mm']) if rotation % 180 else (slot['width_mm'], slot['height_mm'])
            trim = (max(1, min(size[0], round(size[0]*slot.get('finished_card_width_mm', width)/width))),
                    max(1, min(size[1], round(size[1]*slot.get('finished_card_height_mm', height)/height))))
        result = baked_image(image, layers, trim, rotation=rotation, extend_bleed=bleed)
        self.has_baked_artwork = True
        # Explicit process colorants preserve named spot inks under overprint.
        return ImageReader(result.convert('CMYK')), True

    def finish(self, source, allow_empty=False):
        if not self.placements and not self.effect_placements and not self.has_baked_artwork and not allow_empty:
            raise ValueError('No saved finishing layers were found. Save a Foil Mask, Gloss, or Effect layer first, or turn off those layers in Print / Export.')
        channels = {(r['options']['spot_name'], r['options']['layer_type']) for _, r, *_ in self.placements}
        if len({name for name, _ in channels}) != len(channels):
            raise ValueError('The same spot name is assigned to different materials. Give each ink a distinct name before exporting.')
        if self.include_gloss and any(r.get('layer') != 'gloss' and r['options']['spot_name'] == 'RDG_GLOSS' for _, r, *_ in self.placements):
            raise ValueError('RDG_GLOSS is reserved for the Gloss layer. Give the foil mask a different spot channel name.')
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

        def group(name, channel=None, role=None):
            obj = DictionaryObject({NameObject('/Type'): NameObject('/OCG'), NameObject('/Name'): TextStringObject(name),
                NameObject('/Usage'): DictionaryObject({NameObject('/Print'): DictionaryObject({NameObject('/PrintState'): NameObject('/ON')})})})
            obj[NameObject('/DeckadenceLayerRole')] = TextStringObject(role or ('spot' if channel else 'artwork'))
            if channel:
                obj[NameObject('/DeckadenceInkName')] = TextStringObject(channel[0])
                obj[NameObject('/DeckadenceInkPurpose')] = TextStringObject(channel[1])
                if not self.mask_only:
                    obj[NameObject('/DeckadenceInkDisplayColor')] = TextStringObject(display_colors[channel[0]])
            ref = writer._add_object(obj)
            groups.append(ref); return ref

        # Catalog order is top to bottom; PDF paint order below is the reverse.
        white_inverse = group('White Inverse Layer', role='white_inverse') if self.include_white_inverse else None
        gloss_channels = {(r['options']['spot_name'], r['options']['layer_type']) for _, r, *_ in self.placements if r.get('layer') == 'gloss'}
        layers = {key: group(f'{key[0]} - Gloss', key, role='gloss') for key in sorted(gloss_channels)}
        effect_layers = {layer:group('Effect '+layer[-1], role=layer) for layer in ('effect2','effect1')
                         if any(item[1]==layer for item in self.effect_placements)}
        artwork = group('Artwork (baked effects) and registration', role='baked_artwork') if self.has_baked_artwork else group('Artwork and registration')
        layers.update({key: group(f'{key[0]} - ' + {'white_underbase':'White ink (hides foil)', 'foil_application':'Foil / adhesive', 'varnish':'Varnish'}[key[1]], key) for key in sorted(channels - gloss_channels)})
        per_page = {}
        for placement in self.placements:
            per_page.setdefault(placement[0], []).append(placement)
        cached = {}
        for index, page in enumerate(writer.pages):
            resources = page.setdefault(NameObject('/Resources'), DictionaryObject()).get_object()
            properties = resources.setdefault(NameObject('/Properties'), DictionaryObject()).get_object()
            properties[NameObject('/DeckadenceArtwork')] = artwork
            if white_inverse:
                properties[NameObject('/DeckadenceWhiteInverse')] = white_inverse
            objects = resources.setdefault(NameObject('/XObject'), DictionaryObject()).get_object()
            for layer,ref in effect_layers.items():
                properties[NameObject('/Deckadence'+layer)] = ref
            colors = resources.setdefault(NameObject('/ColorSpace'), DictionaryObject()).get_object()
            states = resources.setdefault(NameObject('/ExtGState'), DictionaryObject()).get_object()
            for enabled in (False, True):
                states[NameObject('/DeckadenceOP'+str(int(enabled)))] = DictionaryObject({NameObject('/Type'):NameObject('/ExtGState'),
                    NameObject('/op'):BooleanObject(enabled), NameObject('/OP'):BooleanObject(enabled), NameObject('/OPM'):NumberObject(1)})
            # Process paint replaces CMYK (including zero values), while leaving
            # the separate spot colorant underneath intact. White blocks artwork
            # color without depositing or knocking out the named printer ink.
            states[NameObject('/DeckadenceProcessOP')] = DictionaryObject({NameObject('/Type'):NameObject('/ExtGState'),
                NameObject('/op'):BooleanObject(True), NameObject('/OP'):BooleanObject(True), NameObject('/OPM'):NumberObject(0)})
            original = page.get_contents()
            artwork_content = b'/OC /DeckadenceArtwork BDC\nq /DeckadenceProcessOP gs\n' + (original.get_data() if original is not None else b'') + b'\nQ EMC\n'
            spot_content, gloss_content, inverse_content = b'', b'', b''
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
                    inverse_ref = None
                    if self.include_white_inverse and record.get('layer') != 'gloss':
                        inverse = DecodedStreamObject()
                        inverse.set_data(ImageOps.invert(mask).tobytes())
                        inverse.update(dict(image))
                        inverse_ref = _coverage_group(writer, writer._add_object(inverse.flate_encode()))
                    cached[key] = (image_ref if self.mask_only else _coverage_group(writer, image_ref), inverse_ref)
                image_name, layer_name = f'/DeckadenceInk{number}', f'/DeckadenceLayer{number}'
                ink_ref, inverse_ref = cached[key]
                objects[NameObject(image_name)] = ink_ref; properties[NameObject(layer_name)] = layers[channel]
                clip = _clip_path(slot, radius) if round_corners else ''
                paint = f'{image_name} Do'
                if not self.mask_only:
                    color_name, state_name = f'/DeckadenceSpot{number}', f'/DeckadenceCoverage{number}'
                    colors[NameObject(color_name)] = _spot_space(options['spot_name'], options['spot_display_color'])
                    states[NameObject(state_name)] = DictionaryObject({
                        NameObject('/Type'): NameObject('/ExtGState'),
                        NameObject('/SMask'): DictionaryObject({NameObject('/S'): NameObject('/Luminosity'),
                            NameObject('/G'): ink_ref, NameObject('/BC'): _numbers([0])})})
                    # Apply the mask after the card transform: its unit-square
                    # coordinate space must follow this placement, not the page.
                    paint = f'{state_name} gs {color_name} cs 1 scn 0 0 1 1 re f'
                command = (f'/OC {layer_name} BDC q\n/DeckadenceOP{int(options["overprint"])} gs\n{clip}'
                           f'{slot["width_mm"]*MM} 0 0 {slot["height_mm"]*MM} {slot["x_mm"]*MM} {slot["y_mm"]*MM} cm\n{paint}\nQ EMC\n')
                if record.get('layer') == 'gloss':
                    gloss_content += command.encode('ascii')
                else:
                    spot_content += command.encode('ascii')
                if inverse_ref:
                    objects[NameObject(f'/DeckadenceWhiteInverse{number}')] = inverse_ref
                    inverse_state = f'/DeckadenceInverseCoverage{number}'
                    states[NameObject(inverse_state)] = DictionaryObject({NameObject('/Type'):NameObject('/ExtGState'),
                        NameObject('/SMask'):DictionaryObject({NameObject('/S'):NameObject('/Luminosity'),
                            NameObject('/G'):inverse_ref, NameObject('/BC'):_numbers([0])})})
                    inverse_content += (f'/OC /DeckadenceWhiteInverse BDC q\n/DeckadenceProcessOP gs\n{clip}'
                        f'{slot["width_mm"]*MM} 0 0 {slot["height_mm"]*MM} {slot["x_mm"]*MM} {slot["y_mm"]*MM} cm\n'
                        f'{inverse_state} gs 0 0 0 0 k 0 0 1 1 re f\nQ EMC\n').encode('ascii')
            effect_content = b''
            effect_backdrops = {}
            translucent_slots = {json.dumps(item[3],sort_keys=True) for item in self.effect_placements
                                 if item[0]==index and needs_backdrop(item[2])}
            for number, (_, layer, record, slot, bleed, round_corners, radius, source_artwork) in enumerate(
                    sorted((item for item in self.effect_placements if item[0]==index), key=lambda item:item[1])):
                footprint={k:v for k,v in slot.items() if k in ('width_mm','height_mm','finished_card_width_mm','finished_card_height_mm','rotation_degrees')}
                slot_key=json.dumps(slot,sort_keys=True)
                # Translucent layers depend on this placement's actual artwork
                # and the enabled effect beneath them, including rotation/bleed.
                key=('effect',record['revision'],json.dumps(footprint,sort_keys=True),bleed,
                     (index,number) if slot_key in translucent_slots else None)
                if key not in cached:
                    cw=slot.get('finished_card_width_mm',slot['width_mm'])
                    ppi=self.options['resolution_ppi']
                    png=render_overlay(record['png'],parameters(record),width=min(3024,round(cw/25.4*ppi)))
                    image=Image.open(BytesIO(png)).convert('RGBA')
                    rotation=int(slot.get('rotation_degrees',0))%360
                    if rotation:image=image.transpose({90:Image.Transpose.ROTATE_270,180:Image.Transpose.ROTATE_180,270:Image.Transpose.ROTATE_90}[rotation])
                    size=(max(1,round(slot['width_mm']/25.4*ppi)),max(1,round(slot['height_mm']/25.4*ppi)))
                    if bleed:
                        image=image.resize((min(size[0],image.width),min(size[1],image.height)),Image.Resampling.LANCZOS)
                        image=_extend(image,*size)
                    else:image=image.resize(size,Image.Resampling.LANCZOS)
                    if slot_key in translucent_slots:
                        backdrop=effect_backdrops.get(slot_key)
                        if backdrop is None:
                            if source_artwork is None:
                                raise ValueError('This finishing effect needs the card artwork. Export again from Print / Export.')
                            if isinstance(source_artwork,Image.Image):backdrop=source_artwork.convert('RGBA')
                            else:
                                from reportlab.lib.utils import ImageReader
                                reader=source_artwork if isinstance(source_artwork,ImageReader) else ImageReader(source_artwork)
                                pixels=reader.getRGBData()
                                backdrop=Image.frombytes(reader.mode,reader.getSize(),pixels).convert('RGBA')
                            backdrop=backdrop.resize(size,Image.Resampling.LANCZOS)
                        image=composite_overlay(backdrop,image,record)
                        effect_backdrops[slot_key]=Image.alpha_composite(backdrop,image)
                    def image_object(pixels,space):
                        obj=DecodedStreamObject();obj.set_data(pixels.tobytes())
                        obj.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Image'),
                            NameObject('/Width'):NumberObject(pixels.width),NameObject('/Height'):NumberObject(pixels.height),
                            NameObject('/ColorSpace'):NameObject(space),NameObject('/BitsPerComponent'):NumberObject(8)})
                        return obj
                    alpha=writer._add_object(image_object(image.getchannel('A'),'/DeviceGray').flate_encode())
                    # Explicit process colorants preserve underlying spot inks
                    # under overprint; transparent DeviceRGB images can knock
                    # them out when a RIP converts the transparency group.
                    process=image_object(image.convert('RGB').convert('CMYK'),'/DeviceCMYK');process[NameObject('/SMask')]=alpha
                    cached[key]=writer._add_object(process.flate_encode())
                name=f'/DeckadenceEffectImage{number}'
                objects[NameObject(name)]=cached[key]
                clip=_clip_path(slot,radius) if round_corners and not bleed else ''
                effect_content+=(f'/OC /Deckadence{layer} BDC q /DeckadenceProcessOP gs\n{clip}'
                    f'{slot["width_mm"]*MM} 0 0 {slot["height_mm"]*MM} {slot["x_mm"]*MM} {slot["y_mm"]*MM} cm\n{name} Do\nQ EMC\n').encode('ascii')
            stream = DecodedStreamObject(); stream.set_data(spot_content + artwork_content + effect_content + gloss_content + inverse_content)
            page[NameObject('/Contents')] = writer._add_object(stream.flate_encode())
        writer._root_object[NameObject('/OCProperties')] = DictionaryObject({NameObject('/OCGs'):ArrayObject(groups),
            NameObject('/D'):DictionaryObject({NameObject('/BaseState'):NameObject('/ON'), NameObject('/ON'):ArrayObject(groups), NameObject('/Order'):ArrayObject(groups)})})
        writer.add_metadata({'/Subject':'Saved card spot masks. Spot plates use the configured display colors; their names select physical inks in the RIP. White underbase is the inverse of foil visibility.',
                             '/Keywords':', '.join(sorted(name for name, _ in channels)),
                             '/DeckadenceSpotOutput': self.output,
                             '/DeckadenceWhiteInverse': '1' if self.include_white_inverse else '0'})
        output = BytesIO(); writer.write(output); output.seek(0); return output


def place_spot_foil(canvas, entry, slot, **kwargs):
    job = getattr(canvas, 'spot_foil_job', None)
    if job:
        job.place(canvas.getPageNumber()-1, entry, slot, artwork=getattr(canvas,'_finishing_artwork',None),
                  baked=getattr(canvas,'_finishing_baked',False), **kwargs)
        canvas._finishing_artwork = None
        canvas._finishing_baked = False


def draw_print_artwork(canvas, *args, finishing_entry=None, finishing_slot=None, finishing_bleed=False, **kwargs):
    """Suppress card pixels only for mask-only exports; keep registration marks."""
    if not getattr(getattr(canvas, 'spot_foil_job', None), 'mask_only', False):
        if getattr(canvas,'spot_foil_job',None):
            artwork = args[0] if args else kwargs.get('image')
            canvas._finishing_baked = False
            if finishing_entry is not None and finishing_slot is not None:
                artwork, canvas._finishing_baked = canvas.spot_foil_job.bake_artwork(
                    artwork, finishing_entry, finishing_slot, finishing_bleed)
                if args: args = (artwork, *args[1:])
                else: kwargs['image'] = artwork
            canvas._finishing_artwork = artwork
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
    if not inks and not any(ref.get_object().get('/DeckadenceLayerRole') in ('effect1','effect2','baked_artwork') for ref in groups.values()):
        raise ValueError('No saved finishing layers were found in these packs. Save a Foil Mask, Gloss, or Effect layer first, or turn off those layers in Print / Export.')
    if output == 'mask_pdf' and len(inks) > 1:
        raise ValueError('Black-only mask PDFs support one ink at a time. Export workflows separately, or choose named spot layers.')
    def layer_order(ref):
        obj = ref.get_object()
        role = obj.get('/DeckadenceLayerRole')
        return ({'white_inverse':0,'gloss':1,'effect2':2,'effect1':3,'artwork':4,'baked_artwork':4,'spot':5}.get(role,4), str(obj['/Name']))
    refs = ArrayObject(sorted(groups.values(), key=layer_order))
    writer._root_object[NameObject('/OCProperties')] = DictionaryObject({NameObject('/OCGs'):refs,
        NameObject('/D'):DictionaryObject({NameObject('/BaseState'):NameObject('/ON'), NameObject('/ON'):refs, NameObject('/Order'):refs})})
    writer.pdf_header = '%PDF-1.5'
    writer.add_metadata({'/DeckadenceSpotOutput': output, '/Keywords':', '.join(sorted(inks)),
                         '/Subject':'Saved card spot masks. Spot plates use the configured display colors; white ink covers the inverse of foil visibility.'})
