from playwright.sync_api import sync_playwright
from pathlib import Path
out=Path('output/theme-review');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 page=b.new_page(viewport={'width':1440,'height':1000})
 errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
 r=page.goto('http://127.0.0.1:5013/config?open=theme&scroll=theme',wait_until='networkidle')
 print('status',r.status,'choices',page.locator('[data-theme-choice]').count(),'errors',errors)
 print(page.locator('body').inner_text()[:800].encode('ascii','replace'))
 page.screenshot(path=str(out/'initial.png'))
 b.close()


