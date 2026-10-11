from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page()
 page.set_content('''<div class="home-welcome-panel"><div class="home-primary-section"><a href="#works" class="home-primary-card"><div class="home-card-icon">X</div><div class="home-card-copy"><h2>Chaos Draft</h2><p>Draft from your custom sets.</p></div><div class="home-card-action">It is time to Draft! <i>→</i></div></a></div></div><div class="chaos-draft-spinner-window">Roulette</div><div class="deckbuilder-main"><div class="deckbuilder-zone-header"><h2>Deck</h2><button>Filter</button></div></div>''')
 for n in ['style','home','deckbuilder','themes']:page.add_style_tag(content=Path('static/css/'+n+'.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text(encoding='utf-8'))
 def theme(id):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',id)
 theme('backup')
 before=page.locator('.home-welcome-panel').evaluate('e=>getComputedStyle(e).borderTopWidth')
 page.add_style_tag(content=Path('static/css/white_mana_flair.css').read_text(encoding='utf-8'))
 assert page.locator('.home-welcome-panel').evaluate('e=>getComputedStyle(e).borderTopWidth')==before
 theme('white-mana')
 for width in [1440,390]:
  page.set_viewport_size({'width':width,'height':1000})
  assert page.locator('.home-card-action').bounding_box()['width']<=page.locator('.home-primary-card').bounding_box()['width']
  page.locator('.home-card-action').click()
  assert page.url.endswith('#works')
 assert page.locator('.chaos-draft-spinner-window').evaluate('e=>getComputedStyle(e).borderTopWidth')=='1px'
 b.close()
print('PASS: desktop/mobile action layout and link clicks; Backup unaffected; roulette border geometry preserved.')
