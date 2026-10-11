from pathlib import Path
import math,random,re,json
import xml.etree.ElementTree as ET
import cairosvg
p=Path('static/img/themes/concepts');out=p/'card-constellations';out.mkdir(exist_ok=True)
W,H=1600,1100
# x, y, width, height, rotation: one coordinate system for cards and connections.
nodes=[(95,120,68,96,-13),(315,245,58,82,12),(165,475,80,112,-8),(410,650,66,94,16),(95,865,58,82,-16),(370,970,78,110,9),(650,100,64,90,-9),(775,355,82,116,8),(700,810,60,86,-15),(1030,625,76,108,-10),(1110,150,78,110,15),(1420,345,66,92,-12),(1340,775,82,116,12),(1500,1000,58,82,-8)]
symbols="WUBRGCCRWUGBUB"
edges=[(0,1),(1,2),(2,3),(2,4),(3,5),(6,7),(7,9),(8,9),(9,12),(10,11),(11,12)]
# Anchors are exact perimeter intersections in each rotated card's local space.
def anchor(n,target):
 x,y,w,h,degrees=n;a=math.radians(degrees);dx,dy=target[0]-x,target[1]-y
 lx=dx*math.cos(a)+dy*math.sin(a);ly=-dx*math.sin(a)+dy*math.cos(a)
 t=min(w/2/abs(lx) if lx else 1e6,h/2/abs(ly) if ly else 1e6)
 return x+dx*t,y+dy*t
paths=[];ports=[];relays=[]
def connection(na,nb):
 a=anchor(na,nb);b=anchor(nb,na)
 paths.append(f'M{a[0]:.2f} {a[1]:.2f}L{b[0]:.2f} {b[1]:.2f}')
 ports.extend([a,b])
 for t in [.34,.72]:relays.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
for a,b in edges:connection(nodes[a],nodes[b])
# Wrapped branches continue the power network seamlessly into adjacent tiles.
for a,b,ox,oy in [(5,6,0,H)]:
 na=nodes[a];nb=nodes[b];shifted=(nb[0]+ox,nb[1]+oy,*nb[2:]);start=anchor(na,shifted);end=anchor(shifted,na)
 for tx in (-W,0,W):
  for ty in (-H,0,H):
   if max(start[0]+tx,end[0]+tx)<0 or min(start[0]+tx,end[0]+tx)>W or max(start[1]+ty,end[1]+ty)<0 or min(start[1]+ty,end[1]+ty)>H:continue
   paths.append(f'M{start[0]+tx:.2f} {start[1]+ty:.2f}L{end[0]+tx:.2f} {end[1]+ty:.2f}')
   ports.extend([(start[0]+tx,start[1]+ty),(end[0]+tx,end[1]+ty)])
network=' '.join(paths)
body=f'<g id="connection-halo" fill="none" stroke="#7199ba" stroke-width="5" opacity=".028"><path d="{network}"/></g><g id="connections" fill="none" stroke="#819fb7" stroke-width=".9" opacity=".22"><path d="{network}"/></g>'

