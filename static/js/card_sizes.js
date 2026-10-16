// *** CARD SIZES - Set Displayed Card Sizes ***
/* Shared Card Size choices; 100% is 336px so four cards and gaps fit in 1400px. */
(() => {
  const values = Object.freeze(window.DeckadenceDisplaySettings.cardSizePercentages);
  function normalize(value) {
    if (value === "auto" || value === null || value === undefined || value === "") return "auto";
    const number = Number(value);
    return Number.isFinite(number)
      ? values.reduce((best, size) => Math.abs(size - number) < Math.abs(best - number) ? size : best, 100)
      : "auto";
  }
  function pixels(value, container) {
    if (normalize(value) !== "auto") return Math.round(336 * normalize(value) / 100);
    if (!container || !container.clientWidth) return 230;
    const style = getComputedStyle(container);
    const width = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.columnGap) || 14;
    const columns = Math.max(1, Math.floor((width + gap) / (230 + gap)));
    return Math.max(1, Math.floor((width - gap * (columns - 1)) / columns));
  }
  function observe(container, callback) {
    if (!container) return;
    let previousWidth = -1;
    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0 && width !== previousWidth) {
        previousWidth = width;
        callback();
      }
    }).observe(container);
  }
  window.DeckadenceCardSizes = Object.freeze({
    values, normalize, pixels, observe,
  });
})();
