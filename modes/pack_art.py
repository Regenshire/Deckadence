"""Fill missing booster wrappers and product photos without changing existing art.

Discovery, formatting and installation are independent of Flask and the database.
Run ``python -m modes.pack_art --help`` for the preview/install workflow.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from io import BytesIO, RawIOBase
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
import unicodedata
from urllib.parse import urljoin, urlsplit, urlunsplit
import zipfile
from uuid import uuid4

from PIL import Image, ImageOps
import requests

from paths import DATABASE_PATH, RUNTIME_PACK_ART_DIR, get_pack_art_dir, get_static_dir
from modes.pack_art_rendering import PackFaceComposer, PackPerspectiveCorrector

PACK_TYPES = {'play': 'Play Booster', 'collector': 'Collector Booster', 'set': 'Set Booster',
              'draft': 'Draft Booster', 'jumpstart': 'Jumpstart Booster', 'sample': 'Collector Sample Pack',
              'default': 'Specialty Booster'}
PRODUCT_TYPES = {**PACK_TYPES, 'play_box': 'Play Booster Box', 'collector_box': 'Collector Booster Box',
                 'set_box': 'Set Booster Box', 'draft_box': 'Draft Booster Box', 'bundle': 'Bundle',
                 'gift_bundle': 'Gift Bundle', 'holiday_bundle': 'Holiday Bundle'}
PACK_METHOD_RANK = {'front': 0, 'reconstructed': 1, 'created': 2, 'label': 3}
SPECIALTY_PRODUCTS = {
    'MBC': {'draft': 'Commander Draft Booster', 'draft_box': 'Mystery Booster Commander Edition Box'},
    'SLZ': {'default': 'Zeta Booster'},
}


def product_label(set_code, product_type):
    return SPECIALTY_PRODUCTS.get(set_code, {}).get(product_type, PRODUCT_TYPES[product_type])


class PackArtCancelled(Exception):
    """Cooperative cancellation, deliberately not caught as a bad source image."""


class PackArtError(ValueError):
    """An unavailable or unsuitable source, safe to leave on the current fallback."""


@dataclass(frozen=True)
class PackArtCandidate:
    set_code: str
    booster_key: str
    product_name: str
    page_url: str
    image_url: str
    archive_member: str = ''


@dataclass(frozen=True)
class PackArtAssets:
    artwork: PackArtCandidate
    logo: PackArtCandidate
    artwork_bytes: bytes
    logo_bytes: bytes


def _words(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    return ' '.join(re.findall(r'[a-z0-9]+', value.lower()))


def _set_code(value):
    code = value.strip().upper()
    if not re.fullmatch(r'[A-Z0-9]{2,8}', code) or code in {'CON', 'PRN', 'AUX', 'NUL'} or re.fullmatch(r'(COM|LPT)[0-9]', code):
        raise PackArtError('Expected a regular MTG set code, such as FIN or KHM.')
    return code


class _WpnProducts(HTMLParser):
    """Read the product selector's semantic marker, not its generated CSS names."""

    def __init__(self):
        super().__init__()
        self.products = []
        self.depth = 0
        self.label = []
        self.images = []
        self.archive_urls = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href', '').lower().endswith('.zip'):
            self.archive_urls.append(attrs['href'])
        if tag == 'div' and 'data-product-selector-item-v' in attrs:
            self.depth, self.label, self.images = 1, [], []
        elif self.depth and tag == 'div':
            self.depth += 1
        if self.depth and tag == 'img' and attrs.get('src'):
            self.images.append(attrs['src'])

    def handle_endtag(self, tag):
        if tag == 'div' and self.depth:
            self.depth -= 1
            if not self.depth:
                self.products.append((' '.join(' '.join(self.label).split()), self.images))

    def handle_data(self, data):
        if self.depth:
            self.label.append(data)


class _WpnArchive(RawIOBase):
    """Seekable HTTP ranges: read ZIP metadata and selected PNGs, not whole kits."""

    def __init__(self, source, url):
        super().__init__()
        self.source, self.url, self.position = source, url, 0
        self.tail, headers = source._request(url, 65557, 'bytes=-65557')
        match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)', headers.get('Content-Range', ''))
        if not match:
            raise PackArtError('The archive server did not return a valid byte range.')
        self.tail_start, end, self.size = map(int, match.groups())
        if end + 1 != self.size or len(self.tail) != self.size - self.tail_start or self.size > 512 * 1024 * 1024:
            raise PackArtError('Invalid or oversized product archive.')
        self.etag = headers.get('ETag')

    def seekable(self):
        return True

    def tell(self):
        return self.position

    def seek(self, offset, whence=0):
        position = (self.position if whence == 1 else self.size if whence == 2 else 0) + offset
        if position < 0:
            raise PackArtError('Invalid archive offset.')
        self.position = position
        return position

    def read(self, size=-1):
        end = self.size if size < 0 else min(self.position + size, self.size)
        if end <= self.position:
            return b''
        if end - self.position > 16 * 1024 * 1024:
            raise PackArtError('Archive member exceeds the download size limit.')
        if self.position >= self.tail_start:
            data = self.tail[self.position - self.tail_start:end - self.tail_start]
        else:
            data, headers = self.source._request(self.url, end - self.position,
                                                 f'bytes={self.position}-{end - 1}')
            if headers.get('Content-Range') != f'bytes {self.position}-{end - 1}/{self.size}' or len(data) != end - self.position:
                raise PackArtError('Archive server returned the wrong byte range.')
            if self.etag and headers.get('ETag') != self.etag:
                raise PackArtError('The product archive changed during download; retry discovery.')
        self.position = end
        return data


