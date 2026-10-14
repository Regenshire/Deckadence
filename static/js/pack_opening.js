// *** PACK OPENING - Reveal Cards from a Pack ***
/* Draft screens share the Pack Simulator tear and spill renderer. */
async function animateDeckadencePackOpening(grid, image) {
  if (!grid || !image) return;
  // Keep rendered cards concealed until the shared renderer starts their spill.
  grid.style.visibility = "hidden";
  try {
    await window.DeckadenceSealedEffects?.open({ grid, image });
  } finally {
    grid.style.visibility = "";
  }
}
