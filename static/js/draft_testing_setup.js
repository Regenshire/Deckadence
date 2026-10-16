(() => {
  'use strict';
  const root = document.getElementById('draftSetup');
  if (!root) return;
  const players = document.getElementById('draftSetupPlayers');
  const packs = document.getElementById('draftSetupPacks');
  const start = document.getElementById('draftSetupStartButton');
  const available = Number(root.dataset.packCount);
  const populationButtons = [...root.querySelectorAll('[data-populate]')];
  let busy = false;
  function updateRequirement() {
    const required = Number(players.value) * Number(packs.value);
    const missing = Math.max(0, required - available);
    document.getElementById('draftPackRequirement').textContent = `${required} packs required. ${missing ? `Add ${missing} more packs.` : 'Ready to draft.'}`;
    start.disabled = busy || !root.dataset.campaignId || missing > 0;
  }
  players.addEventListener('change', updateRequirement);
  packs.addEventListener('change', updateRequirement);
  updateRequirement();
  const format = root.querySelector('[name=cards_per_pick]');
  function updateFormatDescription() {
    document.getElementById('draftFormatDescription').textContent = format.value === '2'
      ? 'Pick two cards, one at a time, before passing the pack. If only one card remains, take that card.'
      : 'Pick one card, then pass the pack to the next player.';
  }
  format.addEventListener('change', updateFormatDescription);
  updateFormatDescription();
  populationButtons.forEach(button => button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    populationButtons.forEach(item => { item.disabled = true; });
    root.querySelectorAll('form button').forEach(item => { item.disabled = true; });
    const status = document.getElementById('draftPopulateStatus');
    const progress = document.getElementById('draftPopulateProgress');
    progress.hidden = false;
    status.textContent = `Generating ${button.dataset.populate} packs…`;
    try {
      const response = await fetch(root.dataset.populateUrl, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({count: Number(button.dataset.populate), campaign_id: root.dataset.campaignId})
      });
      const result = await response.json();
      status.textContent = result.message || 'Could not generate packs.';
      if (response.ok && result.ok) { location.reload(); return; }
    } catch (_) {
      status.textContent = 'The server response was interrupted. Refresh the pack count before adding more; some packs may have been saved.';
    } finally {
      progress.hidden = true;
      document.getElementById('draftRefreshPacks').hidden = false;
    }
  }));
})();
