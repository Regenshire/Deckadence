from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch();page=b.new_page()
 page.set_content('''<html data-theme="white-mana"><div id="chaosDraftScreen"><div class="campaign-chaos-open-actions"><h2 class="campaign-opened-heading">Your opened pack</h2><button class="action-button">View</button><button class="action-button">Print / Export</button><div class="chaos-export-split"><button class="action-button chaos-export-main-button">Copy</button><button class="action-button chaos-export-menu-button">▾</button></div><button class="action-button campaign-pack-upscale-icon">X</button></div></div></html>''')
 for n in ['style','themes','white_mana_flair']:page.add_style_tag(content=Path('static/css/'+n+'.css').read_text(encoding='utf-8'))
 for width in [1440,390]:
  page.set_viewport_size({'width':width,'height':600})
  copy=page.locator('.chaos-export-split').bounding_box();icon=page.locator('.campaign-pack-upscale-icon').bounding_box();arrow=page.locator('.chaos-export-menu-button').bounding_box()
  assert copy['width']==140
  assert arrow['x']+arrow['width']<=copy['x']+copy['width']+1
  assert abs(icon['height']-copy['height'])<1
  assert icon['x']>=copy['x']+copy['width']+12 or icon['y']>=copy['y']+copy['height']+12
 b.close()
print('PASS: Copy stays 140px, dropdown stays inside, and Upscale has a 12px gap with matching height at desktop/mobile widths.')
