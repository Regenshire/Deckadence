from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 page.set_content('''<form class="campaign-history-form"><div class="page-panel campaign-bulk-actions-panel"><div class="campaign-bulk-actions campaign-history-bulk-actions"><button class="action-button">Print Selected</button><button class="action-button secondary-button campaign-danger-button">Delete Selected History</button></div><div class="campaign-selection-tools"><button class="campaign-small-link-button">Select All on Page</button><button class="campaign-small-link-button">Clear Selection</button></div></div></form><div class="page-panel campaign-history-danger-panel"><form class="campaign-history-delete-all-form"><div class="campaign-history-danger-copy"><h2>Delete All History</h2><p>This removes draft history. Saved packs are not deleted.</p></div><button class="action-button secondary-button campaign-danger-button campaign-history-delete-all-button">Delete All History</button></form></div>''')
 for name in ['style','themes']:page.add_style_tag(content=Path('static/css/'+name+'.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text(encoding='utf-8'))
 for theme in page.evaluate('DeckadenceThemeCatalog.map(t=>t.id)'):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  for width in [1440,390]:
   page.set_viewport_size({'width':width,'height':900})
   actions=page.locator('.campaign-history-bulk-actions').bounding_box();links=page.locator('.campaign-selection-tools').bounding_box()
   assert links['y']>=actions['y']+actions['height'],(theme,width)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(theme,width)
  if theme not in ['dark','backup']:
   assert page.locator('.campaign-history-danger-panel').evaluate('e=>getComputedStyle(e).backgroundImage')=='none'
 b.close()
print('PASS: history actions do not overlap or overflow at desktop/mobile widths in all 10 palettes; themed danger panel uses no dark gradient.')
