from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 page.set_content('<div class="campaign-add-pack-dialog stats-modal-dialog"><div class="custom-draft-set-stats-panel"><div class="custom-draft-set-stats-card"><h3>Mana Value Distribution</h3><div class="custom-draft-stat-bar-wrap"><div class="custom-draft-stat-bar-fill"></div></div></div></div></div><div class="campaign-add-pack-dialog"><div class="campaign-test-draft-selected-player-card">Human Drafter</div></div><button class="deckbuilder-header-icon-button deckbuilder-header-icon-button-danger">Delete</button>')
 for name in ['style','deckbuilder','themes']:page.add_style_tag(content=Path('static/css/'+name+'.css').read_text())
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text())
 for theme in ['light','white-mana','colorless']:
  page.evaluate('''id=>{const t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  page.wait_for_timeout(250)
  for sel in ['.campaign-add-pack-dialog','.custom-draft-set-stats-panel','.custom-draft-set-stats-card','.custom-draft-stat-bar-wrap']:
   assert page.locator(sel).first.evaluate('e=>getComputedStyle(e).backgroundImage')=='none'
  assert page.locator('button').evaluate('e=>getComputedStyle(e).color')=='rgb(158, 41, 41)'
  print(theme,'PASS: stats, Test Draft surfaces and delete icon')
 b.close()
