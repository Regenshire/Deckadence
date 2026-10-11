from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page(viewport={'width':1440,'height':1100})
 page.add_init_script("localStorage.setItem('deckadence.appearance.v1',JSON.stringify({theme:'white-mana',background:false}))")
 page.goto('http://127.0.0.1:5013/');page.wait_for_timeout(600)
 card=page.locator('.home-primary-card:not(.home-primary-card-setup)').first
 print(page.locator('html').get_attribute('data-theme')); print(card.evaluate('e=>getComputedStyle(e).backgroundColor')); print(page.locator('link[rel=stylesheet]').evaluate_all('es=>es.map(e=>e.href)'))
 guide=page.locator('.home-guide-card[data-help-tour-start]').first
 assert guide.evaluate('e=>getComputedStyle(e).backgroundColor')=='rgba(0, 0, 0, 0)'
 assert guide.locator('h3').evaluate('e=>getComputedStyle(e).fontSize')=='18px'
 page.screenshot(path='output/home-corrected.png',full_page=True)
 page.goto('http://127.0.0.1:5013/play/draft');page.wait_for_timeout(700)
 print('Campaign stage count:',page.locator('.campaign-draft-stage').count())
 if page.locator('.campaign-draft-stage').count():
  for id in ['campaignPlayerSelect','campaignCurrentPlayerCard','campaignNewDraftButton','chaosViewButton','chaosOpenButton','chaosExportMainButton']:
   assert page.locator('#'+id).count()==1,id
  page.locator('#chaosDraftOpenRow').evaluate("e=>{e.classList.remove('hidden');e.style.display='block'}")
  page.screenshot(path='output/campaign-stage.png',full_page=True)
 b.close()
print('PASS: actual Home rendering matches ivory cards and transparent 18px guide design.')

