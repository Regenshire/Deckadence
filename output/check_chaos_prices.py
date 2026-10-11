from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 page.set_content('<span class="chaos-pack-inline-price">$0.28</span><span class="chaos-pack-inline-price chaos-pack-inline-price-high">$3.00</span><span class="chaos-pack-view-price">$0.28</span>')
 for name in ['style','card_views','themes']:page.add_style_tag(content=Path('static/css/'+name+'.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text(encoding='utf-8'))
 for theme in page.evaluate("DeckadenceThemeCatalog.filter(t=>!['dark','backup'].includes(t.id)).map(t=>t.id)"):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  assert page.locator('.chaos-pack-view-price').evaluate('e=>getComputedStyle(e).color')==page.locator('.chaos-pack-inline-price').first.evaluate('e=>getComputedStyle(e).color')
  assert page.locator('.chaos-pack-inline-price-high').evaluate('e=>getComputedStyle(e).color')!=page.locator('.chaos-pack-inline-price').first.evaluate('e=>getComputedStyle(e).color')
 b.close()
print('PASS: inline and saved-pack prices follow all 8 themed palettes and retain high-value highlighting.')
