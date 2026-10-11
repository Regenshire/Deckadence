from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page()
 page.add_init_script("localStorage.setItem('deckadence.appearance.v1',JSON.stringify({theme:'white-mana'}))")
 page.goto('http://127.0.0.1:5013/play/draft');page.wait_for_timeout(400)
 assert page.locator('.chaos-draft-template-links').count()==0
 for width in [1440,390]:
  page.set_viewport_size({'width':width,'height':1100})
  assert page.locator('#chaosNextButton').evaluate('e=>getComputedStyle(e).backgroundColor')=='rgb(128, 97, 39)'
  assert page.locator('.chaos-draft-spinner-window').evaluate("e=>getComputedStyle(e,'::before').display")=='none'
  for id in ['campaignPlayerSelect','campaignCurrentPlayerCard','chaosNextButton']:
   assert page.locator('#'+id).is_visible()
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 page.set_viewport_size({'width':1440,'height':1100});page.screenshot(path='output/campaign-revised.png',full_page=True)
 b.close()
print('PASS: actual campaign page desktop/mobile layout; filled Next Pack; no edge fades; tools retained; link removed.')