def mana_constellation(mana,size):
 # Each stroke is a small constellation: angular connections, no filled silhouette.
 sun=[(math.cos(a*math.pi/4)*23,math.sin(a*math.pi/4)*23) for a in range(9)]
 rays=[[(math.cos(a*math.pi/4)*23,math.sin(a*math.pi/4)*23),(math.cos(a*math.pi/4+.2)*44,math.sin(a*math.pi/4+.2)*44)] for a in range(8)]
 maps={
 'W':[sun]+rays,
 'U':[[(8,-45),(-11,-20),(-29,6),(-27,27),(-11,42),(10,43),(28,29),(30,10),(19,-9),(8,-45)],[(12,30),(21,17),(17,5)]],
 'B':[[(-32,14),(-40,-4),(-35,-26),(-18,-40),(8,-44),(29,-33),(40,-12),(34,13),(21,18),(18,40),(-18,40),(-21,18),(-32,14)],[(-25,-13),(-8,-9),(-11,5),(-26,2),(-25,-13)],[(9,-9),(26,-15),(28,1),(11,6),(9,-9)],[(-4,17),(0,9),(5,18)],[(-8,29),(-8,40)],[(7,28),(7,40)]],
 'R':[[(-29,29),(-37,10),(-27,-13),(-20,2),(-6,-15),(4,-44),(23,-27),(30,-7),(41,-12),(36,17),(21,37),(0,44),(-19,40),(-29,29)],[(-13,24),(-4,9),(9,-5),(7,17),(19,22),(9,34)]],
 'G':[[(-6,39),(-6,11),(-32,13),(-42,-1),(-35,-17),(-21,-20),(-18,-36),(0,-44),(18,-35),(22,-23),(38,-16),(43,1),(30,14),(7,11),(7,39)],[(-23,43),(-6,32),(0,21),(7,32),(24,43)],[(-6,11),(-19,-4)],[(7,11),(22,-7)],[(0,21),(0,-20)]],
 'C':[[(0,-44),(13,-12),(43,0),(13,13),(0,44),(-13,13),(-43,0),(-13,-12),(0,-44)]]
 }
 strokes=maps[mana];scale=size/100
 result=f'<g fill="none" stroke="#a8bfd1" stroke-width="{.7*scale:.3f}" stroke-linejoin="round" opacity=".3">'
 stars={}
 for stroke in strokes:
  points=' '.join(f'{x*scale:.2f},{y*scale:.2f}' for x,y in stroke)
  result+=f'<polyline points="{points}"/>'
  for x,y in stroke:stars[(round(x*scale,2),round(y*scale,2))]=True
 result+='</g><g fill="#c3d6e5">'
 for j,(x,y) in enumerate(stars):
  radius=(.85 if j%3 else 1.12)*scale
  if j%3==0:result+=f'<circle cx="{x}" cy="{y}" r="{2.5*scale:.3f}" opacity=".07"/>'
  result+=f'<circle cx="{x}" cy="{y}" r="{radius}" opacity="{.64 if j%3==0 else .43}"/>'
 result+='</g>'
 return result
