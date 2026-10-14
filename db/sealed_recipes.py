# *** SEALED PRODUCTS - Read Product Contents ***
class SealedRecipeCatalog:
    def __init__(self, all_sets):
        self.sets = all_sets
        self.products = {p['uuid']: p for data in all_sets.values()
                         for p in data.get('sealedProduct', []) if p.get('uuid')}

    @staticmethod
    def count(value):
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 100:
            raise ValueError('The published product quantity is unsupported.')
        return value

    def resolve(self, product, seen=()):
        uid = product.get('uuid')
        if not uid or uid in seen or len(seen) > 5:
            raise ValueError('The published product contents are incomplete.')
        contents = product.get('contents') or {}
        if any(value for key, value in contents.items() if key not in {'pack', 'sealed', 'card', 'deck', 'other'}):
            raise ValueError('Some published contents cannot yet be simulated.')
        packs = []
        for pack in contents.get('pack', []):
            code, booster = str(pack.get('set', '')).upper(), pack.get('code')
            if booster not in self.sets.get(code, {}).get('booster', {}):
                raise ValueError('A required booster definition is missing.')
            packs.append({'set_code': code, 'booster_name': booster,
                          'count': self.count(pack.get('count', 1))})
        for child in contents.get('sealed', []):
            nested, _ = self.resolve(self.products.get(child.get('uuid'), {}), (*seen, uid))
            count = self.count(child.get('count', 1))
            packs.extend({**p, 'count': self.count(p['count'] * count)} for p in nested)
        # Only booster packs determine whether a sealed product can be opened.
        # Fixed cards, land packs, decks, and accessories are not simulated.
        if not packs or sum(p['count'] for p in packs) > 100:
            raise ValueError('The published contents are missing or exceed the opening limit.')
        return packs, []
