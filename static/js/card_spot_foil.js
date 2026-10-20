// Card-specific selection, using the same shared/isolated library as alternate images.
(() => {
  "use strict";
  const dialog = document.getElementById("cardSpotFoilDialog");
  if (!dialog || !window.DeckadenceCardEffects) return;
  const effects = window.DeckadenceCardEffects;
  const form = dialog.querySelector("form"), fields = form.elements;
  const stage = dialog.querySelector("[data-spot-stage]");
  const viewport = dialog.querySelector("[data-spot-viewport]");
  const image = dialog.querySelector("[data-spot-image]");
  const canvas = dialog.querySelector("[data-spot-canvas]");
  const cursor = dialog.querySelector("[data-spot-cursor]");
  const mask = document.createElement("canvas");
  mask.width = canvas.width; mask.height = canvas.height;
  const ctx = mask.getContext("2d", {willReadFrequently: true});
  const overlay = canvas.getContext("2d");
  const strokeMask = document.createElement("canvas"), strokeBase = document.createElement("canvas");
  strokeMask.width = strokeBase.width = mask.width; strokeMask.height = strokeBase.height = mask.height;
  const strokeContext = strokeMask.getContext("2d"), baseContext = strokeBase.getContext("2d");
  const save = form.querySelector("[type=submit]");
  const status = dialog.querySelector("[data-spot-status]");
  const hostSelector = ".custom-draft-current-card-row, .custom-draft-current-grid-card, .deckbuilder-card[data-card-uuid], .chaos-pack-view-card[data-card-uuid]";
  const imageSelector = ".custom-draft-current-card-image, .chaos-pack-view-image, .campaign-test-draft-picked-thumb";
  const cache = new Map(), waiting = new Map(), versions = new Map(), boundButtons = new WeakSet();
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h12a2 2 0 0 1 2 2v15H4zM11 7l1.3 3.7L16 12l-3.7 1.3L11 17l-1.3-3.7L6 12l3.7-1.3ZM19 3v5M16.5 5.5h5"/></svg>';
  let lookupTimer, renderFrame, session = 0, current = null, ready = false, busy = false;
  let history = [], historyIndex = -1, hasInk = false, maskReviewed = false, removal = false, activeStroke = null;
  let tool = "paint", view = "effect", artworkUrl = "", maskUrl = "", scopeToken = null;
  let workflowOptions = {}, workflowId = "", drafts = {}, metadata = null, textRegions = [], showingText = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const keyFor = target => `${target.card_uuid}/${target.face}`;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("deckadence-spot-foil") : null;

  function apiUrl(path, writing = false) {
    const url = new URL(path, location.href);
    const owner = document.getElementById("alternateImageOverlay") || dialog;
    for (const [param, attr] of [["image_owner_kind", "imageOwnerKind"], ["image_owner_id", "imageOwnerId"]]) {
      if (owner.dataset[attr]) url.searchParams.set(param, owner.dataset[attr]);
    }
    if (writing) url.searchParams.set("expected_scope", current.scope);
    return url;
  }
  function endpoint(target) {
    return dialog.dataset.lookupUrl.replace(/\/lookup$/, "") + "/" + encodeURIComponent(target.card_uuid) + "/" + target.face;
  }
  async function api(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || "Spot foiling could not be loaded.");
    return payload;
  }
  function describe(host) {
    const img = host.querySelector(imageSelector);
    const uuid = host.dataset.cardUuid || img?.dataset.cardUuid;
    if (!img || !uuid) return null;
    const face = img.dataset.cardFlipFace === "back" ? "back" : "front";
    const raw = face === "back" ? (img.dataset.cardFlipBackSrc || img.src) : (img.dataset.cardImageSrc || img.currentSrc || img.src);
    if (!raw || raw.startsWith("data:")) return null;
    return {target: {card_uuid: uuid, face}, img,
      src: window.iMomirImageUrl ? window.iMomirImageUrl(raw) : raw,
      name: host.dataset.displayCardName || host.dataset.cardName || img.alt || "Card"};
  }
  function applyRecord(host, record) {
    const info = describe(host);
    if (!info) return;
    const surface = info.img.closest("[data-card-effects], .deckbuilder-card-image-wrap, .custom-draft-current-card-image-wrap, .chaos-pack-view-image-wrap");
    if (surface) effects.setSpotFoil(surface, record ? {maskUrl: record.mask_url, finish: record.finish, strength: record.strength} : null);
    const button = host.querySelector(".spot-card-button");
    if (button) {
      button.classList.toggle("is-saved", Boolean(record));
      button.title = record ? "Edit spot foiling (saved)" : "Spot foiling";
      button.setAttribute("aria-label", `${record ? "Edit" : "Add"} spot foiling for ${info.name}`);
    }
  }
  function publish(target, record) {
    versions.set(keyFor(target), (versions.get(keyFor(target)) || 0) + 1);
    cache.set(keyFor(target), record);
    document.querySelectorAll(hostSelector).forEach(host => {
      const info = describe(host);
      if (info && keyFor(info.target) === keyFor(target)) applyRecord(host, record);
    });
  }
  async function lookup() {
    lookupTimer = null;
    const targets = [...waiting.values()]; waiting.clear();
    for (let start = 0; start < targets.length; start += 200) {
      const batch = targets.slice(start, start + 200);
      const before = new Map(batch.map(target => [keyFor(target), versions.get(keyFor(target))]));
      try {
        const result = await api(apiUrl(dialog.dataset.lookupUrl), {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({targets: batch})});
        scopeToken = result.image_scope.token;
        result.records.forEach(item => {
          if (before.get(keyFor(item.target)) === versions.get(keyFor(item.target))) publish(item.target, item.record);
        });
      } catch (error) {
        // Opening an editor retries through a fresh GET; a failed lookup never writes defaults.
        console.warn("Spot foiling:", error.message);
      }
    }
  }
  function enhanceHost(host) {
    const info = describe(host);
    if (!info) return;
    let button = host.querySelector(".spot-card-button");
    if (!button) {
      button = document.createElement("button"); button.type = "button";
      button.className = "spot-card-button"; button.innerHTML = icon;
      let actions = host.querySelector(".alternate-image-price-row, .custom-draft-current-card-title-row, .spot-card-inline-actions");
      if (!actions) {
        actions = document.createElement("div"); actions.className = "spot-card-inline-actions";
        (host.querySelector(".campaign-test-draft-picked-main") || host).appendChild(actions);
      }
      const price = actions.querySelector("[data-card-prices], .chaos-pack-view-price");
      if (price?.parentElement === actions) price.before(button); else actions.appendChild(button);
    }
    // Grid and stack views clone card DOM, including buttons but not listeners.
    if (!boundButtons.has(button)) {
      boundButtons.add(button);
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const owner = button.closest(hostSelector); if (owner) openEditor(owner, button);
      });
    }
    const key = keyFor(info.target);
    applyRecord(host, cache.get(key) || null);
    if (!cache.has(key)) {
      waiting.set(key, info.target);
      if (!lookupTimer) lookupTimer = setTimeout(lookup, 30);
    }
  }
  function enhance(root = document) {
    if (root.closest?.("#cardSpotFoilDialog")) return;
    if (root.matches?.(hostSelector)) enhanceHost(root);
    root.querySelectorAll?.(hostSelector).forEach(enhanceHost);
  }
  function message(text, error = false) {status.textContent = text; status.dataset.error = String(error);}
  function controls() {
    syncPreviewInteraction();
    dialog.querySelectorAll("[data-spot-edit-controls]").forEach(el => {el.disabled = !ready || busy;});
    save.disabled = !ready || busy || (!hasInk && !maskReviewed && !current?.record && !removal);
    dialog.querySelector("[data-spot-undo]").disabled = !ready || busy || historyIndex <= 0;
    dialog.querySelector("[data-spot-pocket-undo]").disabled = !ready || busy || historyIndex <= 0;
    dialog.querySelector("[data-spot-redo]").disabled = !ready || busy || historyIndex >= history.length - 1;
    dialog.querySelector("[data-spot-remove]").disabled = !ready || busy || !current?.record;
    dialog.querySelectorAll("[data-spot-close]").forEach(button => {button.disabled = busy;});
  }
  function coverage() {
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    let selected = 0;
    for (let i = 3; i < pixels.length; i += 4) selected += pixels[i] > 0;
    hasInk = selected > 0;
    return Math.round(selected / (mask.width * mask.height) * 100);
  }
  function markChanged() {
    message(removal ? "Removal pending · save to restore the regular card finish." : `Unsaved changes · ${coverage()}% of the card selected`);
    controls();
  }
  function renderMask() {
    renderFrame = null;
    dialog.querySelector("[data-spot-show-text]").textContent = showingText ? "Hide text regions" : "Show text regions";
    dialog.querySelector("[data-spot-preview-help]").textContent = showingText
      ? "Cyan marks detected text, for review. It does not show the foil selection."
      : view === "mask" ? "Pink marks where foil will show. Unmarked areas stay opaque. Fainter pink means a smaller foil amount."
      : view === "original" ? "Original artwork, with the foil preview hidden. Your foil selection is unchanged."
      : "Foil appears only inside your selected areas. The rest stays opaque.";
    maskUrl = mask.toDataURL("image/png");
    overlay.clearRect(0, 0, canvas.width, canvas.height);
    overlay.drawImage(mask, 0, 0);
    overlay.globalCompositeOperation = "source-in"; overlay.fillStyle = "#ec36c3";
    overlay.fillRect(0, 0, canvas.width, canvas.height); overlay.globalCompositeOperation = "source-over";
    if (showingText) {
      overlay.clearRect(0, 0, canvas.width, canvas.height);
      overlay.drawImage(window.DeckadenceSpotSelection.textRegions(image, generationOptions(), mask.width, mask.height), 0, 0);
      overlay.globalCompositeOperation = "source-in"; overlay.fillStyle = "#24c9e5";
      overlay.fillRect(0, 0, canvas.width, canvas.height); overlay.globalCompositeOperation = "source-over";
    }
    effects.setSpotFoil(stage, {maskUrl, finish: fields.finish.value, strength: Number(fields.strength.value)});
  }
  function scheduleRender() {if (!renderFrame) renderFrame = requestAnimationFrame(renderMask);}
  function commitMask() {
    maskReviewed = true;
    renderMask();
    if (history[historyIndex] !== maskUrl) {
      history = history.slice(0, historyIndex + 1); history.push(maskUrl);
      if (history.length > 40) history.shift();
      historyIndex = history.length - 1;
    }
    removal = false; markChanged();
  }
  function sizeMask(width) {
    const height = Math.round(width * 1056 / 756);
    for (const surface of [mask, canvas, strokeMask, strokeBase]) {
      surface.width = width; surface.height = height;
    }
    dialog.querySelector("[data-spot-resolution]").textContent =
      `Mask detail: ${width} × ${height} pixels · uses the source artwork, up to 3024 × 4224.`;
  }
  async function loadMask(source) {
    const token = session;
    const img = new Image(); img.src = source;
    await img.decode();
    if (token !== session) return false;
    // Keep saved high-resolution strokes even if the artwork is later replaced
    // with a smaller image. Undo entries share the current canvas dimensions.
    if (img.naturalWidth > mask.width) sizeMask(Math.min(3024, img.naturalWidth));
    if (img.naturalWidth < mask.width) {
      dialog.querySelector("[data-spot-resolution]").textContent =
        `Saved mask: ${img.naturalWidth} × ${img.naturalHeight}. Apply again to regenerate at ${mask.width} × ${mask.height}; this replaces previous touch-ups. Undo is available before saving.`;
    }
    ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(img, 0, 0, mask.width, mask.height);
    return true;
  }
  async function travelHistory(direction) {
    if (!ready || busy || historyIndex + direction < 0 || historyIndex + direction >= history.length) return;
    ready = false; controls();
    const token = session;
    try {
      if (await loadMask(history[historyIndex + direction])) {
        historyIndex += direction; removal = false; renderMask(); ready = true; markChanged();
        dialog.querySelector("[data-spot-pocket-result]").textContent = "History restored. The preview shows the current mask; Save keeps this version.";
      }
    } catch (error) {if (token === session) {ready = true; message(error.message, true); controls();}}
  }
  function resizePreview() {
    if (!dialog.open) return;
    const fit = Math.max(80, Math.min(viewport.clientWidth - 48, (viewport.clientHeight - 48) * mask.width / mask.height));
    stage.style.width = fit * Number(fields.zoom.value) / 100 + "px";
    dialog.querySelector("[data-spot-zoom-value]").value = fields.zoom.value + "%";
    cursor.hidden = true;
    syncPreviewInteraction();
  }
  function syncPreviewInteraction() {
    const enabled = ready && !busy && tool === "pan" && view === "effect" && !activeStroke;
    stage.dataset.tilt = String(enabled);
    effects.setInteractive(stage, enabled);
  }
  function setTool(value) {
    tool = value; stage.dataset.tool = tool; cursor.hidden = true;
    syncPreviewInteraction();
    if (value !== "pan") dialog.querySelector("[data-spot-touch-up]").open = true;
    dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotTool === tool)));
  }
  function setView(value) {
    view = value; stage.dataset.view = view;
    syncPreviewInteraction();
    dialog.querySelectorAll("[data-spot-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotView === view)));
  }
  function setOptions(select, values, labels) {select.replaceChildren(...values.map(value => new Option(labels[value], value)));}
  function readWorkflow() {
    if (!metadata) return;
    workflowOptions = {...workflowOptions, layer_type: fields.layer_type.value,
      output_format: fields.output_format.value, spot_name: fields.spot_name.value};
    drafts[workflowId] = clone(workflowOptions);
  }
  function showWorkflow(id) {
    workflowId = id;
    const preset = metadata.workflows.find(item => item.id === id);
    workflowOptions = clone(drafts[id] || metadata.preferences.profiles[id]);
    fields.workflow_id.value = id;
    setOptions(fields.layer_type, preset.layer_types, metadata.layer_types);
    setOptions(fields.output_format, preset.output_formats, metadata.output_formats);
    fields.layer_type.value = workflowOptions.layer_type; fields.output_format.value = workflowOptions.output_format;
    fields.spot_name.value = workflowOptions.spot_name;
    fields.layer_type.disabled = preset.layer_types.length === 1;
    updateWorkflowHint();
  }
  function updateWorkflowHint() {
    dialog.querySelector("[data-spot-channel]").hidden = fields.output_format.value !== "spot_pdf";
    fields.spot_name.disabled = fields.output_format.value !== "spot_pdf";
    dialog.querySelector("[data-spot-workflow-hint]").textContent = fields.layer_type.value === "white_underbase"
      ? "Your selected areas reveal foil. The PDF white-ink separation covers the remaining area."
      : "Your painted areas receive the foil or coating in this workflow.";
  }
  async function openEditor(host, trigger) {
    if (dialog.open) return;
    const info = describe(host);
    if (!info) return;
    const token = ++session;
    current = {...info, trigger, record: null}; ready = false; busy = false; removal = false; activeStroke = null;
    metadata = null; drafts = {}; history = []; historyIndex = -1; hasInk = false; maskReviewed = false; textRegions = []; showingText = false;
    ctx.clearRect(0, 0, mask.width, mask.height); overlay.clearRect(0, 0, canvas.width, canvas.height);
    fields.finish.value = "foil"; fields.strength.value = "100"; fields.zoom.value = "100"; fields.mask_file.value = "";
    dialog.querySelector("[data-spot-strength-value]").value = "100%";
    dialog.querySelector("[data-spot-card-name]").textContent = `${info.name} · ${info.target.face} face`;
    dialog.querySelector("[data-spot-scope]").textContent = "Loading image-library scope…";
    image.removeAttribute("src"); image.alt = info.name;
    dialog.querySelector("[data-spot-touch-up]").open = false;
    setTool("pan"); setView("effect"); controls(); message("Loading card and saved spot foiling…");
    dialog.showModal(); renderMask(); resizePreview();
    try {
      const [payload, response] = await Promise.all([api(apiUrl(endpoint(info.target))), fetch(info.src, {cache: "no-store"})]);
      if (!response.ok) throw new Error("The card artwork could not be loaded.");
      const blob = await response.blob();
      let hash = 2166136261;
      for (const byte of new Uint8Array(await blob.arrayBuffer())) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      if (token !== session) return;
      current.signature = hash.toString(16).padStart(8, "0");
      current.record = payload.record; current.scope = payload.image_scope.token; scopeToken = current.scope;
      metadata = payload; artworkUrl = URL.createObjectURL(blob); image.src = artworkUrl; await image.decode();
      if (token !== session) return;
      sizeMask(Math.max(756, Math.min(3024, Math.round(Math.min(image.naturalWidth, image.naturalHeight * 756 / 1056)))));
      const record = current.record;
      const id = record?.workflow_id || payload.preferences.active_workflow;
      if (record) {
        drafts[id] = clone(record.workflow_options); fields.finish.value = record.finish; fields.strength.value = String(record.strength);
        if (!(await loadMask(record.mask_url))) return;
      }
      setOptions(fields.workflow_id, payload.workflows.map(item => item.id), Object.fromEntries(payload.workflows.map(item => [item.id, item.label])));
      showWorkflow(id); ready = true; coverage(); renderMask(); history = [maskUrl]; historyIndex = 0; controls();
      const generation = record?.generation || {};
      fields.selection_mode.value = generation.mode || (["artwork","highlights","colors","details","shadows"].includes(workflowOptions.selection) ? workflowOptions.selection : "highlights");
      fields.cleanup.value = generation.cleanup || workflowOptions.selection_cleanup || "balanced";
      const pocketSize = generation.pocket_size || 64;
      fields.pocket_size.value = Array.from(fields.pocket_size.options).some(option => option.value === String(pocketSize)) ? String(pocketSize) : "custom";
      fields.pocket_size_custom.value = pocketSize;
      updatePocketSize();
      fields.pocket_target.value = generation.pocket_target || "both";
      dialog.querySelector("[data-spot-pocket-result]").textContent = "Preview the result, then Save for this card. Undo restores the previous mask.";
      fields.generation_action.value = generation.action || workflowOptions.generation_action || "foil";
      fields.selection_region.value = generation.region || (workflowOptions.protect_text || workflowOptions.protect_frame ? "artwork" : "full");
      fields.selection_amount.value = generation.amount || workflowOptions.selection_amount || 35; updateGenerationHint();
      fields.coverage.value = generation.coverage || workflowOptions.foil_coverage_percent || 100;
      fields.text_mode.value = generation.text_mode || workflowOptions.text_treatment || "original"; fields.text_source.value = generation.text_source || "standard";
      fields.text_detail.value = generation.text_detail || "letters"; textRegions = generation.text_regions || [];
      if(record?.artwork_signature && record.artwork_signature!==current.signature)textRegions=[];
      fields.border_mode.value = generation.border_mode || workflowOptions.border_treatment || "original"; fields.border_width.value = generation.border_width ?? workflowOptions.border_width_percent ?? 2;
      updateRegionControls();
      dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%";
      dialog.querySelector("[data-spot-scope]").textContent = payload.image_scope.is_isolated
        ? "Isolation is ON. Changes stay in this collection’s separate image library."
        : "Isolation is OFF. Saved spot foiling applies to this card printing across decks and sets using the shared image library.";
      message(record?.artwork_signature && record.artwork_signature !== current.signature
        ? "Artwork has changed. Check alignment and adjust the saved mask before saving."
        : record ? "Saved selection loaded. Apply another mode or open Touch up to refine it." : "Choose a selection mode and click Apply spot foiling.");
      fields.selection_mode.focus({preventScroll:true});
    } catch (error) {
      if (token === session) {
        ready = false;
        dialog.querySelector("[data-spot-scope]").textContent = "Card settings could not be loaded. Close this window and reopen the card to retry.";
        message(error.message, true); controls();
      }
    }
  }
  function closeEditor() {
    if (busy) return;
    dialog.close();
  }
  dialog.addEventListener("close", () => {
    ++session; ready = false; activeStroke = null;
    if (renderFrame) cancelAnimationFrame(renderFrame); renderFrame = null;
    if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = "";
    image.removeAttribute("src"); history = []; current?.trigger.focus(); current = null;
  });
  dialog.addEventListener("cancel", event => {if (busy) event.preventDefault();});
  dialog.querySelectorAll("[data-spot-close]").forEach(button => button.addEventListener("click", closeEditor));
  dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.spotTool)));
  dialog.querySelectorAll("[data-spot-view]").forEach(button => button.addEventListener("click", () => {showingText=false;setView(button.dataset.spotView);if(ready)renderMask();}));
  dialog.querySelector("[data-spot-touch-up]").addEventListener("toggle", event => {
    if (event.target.open && tool === "pan") setTool("paint");
    if (!event.target.open) setTool("pan");
  });
  function pocketSize() {
    return Number(fields.pocket_size.value === "custom" ? fields.pocket_size_custom.value : fields.pocket_size.value);
  }
  function updatePocketSize() {
    const custom = fields.pocket_size.value === "custom";
    dialog.querySelector("[data-spot-pocket-custom]").hidden = !custom;
    fields.pocket_size_custom.disabled = !custom;
    if (!custom) fields.pocket_size_custom.value = fields.pocket_size.value;
  }
  fields.pocket_size.addEventListener("change", updatePocketSize);
  function generationOptions() {
    return {mode: fields.selection_mode.value, cleanup: fields.cleanup.value, pocket_size: pocketSize(), pocket_target: fields.pocket_target.value, action: fields.generation_action.value, region: fields.selection_region.value, amount: Number(fields.selection_amount.value),
      coverage:Number(fields.coverage.value), text_mode:fields.text_mode.value, text_source:fields.text_source.value,
      text_detail:fields.text_detail.value, text_regions:textRegions, border_mode:fields.border_mode.value, border_width:Number(fields.border_width.value)};
  }
  function updateRegionControls() {
    dialog.querySelector("[data-spot-coverage-value]").value = fields.coverage.value + "%";
    dialog.querySelector("[data-spot-border-value]").value = fields.border_width.value + "%";
    dialog.querySelector("[data-spot-tolerance-value]").value = fields.tolerance.value;
    dialog.querySelector("[data-spot-show-text]").textContent=showingText?"Hide text regions":"Show text regions";
    dialog.querySelector("[data-spot-detector-status]").textContent = textRegions.length
      ? `${textRegions.length} detected text regions. Check lettering and surrounding artwork before applying.`
      : metadata?.text_detector_ready ? "Local AI detector ready. Detect text to find lettering throughout this card."
      : "Install AI Text Detection beside Spot Foiling in Plugin Manager for full-art layouts. The other selection and painting tools work without it.";
    if (showingText) scheduleRender();
  }
  for (const name of ["coverage","border_width","tolerance","text_mode","text_source","text_detail","border_mode"]) fields[name].addEventListener("input",updateRegionControls);
  async function detectText() {
    const token=session; ready=false; controls(); message("Detecting text locally with AI…");
    try {
      const source=document.createElement("canvas"); source.width=756;source.height=1056;
      source.getContext("2d").drawImage(image,0,0,source.width,source.height);
      const result=await api(apiUrl(endpoint(current.target)+"/detect-text"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/png").split(",")[1]})});
      if(token!==session)return false;
      textRegions=result.regions;fields.text_source.value="detected";updateRegionControls();
      message(textRegions.length ? "Text regions detected. Review Show text regions, then Apply." : "No text detected. Use standard regions or select lettering with Magic Wand / Match Color.");
      return textRegions.length>0;
    } catch(error){if(token===session)message(error.message,true);return false;}
    finally{if(token===session){ready=true;controls();}}
  }
  dialog.querySelector("[data-spot-detect]").addEventListener("click",()=>{if(ready&&!busy)detectText();});
  dialog.querySelector("[data-spot-show-text]").addEventListener("click",()=>{
    showingText=!showingText;setView(showingText?"mask":"effect");renderMask();
    dialog.querySelector("[data-spot-show-text]").textContent=showingText?"Hide text regions":"Show text regions";
  });
  function updateGenerationHint() {
    const labels = {highlights: "brightest areas", colors: "strongest colors", details: "strongest edges and textures", shadows: "darkest areas", artwork: "entire chosen region"};
    const opaque = fields.generation_action.value === "opaque", solid = fields.selection_mode.value === "artwork";
    const matching = labels[fields.selection_mode.value];
    dialog.querySelector("[data-spot-generation-hint]").textContent = opaque
      ? `Apply keeps the ${matching} opaque and shows foil in the rest of the chosen region. Text and border settings can override this.`
      : `Apply shows foil in the ${matching}. Other areas stay opaque. Text and border settings can override this.`;
    dialog.querySelector("[data-spot-amount-label]").textContent = opaque ? "How much area to keep opaque" : "How much area to foil";
    dialog.querySelector("[data-spot-amount-help]").textContent = solid
      ? "This mode matches the entire chosen region, so the area slider is not used."
      : `Targets roughly ${fields.selection_amount.value}% of the chosen region, starting with the ${matching}. Increase to include more; decrease for fewer. Click Apply to update. Equal colors and text/border choices can change the final area.`;
    dialog.querySelector("[data-spot-amount-value]").value = fields.selection_amount.value + "%";
    fields.selection_amount.disabled = fields.selection_mode.value === "artwork";
  }
  fields.selection_mode.addEventListener("change", updateGenerationHint);
  fields.generation_action.addEventListener("change", updateGenerationHint);
  fields.selection_amount.addEventListener("input", updateGenerationHint);
  dialog.querySelector("[data-spot-apply]").addEventListener("click", async () => {
    if (!ready || busy) return;
    try {
      if(fields.text_mode.value!=="original" && fields.text_source.value==="detected" && !textRegions.length && !(await detectText()))return;
      if(!dialog.open)return;
      showingText=false;
      const generated = window.DeckadenceSpotSelection.generate(image, generationOptions(), mask.width, mask.height);
      ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(generated, 0, 0);
      dialog.querySelector("[data-spot-resolution]").textContent = `Mask detail: ${mask.width} × ${mask.height} pixels · ${fields.cleanup.selectedOptions[0].textContent}.`;
      commitMask();
      message(hasInk ? `Automatic selection applied · ${coverage()}% of the card shows foil. Review, touch up if needed, then save.` : "No foil areas remain. Save to keep the card fully opaque, or change the selection and Apply again.");
    } catch (error) {message(error.message || "The automatic selection could not be generated.", true);}
  });
  fields.brush_size.addEventListener("input", () => {dialog.querySelector("[data-spot-brush-value]").value = fields.brush_size.value + " px";});
  fields.zoom.addEventListener("input", resizePreview);
  for (const [selector, amount] of [["[data-spot-zoom-in]", 25], ["[data-spot-zoom-out]", -25]]) {
    dialog.querySelector(selector).addEventListener("click", () => {fields.zoom.value = Math.max(50, Math.min(400, Number(fields.zoom.value) + amount)); resizePreview();});
  }
  dialog.querySelector("[data-spot-fit]").addEventListener("click", () => {fields.zoom.value = "100"; resizePreview(); viewport.scrollTo(0, 0);});
  new ResizeObserver(resizePreview).observe(viewport);
  dialog.querySelector("[data-spot-undo]").addEventListener("click", () => travelHistory(-1));
  dialog.querySelector("[data-spot-pocket-undo]").addEventListener("click", () => travelHistory(-1));
  dialog.querySelector("[data-spot-clean-pockets]").addEventListener("click", async () => {
    if (!ready || busy) return;
    if (!fields.pocket_size_custom.reportValidity()) return;
    const maximum = pocketSize();
    const token = session;
    busy = true; controls(); message("Finding small pockets…");
    // Let the busy state paint before processing a high-resolution mask.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      if (token !== session || !dialog.open) return;
      const result = window.DeckadenceSpotSelection.cleanPockets(mask, maximum, fields.pocket_target.value);
      if (result.changed) {
        showingText = false;
        ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(result.canvas, 0, 0);
        commitMask();
      }
      const summary = result.changed
        ? `Removed ${result.removed.toLocaleString()} foil dots and filled ${result.filled.toLocaleString()} clear holes. ${result.changed.toLocaleString()} pixels changed. Undo is available; Save keeps this result.`
        : "No enclosed pockets at or below this size were found. Try a larger size if small dots remain.";
      dialog.querySelector("[data-spot-pocket-result]").textContent = summary;
      message(summary);
    } catch (error) {message(error.message || "Pocket cleanup could not be applied.", true);}
    finally {if (token === session) {busy = false; controls();}}
  });
  dialog.querySelector("[data-spot-redo]").addEventListener("click", () => travelHistory(1));
  function selectArea(mode) {
    ctx.clearRect(0, 0, mask.width, mask.height); ctx.fillStyle = "white"; ctx.save(); ctx.globalAlpha=Number(fields.coverage.value)/100;
    if (mode === "all") ctx.fillRect(0, 0, mask.width, mask.height);
    if (mode === "art") ctx.fillRect(mask.width * .08, mask.height * .13, mask.width * .84, mask.height * .43);
    ctx.restore(); showingText=false;
    commitMask();
  }
  dialog.querySelector("[data-spot-select-art]").addEventListener("click", () => selectArea("art"));
  dialog.querySelector("[data-spot-select-all]").addEventListener("click", () => selectArea("all"));
  dialog.querySelector("[data-spot-clear]").addEventListener("click", () => selectArea("none"));
  dialog.querySelector("[data-spot-remove]").addEventListener("click", () => {
    selectArea("none"); removal = true; markChanged();
  });
  for (const field of [fields.finish, fields.strength]) field.addEventListener("input", () => {
    dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%"; scheduleRender(); markChanged();
  });
  fields.workflow_id.addEventListener("change", () => {readWorkflow(); showWorkflow(fields.workflow_id.value); markChanged();});
  for (const field of [fields.layer_type, fields.output_format, fields.spot_name]) field.addEventListener("input", () => {readWorkflow(); updateWorkflowHint(); markChanged();});

  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {x: (event.clientX - box.left) * mask.width / box.width, y: (event.clientY - box.top) * mask.height / box.height};
  }
  function draw(from, to) {
    const sc=strokeContext;sc.strokeStyle=sc.fillStyle="white";sc.lineCap=sc.lineJoin="round";
    sc.lineWidth=Number(fields.brush_size.value)*mask.width/756;sc.beginPath();sc.moveTo(from.x,from.y);sc.lineTo(to.x,to.y);sc.stroke();
    sc.beginPath();sc.arc(to.x,to.y,sc.lineWidth/2,0,Math.PI*2);sc.fill();
    ctx.clearRect(0,0,mask.width,mask.height);ctx.drawImage(strokeBase,0,0);
    applyToolMask(strokeMask,tool==="erase");scheduleRender();
  }
  function applyToolMask(selection, erase) {
    ctx.save();ctx.globalCompositeOperation=erase?"destination-out":"source-over";
    ctx.globalAlpha=Number(fields.coverage.value)/100;ctx.drawImage(selection,0,0);ctx.restore();
  }
  canvas.addEventListener("pointerdown", event => {
    if (!ready || busy || activeStroke || event.button !== 0) return;
    showingText=false;
    if(tool==="wand"||tool==="match") {
      event.preventDefault();const p=point(event);
      const selection=window.DeckadenceSpotSelection.colorSelection(image,p.x,p.y,Number(fields.tolerance.value),tool==="wand",mask.width,mask.height);
      applyToolMask(selection,fields.selection_action.value==="erase");commitMask();return;
    }
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    strokeContext.clearRect(0,0,mask.width,mask.height);baseContext.clearRect(0,0,mask.width,mask.height);baseContext.drawImage(mask,0,0);
    activeStroke = {id: event.pointerId, last: point(event), x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pan: tool === "pan"};
    syncPreviewInteraction();
    if (!activeStroke.pan) draw(activeStroke.last, activeStroke.last);
  });
  canvas.addEventListener("pointermove", event => {
    const p = point(event), box = canvas.getBoundingClientRect();
    cursor.hidden = !["paint","erase"].includes(tool) || !ready;
    cursor.style.width = cursor.style.height = Number(fields.brush_size.value) * box.width / 756 + "px";
    cursor.style.left = p.x / mask.width * 100 + "%"; cursor.style.top = p.y / mask.height * 100 + "%";
    if (!activeStroke || activeStroke.id !== event.pointerId) return;
    if (activeStroke.pan) {viewport.scrollLeft = activeStroke.left - event.clientX + activeStroke.x; viewport.scrollTop = activeStroke.top - event.clientY + activeStroke.y;}
    else {draw(activeStroke.last, p); activeStroke.last = p;}
  });
  function endStroke(event) {
    if (!activeStroke || activeStroke.id !== event.pointerId) return;
    const painted = !activeStroke.pan; activeStroke = null;
    syncPreviewInteraction();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (painted) commitMask();
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, endStroke);
  canvas.addEventListener("pointerleave", () => {cursor.hidden = true;});
  dialog.addEventListener("keydown", event => {
    if (!ready || busy || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1);}
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {event.preventDefault(); travelHistory(1);}
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const tools = {b: "paint", e: "erase", h: "pan", w:"wand", c:"match"}; if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
    }
  });
  fields.mask_file.addEventListener("change", async () => {
    const file = fields.mask_file.files[0]; if (!file) return;
    const token = session; let url;
    ready = false; controls();
    try {
      if (file.size > 10_000_000 || file.type !== "image/png") throw new Error("Choose a PNG mask smaller than 10 MB.");
      url = URL.createObjectURL(file); const imported = new Image(); imported.src = url; await imported.decode();
      if (token !== session) return;
      if (imported.width * imported.height > 24_000_000) throw new Error("Use a mask of 24 megapixels or less.");
      const scratch = document.createElement("canvas"); scratch.width = mask.width; scratch.height = mask.height;
      const sc = scratch.getContext("2d"); sc.drawImage(imported, 0, 0, mask.width, mask.height);
      const pixels = sc.getImageData(0, 0, mask.width, mask.height);
      let alpha = false; for (let i = 3; i < pixels.data.length; i += 4) {if (pixels.data[i] < 255) {alpha = true; break;}}
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = alpha ? pixels.data[i + 3] : Math.round(.2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2]);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255; pixels.data[i + 3] = value;
      }
      ctx.putImageData(pixels, 0, 0); ready = true; commitMask();
    } catch (error) {if (token === session) {ready = true; message(error.message, true); controls();}}
    finally {if (url) URL.revokeObjectURL(url); fields.mask_file.value = "";}
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!ready || busy || save.disabled) return;
    readWorkflow(); busy = true; controls(); message("Saving this card’s spot foiling…");
    const target = current.target;
    try {
      const body = removal ? {revision: current.record?.revision || null} : {
        workflow_id: workflowId, workflow_options: workflowOptions, finish: fields.finish.value,
        strength: Number(fields.strength.value), artwork_signature: current.signature,
        generation: generationOptions(),
        mask_data: mask.toDataURL("image/png"), revision: current.record?.revision || null,
      };
      const result = await api(apiUrl(endpoint(target), true), {method: removal ? "DELETE" : "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      publish(target, result.record); channel?.postMessage({scope: current.scope, target});
      document.dispatchEvent(new CustomEvent("deckadence:spot-foil-saved", {detail: {target, scope: current.scope}}));
      busy = false; dialog.close();
    } catch (error) {busy = false; message(error.message, true); controls();}
  });
  channel?.addEventListener("message", event => {
    if (event.data?.scope !== scopeToken || !event.data?.target) return;
    cache.delete(keyFor(event.data.target)); enhance();
  });
  document.addEventListener("imomir:card-image-refreshed", event => {
    if (dialog.open && event.detail?.cardUuid === current?.target.card_uuid && event.detail.imageChanged) {
      ready = false; controls(); message("The artwork changed while editing. Close and reopen Spot Foiling to realign the mask.", true);
    }
  });
  function start() {
    enhance();
    new MutationObserver(records => {
      const changed = new Set();
      for (const record of records) {
        const owner = record.target.closest?.(hostSelector); if (owner) changed.add(owner);
        if (record.type === "attributes") {
          continue;
        } else for (const node of record.addedNodes) if (node.nodeType === 1) enhance(node);
      }
      changed.forEach(enhanceHost);
    }).observe(document.body, {childList: true, subtree: true, attributes: true,
      attributeFilter: ["src", "data-card-uuid", "data-card-image-src", "data-card-flip-face"]});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true}); else start();
})();
