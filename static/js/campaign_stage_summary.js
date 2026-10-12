/* Display the completed spin's actual metadata, rather than scraping card labels. */
(() => {
  const prompts = [
    "Give the wheel a spin. Let's crack a pack!",
    "Feeling lucky? Spin up a little chaos!",
    "Your next favorite card could be a spin away!",
    "The packs are ready. Let the wheel decide!",
    "Ready for a surprise? Give that wheel a spin!",
  ];
  const idlePrompt = prompts[Math.floor(Math.random() * prompts.length)];
  const showIdlePrompt = () => {
    const name = document.getElementById('campaignStagePackName');
    if (name && !name.dataset.packSelected) name.textContent = idlePrompt;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showIdlePrompt, {once: true});
  else showIdlePrompt();
  document.addEventListener('deckadence:pack-summary', ({detail}) => {
    const name = document.getElementById('campaignStagePackName');
    const summary = document.getElementById('campaignStagePackSummary');
    if (!name || !summary) return;
    name.textContent = detail?.name || idlePrompt;
    if (detail?.name) name.dataset.packSelected = 'true';
    else delete name.dataset.packSelected;
    const type = String(detail?.type || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const count = detail?.count;
    summary.textContent = detail ? [type, Number.isFinite(count) ? `${count} cards` : ''].filter(Boolean).join(' · ') : '';
  });
})();
