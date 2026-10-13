/* Shared Card Size choices and the standard four-column, 1400px card width. */
(() => {
  const values = Object.freeze([50, 75, 90, 100, 110, 125, 150, 175, 200]);
  function normalize(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? values.reduce((best, size) => Math.abs(size - number) < Math.abs(best - number) ? size : best, 100)
      : 100;
  }
  window.DeckadenceCardSizes = Object.freeze({
    values, normalize,
    pixels: value => Math.round(((1400 - 3 * 18) / 4) * normalize(value) / 100),
  });
})();
