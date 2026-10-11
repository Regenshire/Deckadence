from pathlib import Path
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(headless=True);page=b.new_page()
 classes=['campaign-add-pack-dialog','reminder-modal','app-qr-modal','card-back-selector-dialog','card-back-delete-confirm-panel','silhouette-template-library-dialog','personal-use-agreement-dialog','imomir-image-compare-dialog','imomir-batch-upscale-dialog','print-export-dialog','print-template-selector-dialog','deck-art-modal-dialog','stats-modal-dialog','imomir-zoom-comparison-panel']
 page.set_content(''.join('<div class="'+c+'">Sample text</div>' for c in classes)+'<div class="campaign-add-pack-option campaign-add-pack-mode-card-active"><span class="campaign-add-pack-option-pill">Auto</span></div>')
 for name in ['style','config','card_back_selector','image_compare','upscale_batch','print_export_modal','print_template_selector','deck_image_generator','silhouette_template_library','personal_use_agreement','themes']:
  page.add_style_tag(content=Path('static/css/'+name+'.css').read_text(encoding='utf-8'))
 page.add_script_tag(content=Path('static/js/theme_catalog.js').read_text(encoding='utf-8'))
 for theme in page.evaluate("DeckadenceThemeCatalog.filter(t=>!['dark','backup'].includes(t.id)).map(t=>t.id)"):
  page.evaluate('''id=>{let t=DeckadenceThemeCatalog.find(t=>t.id===id);document.documentElement.dataset.theme=id;document.documentElement.dataset.themeScheme=t.scheme;Object.entries(t.colors).forEach(([k,v])=>document.documentElement.style.setProperty('--'+k,v))}''',theme)
  page.wait_for_timeout(300)
  for c in classes+['campaign-add-pack-mode-card-active']:
   assert page.locator('.'+c).evaluate('e=>getComputedStyle(e).backgroundImage')=='none',(theme,c)
  assert page.locator('.campaign-add-pack-option-pill').evaluate('e=>getComputedStyle(e).color')==page.locator('.campaign-add-pack-dialog').evaluate('e=>getComputedStyle(e).color'),theme
 b.close()
print('PASS: 14 shared dialog surfaces and Add Pack active state/badge across 8 themed palettes.')
