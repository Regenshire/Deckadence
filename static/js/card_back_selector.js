// Card-back library: stable selections, persistent folders, and expandable galleries.
(() => {
  const modal = document.getElementById('cardBackSelectorModal');
  if (!modal) return;
  const el = id => document.getElementById(id);
  const grid = el('cardBackSelectorGrid'), body = modal.querySelector('.card-back-selector-body');
  const search = el('cardBackSearch'), source = el('cardBackSource'), size = el('cardBackSize');
  const apply = el('cardBackSelectorApplyButton'), status = el('cardBackSelectorStatus');
  const context = el('cardBackSelectorContextMenu'), confirm = el('cardBackDeleteConfirm');
  const renameDialog = el('cardBackRenameDialog'), renameInput = el('cardBackRenameInput');
  const preview = el('cardBackPreview'), previewImage = el('cardBackPreviewImage'), zoom = el('cardBackImageZoom');
  let previewOpener = null;
  let activeButton = null, options = [], folders = [], selectedKey = '', defaultKey = '';
  let folderFilter = '', busy = false, loading = false, epoch = 0, maxUpload = 0;
  let contextOption = null, pendingDelete = null, controller = null, frame = 0, contextScrollTop = 0;
  let pendingRename = null;
  // Match Add Cards: one family opens only when its expansion control is used.
  const expanded = new Set();
  const readSetting = (key, fallback) => { try { return localStorage.getItem('deckadence.cardBacks.' + key) || fallback; } catch { return fallback; } };
  const saveSetting = (key, value) => { try { localStorage.setItem('deckadence.cardBacks.' + key, value); } catch {} };
  let gallery = readSetting('view', 'gallery') !== 'list';
  const labelsOnly = () => activeButton?.dataset.cardBackSupportsLabelsOnly === '1';
  const eligible = () => options.filter(option => !labelsOnly() || option.supports_labels);
  const selected = () => options.find(option => option.key === selectedKey);
  const label = option => option?.label || option?.filename || 'Card Back';
  const targetInput = button => el(button?.dataset.cardBackTargetInput || '');
  const node = (tag, className, text) => { const item = document.createElement(tag); if (className) item.className = className; if (text !== undefined) item.textContent = text; return item; };
  const setStatus = (text = '', error = false) => { for (const target of [status, el('cardBackPreviewStatus')]) { target.textContent = text; target.classList.toggle('hidden', !text); target.classList.toggle('is-error', error); } };
  const hideContext = () => { context.classList.add('hidden'); contextOption = null; };
  const closeConfirm = () => { confirm.classList.add('hidden'); confirm.setAttribute('aria-hidden', 'true'); pendingDelete = null; };
  const closeRename = () => { renameDialog.classList.add('hidden'); renameDialog.setAttribute('aria-hidden', 'true'); pendingRename = null; };
  function setBusy(value) {
    busy = value;
    for (const id of ['cardBackSelectorUploadButton', 'cardBackCreateFolder', 'cardBackMoveButton', 'cardBackDeleteConfirmButton', 'cardBackRenameSave', 'cardBackRenameCancel', 'cardBackRenameInput']) el(id).disabled = value;
    updateSelection();
  }
  function updateSelection() {
    const option = selected();
    grid.querySelectorAll('[data-card-back-key]').forEach(button => {
      const isSelected = button.dataset.cardBackKey === selectedKey;
      button.classList.toggle('is-selected', isSelected); button.setAttribute('aria-pressed', String(isSelected));
    });
    apply.disabled = busy || loading || !eligible().some(item => item.key === selectedKey);
    el('cardBackSelectionSummary').textContent = option ? 'Selected: ' + label(option) : 'No card back selected';
    el('cardBackOrganizeName').textContent = option ? label(option) : 'Select a card back.';
    el('cardBackMoveButton').disabled = busy || loading || !option;
    el('cardBackMoveFolder').disabled = busy || !option;
    if (option) el('cardBackMoveFolder').value = option.folder;
    el('cardBackDeleteSelected').classList.toggle('hidden', option?.source !== 'custom');
    el('cardBackDeleteSelected').disabled = busy;
    updatePreview();
  }
  function selectKey(key, showDetails = true) {
    if (busy) return;
    selectedKey = key;
    hideContext(); updateSelection();
    if (showDetails) showPreview();
  }
  function updatePreview() {
    const option = selected();
    el('cardBackPreviewSelect').disabled = apply.disabled;
    const isAppDefault = option?.key === defaultKey;
    const isFolderDefault = option && folders.find(folder => folder.path === option.folder)?.default_key === option.key;
    el('cardBackSetAppDefault').disabled = busy || loading || !option || isAppDefault;
    el('cardBackSetAppDefault').textContent = isAppDefault ? 'App default' : 'Set as app default';
    el('cardBackSetFolderDefault').disabled = busy || loading || !option || isFolderDefault;
    el('cardBackSetFolderDefault').textContent = isFolderDefault ? 'Folder default' : 'Set as folder default';
    if (!option) { closePreview(false); return; }
    const url = (labelsOnly() && option.label_preview_url) || option.image_url;
    if (previewImage.getAttribute('src') !== url) previewImage.src = url;
    previewImage.alt = label(option);
    el('cardBackPreviewTitle').textContent = label(option);
    el('cardBackPreviewFolder').textContent = option.folder.replaceAll('/', ' / ');
    el('cardBackPreviewSource').textContent = option.source === 'custom' ? 'Custom upload' : 'Included';
    el('cardBackPreviewBleed').textContent = option.has_full_bleed ? '3 mm included' : 'Not included';
  }
  function showPreview() {
    if (!selected()) return;
    previewOpener = [...grid.querySelectorAll('[data-card-back-key]')].find(button => button.dataset.cardBackKey === selectedKey);
    preview.classList.remove('hidden');
    if (matchMedia('(max-width:850px)').matches) showSidebar(false);
    el('cardBackPreviewClose').focus({preventScroll:true}); scheduleLayout();
  }
  function closePreview(restoreFocus = true) {
    preview.classList.add('hidden');
    if (restoreFocus && previewOpener?.isConnected) previewOpener.focus({preventScroll:true});
    previewOpener = null; scheduleLayout();
  }
  function closeZoom() {
    zoom.classList.add('hidden'); zoom.setAttribute('aria-hidden', 'true'); el('cardBackImageZoomImage').removeAttribute('src');
  }
  async function setDefault(scope) {
    if (busy || !selected()) return;
    const data = new FormData(); data.append('scope', scope); data.append('card_back_key', selectedKey);
    await mutate(modal.dataset.defaultUrl, data, () => setStatus(scope === 'folder' ? 'Folder default updated.' : 'App default updated.'));
  }
  function acceptPayload(payload) {
    if (Array.isArray(payload.options)) options = payload.options.map(option => ({...option, folder: option.folder || 'Deckadence'}));
    if (Array.isArray(payload.folders)) folders = payload.folders;
    if (payload.default_key !== undefined) defaultKey = payload.default_key || '';
    selectedKey = options.find(option => option.legacy_keys?.includes(selectedKey))?.key || selectedKey;
    if (!eligible().some(option => option.key === selectedKey)) selectedKey = eligible().find(option => option.key === defaultKey)?.key || eligible()[0]?.key || '';
  }
  function syncFolderControls() {
    const available = eligible();
    const list = el('cardBackFolderList'); list.replaceChildren();
    for (const folder of [{path: '', name: 'All folders'}, ...folders]) {
      const count = available.filter(option => !folder.path || option.folder === folder.path || option.folder.startsWith(folder.path + '/')).length;
      const button = node('button', '', ''); button.type = 'button'; button.dataset.folder = folder.path;
      button.setAttribute('aria-current', String(folderFilter === folder.path));
      button.style.paddingLeft = (10 + Math.max(0, folder.path.split('/').length - 1) * 14) + 'px';
      button.append(node('span', '', folder.name), node('small', '', String(count)));
      button.addEventListener('click', () => { folderFilter = folder.path; search.value = ''; expanded.clear(); render(); if (matchMedia('(max-width:620px)').matches) showSidebar(false); });
      list.append(button);
    }
    for (const id of ['cardBackMoveFolder', 'cardBackFolderParent']) {
      const select = el(id), value = select.value; select.replaceChildren();
      if (id === 'cardBackFolderParent') select.add(new Option('Top level', ''));
      for (const folder of folders) select.add(new Option(folder.path.replaceAll('/', ' / '), folder.path));
      const fallback = id === 'cardBackFolderParent' ? '' : (folderFilter || 'Deckadence');
      select.value = [...select.options].some(option => option.value === value) ? value : fallback;
    }
  }
  function showContext(event, option) {
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    selectKey(option.key, false); contextOption = option;
    el('cardBackSelectorDeleteMenuItem').classList.toggle('hidden', option.source !== 'custom');
    el('cardBackRenameMenuItem').classList.toggle('hidden', option.source !== 'custom');
    context.classList.remove('hidden');
    context.style.left = Math.min(event.clientX, innerWidth - context.offsetWidth - 8) + 'px';
    context.style.top = Math.min(event.clientY, innerHeight - context.offsetHeight - 8) + 'px';
    contextScrollTop = body.scrollTop;
    context.querySelector('button').focus({preventScroll:true});
  }
  function makeTile(option) {
    const tile = node('div', 'card-back-tile');
    const button = node('button', 'card-back-selector-option'); button.type = 'button'; button.dataset.cardBackKey = option.key; button.title = label(option);
    const wrap = node('span', 'card-back-selector-option-image-wrap');
    const image = node('img'); image.src = (labelsOnly() && option.label_preview_url) || option.image_url; image.alt = label(option); image.loading = 'lazy'; image.decoding = 'async'; wrap.append(image);
    const description = [option.source === 'custom' ? 'My upload' : 'Included'];
    if (option.has_full_bleed) description.push('3 mm bleed');
    if (labelsOnly()) description.push(option.label_style === 'insert_panel' ? 'Label panel' : 'Label bar');
    button.append(wrap, node('span', 'card-back-selector-option-title', label(option)), node('span', 'card-back-selector-option-source', description.join(' · ')));
    button.addEventListener('click', () => selectKey(option.key));
    button.addEventListener('contextmenu', event => showContext(event, option));
    button.addEventListener('keydown', event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const box = button.getBoundingClientRect(); showContext({preventDefault(){}, stopPropagation(){}, clientX:box.left + 15, clientY:box.top + 15}, option); } });
    tile.append(button); return tile;
  }
  function render() {
    syncFolderControls(); grid.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const matches = eligible().filter(option => (!folderFilter || option.folder === folderFilter || option.folder.startsWith(folderFilter + '/')) &&
      (source.value === 'all' || option.source === source.value) && (!query || (label(option) + ' ' + option.folder).toLocaleLowerCase().includes(query)));
    const descending = el('cardBackSort').value === 'name-desc';
    matches.sort((a,b) => label(a).localeCompare(label(b), undefined, {numeric:true}) * (descending ? -1 : 1));
    let groupCount = 0;
    for (const folder of folders) {
      if (folderFilter && folder.path !== folderFilter && !folder.path.startsWith(folderFilter + '/')) continue;
      const items = matches.filter(option => option.folder === folder.path);
      if (!items.length && (query || source.value !== 'all' || eligible().some(option => option.folder === folder.path))) continue;
      const group = node('section', 'card-back-group'); group.dataset.folder = folder.path;
      const open = expanded.has(folder.path); group.classList.toggle('is-expanded', open);
      const heading = node('h3', 'card-back-group-heading'); heading.append(node('span', '', folder.path.replaceAll('/', ' / ')), node('small', '', String(items.length)));
      const content = node('div', 'card-back-group-items'); content.id = 'cardBackGroup-' + groupCount++;
      group.append(heading, content);
      if (items.length) {
        const primary = items.find(option => option.key === folder.default_key) || items.find(option => option.key === selectedKey) || items[0];
        const ordered = [primary, ...items.filter(option => option !== primary)];
        for (const option of ordered) content.append(makeTile(option));
        const toggle = node('button', 'card-back-group-toggle', open ? items.length + ' card back' + (items.length === 1 ? '' : 's') + ' ⌃' : 'All card backs ⌄');
        toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-controls', content.id);
        toggle.setAttribute('aria-label', (open ? 'Collapse ' : 'Expand ') + folder.path + ', ' + items.length + ' card backs');
        toggle.addEventListener('click', () => {
          const top = group.getBoundingClientRect().top;
          const shouldOpen = !expanded.has(folder.path);
          expanded.clear();
          if (shouldOpen) expanded.add(folder.path);
          render(); layout();
          const next = [...grid.children].find(item => item.dataset.folder === folder.path);
          if (next) { body.scrollTop += next.getBoundingClientRect().top - top; next.querySelector('.card-back-group-toggle')?.focus({preventScroll:true}); }
        });
        content.firstElementChild.append(toggle);
      } else {
        const blank = node('button', 'card-back-folder-empty'); blank.type = 'button';
        blank.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 12h14l5 5h19v24H5z"/><path d="M5 12V8h14l5 4h17v5"/></svg>';
        blank.append(node('strong', '', 'No card backs yet'), node('span', '', folder.path === 'Uncategorized' ? 'New uploads appear here.' : 'Move a card back here to organize it.'));
        blank.addEventListener('click', () => {
          if (folder.path === 'Uncategorized') { showUpload(true); el('cardBackSelectorUploadInput').focus(); }
          else { showSidebar(true); el('cardBackMoveFolder').value = folder.path; el('cardBackMoveFolder').focus(); }
        });
        content.append(blank);
      }
      grid.append(group);
    }
    el('cardBackResultsSummary').textContent = loading ? 'Loading card backs…' : matches.length + ' card back' + (matches.length === 1 ? '' : 's') + ' · ' + groupCount + ' folder' + (groupCount === 1 ? '' : 's');
    el('cardBackSelectorEmpty').classList.toggle('hidden', groupCount > 0 || loading);
    updateSelection(); scheduleLayout();
  }
  function scheduleLayout() { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); }
  function layout() {
    if (modal.classList.contains('hidden') || !grid.clientWidth) return;
    const auto = size.value === 'auto' || !size.value;
    const target = auto ? (innerWidth <= 620 ? 145 : innerWidth <= 1100 ? 160 : 190) : (window.DeckadenceCardSizes?.pixels(size.value) || 190);
    const columns = Math.max(1, Math.floor((grid.clientWidth + 14) / (target + 14)));
    const width = auto ? Math.floor((grid.clientWidth - 14 * (columns - 1)) / columns) : Math.min(target, grid.clientWidth);
    grid.style.setProperty('--back-columns', columns); grid.style.setProperty('--back-card-width', width + 'px');
    let column = 0, row = 1;
    const wraps = [];
    for (const group of grid.children) {
      const heading = group.querySelector('.card-back-group-heading'), cards = [...group.querySelectorAll('.card-back-tile')];
      group.classList.remove('flow-expanded'); group.querySelector('.card-back-group-surface')?.remove(); heading.style.marginLeft = '';
      cards.forEach(card => card.style.gridColumn = '');
      if (!gallery) { group.style.gridColumn = ''; group.style.gridRow = ''; continue; }
      const count = group.classList.contains('is-expanded') ? Math.max(1, cards.length) : 1;
      const span = Math.max(1, Math.min(count, columns - column));
      group.style.gridRow = row;
      if (column > 0 && count > columns - column) {
        group.classList.add('flow-expanded'); group.style.gridColumn = '1 / -1'; group.style.setProperty('--back-span', columns);
        const offset = column * (width + 14); heading.style.marginLeft = offset + 'px'; cards[0].style.gridColumn = column + 1;
        wraps.push({group, first:cards[0], offset}); column = 0; row++;
      } else {
        group.style.gridColumn = (column + 1) + ' / span ' + span; group.style.setProperty('--back-span', span);
        column += span; if (column === columns) { column = 0; row++; }
      }
    }
    for (const {group, first, offset} of wraps) {
      const bounds = group.getBoundingClientRect(), box = first.getBoundingClientRect();
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('card-back-group-surface'); svg.setAttribute('aria-hidden','true');
      svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
      const path = document.createElementNS(svg.namespaceURI,'path'), right = bounds.width-.5, bottom = bounds.height-.5, step = box.bottom-bounds.top+9, left=offset+.5, radius=9;
      path.setAttribute('d', `M ${left+radius} .5 H ${right-radius} Q ${right} .5 ${right} ${radius} V ${bottom-radius} Q ${right} ${bottom} ${right-radius} ${bottom} H ${radius} Q .5 ${bottom} .5 ${bottom-radius} V ${step+radius} Q .5 ${step} ${radius} ${step} H ${left-radius} Q ${left} ${step} ${left} ${step-radius} V ${radius} Q ${left} .5 ${left+radius} .5 Z`);
      svg.append(path); group.prepend(svg);
    }
  }
  function showSidebar(open) { el('cardBackSidebar').classList.toggle('hidden', !open); el('cardBackFoldersToggle').setAttribute('aria-expanded', String(open)); if (open && matchMedia('(max-width:850px)').matches) closePreview(false); hideContext(); scheduleLayout(); }
  function showUpload(open) { el('cardBackUploadPanel').classList.toggle('hidden', !open); el('cardBackUploadToggle').setAttribute('aria-expanded', String(open)); }
  function setView(value) {
    gallery = value; modal.classList.toggle('is-list', !gallery);
    el('cardBackGallery').setAttribute('aria-pressed', String(gallery)); el('cardBackList').setAttribute('aria-pressed', String(!gallery));
    el('cardBackSizeLabel').classList.toggle('hidden', !gallery); saveSetting('view', gallery ? 'gallery' : 'list'); scheduleLayout();
  }
  function maximize(value) { modal.classList.toggle('is-maximized', value); el('cardBackMaximize').setAttribute('aria-pressed', String(value)); el('cardBackMaximize').querySelector('span').textContent = value ? 'Restore' : 'Maximize'; saveSetting('maximized', value ? '1' : '0'); scheduleLayout(); }
  async function request(url, init = {}) {
    const response = await fetch(url, {...init, headers:{Accept:'application/json', ...init.headers}});
    const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.message || 'The card-back request could not be completed.'); return payload;
  }
  async function openModal(button) {
    if (busy) return;
    controller?.abort(); controller = new AbortController(); const token = ++epoch;
    activeButton = button; selectedKey = String(targetInput(button)?.value || button?.dataset.selectedCardBackKey || '');
    options = []; folders = []; folderFilter = ''; search.value = ''; source.value = 'all'; loading = true;
    expanded.clear();
    closePreview(false); closeZoom();
    hideContext(); closeConfirm(); closeRename(); showUpload(false); showSidebar(!matchMedia('(max-width:620px)').matches);
    modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
    modal.querySelector('.card-back-selector-header p').textContent = labelsOnly() ? 'Choose a back for your label. A matching label bar is added when needed.' : 'Browse folders and choose a back for your cards.';
    render(); setStatus('Loading card backs…'); search.focus();
    try {
      const url = new URL(modal.dataset.optionsUrl, location.href); if (labelsOnly()) url.searchParams.set('supports_labels','1');
      const payload = await request(url, {signal:controller.signal}); if (token !== epoch) return;
      acceptPayload(payload); maxUpload = Number(payload.max_upload_size_bytes || 0);
      el('cardBackSelectorUploadFullBleed').checked = Boolean(payload.upload_full_bleed_3mm);
      setStatus();
    } catch (error) { if (token === epoch && error.name !== 'AbortError') setStatus(error.message, true); }
    finally { if (token === epoch) { loading = false; render(); } }
  }
  function closeModal() {
    if (busy) return;
    ++epoch; controller?.abort(); hideContext(); closeConfirm(); closeRename(); closePreview(false); closeZoom(); modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true');
    el('cardBackSelectorUploadInput').value = ''; setStatus(); const opener = activeButton; activeButton = null; opener?.focus();
  }
  async function mutate(url, data, after) {
    if (busy) return; setBusy(true); hideContext(); setStatus();
    try { const payload = await request(url, {method:'POST', body:data}); acceptPayload(payload); after?.(payload); render(); }
    catch (error) { setStatus(error.message, true); }
    finally { setBusy(false); }
  }
  async function upload() {
    const file = el('cardBackSelectorUploadInput').files[0]; if (!file) return setStatus('Choose an image file first.',true);
    if (maxUpload > 0 && file.size > maxUpload) return setStatus(`Choose an image smaller than ${Math.round(maxUpload/1048576)} MB.`,true);
    const data = new FormData(); data.append('card_back_file',file); data.append('folder','Uncategorized');
    if (el('cardBackSelectorUploadFullBleed').checked) data.append('full_bleed_3mm','1');
    await mutate(modal.dataset.uploadUrl,data,payload => { selectedKey = payload.option.key; folderFilter=payload.option.folder; expanded.clear(); search.value=''; source.value='all'; el('cardBackSelectorUploadInput').value=''; showUpload(false); setStatus('Card back uploaded.'); });
  }
  async function moveSelected() {
    if (!selected()) return;
    const destination=el('cardBackMoveFolder').value, data=new FormData();
    data.append('action','move'); data.append('folder',destination); data.append('card_back_key',selectedKey);
    await mutate(modal.dataset.foldersUrl,data,() => { folderFilter=destination; expanded.clear(); search.value=''; setStatus('Moved to '+destination.replaceAll('/',' / ')+'.'); });
  }
  async function createFolder(event) {
    event.preventDefault(); const name=el('cardBackFolderName').value.trim(), parent=el('cardBackFolderParent').value;
    if (!name || name.includes('/')) return setStatus('Enter a folder name; choose its parent separately.',true);
    const path=parent ? parent+'/'+name : name, data=new FormData(); data.append('action','create'); data.append('folder',path);
    await mutate(modal.dataset.foldersUrl,data,() => { folderFilter=path; expanded.clear(); search.value=''; source.value='all'; el('cardBackFolderName').value=''; el('cardBackNewFolderPanel').open=false; setStatus('Folder created.'); });
  }
  function openDelete(option) {
    if (busy || option?.source !== 'custom') return;
    pendingDelete=option; hideContext(); el('cardBackDeleteConfirmName').textContent=label(option); confirm.classList.remove('hidden'); confirm.setAttribute('aria-hidden','false'); el('cardBackDeleteConfirmCancel').focus();
  }
  function openRename(option) {
    if (busy || option?.source !== 'custom') return;
    pendingRename = option; hideContext(); renameInput.value = label(option);
    el('cardBackRenameError').classList.add('hidden');
    renameDialog.classList.remove('hidden'); renameDialog.setAttribute('aria-hidden', 'false');
    renameInput.focus(); renameInput.select();
  }
  async function saveRename(event) {
    event.preventDefault(); if (busy || !pendingRename) return;
    const key = pendingRename.key, data = new FormData();
    data.append('card_back_key', key); data.append('name', renameInput.value.trim());
    setBusy(true); el('cardBackRenameError').classList.add('hidden');
    try {
      const payload = await request(modal.dataset.renameUrl, {method:'POST', body:data});
      acceptPayload(payload); closeRename(); render();
      const currentKey = targetInput(activeButton)?.value || activeButton?.dataset.selectedCardBackKey;
      if (currentKey === key) updateOpener(selected());
      setStatus('Card back renamed.');
    } catch (error) {
      el('cardBackRenameError').textContent = error.message; el('cardBackRenameError').classList.remove('hidden');
    } finally { setBusy(false); if (pendingRename) renameInput.focus(); }
  }
  async function deleteSelected() {
    if (!pendingDelete) return; const key=pendingDelete.key, data=new FormData(); data.append('card_back_key',key);
    await mutate(modal.dataset.deleteUrl,data,() => {
      const input=targetInput(activeButton); if (input?.value===key) { input.value=selectedKey; input.dispatchEvent(new Event('change',{bubbles:true})); updateOpener(selected()); }
      closeConfirm(); setStatus('Custom card back deleted.');
    });
  }
  function updateOpener(option) { if (!activeButton) return; activeButton.dataset.selectedCardBackKey=selectedKey; activeButton.title='Card Back: '+label(option); activeButton.setAttribute('aria-label',activeButton.title); }
  async function applySelection() {
    if (busy || loading || !selected() || !activeButton) return; setBusy(true); const option=selected();
    try {
      const url=activeButton.dataset.cardBackSaveUrl;
      if (url) { const data=new FormData(); data.append('card_back_key',selectedKey); await request(url,{method:'POST',body:data}); }
      const input=targetInput(activeButton); if (input) { input.value=selectedKey; input.dispatchEvent(new CustomEvent('change',{bubbles:true,detail:{cardBackOption:option}})); }
      updateOpener(option); setBusy(false); closeModal();
    } catch (error) { setStatus(error.message,true); setBusy(false); }
  }
  document.addEventListener('click',event => { const button=event.target.closest('[data-card-back-selector-open]'); if (button) openModal(button); if (!context.contains(event.target)) hideContext(); });
  modal.querySelectorAll('[data-card-back-selector-close]').forEach(button => button.addEventListener('click',closeModal));
  search.addEventListener('input',() => { expanded.clear(); render(); });
  source.addEventListener('change',() => { expanded.clear(); render(); }); el('cardBackSort').addEventListener('change',render);
  el('cardBackGallery').addEventListener('click',()=>setView(true)); el('cardBackList').addEventListener('click',()=>setView(false));
  el('cardBackMaximize').addEventListener('click',()=>maximize(!modal.classList.contains('is-maximized')));
  el('cardBackFoldersToggle').addEventListener('click',()=>showSidebar(el('cardBackSidebar').classList.contains('hidden')));
  el('cardBackUploadToggle').addEventListener('click',()=>showUpload(el('cardBackUploadPanel').classList.contains('hidden')));
  el('cardBackSelectorUploadButton').addEventListener('click',upload); el('cardBackNewFolderForm').addEventListener('submit',createFolder);
  el('cardBackMoveButton').addEventListener('click',moveSelected); apply.addEventListener('click',applySelection);
  el('cardBackPreviewSelect').addEventListener('click',applySelection);
  el('cardBackPreviewClose').addEventListener('click',()=>closePreview());
  el('cardBackSetAppDefault').addEventListener('click',()=>setDefault('app'));
  el('cardBackSetFolderDefault').addEventListener('click',()=>setDefault('folder'));
  el('cardBackPreviewEnlarge').addEventListener('click',()=>{if (!selected()) return; const image=el('cardBackImageZoomImage'); image.src=previewImage.src; image.alt=previewImage.alt; zoom.classList.remove('hidden'); zoom.setAttribute('aria-hidden','false'); el('cardBackImageZoomClose').focus();});
  el('cardBackImageZoomClose').addEventListener('click',closeZoom);
  el('cardBackDeleteSelected').addEventListener('click',()=>openDelete(selected())); el('cardBackDeleteConfirmCancel').addEventListener('click',closeConfirm); el('cardBackDeleteConfirmButton').addEventListener('click',deleteSelected);
  el('cardBackSelectorDeleteMenuItem').addEventListener('click',()=>openDelete(contextOption));
  el('cardBackRenameMenuItem').addEventListener('click',()=>openRename(contextOption));
  el('cardBackRenameForm').addEventListener('submit',saveRename);
  el('cardBackRenameCancel').addEventListener('click',()=>{if (!busy) closeRename();});
  el('cardBackMoveMenuItem').addEventListener('click',()=>{hideContext(); showSidebar(true); el('cardBackMoveFolder').focus();});
  context.addEventListener('click',event=>event.stopPropagation()); body.addEventListener('scroll',()=>{if (body.scrollTop !== contextScrollTop) hideContext();},{passive:true});
  size.value=readSetting('size','auto'); if (!size.value) size.value='auto';
  size.addEventListener('change',()=>{saveSetting('size',size.value);scheduleLayout();});
  new ResizeObserver(scheduleLayout).observe(grid); window.addEventListener('resize',()=>{hideContext();scheduleLayout();});
  document.addEventListener('keydown',event=>{
    if (event.key!=='Escape'||modal.classList.contains('hidden')) return;
    event.preventDefault(); if (busy) return;
    if (!renameDialog.classList.contains('hidden')) return closeRename();
    if (!confirm.classList.contains('hidden')) return closeConfirm();
    if (!context.classList.contains('hidden')) return hideContext();
    if (!zoom.classList.contains('hidden')) return closeZoom();
    if (!preview.classList.contains('hidden')) return closePreview();
    closeModal();
  });
  setView(gallery); maximize(readSetting('maximized','0')==='1');
  window.iMomirCardBackSelector={open:openModal,close:closeModal};
})();