class WpnPackArtSource:
    """Public English product-shot archives, with page images as a fallback.

    WPN is a website, not a versioned API. Unsupported layouts fail explicitly.
    One instance reuses its HTTP connection and spaces requests by 250 ms.
    """

    PAGE_SLUGS = {'J22': 'mtg-jumpstart-2022'}
    # Specialty releases are announced outside the WPN product catalogue.
    SPECIALTY_SOURCES = {
        'MBC': ('https://magic.wizards.com/en/news/feature/whats-inside-mystery-booster-commander-edition', {
            'draft': 'https://media.wizards.com/2026/images/daily/VbqFabKvbr/wFKXx2Jn3B.webp',
            'draft_box': 'https://media.wizards.com/2026/images/daily/VbqFabKvbr/heqm2no634.webp'}),
        'SLZ': ('https://magic.wizards.com/en/news/announcements/chaos-vault-the-zeta-set-puts-the-playtest-in-your-hands', {
            'default': 'https://media.wizards.com/2026/images/daily/scT1AhDXXJ/19oNIpI2wT.webp'}),
    }

    def __init__(self, session=None, cancel_event=None, progress=None):
        self.session = session or requests.Session()
        self._last_request = 0.0
        self._archives = {}
        self._pages = {}
        self._assets = {}
        self.cancel_event = cancel_event or threading.Event()
        self.progress = progress or (lambda **changes: None)

    def check_cancelled(self):
        if self.cancel_event.is_set():
            raise PackArtCancelled()

    @staticmethod
    def _validate_url(url):
        parsed = urlsplit(url)
        valid = (
            parsed.hostname == 'wpn.wizards.com'
            and re.fullmatch(r'/en/products/[a-z0-9-]+/?', parsed.path)
        ) or (
            parsed.hostname == 'images.ctfassets.net'
            and parsed.path.startswith('/0piqveu8x9oj/')
        ) or (
            parsed.hostname == 'media.wizards.com'
            and (re.fullmatch(r'/\d{4}/wpn/marketing_materials/[a-zA-Z0-9_/-]+\.zip', parsed.path)
                 or re.fullmatch(r'/\d{4}/images/daily/[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+\.(?:png|webp)', parsed.path))
        )
        if parsed.scheme != 'https' or parsed.netloc != parsed.hostname or not valid:
            raise PackArtError('Expected a public WPN product page or its image CDN.')

    def _request(self, url, limit, byte_range=None):
        for _ in range(4):
            self.check_cancelled()
            self._validate_url(url)
            self.cancel_event.wait(max(0, 0.25 - (time.monotonic() - self._last_request)))
            self.check_cancelled()
            self._last_request = time.monotonic()
            request_headers = {'User-Agent': 'Deckadence-PackArt/1.0'}
            if byte_range:
                request_headers['Range'] = byte_range
            with self.session.get(url, timeout=(5, 10), stream=True, allow_redirects=False,
                                  headers=request_headers) as response:
                if response.is_redirect:
                    url = urljoin(url, response.headers['Location'])
                    continue
                response.raise_for_status()
                if byte_range and response.status_code != 206:
                    raise PackArtError('Archive server does not support partial downloads.')
                chunks, size = [], 0
                for chunk in response.iter_content(65536):
                    self.check_cancelled()
                    size += len(chunk)
                    if size > limit:
                        raise PackArtError('Source exceeds the download size limit.')
                    chunks.append(chunk)
                    self.progress(bytes_received=len(chunk))
                self.check_cancelled()
                return b''.join(chunks), response.headers
        raise PackArtError('Too many redirects from the source.')

    def _fetch(self, url, limit):
        return self._request(url, limit)[0]

    def _archive(self, url):
        if url not in self._archives:
            self._archives[url] = zipfile.ZipFile(_WpnArchive(self, url))
        return self._archives[url]

    @staticmethod
    def archive_candidates(set_code, page_url, archive_url, names, page_candidates=()):
        """Recognize individual English wrappers; retain alternate camera views."""
        code = _set_code(set_code)
        types = {'clctr': 'collector', 'play': 'play', 'draft': 'draft', 'drft': 'draft',
                 'set': 'set', 'jmp': 'jumpstart', 'jumpstart': 'jumpstart'}
        pattern = re.compile(rf'MTG{re.escape(code)}_EN_(?:(Bstr|BstrSmpl|SmplBstr)_([A-Za-z]+)|([A-Za-z]+)Bstr)_(\d+)_(\d+)\.png', re.I)
        def identify(name):
            match = pattern.fullmatch(name)
            if not match:
                return None
            key = types.get((match[2] or match[3]).lower())
            if (match[1] or '').lower() in {'bstrsmpl', 'smplbstr'}:
                key = 'sample' if key == 'collector' else None
            # The official J22 archive calls its Jumpstart wrapper "Drft".
            if code == 'J22' and key == 'draft':
                key = 'jumpstart'
            return (key, int(match[4]), int(match[5])) if key else None
        preferred = {}
        for candidate in page_candidates:
            entry = identify(Path(urlsplit(candidate.image_url).path).name)
            if entry:
                preferred[candidate.booster_key] = entry[1]
        choices = {}
        for name in names:
            if '__MACOSX' in name.split('/'):
                continue
            entry = identify(name.rsplit('/', 1)[-1])
            if entry:
                key, art, view = entry
                choices.setdefault(key, []).append((art, view, name))
        result = []
        for key, views in choices.items():
            # Prefer the pictured artwork, then other artwork if it has no usable
            # front. View 02 is often frontal, but the geometry check decides.
            preferred_art = preferred.get(key, min(view[0] for view in views))
            views.sort(key=lambda v: (v[0] != preferred_art, v[0], v[1] != 2, v[1], v[2]))
            for _, _, member in views:
                label = 'Collector Booster Sample Pack' if key == 'sample' else key.title() + ' Booster'
                result.append(PackArtCandidate(code, key, label, page_url, archive_url, member))
        return result

    @staticmethod
    def parse(set_code, set_name, page_url, html):
        code = _set_code(set_code)
        parser = _WpnProducts()
        parser.feed(html)
        if not parser.products:
            raise PackArtError('No WPN product selector found; the page or layout may have changed.')
        candidates = {}
        for label, images in parser.products:
            name = _words(label)
            prefix = _words(set_name) + ' '
            if name.startswith(prefix):
                name = name[len(prefix):]
            match = re.fullmatch(r'(play|collector|draft|set|jumpstart) boosters?', name)
            key = match[1] if match else None
            box = re.fullmatch(r'(play|collector|draft|set) boosters? (?:box(?:es)?|displays?)', name)
            if box:
                key = box[1] + '_box'
            if name in {'bundle', 'gift bundle', 'holiday bundle', 'chocobo bundle'}:
                key = 'holiday_bundle' if name == 'chocobo bundle' else name.replace(' ', '_')
            if name in {'collector booster sample pack', 'collector booster sample packs'}:
                key = 'sample'
            if not key or len(images) != 1:
                continue  # Cases, multipacks and unrecognized variants are not supported products.
            image_url = urlsplit(urljoin(page_url, images[0]))
            # WPN thumbnails are 160 px. Dropping CDN transforms retrieves the source file.
            original_url = urlunsplit((image_url.scheme, image_url.netloc, image_url.path, '', ''))
            WpnPackArtSource._validate_url(original_url)
            if key in candidates and candidates[key].image_url != original_url:
                raise PackArtError(f'Ambiguous {key} pack images; review the WPN product page.')
            candidates[key] = PackArtCandidate(code, key, label, page_url, original_url)
        return list(candidates.values())

    def discover(self, set_code, set_name, page_url=None):
        set_code = _set_code(set_code)
        if set_code in self.SPECIALTY_SOURCES and page_url is None:
            page, products = self.SPECIALTY_SOURCES[set_code]
            return [PackArtCandidate(set_code, key, product_label(set_code, key), page, url)
                    for key, url in products.items()]
        page_url = page_url or 'https://wpn.wizards.com/en/products/' + self.PAGE_SLUGS.get(set_code, _words(set_name).replace(' ', '-'))
        html = self._fetch(page_url, 4 * 1024 * 1024).decode('utf-8')
        parser = _WpnProducts()
        parser.feed(html)
        self._pages[set_code] = (page_url, tuple(dict.fromkeys(urljoin(page_url, href) for href in parser.archive_urls)))
        page_candidates = self.parse(set_code, set_name, page_url, html) if parser.products else []
        candidates = []
        for href in dict.fromkeys(parser.archive_urls):
            url = urljoin(page_url, href)
            if re.fullmatch(rf'{re.escape(set_code.lower())}_pds(?:_[a-z0-9]+)*_en\.zip', Path(urlsplit(url).path).name.lower()):
                try:
                    archive = self._archive(url)
                except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile) as error:
                    # A missing marketing ZIP must not block usable page images.
                    logging.getLogger(__name__).warning('WPN archive unavailable for %s: %s', set_code, error)
                    continue
                candidates.extend(self.archive_candidates(set_code, page_url, url, archive.namelist(), page_candidates))
        # A page photo can still be frontal when all archive views are unsuitable.
        if not parser.products and not parser.archive_urls:
            raise PackArtError('No WPN products or artwork archives found; the page may have changed.')
        return candidates + page_candidates

    def construction_assets(self, set_code):
        """Fetch a set's official illustration and transparent logo only on demand.

        Assets come from the already discovered English art-and-logo archive;
        filenames must identify this set, never an adjacent Commander release.
        Results (including absence) are cached for all missing packs in the set.
        """
        code = _set_code(set_code)
        self.check_cancelled()
        if code in self._assets:
            return self._assets[code]
        self._assets[code] = None
        page_url, urls = self._pages.get(code, ('', ()))
        for url in urls:
            if not re.fullmatch(rf'{re.escape(code.lower())}_alg(?:_[a-z0-9]+)*_en\.zip', Path(urlsplit(url).path).name.lower()):
                continue
            archive = self._archive(url)
            members = [name for name in archive.namelist() if '__MACOSX' not in name.split('/')]
            art = sorted(name for name in members if re.fullmatch(
                rf'{re.escape(code)}_(?:(?:alg_)?1080p|sma_key_1920x1080)_en\.(?:jpe?g|png)', Path(name).name, re.I))
            logos = sorted(name for name in members if re.fullmatch(
                rf'MTG{re.escape(code)}_(?:EN_(?:Main)?SetLogo(?:_[a-z0-9]+)*|SetLogo_Web_EN)\.png', Path(name).name, re.I))
            if not art or not logos:
                continue
            artwork = PackArtCandidate(code, '', 'Official set artwork', page_url, url, art[0])
            logo = PackArtCandidate(code, '', 'Official set logo', page_url, url, logos[0])
            assets = PackArtAssets(artwork, logo, self.image_bytes(artwork), self.image_bytes(logo))
            self._assets[code] = assets
            return assets
        return None

    def image_bytes(self, candidate):
        self.check_cancelled()
        if candidate.archive_member:
            archive = self._archive(candidate.image_url)
            info = archive.getinfo(candidate.archive_member)
            if info.file_size > 16 * 1024 * 1024:
                raise PackArtError('Uncompressed pack image exceeds the size limit.')
            with archive.open(info) as member:
                data = member.read(16 * 1024 * 1024 + 1)
            if len(data) > 16 * 1024 * 1024:
                raise PackArtError('Uncompressed pack image exceeds the size limit.')
            return data
        return self._fetch(candidate.image_url, 16 * 1024 * 1024)

    def close(self):
        for archive in self._archives.values():
            archive.close()
        self.session.close()


