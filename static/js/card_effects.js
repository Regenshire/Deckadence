/* Shared, opt-in card presentation. No card rules, image requests, or input capture.
 * Mark an artwork wrapper data-card-effects and data-is-foil="0|1", or call
 * DeckadenceCardEffects.attach(wrapper, {finish: "normal"|"foil"|"surge"}).
 * applyMetadata(image, {promo_types: [...]}) refines an existing foil instance.
 */
(() => {
  "use strict";
  if (window.DeckadenceCardEffects) return;
  const selector = "[data-card-effects]";
  const states = new WeakMap();
  const moving = new Set();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const motionScale = .65;
  let frame = 0, previousTime = 0;
  const clamp = value => Math.max(-1, Math.min(1, value));
  const isTrue = value => value === true || value === 1 || value === "1" || value === "true";

  function finishFor(surface) {
    const explicit = surface.dataset.cardFinish;
    if (["normal", "foil", "surge"].includes(explicit)) return explicit;
    const foilHost = surface.closest("[data-is-foil]");
    if (!isTrue(foilHost?.dataset.isFoil)) return "normal";
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
    if (states.has(surface)) return states.get(surface);
    surface.classList.add("card-effects");
    for (const kind of ["rainbow", "surge", "glare"]) {
      const layer = document.createElement("span");
      layer.className = `card-effect-layer card-effect-${kind}`;
      layer.setAttribute("aria-hidden", "true");
      surface.appendChild(layer);
    }
    const state = {surface, x:0, y:0, tx:0, ty:0, vx:0, vy:0, light:0, targetLight:0, bounds:null};
    states.set(surface, state);
    return state;
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
    if (!surface) return;
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
    if (surface) move(attach(surface), 0, 0, .4);
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
    if (root.matches?.(selector)) attach(root);
    root.querySelectorAll?.(selector).forEach(surface => attach(surface));
  }
  function applyMetadata(image, metadata) {
    const surface = image?.closest(selector);
    if (surface) attach(surface, metadata || {});
  }
  function copyToZoom(sourceImage, zoomImage) {
    const source = sourceImage?.closest(selector);
    if (!source || !zoomImage) return;
    let surface = zoomImage.closest(selector);
    if (!surface) {
      surface = document.createElement("span");
      surface.className = "card-effects-zoom";
      zoomImage.before(surface);
      surface.appendChild(zoomImage);
    }
    const state = attach(surface, {finish: finishFor(source)});
    reset(state);
  }
  function start() {
    enhance();
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === 1) enhance(node);
        }
      }
    }).observe(document.body, {childList:true, subtree:true});
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
  window.DeckadenceCardEffects = {attach, enhance, applyMetadata, copyToZoom, flip, reset:resetAll};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();
