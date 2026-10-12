"""Exact sealed-product quotes. Reads return immediately; refreshes run off-thread."""
import logging
import sqlite3
import threading
import time
from contextlib import closing

from db.market_prices import _connect, _fetch_json, _cents, _quantity, TTL, RETRY_DELAY, VENDORS

LOG = logging.getLogger(__name__)
MANA_URL = 'https://manapool.com/api/v1/products/sealed'
CK_URL = 'https://api.cardkingdom.com/api/sealed_pricelist'


def ensure_schema(conn):
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS sealed_price_quotes (
            provider TEXT NOT NULL, product_id TEXT NOT NULL, price_cents INTEGER NOT NULL,
            quantity INTEGER, url TEXT, source_updated_at TEXT, fetched_at REAL NOT NULL,
            PRIMARY KEY(provider,product_id)
        );
        CREATE TABLE IF NOT EXISTS sealed_price_checks (
            provider TEXT NOT NULL, product_id TEXT NOT NULL, checked_at REAL NOT NULL DEFAULT 0,
            retry_at REAL NOT NULL DEFAULT 0, error TEXT, PRIMARY KEY(provider,product_id)
        );
    ''')


class SealedPriceEngine:
    def __init__(self, connect=_connect, fetch=_fetch_json, clock=time.time):
        self.connect, self.fetch, self.clock = connect, fetch, clock
        self.lock = threading.RLock()
        self.pending = {}
        self.running = {p: False for p in VENDORS}
        self.retry_at = {p: 0 for p in VENDORS}
        self.ready = False

    def _schema(self):
        with self.lock:
            if not self.ready:
                with closing(self.connect()) as conn:
                    ensure_schema(conn)
                self.ready = True

    def _due(self, check):
        return not check or (check['checked_at'] <= self.clock()-TTL and check['retry_at'] <= self.clock())

    def lookup(self, set_code, booster_name, box_id=None, refresh=True):
        result = {'product_id': None, 'name': None, 'prices': {p: {'price': None, 'status': 'unmapped', 'refreshing': False} for p in VENDORS}}
        try:
            self._schema()
            with closing(self.connect()) as conn:
                if box_id:
                    row = conn.execute('SELECT * FROM simulator_sealed_products WHERE product_uuid=? AND set_code=? AND booster_name=? AND category=?',
                        (box_id,set_code,booster_name,'booster_box')).fetchone()
                else:
                    row = conn.execute('''SELECT * FROM simulator_sealed_products WHERE set_code=? AND booster_name=? AND category='booster_pack'
                        ORDER BY length(name),product_uuid LIMIT 1''', (set_code,booster_name)).fetchone()
                if not row:
                    return result
                product = dict(row)
                quotes = {r['provider']:dict(r) for r in conn.execute('SELECT * FROM sealed_price_quotes WHERE product_id=?', (product['product_uuid'],))}
                checks = {(r['provider'],r['product_id']):dict(r) for r in conn.execute('SELECT * FROM sealed_price_checks WHERE product_id IN (?,?)', (product['product_uuid'],'*'))}
            if refresh:
                self._schedule(product, checks)
            result.update(product_id=product['product_uuid'],name=product['name'])
            for provider in VENDORS:
                quote = quotes.get(provider)
                check = checks.get((provider,product['product_uuid'] if provider=='manapool' else '*'), {})
                stale = bool(quote and (quote['fetched_at'] <= self.clock()-TTL or quote['fetched_at'] < check.get('checked_at',0)))
                mapped = bool(product['tcg_id'] if provider=='manapool' else product['ck_id'])
                with self.lock:
                    loading = product['product_uuid'] in self.pending if provider=='manapool' else self.running[provider]
                status = ('stale' if stale else 'fresh') if quote else 'unmapped' if not mapped else 'loading' if loading else 'error' if check.get('error') else 'unavailable'
                result['prices'][provider] = {'price':quote['price_cents']/100 if quote else None,'currency':'USD',
                    'basis':'market' if provider=='manapool' else 'retail','status':status,'stale':stale,'refreshing':loading,
                    'quantity':quote['quantity'] if quote and not stale else None,'url':quote['url'] if quote else None,
                    'fetched_at':quote['fetched_at'] if quote else None,'source_updated_at':quote['source_updated_at'] if quote else None}
        except (sqlite3.Error, OSError, ValueError, TypeError):
            LOG.warning('Optional sealed prices are unavailable',exc_info=True)
            for quote in result['prices'].values():
                quote.update(status='error',refreshing=False)
        return result

    def _schedule(self, product, checks):
        with self.lock:
            key = product['product_uuid']
            if product['tcg_id'] and self.clock() >= self.retry_at['manapool'] and self._due(checks.get(('manapool',key))) and len(self.pending)<1000:
                self.pending[key] = product
            if self.pending and not self.running['manapool']:
                self.running['manapool'] = True
                threading.Thread(target=self._mana_worker,daemon=True,name='ManaPoolSealed').start()
            if product['ck_id'] and self.clock() >= self.retry_at['cardkingdom'] and self._due(checks.get(('cardkingdom','*'))) and not self.running['cardkingdom']:
                self.running['cardkingdom'] = True
                threading.Thread(target=self._ck_worker,daemon=True,name='CardKingdomSealed').start()

    def _save(self, provider, ids, quotes, stamp):
        now = self.clock()
        with closing(self.connect()) as conn, conn:
            conn.executemany('''INSERT INTO sealed_price_quotes VALUES (?,?,?,?,?,?,?) ON CONFLICT(provider,product_id)
                DO UPDATE SET price_cents=excluded.price_cents,quantity=excluded.quantity,url=excluded.url,
                source_updated_at=excluded.source_updated_at,fetched_at=excluded.fetched_at''',
                [(provider,*quote,stamp,now) for quote in quotes])
            conn.executemany('''INSERT INTO sealed_price_checks VALUES (?,?,?,0,NULL) ON CONFLICT(provider,product_id)
                DO UPDATE SET checked_at=excluded.checked_at,retry_at=0,error=NULL''', [(provider,key,now) for key in ids])

    def _failed(self, provider, ids):
        self.retry_at[provider] = self.clock()+RETRY_DELAY
        try:
            with closing(self.connect()) as conn, conn:
                conn.executemany('''INSERT INTO sealed_price_checks(provider,product_id,retry_at,error) VALUES (?,?,?,'provider_unavailable')
                    ON CONFLICT(provider,product_id) DO UPDATE SET retry_at=excluded.retry_at,error=excluded.error''',
                    [(provider,key,self.retry_at[provider]) for key in ids])
        except sqlite3.Error:
            pass

    def _mana_worker(self):
        try:
            while True:
                with self.lock:
                    batch = dict(list(self.pending.items())[:100])
                    if not batch:
                        self.running['manapool'] = False
                        return
                try:
                    data = self.fetch(MANA_URL,[('mtgjson_uuids',key) for key in batch])
                    by_tcg = {p['tcg_id']:key for key,p in batch.items()}
                    found = {}
                    for row in data['data']:
                        key = by_tcg.get(str(row.get('tcgplayer_product_id')))
                        price = _cents(row.get('price_market'))
                        if not key or row.get('language_id')!='EN' or price is None:
                            continue
                        url = row.get('url') or ''
                        quote = (key,price,_quantity(row.get('available_quantity')),url if url.startswith('https://manapool.com/') else None)
                        if key not in found or price < found[key][1]:
                            found[key]=quote
                    self._save('manapool',batch,found.values(),(data.get('meta') or {}).get('as_of'))
                    with self.lock:
                        for key in batch:self.pending.pop(key,None)
                except Exception:
                    LOG.warning('Mana Pool sealed refresh failed',exc_info=True)
                    with self.lock:
                        self._failed('manapool',list(self.pending));self.pending.clear();self.running['manapool']=False
                    return
        except Exception:
            with self.lock:self.pending.clear();self.running['manapool']=False
            LOG.exception('Sealed worker stopped')

    def _ck_worker(self):
        try:
            data = self.fetch(CK_URL)
            with closing(self.connect()) as conn:
                products = {r['ck_id']:r['product_uuid'] for r in conn.execute("SELECT product_uuid,ck_id FROM simulator_sealed_products WHERE ck_id<>''")}
            quotes = []
            for row in data['data']:
                key = products.get(str(row.get('id')))
                price = _cents(row.get('price_retail'),dollars=True)
                if not key or price is None:continue
                path = row.get('url') or ''
                quotes.append((key,price,_quantity(row.get('qty_retail')),'https://www.cardkingdom.com/'+path if path.startswith('mtg-sealed/') else None))
            if not data['data']:raise ValueError('Empty sealed feed')
            self._save('cardkingdom',['*'],quotes,(data.get('meta') or {}).get('created_at'))
        except Exception:
            LOG.warning('Card Kingdom sealed refresh failed',exc_info=True);self._failed('cardkingdom',['*'])
        finally:
            with self.lock:self.running['cardkingdom']=False


engine = SealedPriceEngine()


def lookup_sealed_prices(set_code,booster_name,box_id=None,refresh=True):
    return engine.lookup(set_code,booster_name,box_id,refresh)