body+='<g id="cards">'
for i,(x,y,w,h,rot) in enumerate(nodes):
 body+=f'<g id="card-{i+1}" transform="translate({x} {y}) rotate({rot})"><rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="3" fill="#101114" fill-opacity=".82" stroke="#b4ac9f" stroke-opacity=".28" stroke-width=".9"/>'
 # Mana-inspired star maps, enlarged to 76% of the card width.
 mana=symbols[i]
 size=w*.76
 glyph=mana_constellation(mana,size)
 body+=f'<g id="mana-{i+1}-{mana}">{glyph}</g>'
 for xx,yy in [(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]:body+=f'<circle cx="{xx}" cy="{yy}" r="1.3" fill="#d3cdc2" opacity=".4"/>'
 body+='</g>'
body+='</g><g id="junctions" fill="#b1c9db">'
for x,y in ports:
 body+=f'<circle cx="{x:.2f}" cy="{y:.2f}" r="4.5" opacity=".05"/><circle cx="{x:.2f}" cy="{y:.2f}" r="1.7" opacity=".48"/>'
body+='</g><g id="relay-stars" fill="#bbcedd" opacity=".3">'
for x,y in relays:body+=f'<circle cx="{x:.2f}" cy="{y:.2f}" r="1"/>'
body+='</g><g id="distant-stars" fill="#b0bdc9">'
r=random.Random(27)
for i in range(85):body+=f'<circle cx="{r.uniform(0,W):.2f}" cy="{r.uniform(0,H):.2f}" r="{r.uniform(.35,1):.2f}" opacity="{r.uniform(.06,.2):.2f}"/>'
body+='</g>'
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><title>Deckadence — Card Constellations</title><desc>A sparse, branching constellation network with Magic mana symbols. Lines meet the rotated edges of fourteen cards. Named groups preserve alignment for future effects.</desc>{body}</svg>'
(out/'card-constellations.svg').write_text(svg,encoding='utf-8')

# Per-edge timelines share their clock with each destination emblem.
mana_colors={'W':'#c2b78d','U':'#709ebf','B':'#a18ab7','R':'#b67e79','G':'#82a68d','C':'#adb7c0'}
styles=['.ley-route{opacity:0}', '.comet-breathe{animation:comet-breathe 3.6s ease-in-out infinite}', '@keyframes comet-breathe{0%,100%{opacity:.7}50%{opacity:1}}', '.mana-arrival{opacity:0;pointer-events:none}', '@media(prefers-reduced-motion:reduce){.ley-route,.mana-arrival{animation:none!important;display:none}.comet-breathe{animation:none!important}}']
fx='<g id="ley-lines" aria-hidden="true">';arrivals='<g id="mana-arrivals" aria-hidden="true">'
events=[]
for route,cycle,delay in [([0,1,2,3,5],88,-18),([10,11,12,9,7,6],106,-49)]:
 for step,(start,end) in enumerate(zip(route,route[1:])):events.append((start,end,step*17,cycle,delay))
events.extend([(2,4,34,88,-18),(9,8,51,106,-49)])
for n,(src,dst,start,cycle,delay) in enumerate(events):
 na,nb=nodes[src],nodes[dst];a=anchor(na,nb);b=anchor(nb,na)
 length=math.dist(a,b);angle=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]));tail=length*.19
 c1=mana_colors[symbols[src]];c2=mana_colors[symbols[dst]]
 # Head reaches the perimeter at 14 seconds; the tapered tail clears at 16.66.
 anim=f'flow-{n}'
 frames=[(0,f'opacity:0;transform:translateX(0px);color:{c1}'),(start/cycle*100,f'opacity:0;transform:translateX(0px);color:{c1}'),((start+.6)/cycle*100,'opacity:1'),((start+14)/cycle*100,f'opacity:1;transform:translateX({length}px);color:{c2}'),((start+16.66)/cycle*100,f'opacity:1;transform:translateX({length+tail}px);color:{c2}'),((start+16.67)/cycle*100,'opacity:0'),(100,f'opacity:0;transform:translateX({length+tail}px);color:{c2}')]
 styles.append('@keyframes '+anim+' {'+''.join(f'{t:.3f}%'+'{'+v+'}' for t,v in frames)+'}')
 # A rounded head tapers continuously to a point; clipping keeps it on the connection.
 shape=f'M 0 0 C 0 -2.125 -4 -2.125 -8 -1.615 Q {-tail*.55} -.8 {-tail} 0 Q {-tail*.55} .8 -8 1.615 C -4 2.125 0 2.125 0 0 Z'
 fx+=f'<defs><clipPath id="route-clip-{n}"><rect x="0" y="-16" width="{length}" height="32"/></clipPath></defs><g transform="translate({a[0]} {a[1]}) rotate({angle})"><g clip-path="url(#route-clip-{n})"><g class="ley-route" data-from="card-{src+1}" data-to="card-{dst+1}" style="animation:{anim} {cycle}s linear {delay}s infinite"><g class="comet-breathe" style="animation-delay:{-n*.43}s"><path d="{shape}" fill="currentColor" opacity=".32" filter="url(#ley-soften)" transform="scale(1 2.3)"/><path class="ley-core" d="{shape}" fill="currentColor" opacity=".72"/></g></g></g></g>'
 anim=f'arrive-{n}'
 frames=[(0,'opacity:0'),((start+14)/cycle*100,'opacity:0'),((start+14.22)/cycle*100,'opacity:1'),((start+14.65)/cycle*100,'opacity:.85'),((start+16.66)/cycle*100,'opacity:0'),(100,'opacity:0')]
 styles.append('@keyframes '+anim+' {'+''.join(f'{t:.3f}%'+'{'+v+'}' for t,v in frames)+'}')
 x,y,w,h,rot=nb
 emblem_color={'W':'#efdaa0','U':'#83c9f2','B':'#c39aee','R':'#f0a08c','G':'#a1dfb0','C':'#dae6ef'}[symbols[dst]]
 glyph=mana_constellation(symbols[dst],w*.76).replace('#a8bfd1',emblem_color).replace('#c3d6e5',emblem_color)
 # Full-strength colored lines and stars replace the dim neutral motif during arrival.
 glyph=glyph.replace('opacity=".3"','opacity="1"').replace('opacity="0.64"','opacity="1"').replace('opacity="0.43"','opacity="1"')
 glyph=re.sub(r'stroke-width="[0-9.]+"',f'stroke-width="{w*.017:.3f}"',glyph)
 outline=f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="3" fill="none" stroke="{c2}" stroke-width="1.6"/>'
 arrivals+=f'<g class="mana-arrival" data-card="card-{dst+1}" transform="translate({x} {y}) rotate({rot})" style="animation:{anim} {cycle}s ease-in-out {delay}s infinite"><g filter="url(#ley-soften)">{outline}<g stroke="{emblem_color}" stroke-width=".7">{glyph}</g></g>{outline}<g class="arrival-emblem">{glyph}</g></g>'
