from pathlib import Path
from playwright.sync_api import sync_playwright

def contrast(a,b):
 import re
 def lum(s):
  c=[int(x)/255 for x in re.findall(r'\d+',s)[:3]]
  c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
  return sum(x*y for x,y in zip(c,[.2126,.7152,.0722]))
 x,y=sorted([lum(a),lum(b)])
 return (y+.05)/(x+.05)

with sync_playwright() as p:
 browser=p.chromium.launch(headless=True)
 page=browser.new_page()
 page.set_content(Path('templates/_help_layer.html').read_text(encoding='utf-8'))
 for name in ['style','themes','help']:
  page.add_style_tag(content=Path('static/css/'+name+'.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text(encoding='utf-8'))
 page.evaluate("document.querySelectorAll('[hidden]').forEach(e=>e.hidden=false)")
 for theme in page.evaluate('DeckadenceThemeCatalog.map(t=>t.id)'):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  page.wait_for_timeout(300)
  for text,surface in [('.deck-help-tooltip-title','.deck-help-tooltip'),('.deck-help-tooltip-body','.deck-help-tooltip'),('.deck-help-tour-title','.deck-help-tour-panel'),('.deck-help-tour-body','.deck-help-tour-panel'),('.deck-help-exit-button','.deck-help-exit-button'),('.deck-help-tour-button-next','.deck-help-tour-button-next'),('.deck-help-tour-button-back','.deck-help-tour-button-back')]:
   fg=page.locator(text).evaluate('e=>getComputedStyle(e).color')
   bg=page.locator(surface).evaluate('e=>getComputedStyle(e).backgroundColor')
   assert contrast(fg,bg)>=4.5,(theme,text,fg,bg,contrast(fg,bg))
 browser.close()
print('PASS: shared context help and tour text/button contrast across all 10 themes, with help CSS loaded last.')
