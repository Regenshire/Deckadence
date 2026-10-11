from pathlib import Path
import math, xml.etree.ElementTree as ET, base64, json
import cairosvg
from PIL import Image, ImageDraw, ImageFont
out=Path('static/img/themes/concepts')
logo=ET.parse('static/img/Logos/deckadence_d.svg').getroot()
paths=''.join('<path d="'+e.attrib['d']+'"/>' for e in logo if e.tag.endswith('path'))
def mark(x,y,size,angle=0,opacity=.09):
 return f'<g transform="translate({x} {y}) rotate({angle}) scale({size/79.09})" fill="#a9b0be" opacity="{opacity}">{paths}</g>'
def svg(w,h,body,title):
 return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><title>{title}</title>{body}</svg>'
concepts=[]
body=''.join(mark(*v) for v in [(44,60,26,-9,.09),(432,124,18,7,.065),(211,333,23,10,.075),(694,283,30,-6,.085),(572,538,20,4,.06),(71,574,17,-4,.065)])
concepts.append(('01-scattered-marks','Scattered marks','Fewer D marks, varied scale and spacing. The closest to the current design.',800,680,body))
body=''
for y in range(-100,741,70):
 pts=[]
 for x in range(0,961,8):
  yy=y+36*math.sin(2*math.pi*x/960)+15*math.sin(4*math.pi*x/960+.65)
  pts.append(f'{x},{yy:.2f}')
 body+=f'<polyline points="{" ".join(pts)}" fill="none" stroke="#a9b0be" stroke-width="1" opacity=".075"/>'
concepts.append(('02-flow-lines','Flow lines','Broad, quiet curves that feel continuous across large screens.',960,700,body))
body='<g fill="none" stroke="#a9b0be" stroke-width="1" opacity=".07"><path d="M60 75L185 130L282 55M185 130L225 255M555 345L685 275L794 370L710 501M555 345L525 477"/></g>'
for x,y,r in [(60,75,2),(185,130,3),(282,55,2),(225,255,2),(555,345,3),(685,275,2),(794,370,2),(710,501,2),(525,477,2),(425,110,1),(99,449,1),(347,528,1)]:
 body+=f'<circle cx="{x}" cy="{y}" r="{r}" fill="#a9b0be" opacity=".16"/>'
body+=mark(382,344,19,0,.075)
concepts.append(('03-constellation','Constellation','Small clusters, faint connections, and plenty of open space.',900,620,body))
body=''
for x,y,angle in [(50,70,-12),(425,350,13)]:
 body+=f'<g transform="translate({x} {y}) rotate({angle} 62 86)" fill="none" stroke="#a9b0be" stroke-width="1" opacity=".065"><rect x="0" y="0" width="124" height="172" rx="10"/><rect x="10" y="10" width="124" height="172" rx="10"/><path d="M24 43H108M24 143H108"/></g>'
concepts.append(('04-card-echoes','Card echoes','Oversized card silhouettes, lightly offset like a small stack.',760,680,body))
# Identical simplified app layout in every preview; decoration stays outside its solid panels.
app='''<g font-family="Arial, sans-serif">
<rect x="295" y="40" width="1010" height="70" rx="16" fill="#1a1c21" stroke="#343844"/>
<text x="325" y="83" fill="#f2f4f8" font-size="25" font-weight="700">Deckadence</text>
<text x="570" y="82" fill="#f2f4f8" font-size="16">Home</text><text x="656" y="82" fill="#a9b0be" font-size="16">Play</text><text x="730" y="82" fill="#a9b0be" font-size="16">Cards</text><text x="1205" y="82" fill="#a9b0be" font-size="16">Settings</text>
<rect x="350" y="145" width="900" height="755" rx="24" fill="#1a1c21" stroke="#343844"/>
<text x="800" y="220" fill="#f2f4f8" font-size="38" text-anchor="middle" font-weight="700">Deckadence</text>
<text x="800" y="255" fill="#a9b0be" font-size="16" text-anchor="middle">DESIGN  /  PROXY  /  PLAYTEST</text>
'''
for i,(title,sub) in enumerate([('Chaos Draft','Build your next draft experience.'),('Play Momir','Let the next card surprise you.'),('Custom Sets','Create a world of your own.'),('Deck Roulette','Find a new deck to play.')]):
 x=385+i%2*425;y=302+i//2*205
 app+=f'<rect x="{x}" y="{y}" width="405" height="183" rx="16" fill="#23262d" stroke="#343844"/><rect x="{x+20}" y="{y+20}" width="32" height="32" rx="9" fill="#303b52"/><text x="{x+20}" y="{y+92}" fill="#f2f4f8" font-size="21" font-weight="700">{title}</text><text x="{x+20}" y="{y+122}" fill="#a9b0be" font-size="15">{sub}</text>'