fx+='</g>';arrivals+='</g>'
fx_style='<style>'+''.join(styles)+'</style><defs><filter id="ley-soften" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.7"/></filter></defs>'
animated=svg.replace('<g id="cards">',fx_style+fx+'<g id="cards">',1).replace('</svg>',arrivals+'</svg>')
(out/'card-constellations-animated.svg').write_text(animated,encoding='utf-8')

source=(p/'index.html').read_text(encoding='utf-8');app=re.search(r'<main id="sample">(.*?)<p>',source,re.S).group(1)
appbody=re.sub(r'^<svg[^>]*><title>.*?</title>|</svg>$','',app,flags=re.S)
# Full field and application context, both with an opaque night-sky base.
for name,extra in [('background-only',''),('preview',appbody)]:
 scene=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100"><rect width="1600" height="1100" fill="#101114"/>{body}{extra}</svg>'
 cairosvg.svg2png(bytestring=scene.encode(),write_to=str(out/(name+'.png')))
html='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Card Constellations — Deckadence</title><style>
*{box-sizing:border-box}body{margin:0;background-color:#101114;background-size:1600px 1100px;background-repeat:repeat;color:#e4e8ef;font-family:Arial,sans-serif}header{padding:18px 24px;background:#1a1c21;border-bottom:1px solid #343844;display:flex;align-items:center;flex-wrap:wrap;gap:22px}h1{font-size:18px;margin:0}label{display:flex;align-items:center;gap:9px;font-size:13px}input{accent-color:#7897b4}a{color:#b0c5d6;font-size:13px}main{max-width:1000px;margin:32px auto;padding:0 20px}main svg{width:100%;height:auto;display:block}main[hidden]{display:none}body:has(main[hidden]){min-height:1400px}.note{padding:14px 24px;background:#1a1c21;color:#a9b0be;font-size:13px;line-height:1.5}</style></head><body><header><h1>Card Constellations</h1><label><input id="layout" type="checkbox" checked>Show sample layout</label><label>Intensity<input id="intensity" type="range" min="30" max="150" value="100"><output id="value">100%</output></label><label><input id="motion" type="checkbox" checked> Ley-line animation</label><a href="card-constellations-animated.svg">Animated SVG</a></header><div class="note">Larger mana-shaped star constellations sit inside fourteen cards. Sparse branching connections end at card edges, with one solitary card beyond the network. Ley lines inherit the source mana color and blend toward the destination: blue to violet for black mana, warm gold for white, ember for red, sage for green, and silver for colorless. Comet-shaped pulses breathe between 70–100% intensity. Card outlines and mana stars light up as the head arrives and fade as the tail passes. Reduced-motion preferences disable the effect.</div><main id="sample">APP</main><script>
const source=SOURCE;const animatedSource=ANIMATED;const motion=document.getElementById('motion');const intensity=document.getElementById('intensity');function render(){const level=Number(intensity.value)/100;document.getElementById('value').value=intensity.value+'%';const svg=(motion.checked?animatedSource:source).replace(/(?<!fill-)opacity="([0-9.]+)"/g,(_,n)=>'opacity="'+Math.min(1,Number(n)*level)+'"');document.body.style.backgroundImage='url("data:image/svg+xml,'+encodeURIComponent(svg)+'")'}intensity.addEventListener('input',render);motion.addEventListener('change',render);document.getElementById('layout').addEventListener('change',e=>document.getElementById('sample').hidden=!e.target.checked);render();
</script></body></html>'''.replace('APP',app).replace('SOURCE',json.dumps(svg)).replace('ANIMATED',json.dumps(animated))
(out/'index.html').write_text(html,encoding='utf-8')
print(out.resolve())

# Enlarged detail strip to inspect all six star symbols.
detail='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="260"><rect width="1200" height="260" fill="#101114"/>'
for j,(mana,name) in enumerate(zip('WUBRGC',['White','Blue','Black','Red','Green','Colorless'])):
 detail+=f'<g transform="translate({100+j*200} 108)">{mana_constellation(mana,155)}</g><text x="{100+j*200}" y="225" text-anchor="middle" font-family="Arial" font-size="17" fill="#a9b0be">{name}</text>'
detail+='</svg>'
cairosvg.svg2png(bytestring=detail.encode(),write_to=str(out/'mana-star-details.png'))

# Production assets: transparent tiles for both theme schemes.
for scheme in ('dark', 'light'):
 for suffix, content in [('', svg), ('-animated', animated)]:
  if scheme == 'light':
   for old, new in {'#101114':'#d8d3c9', '#b4ac9f':'#6b6254', '#a8bfd1':'#435c72', '#c3d6e5':'#3c5468', '#819fb7':'#465c70', '#b1c9db':'#52667a', '#b0bdc9':'#4b5d70', '#bbcedd':'#52667a', '#d3cdc2':'#6b6254', '#efdaa0':'#967020', '#83c9f2':'#2878ae', '#c39aee':'#8250b3', '#f0a08c':'#b8543e', '#a1dfb0':'#397e4b', '#dae6ef':'#536776'}.items():
    content=content.replace(old,new)
  (p.parent/f'card-constellation-{scheme}{suffix}.svg').write_text(content,encoding='utf-8')

# Pre-render arrival artwork once; the app only blits these small raster sprites.
for scheme in ('dark', 'light'):
 content=f'<svg xmlns="http://www.w3.org/2000/svg" width="1792" height="144">'
 for i,(x,y,w,h,rot) in enumerate(nodes):
  color=({'W':'#efdaa0','U':'#83c9f2','B':'#c39aee','R':'#f0a08c','G':'#a1dfb0','C':'#dae6ef'} if scheme=='dark' else {'W':'#967020','U':'#2878ae','B':'#8250b3','R':'#b8543e','G':'#397e4b','C':'#536776'})[symbols[i]]
  glyph=mana_constellation(symbols[i],w*.76).replace('#a8bfd1',color).replace('#c3d6e5',color)
  glyph=glyph.replace('opacity=".3"','opacity="1"').replace('opacity="0.64"','opacity="1"').replace('opacity="0.43"','opacity="1"')
  glyph=re.sub(r'stroke-width="[0-9.]+"',f'stroke-width="{w*.017:.3f}"',glyph)
  content+=f'<g transform="translate({i*128+64} 72)"><rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="3" fill="none" stroke="{color}" stroke-width="1.6"/>{glyph}</g>'
 content+='</svg>'
 cairosvg.svg2png(bytestring=content.encode(),write_to=str(p.parent/f'constellation-arrivals-{scheme}.png'))
(p.parent/'constellation-motion.json').write_text(json.dumps({'nodes':nodes,'events':[{'src':src,'dst':dst,'start':start,'cycle':cycle,'delay':delay,'a':anchor(nodes[src],nodes[dst]),'b':anchor(nodes[dst],nodes[src])} for src,dst,start,cycle,delay in events],'colors':[mana_colors[m] for m in symbols]}))
