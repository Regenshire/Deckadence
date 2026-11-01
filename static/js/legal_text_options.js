// Shared by individual upscales, batch upscales, and Advanced Image settings.
(() => {
  const DEFAULT_TEXT = 'PROXY • NOT FOR SALE';
  let nextId = 0;

  async function settings(payload) {
    const response = await fetch('/config/upscaling/legal-text', payload ? {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
    } : {cache: 'no-store'});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Could not save legal text settings.');
    return data;
  }

  function validate(text) {
    const lines = text.replace(/\r/g, '').trim().split('\n').map(line => line.trim());
    if (!lines[0] || lines.some(line => !line) || lines.length > 2 || text.length > 100) {
      throw new Error('Use one or two lines of proxy text, up to 100 characters total.');
    }
    return lines.join('\n');
  }

  function create({id = `legalText${++nextId}`, defaults = false} = {}) {
    let customText = DEFAULT_TEXT, available = false;
    const field = document.createElement('div');
    field.className = 'imomir-upscale-field legal-text-field';
    const label = document.createElement('label');
    label.htmlFor = id; label.textContent = 'Legal text';
    const wrap = document.createElement('span');
    wrap.className = 'holofoil-select-wrap';
    const select = document.createElement('select');
    select.id = id;
    for (const [value, name] of [['none', 'None / Keep Legal'], ['remove', 'Remove'], ['custom', 'Replace with Custom Proxy Text']]) {
      select.add(new Option(name, value));
    }
    const gear = document.createElement('button');
    gear.type = 'button'; gear.className = 'holofoil-gear';
    gear.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
    gear.title = 'Edit custom proxy text'; gear.setAttribute('aria-label', gear.title);
    wrap.append(select, gear); field.append(label, wrap);
    function refresh() {
      gear.hidden = select.value !== 'custom';
      gear.disabled = select.disabled;
      select.title = available ? 'Only small disclaimer text in the bottom-right footer is edited.'
        : 'Install Card Finishing Studio AI detection to remove or replace legal text.';
      for (const option of select.options) option.disabled = !defaults && !available && option.value !== 'none';
    }
    select.addEventListener('change', refresh);
    gear.onclick = () => openEditor();
    async function openEditor() {
      const dialog = document.createElement('dialog');
      dialog.className = 'holofoil-options-dialog legal-text-dialog';
      dialog.setAttribute('aria-labelledby', `${id}Title`);
      dialog.innerHTML = `<form method="dialog">
        <header><h2 id="${id}Title">Custom proxy text</h2><button value="cancel" aria-label="Close">×</button></header>
        <section><label for="${id}Text">Replacement text</label><textarea id="${id}Text" name="text" maxlength="100" rows="2" spellcheck="false" aria-describedby="${id}Help"></textarea>
          <small id="${id}Help">One or two short lines. Text is fitted to the detected legal area and matched to its original ink color. Power/toughness, artist credits, and the stamp stay in place.</small>
          <div class="legal-text-example" aria-label="Example footer"><span>PROXY CARD</span><output name="preview"></output></div>
          <small>Example layout. Each card uses its own background and text color. If text cannot fit safely, the original legal is kept.</small>
        </section>
        <label class="save-defaults"><input type="checkbox" name="defaults"> Use this text by default</label>
        <p class="status" role="status"></p>
        <footer><button value="cancel">Cancel</button><button type="button" name="apply">Apply text</button></footer>
      </form>`;
      const e = dialog.querySelector('form').elements;
      e.text.value = customText;
      e.defaults.checked = defaults; e.defaults.disabled = defaults;
      e.apply.textContent = defaults ? 'Save defaults' : 'Apply text';
      const preview = () => {e.preview.textContent = e.text.value;};
      e.text.oninput = preview; preview();
      e.apply.onclick = async () => {
        e.apply.disabled = true;
        try {
          const value = validate(e.text.value);
          if (e.defaults.checked) {
            // Per-card edits can save text without changing the global mode.
            await settings({custom_text: value, ...(defaults ? {replacement: select.value} : {})});
          }
          customText = value;
          field.dispatchEvent(new CustomEvent('legaltextchange'));
          dialog.close();
        } catch (error) {dialog.querySelector('.status').textContent = error.message;}
        finally {e.apply.disabled = false;}
      };
      dialog.addEventListener('close', () => dialog.remove(), {once: true});
      document.body.append(dialog); dialog.showModal(); e.text.focus();
    }
    refresh();
    return {
      field, select,
      setMetadata(data = {}) {
        available = Boolean(data.available);
        customText = data.custom_text || DEFAULT_TEXT;
        select.value = ['remove', 'custom'].includes(data.replacement) ? data.replacement : 'none';
        refresh();
      },
      setDisabled(value) {select.disabled = Boolean(value); refresh();},
      setText(value) {customText = value;},
      payload: () => ({legal_text_replacement: select.value, legal_custom_text: customText}),
      text: () => customText,
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = document.getElementById('upscalingLegalTextSettings');
    if (!host) return;
    const control = create({id: 'upscalingLegalReplacement', defaults: true});
    host.querySelector('[data-legal-control]').append(control.field);
    const input = host.querySelector('textarea');
    const status = host.querySelector('[role=status]');
    const save = host.querySelector('[data-legal-save]');
    const preview = host.querySelector('[data-legal-example]');
    const refresh = () => {
      host.querySelector('[data-legal-custom]').hidden = control.select.value !== 'custom';
      preview.textContent = input.value;
    };
    control.select.addEventListener('change', refresh);
    input.addEventListener('input', () => {control.setText(input.value); refresh();});
    control.field.addEventListener('legaltextchange', () => {input.value = control.text(); refresh(); status.textContent = 'Proxy text saved.';});
    save.onclick = async () => {
      save.disabled = true;
      try {
        const data = await settings({replacement: control.select.value,
          ...(control.select.value === 'custom' ? {custom_text: validate(input.value)} : {})});
        control.setMetadata(data); input.value = data.custom_text; refresh();
        status.textContent = 'Legal text defaults saved.';
      } catch (error) {status.textContent = error.message;}
      finally {save.disabled = false;}
    };
    control.setDisabled(true); save.disabled = true;
    try {
      const data = await settings(); control.setMetadata(data); input.value = data.custom_text; refresh();
      status.textContent = data.available ? 'Used for future individual and batch upscales.'
        : 'Install Card Finishing Studio AI detection in Plugin Manager to use Remove or Replace.';
      control.setDisabled(false); save.disabled = false;
    } catch (error) {status.textContent = error.message;}
  });
  window.LegalTextOptions = {create};
})();
