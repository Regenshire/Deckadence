/* Decorative profit materials. Valuation never depends on this optional renderer. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fract = (x) => x - Math.floor(x),
    noise = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const states = new Map();
  function tier(total, cost) {
    if (!Number.isFinite(total) || !Number.isFinite(cost) || cost <= 0)
      return null;
    const gain = (total - cost) * 100;
    return gain < -50 * cost
      ? "heavy"
      : gain < -5 * cost
        ? "loss"
        : gain <= 5 * cost
          ? "even"
          : gain < 25 * cost
            ? "slight"
            : gain < 100 * cost
              ? "good"
              : "god";
  }
  function shimmer(ctx, w, h, t, kind, intensity) {
    // Warped interference bands: ripples curve and split rather than forming straight stripes.
    const step = 2,
      image = ctx.createImageData(w, h),
      data = image.data;
    const god = kind === "god",
      good = kind === "good";
    for (let y = 0; y < h; y += step)
      for (let x = 0; x < w; x += step) {
        const nx = x / w,
          ny = y / h;
        const warp =
          Math.sin(nx * 8 + ny * 2) * 0.035 +
          Math.sin(nx * 23 + ny * 3) * 0.013 +
          Math.sin(nx * 41 - ny * 4) * 0.005;
        const phase = god
          ? (ny + nx * 0.45 + warp) * 65 + t * 0.7
          : (nx * 0.85 + ny * 0.4) * 7 - t * 0.9;
        const hue = phase * 0.55 + t * 0.18;
        const r = 128 + 127 * Math.sin(hue),
          g = 128 + 127 * Math.sin(hue + 2.094),
          b = 128 + 127 * Math.sin(hue + 4.188);
        const edge = Math.pow(
          Math.max(Math.abs(nx - 0.5) * 2, Math.abs(ny - 0.5) * 2),
          1.4,
        );
        const ridge = Math.pow((Math.sin(phase) + 1) / 2, 10);
        const glint = Math.pow((Math.sin(phase * 0.43 + 1) + 1) / 2, 16);
        const grain = 0.88 + noise(x + y * w) * 0.12;
        const alpha =
          (god ? 0.12 + ridge * 0.42 + glint * 0.17 : 0.08 + ridge * 0.28) *
          (0.2 + edge * 0.8) *
          intensity *
          grain;
        for (let dy = 0; dy < step && y + dy < h; dy++)
          for (let dx = 0; dx < step && x + dx < w; dx++) {
            const i = ((y + dy) * w + x + dx) * 4;
            data[i] = good ? r * 0.5 + 125 : r;
            data[i + 1] = good ? g * 0.45 + 140 : g;
            data[i + 2] = good ? b * 0.55 + 110 : b;
            data[i + 3] = alpha * 255;
          }
      }
    ctx.putImageData(image, 0, 0);
    // A broad reflected light travels across the material independently of its embossed pattern.
    const sweep = (((t * 0.17) % 1.7) - 0.35) * w;
    const sheen = ctx.createLinearGradient(sweep - 70, 0, sweep + 70, h);
    sheen.addColorStop(0, "#ffffff00");
    sheen.addColorStop(0.5, "#fffbe92b");
    sheen.addColorStop(1, "#ffffff00");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
  }
  function sparks(ctx, w, h, t, amount, intensity, embers = false) {
    for (let i = 0; i < amount; i++) {
      const seed = noise(i + 8),
        age = fract(t * (embers ? 0.24 : 0.3) + seed);
      const x = noise(i + 40) * w + Math.sin(t + i) * 4;
      const y = embers
        ? h - age * (30 + noise(i + 12) * 45)
        : noise(i + 70) * h - Math.sin(t * 0.4 + i) * 6;
      const a = Math.pow(Math.sin(age * Math.PI), embers ? 2 : 8) * intensity;
      const radius = embers ? 1 : 1 + noise(i + 3) * 3;
      ctx.globalAlpha = a;
      ctx.fillStyle = embers ? "#ef6840" : "#fff5ca";
      ctx.shadowColor = embers ? "#ff452c" : "#ddc4ff";
      ctx.shadowBlur = embers ? 4 : 8;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        radius,
        embers ? radius : radius * 0.23,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (!embers) {
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 0.23, radius, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  function flames(ctx, w, h, t, heavy, intensity) {
    const glow = ctx.createLinearGradient(0, h, 0, h - 85);
    glow.addColorStop(0, heavy ? "#d9363655" : "#c839392b");
    glow.addColorStop(1, "#d9363600");
    ctx.fillStyle = glow;
    ctx.fillRect(0, h - 85, w, 85);
    ctx.filter = "blur(2px)";
    for (let i = 0; i < 15; i++) {
      const x = (i * w) / 14,
        seed = noise(i + 17),
        sway = Math.sin(t * 1.5 + i * 2.1) * 9;
      const height =
        (heavy ? 37 : 20) +
        (heavy ? 24 : 14) * Math.sin(t * 1.8 + i * 1.7) +
        seed * 20;
      const base = 9 + seed * 15;
      const grad = ctx.createLinearGradient(x, h, x, h - height);
      grad.addColorStop(0, heavy ? "#dc3b39aa" : "#ce4b4566");
      grad.addColorStop(0.5, "#ee69404d");
      grad.addColorStop(1, "#ee694000");
      ctx.fillStyle = grad;
      ctx.globalAlpha = intensity;
      ctx.beginPath();
      ctx.moveTo(x - base, h + 8);
      ctx.bezierCurveTo(
        x - base * 1.5,
        h - height * 0.4,
        x + sway + base,
        h - height * 0.6,
        x + sway,
        h - height,
      );
      ctx.bezierCurveTo(
        x + sway + 4,
        h - height * 0.5,
        x + base,
        h - height * 0.35,
        x + base,
        h + 8,
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    sparks(ctx, w, h, t, heavy ? 20 : 8, intensity * 0.55, true);
  }
  function draw(panel, t, intensity) {
    const canvas = panel.querySelector(".sim-profit-effects"),
      rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width),
      h = Math.round(rect.height);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const kind = panel.dataset.profitTier;
    if (kind === "god" || kind === "good") {
      shimmer(ctx, w, h, t, kind, intensity);
      sparks(ctx, w, h, t, kind === "god" ? 38 : 5, intensity);
    } else if (kind === "heavy" || kind === "loss")
      flames(ctx, w, h, t, kind === "heavy", intensity);
    else {
      const x = (Math.sin(t * 0.7) * 0.5 + 0.5) * w,
        g = ctx.createRadialGradient(x, h, 0, x, h, w * 0.8);
      g.addColorStop(0, kind === "slight" ? "#5ca78045" : "#b9ad8b26");
      g.addColorStop(1, "#ffffff00");
      ctx.globalAlpha = intensity;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  function stop(state) {
    cancelAnimationFrame(state.frame);
    state.frame = 0;
  }
  function play(panel, state) {
    stop(state);
    if (!state.key || !state.visible || document.hidden) return;
    const canvas = panel.querySelector(".sim-profit-effects");
    if (!canvas) return;
    if (reduce.matches) {
      draw(panel, 2.4, 0.35);
      return;
    }
    const start = performance.now();
    let last = -Infinity;
    function tick(now) {
      if (!panel.isConnected || !state.visible || document.hidden) {
        stop(state);
        return;
      }
      const t = (now - start) / 1000;
      try {
        if (now - last >= 33 || t >= 10) {
          draw(panel, t, Math.max(0.12, Math.min(1, t / 0.6, (10 - t) / 1.4)));
          last = now;
        }
      } catch {
        stop(state);
        canvas.remove();
        return;
      }
      if (t < 10) state.frame = requestAnimationFrame(tick);
      else state.frame = 0;
    }
    state.frame = requestAnimationFrame(tick);
  }
  function update(panel, total, cost, identity = "") {
    if (!panel) return;
    try {
      let state = states.get(panel);
      if (!state) {
        state = { frame: 0, key: null, visible: false };
        states.set(panel, state);
        const canvas = document.createElement("canvas");
        canvas.className = "sim-profit-effects";
        canvas.setAttribute("aria-hidden", "true");
        panel.prepend(canvas);
        const observer = new IntersectionObserver((entries) => {
          state.visible = entries[0].isIntersecting;
          if (state.visible) play(panel, state);
          else stop(state);
        });
        observer.observe(panel);
        state.observer = observer;
      }
      const kind = tier(total, cost),
        key = kind ? `${identity}:${total}:${cost}` : null;
      if (state.key === key) return;
      stop(state);
      state.key = key;
      if (!kind) {
        delete panel.dataset.profitTier;
        const canvas = panel.querySelector(".sim-profit-effects");
        canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      panel.dataset.profitTier = kind;
      play(panel, state);
    } catch {
      /* An unavailable canvas must not interrupt the simulator. */
    }
  }
  document.addEventListener("visibilitychange", () =>
    states.forEach((s, p) => (document.hidden ? stop(s) : play(p, s))),
  );
  reduce.addEventListener("change", () => states.forEach((s, p) => play(p, s)));
  window.addEventListener("pagehide", () => {
    states.forEach((s) => {
      stop(s);
      s.observer.disconnect();
    });
    states.clear();
  });
  window.DeckadenceProfitEffects = { update, tier };
})();
