// *** CARD EFFECTS - Show Foil and Card Lighting Effects ***
/* Shared, opt-in card presentation. No card rules, image requests, or input capture.
 * Mark an artwork wrapper data-card-effects and data-is-foil="0|1", or call
 * DeckadenceCardEffects.attach(wrapper, {finish: "normal"|"foil"|"surge"}).
 * applyMetadata(image, {promo_types: [...]}) refines an existing foil instance.
 */
(() => {
  "use strict";
  if (window.DeckadenceCardEffects) return;
  const selector = "[data-card-effects]";
  const candidates = selector + ", .deckbuilder-card-image-wrap, .custom-draft-current-card-image-wrap, .custom-draft-current-grid-card .chaos-pack-view-image-wrap";
  const foilSettingsUrl = new URL("../img/card-effects/foil-settings.json", document.currentScript.src);
  let foilSettingsPromise;
  function applyCustomPlacement(surface) {
    if (!foilSettingsPromise) {
      foilSettingsPromise = fetch(foilSettingsUrl, {cache: "no-store"})
        .then(response => { if (!response.ok) throw new Error("Could not load foil settings"); return response.json(); })
        .catch(error => { console.warn(error); return {}; });
    }
    foilSettingsPromise.then(settings => {
      const preset = settings[surface.dataset.cardEffectFinish] || {};
      const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
      surface.style.setProperty("--foil-scale", number(preset.scale, 1, .1, 2));
      surface.style.setProperty("--foil-x", number(preset.x_percent, 0, -100, 100) + "%");
      surface.style.setProperty("--foil-y", number(preset.y_percent, 0, -100, 100) + "%");
      const color = /^#[0-9a-f]{6}$/i.test(preset.color || "") ? preset.color : "#ffffff";
      surface.style.setProperty("--foil-color", color);
      surface.style.setProperty("--foil-strength", number(preset.strength, .65, 0, 1));
      surface.style.setProperty("--foil-blend", ["normal", "screen", "overlay", "soft-light"].includes(preset.blend_mode) ? preset.blend_mode : "normal");
      surface.dataset.foilPlacementReady = "1";
    });
  }
  const states = new WeakMap();
  const spotMasks = new WeakMap();
  const glossMasks = new WeakMap();
  const glossReliefs = new WeakMap();
  let glossFilterId = 0;
  const moving = new Set();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const motionScale = .65;
  let frame = 0, previousTime = 0;
  const clamp = value => Math.max(-1, Math.min(1, value));
  const isTrue = value => value === true || value === 1 || value === "1" || value === "true";

  function finishFor(surface) {
    if (spotMasks.has(surface)) return spotMasks.get(surface).finish;
    const explicit = surface.dataset.cardFinish;
    if (["normal", "foil", "surge", "chocobo"].includes(explicit)) return explicit;
    const foilHost = surface.closest("[data-is-foil]");
    if (!isTrue(foilHost?.dataset.isFoil)) return "normal";
    const selected = surface.closest("[data-foil-type]")?.dataset.foilType;
    if (["foil", "surge", "chocobo"].includes(selected)) return selected;
    return surface.dataset.cardSurge === "1" ? "surge" : "foil";
  }

  function attach(surface, options = {}) {
    if (!surface || !surface.querySelector("img")) return null;
    surface.setAttribute("data-card-effects", "");
    if (options.finish) surface.dataset.cardFinish = options.finish;
    if (options.isFoil !== undefined) surface.dataset.isFoil = isTrue(options.isFoil) ? "1" : "0";
    if (Array.isArray(options.promo_types)) {
      surface.dataset.cardSurge = options.promo_types.includes("surgefoil") ? "1" : "0";
    }
    surface.dataset.cardEffectFinish = finishFor(surface);
    if (surface.dataset.cardEffectFinish === "chocobo") applyCustomPlacement(surface);
    if (states.has(surface)) { syncSpotMask(surface); syncGloss(surface); return states.get(surface); }
    surface.classList.add("card-effects");
    // Grid/stack views clone card DOM; copied layers have no animation state.
    surface.querySelectorAll(":scope > .card-effect-layer, :scope > .card-spot-clip, :scope > .card-gloss-layer").forEach(layer => layer.remove());
    for (const kind of ["rainbow", "surge", "custom", "glare"]) {
      const layer = document.createElement("span");
      layer.className = `card-effect-layer card-effect-${kind}`;
      layer.setAttribute("aria-hidden", "true");
      surface.appendChild(layer);
    }
    const state = {surface, x:0, y:0, tx:0, ty:0, vx:0, vy:0, light:0, targetLight:0, bounds:null};
    states.set(surface, state);
    syncSpotMask(surface);
    syncGloss(surface);
    reset(state);
    return state;
  }

  function syncSpotMask(surface) {
    const spot = spotMasks.get(surface);
    if (!spot) {
      surface.querySelectorAll(":scope > .card-spot-clip").forEach(clip => clip.replaceWith(...clip.childNodes));
      surface.style.removeProperty("--spot-foil-mask");
      surface.style.removeProperty("--spot-foil-strength");
      return;
    }
    surface.style.setProperty("--spot-foil-mask", `url("${spot.maskUrl}")`);
    surface.style.setProperty("--spot-foil-strength", spot.strength / 100);
    // Clip outside each effect's own transforms and texture mask. Moving light and
    // custom-pattern placement must never move the painted selection itself.
    surface.querySelectorAll(":scope > .card-effect-layer").forEach(layer => {
      const clip = document.createElement("span");
      clip.className = "card-spot-clip " + [...layer.classList].find(name => name !== "card-effect-layer") + "-clip";
      clip.setAttribute("aria-hidden", "true");
      layer.before(clip); clip.appendChild(layer);
    });
  }

  function setSpotFoil(surface, spot) {
    if (!surface) return;
    if (spot) spotMasks.set(surface, spot);
    else spotMasks.delete(surface);
    attach(surface);
  }
  function syncGloss(surface) {
    const gloss=glossMasks.get(surface);
    let layer=surface.querySelector(":scope > .card-gloss-layer");
    if(!gloss) {layer?.remove();glossReliefs.delete(surface);surface.style.removeProperty("--card-gloss-mask");surface.style.removeProperty("--card-gloss-strength");return;}
    if(!layer) {
      layer=document.createElement("span");layer.className="card-gloss-layer";layer.setAttribute("aria-hidden","true");surface.appendChild(layer);
      glossReliefs.set(surface, createGlossRelief(layer));
    }
    const relief=glossReliefs.get(surface);
    if(relief.url!==gloss.maskUrl) {
      relief.url=gloss.maskUrl;
      relief.image.setAttribute("href",gloss.maskUrl);
      surface.style.setProperty("--card-gloss-mask",`url("${gloss.maskUrl}")`);
    }
    const strength=Number(gloss.strength);
    surface.style.setProperty("--card-gloss-strength",Math.max(0,Math.min(100,Number.isFinite(strength)?strength:100))/100);
    layer.dataset.finish=gloss.finish==="polished" ? "polished" : "gloss";
    lightGloss(surface, states.get(surface));
  }
  function createGlossRelief(layer) {
    const svgNS="http://www.w3.org/2000/svg";
    const node=(name,attrs={},parent)=>{
      const element=document.createElementNS(svgNS,name);
      for(const [key,value] of Object.entries(attrs))element.setAttribute(key,String(value));
      parent?.appendChild(element);return element;
    };
    const id=`deckadence-gloss-relief-${++glossFilterId}`;
    const svg=node("svg",{viewBox:"0 0 756 1056",preserveAspectRatio:"none",focusable:"false","aria-hidden":"true"},layer);
    const defs=node("defs",{},svg);
    const filter=node("filter",{id,x:0,y:0,width:756,height:1056,filterUnits:"userSpaceOnUse","color-interpolation-filters":"sRGB"},defs);
    // Treat mask coverage as raised clear-coat height. Subtract shifted height
    // maps so flat interiors stay fully transparent, even at partial coverage.
    node("feGaussianBlur",{in:"SourceAlpha",stdDeviation:.9,result:"height"},filter);
    const specular=node("feSpecularLighting",{in:"height",surfaceScale:3.5,specularConstant:.45,specularExponent:64,"lighting-color":"white",result:"specular"},filter);
    const light=node("feDistantLight",{azimuth:225,elevation:50},specular);
    const highlight=node("feOffset",{in:"height",dx:3,dy:3,result:"highlightOffset"},filter);
    node("feComposite",{in:"height",in2:"highlightOffset",operator:"arithmetic",k2:1,k3:-1,result:"highlightEdge"},filter);
    node("feFlood",{"flood-color":"white","flood-opacity":.65,result:"highlightColor"},filter);
    node("feComposite",{in:"highlightColor",in2:"highlightEdge",operator:"in",result:"highlight"},filter);
    const shadow=node("feOffset",{in:"height",dx:-3,dy:-3,result:"shadowOffset"},filter);
    node("feComposite",{in:"height",in2:"shadowOffset",operator:"arithmetic",k2:1,k3:-1,result:"shadowEdge"},filter);
    node("feFlood",{"flood-color":"black","flood-opacity":.48,result:"shadowColor"},filter);
    node("feComposite",{in:"shadowColor",in2:"shadowEdge",operator:"in",result:"shadow"},filter);
    const merge=node("feMerge",{result:"bevel"},filter);
    node("feMergeNode",{in:"shadow"},merge);node("feMergeNode",{in:"highlight"},merge);node("feMergeNode",{in:"specular"},merge);
    node("feComposite",{in:"bevel",in2:"SourceAlpha",operator:"in"},filter);
    const image=node("image",{width:756,height:1056,preserveAspectRatio:"none",filter:`url(#${id})`},svg);
    return {image,highlight,shadow,light,url:null};
  }
  function lightGloss(surface, state) {
    const relief=glossReliefs.get(surface);if(!relief)return;
    // A fixed upper-left light at rest; tilt moves the light over the bevel.
    const dx=2.4-(state?.x||0)*4.8, dy=2.4-(state?.y||0)*4.8;
    relief.highlight.setAttribute("dx",dx.toFixed(2));relief.highlight.setAttribute("dy",dy.toFixed(2));
    relief.shadow.setAttribute("dx",(-dx).toFixed(2));relief.shadow.setAttribute("dy",(-dy).toFixed(2));
    relief.light.setAttribute("azimuth",(Math.atan2(-dy,-dx)*180/Math.PI+360).toFixed(2));
    relief.light.setAttribute("elevation",(50-Math.min(1,Math.hypot(state?.x||0,state?.y||0))*14).toFixed(2));
  }
  function setGloss(surface, gloss) {
    if(!surface)return;
    if(gloss)glossMasks.set(surface,gloss);else glossMasks.delete(surface);
    attach(surface);
  }

  function setInteractive(surface, enabled) {
    surface.dataset.cardEffectsInteractive = String(enabled);
    const state = states.get(surface);
    if (state) reset(state);
  }

  function paint(state) {
    const {surface, x, y, light} = state;
    surface.style.setProperty("--card-rx", `${-y * 9 * motionScale}deg`);
    surface.style.setProperty("--card-ry", `${x * 12 * motionScale}deg`);
    surface.style.setProperty("--card-scale", 1 + light * .025 * motionScale);
    surface.style.setProperty("--card-mx", `${50 + x * 45}%`);
    surface.style.setProperty("--card-my", `${50 + y * 40}%`);
    surface.style.setProperty("--card-shift", `${50 - x * 38}%`);
    surface.style.setProperty("--card-light", light.toFixed(3));
    // The embossed ripple does not slide across the printing. Only its light changes.
    surface.style.setProperty("--card-hue", `${x * 65 + y * 40}deg`);
    lightGloss(surface, state);
  }

  function reset(state) {
    state.x = state.y = state.tx = state.ty = state.vx = state.vy = 0;
    state.light = state.targetLight = 0;
    state.bounds = null;
    paint(state);
    state.surface.classList.remove("card-effects-moving");
    moving.delete(state);
  }

  function tick(time) {
    const dt = Math.min(2, Math.max(.2, (time - (previousTime || time - 16.67)) / 16.67));
    previousTime = time;
    moving.forEach(state => {
      if (!state.surface.isConnected || !state.surface.getClientRects().length || reduced.matches) {
        reset(state);
        return;
      }
      state.vx = (state.vx + (state.tx - state.x) * .12 * dt) * Math.pow(.69, dt);
      state.vy = (state.vy + (state.ty - state.y) * .12 * dt) * Math.pow(.69, dt);
      state.x += state.vx * dt;
      state.y += state.vy * dt;
      state.light += (state.targetLight - state.light) * Math.min(1, .16 * dt);
      paint(state);
      if (Math.abs(state.tx-state.x) + Math.abs(state.ty-state.y) + Math.abs(state.vx) + Math.abs(state.vy) + Math.abs(state.targetLight-state.light) < .002) {
        state.x = state.tx; state.y = state.ty; state.light = state.targetLight;
        paint(state);
        moving.delete(state);
        state.surface.classList.remove("card-effects-moving");
      }
    });
    frame = moving.size ? requestAnimationFrame(tick) : 0;
    if (!frame) previousTime = 0;
  }

  function move(state, x, y, light) {
    if (!state) return;
    if (reduced.matches) return reset(state);
    state.tx = clamp(x); state.ty = clamp(y); state.targetLight = light;
    moving.add(state);
    state.surface.classList.add("card-effects-moving");
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function fromEvent(event) {
    return event.target instanceof Element ? event.target.closest(selector) : null;
  }
  document.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || event.buttons || reduced.matches) return;
    const surface = fromEvent(event);
    if (!surface || surface.dataset.cardEffectsInteractive === "false") return;
    const state = attach(surface);
    if (!state) return;
    if (!state.bounds) state.bounds = surface.getBoundingClientRect();
    const bounds = state.bounds;
    if (bounds.width && bounds.height) {
      move(state, 2*(event.clientX-bounds.left)/bounds.width-1, 2*(event.clientY-bounds.top)/bounds.height-1, 1);
    }
  }, {passive:true});
  document.addEventListener("pointerout", event => {
    const surface = fromEvent(event);
    if (surface && !surface.contains(event.relatedTarget)) {
      const state = states.get(surface);
      if (state) { state.bounds = null; move(state, 0, 0, 0); }
    }
  }, {passive:true});
  document.addEventListener("focusin", event => {
    const surface = fromEvent(event);
    if (surface && surface.dataset.cardEffectsInteractive !== "false") move(attach(surface), 0, 0, .4);
  });
  document.addEventListener("focusout", event => {
    const state = states.get(fromEvent(event));
    if (state) move(state, 0, 0, 0);
  });
  function resetAll() {
    document.querySelectorAll(selector).forEach(surface => {
      const state = states.get(surface);
      if (state) reset(state);
    });
    if (frame) cancelAnimationFrame(frame);
    frame = previousTime = 0;
  }
  document.addEventListener("dragstart", resetAll, true);
  document.addEventListener("pointercancel", resetAll, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) resetAll(); });
  window.addEventListener("blur", resetAll);
  window.addEventListener("resize", resetAll, {passive:true});
  document.addEventListener("scroll", resetAll, {passive:true, capture:true});
  reduced.addEventListener("change", resetAll);

  function enhance(root = document) {
    if (root.matches?.(candidates)) attach(root);
    root.querySelectorAll?.(candidates).forEach(surface => attach(surface));
  }
  function applyMetadata(image, metadata) {
    const surface = image?.closest(selector);
    if (surface) attach(surface, metadata || {});
  }
  function copyToZoom(sourceImage, zoomImage) {
    const source = sourceImage?.closest(selector);
    if (!zoomImage) return;
    if (!source) {
      const previous = zoomImage.closest(selector);
      if (previous) { setSpotFoil(previous, null); setGloss(previous, null); attach(previous, {finish: "normal"}); }
      return;
    }
    let surface = zoomImage.closest(selector);
    if (!surface) {
      surface = document.createElement("span");
      surface.className = "card-effects-zoom";
      zoomImage.before(surface);
      surface.appendChild(zoomImage);
    }
    setSpotFoil(surface, spotMasks.get(source) || null);
    setGloss(surface, glossMasks.get(source) || null);
    const state = attach(surface, {finish: finishFor(source)});
    reset(state);
  }
  function start() {
    enhance();
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") { enhance(record.target); continue; }
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) enhance(node);
        }
      }
    }).observe(document.body, {childList:true, subtree:true, attributes:true,
      attributeFilter:["data-foil-type", "data-is-foil", "data-card-surge", "data-card-finish"]});
  }
  async function flip(image, changeFace) {
    if (!image || image.dataset.cardFlipping) return;
    if (reduced.matches || typeof image.animate !== "function") { changeFace(); return; }
    let face = image;
    const animations = [];
    face.dataset.cardFlipping = "1";
    face.classList.add("chaos-pack-inline-card-flipping");
    // The same 280ms edge-on flip used by Chaos Draft's double-faced cards.
    // WAAPI takes precedence over the CSS class, which hides foil overlays.
    try {
      const out = face.animate([
        {transform:"rotateY(0deg) scale(1)",filter:"brightness(1)"},
        {transform:"rotateY(88deg) scale(.985)",filter:"brightness(1.15)"}
      ], {duration:140,fill:"both",easing:"ease-in"});
      animations.push(out); await out.finished.catch(() => {});
      const next = changeFace();
      face.classList.remove("chaos-pack-inline-card-flipping");
      delete face.dataset.cardFlipping;
      face = next || image;
      face.dataset.cardFlipping = "1";
      face.classList.add("chaos-pack-inline-card-flipping");
      out.cancel();
      const back = face.animate([
        {transform:"rotateY(88deg) scale(.985)",filter:"brightness(1.15)"},
        {transform:"rotateY(0deg) scale(1)",filter:"brightness(1)"}
      ], {duration:140,fill:"both",easing:"ease-out"});
      animations.push(back); await back.finished.catch(() => {});
    } finally {
      animations.forEach(a => a.cancel());
      for (const el of new Set([image,face])) {
        el.classList.remove("chaos-pack-inline-card-flipping");
        delete el.dataset.cardFlipping;
      }
    }
  }
  window.DeckadenceCardEffects = {attach, enhance, applyMetadata, copyToZoom, flip, reset:resetAll, setSpotFoil, setGloss, setInteractive};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();