class PackArtFormatter:
    """Accept frontal wrappers and retain the complete image on a 400 x 694 canvas."""

    SIZE = (400, 694)
    PRODUCT_SIZE = (640, 480)
    MAX_EDGE_SLOPE = 0.025

    @staticmethod
    def _slope(points):
        count = len(points)
        sx, sy = sum(x for x, _ in points), sum(y for _, y in points)
        denominator = count * sum(x * x for x, _ in points) - sx * sx
        if count < 30 or not denominator:
            raise PackArtError('Cannot reliably measure the wrapper edges; review this image.')
        return abs((count * sum(x * y for x, y in points) - sx * sy) / denominator)

    def check_front_view(self, image):
        """Reject sloped seals and leaning wrappers; allow small natural crinkles.

        This is a conservative silhouette check, not a proof of camera pose. It
        selects genuine front views; it never synthesizes or warps pack printing.
        """
        alpha = image.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
        box = alpha.getbbox()
        if not box:
            raise PackArtError('No opaque wrapper found.')
        alpha = alpha.crop(box)
        width, height = alpha.size
        top, bottom, centers = [], [], []
        for index in range(41):
            x = round(width * (0.1 + 0.8 * index / 40))
            column = alpha.crop((x, 0, x + 1, height)).getbbox()
            if column:
                top.append((x, column[1]))
                bottom.append((x, column[3]))
            y = round(height * (0.15 + 0.7 * index / 40))
            row = alpha.crop((0, y, width, y + 1)).getbbox()
            if row:
                centers.append((y, (row[0] + row[2]) / 2))
        if max(self._slope(points) for points in (top, bottom, centers)) > self.MAX_EDGE_SLOPE:
            raise PackArtError('Angled pack view; a front-facing source image is required.')

    def format(self, image_bytes):
        with Image.open(BytesIO(image_bytes)) as source:
            if source.width * source.height > 25_000_000 or getattr(source, 'n_frames', 1) != 1:
                raise PackArtError('Expected one reasonably sized product image.')
            image = ImageOps.exif_transpose(source).convert('RGBA')
        alpha = image.getchannel('A')
        box = alpha.getbbox()
        if not box or alpha.getextrema()[0] != 0:
            raise PackArtError('Expected a transparent product cutout; background removal needs review.')
        image = image.crop(box)
        if image.width < 120 or image.height < 220 or not 0.4 <= image.width / image.height <= 0.7:
            raise PackArtError('Image is too small or does not have single-booster proportions.')
        self.check_front_view(image)
        pack = ImageOps.contain(image, self.SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', self.SIZE, (0, 0, 0, 0))
        canvas.alpha_composite(pack, ((canvas.width - pack.width) // 2, (canvas.height - pack.height) // 2))
        output = BytesIO()
        canvas.save(output, format='PNG', optimize=True)
        return output.getvalue()

    def format_specialty(self, image_bytes):
        """Normalize verified specialty wrappers to an upright pack orientation."""
        with Image.open(BytesIO(image_bytes)) as source:
            if source.width * source.height > 25_000_000 or getattr(source, 'n_frames', 1) != 1:
                raise PackArtError('Expected one reasonably sized specialty pack.')
            image = ImageOps.exif_transpose(source).convert('RGBA')
        alpha = image.getchannel('A')
        box = alpha.getbbox()
        if not box or alpha.getextrema()[0] != 0:
            raise PackArtError('Expected a transparent specialty pack cutout.')
        image = image.crop(box)
        if min(image.size) < 120 or not .40 <= image.width/image.height <= 2.1:
            raise PackArtError('Unexpected specialty wrapper proportions.')
        self.check_front_view(image)
        # Some official specialty pack photos are supplied sideways. Inspect the
        # cropped wrapper, not its source canvas, and turn landscape packs right.
        # Product photos (boxes/bundles) use format_product and are not rotated.
        if image.width > image.height:
            image = image.transpose(Image.Transpose.ROTATE_270)
        image = ImageOps.contain(image, self.SIZE, Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()

    def format_product(self, image_bytes):
        """Boxes and bundles retain the official product view, on a wider canvas."""
        with Image.open(BytesIO(image_bytes)) as source:
            if source.width * source.height > 25_000_000 or getattr(source, 'n_frames', 1) != 1:
                raise PackArtError('Expected one reasonably sized product image.')
            image = ImageOps.exif_transpose(source).convert('RGBA')
        box = image.getchannel('A').getbbox()
        if not box or image.getchannel('A').getextrema()[0] != 0:
            raise PackArtError('Expected a transparent product image.')
        image = image.crop(box)
        if min(image.size) < 100:
            raise PackArtError('Product image is too small.')
        image = ImageOps.contain(image, self.PRODUCT_SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', self.PRODUCT_SIZE)
        canvas.alpha_composite(image, ((canvas.width-image.width)//2, (canvas.height-image.height)//2))
        output = BytesIO()
        canvas.save(output, format='PNG', optimize=True)
        return output.getvalue()


class PackArtDownloader:
    """Reusable service; providers implement discover() and image_bytes().

    Pass the bundled pack-art directory for installation, or omit it for an
    isolated preview. Handmade images are skipped; generated fallbacks can upgrade.
    No network or database work happens at module import or on Roulette requests.
    """

    def __init__(self, output_dir, source, formatter=None, bundled_dir=None, cancel_event=None,
                 composer=None, corrector=None, stage_callback=None, label_renderer=None):
        self.output_dir = Path(output_dir)
        self.source = source
        self.formatter = formatter or PackArtFormatter()
        self.bundled_dir = Path(bundled_dir) if bundled_dir else None
        self.cancel_event = cancel_event or threading.Event()
        static_dir = Path(get_static_dir())
        self.composer = composer or PackFaceComposer(static_dir / 'img/pack_art/_fallback/packback.png', static_dir / 'fonts')
        self.corrector = corrector or PackPerspectiveCorrector()
        self.stage_callback = stage_callback or (lambda stage: None)
        self.label_renderer = label_renderer

    def existing(self, set_code, product_type):
        code = _set_code(set_code)
        if product_type not in PRODUCT_TYPES:
            raise PackArtError('Unsupported product artwork key.')
        for root in (self.output_dir, self.bundled_dir):
            if root is not None:
                for variant in (code, code.lower()):
                    path = root / variant / (product_type + '.png')
                    if path.is_file():
                        return path
        return None

    def upgrade_info(self, set_code, product_type):
        """Only generated runtime fallbacks with matching provenance can be replaced."""
        existing = self.existing(set_code, product_type)
        if existing is None or existing.parent.parent != self.output_dir or product_type not in PACK_TYPES:
            return None
        code = _set_code(set_code)
        if self.bundled_dir and any((self.bundled_dir / variant / (product_type + '.png')).is_file()
                                    for variant in (code, code.lower())):
            return None
        try:
            sidecar = existing.with_suffix('.source.json')
            if sidecar.stat().st_size > 65536:
                return None
            metadata = json.loads(sidecar.read_text(encoding='utf-8'))
            if (not isinstance(metadata, dict) or metadata.get('method') not in {'reconstructed', 'created', 'label'}
                    or metadata.get('set_code') != code or metadata.get('booster_key') != product_type
                    or metadata.get('generator') not in {None, 'deckadence-pack-art'}):
                return None
            digest = hashlib.sha256(existing.read_bytes()).hexdigest()
            if metadata.get('sha256') and metadata['sha256'] != digest:
                return None  # A user edited/replaced the generated image; keep it.
            return {'path': existing, 'method': metadata['method'], 'sha256': digest, 'design': metadata.get('design')}
        except (OSError, ValueError):
            return None

    def download_first_front(self, candidates):
        """Try alternate views of one pack type, preserving the selected provenance."""
        candidates = tuple(candidates)
        if len({(candidate.set_code, candidate.booster_key) for candidate in candidates}) != 1:
            raise PackArtError('Expected alternate views of exactly one set and pack type.')
        errors = []
        for candidate in candidates:
            if self.cancel_event.is_set():
                raise PackArtCancelled()
            try:
                return candidate, self.download(candidate)
            except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile, Image.DecompressionBombError) as exc:
                errors.append(str(exc))
        raise PackArtError('No usable front-facing view: ' + '; '.join(dict.fromkeys(errors)))

    def download_best(self, set_code, product_type, candidates, set_name=None, discovery_error='',
                      release_date='', pack_style='auto', base_color=None):
        """Original, rectified wrapper, set artwork, then a local era-based face.

        Every original view is checked before reconstruction. Keep at most three
        failed images for that second pass, avoiding repeat downloads and bounding
        memory. Boxes and bundles always use real product photos.
        """
        code = _set_code(set_code)
        existing = self.existing(code, product_type)
        upgrade = self.upgrade_info(code, product_type) if existing else None
        if existing and not upgrade:
            return {'status': 'existing', 'path': str(existing)}
        rank_limit = PACK_METHOD_RANK[upgrade['method']] if upgrade else 4
        design = PackFaceComposer.design(code, release_date, pack_style, base_color)
        refresh_design = upgrade and upgrade['method'] in {'created', 'label'} and upgrade['design'] != design
        render_options = {'release_date': release_date, 'style': pack_style, 'base_color': base_color}
        label = product_label(code, product_type)
        candidates = tuple(candidates)
        if any(c.set_code.upper() != code or c.booster_key != product_type for c in candidates):
            raise PackArtError('Expected images of exactly one set and product type.')
        errors, angled = ([discovery_error] if discovery_error else []), []
        is_pack = product_type in PACK_TYPES
        self.stage_callback('Finding front-facing pack' if is_pack else 'Downloading product image')
        for candidate in candidates:
            self._check_cancelled()
            try:
                data = self.source.image_bytes(candidate)
                if is_pack:
                    try:
                        image_bytes = (self.formatter.format_specialty(data) if code in SPECIALTY_PRODUCTS
                                       else self.formatter.format(data))
                    except ValueError:
                        if len(angled) < 3 and len(data) <= 16 * 1024 * 1024:
                            angled.append((candidate, data))
                        raise
                else:
                    image_bytes = self.formatter.format_product(data)
                return self._install(candidate, image_bytes, 'front' if is_pack else 'product', upgrade=upgrade)
            except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile, Image.DecompressionBombError) as error:
                errors.append(str(error))
        if is_pack and rank_limit > 1:
            self.stage_callback('Reconstructing pack')
            for candidate, data in angled:
                self._check_cancelled()
                try:
                    image_bytes = self.corrector.reconstruct(data)
                    return self._install(candidate, image_bytes, 'reconstructed', upgrade=upgrade)
                except (OSError, ValueError, Image.DecompressionBombError) as error:
                    errors.append(str(error))
        if is_pack and (rank_limit > 2 or (rank_limit == 2 and refresh_design)):
            self._check_cancelled()
            self.stage_callback('Creating pack from set artwork')
            asset_provider = getattr(self.source, 'construction_assets', None)
            if callable(asset_provider):
                try:
                    assets = asset_provider(code)
                    if isinstance(assets, PackArtAssets):
                        if assets.artwork.set_code != code or assets.logo.set_code != code:
                            raise PackArtError('Set artwork and logo must match the requested set.')
                        self._check_cancelled()
                        image_bytes = self.composer.from_assets(assets.artwork_bytes, assets.logo_bytes, label,
                            set_code=code, set_name=set_name or code, **render_options)
                        candidate = PackArtCandidate(code, product_type, label,
                            assets.artwork.page_url, assets.artwork.image_url, assets.artwork.archive_member)
                        return self._install(candidate, image_bytes, 'created',
                            {'artwork': asdict(assets.artwork), 'logo': asdict(assets.logo)}, upgrade=upgrade,
                            extra_metadata={'design': design})
                except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile, Image.DecompressionBombError) as error:
                    errors.append(str(error))
        self._check_cancelled()
        if existing and not (rank_limit == 3 and refresh_design):
            return {'status': 'existing', 'path': str(existing), 'method': upgrade['method'],
                    'detail': 'Existing fallback kept; no higher-priority artwork was available.'}
        if is_pack:
            self.stage_callback('Creating era-based pack')
            name = (set_name or code).strip() or code
            if self.label_renderer:
                image_bytes = self.label_renderer(code, name, label, **render_options)
            else:
                image_bytes = self.composer.from_label(name, code, label, **render_options)
            candidate = PackArtCandidate(code, product_type, label, '', '')
            detail = 'Created locally because no suitable pack photo or set artwork was available.'
            return self._install(candidate, image_bytes, 'label',
                upgrade=upgrade, extra_metadata={'set_name': name, 'note': 'Unofficial era-based pack.', 'design': design,
                                'fallback_reason': '; '.join(dict.fromkeys(errors))[:1000]}, detail=detail)
        raise PackArtError('No usable product image. ' + '; '.join(dict.fromkeys(errors)))

    def _check_cancelled(self):
        if self.cancel_event.is_set():
            raise PackArtCancelled()

    def download(self, candidate):
        code = _set_code(candidate.set_code)
        if candidate.booster_key not in PRODUCT_TYPES:
            raise PackArtError('Unsupported booster artwork key.')
        existing = self.existing(code, candidate.booster_key)
        if existing:
            return {'status': 'existing', 'path': str(existing)}

        if self.cancel_event.is_set():
            raise PackArtCancelled()
        data = self.source.image_bytes(candidate)
        is_pack = candidate.booster_key in PACK_TYPES
        image_bytes = ((self.formatter.format_specialty(data) if code in SPECIALTY_PRODUCTS else self.formatter.format(data))
                       if is_pack else self.formatter.format_product(data))
        return self._install(candidate, image_bytes, 'front' if is_pack else 'product')

    def _install(self, candidate, image_bytes, method, assets=None, upgrade=None, extra_metadata=None, detail=''):
        self._check_cancelled()
        existing = self.existing(candidate.set_code, candidate.booster_key)
        if existing and (not upgrade or existing != upgrade['path']):
            return {'status': 'existing', 'path': str(existing)}
        if upgrade:
            current = self.upgrade_info(candidate.set_code, candidate.booster_key)
            design_refresh = (current and method == current['method'] and method in {'created', 'label'}
                              and (extra_metadata or {}).get('design')
                              and extra_metadata['design'] != current['design'])
            if (not current or current['sha256'] != upgrade['sha256'] or current['method'] != upgrade['method']
                    or (PACK_METHOD_RANK[method] >= PACK_METHOD_RANK[current['method']] and not design_refresh)):
                return {'status': 'existing', 'path': str(upgrade['path'])}
        target = self.output_dir / _set_code(candidate.set_code) / (candidate.booster_key + '.png')
        if upgrade:
            target = upgrade['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation protects existing art even if another downloader won
        # the race. Delete our own incomplete file if writing fails.
        write_target = target.with_name('.pack-art-' + uuid4().hex + '.tmp') if upgrade else target
        try:
            output = write_target.open('xb')
        except FileExistsError:
            return {'status': 'existing', 'path': str(target)}
        try:
            with output:
                output.write(image_bytes)
            if upgrade:
                self._check_cancelled()
                current = self.upgrade_info(candidate.set_code, candidate.booster_key)
                if not current or current['sha256'] != upgrade['sha256'] or current['method'] != upgrade['method']:
                    return {'status': 'existing', 'path': str(target)}
                os.replace(write_target, target)
        except OSError:
            write_target.unlink(missing_ok=True)
            raise
        finally:
            if upgrade:
                write_target.unlink(missing_ok=True)
        metadata = {**asdict(candidate), 'downloaded_at': datetime.now(timezone.utc).isoformat(),
                    'method': method, 'generator': 'deckadence-pack-art',
                    'sha256': hashlib.sha256(image_bytes).hexdigest(),
                    'size': list(self.formatter.SIZE if candidate.booster_key in PACK_TYPES else self.formatter.PRODUCT_SIZE)}
        if assets:
            metadata.update(assets=assets, note='Unofficial pack face assembled from official set assets.')
        metadata.update(extra_metadata or {})
        target.with_suffix('.source.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
        return {'status': 'downloaded', 'path': str(target), 'method': method, 'upgraded': bool(upgrade), 'detail': detail}


def pack_art_catalog(database_path=DATABASE_PATH):
    """Read imported physical booster sets once per manual job; no database writes."""
    with closing(sqlite3.connect(Path(database_path).resolve().as_uri() + '?mode=ro', uri=True)) as conn:
        rows = conn.execute('''SELECT s.set_code, s.set_name, s.release_date, b.booster_name
            FROM sets s JOIN chaos_booster_variants b ON b.set_code=s.set_code
            WHERE b.booster_weight > 0
            GROUP BY s.set_code, b.booster_name ORDER BY s.release_date DESC, s.set_name''').fetchall()
    sets = {}
    aliases = {'collector-sample': 'sample'}
    for code, name, released, booster in rows:
        key = aliases.get(booster, booster)
        # "default" is also used by non-pack products. Only include verified boosters.
        if key not in PACK_TYPES or (key == 'default' and code.upper() not in SPECIALTY_PRODUCTS):
            continue
        try:
            code = _set_code(code)
        except PackArtError:
            continue
        item = sets.setdefault(code, {'set_code': code, 'set_name': name, 'release_date': released, 'pack_types': []})
        if key not in item['pack_types']:
            item['pack_types'].append(key)
    return list(sets.values())


def product_art_relpath(set_code, product_type, static_folder, runtime_dir=RUNTIME_PACK_ART_DIR):
    """Local-only lookup for simulator products; never schedules a download."""
    try:
        path = PackArtDownloader(runtime_dir, None, bundled_dir=get_pack_art_dir(static_folder)).existing(set_code, product_type)
    except PackArtError:
        return None
    if path:
        for root, prefix in ((Path(runtime_dir), 'data/img/pack_art/'),
                             (Path(get_pack_art_dir(static_folder)), 'img/pack_art/')):
            try:
                return prefix + path.relative_to(root).as_posix()
            except ValueError:
                continue
    return None


class PackArtJobs:
    """One user-started worker. No requests, downloads or polling during gameplay."""

    def __init__(self, output_dir=RUNTIME_PACK_ART_DIR, bundled_dir=None, catalog=pack_art_catalog,
                 source_factory=WpnPackArtSource, label_renderer=None):
        self.output_dir = Path(output_dir)
        self.bundled_dir = Path(bundled_dir) if bundled_dir else Path(get_pack_art_dir(get_static_dir()))
        self.catalog = catalog
        self.source_factory = source_factory
        self.label_renderer = label_renderer
        self.lock = threading.RLock()
        self.cancel_event = threading.Event()
        self.worker = None
        self.clear_plan = None
        self.results = []
        self.state = {'state': 'idle', 'job_id': '', 'stage': 'Ready', 'message': 'Choose products and start a download.',
                      'total_sets': 0, 'completed_sets': 0, 'downloaded': 0, 'existing': 0,
                      'unavailable': 0, 'bytes_received': 0, 'error': ''}

    @property
    def busy(self):
        with self.lock:
            return self.state['state'] in {'running', 'cancelling'}

    def status(self, after=0, job_id=''):
        with self.lock:
            offset = max(0, min(after, len(self.results))) if job_id == self.state['job_id'] else 0
            return {**self.state, 'results': copy.deepcopy(self.results[offset:]), 'cursor': len(self.results)}

    def _update(self, **changes):
        with self.lock:
            if self.state['state'] == 'cancelling' and 'state' not in changes:
                return
            self.state.update(changes)

    def _progress(self, bytes_received=0):
        with self.lock:
            self.state['bytes_received'] += bytes_received

    def preview_clear_generated(self, set_codes=None, product_types=None):
        """Prepare a specific, reviewable selection; photos and user edits are protected."""
        if not isinstance(set_codes, (list, type(None))) or len(set_codes or []) > 1000 or any(
                not isinstance(code, str) for code in (set_codes or [])):
            raise ValueError('Choose a valid list of set codes.')
        codes = {_set_code(code) for code in (set_codes or [])}
        if not isinstance(product_types, list) or not product_types or any(
                not isinstance(key, str) or key not in PRODUCT_TYPES for key in product_types):
            raise ValueError('Choose at least one supported product type.')
        with self.lock:
            if self.busy:
                raise ValueError('Wait for the pack download to finish before clearing generated faces.')
            downloader = PackArtDownloader(self.output_dir, None, bundled_dir=self.bundled_dir)
            root = self.output_dir.resolve()
            entries = []
            for sidecar in sorted(self.output_dir.glob('*/*.source.json')):
                code, key = sidecar.parent.name.upper(), sidecar.name.removesuffix('.source.json')
                if (codes and code not in codes) or key not in product_types or key not in PACK_TYPES:
                    continue
                try:
                    info = downloader.upgrade_info(code, key)
                    if (not info or info['method'] not in {'created', 'label'}
                            or info['path'].with_suffix('.source.json') != sidecar
                            or info['path'].is_symlink() or sidecar.is_symlink()
                            or info['path'].resolve().parent.parent != root or sidecar.resolve().parent.parent != root):
                        continue
                    entries.append({**info, 'sidecar_sha256': hashlib.sha256(sidecar.read_bytes()).hexdigest()})
                except (OSError, ValueError):
                    continue
            token = uuid4().hex
            self.clear_plan = {'token': token, 'created': time.monotonic(), 'entries': entries}
            return {'count': len(entries), 'token': token}

    def clear_generated(self, token):
        """Move only the confirmed, unchanged generated faces out of active use."""
        with self.lock:
            if self.busy:
                raise ValueError('Wait for the pack download to finish before clearing generated faces.')
            plan = self.clear_plan
            if not plan or token != plan['token'] or time.monotonic()-plan['created'] > 600:
                raise ValueError('The selection expired. Preview the generated faces again.')
            self.clear_plan = None
            downloader = PackArtDownloader(self.output_dir, None, bundled_dir=self.bundled_dir)
            root = self.output_dir.resolve()
            archive = root / '.cleared' / uuid4().hex
            if not archive.resolve().is_relative_to(root):
                raise ValueError('The cleared-image archive must be inside the pack artwork folder.')
            cleared, skipped, failed = 0, 0, 0
            for entry in plan['entries']:
                path = entry['path']
                sidecar = path.with_suffix('.source.json')
                destination = archive / path.parent.name / path.name
                moved = False
                try:
                    current = downloader.upgrade_info(path.parent.name, path.stem)
                    if (not current or current['method'] not in {'created', 'label'}
                            or current['sha256'] != entry['sha256']
                            or hashlib.sha256(sidecar.read_bytes()).hexdigest() != entry['sidecar_sha256']
                            or path.is_symlink() or sidecar.is_symlink()
                            or path.resolve().parent.parent != root or sidecar.resolve().parent.parent != root):
                        skipped += 1
                        continue
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(path, destination)
                    moved = True
                    os.replace(sidecar, destination.with_suffix('.source.json'))
                    cleared += 1
                except OSError:
                    # Keep the pair active if moving its source record fails.
                    if moved and not path.exists():
                        os.replace(destination, path)
                    failed += 1
            self.results = []
            message = f'{cleared} generated faces cleared. Download again to rebuild them.'
            if skipped or failed:
                message += f' {skipped} changed files kept; {failed} files could not be cleared.'
            self.state = {'state': 'idle', 'job_id': uuid4().hex, 'stage': 'Generated faces cleared',
                          'message': message, 'total_sets': 0, 'completed_sets': 0, 'downloaded': 0,
                          'existing': 0, 'unavailable': 0, 'bytes_received': 0, 'error': ''}
            return {'cleared': cleared, 'skipped': skipped, 'failed': failed}

    def start(self, set_codes=None, product_types=None, pack_style='auto', base_color=None):
        PackFaceComposer.design(style=pack_style, base_color=base_color)
        if not isinstance(set_codes, (list, type(None))) or (set_codes and len(set_codes) > 1000):
            raise ValueError('Choose a valid list of set codes.')
        codes = {_set_code(code) for code in (set_codes or []) if isinstance(code, str)}
        if set_codes and len([code for code in set_codes if isinstance(code, str)]) != len(set_codes):
            raise ValueError('Set codes must be text.')
        if not isinstance(product_types, list) or not product_types or any(
            not isinstance(key, str) or key not in PRODUCT_TYPES for key in product_types
        ):
            raise ValueError('Choose at least one supported product type.')
        types = [key for key in PRODUCT_TYPES if key in product_types]  # packs before boxes and bundles
        catalog = self.catalog()
        unknown = codes - {item['set_code'] for item in catalog}
        if unknown:
            raise ValueError('No imported booster definitions for: ' + ', '.join(sorted(unknown)))
        selected = [item for item in catalog if not codes or item['set_code'] in codes]
        if not selected:
            raise ValueError('Download the card database before downloading pack art.')
        with self.lock:
            if self.busy:
                raise ValueError('A pack download is already running.')
            self.clear_plan = None
            self.cancel_event = threading.Event()
            self.results = []
            self.state = {'state': 'running', 'job_id': uuid4().hex, 'stage': 'Starting', 'message': 'Checking existing artwork…',
                          'total_sets': len(selected), 'completed_sets': 0, 'downloaded': 0, 'existing': 0,
                          'unavailable': 0, 'bytes_received': 0, 'error': '', 'started_at': time.time(),
                          'product_types': types, 'set_codes': sorted(codes), 'pack_style': pack_style, 'base_color': base_color}
            self.worker = threading.Thread(target=self._run, args=(selected, types), name='deckadence-pack-art', daemon=True)
            try:
                self.worker.start()
            except Exception:
                self.state.update(state='failed', stage='Failed', error='Could not start the download worker.')
                raise
            return self.state['job_id']

    def cancel(self, job_id):
        with self.lock:
            if self.state['job_id'] != job_id or not self.busy:
                raise ValueError('There is no matching download to cancel.')
            self.cancel_event.set()
            self.state.update(state='cancelling', stage='Cancelling',
                              message='Stopping the current request. Completed downloads will be kept.')

    def _check_cancelled(self):
        if self.cancel_event.is_set():
            raise PackArtCancelled()

    def _record(self, item, key, status, detail='', path=None, method='', upgraded=False):
        result = {'set_code': item['set_code'], 'set_name': item['set_name'], 'product_type': key,
                  'label': product_label(item['set_code'], key), 'status': status, 'detail': detail, 'method': method, 'upgraded': upgraded}
        if path:
            path = Path(path).resolve()
            for location, root in (('runtime', self.output_dir), ('bundled', self.bundled_dir)):
                try:
                    result.update(location=location, image_path=path.relative_to(root.resolve()).as_posix())
                    break
                except ValueError:
                    continue
        with self.lock:
            self.results.append(result)
            self.state[status] += 1

    def _run(self, selected, types):
        try:
            for item in selected:
                self._check_cancelled()
                code = item['set_code']
                # Do not request nonexistent pack types (e.g. Play packs for Kaldheim).
                wanted = [key for key in types if key not in PACK_TYPES or key in item['pack_types']]
                with closing(self.source_factory(cancel_event=self.cancel_event, progress=self._progress)) as source:
                    downloader = PackArtDownloader(self.output_dir, source, bundled_dir=self.bundled_dir,
                        cancel_event=self.cancel_event, stage_callback=lambda stage: self._update(stage=stage),
                        label_renderer=self.label_renderer)
                    missing = []
                    for key in wanted:
                        self._check_cancelled()
                        existing = downloader.existing(code, key)
                        if existing and not downloader.upgrade_info(code, key):
                            self._record(item, key, 'existing', 'Existing artwork kept.', existing)
                        else:
                            missing.append(key)
                    if missing:
                        self._update(stage='Finding images', message=f"{item['set_name']} ({code})")
                        discovery_error = ''
                        try:
                            candidates = source.discover(code, item['set_name'])
                        except PackArtCancelled:
                            raise
                        except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile) as error:
                            self._check_cancelled()
                            candidates, discovery_error = [], str(error)
                        for key in missing:
                            self._check_cancelled()
                            self._update(stage='Downloading', message=f"{item['set_name']} · {PRODUCT_TYPES[key]}")
                            options = [candidate for candidate in candidates if candidate.booster_key == key]
                            try:
                                result = downloader.download_best(code, key, options, item['set_name'], discovery_error,
                                    release_date=item.get('release_date', ''), pack_style=self.state['pack_style'],
                                    base_color=self.state['base_color'])
                                self._record(item, key, result['status'], path=result['path'], method=result.get('method', ''),
                                    detail=result.get('detail', ''), upgraded=result.get('upgraded', False))
                            except PackArtCancelled:
                                raise
                            except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile, Image.DecompressionBombError) as error:
                                self._check_cancelled()
                                self._record(item, key, 'unavailable', (discovery_error or str(error))[:500])
                with self.lock:
                    self.state['completed_sets'] += 1
            self._check_cancelled()
            self._update(state='complete', stage='Complete', message='Finished checking the selected sets.', finished_at=time.time())
        except PackArtCancelled:
            self._update(state='cancelled', stage='Cancelled', message='Completed images are saved. Start again to download the remaining images.', finished_at=time.time())
        except Exception as error:
            logging.getLogger(__name__).exception('Pack artwork download failed')
            self._update(state='failed', stage='Failed', message='Completed images are saved.', error=str(error)[:500], finished_at=time.time())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sets', nargs='+', help='Set codes already imported into Deckadence (e.g. FIN KHM).')
    parser.add_argument('--set-name', help='Set name when the database is unavailable (one set only).')
    parser.add_argument('--page-url', help='Explicit WPN English product URL for an unusual slug (one set only).')
    parser.add_argument('--release-date', default='', help='Release date for automatic era selection without the database.')
    parser.add_argument('--pack-style', choices=PackFaceComposer.STYLES, default='auto', help='Generated fallback design.')
    parser.add_argument('--base-color', help='Optional generated-wrapper color, e.g. #454474.')
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument('--output', type=Path, help='Download previews into this directory; otherwise only list sources.')
    destination.add_argument('--install', action='store_true', help='Fill missing runtime pack art; preserve bundled and downloaded images.')
    args = parser.parse_args(argv)
    if len(args.sets) != 1 and (args.set_name or args.page_url):
        parser.error('--set-name and --page-url require exactly one set code.')
    failed = False
    with closing(WpnPackArtSource()) as source:
        downloader = PackArtDownloader(
            RUNTIME_PACK_ART_DIR if args.install else args.output or '.', source,
            bundled_dir=get_pack_art_dir(get_static_dir()) if args.install else None,
        )
        for value in args.sets:
            try:
                code = _set_code(value)
                name = args.set_name
                released = args.release_date
                if not name:
                    uri = Path(DATABASE_PATH).resolve().as_uri() + '?mode=ro'
                    with closing(sqlite3.connect(uri, uri=True)) as conn:
                        row = conn.execute('SELECT set_name, release_date FROM sets WHERE upper(set_code)=?', (code,)).fetchone()
                    if not row:
                        raise PackArtError('Set not found; provide --set-name or import the card database first.')
                    name = row[0]
                    released = released or row[1]
                candidates = source.discover(code, name, args.page_url)
                if not candidates:
                    raise PackArtError('No supported individual booster images were found on this page.')
                groups = {}
                for candidate in candidates:
                    groups.setdefault(candidate.booster_key, []).append(candidate)
                for variants in groups.values():
                    candidate = variants[0]
                    try:
                        if args.install or args.output:
                            result = downloader.download_best(code, candidate.booster_key, variants, set_name=name,
                                release_date=released, pack_style=args.pack_style, base_color=args.base_color)
                            print(json.dumps({'set_code': code, 'booster_key': candidate.booster_key, **result}))
                        else:
                            for candidate in variants:
                                print(json.dumps({**asdict(candidate), 'status': 'discovered'}))
                    except (OSError, ValueError, requests.RequestException, zipfile.BadZipFile, Image.DecompressionBombError) as exc:
                        failed = True
                        print(json.dumps({**asdict(candidate), 'status': 'error', 'error': str(exc)}))
            except (OSError, ValueError, sqlite3.Error, requests.RequestException, zipfile.BadZipFile) as exc:
                failed = True
                print(json.dumps({'set_code': value, 'status': 'error', 'error': str(exc)}))
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
