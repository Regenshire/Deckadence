// Saved workflow preferences; generation and PDF export are separate integrations.
(function () {
  const panel = document.getElementById('spotFoilSettings');
  const dialog = document.getElementById('spotFoilWorkflowDialog');
  if (!panel || !dialog) return;
  const form = dialog.querySelector('form');
  const fields = form.elements;
  const summary = panel.querySelector('[data-foil-summary]');
  const status = dialog.querySelector('[data-foil-status]');
  const configure = panel.querySelector('[data-foil-configure]');
  const colorPicker = dialog.querySelector('[data-foil-color-picker]');
  const boolKeys = ['protect_text', 'protect_frame', 'review_mask', 'overprint'];
  const numberKeys = ['coverage_percent', 'edge_adjustment_mm', 'safe_margin_mm', 'resolution_ppi', 'selection_amount', 'foil_coverage_percent', 'border_width_percent'];
  const clone = value => JSON.parse(JSON.stringify(value));
  let data, drafts, selected, dirty, saving = false;

  async function api(payload) {
    const response = await fetch(panel.dataset.settingsUrl, payload ? {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    } : {cache: 'no-store'});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Could not load workflow settings.');
    return result;
  }
  function setOptions(select, keys, labels) {
    select.replaceChildren(...keys.map(key => new Option(labels[key] || key, key)));
  }
  function preset() { return data.workflows.find(item => item.id === selected); }
  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  function showSummary() {
    const active = data.preferences.active_workflow;
    const profile = data.preferences.profiles[active];
    summary.textContent = `${data.workflows.find(item => item.id === active).label} · ${data.output_formats[profile.output_format]}`;
  }
  function updateVisibility() {
    const output = fields.output_format.value;
    ['spot_name', 'spot_display_color', 'overprint', 'raster_polarity'].forEach(key => {
      const visible = key === 'raster_polarity' ? output === 'grayscale_png' : output === 'spot_pdf';
      dialog.querySelector(`[data-foil-field="${key}"]`).hidden = !visible;
      fields[key].disabled = !visible || saving;
    });
    colorPicker.disabled = fields.spot_display_color.disabled;
    const solid = preset().mask_tones.length === 1;
    fields.coverage_percent.disabled = solid || saving;
    fields.layer_type.disabled = preset().layer_types.length === 1 || saving;
    dialog.querySelector('[data-foil-coverage-hint]').textContent = solid
      ? 'This workflow uses solid 100% coverage.' : 'Coverage is an ink value, not a calibrated foil intensity.';
    dialog.querySelector('[data-foil-output-hint]').textContent = {
      spot_pdf: 'The named spot separation carries the ink coverage. The RIP sets physical ink order and passes.',
      mask_pdf: 'Black marks deposited ink or material; white marks no deposit. Match the artwork page size and placement.',
      grayscale_png: 'The mask is independent of the artwork. Set its polarity to match your RIP.',
      alpha_png: 'Opaque pixels mark deposited ink or material; transparent pixels mark no deposit. Import as a separate mask.'
    }[output];
    dialog.querySelector('[data-foil-layer-hint]').textContent = fields.layer_type.value === 'white_underbase'
      ? 'Selected areas reveal foil. White ink covers the remaining card area; protected text and frames receive white ink.'
      : 'Selected areas receive foil or coating. Protected text and frame areas are excluded.';
  }
  function showProfile() {
    const item = preset();
    const values = drafts[selected];
    setOptions(fields.layer_type, item.layer_types, data.layer_types);
    setOptions(fields.output_format, item.output_formats, data.output_formats);
    setOptions(fields.mask_tone, item.mask_tones, {binary: 'Solid areas', grayscale: 'Grayscale coverage'});
    fields.workflow_id.value = selected;
    Object.entries(values).forEach(([key, value]) => {
      if (boolKeys.includes(key)) fields[key].checked = value;
      else fields[key].value = value;
    });
    colorPicker.value = fields.spot_display_color.value;
    document.getElementById('spotFoilWorkflowDescription').textContent = item.description;
    updateVisibility();
  }
  function capture() {
    const values = {};
    Object.keys(preset().defaults).forEach(key => {
      values[key] = boolKeys.includes(key) ? fields[key].checked
        : numberKeys.includes(key) ? (fields[key].value === '' ? null : Number(fields[key].value))
          : fields[key].value;
    });
    drafts[selected] = values;
  }
  function validateCurrent() {
    // The workflow selector already contains its destination on a change event.
    // Only validate the settings being left behind.
    return form.reportValidity();
  }
  colorPicker.addEventListener('input', () => {
    fields.spot_display_color.value = colorPicker.value.toUpperCase();
    dirty.add(selected);
  });
  fields.spot_display_color.addEventListener('input', () => {
    const hex = fields.spot_display_color.value.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) colorPicker.value = '#' + hex;
  });
  fields.spot_display_color.addEventListener('blur', () => {
    const hex = fields.spot_display_color.value.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) fields.spot_display_color.value = '#' + hex.toUpperCase();
  });
  fields.workflow_id.addEventListener('change', () => {
    const next = fields.workflow_id.value;
    if (!validateCurrent()) { fields.workflow_id.value = selected; return; }
    capture(); selected = next; showProfile(); message('Changes are saved only when you choose Save workflows.');
  });
  form.addEventListener('input', event => {
    if (event.target.name !== 'workflow_id') dirty.add(selected);
  });
  form.addEventListener('change', event => {
    if (event.target.name !== 'workflow_id') { dirty.add(selected); updateVisibility(); }
  });
  dialog.querySelector('[data-foil-reset]').addEventListener('click', () => {
    drafts[selected] = clone(preset().defaults); dirty.add(selected); showProfile();
    message('Preset restored. Choose Save workflows to keep it.');
  });
  dialog.querySelectorAll('[data-foil-cancel]').forEach(button => button.addEventListener('click', () => {
    if (!saving) dialog.close();
  }));
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => configure.focus());
  configure.addEventListener('click', async () => {
    configure.disabled = true;
    try {
      data = await api();
      drafts = clone(data.preferences.profiles); dirty = new Set();
      selected = data.preferences.active_workflow;
      setOptions(fields.workflow_id, data.workflows.map(item => item.id),
        Object.fromEntries(data.workflows.map(item => [item.id, item.label])));
      showProfile(); message(''); showSummary(); dialog.showModal(); fields.workflow_id.focus();
    } catch (error) { summary.textContent = `${error.message} Choose Configure workflows to retry.`; }
    finally { configure.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving || !validateCurrent()) return;
    capture();
    const profiles = Object.fromEntries([...dirty].map(key => [key, drafts[key]]));
    saving = true;
    Array.from(fields).forEach(field => { field.disabled = true; });
    message('Saving workflow settings…');
    try {
      data = await api({active_workflow: selected, profiles});
      showSummary(); dialog.close();
    } catch (error) { message(error.message, true); }
    finally {
      saving = false;
      Array.from(fields).forEach(field => { field.disabled = false; });
      updateVisibility();
    }
  });
  api().then(result => { data = result; showSummary(); })
    .catch(error => { summary.textContent = `${error.message} Choose Configure workflows to retry.`; });
})();
