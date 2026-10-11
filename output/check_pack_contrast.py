from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 page.set_content('<div class="campaign-pack-row"><button class="campaign-small-link-button">Select All</button><div class="campaign-pack-row-number">1</div></div>')
 for f in ['style','themes']:page.add_style_tag(content=Path('static/css/'+f+'.css').read_text())
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text())
 page.add_style_tag(content=Path('static/css/deck_image_generator.css').read_text())
 page.evaluate("""()=>{let d=document.createElement('div');d.innerHTML='<div class="deck-art-modal-dialog"><div class="deck-art-section-card"><span class="deck-art-field-help">Help text</span></div></div><div class="chaos-draft-busy-card"><div class="chaos-draft-busy-title">Building Deck Art</div></div>';document.body.append(d)}""")
 for theme in ['light','white-mana','colorless']:
  result=page.evaluate('''id=>{const t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.themeScheme=t.scheme;document.documentElement.dataset.theme=t.id;for(const [k,v] of Object.entries(t.colors))document.documentElement.style.setProperty('--'+k,v);const rgb=x=>x.match(/[\\d.]+/g).slice(0,3).map(Number);const lum=c=>rgb(c).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);const contrast=(a,b)=>{a=lum(a);b=lum(b);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)};let l=getComputedStyle(document.querySelector('button')),n=getComputedStyle(document.querySelector('.campaign-pack-row-number')),r=getComputedStyle(document.querySelector('.campaign-pack-row'));return [contrast(l.color,r.backgroundColor),contrast(n.color,n.backgroundColor)]}''',theme)
  assert min(result)>=4.5,(theme,result)
  assert page.locator('.deck-art-modal-dialog').evaluate('e=>getComputedStyle(e).backgroundImage')=='none'
  assert page.locator('.chaos-draft-busy-card').evaluate('e=>getComputedStyle(e).backgroundImage')=='none'
  assert page.locator('.deck-art-field-help').evaluate('e=>getComputedStyle(e).color')==page.evaluate("getComputedStyle(document.querySelector('.chaos-draft-busy-text')||document.querySelector('.deck-art-field-help')).color")
  print(theme, [round(x,2) for x in result])
 b.close()
