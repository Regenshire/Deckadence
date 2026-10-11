from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 classes=['campaign-test-draft-human-card-pickbar','campaign-test-draft-card','campaign-test-draft-stat-group','campaign-test-draft-virtual-card','campaign-test-draft-pagination-status','campaign-test-draft-close-button']
 page.set_content(''.join(f'<div class="{c}">Sample text</div>' for c in classes)+'<div class="campaign-test-draft-card-list-grid"><div class="campaign-test-draft-card">Grid card</div></div>')
 for name in ['style','card_views','themes']:page.add_style_tag(content=Path('static/css/'+name+'.css').read_text())
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text())
 for theme in page.evaluate("DeckadenceThemeCatalog.filter(t=>!['dark','backup'].includes(t.id)).map(t=>t.id)"):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  page.mouse.move(0,0);page.wait_for_timeout(350)
  for c in classes:
   assert page.locator('.'+c).first.evaluate('e=>getComputedStyle(e).backgroundImage')=='none',(theme,c)
  assert page.locator('.campaign-test-draft-card-list-grid .campaign-test-draft-card').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
  if theme=='white-mana':page.screenshot(path='output/theme-review/test-draft-surfaces.png')
 b.close()
print('PASS: Test Draft surfaces across 8 palettes; grid backgrounds remain transparent.')
