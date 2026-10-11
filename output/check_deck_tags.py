from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 page.set_content('<div class="deckbuilder-card-meta-badge deckbuilder-card-role-badge">Commander</div><div class="deckbuilder-card-meta-badge deckbuilder-card-role-badge">Partner</div><div class="deckbuilder-card-meta-badge deckbuilder-card-foil-badge">Foil</div>')
 for name in ['style','deckbuilder','themes']:page.add_style_tag(content=Path('static/css/'+name+'.css').read_text())
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text())
 for theme in ['light','white-mana','colorless']:
  values=page.evaluate('''id=>{const t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v));const lum=c=>c.match(/[\\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);return [...document.querySelectorAll('div')].map(e=>{let s=getComputedStyle(e),a=lum(s.color),b=lum(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)})}''',theme)
  assert min(values)>=4.5,(theme,values)
  print(theme,[round(v,2) for v in values])
 b.close()
