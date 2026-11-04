"""Restart-safe, in-process Secret Lair discovery for the local application."""
import json
import logging
import re
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta
from urllib.parse import urljoin, urlparse

import requests
import yaml
from bs4 import BeautifulSoup

from db.database import get_db_connection
from db.secret_lair import (MTGJSON_URL, SEALED_URL, ensure_schema, edition_for,
                            import_printings, import_products, import_announced_cards,
                            is_individual, upsert, sync_price_products)

LOG = logging.getLogger(__name__)
ANNOUNCEMENTS_URL = 'https://magic.wizards.com/en/news/announcements'
STORE_URL = 'https://secretlair.wizards.com/us/en/'
WIKI_URL = 'https://mtg.wiki/page/Secret_Lair/Drop_Series'
DEFAULT_SCHEDULE = {'enabled': True, 'mode': 'interval', 'hours': 72,
                    'days': [0, 4], 'at': '09:00', 'startup': True}


def ensure_sync_schema(conn):
    ensure_schema(conn)
    conn.execute('''CREATE TABLE IF NOT EXISTS secret_lair_settings (
        id INTEGER PRIMARY KEY CHECK(id=1), schedule_json TEXT NOT NULL, lease_until REAL NOT NULL DEFAULT 0,
        default_revision INTEGER NOT NULL DEFAULT 1, announcement_revision INTEGER NOT NULL DEFAULT 0)''')
    conn.execute('''CREATE TABLE IF NOT EXISTS secret_lair_documents (
        url TEXT PRIMARY KEY, body TEXT NOT NULL, etag TEXT, modified TEXT)''')
    conn.execute('INSERT OR IGNORE INTO secret_lair_settings(id,schedule_json) VALUES (1,?)',
                 (json.dumps(DEFAULT_SCHEDULE),))
    columns = {r[1] for r in conn.execute('PRAGMA table_info(secret_lair_settings)')}
    for column in ('default_revision', 'announcement_revision'):
        if column not in columns:
            conn.execute(f'ALTER TABLE secret_lair_settings ADD COLUMN {column} INTEGER NOT NULL DEFAULT 0')
    row = conn.execute('SELECT * FROM secret_lair_settings WHERE id=1').fetchone()
    if not row['default_revision']:
        if json.loads(row['schedule_json']) == {**DEFAULT_SCHEDULE, 'hours': 6}:
            conn.execute('UPDATE secret_lair_settings SET schedule_json=? WHERE id=1', (json.dumps(DEFAULT_SCHEDULE),))
        conn.execute('UPDATE secret_lair_settings SET default_revision=1 WHERE id=1')
    if not row['announcement_revision']:
        # Upgrade already-downloaded announcements immediately, without a network wait.
        cached = conn.execute('SELECT body FROM secret_lair_documents WHERE url=?', (MTGJSON_URL,)).fetchone()
        if cached:
            import_printings(conn, json.loads(cached['body'])['data'])
        for doc in conn.execute("SELECT url,body FROM secret_lair_documents WHERE url LIKE 'https://magic.wizards.com/%/news/%'").fetchall():
            for record in announced_drops(doc['body'], doc['url']):
                import_announced_cards(conn, record)
                upsert(conn, record, 'wizards-announcements', doc['url'], 20)
        conn.execute('UPDATE secret_lair_settings SET announcement_revision=1 WHERE id=1')