app+='<path d="M385 735H1215" stroke="#343844"/><text x="385" y="776" fill="#a9b0be" font-size="12" letter-spacing="2">HELP &amp; GUIDED LEARNING</text><text x="385" y="815" fill="#f2f4f8" font-size="24" font-weight="700">Enlightened Tutor</text></g>'
for slug,title,desc,w,h,body in concepts:
 tile=svg(w,h,body,title+' — seamless transparent tile')
 (out/(slug+'.svg')).write_text(tile,encoding='utf-8')
 full=svg(1600,1000,f'<defs><pattern id="tile" width="{w}" height="{h}" patternUnits="userSpaceOnUse">{body}</pattern></defs><rect width="1600" height="1000" fill="#101114"/><rect width="1600" height="1000" fill="url(#tile)"/>'+app,title+' — widescreen mockup')
 cairosvg.svg2png(bytestring=full.encode(),write_to=str(out/(slug+'-preview.png')))
# A compact comparison sheet with the same scale and brightness in all four examples.
sheet=Image.new('RGB',(1640,1180),'#1a1c21');d=ImageDraw.Draw(sheet)
f=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',23);sm=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
for i,(slug,title,desc,*_) in enumerate(concepts):
 x=20+i%2*810;y=18+i//2*580
 im=Image.open(out/(slug+'-preview.png')).convert('RGB').resize((790,494),Image.Resampling.LANCZOS)
 sheet.paste(im,(x,y));d.text((x+8,y+505),f'{i+1:02} / {title}',font=f,fill='#eceef3');d.text((x+8,y+540),desc,font=sm,fill='#a9b0be')
sheet.save(out/'comparison.jpg',quality=96)
# Interactive local preview: choose a concept, vary its opacity, and hide the mock app.
options=''.join(f'<option value="{slug}.svg">{title}</option>' for slug,title,*_ in concepts)
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Deckadence background concepts</title><style>
*{box-sizing:border-box}body{margin:0;background:#101114;color:#f2f4f8;font-family:Arial,sans-serif}#pattern{position:fixed;inset:0;z-index:-1;background-image:url(01-scattered-marks.svg)}header{position:sticky;top:0;padding:15px 24px;background:#1a1c21;border-bottom:1px solid #343844;display:flex;align-items:center;flex-wrap:wrap;gap:18px;font-size:14px}select{background:#23262d;color:#f2f4f8;padding:8px;border:1px solid #343844;border-radius:6px}label{display:flex;gap:8px;align-items:center}main{max-width:1000px;margin:38px auto;padding:0 20px}main svg{width:100%;height:auto;display:block}p{color:#a9b0be;font-size:13px}input{accent-color:#6486b8}</style><div id="pattern"></div><header><strong>Background concepts</strong><select id="choice" aria-label="Background concept">OPTIONS</select><label>Intensity <input id="strength" type="range" min="30" max="180" value="100"><output id="amount">100%</output></label><label><input id="layout" type="checkbox" checked>Show sample layout</label></header><main id="sample">APP<p>Concept preview only. Your active app theme has not changed.</p></main><script>
choice.onchange=()=>pattern.style.backgroundImage='url('+choice.value+')';strength.oninput=()=>{pattern.style.opacity=strength.value/100;amount.value=strength.value+'%'};layout.onchange=()=>sample.hidden=!layout.checked;
</script></html>'''.replace('OPTIONS',options).replace('APP',svg(1080,920,app,'Sample layout').replace('viewBox="0 0 1080 920"','viewBox="260 15 1080 920"'))
(out/'index.html').write_text(html,encoding='utf-8')
print('Created four SVG concepts, full-size mockups, comparison sheet, and interactive preview.')
