/* Draft screens share the Pack Simulator tear and spill renderer. */
async function animateDeckadencePackOpening(grid, image) {
  if (!grid || !image) return;
  try {
    await window.DeckadenceSealedEffects?.open({ grid, image });
  } finally {
    grid.style.visibility = "";
  }
}
