from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image,ImageChops
p=Path('static/img/themes/concepts/card-constellations').resolve()
with sync_playwright() as pw:
 b=pw.chromium.launch(headless=True);page=b.new_page(viewport={'width':1600,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto((p/'index.html').as_uri());page.locator('#layout').uncheck();page.screenshot(path='output/ley-before.png');page.wait_for_timeout(6500);page.screenshot(path='output/ley-after.png')
 assert not errors,errors
 diff=ImageChops.difference(Image.open('output/ley-before.png'),Image.open('output/ley-after.png'))
 assert diff.getbbox(), 'Expected subtle animation movement'
 page.locator('#motion').uncheck();page.screenshot(path='output/ley-off-before.png');page.wait_for_timeout(500);page.screenshot(path='output/ley-off-after.png')
 assert ImageChops.difference(Image.open('output/ley-off-before.png'),Image.open('output/ley-off-after.png')).getbbox() is None
 print('Verified animation movement, static toggle, and no browser script errors.')
 b.close()
