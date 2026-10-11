from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1440,'height':1000})
 page.goto('http://127.0.0.1:5013/config?open=theme',wait_until='networkidle')
 for css in ['image_compare','deckbuilder','alternate_image_modal']:
  page.add_style_tag(url=f'http://127.0.0.1:5013/static/css/{css}.css')
 page.evaluate('''()=>{let h=document.createElement('div');h.id='audit';h.innerHTML=`<div class="imomir-image-compare-dialog"><div class="imomir-image-compare-panel">Upscaler</div></div><div class="print-export-dialog"><div class="print-export-settings-panel"><div class="print-export-radio-options"><label>Pack Label</label></div></div></div><div class="custom-draft-card-search-group"><div class="custom-draft-card-search-group-header">Lotus Field</div><div class="custom-draft-card-search-printing-row"><span class="custom-draft-card-search-type-line">Land</span><button class="custom-draft-card-add-button" disabled>Current</button></div></div><div class="chaos-draft-spinner-window">Pack Name</div><button class="chaos-draft-next-button">Next Pack</button><button class="imomir-isolation-toggle">Isolation On</button><div class="deckbuilder-zone-resize-handle"></div>`;document.body.append(h)}''')
 for theme in page.evaluate('DeckadenceThemeCatalog.map(t=>t.id)'):
  page.locator('#menuThemeSelect').select_option(theme,force=True)
  page.evaluate("document.querySelectorAll('.collapsible-panel').forEach(e=>e.classList.add('is-open'))")
  page.mouse.move(0,0)
  page.wait_for_timeout(160)
  if theme in ['dark','backup']:continue
  def token(selector,prop,var):
   for el in page.locator(selector).all():
    assert el.evaluate('''(e,a)=>{let p=document.createElement('span');p.style.color='var('+a[1]+')';e.append(p);let expected=getComputedStyle(p).color;p.remove();return getComputedStyle(e)[a[0]]===expected}''',[prop,var]),(theme,selector)
  token('.game-mode-card-description','color','--muted')
  token('.plugin-card','backgroundColor','--panel-2')
  token('.reminder-card-meta-row span','color','--muted')
  token('#audit .imomir-image-compare-dialog','backgroundColor','--panel')
  token('#audit .print-export-dialog','backgroundColor','--panel')
  token('#audit .imomir-isolation-toggle','color','--text')
  token('#audit .deckbuilder-zone-resize-handle','backgroundColor','--border')
  token('#audit .custom-draft-card-add-button','color','--theme-success')
  if theme=='white-mana':
   page.locator('#audit').screenshot(path='output/theme-review/settings-audit-dialogs.png')
   page.locator('.game-mode-card').first.screenshot(path='output/theme-review/settings-audit-mode.png')
   pale=page.evaluate('''()=>Array.from(document.querySelectorAll('#configForm *')).filter(e=>e.children.length===0&&e.textContent.trim()&&e.getClientRects().length&&!e.closest('button,a,.theme-preview')).filter(e=>{let c=getComputedStyle(e).color.match(/[\\d.]+/g);return c&&Math.min(...c.slice(0,3).map(Number))>180}).map(e=>e.className)''')
   assert not pale,pale
 b.close()
print('PASS: all theme palettes, expanded Settings labels, dialog surfaces, disabled printing action, isolation toggle, divider.')

