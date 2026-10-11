from playwright.sync_api import sync_playwright
from pathlib import Path
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page(viewport={'width':1440,'height':1000})
 page.goto('http://127.0.0.1:5013/');page.evaluate("localStorage.setItem('deckadence.appearance.v1',JSON.stringify({theme:'light',background:true}))")
 for name,path in [('momir','/play/momir'),('draft','/play/draft'),('sets','/sets'),('decks','/deck-builder')]:
  r=page.goto('http://127.0.0.1:5013'+path,wait_until='networkidle');page.wait_for_timeout(350);page.screenshot(path=f'output/theme-review/{name}-light.png');print(name,r.status,page.url)
 b.close()

