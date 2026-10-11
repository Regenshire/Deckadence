/* Display the completed spin's actual metadata, rather than scraping card labels. */
(() => {
  document.addEventListener('deckadence:pack-summary', ({detail}) => {
    const name = document.getElementById('campaignStagePackName');
    const summary = document.getElementById('campaignStagePackSummary');
    if (!name || !summary) return;
    name.textContent = detail?.name || 'No pack selected';
    const type = String(detail?.type || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const count = detail?.count;
    summary.textContent = detail ? [type, Number.isFinite(count) ? `${count} cards` : ''].filter(Boolean).join(' · ') : '';
  });
})();
