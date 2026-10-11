from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page(viewport={"width":1600,"height":1100})
 page.set_content('<style>body{margin:0;background:#101114}</style>'+Path('static/img/themes/concepts/card-constellations/card-constellations-animated.svg').read_text(encoding='utf-8'))
 def seek(t):page.evaluate('(t)=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t})',t)
 seek(6000)
 print('Blue to black midpoint:',page.locator('[data-from="card-2"] .ley-core').evaluate('e=>getComputedStyle(e).fill'))
 arrival=page.locator('.mana-arrival[data-card="card-3"]')
 seek(13000)
 assert float(arrival.evaluate('e=>getComputedStyle(e).opacity'))<.01
 seek(13220)
 assert float(arrival.evaluate('e=>getComputedStyle(e).opacity'))>.99
 assert arrival.locator('.arrival-emblem polyline').first.evaluate('e=>getComputedStyle(e).stroke')=='rgb(195, 154, 238)'
 assert arrival.locator('.arrival-emblem circle').last.evaluate('e=>getComputedStyle(e).opacity')=='1'
 page.screenshot(path='output/comet-arrival.png')
 seek(14500)
 assert 0<float(arrival.evaluate('e=>getComputedStyle(e).opacity'))<.85
 seek(15670)
 assert float(arrival.evaluate('e=>getComputedStyle(e).opacity'))<.01
 print('Verified arrival onset, colored mana stars, and fade as tail clears.')
 b.close()
