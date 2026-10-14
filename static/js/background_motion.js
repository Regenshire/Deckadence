// *** BACKGROUND MOTION - Animate Theme Backgrounds ***
/* Bounded raster overlay: no animated SVGs, live blur, or full-page filters. */
(() => {
  "use strict";
  const base = document.currentScript.dataset.tileBase;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let state, data, atlas, canvas, ctx, timer = 0, generation = 0, loaded;
  const atlases = {};
  const colors = [];
  function stop() {
    clearTimeout(timer); timer = 0;
    if (canvas) { canvas.remove(); canvas = ctx = null; }
  }
  function enabled() {
    return state?.background && state.backgroundType === 'constellation' && state.backgroundAnimations && state.backgroundIntensity > 0 && !document.hidden && !reduced.matches;
  }
  function load() {
    if (!loaded) loaded = Promise.all([
      fetch(base + 'constellation-motion.json?v=2').then(r => { if (!r.ok) throw Error('Motion data unavailable'); return r.json(); }).then(value => {
        data = value; colors.length = 0;
        value.colors.forEach(hex => colors.push([1,3,5].map(i => parseInt(hex.slice(i,i+2),16))));
      }),
      ...['dark','light'].map(scheme => new Promise((resolve,reject) => {
        const img = new Image(); img.onload = () => { atlases[scheme] = img; resolve(); }; img.onerror = reject;
        img.src = base + `constellation-arrivals-${scheme}.png?v=2`;
      }))
    ]).catch(() => { loaded = null; throw Error('Background animation unavailable'); });
    return loaded;
  }
  function resize() {
    if (!canvas) return;
    // Independent of display DPR: cap the backing surface at two megapixels.
    const ratio = Math.min(1, Math.sqrt(2000000 / (innerWidth * innerHeight)));
    canvas.width = Math.ceil(innerWidth * ratio); canvas.height = Math.ceil(innerHeight * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
  }
  function frame() {
    if (!enabled() || !ctx) { stop(); return; }
    const begin = performance.now();
    const t = begin / 1000, scale = 1.4 * state.backgroundSize / 100;
    ctx.clearRect(0,0,innerWidth,innerHeight);
    const alpha = Math.min(1,state.backgroundIntensity / 100);
    for (let ty=0;ty<innerHeight;ty+=1100*scale) for (let tx=0;tx<innerWidth;tx+=1600*scale) {
      ctx.save(); ctx.translate(tx,ty); ctx.scale(scale,scale);
      for (const [index,e] of data.events.entries()) {
        const age = ((t-e.delay)%e.cycle+e.cycle)%e.cycle-e.start;
        if (age < 0 || age > 16.66) continue;
        const [ax,ay]=e.a,[bx,by]=e.b, dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy),tail=length*.19;
        if (age<=16.66) {
          const mix=Math.min(1,age/14), c=colors[e.src].map((v,i)=>Math.round(v+(colors[e.dst][i]-v)*mix));
          ctx.save();ctx.translate(ax,ay);ctx.rotate(Math.atan2(dy,dx));
          ctx.beginPath();ctx.rect(0,-12,length,24);ctx.clip();ctx.translate(length*age/14,0);
          const breathe=.85-.15*Math.cos((t+index*.43)*Math.PI*2/3.6);
          ctx.globalAlpha=alpha*breathe*Math.min(1,age/.6);
          // Three translucent silhouettes approximate a soft glow without blur filters.
          for (const [width,opacity] of [[2.8,.045],[1.8,.09],[1,.72]]) {
            ctx.save();ctx.scale(1,width);ctx.fillStyle=`rgba(${c.join(',')},${opacity})`;
            ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(0,-2.125,-4,-2.125,-8,-1.615);
            ctx.quadraticCurveTo(-tail*.55,-.8,-tail,0);ctx.quadraticCurveTo(-tail*.55,.8,-8,1.615);
            ctx.bezierCurveTo(-4,2.125,0,2.125,0,0);ctx.fill();ctx.restore();
          }
          ctx.restore();
        }
        if (age>14) {
          const [x,y,w,h,rotation]=data.nodes[e.dst];
          const opacity=age<14.22?(age-14)/.22:Math.max(0,1-(age-14.22)/2.44);
          ctx.save();ctx.translate(x,y);ctx.rotate(rotation*Math.PI/180);ctx.globalAlpha=alpha*opacity;
          ctx.drawImage(atlas,e.dst*128,0,128,144,-64,-72,128,144);ctx.restore();
        }
      }
      ctx.restore();
    }
    // At most 30 draws/sec even on high-refresh monitors; no work in hidden tabs.
    timer=setTimeout(frame,Math.max(0,1000/30-(performance.now()-begin)));
  }
  async function update(next) {
    if (next) state=next;
    const token=++generation;stop();
    if (!enabled()) return;
    try { await load(); } catch (_) { return; }
    if (token!==generation || !enabled()) return;
    atlas=atlases[document.documentElement.dataset.themeScheme] || atlases.dark;
    canvas=document.createElement('canvas');canvas.className='theme-motion';canvas.setAttribute('aria-hidden','true');
    document.body.append(canvas);ctx=canvas.getContext('2d');
    if (!ctx) { stop(); return; }
    resize();frame();
  }
  window.DeckadenceBackgroundMotion={update};
  document.addEventListener('visibilitychange',()=>update());
  reduced.addEventListener('change',()=>update());
  window.addEventListener('resize',resize);
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',()=>update());
})();
