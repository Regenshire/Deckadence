from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 page=b.new_page(viewport={'width':1600,'height':1100})
 page.goto('http://127.0.0.1:5013/')
 for theme in ['dark','light']:
  page.evaluate('(theme)=>localStorage.setItem("deckadence.appearance.v1",JSON.stringify({theme,background:true,backgroundType:"constellation",backgroundIntensity:100,backgroundSize:100,backgroundAnimations:true}))',theme)
  page.reload(wait_until='networkidle')
  page.screenshot(path='output/theme-review/constellation-'+theme+'.png')
 b.close()
