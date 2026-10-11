from pathlib import Path
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(headless=True)
 page=b.new_page(viewport={'width':3840,'height':2160},device_scale_factor=2)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:5013/config?open=theme&scroll=theme',wait_until='networkidle')
 page.evaluate('''localStorage.setItem('deckadence.appearance.v1',JSON.stringify({theme:'dark',background:true,backgroundType:'constellation',backgroundSize:50,backgroundIntensity:100,backgroundAnimations:true}))''')
 page.reload(wait_until='networkidle');page.wait_for_selector('.theme-motion',state='attached')
 assert page.locator('.theme-motion').evaluate('c=>c.width*c.height')<2010000
 assert '-animated.svg' not in page.evaluate("getComputedStyle(document.body,'::before').backgroundImage")
 cdp=page.context.new_cdp_session(page);cdp.send('Performance.enable')
 def metrics():return {m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
 before=metrics();page.wait_for_timeout(5000);after=metrics()
 print('4K / DPR 2 / 50% tile size, 5 sec:',json.dumps({k:round(after[k]-before[k],4) for k in ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration']}))
 page.locator('#themeBackgroundAnimations').uncheck()
 assert page.locator('.theme-motion').count()==0
 page.locator('#themeBackgroundAnimations').check();page.wait_for_selector('.theme-motion',state='attached')
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(100);assert page.locator('.theme-motion').count()==0
 page.emulate_media(reduced_motion='no-preference');page.wait_for_selector('.theme-motion',state='attached')
 page.locator('#themeBackgroundSelect').select_option('logo');assert page.locator('.theme-motion').count()==0
 page.locator('#themeBackgroundSelect').select_option('constellation');page.wait_for_selector('.theme-motion',state='attached')
 page.set_viewport_size({'width':1600,'height':1100})
 page.locator('#themeBackgroundSize').fill('100');page.locator('#themeBackgroundSize').dispatch_event('input')
 page.goto('http://127.0.0.1:5013/',wait_until='networkidle');page.wait_for_timeout(1000)
 page.screenshot(path='output/theme-review/optimized-motion.png')
 assert not errors,errors
 b.close()
print('PASS: bounded canvas, controls, persistence, reduced motion, no script errors.')
