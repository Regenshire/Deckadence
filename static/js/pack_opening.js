  async function animateDeckadencePackOpening(inlineViewGrid, packImage) {
    if (!inlineViewGrid || !packImage ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        typeof Element.prototype.animate !== "function") return;

    const animations = [];
    const wrapper = packImage.cloneNode(false);
    wrapper.removeAttribute("id");
    wrapper.removeAttribute("class");
    wrapper.alt = "";
    wrapper.setAttribute("aria-hidden", "true");
    try {
      const bounds = inlineViewGrid.getBoundingClientRect();
      const width = Math.min(300, bounds.width * .8);
      const height = width * 1.65;
      const x = bounds.left + bounds.width / 2;
      const y = Math.min(window.innerHeight * .45, bounds.top + height / 2 + 30);
      wrapper.style.cssText = `position:fixed;left:${x - width / 2}px;top:${y - height / 2}px;width:${width}px;height:${height}px;object-fit:contain;z-index:2000;pointer-events:none;`;
      document.body.appendChild(wrapper);
      animations.push(wrapper.animate([
        { transform: "rotate(0deg)", opacity: 1 },
        { transform: "rotate(0deg)", offset: .18, opacity: 1 },
        { transform: "rotate(-5deg)", offset: .30, opacity: 1 },
        { transform: "rotate(5deg)", offset: .42, opacity: 1 },
        { transform: "rotate(-3deg)", offset: .54, opacity: 1 },
        { transform: "translateY(0)", offset: .72, opacity: 1 },
        { transform: "translateY(90px) scale(.9)", opacity: 0 }
      ], { duration: 2100, fill: "both", easing: "ease-in-out" }));
      Array.from(inlineViewGrid.children).forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const dx = x - rect.left - rect.width / 2;
        const dy = y - rect.top - rect.height / 2;
        animations.push(card.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
          { transform: `translate(${dx * .75}px, ${dy - 100}px) scale(.45)`, opacity: 1, offset: .4 },
          { transform: "translate(0, 0) scale(1)", opacity: 1 }
        ], { duration: 850, delay: 1450 + Math.min(index, 10) * 65,
             fill: "both", easing: "cubic-bezier(.2,.7,.25,1)" }));
      });
      inlineViewGrid.style.visibility = "";
      await Promise.allSettled(animations.map(animation => animation.finished));
    } finally {
      animations.forEach(animation => animation.cancel());
      wrapper.remove();
      inlineViewGrid.style.visibility = "";
    }
  }