def validate_schedule(data):
    if not isinstance(data, dict) or set(data) != set(DEFAULT_SCHEDULE):
        raise ValueError('Provide the complete Secret Lair update schedule.')
    if any(type(data[k]) is not bool for k in ('enabled', 'startup')):
        raise ValueError('Enabled and startup must be true or false.')
    if data['mode'] not in {'interval', 'weekdays'} or type(data['hours']) is not int or not 1 <= data['hours'] <= 720:
        raise ValueError('Choose an interval from 1 to 720 hours or specific weekdays.')
    if (not isinstance(data['days'], list) or not data['days'] or len(data['days']) > 7
            or any(type(d) is not int or d not in range(7) for d in data['days'])):
        raise ValueError('Choose one or more weekdays (Monday=0 through Sunday=6).')
    if not isinstance(data['at'], str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', data['at']):
        raise ValueError('Enter a local time in HH:MM format.')
    return {**data, 'days': sorted(set(data['days']))}


def due(schedule, last_success, last_attempt, now=None):
    # Naive local datetimes use the OS timezone rules when timestamp() resolves
    # a previous scheduled day, including daylight-saving transitions.
    now = now or datetime.now()
    if not schedule['enabled'] or (last_attempt and now.timestamp() - last_attempt < 3600):
        return False
    if schedule['mode'] == 'interval':
        return now.timestamp() - last_success >= schedule['hours'] * 3600
    hour, minute = map(int, schedule['at'].split(':'))
    # The most recent scheduled occurrence also handles missed days while closed.
    for offset in range(8):
        candidate = (now - timedelta(days=offset)).replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate.weekday() in schedule['days'] and candidate <= now:
            return last_success < candidate.timestamp()
    return False


def soup(html):
    return BeautifulSoup(html, 'html.parser')


def official_art_url(url):
    parsed = urlparse(url or '')
    return url if parsed.scheme == 'https' and parsed.hostname in {
        'media.wizards.com', 'media.dndbeyond.com', 'images.ctfassets.net', 'cdn-prod.scalefast.com'} else ''


def artwork_url(url):
    return official_art_url(url) or (url if re.fullmatch(
        r'https://api\.scryfall\.com/cards/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
        r'\?format=image&version=art_crop', url or '') else '')


def page_background(doc):
    for element in doc.select('[style]'):
        match = re.search(r'background(?:-image)?\s*:[^;]*url\([\"\']?([^\"\')]+)', element.get('style', ''), re.I)
        if match and official_art_url(match[1]):
            return match[1]
    return ''


def official_links(html, base, products=False):
    urls = []
    for a in soup(html).select('a[href]'):
        url = urljoin(base, a['href']).split('#')[0].split('?')[0]
        parsed = urlparse(url)
        if products:
            match = re.search(r'/product/(\d+)', parsed.path)
            if parsed.hostname == 'secretlair.wizards.com' and match:
                url = f'https://secretlair.wizards.com/us/en/product/{match[1]}'
            else:
                continue
        elif parsed.hostname not in {'magic.wizards.com', 'www.magic.wizards.com'} or not (
                '/en/news/' in parsed.path and ('secret-lair' in parsed.path or 'extra-life' in parsed.path)):
            continue
        if url not in urls:
            urls.append(url)
    return urls


def announced_release(text):
    # Use a sale/release statement, never the article publication date.
    pattern = (r'(?:arrives?|launch(?:es)?|releases?|available|on sale|go(?:es)? on sale)'
               r'.{0,70}?\b(January|February|March|April|May|June|July|August|September|October|November|December)'
               r'\s+(\d{1,2}),?\s+(20\d{2})')
    match = re.search(pattern, text, re.I)
    if match:
        try:
            return datetime.strptime(' '.join(match.groups()), '%B %d %Y').date().isoformat()
        except ValueError:
            pass
    return ''


def revealed_cards(elements):
    """Pair the scoped Contents list with its official card gallery."""
    cards, images, in_contents = [], {}, False
    def key(text):
        text = soup(text).get_text(' ', strip=True)
        text = re.sub(r'\s+as\s+[\"“].*|\s*\(Reversible\)', '', text, flags=re.I)
        return re.sub(r'\s+', ' ', text).strip().replace('’', "'")
    for el in elements:
        tag = getattr(el, 'name', None)
        if tag == 'magic-card' and el.get('face'):
            images.setdefault(key(el.get('caption', '')), []).append(
                {'image': el['face'], 'back': el.get('back', '')})
        elif tag in {'p', 'h3', 'h4', 'strong', 'b'}:
            text = el.get_text(' ', strip=True)
            if re.fullmatch(r'Contents\s*:?', text, re.I):
                in_contents = True
            elif re.match(r'^(?:Price|Disclaimer)\b', text, re.I):
                in_contents = False
        elif tag == 'li' and in_contents:
            match = re.fullmatch(r'(\d+)\s*[x×]\s+(.+)', el.get_text(' ', strip=True), re.I)
            if match:
                name = key(match[2])
                # Only the explicit main list is used. Promos elsewhere in the
                # announcement cannot enter a drop's recipe.
                cards.append({'name': name, 'count': int(match[1])})
    if not cards or sum(c['count'] for c in cards) > 100:
        return []
    result = []
    for card in cards:
        matches = list({i['image']: i for i in images.get(card['name'], [])}.values())
        if len(matches) == 1:
            result.append({**card, **matches[0]})
        elif len(matches) == card['count']:
            result.extend({**card, **img, 'count': 1} for img in matches)
        else:
            return []  # No substitute artwork from another printing.
    return result


def announced_drops(html, url):
    """Only priced drop sections with explicit contents; never article-wide promos."""
    doc = soup(html)
    main = doc.select_one('article') or doc.select_one('main') or doc
    release = announced_release(main.get_text(' ', strip=True))
    art = doc.find('meta', property='og:image')
    art_url = official_art_url(art.get('content', '')) if art else ''
    background = page_background(main)
    result = []
    for heading in main.select('h2,h3'):
        title = heading.get_text(' ', strip=True)
        if not title or not is_individual(title) or 'secret lair' not in main.get_text(' ', strip=True).lower():
            continue
        parts, elements = [], []
        for element in heading.next_elements:
            if getattr(element, 'name', None) in {'h2', 'h3'} and not re.fullmatch(
                    r'(?:Contents|Price)\s*:?', element.get_text(' ', strip=True), re.I):
                break
            elements.append(element)
            if getattr(element, 'name', None) in {'p', 'li'}:
                parts.append(element.get_text(' ', strip=True))
        text = ' '.join(parts)
        if not re.search(r'\bcontents\b', text, re.I) or not re.search(r'\d+\s*x\s+\w', text, re.I):
            continue
        editions = []
        for match in re.finditer(r'\b(non[ -]?foil|(?:rainbow |traditional |etched |galaxy |surge )?foil)\s*:\s*\$', text, re.I):
            editions.append(edition_for(match[1]))
        for edition in dict.fromkeys(editions or ['unknown']):
            cards = [{**c, 'finish': 'normal' if edition == 'nonfoil' else 'etched' if edition == 'etched-foil' else 'foil'}
                     for c in revealed_cards(elements)] if edition != 'unknown' else []
            result.append({'name': title, 'edition': edition,
                           'release_date': release, 'announced_cards': cards,
                           'art_url': background or (cards[0]['image'] if cards else art_url),
                           'art_crop': 'card' if cards and not background else 'marketing',
                           'announced_contents': text[:3500], 'content_note': 'The revealed card images are being added. Refresh the catalog to check again.'})
    return result


def listed_drop(html, url):
    doc = soup(html)
    for script in doc.find_all('script', type='application/ld+json'):
        try:
            obj = json.loads(script.get_text())
        except (TypeError, ValueError):
            continue
        for product in obj if isinstance(obj, list) else [obj]:
            if not isinstance(product, dict) or product.get('@type') not in {'Product', 'Thing'}:
                continue
            name = product.get('name', '')
            if not name or not is_individual(name) or not doc.select_one('#collapseLong'):
                continue
            # The store's og:image is usually a box/card montage, not background
            # art. Keep the announcement's illustration instead of stamping
            # that montage (and its logos) across a wrapper.
            background = page_background(doc.select_one('#product') or doc.select_one('main') or doc)
            return [{'name': name, 'edition': edition_for(name, default='nonfoil'), 'product_url': url,
                     **({'art_url': background, 'art_crop': 'marketing'} if background else {}),
                     'content_note': 'Listed by Wizards; exact printings are not yet available.'}]
    return []


def wiki_drops(html):
    """Supplementary discovery only. The bonus/promos tables are not card recipes."""
    result = []
    for table in soup(html).select('table.wikitable'):
        headers = [h.get_text(' ', strip=True).lower() for h in table.find('tr').find_all('th', recursive=False)]
        if 'drop' not in headers or not any('non-foil' in h for h in headers):
            continue
        # Expand spans so a shared release date cannot shift edition price columns.
        spans = {}
        rows = (table.find('tbody', recursive=False) or table).find_all('tr', recursive=False)
        for tr in rows[1:]:
            cells, col = {}, 0
            for index, (remaining, text) in list(spans.items()):
                cells[index] = text
                if remaining == 1:
                    del spans[index]
                else:
                    spans[index] = (remaining - 1, text)
            for td in tr.find_all(['td', 'th'], recursive=False):
                while col in cells:
                    col += 1
                for _ in range(int(td.get('colspan', 1))):
                    text = td.get_text(' ', strip=True)
                    cells[col] = text
                    if int(td.get('rowspan', 1)) > 1:
                        spans[col] = (int(td['rowspan']) - 1, text)
                    col += 1
            name = cells.get(headers.index('drop'), '')
            if (not name or not is_individual(name) or not re.fullmatch(r'\d+', cells.get(0, ''))
                    or 'commander' in str(tr).lower() or tr.find('ul')):
                continue
            release = next((cells.get(i, '') for i, h in enumerate(headers) if 'release' in h), '')
            release = re.search(r'\d{4}-\d{2}-\d{2}', release)
            editions = [('nonfoil' if 'non-foil' in h else 'foil') for i, h in enumerate(headers)
                        if 'price' in h and '$' in cells.get(i, '')]
            numbers = []
            raw_numbers = cells.get(headers.index('sld#'), '') if 'sld#' in headers else ''
            match = re.fullmatch(r'(\d+)\s*[-–]\s*(\d+)', raw_numbers)
            if match and 0 <= int(match[2]) - int(match[1]) <= 100:
                numbers = [str(n) for n in range(int(match[1]), int(match[2]) + 1)]
            for edition in dict.fromkeys(editions or ['unknown']):
                if edition == 'foil':
                    edition = edition_for(name, default='foil')
                result.append({'name': name, 'edition': edition, 'release_date': release[0] if release else '',
                               'collector_numbers': numbers,
                               'content_note': 'Listed by MTG Wiki; exact printings are not yet available.'})
    return result


class SecretLairSync:
    def __init__(self, connect=get_db_connection, fetch=None, clock=time.time):
        self.connect, self.fetch_override, self.clock = connect, fetch, clock
        self.lock, self.start_lock = threading.Lock(), threading.Lock()
        self.art_lock, self.art_failures = threading.Lock(), {}
        self.stop = threading.Event()
        self.thread = None

    def artwork(self, url):
        """Cache official art or an exact printing's illustration across editions."""
        if not artwork_url(url):
            return None
        with self.art_lock:
            with closing(self.connect()) as conn:
                row = conn.execute('SELECT image FROM secret_lair_artwork WHERE url=?', (url,)).fetchone()
            if row:
                return row[0]
            if url in self.art_failures and self.clock() - self.art_failures[url] < 3600:
                return None
            try:
                with requests.get(url, timeout=(5, 15), stream=True,
                                  headers={'User-Agent': 'Deckadence/SecretLairCatalog', 'Accept': 'image/*'}) as response:
                    response.raise_for_status()
                    chunks, size = [], 0
                    for chunk in response.iter_content(65536):
                        size += len(chunk)
                        if size > 8 * 1024 * 1024:
                            raise ValueError('Marketing image exceeds the download limit.')
                        chunks.append(chunk)
                image = b''.join(chunks)
                from modes.pack_art_rendering import read_image
                read_image(image)  # Validate the image before keeping it in the cache.
                with closing(self.connect()) as conn, conn:
                    conn.execute('INSERT OR REPLACE INTO secret_lair_artwork VALUES (?,?,?)', (url, image, self.clock()))
                return image
            except Exception:
                self.art_failures[url] = self.clock()
                LOG.warning('Secret Lair artwork could not be downloaded: %s', url)
                return None

    def status(self):
        with closing(self.connect()) as conn, conn:
            ensure_sync_schema(conn)
            settings = conn.execute('SELECT * FROM secret_lair_settings WHERE id=1').fetchone()
            return {'schedule': json.loads(settings['schedule_json']), 'running': settings['lease_until'] > self.clock(),
                    'sources': [dict(r) for r in conn.execute('SELECT * FROM secret_lair_sync ORDER BY source')]}

    def configure(self, data):
        data = validate_schedule(data)
        with closing(self.connect()) as conn, conn:
            ensure_sync_schema(conn)
            conn.execute('UPDATE secret_lair_settings SET schedule_json=? WHERE id=1', (json.dumps(data),))
        return self.status()

    def fetch(self, url):
        if self.fetch_override:
            return self.fetch_override(url)
        with closing(self.connect()) as conn:
            row = conn.execute('SELECT * FROM secret_lair_documents WHERE url=?', (url,)).fetchone()
        headers = {'User-Agent': 'Deckadence/SecretLairCatalog', 'Accept': 'application/json,text/html,text/plain'}
        if row:
            if row['etag']:
                headers['If-None-Match'] = row['etag']
            if row['modified']:
                headers['If-Modified-Since'] = row['modified']
        with requests.get(url, headers=headers, timeout=(10, 40), stream=True) as response:
            if response.status_code == 304 and row:
                return row['body']
            response.raise_for_status()
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > 25 * 1024 * 1024:
                    raise ValueError('Source exceeded the download limit.')
                chunks.append(chunk)
            body = b''.join(chunks).decode('utf-8-sig')
            with closing(self.connect()) as conn, conn:
                conn.execute('INSERT OR REPLACE INTO secret_lair_documents VALUES (?,?,?,?)',
                             (url, body, response.headers.get('ETag'), response.headers.get('Last-Modified')))
            return body

    def refresh(self):
        if not self.lock.acquire(blocking=False):
            return False
        claimed = False
        try:
            with closing(self.connect()) as conn, conn:
                ensure_sync_schema(conn)
                now = self.clock()
                claimed = conn.execute('UPDATE secret_lair_settings SET lease_until=? WHERE id=1 AND lease_until<=?',
                                       (now + 1800, now)).rowcount == 1
            if not claimed:
                return False
            self._run_sources()
            return True
        finally:
            if claimed:
                with closing(self.connect()) as conn, conn:
                    conn.execute('UPDATE secret_lair_settings SET lease_until=0 WHERE id=1')
            self.lock.release()

    def _run_sources(self):
        data = {}
        def discover(records, source, url, priority):
            with closing(self.connect()) as conn, conn:
                for record in records:
                    import_announced_cards(conn, record)
                    upsert(conn, record, source, url, priority, self.clock())
            return len(records)

        def announcements():
            index = self.fetch(ANNOUNCEMENTS_URL)
            links = official_links(index, ANNOUNCEMENTS_URL)
            if not links:
                raise ValueError('No Secret Lair announcement links found; the source layout may have changed.')
            count, seen = 0, set()
            # Announcement indexes rotate quickly. Keep known article URLs and
            # follow related announcements (e.g. a delay linking the reveal).
            with closing(self.connect()) as conn:
                links.extend(r[0] for r in conn.execute("SELECT DISTINCT url FROM secret_lair_sources WHERE source='wizards-announcements'") if r[0] not in links)
            for url in links:
                if url in seen:
                    continue
                seen.add(url)
                html = self.fetch(url)
                count += discover(announced_drops(html, url), 'wizards-announcements', url, 20)
                links.extend(u for u in official_links(html, url) if u not in links)
                if len(seen) >= 30:
                    break
            return count

        def store():
            links = official_links(self.fetch(STORE_URL), STORE_URL, True)
            if not links:
                raise ValueError('No official product links found; the source layout may have changed.')
            count, seen = 0, set()
            # Follow edition links as well as home-page products, within a bounded crawl.
            for url in links:
                if url in seen:
                    continue
                seen.add(url)
                html = self.fetch(url)
                count += discover(listed_drop(html, url), 'wizards-store', url, 30)
                if len(seen) < 30:
                    links.extend(u for u in official_links(html, url, True) if u not in links)
                if len(seen) >= 30:
                    break
            return count

        def mtgjson():
            value = json.loads(self.fetch(MTGJSON_URL))['data']
            if value.get('code') != 'SLD' or not value.get('sealedProduct') or not value.get('cards'):
                raise ValueError('MTGJSON returned incomplete SLD data.')
            data['SLD'] = value
            with closing(self.connect()) as conn, conn:
                import_printings(conn, value)
                return import_products(conn, data)

        def sealed():
            raw = yaml.safe_load(self.fetch(SEALED_URL))
            if not isinstance(raw, dict) or not isinstance(raw.get('products'), dict) or not raw['products']:
                raise ValueError('The sealed-product definitions are incomplete.')
            if not data:
                with closing(self.connect()) as conn:
                    cached = conn.execute('SELECT body FROM secret_lair_documents WHERE url=?', (MTGJSON_URL,)).fetchone()
                if cached:
                    data['SLD'] = json.loads(cached[0])['data']
            with closing(self.connect()) as conn, conn:
                return import_products(conn, data, [{'name': name, **p} for name, p in raw['products'].items()],
                                       'mtg-sealed-content', SEALED_URL)

        def wiki():
            found = wiki_drops(self.fetch(WIKI_URL))
            if not found:
                raise ValueError('The Wiki drop table could not be read; the source layout may have changed.')
            return discover(found, 'mtg-wiki', WIKI_URL, 10)

        success = False
        for source, operation in [('wizards-announcements', announcements), ('wizards-store', store),
                                  ('mtgjson', mtgjson), ('mtg-sealed-content', sealed), ('mtg-wiki', wiki)]:
            now, error, count = self.clock(), '', 0
            with closing(self.connect()) as conn, conn:
                conn.execute('UPDATE secret_lair_settings SET lease_until=? WHERE id=1', (now + 1800,))
            try:
                count = operation()
                success = True
            except Exception as exc:
                error = str(exc)[:500]
                LOG.warning('Secret Lair source %s failed: %s', source, error)
            with closing(self.connect()) as conn, conn:
                conn.execute('''INSERT INTO secret_lair_sync VALUES (?,?,?,?,?) ON CONFLICT(source)
                    DO UPDATE SET attempted_at=excluded.attempted_at,
                    succeeded_at=CASE WHEN excluded.error='' THEN excluded.succeeded_at ELSE secret_lair_sync.succeeded_at END,
                    error=excluded.error,count=excluded.count''', (source, now, now if not error else 0, error, count))
        with closing(self.connect()) as conn, conn:
            sync_price_products(conn)
            conn.execute('''INSERT INTO secret_lair_sync VALUES ('refresh',?,?,?,0) ON CONFLICT(source)
                DO UPDATE SET attempted_at=excluded.attempted_at,succeeded_at=CASE WHEN excluded.error=''
                THEN excluded.succeeded_at ELSE secret_lair_sync.succeeded_at END,error=excluded.error''',
                (self.clock(), self.clock() if success else 0, '' if success else 'All sources failed; cached products retained.'))

    def request_refresh(self):
        threading.Thread(target=self._safe_refresh, daemon=True, name='secret-lair-refresh').start()

    def _safe_refresh(self):
        try:
            self.refresh()
        except Exception:
            LOG.exception('Secret Lair refresh failed; cached catalog retained')

    def start(self):
        with self.start_lock:
            if self.thread and self.thread.is_alive():
                return
            self.thread = threading.Thread(target=self._loop, daemon=True, name='secret-lair-schedule')
            self.thread.start()

    def _loop(self):
        first = True
        started_at = self.clock()
        while not self.stop.is_set():
            try:
                state = self.status()
                last = next((s for s in state['sources'] if s['source'] == 'refresh'), {})
                last_success = last.get('succeeded_at', 0)
                if not state['schedule']['startup']:
                    last_success = max(last_success, started_at)
                if (not first or state['schedule']['startup']) and due(
                        state['schedule'], last_success, last.get('attempted_at', 0)):
                    self._safe_refresh()
            except Exception:
                LOG.exception('Secret Lair scheduler could not check its schedule')
            first = False
            self.stop.wait(60)


secret_lair_sync = SecretLairSync()
