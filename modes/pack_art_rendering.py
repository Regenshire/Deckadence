"""Local, reusable wrapper composition and conservative perspective correction."""
from io import BytesIO
from pathlib import Path
from statistics import median
import hashlib
import re

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFont, ImageOps, ImageColor


def read_image(data):
    with Image.open(BytesIO(data)) as source:
        if source.width * source.height > 25_000_000 or getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Expected one reasonably sized image.')
        return ImageOps.exif_transpose(source).convert('RGBA')


def png_bytes(image):
    output = BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


class PackFaceComposer:
    """The custom-set pack creator's existing foil wrapper composite.

    compose() preserves custom packs. The era renderers create unbranded,
    front-facing approximations; provenance records that they are generated.
    """

    def __init__(self, wrapper_path, font_dir):
        self.wrapper_path = Path(wrapper_path)
        self.font_dir = Path(font_dir)

    def compose(self, face_bytes, brightness=1.33):
        with Image.open(self.wrapper_path) as source:
            wrapper = source.convert('RGBA')
        face = read_image(face_bytes).convert('RGB')
        height = max(1, int(round(face.height * 350 / max(1, face.width))))
        face = face.resize((350, height), Image.Resampling.LANCZOS)
        face = ImageEnhance.Brightness(face).enhance(brightness)
        overlay = Image.new('RGB', wrapper.size, (0, 0, 0))
        overlay.paste(face, (int((wrapper.width - face.width) / 2), int((wrapper.height - face.height) / 2)))
        result = ImageChops.lighter(wrapper.convert('RGB'), overlay).convert('RGBA')
        result.putalpha(wrapper.getchannel('A'))
        return png_bytes(result)

    DESIGN_VERSION = 3
    STYLES = {'auto': 'Automatic — release year', 'classic': '1993–94 · Paper oval',
              'vintage': '1995–2002 · Framed foil', '2000s': '2003–14 · Dark foil',
              'modern': '2015 onward · Full art', 'specialty': 'Specialty · Minimal paper'}
    PALETTE = ('#343657', '#4d223f', '#952e30', '#264e57', '#44365c', '#69482f')
    SET_COLORS = {'LEG': '#454474', 'DRK': '#4c293e', 'FEM': '#a12126',
                  'ICE': '#80b7c8', '9ED': '#39312b', 'MBC': '#432855', 'SLZ': '#e9e5d9'}

    @classmethod
    def design(cls, set_code='', release_date='', style='auto', base_color=None):
        """Resolve reusable builder options without a database or network request."""
        if not isinstance(style, str) or style not in cls.STYLES:
            raise ValueError('Choose a supported pack design.')
        if base_color is not None and (not isinstance(base_color, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', base_color)):
            raise ValueError('Pack color must be a six-digit hex color.')
        code = str(set_code or '').upper()
        date = str(release_date or '')
        year = int(date[:4]) if re.match(r'^\d{4}(?:-|$)', date) else None
        if style == 'auto':
            style = ('specialty' if code == 'SLZ' else
                     'classic' if year and year <= 1994 else
                     'vintage' if year and year <= 2002 else
                     '2000s' if year and year <= 2014 else 'modern')
        color = base_color or cls.SET_COLORS.get(code) or cls.PALETTE[hashlib.sha256(code.encode()).digest()[0] % len(cls.PALETTE)]
        return {'version': cls.DESIGN_VERSION, 'style': style, 'base_color': color.lower()}

    def _font(self, size, name='Gotham-Medium.otf'):
        return ImageFont.truetype(str(self.font_dir / name), size)

    def _text(self, image, text, box, fill, maximum=34, font='BelerenProxy-Bold.ttf'):
        """Wrap/shrink a complete title inside a bounded area."""
        draw = ImageDraw.Draw(image)
        x0, y0, x1, y1 = box
        for size in range(maximum, 7, -1):
            face = self._font(size, font)
            lines, line = [], ''
            for word in text.split():
                candidate = (line + ' ' + word).strip()
                if line and draw.textlength(candidate, font=face) > x1-x0:
                    lines.append(line)
                    line = word
                else:
                    line = candidate
            lines.append(line)
            if len(lines)*(size+6) <= y1-y0 and max(draw.textlength(t, font=face) for t in lines) <= x1-x0:
                break
        y = (y0+y1)/2 - (len(lines)-1)*(size+6)/2
        for line in lines:
            draw.text(((x0+x1)/2, y), line, fill=fill, font=face, anchor='mm')
            y += size+6

    def _magic(self, image, box, classic=False, subtitle='#fbfaf5'):
        x0, y0, x1, y1 = box
        draw = ImageDraw.Draw(image)
        # The bundled title font provides lettering, not a rasterized official logo.
        text = 'Magic'
        for size in range(116, 20, -1):
            face = self._font(size, 'MagicTheGathering.TTF')
            if draw.textlength(text, font=face) <= x1-x0:
                break
        draw.text(((x0+x1)/2, y0+34), text, font=face, anchor='mm',
                  fill='#f5d89b' if classic else '#fbfaf5', stroke_width=2,
                  stroke_fill='#812e29' if classic else '#171c28')
        if subtitle is not None:
            self._text(image, 'THE GATHERING', (x0, y1, x1, y1+24),
                       subtitle, 13, 'Gotham-Medium.otf')

    @staticmethod
    def _gradient(size, top, bottom):
        return ImageOps.colorize(Image.linear_gradient('L').resize(size), top, bottom).convert('RGBA')

    def from_assets(self, artwork_bytes, logo_bytes, product_label, *, set_code='', set_name='',
                    release_date='', style='auto', base_color=None):
        art, logo = read_image(artwork_bytes), read_image(logo_bytes)
        if art.width < 600 or art.height < 400:
            raise ValueError('Set artwork is too small to create a pack face.')
        box = logo.getchannel('A').getbbox()
        if not box or logo.getchannel('A').getextrema()[0] != 0:
            raise ValueError('Expected a transparent set logo.')
        # WPN marketing artwork normally places logos to the left and credits below.
        if art.width / art.height >= 1.5:
            art = art.crop((round(art.width*.30), 0, round(art.width*.76), round(art.height*.75)))
        return self._render(set_name, set_code, product_label, release_date, style, base_color,
                            artwork=art, logo=logo.crop(box))

    def from_label(self, set_name, set_code, product_label, *, release_date='', style='auto',
                   base_color=None, icon_bytes=None):
        """Offline fallback with an optional cached set symbol and no app branding."""
        return self._render(set_name, set_code, product_label, release_date, style, base_color,
                            icon=read_image(icon_bytes) if icon_bytes else None)

    def _render(self, name, code, label, release_date, style, base_color, artwork=None, logo=None, icon=None):
        design = self.design(code, release_date, style, base_color)
        style, color = design['style'], ImageColor.getrgb(design['base_color'])
        pale, ink = '#efe9d6', '#20232e'
        face = self._gradient((400, 694), color, tuple(round(c*.43) for c in color))
        draw = ImageDraw.Draw(face)
        title_box = (36, 446, 364, 565)
        if style == 'classic':
            draw.ellipse((28, 91, 372, 610), fill=pale, outline='#c69481', width=4)
            self._magic(face, (38, 94, 362, 197), classic=True, subtitle=ink)
            self._text(face, 'BOOSTER PACK', (80, 218, 320, 318), ink, 42, 'MagicTheGathering.TTF')
            title_box = (64, 320, 336, 475)
            self._text(face, 'TRADING CARD GAME', (52, 558, 348, 593), ink, 13)
        elif style == 'vintage':
            draw.rectangle((16, 58, 384, 636), fill='#bed1d2')
            draw.rectangle((30, 70, 370, 624), fill=color, outline='#e2ece8', width=3)
            draw.rectangle((39, 79, 361, 615), outline='#d6e7de', width=2)
            for x in (43,357):
                for y in (83,611):
                    draw.ellipse((x-4,y-4,x+4,y+4), fill='#e3ece5')
            window = (52, 191, 348, 489)
            draw.rounded_rectangle(window, radius=80, fill='#d3e4dc', outline='#e9eee4', width=3)
            if artwork:
                face.alpha_composite(ImageOps.fit(artwork, (288,290), Image.Resampling.LANCZOS), (56,195))
            self._magic(face, (42, 97, 358, 195), classic=True, subtitle=ink)
            title_box = (48, 484, 352, 576)
        elif style == '2000s':
            draw.rectangle((13, 49, 387, 645), fill='#292927')
            window = (34, 184, 366, 542)
            draw.ellipse(window, fill=color, outline='#bba67b', width=4)
            if artwork:
                picture = ImageOps.fit(artwork, (326,352), Image.Resampling.LANCZOS)
                mask = Image.new('L', picture.size)
                ImageDraw.Draw(mask).ellipse((0,0,325,351), fill=255)
                picture.putalpha(mask)
                face.alpha_composite(picture, (37,187))
            self._magic(face, (27, 72, 373, 172), classic=True)
            title_box = (31, 510, 369, 605)
        elif style == 'specialty':
            draw.rectangle((12, 45, 388, 649), fill='#efede3', outline=ink, width=2)
            self._text(face, 'SECRET LAIR' if code == 'SLZ' else 'MAGIC', (32, 85, 368, 150), ink, 34)
            self._text(face, 'THE GATHERING' if code != 'SLZ' else '× MSCHF', (32, 146, 368, 183), ink, 17)
            draw.line((44,202,356,202), fill=ink, width=2)
            title_box = (38, 287, 362, 485)
        else:
            if artwork:
                face.alpha_composite(ImageOps.fit(artwork, (380,602), Image.Resampling.LANCZOS), (10,46))
            # A dark lower fade keeps the real set logo readable over illustration.
            overlay = Image.new('RGBA', (400, 694))
            od = ImageDraw.Draw(overlay)
            for y in range(48, 646):
                opacity = max(0, round(225*(y-400)/210), round(140*(180-y)/132))
                od.line((10,y,389,y), fill=(7,10,19,min(235,opacity)))
            face = Image.alpha_composite(face, overlay)
            self._magic(face, (74, 105, 326, 177), subtitle=None)
            if 'Collector' in label:
                stripe = Image.new('RGBA', (572,32), color+(255,))
                self._text(stripe, label.upper(), (8,0,564,32), '#ffffff', 17, 'Gotham-Medium.otf')
                face.alpha_composite(stripe.rotate(90, expand=True), (358,61))
                title_box = (28, 454, 344, 586)
        if icon and not artwork and style != 'classic':
            symbol = ImageOps.contain(icon, (120,120) if style == 'specialty' else (176,176), Image.Resampling.LANCZOS)
            face.alpha_composite(symbol, ((400-symbol.width)//2, 228))
            if style == 'specialty':
                title_box = (38, 365, 362, 545)
        if logo and style != 'classic':
            x0,y0,x1,y1 = title_box
            mark = ImageOps.contain(logo, (x1-x0, y1-y0), Image.Resampling.LANCZOS)
            face.alpha_composite(mark, ((x0+x1-mark.width)//2,(y0+y1-mark.height)//2))
        else:
            self._text(face, name or code, title_box, ink if style in {'classic','specialty'} else pale, 38)
        # Modern collector wrappers put their product label on the side.
        if not ((style == 'modern' and 'Collector' in label) or (style == 'classic' and label == 'Draft Booster')):
            draw = ImageDraw.Draw(face)
            y = 600 if style != 'classic' else 613
            draw.rectangle((16,y,384,y+32), fill=ink if style == 'specialty' else color)
            display_label = 'BOOSTER PACK' if label == 'Draft Booster' and style in {'classic','vintage','2000s'} else label.upper()
            self._text(face, display_label, (24,y,376,y+32), '#fff9eb', 17, 'Gotham-Medium.otf')
        return self._finish_wrapper(face, style, color)

    @staticmethod
    def _finish_wrapper(face, style, color):
        """Straight wrapper silhouette, shallow folds and ribbed paper/foil seals."""
        draw = ImageDraw.Draw(face)
        paper = style in {'classic', 'specialty'}
        seal_color = (231,228,217) if paper else ((154,166,166) if style == 'vintage' else tuple(max(24,round(c*.48)) for c in color))
        for y0,y1 in ((4,47),(647,690)):
            draw.rectangle((7,y0,393,y1), fill=seal_color)
            for x in range(10,391,4):
                draw.line((x,y0+3,x,y1-3), fill=tuple(max(0,c-32) for c in seal_color))
                draw.line((x+1,y0+3,x+1,y1-3), fill=tuple(min(255,c+23) for c in seal_color))
            draw.line((8,y1,392,y1), fill=tuple(max(0,c-45) for c in seal_color), width=2)
        folds = Image.new('RGBA', face.size)
        fd = ImageDraw.Draw(folds)
        for x in range(8,26):
            fd.line((x,49,x,645), fill=(255,255,255, max(0,42-abs(x-15)*6)))
            fd.line((400-x,49,400-x,645), fill=(0,0,0,max(0,45-abs(x-15)*6)))
        face = Image.alpha_composite(face, folds)
        mask = Image.new('L', face.size)
        ImageDraw.Draw(mask).polygon([(7,4),(393,4),(387,50),(390,644),(393,690),
                                      (7,690),(11,644),(13,50)], fill=255)
        face.putalpha(mask)
        return png_bytes(face)


class PackPerspectiveCorrector:
    """Flatten mildly angled, transparent single wrappers without inventing pixels.

    Edge fits must describe a near-planar quadrilateral. Curved silhouettes,
    severely foreshortened views and unreliable edges are left for composition.
    """

    SIZE = (400, 694)

    @staticmethod
    def _line(points, tolerance):
        if len(points) < 30:
            raise ValueError('Not enough visible wrapper edge to reconstruct.')
        selected = points
        for _ in range(3):
            mx = sum(p[0] for p in selected) / len(selected)
            my = sum(p[1] for p in selected) / len(selected)
            denom = sum((x - mx) ** 2 for x, _ in selected)
            if not denom:
                raise ValueError('Cannot measure the wrapper edge.')
            slope = sum((x - mx) * (y - my) for x, y in selected) / denom
            offset = my - slope * mx
            residuals = [abs(y - slope * x - offset) for x, y in points]
            cutoff = max(tolerance, median(residuals) * 3)
            selected = [p for p, residual in zip(points, residuals) if residual <= cutoff]
        if len(selected) < len(points) * .85 or median(residuals) > tolerance:
            raise ValueError('Wrapper edges are too curved to reconstruct reliably.')
        return slope, offset

    @staticmethod
    def _corner(horizontal, vertical):
        a, b = horizontal  # y = ax + b
        c, d = vertical    # x = cy + d
        if abs(1 - a * c) < .5:
            raise ValueError('Wrapper perspective is too severe.')
        x = (c * b + d) / (1 - a * c)
        return x, a * x + b

    @staticmethod
    def _coefficients(corners, size):
        """Solve the inverse homography from output corners to source corners."""
        width, height = size
        rows = []
        for (x, y), (u, v) in zip(((0, 0), (width, 0), (width, height), (0, height)), corners):
            rows.extend(([x, y, 1, 0, 0, 0, -u*x, -u*y, u],
                         [0, 0, 0, x, y, 1, -v*x, -v*y, v]))
        for col in range(8):
            pivot = max(range(col, 8), key=lambda row: abs(rows[row][col]))
            rows[col], rows[pivot] = rows[pivot], rows[col]
            value = rows[col][col]
            if abs(value) < 1e-9:
                raise ValueError('Degenerate wrapper perspective.')
            rows[col] = [v / value for v in rows[col]]
            for row in range(8):
                if row != col:
                    scale = rows[row][col]
                    rows[row] = [a - scale*b for a, b in zip(rows[row], rows[col])]
        return tuple(row[-1] for row in rows)

    def reconstruct(self, image_bytes):
        image = read_image(image_bytes)
        alpha = image.getchannel('A')
        box = alpha.getbbox()
        if not box or alpha.getextrema()[0] != 0:
            raise ValueError('Reconstruction requires a transparent wrapper cutout.')
        image = image.crop(box)
        width, height = image.size
        if width < 120 or height < 220 or not .40 <= width / height <= .72:
            raise ValueError('Wrapper is too small or too foreshortened to reconstruct.')
        alpha = image.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
        top, bottom, left, right = [], [], [], []
        for index in range(61):
            x = round((width - 1) * (.12 + .76 * index / 60))
            column = alpha.crop((x, 0, x + 1, height)).getbbox()
            if column:
                top.append((x, column[1]))
                bottom.append((x, column[3]))
            y = round((height - 1) * (.18 + .64 * index / 60))
            row = alpha.crop((0, y, width, y + 1)).getbbox()
            if row:
                left.append((y, row[0]))
                right.append((y, row[2]))
        top, bottom = (self._line(p, max(1.5, height * .003)) for p in (top, bottom))
        left, right = (self._line(p, max(1.5, width * .006)) for p in (left, right))
        if max(abs(line[0]) for line in (top, bottom, left, right)) > .30:
            raise ValueError('Wrapper angle is too severe to reconstruct reliably.')
        corners = [self._corner(top, left), self._corner(top, right),
                   self._corner(bottom, right), self._corner(bottom, left)]
        if any(not (-width*.08 <= x <= width*1.08 and -height*.04 <= y <= height*1.04) for x,y in corners):
            raise ValueError('Wrapper corners could not be located reliably.')
        top_width, bottom_width = corners[1][0]-corners[0][0], corners[2][0]-corners[3][0]
        if (min(top_width, bottom_width) < width * .7
                or min(corners[3][1]-corners[0][1], corners[2][1]-corners[1][1]) < height * .75
                or min(top_width, bottom_width) / max(top_width, bottom_width) < .78):
            raise ValueError('Too much of the wrapper face is hidden.')
        # Leave a small margin beyond fitted edges so seals and crinkles survive.
        cx, cy = sum(x for x,y in corners)/4, sum(y for x,y in corners)/4
        corners = [(cx+(x-cx)*1.05, cy+(y-cy)*1.01) for x,y in corners]
        result = image.transform(self.SIZE, Image.Transform.PERSPECTIVE,
                                 self._coefficients(corners, self.SIZE), Image.Resampling.BICUBIC)
        coverage = result.getchannel('A').crop((40, 70, 360, 624)).histogram()
        if sum(coverage[128:]) / sum(coverage) < .98:
            raise ValueError('The reconstructed face contains missing areas.')
        return png_bytes(result)
