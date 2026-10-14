// *** PACK FORMATION - Animate Cards into Packs ***
(() => {
  const stage = document.querySelector('.sim-pack-stage');
  const button = document.getElementById('packArtworkButton');
  const front = document.getElementById('packArtwork');
  if (!stage || !button || !front) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'sim-pack-formation';
  backdrop.setAttribute('aria-hidden', 'true');
  stage.prepend(backdrop);
  let count = 1, boxed = false;
  function render() {
    backdrop.replaceChildren();
    stage.classList.toggle('has-pack-formation', !boxed);
    if (boxed || !stage.clientWidth) return;
    const width = stage.clientWidth;
    const packWidth = Math.min(215, Math.max(108, width * .2));
    const step = packWidth * .62;
    const pairs = Math.max(0, Math.floor((width / 2 - packWidth / 2 - 16) / step));
    stage.style.setProperty('--formation-width', `${packWidth}px`);
    stage.style.setProperty('--formation-height', `${Math.round(packWidth * 1.75 + 90)}px`);
    for (let i = pairs * 2; i >= 1; i--) {
      const row = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
      const img = document.createElement('img');
      img.alt = '';
      img.className = 'sim-formation-pack' + (i >= count ? ' is-phantom' : '');
      img.src = i >= count ? '/static/img/pack_art/phantom-wrapper.webp' : front.src;
      img.style.transform = `translateX(calc(-50% + ${side * row * step}px)) translateY(${-row * 15}px) scale(${Math.pow(.92, row)})`;
      img.style.zIndex = String(pairs - row);
      backdrop.append(img);
    }
  }
  new ResizeObserver(render).observe(stage);
  new MutationObserver(render).observe(front, { attributes: true, attributeFilter: ['src'] });
  window.DeckadencePackFormation = {
    update(quantity, isBox) { count = Math.max(1, Number(quantity) || 1); boxed = Boolean(isBox); render(); }
  };
})();
