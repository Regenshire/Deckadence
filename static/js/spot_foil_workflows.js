// Saved workflow preferences; generation and PDF export are separate integrations.
(function () {
  const panel = document.getElementById('spotFoilSettings');
  const dialog = document.getElementById('spotFoilWorkflowDialog');
  if (!panel || !dialog) return;
  const form = dialog.querySelector('form');
  const fields = form.elements;
  if(!fields.disable_gloss_on_view) {
    const views=document.createElement('fieldset');
    views.innerHTML='<legend>View settings</legend><label class="spot-foil-check"><input type="checkbox" name="disable_gloss_on_view">Disable Gloss Layer on View</label>';
    dialog.querySelector('.spot-foil-body').prepend(views);
  }
  const summary = panel.querySelector('[data-foil-summary]');
  const status = dialog.querySelector('[data-foil-status]');
  const configure = panel.querySelector('[data-foil-configure]');
  const colorPicker = dialog.querySelector('[data-foil-color-picker]');
  configure.textContent='Studio Settings';
  dialog.querySelector('h2').textContent='Studio Settings';
  dialog.querySelector('header p').replaceChildren(dialog.querySelector('header p a'));
  dialog.querySelector('[type="submit"]').textContent='Save settings';
  const workflows=document.createElement('details');workflows.className='studio-settings-group';
  workflows.innerHTML='<summary><span class="studio-settings-number">01</span><span>Print workflows</span><span class="studio-settings-chevron" aria-hidden="true"></span></summary><div class="studio-settings-content"></div>';
  const exportDefaults=document.createElement('fieldset');
  exportDefaults.innerHTML='<legend>Print / Export defaults</legend><label>PDF Version<select name="pdf_version"><option>1.5</option><option>1.6</option><option>1.7</option></select></label><div class="spot-foil-checks"><label class="spot-foil-check"><input type="checkbox" name="include_effect1_default">Include Effect 1</label><label class="spot-foil-check"><input type="checkbox" name="include_effect2_default">Include Effect 2</label></div>';
  fields.workflow_id.closest('label').before(exportDefaults);
  const colorSettings=document.createElement('fieldset');
  colorSettings.innerHTML='<legend>PDF color</legend><p class="spot-foil-hint">RGB by default. Spot Foiling or Gloss uses CMYK.</p><label>CMYK ICC profile<select name="cmyk_profile"></select></label><div class="plugin-card-actions"><label class="spot-foil-profile-upload">Upload ICC profile<input type="file" accept=".icc,.icm" data-icc-upload></label><button type="button" class="action-button secondary-button" data-icc-refresh>Refresh profiles</button></div><p class="spot-foil-hint" data-icc-folder></p><p class="spot-foil-hint" role="status" data-icc-status></p>';
  fields.workflow_id.closest('label').before(colorSettings);
  const iccStatus=colorSettings.querySelector('[data-icc-status]');
  function showProfiles(result,selected=fields.cmyk_profile.value) {
    fields.cmyk_profile.replaceChildren(new Option('None',''),...(result.icc_profiles||[]).map(p=>new Option(p.label+' — '+p.id,p.id)));
    if(selected && ![...fields.cmyk_profile.options].some(o=>o.value===selected))fields.cmyk_profile.add(new Option(selected+' (missing)',selected));
    fields.cmyk_profile.value=selected;
    if(result.icc_profile_folder)colorSettings.querySelector('[data-icc-folder]').textContent='Profile folder: '+result.icc_profile_folder;
  }
  colorSettings.querySelector('[data-icc-refresh]').addEventListener('click',async()=>{
    try {showProfiles(await api());iccStatus.textContent='Profiles refreshed.';}catch(error){iccStatus.textContent=error.message;}
  });
  colorSettings.querySelector('[data-icc-upload]').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    event.target.disabled=true;iccStatus.textContent='Uploading profile…';
    try {
      const body=new FormData();body.append('profile',file);
      const response=await fetch('/config/plugins/spot-foil/icc-profiles',{method:'POST',body});
      const result=await response.json();if(!response.ok||!result.ok)throw Error(result.message||'Profile upload failed.');
      showProfiles(result,result.selected);iccStatus.textContent='Profile uploaded. Save settings to use it.';
    }catch(error){iccStatus.textContent=error.message;}finally{event.target.disabled=false;event.target.value='';}
  });
  const workflowStart=fields.workflow_id.closest('label');
  const content=workflows.querySelector('.studio-settings-content');
  workflowStart.before(workflows);
  while(workflows.nextElementSibling&&!workflows.nextElementSibling.matches('[data-foil-status]'))content.append(workflows.nextElementSibling);
  content.append(dialog.querySelector('[data-foil-reset]'));
  form.addEventListener('invalid',event=>{if(workflows.contains(event.target))workflows.open=true;},true);

  const boolKeys = ['protect_text', 'protect_frame', 'review_mask', 'overprint'];
  const numberKeys = ['coverage_percent', 'edge_adjustment_mm', 'safe_margin_mm', 'resolution_ppi', 'selection_amount', 'foil_coverage_percent', 'border_width_percent'];
  const clone = value => JSON.parse(JSON.stringify(value));
  let data, drafts, selected, dirty, saving = false, loadVersion = 0;

  function validReply(result) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const choices = value => Array.isArray(value) && value.length > 0 && value.every(key => typeof key === 'string');
    if (!object(result?.preferences) || !object(result.preferences.profiles)
        || !object(result.output_formats) || !object(result.layer_types)
        || !Array.isArray(result.workflows) || !result.workflows.length) return false;
    return result.workflows.every(item => object(item) && typeof item.id === 'string'
      && typeof item.label === 'string' && object(item.defaults)
      && choices(item.layer_types) && choices(item.output_formats) && choices(item.mask_tones)
      && object(result.preferences.profiles[item.id])
      && Object.keys(item.defaults).every(key => Object.hasOwn(result.preferences.profiles[item.id], key)))
      && result.workflows.some(item => item.id === result.preferences.active_workflow);
  }
  async function api(payload) {
    let response;
    try {
      response = await fetch(panel.dataset.settingsUrl, payload ? {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
      } : {cache: 'no-store'});
    } catch (_) {
      const error = new Error('Could not reach the application.');
      error.retryable = true;
      throw error;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !validReply(result)) {
      const error = new Error(!response.ok && typeof result?.message === 'string' && result.message.trim()
        ? result.message : response.ok ? 'The application returned unreadable workflow settings.'
          : `Could not ${payload ? 'save' : 'load'} workflow settings (${response.status}).`);
      error.retryable = response.ok || response.status >= 500 || [408, 429].includes(response.status);
      throw error;
    }
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
      spot_pdf: 'The RIP reads the named ink separation and sets print order and passes.',
      mask_pdf: 'Black = ink or material. White = no deposit. Align with the artwork.',
      grayscale_png: 'The mask is independent of the artwork. Set its polarity to match your RIP.',
      alpha_png: 'Opaque = ink or material. Transparent = no deposit. Import separately.'
    }[output];
    dialog.querySelector('[data-foil-layer-hint]').textContent = fields.layer_type.value === 'white_underbase'
      ? 'Selected areas reveal foil. White ink covers the rest.'
      : 'Selected areas receive foil or coating.';
  }
  function showProfile() {
    const item = preset();
    const values = drafts[selected];
    setOptions(fields.layer_type, item.layer_types, data.layer_types);
    setOptions(fields.output_format, item.output_formats, data.output_formats);
    setOptions(fields.mask_tone, item.mask_tones, {binary: 'Solid areas', grayscale: 'Grayscale coverage'});
    fields.workflow_id.value = selected;
    Object.entries(values).forEach(([key, value]) => {
      if (!fields[key]) return;
      if (boolKeys.includes(key)) fields[key].checked = value;
      else fields[key].value = value;
    });
    fields.selection_region.value = values.protect_text || values.protect_frame ? 'artwork' : 'full';
    colorPicker.value = fields.spot_display_color.value;
    document.getElementById('spotFoilWorkflowDescription').textContent = item.description;
    updateVisibility();
  }
  function capture() {
    // Keep legacy preferences that no longer have a control. The two original
    // protection flags both selected the same art box in the card editor.
    const values = clone(drafts[selected]);
    Object.keys(preset().defaults).forEach(key => {
      if (!fields[key]) return;
      values[key] = boolKeys.includes(key) ? fields[key].checked
        : numberKeys.includes(key) ? (fields[key].value === '' ? null : Number(fields[key].value))
          : fields[key].value;
    });
    const artwork = fields.selection_region.value === 'artwork';
    if (artwork !== Boolean(values.protect_text || values.protect_frame)) {
      values.protect_text = values.protect_frame = artwork;
    }
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
    capture(); selected = next; showProfile(); message('Choose Save settings to keep changes.');
  });
  form.addEventListener('input', event => {
    if (event.target.name !== 'workflow_id') dirty.add(selected);
  });
  form.addEventListener('change', event => {
    if (event.target.name !== 'workflow_id') { dirty.add(selected); updateVisibility(); }
  });
  dialog.querySelector('[data-foil-reset]').addEventListener('click', () => {
    drafts[selected] = clone(preset().defaults); dirty.add(selected); showProfile();
    message('Defaults restored. Save to keep them.');
  });
  dialog.querySelectorAll('[data-foil-cancel]').forEach(button => button.addEventListener('click', () => {
    if (!saving) dialog.close();
  }));
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => configure.focus());
  configure.addEventListener('click', async () => {
    loadVersion++;
    configure.disabled = true;
    try {
      data = await api();
      drafts = clone(data.preferences.profiles); dirty = new Set();
      selected = data.preferences.active_workflow;
      fields.pdf_version.value=data.preferences.pdf_version||"1.5";
      showProfiles(data,data.preferences.cmyk_profile||"");
      fields.disable_gloss_on_view.checked = Boolean(data.preferences.disable_gloss_on_view);
      for(const key of ["include_effect1_default","include_effect2_default"])fields[key].checked=data.preferences[key]!==false;
      setOptions(fields.workflow_id, data.workflows.map(item => item.id),
        Object.fromEntries(data.workflows.map(item => [item.id, item.label])));
      showProfile(); message(''); showSummary(); dialog.showModal(); fields.workflow_id.focus();
    } catch (error) { summary.textContent = `${error.message} Choose Studio Settings to retry.`; }
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
      data = await api({pdf_version:fields.pdf_version.value, active_workflow: selected, profiles, disable_gloss_on_view: fields.disable_gloss_on_view.checked, include_effect1_default:fields.include_effect1_default.checked, include_effect2_default:fields.include_effect2_default.checked, cmyk_profile:fields.cmyk_profile.value});
      window.dispatchEvent(new CustomEvent('finishing-view-settings', {detail:data.preferences}));
      showSummary(); dialog.close();
    } catch (error) {
      message(error.message + (error.retryable ? ' Your changes are still here; try Save again.' : ''), true);
      status.scrollIntoView({block: 'nearest'});
    }
    finally {
      saving = false;
      Array.from(fields).forEach(field => { field.disabled = false; });
      updateVisibility();
    }
  });
  // A slow page-load summary must not replace a newer editor load or save.
  const initialVersion = loadVersion;
  api().then(result => {
    if (initialVersion !== loadVersion) return;
    data = result; showSummary();
  }).catch(error => {
    if (initialVersion === loadVersion) summary.textContent = `${error.message} Choose Studio Settings to retry.`;
  });
})();
