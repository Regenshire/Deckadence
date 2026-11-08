// *** SHARED SPIN LOGO - Theme-aware Arcane Circle ***
function initializeSpinLogoAnimation(spinCtaButton) {
  const canvas = spinCtaButton.querySelector(".chaos-draft-orbit-canvas");
  const baseImage = spinCtaButton.querySelector(".chaos-draft-spin-logo-base");

  if (!canvas || !baseImage || canvas.dataset.animationInitialized) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  canvas.dataset.animationInitialized = "true";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fullTurn = Math.PI * 2;
  const palettes = {
    dark: {
      light: false,
      cards: [
        { name: "White", edge: "#fff3d6", face: "#514d43" },
        { name: "Blue", edge: "#32b6ff", face: "#123c56" },
        { name: "Black", edge: "#8e939e", face: "#11151e" },
        { name: "Red", edge: "#f06b65", face: "#502b33" },
        { name: "Green", edge: "#2bb673", face: "#173e36" },
        { name: "Artifact", edge: "#c5d0dc", face: "#485660" },
        { name: "Multicolor", edge: "#edc45b", face: "#574a2f" },
      ],
      ring: "#efcb79",
      head: "#ffe5a3",
      spark: "#ffebba",
      orbit: "rgba(131, 182, 197, 0.12)",
      logo: ["#5adeff", "#00b9f1", "#008bc9"],
      logoShadow: "#00bfff",
    },
    light: {
      light: true,
      cards: [
        { name: "White", edge: "#9b7c43", face: "#f8f1df" },
        { name: "Blue", edge: "#0871a8", face: "#d9eaf4" },
        { name: "Black", edge: "#626b79", face: "#232934" },
        { name: "Red", edge: "#ad3e3b", face: "#f0dcd7" },
        { name: "Green", edge: "#2a734b", face: "#dbe8d7" },
        { name: "Artifact", edge: "#637381", face: "#e1e6eb" },
        { name: "Multicolor", edge: "#9b731c", face: "#eddfaf" },
      ],
      ring: "#77541a",
      head: "#87601c",
      spark: "#fffae6",
      orbit: "rgba(100, 83, 47, 0.36)",
      logo: ["#19b9e8", "#009dce", "#007ca8"],
      logoShadow: "#24748a",
    },
  };
  function currentPalette() {
    return palettes[document.documentElement.dataset.themeScheme] || palettes.dark;
  }
  let palette = currentPalette();
  // Cache the SVG tint per scheme, retaining its exact shape and a static fallback.
  const illuminatedLogo = document.createElement("canvas");
  illuminatedLogo.width = 856;
  illuminatedLogo.height = 856;
  const logoContext = illuminatedLogo.getContext("2d");
  const baseRotationsPerSecond = 1 / 24;
  const maxRotationsPerSecond = 1.5;
  const accelerationMarginRatio = 0.05;
  const speedResponse = 10;

  let targetRotationsPerSecond = baseRotationsPerSecond;
  let currentRotationsPerSecond = baseRotationsPerSecond;
  let currentAngle = 80;
  let previousTimestamp = null;
  let animationFrame = null;
  let inView = false;
  let effectTime = 2.8;

  function drawSparkle(x, y, radius, color, opacity, outline = null) {
    context.save();
    context.translate(x, y);
    context.fillStyle = color;
    context.globalAlpha = opacity;
    context.beginPath();
    context.moveTo(0, -radius);
    context.lineTo(radius * 0.2, -radius * 0.2);
    context.lineTo(radius, 0);
    context.lineTo(radius * 0.2, radius * 0.2);
    context.lineTo(0, radius);
    context.lineTo(-radius * 0.2, radius * 0.2);
    context.lineTo(-radius, 0);
    context.lineTo(-radius * 0.2, -radius * 0.2);
    context.closePath();
    context.fill();
    if (outline) {
      context.strokeStyle = outline;
      context.lineWidth = 0.5;
      context.lineJoin = "round";
      context.stroke();
    }
    context.restore();
  }

  function drawAura(radius, color, opacity) {
    const glow = context.createRadialGradient(0, 0, 8, 0, 0, radius);
    glow.addColorStop(0, `rgba(${color}, ${opacity})`);
    glow.addColorStop(1, `rgba(${color}, 0)`);
    context.fillStyle = glow;
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
  }

  function drawSigil(index) {
    context.beginPath();
    if (index % 3 === 0) {
      context.moveTo(0, -3.8);
      context.lineTo(3, 1);
      context.lineTo(0, 3.8);
      context.lineTo(-3, 1);
      context.closePath();
      context.moveTo(-4.5, 0);
      context.lineTo(4.5, 0);
    } else if (index % 3 === 1) {
      context.moveTo(-3, 3);
      context.lineTo(0, -3);
      context.lineTo(3, 3);
      context.moveTo(0, -5);
      context.lineTo(0, 5);
      context.moveTo(-3, 1.5);
      context.lineTo(3, 1.5);
    } else {
      context.arc(0, 0, 2.6, 0, fullTurn);
      context.moveTo(0, -5);
      context.lineTo(0, 5);
      context.moveTo(-4, 0);
      context.lineTo(4, 0);
    }
    context.stroke();
  }

  function drawArcaneCircle(cards, energy) {
    drawAura(104, palette.light ? "155, 109, 29" : "242, 179, 61",
      palette.light ? 0.025 + energy * 0.015 : 0.075 + energy * 0.045);
    drawAura(71, "0, 174, 239", palette.light ? 0.025 + energy * 0.02 : 0.1 + energy * 0.09);
    context.save();
    context.rotate(-effectTime * 0.055);
    context.strokeStyle = palette.ring;
    context.globalAlpha = palette.light ? 0.72 + energy * 0.12 : 0.25 + energy * 0.18;
    context.lineWidth = palette.light ? 0.95 : 0.65;
    for (const radius of [84, 99]) {
      context.beginPath();
      context.arc(0, 0, radius, 0, fullTurn);
      context.stroke();
    }
    context.globalAlpha = palette.light ? 0.31 : 0.14;
    context.beginPath();
    for (let i = 0; i <= palette.cards.length; i++) {
      const angle = i * fullTurn / palette.cards.length;
      const x = Math.cos(angle) * 84;
      const y = Math.sin(angle) * 84;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    for (let i = 0; i < 28; i++) {
      context.save();
      context.rotate(i * fullTurn / 28);
      context.globalAlpha = palette.light ? (i % 4 === 0 ? 0.9 : 0.62) : (i % 4 === 0 ? 0.8 : 0.3);
      context.beginPath();
      context.moveTo(96, 0);
      context.lineTo(i % 4 === 0 ? 92 : 94, 0);
      context.stroke();
      context.restore();
    }
    for (let i = 0; i < 14; i++) {
      context.save();
      context.rotate(i * fullTurn / 14);
      context.translate(0, -91.5);
      context.globalAlpha = palette.light ? 0.86 + energy * 0.1 : 0.4 + energy * 0.2;
      drawSigil(i);
      context.restore();
    }
    context.restore();

    for (let lane = 0; lane < 3; lane++) {
      const head = effectTime * 0.21 + lane * fullTurn / 3;
      context.save();
      context.strokeStyle = palette.head;
      context.lineWidth = palette.light ? 2 : 1.1;
      context.globalAlpha = palette.light ? 0.9 : 0.65;
      context.shadowColor = palette.light ? "#b08b46" : "#e3b654";
      context.shadowBlur = palette.light ? 2 : 9;
      context.beginPath();
      context.arc(0, 0, 99, head - 0.22, head);
      context.stroke();
      if (palette.light) {
        context.shadowBlur = 0;
        context.strokeStyle = "#fff7d7";
        context.lineWidth = 0.55;
        context.stroke();
      }
      context.restore();
      drawSparkle(Math.cos(head) * 99, Math.sin(head) * 99, palette.light ? 2 : 1.9,
        palette.spark, palette.light ? 0.9 : 0.8, palette.light ? palette.ring : null);
    }
    for (const card of cards) {
      const { x, y, index } = card;
      const tint = palette.cards[index].edge;
      context.save();
      context.strokeStyle = tint;
      context.globalAlpha = (palette.light ? 0.48 : 0.17) + energy * 0.14;
      context.lineWidth = palette.light ? 0.95 : 0.7;
      context.beginPath();
      context.moveTo(x, y);
      context.bezierCurveTo(x * 0.4 - y * 0.48, y * 0.4 + x * 0.48,
        -y * 0.34, x * 0.34, 0, 0);
      context.stroke();
      context.restore();
      const phase = (effectTime * 0.23 + index * 0.171) % 1;
      const remaining = 1 - phase;
      const curve = Math.sin(phase * Math.PI) * 0.25;
      drawSparkle(x * remaining * remaining - y * curve,
        y * remaining * remaining + x * curve, palette.light ? 1.6 : 1.2, tint,
        Math.sin(phase * Math.PI) * (palette.light ? 0.9 : 0.8), palette.light ? tint : null);
    }
  }

  function drawCard(card, energy) {
    const scale = 0.83 + 0.17 * (card.depth + 1);
    const width = 31 * scale;
    const height = 44 * scale;
    const tint = palette.cards[card.index];
    context.save();
    context.translate(card.x, card.y);
    context.rotate(-0.18 + Math.sin(card.angle) * 0.33);
    context.globalAlpha = palette.light ? 1 : 0.82 + 0.18 * (card.depth + 1) / 2;
    context.fillStyle = tint.face;
    context.strokeStyle = tint.edge;
    context.lineWidth = Math.max(1.6, width * 0.047);
    context.beginPath();
    context.roundRect(-width / 2, -height / 2, width, height, Math.max(3, width * 0.085));
    context.fill();
    context.shadowColor = palette.light ? "rgba(76, 62, 39, 0.3)" : tint.edge;
    context.shadowBlur = palette.light ? 3 : 5 + energy * 7;
    context.stroke();
    context.shadowBlur = 0;

    context.save();
    context.clip();
    const sweep = ((effectTime * 0.12 + card.index * 0.137) % 1) * width * 4 - width * 2;
    const sheen = context.createLinearGradient(sweep - width * 0.5, -height / 2,
      sweep + width * 0.5, height / 2);
    sheen.addColorStop(0, "#ffffff00");
    sheen.addColorStop(0.46, "#ffffff00");
    sheen.addColorStop(0.52, "#ffffff26");
    sheen.addColorStop(0.58, "#ffffff00");
    sheen.addColorStop(1, "#ffffff00");
    context.fillStyle = sheen;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();

    context.save();
    context.globalAlpha *= palette.light ? 0.48 : 0.36;
    context.lineWidth = 0.9;
    context.beginPath();
    context.roundRect(-width * 0.38, -height / 2 + width * 0.12,
      width * 0.76, height - width * 0.24, Math.max(2, width * 0.04));
    context.stroke();
    context.restore();

    context.save();
    context.rotate(Math.PI / 4);
    context.lineWidth = 1.5;
    context.strokeRect(-width * 0.105, -width * 0.105, width * 0.21, width * 0.21);
    context.restore();
    const pulse = Math.pow(0.5 + 0.5 * Math.sin(effectTime * 1.25 + card.index * 1.7), 5);
    drawSparkle(width * 0.42, -height * 0.43, 1.5 + pulse * 1.7,
      palette.light ? "#fffdf2" : "#f3f8ff", pulse * 0.8, palette.light ? tint.edge : null);
    context.restore();
  }

  function drawOrbit() {
    if (!baseImage.naturalWidth) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(canvas.width / 260, 0, 0, canvas.height / 220,
      canvas.width / 2, canvas.height / 2);

    drawAura(115, "0, 174, 239", palette.light ? 0.025 : 0.12);
    context.save();
    context.rotate(-0.34);
    context.strokeStyle = palette.orbit;
    context.lineWidth = palette.light ? 0.9 : 0.8;
    context.beginPath();
    context.ellipse(0, 0, 114, 57, 0, 0, fullTurn);
    context.stroke();
    context.restore();

    const energy = Math.max(0, Math.min(1, (currentRotationsPerSecond - baseRotationsPerSecond) /
      (maxRotationsPerSecond - baseRotationsPerSecond)));
    const cards = palette.cards.map((_, index) => {
      const angle = currentAngle * Math.PI / 180 + index * fullTurn / palette.cards.length;
      const depth = Math.sin(angle);
      const x = 103 * Math.cos(angle);
      const y = 49 * depth;
      return { index, angle, depth, x: x * 0.94 + y * 0.34, y: -x * 0.34 + y * 0.94 };
    });
    drawArcaneCircle(cards, energy);
    cards.sort((a, b) => a.depth - b.depth);
    cards.filter(card => card.depth < 0).forEach(card => drawCard(card, energy));

    // Match the approved 260 by 220 preview, including the original D's visible size.
    const logoScale = 89 / 236;
    context.save();
    context.shadowColor = palette.logoShadow;
    context.shadowBlur = palette.light ? 2 : 10 + energy * 12;
    context.drawImage(logoContext ? illuminatedLogo : baseImage, -222 * logoScale, -211 * logoScale,
      427.41 * logoScale, 427.7 * logoScale);
    context.restore();
    cards.filter(card => card.depth >= 0).forEach(card => drawCard(card, energy));
  }

  function setSpeedFromPointer(event) {
    if (reducedMotion.matches || !inView || spinCtaButton.disabled || event.pointerType === "touch") {
      resetPointerSpeed();
      return;
    }
    const rect = spinCtaButton.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    const accelerationRadius = radius * (1 + accelerationMarginRatio);
    const distance = Math.hypot(
      event.clientX - centerX,
      event.clientY - centerY,
    );

    if (distance >= accelerationRadius) {
      targetRotationsPerSecond = baseRotationsPerSecond;
      return;
    }

    const proximity = 1 - distance / accelerationRadius;

    const easedProximity = proximity * proximity * (3 - 2 * proximity);

    targetRotationsPerSecond =
      baseRotationsPerSecond +
      (maxRotationsPerSecond - baseRotationsPerSecond) * easedProximity;
  }

  function resetPointerSpeed() {
    targetRotationsPerSecond = baseRotationsPerSecond;
  }

  function scheduleFrame() {
    if (animationFrame === null && inView && !document.hidden &&
        !reducedMotion.matches && canvas.isConnected && baseImage.naturalWidth) {
      animationFrame = window.requestAnimationFrame(animate);
    }
  }

  function resetAnimation() {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    previousTimestamp = null;
    currentRotationsPerSecond = baseRotationsPerSecond;
    resetPointerSpeed();
    drawOrbit();
    scheduleFrame();
  }

  function animate(timestamp) {
    animationFrame = null;
    if (!canvas.isConnected || !inView || document.hidden || reducedMotion.matches) {
      previousTimestamp = null;
      return;
    }
    if (previousTimestamp === null) {
      previousTimestamp = timestamp;
    }

    const elapsedSeconds = Math.min(
      (timestamp - previousTimestamp) / 1000,
      0.05,
    );

    previousTimestamp = timestamp;

    const responseAmount = 1 - Math.exp(-speedResponse * elapsedSeconds);

    currentRotationsPerSecond +=
      (targetRotationsPerSecond - currentRotationsPerSecond) * responseAmount;

    currentAngle =
      (currentAngle + currentRotationsPerSecond * 360 * elapsedSeconds) % 360;
    effectTime += elapsedSeconds;

    drawOrbit();
    scheduleFrame();
  }

  document.addEventListener("pointermove", setSpeedFromPointer, {
    passive: true,
  });

  document.documentElement.addEventListener("pointerleave", resetPointerSpeed);

  window.addEventListener("blur", resetPointerSpeed);
  document.addEventListener("visibilitychange", resetAnimation);
  reducedMotion.addEventListener("change", resetAnimation);

  const visibilityObserver = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    resetAnimation();
  });
  visibilityObserver.observe(canvas);

  function showOrbit() {
    if (!baseImage.naturalWidth) return;
    if (logoContext) {
      logoContext.globalCompositeOperation = "source-over";
      logoContext.clearRect(0, 0, illuminatedLogo.width, illuminatedLogo.height);
      logoContext.drawImage(baseImage, 0, 0, illuminatedLogo.width, illuminatedLogo.height);
      const gradient = logoContext.createLinearGradient(170 / 427.41 * 856, 90 / 427.7 * 856,
        290 / 427.41 * 856, 330 / 427.7 * 856);
      gradient.addColorStop(0, palette.logo[0]);
      gradient.addColorStop(0.42, palette.logo[1]);
      gradient.addColorStop(1, palette.logo[2]);
      logoContext.globalCompositeOperation = "source-in";
      logoContext.fillStyle = gradient;
      logoContext.fillRect(0, 0, illuminatedLogo.width, illuminatedLogo.height);
    }
    drawOrbit();
    canvas.parentElement.classList.add("is-orbit-ready");
    scheduleFrame();
  }
  baseImage.addEventListener("load", showOrbit, { once: true });
  if (baseImage.complete) showOrbit();

  // themes.js updates this attribute for every theme, including live changes.
  const themeObserver = new MutationObserver(() => {
    if (!canvas.isConnected) {
      themeObserver.disconnect();
      return;
    }
    const nextPalette = currentPalette();
    if (nextPalette === palette) return;
    palette = nextPalette;
    // Repaint even when reduced motion or visibility has paused the animation.
    showOrbit();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme-scheme"],
  });
}

function initializeSpinLogos() {
  document.querySelectorAll("[data-spin-logo]").forEach(initializeSpinLogoAnimation);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeSpinLogos, { once: true });
} else {
  initializeSpinLogos();
}
