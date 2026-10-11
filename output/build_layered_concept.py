from pathlib import Path
import re,json,xml.etree.ElementTree as ET
import cairosvg
p=Path('static/img/themes/concepts');out=p/'layered-echoes';out.mkdir(exist_ok=True)
ns='{http://www.w3.org/2000/svg}'
cards=ET.parse(p/'04-card-echoes.svg').getroot(); constellation=ET.parse(p/'03-constellation.svg').getroot()
ET.register_namespace('',ns[1:-1])
def layer(name,w,h,elements,color,opacity):
 root=ET.Element(ns+'svg',{'width':str(w),'height':str(h),'viewBox':f'0 0 {w} {h}'})
 ET.SubElement(root,ns+'title').text=name
 for e in elements:
  for n in e.iter():
   for attr in ['fill','stroke']:
    if n.get(attr)=='#a9b0be':n.set(attr,color)
   if n.get('opacity'):n.set('opacity',str(opacity))
  root.append(e)
 s=ET.tostring(root,encoding='unicode');return s
card=layer('Card echoes — warm slate',760,680,[e for e in cards if e.tag==ns+'g'],'#b3a99b',.115)
lines=layer('Constellation paths — blue gray',900,620,[constellation.find(ns+'g')],'#7897b4',.12)
stars=layer('Constellation stars — pale silver',900,620,list(constellation.findall(ns+'circle')),'#b9c8d6',.23)
layers=[('cards.svg','Card echoes','Warm slate',760,680,0,0,card),('connections.svg','Connections','Blue gray',900,620,80,40,lines),('stars.svg','Stars','Pale silver',900,620,80,40,stars)]
for filename,*_,s in layers:(out/filename).write_text(s,encoding='utf-8')
source=(p/'index.html').read_text(encoding='utf-8')
app=re.search(r'<main id="sample">(.*?)<p>',source,re.S).group(1)
bodyapp=re.sub(r'^<svg[^>]*><title>.*?</title>|</svg>$','',app,flags=re.S)
defs='';rects=''
for i,(filename,label,color,w,h,x,y,s) in enumerate(layers):
 contents=re.sub(r'^<svg[^>]*>|</svg>$','',s)
 defs+=f'<pattern id="layer{i}" width="{w}" height="{h}" x="{x}" y="{y}" patternUnits="userSpaceOnUse">{contents}</pattern>'
 rects+=f'<rect width="1600" height="1000" fill="url(#layer{i})"/>'
base=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs>{defs}</defs><rect width="1600" height="1000" fill="#101114"/>{rects}'
for name,content in [('preview',bodyapp),('background-only','')]:
 s=base+content+'</svg>';cairosvg.svg2png(bytestring=s.encode(),write_to=str(out/(name+'.png')))
controls=''.join(f'<label class="layer"><span><input type="checkbox" id="on{i}" checked>{label} <small>{color}</small></span><input type="range" id="level{i}" aria-label="{label} intensity" min="0" max="150" value="100"><output id="value{i}">100%</output></label>' for i,(_,label,color,*_) in enumerate(layers))
html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Card Echoes + Constellation</title><style>
*{box-sizing:border-box}body{margin:0;background-color:#101114;background-repeat:repeat;background-size:760px 680px,900px 620px,900px 620px;background-position:0 0,80px 40px,80px 40px;color:#f2f4f8;font-family:Arial,sans-serif}header{padding:18px 24px;background:#1a1c21;border-bottom:1px solid #343844}h1{font-size:18px;margin:0 0 15px}.controls{display:flex;flex-wrap:wrap;gap:22px}.layer{display:grid;grid-template-columns:auto 100px 38px;align-items:center;gap:10px;font-size:14px}.layer span{display:flex;align-items:center;gap:6px}small{color:#a9b0be;font-size:11px}input{accent-color:#7897b4}output{font-size:12px;color:#a9b0be}.layout{display:block;margin-top:16px;font-size:13px}main{max-width:1000px;margin:32px auto;padding:0 20px}main svg{display:block;width:100%;height:auto}footer{background:#1a1c21;padding:12px 24px;color:#a9b0be;font-size:12px}a{color:#afc4da}main[hidden]{display:none}body:has(main[hidden]){min-height:100vh}footer{margin-top:24px}
</style></head><body><header><h1>Card Echoes + Constellation / three SVG layers</h1><div class="controls">CONTROLS</div><label class="layout"><input type="checkbox" id="showLayout" checked> Show sample app layout</label></header><main id="sample">APP</main><footer>Outer background only. Separate assets: <a href="cards.svg">Cards</a> · <a href="connections.svg">Connections</a> · <a href="stars.svg">Stars</a>. Concept preview; the live app is unchanged.</footer><script>
const sources=SOURCES;
function update(){document.body.style.backgroundImage=sources.map((source,i)=>{const level=Number(document.getElementById('level'+i).value)/100;document.getElementById('value'+i).value=Math.round(level*100)+'%';if(!document.getElementById('on'+i).checked)return 'none';const scaled=source.replace(/opacity="([0-9.]+)"/g,(_,v)=>'opacity="'+Math.min(1,Number(v)*level)+'"');return 'url("data:image/svg+xml,'+encodeURIComponent(scaled)+'")'}).join(',')}
document.querySelectorAll('.controls input').forEach(e=>e.addEventListener('input',update));document.getElementById('showLayout').addEventListener('change',e=>document.getElementById('sample').hidden=!e.target.checked);update();
</script></body></html>'''.replace('CONTROLS',controls).replace('APP',app).replace('SOURCES',json.dumps([card,lines,stars]))
(out/'index.html').write_text(html,encoding='utf-8')
(out/'layers.css').write_text('''/* Apply only to the outer body. Paths are relative to this file. */
body {
  background-color: #101114;
  background-image: url("stars.svg"), url("connections.svg"), url("cards.svg");
  background-size: 900px 620px, 900px 620px, 760px 680px;
  background-position: 80px 40px, 80px 40px, 0 0;
  background-repeat: repeat;
}
''',encoding='utf-8')
print(out.resolve())
