// Card-specific selection, using the same shared/isolated library as alternate images.
(() => {
  "use strict";
  const dialog = document.getElementById("cardSpotFoilDialog");
  if (!dialog || !window.DeckadenceCardEffects) return;
  const effects = window.DeckadenceCardEffects;
  const form = dialog.querySelector("form"), fields = form.elements;
  const steps = [...dialog.querySelectorAll("[data-spot-step]")];
  const stage = dialog.querySelector("[data-spot-stage]");
  const viewport = dialog.querySelector("[data-spot-viewport]");
  const image = dialog.querySelector("[data-spot-image]");
  const canvas = dialog.querySelector("[data-spot-canvas]");
  const cursor = dialog.querySelector("[data-spot-cursor]");
  const mask = document.createElement("canvas");
  mask.width = canvas.width; mask.height = canvas.height;
  const ctx = mask.getContext("2d", {willReadFrequently: true});
  const overlay = canvas.getContext("2d");
  const otherOverlay = dialog.querySelector("[data-spot-other-overlay]");
  const otherOverlays=[otherOverlay,...Array.from({length:2},()=>{const el=otherOverlay.cloneNode();el.removeAttribute("data-spot-other-overlay");otherOverlay.after(el);return el;})];
  const layerNames={effect1:"Effect 1",effect2:"Effect 2",mask:"Foil Mask",gloss:"Gloss"};
  const layerOrder={mask:5,effect1:6,effect2:7,gloss:8};
  const printedLayer=()=>editingLayer.startsWith("effect");
  const effectPreviews=new Map();
  const effectColors={stars:"#FFF4C3",halftone:"#121930",neon:"#46F5FF"};
  let previousEffectFinish="";
  function updateEffectColor(resetDefault=false) {
    if(resetDefault && fields.effect_color.value.toUpperCase()===(effectColors[previousEffectFinish]||"#FFE7A0"))fields.effect_color.value=effectColors[fields.finish.value]||"#FFE7A0";
    previousEffectFinish=fields.finish.value;
    dialog.querySelector("[data-spot-effect-color-controls]").hidden=!printedLayer()||!effectColors[fields.finish.value];
    dialog.querySelector("[data-spot-effect-color-label]").textContent={stars:"Star color",halftone:"Dot color",neon:"Glow color"}[fields.finish.value]||"Effect color";
    dialog.querySelector("[data-spot-effect-color]").textContent=fields.effect_color.value.toUpperCase();
    dialog.querySelector("[data-spot-fracture-controls]").hidden=!printedLayer()||fields.finish.value!=="fracture";
    dialog.querySelector("[data-spot-translucence-value]").value=fields.effect_translucence.value+"%";
  }
  const liveMask = document.createElement("canvas");
  const liveContext = liveMask.getContext("2d");
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
  let metadata = null, textRegions = [], showingText = false;
  let subjectMasks = new Map(), frameMasks = new Map(), showingFrame = false;
  // Reuse the selection engine while keeping each finish's pixels, controls,
  // and undo history independent. Both drafts share one atomic card save.
  let editingLayer = "mask", layerDrafts = {};
  const layerCopy = [];
  const copyWalker = document.createTreeWalker(dialog.querySelector(".spot-card-controls"), NodeFilter.SHOW_TEXT);
  while(copyWalker.nextNode()) {
    const node=copyWalker.currentNode;
    if(/foil|opaque|mask/iu.test(node.textContent) && !node.parentElement.closest('[data-spot-layer], [data-spot-effect-label], [data-spot-overlay-label]')) layerCopy.push([node,node.textContent]);
  }
  const layerWording = text => printedLayer() ? text
    .replace(/spot foiling/giu,"effect").replace(/Opaque · no foil/gu,"No effect").replace(/Foiled/gu,"Effect").replace(/foiled/gu,"effect")
    .replace(/Foil strength/gu,"Mask strength").replace(/Foil/gu,"Effect").replace(/foil/gu,"effect").replace(/Opaque/gu,"No effect").replace(/opaque/gu,"clear")
    : editingLayer !== "gloss" ? text : text
    .replace(/Spot foiling/gu,"Gloss").replace(/spot foiling/gu,"gloss").replace(/Foiling/gu,"Gloss").replace(/foiling/gu,"gloss")
    .replace(/Opaque · no foil/gu,"No gloss").replace(/Foiled/gu,"Glossy").replace(/foiled/gu,"glossy")
    .replace(/Foil strength/gu,"Gloss amount").replace(/Foil/gu,"Gloss").replace(/foil/gu,"gloss").replace(/Opaque/gu,"No gloss").replace(/opaque/gu,"unglossed")
    .replace(/Mask cleanup/gu,"Gloss cleanup").replace(/Mask only/gu,"Gloss only").replace(/Mask overlay/gu,"Gloss overlay").replace(/Mask covers/gu,"Gloss covers");
  function activeSaved() {return editingLayer!=="mask" ? Boolean(current?.record?.[editingLayer]) : Boolean(current?.record && current.record.foil_enabled!==false);}
  function setLayerLabels() {
    for(const [node,copy] of layerCopy)node.textContent=layerWording(copy);
    dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.spotLayer===editingLayer)));
    fields.finish.replaceChildren(...(printedLayer() ? Object.entries(metadata?.effect_types||{}) : editingLayer==="gloss" ? [["gloss","Gloss"],["polished","Polished gloss"]] : [["foil","Rainbow foil"],["surge","Surge foil"],["chocobo","Chocobo foil"]]).map(([value,label])=>new Option(label,value)));
    dialog.querySelector("[data-spot-effect-label]").textContent=printedLayer() ? "Effect" : editingLayer==="gloss" ? "Gloss effect" : "Foil effect";
    dialog.querySelector("[data-spot-finish-legend]").textContent=printedLayer() ? "Printable effect" : "Preview finish";
    dialog.querySelector("[data-spot-preview-only]").hidden=printedLayer();
    dialog.querySelector("[data-spot-pattern-controls]").hidden=!printedLayer();
    dialog.querySelector("[data-spot-effect-strength-label]").textContent=editingLayer==="gloss" ? "Gloss strength" : "Effect strength";
    dialog.querySelector("[data-spot-overlay-label]").textContent=printedLayer() ? "Effect overlay color" : editingLayer==="gloss" ? "Gloss overlay color" : "Mask overlay color";
    dialog.querySelector('[data-spot-view="effect"]').textContent="Preview";
    stage.dataset.editLayer=editingLayer;
    dialog.querySelector('[data-spot-view="mask"]').textContent=printedLayer() ? "Effect overlay" : editingLayer==="gloss" ? "Gloss overlay" : "Mask overlay";
    dialog.querySelector("[data-spot-remove]").textContent=printedLayer() ? "Remove "+layerNames[editingLayer] : editingLayer==="gloss" ? "Remove gloss" : "Remove spot foiling";
    dialog.querySelector("[data-spot-invert]").title=printedLayer() ? "Swap effect and clear areas." : editingLayer==="gloss" ? "Swap gloss and clear areas." : "Swap foil and opaque areas.";
    canvas.setAttribute("aria-label", `Paint or erase the ${printedLayer()?"effect":editingLayer==="gloss"?"gloss":"foil"} selection. Use the selection buttons as a keyboard alternative.`);
  }
  dialog.querySelector("[data-spot-new-pattern]").addEventListener("click",()=>{
    fields.effect_seed.value=String(crypto.getRandomValues(new Uint32Array(1))[0]%2147483648);markChanged();scheduleRender();
  });
  function captureLayer() {
    const values={};
    for(const field of fields)if(field.name && !["mask_file","zoom"].includes(field.name))values[field.name]=field.type==="checkbox"?field.checked:field.value;
    return {values,generation:generationOptions(),png:mask.toDataURL("image/png"),width:mask.width,
      history:[...history],historyIndex,maskReviewed,removal,enabled:!removal&&(hasInk||maskReviewed||activeSaved()),recentColors:[...recentColors],textRegions};
  }
  function glossDraft(record, base) {
    const values={...base.values,finish:record?.finish||"gloss",strength:record?.strength||100,overlay_color:record?.overlay_color||"#00BFFF",
      text_mode:"original",border_mode:"original",frame_mode:"original",coverage:100};
    if(!record)try {
      const color=localStorage.getItem("deckadence.gloss.overlayColor");
      if(/^#[0-9a-f]{6}$/i.test(color||""))values.overlay_color=color;
      values.mask_only=localStorage.getItem("deckadence.gloss.maskOnly")==="true";
    } catch (_) {}
    const names={mode:"selection_mode",region:"selection_region",amount:"selection_amount",action:"generation_action",selected_color:"selection_color",color_tolerance:"tolerance"};
    for(const [name,value] of Object.entries(record?.generation||{}))if(fields[names[name]||name])values[names[name]||name]=String(value);
    values.frame_layout=({modern:"m15",classic:"retro"})[values.frame_layout] || values.frame_layout || "auto";
    const pocket=record?.generation?.pocket_size||64;
    values.pocket_size=[...fields.pocket_size.options].some(option=>option.value===String(pocket))?String(pocket):"custom";values.pocket_size_custom=pocket;
    return {values,generation:record?.generation||{},png:record?.mask_url||null,width:base.width,history:[],historyIndex:-1,
      maskReviewed:false,removal:false,enabled:Boolean(record),recentColors:record?.generation?.color_swatches||[],textRegions:record?.generation?.text_regions||[]};
  }
  function effectDraft(record,base,layer) {
    const draft=glossDraft(record,base);
    Object.assign(draft.values,{finish:record?.finish||"glitter_1",strength:String(record?.strength||65),
      overlay_color:record?.overlay_color||(layer==="effect1"?"#FF9800":"#76FF03"),
      effect_scale:String(record?.scale||100),effect_density:String(record?.density||100),
      effect_color:record?.color||effectColors[record?.finish]||"#FFE7A0",
      effect_translucence:String(record?.translucence||0),
      effect_seed:String(record?.seed??(layer==="effect1"?73:197))});
    draft.previewUrl=record?.overlay_url;draft.savedPng=draft.png;
    if(!record)draft.values.selection_mode="none";
    return draft;
  }
  function effectParams(values) {
    return {finish:values.finish,strength:Number(values.strength),scale:Number(values.effect_scale),density:Number(values.effect_density),seed:Number(values.effect_seed),color:values.effect_color||effectColors[values.finish]||"#FFE7A0",translucence:Number(values.effect_translucence||0)};
  }
  function showPrintedPreviews() {effects.setPrintedEffects(stage,["effect1","effect2"].map(layer=>{const item=effectPreviews.get(layer);return item?.url?{url:item.url,translucence:item.translucence}:null;}));}
  function clearPrintedPreviews() {
    for(const item of effectPreviews.values()){clearTimeout(item.timer);item.controller?.abort();if(item.url?.startsWith("blob:"))URL.revokeObjectURL(item.url);}
    effectPreviews.clear();effects.setPrintedEffects(stage,[]);
  }
  function queuePrintedPreview(layer,draft) {
    const previous=effectPreviews.get(layer);
    if(!draft?.enabled||!draft.png) {
      clearTimeout(previous?.timer);previous?.controller?.abort();
      if(previous?.url?.startsWith("blob:"))URL.revokeObjectURL(previous.url);
      effectPreviews.delete(layer);showPrintedPreviews();return;
    }
    const params=effectParams(draft.values),{translucence,...textureParams}=params,key=JSON.stringify(textureParams)+draft.png;
    const blend=params.finish==="fracture"?translucence:0;
    if(previous?.key===key){previous.translucence=blend;showPrintedPreviews();return;}
    clearTimeout(previous?.timer);previous?.controller?.abort();
    const item={key,url:previous?.url||null,translucence:blend,controller:new AbortController()};effectPreviews.set(layer,item);
    if(draft.previewUrl&&draft.png===draft.savedPng) {item.url=draft.previewUrl;showPrintedPreviews();return;}
    const token=session;
    item.timer=setTimeout(async()=>{
      try {
        const source=new Image();source.src=draft.png;await source.decode();
        if(token!==session||effectPreviews.get(layer)!==item)return;
        const small=document.createElement("canvas");small.width=756;small.height=1056;small.getContext("2d").drawImage(source,0,0,756,1056);
        const response=await fetch(apiUrl(endpoint(current.target)+"/effect-preview"),{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({effect:params,mask_data:small.toDataURL("image/png")}),signal:item.controller.signal});
        if(!response.ok)throw new Error((await response.json()).message||"Effect preview failed.");
        const blob=await response.blob();
        if(token!==session||effectPreviews.get(layer)!==item)return;
        if(item.url?.startsWith("blob:"))URL.revokeObjectURL(item.url);
        item.url=URL.createObjectURL(blob);showPrintedPreviews();
      }catch(error){if(error.name!=="AbortError"&&token===session&&effectPreviews.get(layer)===item){effectPreviews.delete(layer);message(error.message,true);}}
    },180);
  }
  async function switchLayer(layer) {
    if(layer===editingLayer || !ready || busy || activeStroke)return;
    const token=session;layerDrafts[editingLayer]=captureLayer();const draft=layerDrafts[layer];
    ready=false;controls();
    try {
      let saved=null;if(draft.png){saved=new Image();saved.src=draft.png;await saved.decode();}
      if(token!==session || current?.artworkChanged)return;
      editingLayer=layer;setLayerLabels();
      for(const [name,value] of Object.entries(draft.values))if(fields[name]){if(fields[name].type==="checkbox")fields[name].checked=value;else fields[name].value=value;}
      updateEffectColor();
      sizeMask(Math.max(draft.width,saved?.naturalWidth||0));ctx.clearRect(0,0,mask.width,mask.height);if(saved)ctx.drawImage(saved,0,0,mask.width,mask.height);
      textRegions=draft.textRegions;recentColors=draft.recentColors;removal=draft.removal;maskReviewed=draft.maskReviewed;
      showingText=false;showingFrame=false;history=[...draft.history];historyIndex=draft.historyIndex;
      ready=true;updatePocketSize();updateBrushControls();updateEdgeControls();updateExclusionControls();updateRegionControls();updateFrameControls();chooseColor(fields.selection_color.value);
      dialog.querySelector("[data-spot-strength-value]").value=fields.strength.value+"%";
      coverage();renderMask();if(!history.length){history=[maskUrl];historyIndex=0;}controls();
      message(removal ? "Removal pending. Save to apply." : "Editing "+layerNames[layer]+".");
    }catch(error){if(token===session)message("Could not load this layer. "+error.message,true);}
    finally{if(token===session){ready=true;controls();}}
  }
  dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.addEventListener("click",()=>switchLayer(button.dataset.spotLayer)));
  let artworkColors = [], recentColors = [], maskArea = "0";
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
    let response;
    try {response = await fetch(url, options);}
    catch (_) {
      const error = new Error("Could not connect to Deckadence. Check that it is running, then try again.");
      error.retryable = true; throw error;
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const error = new Error(payload?.message || (response.ok
        ? "The server returned an unreadable response. Try again."
        : `The server could not complete the request (${response.status}). Try again.`));
      error.retryable = response.ok || response.status >= 500;
      throw error;
    }
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
    if (surface) {
      effects.setSpotFoil(surface, record && record.foil_enabled!==false ? {maskUrl: record.mask_url, finish: record.finish, strength: record.strength} : null);
      effects.setGloss(surface, record?.gloss ? {maskUrl:record.gloss.mask_url,finish:record.gloss.finish,strength:record.gloss.strength} : null);
      effects.setPrintedEffects(surface,["effect1","effect2"].map(layer=>record?.[layer]?.overlay_url?{
        url:record[layer].overlay_url,translucence:record[layer].finish==="fracture"?record[layer].translucence||0:0}:null));
    }
    const button = host.querySelector(".spot-card-button");
    if (button) {
      button.classList.toggle("is-saved", Boolean(record));
      button.title = record ? "Card Finishing Studio (saved)" : "Card Finishing Studio";
      button.setAttribute("aria-label", `${record ? "Edit" : "Add"} card finishing effects for ${info.name}`);
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
  function message(text, error = false) {
    if (current?.artworkChanged) {
      text = "The artwork changed. Close and reopen Card Finishing Studio to realign the mask."; error = true;
    }
    status.textContent = layerWording(text); status.dataset.error = String(error);
  }
  function controls() {
    // An in-flight detection/import/history operation must not restore editing
    // after the source artwork has changed underneath this session.
    if (current?.artworkChanged) ready = false;
    syncPreviewInteraction();
    const painting = Boolean(activeStroke && !activeStroke.pan);
    dialog.querySelectorAll("[data-spot-edit-controls]").forEach(el => {el.disabled = !ready || busy || painting;});
    dialog.querySelector("[data-spot-apply]").disabled = fields.selection_mode.value === "none";
    save.disabled = !ready || busy || painting || (!hasInk && !maskReviewed && !current?.record && !removal && !Object.values(layerDrafts).some(draft=>draft.enabled||draft.removal));
    dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.disabled=!ready||busy||Boolean(activeStroke));
    dialog.querySelector("[data-spot-invert]").disabled = !ready || busy || painting;
    dialog.querySelector("[data-spot-undo]").disabled = !ready || busy || painting || historyIndex <= 0;
    dialog.querySelector("[data-spot-pocket-undo]").disabled = !ready || busy || painting || historyIndex <= 0;
    dialog.querySelector("[data-spot-redo]").disabled = !ready || busy || painting || historyIndex >= history.length - 1;
    dialog.querySelector("[data-spot-remove]").disabled = !ready || busy || painting || !activeSaved();
    dialog.querySelectorAll("[data-spot-close]").forEach(button => {button.disabled = busy;});
  }
  function coverage() {
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    let selected = 0;
    for (let i = 3; i < pixels.length; i += 4) selected += pixels[i] > 0;
    hasInk = selected > 0;
    const percent = selected / (mask.width * mask.height) * 100;
    maskArea = selected && percent < 1 ? "<1" : String(Math.round(percent));
    updatePreviewHelp();
    return maskArea;
  }
  function markChanged() {
    message(removal ? "Removal pending · save to restore the regular card finish." : `Unsaved changes · ${coverage()}% of the card selected`);
    controls();
  }
  function renderMask() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = null;
    stage.dataset.textPreview = String(showingText || showingFrame);
    dialog.querySelector("[data-spot-area-guide]").hidden = !ready || showingText || showingFrame || fields.selection_mode.value === "none" || fields.selection_region.value !== "artwork";
    syncPreviewInteraction();
    dialog.querySelector("[data-spot-show-text]").textContent = showingText ? "Hide text preview" : "Preview text";
    dialog.querySelector("[data-spot-show-frame]").textContent = showingFrame ? "Hide frame preview" : "Preview frame";
    updatePreviewHelp();
    stage.dataset.maskOnly = String(fields.mask_only.checked);
    dialog.style.setProperty("--spot-overlay-color", fields.overlay_color.value);
    dialog.querySelector("[data-spot-overlay-color]").value = fields.overlay_color.value.toUpperCase();
    // Full-resolution PNGs are needed for history and saving, not for each
    // pointer move. The visible overlay still uses every mask pixel.
    const painting = activeStroke && !activeStroke.pan;
    let effectUrl = maskUrl;
    if (!painting) {
      effectUrl = maskUrl = mask.toDataURL("image/png");
    } else if (view === "effect") {
      const width = Math.min(mask.width, 1512, Math.max(756, Math.ceil(stage.clientWidth * (window.devicePixelRatio || 1))));
      const height = Math.round(width * mask.height / mask.width);
      if (liveMask.width !== width || liveMask.height !== height) {
        liveMask.width = width; liveMask.height = height;
      }
      liveContext.clearRect(0, 0, width, height);
      liveContext.drawImage(mask, 0, 0, width, height);
      effectUrl = liveMask.toDataURL("image/png");
    }
    overlay.clearRect(0, 0, canvas.width, canvas.height);
    overlay.drawImage(mask, 0, 0);
    overlay.globalCompositeOperation = "source-in"; overlay.fillStyle = fields.overlay_color.value;
    overlay.fillRect(0, 0, canvas.width, canvas.height); overlay.globalCompositeOperation = "source-over";
    const allOverlays=view==="all" && !showingText && !showingFrame;
    const inactive=Object.keys(layerOrder).filter(layer=>layer!==editingLayer&&layerDrafts[layer]?.enabled&&layerDrafts[layer].png);
    canvas.style.zIndex=String(layerOrder[editingLayer]);
    otherOverlays.forEach((element,index)=>{
      const layer=inactive[index],draft=layerDrafts[layer];element.hidden=!allOverlays||!draft;
      element.style.removeProperty("--spot-other-mask");
      if(!element.hidden){element.style.setProperty("--spot-other-mask",`url("${draft.png}")`);element.style.backgroundColor=draft.values.overlay_color;element.style.zIndex=String(layerOrder[layer]);}
    });
    for(const layer of Object.keys(layerOrder)) {
      dialog.querySelector(`[data-spot-legend-color="${layer}"]`).style.backgroundColor=layer===editingLayer?fields.overlay_color.value:layerDrafts[layer]?.values.overlay_color||"#00BFFF";
    }
    if (showingText || showingFrame) {
      overlay.clearRect(0, 0, canvas.width, canvas.height);
      const selection = showingFrame
        ? window.DeckadenceSpotSelection.frameSelection(image, generationOptions(), mask.width, mask.height, frameMasks.get(fields.frame_layout.value)?.[fields.frame_scope.value]).canvas
        : window.DeckadenceSpotSelection.textRegions(image, generationOptions(), mask.width, mask.height);
      overlay.drawImage(selection, 0, 0);
      overlay.globalCompositeOperation = "source-in"; overlay.fillStyle = "#24c9e5";
      overlay.fillRect(0, 0, canvas.width, canvas.height); overlay.globalCompositeOperation = "source-over";
    }
    if (!painting || view === "effect") {
      const draftFor=layer=>layer===editingLayer?{enabled:!removal&&(hasInk||maskReviewed||activeSaved()),png:effectUrl,
        values:{finish:fields.finish.value,strength:fields.strength.value,effect_scale:fields.effect_scale.value,effect_density:fields.effect_density.value,effect_seed:fields.effect_seed.value,effect_color:fields.effect_color.value,effect_translucence:fields.effect_translucence.value}}:layerDrafts[layer];
      const preview=layer=>{const draft=draftFor(layer);return draft?.enabled&&draft.png?{maskUrl:draft.png,finish:draft.values.finish,strength:Number(draft.values.strength)}:null;};
      effects.setSpotFoil(stage,preview("mask"));effects.setGloss(stage,preview("gloss"));
      for(const layer of ["effect1","effect2"])queuePrintedPreview(layer,draftFor(layer));
    }
  }
  function updatePreviewHelp() {
    const allOverlays=view==="all" && !showingText && !showingFrame;
    dialog.querySelector("[data-spot-overlay-legend]").hidden=!allOverlays;
    dialog.querySelector("[data-spot-preview-help]").hidden=allOverlays;
    dialog.querySelector("[data-spot-preview-help]").textContent = showingFrame ? "Cyan shows the frame selection." : showingText
      ? "Cyan shows the text selection."
      : view === "mask" ? `${fields.mask_only.checked ? "Color = foil. Black = no foil." : "Overlay color = foil. Clear = no foil."} Mask covers ${maskArea}% of the whole card.`
      : view === "original" ? "Original artwork."
      : "Hover with Pan to tilt and catch the light.";
    const help=dialog.querySelector("[data-spot-preview-help]");help.textContent=layerWording(help.textContent);
  }
  function scheduleRender() {if (!renderFrame) renderFrame = requestAnimationFrame(renderMask);}
  function commitMask() {
    showingFrame = false;
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
  }
  async function loadMask(source) {
    const token = session;
    const img = new Image(); img.src = source;
    await img.decode();
    if (token !== session || current?.artworkChanged) return false;
    // Keep saved high-resolution strokes even if the artwork is later replaced
    // with a smaller image. Undo entries share the current canvas dimensions.
    if (img.naturalWidth > mask.width) sizeMask(Math.min(3024, img.naturalWidth));
    ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(img, 0, 0, mask.width, mask.height);
    return true;
  }
  async function travelHistory(direction) {
    if (!ready || busy || activeStroke || historyIndex + direction < 0 || historyIndex + direction >= history.length) return;
    ready = false; controls();
    const token = session;
    try {
      if (await loadMask(history[historyIndex + direction])) {
        historyIndex += direction; removal = false; renderMask(); ready = true; markChanged();
        dialog.querySelector("[data-spot-pocket-result]").textContent = "Previous edit restored.";
      }
    } catch (error) {if (token === session) {ready = true; message(error.message, true); controls();}}
  }
  function resizePreview(preserveCenter = true) {
    if (!dialog.open) return;
    // Layout coordinates avoid tilt transforms and keep the same artwork detail
    // centered when zooming a panned card.
    const center = preserveCenter !== false && stage.offsetWidth ? {
      x: Math.max(0, Math.min(1, (viewport.scrollLeft + viewport.clientWidth / 2 - stage.offsetLeft) / stage.offsetWidth)),
      y: Math.max(0, Math.min(1, (viewport.scrollTop + viewport.clientHeight / 2 - stage.offsetTop) / stage.offsetHeight)),
    } : null;
    const fit = Math.max(80, Math.min(viewport.clientWidth - 48, (viewport.clientHeight - 48) * mask.width / mask.height));
    stage.style.width = fit * Number(fields.zoom.value) / 100 + "px";
    if (center) {
      viewport.scrollLeft = stage.offsetLeft + center.x * stage.offsetWidth - viewport.clientWidth / 2;
      viewport.scrollTop = stage.offsetTop + center.y * stage.offsetHeight - viewport.clientHeight / 2;
    } else viewport.scrollTo(0, 0);
    dialog.querySelector("[data-spot-zoom-value]").value = fields.zoom.value + "%";
    cursor.hidden = true;
    syncPreviewInteraction();
  }
  function syncPreviewInteraction() {
    const enabled = ready && !busy && !showingText && !showingFrame && tool === "pan" && view === "effect" && !activeStroke;
    stage.dataset.tilt = String(enabled);
    effects.setInteractive(stage, enabled);
  }
  function setTool(value) {
    if (activeStroke) return;
    tool = value; stage.dataset.tool = tool; cursor.hidden = true;
    dialog.querySelector("[data-spot-color-tools]").hidden = !["wand", "match", "sample"].includes(tool);
    dialog.querySelector("[data-spot-brush-tools]").hidden = !["paint", "erase"].includes(tool);
    syncPreviewInteraction();
    if (value !== "pan") {
      dialog.querySelector("[data-spot-touch-up]").open = true;
      activateStep(dialog.querySelector("[data-spot-touch-up]"));
    }
    dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotTool === tool)));
  }
  function setView(value) {
    view = value; stage.dataset.view = view;
    syncPreviewInteraction();
    dialog.querySelectorAll("[data-spot-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotView === view)));
  }
  async function openEditor(host, trigger) {
    if (dialog.open) return;
    // The native close event is queued. Release the old session now if another
    // card is opened before that event arrives.
    if (current) releaseEditor();
    const info = describe(host);
    if (!info) return;
    const token = ++session;
    current = {...info, trigger, record: null}; ready = false; busy = false; removal = false; activeStroke = null;
    metadata = null; history = []; historyIndex = -1; hasInk = false; maskArea = "0"; maskReviewed = false; textRegions = []; showingText = false;
    subjectMasks = new Map(); frameMasks = new Map(); showingFrame = false;
    editingLayer="mask";layerDrafts={};setLayerLabels();
    try {
      const color=localStorage.getItem("deckadence.spot.overlayColor");
      fields.overlay_color.value=/^#[0-9a-f]{6}$/i.test(color||"")?color:"#00D8FF";
      fields.mask_only.checked=localStorage.getItem("deckadence.spot.maskOnly")==="true";
    } catch (_) {}
    ctx.clearRect(0, 0, mask.width, mask.height); overlay.clearRect(0, 0, canvas.width, canvas.height);
    fields.finish.value = "foil"; fields.strength.value = "100"; fields.zoom.value = "100"; fields.mask_file.value = ""; fields.mask_channel.value = "auto";
    dialog.querySelector("[data-spot-strength-value]").value = "100%";
    dialog.querySelector("[data-spot-card-name]").textContent = `${info.name} · ${info.target.face} face`;
    dialog.querySelector("[data-spot-scope]").textContent = "Loading image-library scope…";
    image.removeAttribute("src"); image.alt = info.name;
    for (const step of steps) step.open = step.dataset.spotStep === "automatic";
    activateStep(steps[0]);
    setTool("pan"); setView("effect"); controls(); message("Loading card and saved spot foiling…");
    dialog.showModal(); renderMask(); resizePreview(false);
    try {
      const [payload, response] = await Promise.all([api(apiUrl(endpoint(info.target))), fetch(info.src, {cache: "no-store"})]);
      if (!response.ok) throw new Error("The card artwork could not be loaded.");
      const blob = await response.blob();
      let hash = 2166136261;
      for (const byte of new Uint8Array(await blob.arrayBuffer())) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      if (token !== session || current?.artworkChanged) return;
      current.signature = hash.toString(16).padStart(8, "0");
      current.record = payload.record; current.scope = payload.image_scope.token; scopeToken = current.scope;
      metadata = payload; artworkUrl = URL.createObjectURL(blob); image.src = artworkUrl; await image.decode();
      if (token !== session || current?.artworkChanged) return;
      sizeMask(Math.max(756, Math.min(3024, Math.round(Math.min(image.naturalWidth, image.naturalHeight * 756 / 1056)))));
      const record = current.record;
      const workflowOptions = payload.preferences.profiles[payload.preferences.active_workflow];
      // Older running servers can still return the former opaque defaults.
      const treatmentDefaults = payload.preferences.text_border_defaults_version === 1 ? workflowOptions : {};
      if (record && record.foil_enabled!==false) {
        fields.finish.value = record.finish; fields.strength.value = String(record.strength);
        if (!(await loadMask(record.mask_url))) return;
      }
      ready = true; coverage(); renderMask(); history = [maskUrl]; historyIndex = 0; controls();
      const generation = record?.generation || {};
      fields.selection_mode.value = generation.mode || (["artwork","highlights","colors","details","shadows","subject","background"].includes(workflowOptions.selection) ? workflowOptions.selection : "highlights");
      fields.cleanup.value = generation.cleanup || workflowOptions.selection_cleanup || "balanced";
      const pocketSize = generation.pocket_size || 64;
      fields.pocket_size.value = Array.from(fields.pocket_size.options).some(option => option.value === String(pocketSize)) ? String(pocketSize) : "custom";
      fields.pocket_size_custom.value = pocketSize;
      updatePocketSize();
      fields.pocket_target.value = generation.pocket_target || "both";
      dialog.querySelector("[data-spot-pocket-result]").textContent = "";
      fields.generation_action.value = generation.action || workflowOptions.generation_action || "foil";
      fields.selection_region.value = generation.region || (workflowOptions.protect_text || workflowOptions.protect_frame ? "artwork" : "full");
      fields.selection_amount.value = generation.amount || workflowOptions.selection_amount || 35; updateGenerationHint();
      fields.coverage.value = generation.coverage || workflowOptions.foil_coverage_percent || 100;
      fields.text_mode.value = generation.text_mode || treatmentDefaults.text_treatment || "original"; fields.text_source.value = generation.text_source || "standard";
      fields.text_detail.value = generation.text_detail || "letters"; textRegions = generation.text_regions || [];
      fields.text_ink.value = generation.text_ink || "auto";
      fields.text_expand.value = generation.text_expand || 0; fields.text_smooth.value = generation.text_smooth || 0;
      fields.exclude_mode.value = generation.exclude_mode || "off";
      fields.exclude_color.value = generation.exclude_color || "#101010";
      updateExclusionControls();
      fields.tolerance.value = generation.color_tolerance ?? 32;
      for (const key of ["edge_expand", "edge_smooth", "edge_sharpen", "color_expand", "color_smooth", "brush_softness"]) fields[key].value = generation[key] || 0;
      fields.brush_size.value = generation.brush_size || 40;
      fields.brush_shape.value = generation.brush_shape || "round";
      updateBrushControls(); updateEdgeControls();
      artworkColors = window.DeckadenceSpotSelection.artworkPalette(image);
      recentColors = [...(generation.color_swatches || [])];
      chooseColor(generation.selected_color || "#FFFFFF");
      if(record?.artwork_signature && record.artwork_signature!==current.signature)textRegions=[];
      fields.border_mode.value = generation.border_mode || treatmentDefaults.border_treatment || "original"; fields.border_width.value = generation.border_width ?? workflowOptions.border_width_percent ?? 2;
      fields.frame_mode.value = generation.frame_mode || "original";
      fields.frame_scope.value = generation.frame_scope || "material";
      fields.frame_layout.value = ({modern:"m15",classic:"retro"})[generation.frame_layout] || generation.frame_layout || "auto";
      updateFrameControls();
      updateRegionControls();
      layerDrafts.mask=captureLayer();layerDrafts.gloss=glossDraft(record?.gloss,layerDrafts.mask);
      for(const layer of ["effect1","effect2"])layerDrafts[layer]=effectDraft(record?.[layer],layerDrafts.mask,layer);
      renderMask();
      dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%";
      dialog.querySelector("[data-spot-scope]").textContent = payload.image_scope.is_isolated
        ? "Isolation on · saved only in this collection"
        : "Shared · saved for this printing across decks and sets";
      message(record?.artwork_signature && record.artwork_signature !== current.signature
        ? "Artwork has changed. Check alignment and adjust the saved mask before saving."
        : record ? "Saved mask loaded." : "Choose a mode, then Apply spot foiling.");
      fields.selection_mode.focus({preventScroll:true});
    } catch (error) {
      if (token === session) {
        ready = false;
        dialog.querySelector("[data-spot-scope]").textContent = "Could not load card settings. Close and reopen to retry.";
        message(error.message, true); controls();
      }
    }
  }
  function closeEditor() {
    if (busy) return;
    dialog.close();
  }
  function releaseEditor() {
    ++session; ready = false; activeStroke = null;
    subjectMasks.clear(); frameMasks.clear(); showingFrame = false;
    layerDrafts={};clearPrintedPreviews();effects.setGloss(stage,null);for(const element of otherOverlays){element.hidden=true;element.style.removeProperty("--spot-other-mask");}
    if (renderFrame) cancelAnimationFrame(renderFrame); renderFrame = null;
    if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = "";
    image.removeAttribute("src"); history = []; current?.trigger.focus(); current = null;
  }
  dialog.addEventListener("close", () => {if (!dialog.open && current) releaseEditor();});
  dialog.addEventListener("cancel", event => {if (busy) event.preventDefault();});
  dialog.querySelectorAll("[data-spot-close]").forEach(button => button.addEventListener("click", closeEditor));
  dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.spotTool)));
  dialog.querySelectorAll("[data-spot-view]").forEach(button => button.addEventListener("click", () => {showingText=false;showingFrame=false;setView(button.dataset.spotView);if(ready)renderMask();}));
  function activateStep(active) {
    for (const step of steps) step.classList.toggle("is-active", step === active);
    if (active?.dataset.spotStep !== "touch-up" && tool !== "pan") setTool("pan");
  }
  for (const step of steps) {
    for (const event of ["pointerdown", "focusin"]) step.addEventListener(event, () => {
      if (step.open) activateStep(step);
    });
    step.addEventListener("toggle", event => {
      if (event.target !== step) return;
      if (step.open) activateStep(step);
      else if (step.classList.contains("is-active")) activateStep(null);
      if (!step.open && step.dataset.spotStep === "touch-up") setTool("pan");
    });
  }
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
      exclude_mode:fields.exclude_mode.value, exclude_color:fields.exclude_color.value.toUpperCase(),
      text_detail:fields.text_detail.value, text_ink:fields.text_ink.value, text_expand:Number(fields.text_expand.value), text_smooth:Number(fields.text_smooth.value),
      selected_color:fields.selection_color.value.toUpperCase(), color_tolerance:Number(fields.tolerance.value), color_swatches:recentColors,
      edge_expand:Number(fields.edge_expand.value), edge_smooth:Number(fields.edge_smooth.value), edge_sharpen:Number(fields.edge_sharpen.value),
      color_expand:Number(fields.color_expand.value), color_smooth:Number(fields.color_smooth.value),
      brush_size:Number(fields.brush_size.value), brush_softness:Number(fields.brush_softness.value), brush_shape:fields.brush_shape.value,
      text_regions:textRegions, border_mode:fields.border_mode.value, border_width:Number(fields.border_width.value),
      frame_mode:fields.frame_mode.value, frame_scope:fields.frame_scope.value, frame_layout:fields.frame_layout.value};
  }
  function updateRegionControls() {
    dialog.querySelector("[data-spot-coverage-value]").value = fields.coverage.value + "%";
    fields.tool_coverage.value = fields.coverage.value;
    dialog.querySelector("[data-spot-tool-coverage-value]").value = fields.coverage.value + "%";
    dialog.querySelector("[data-spot-border-value]").value = fields.border_width.value + "%";
    dialog.querySelector("[data-spot-tolerance-value]").value = fields.tolerance.value;
    dialog.querySelector("[data-spot-text-expand-value]").value = `${Number(fields.text_expand.value) > 0 ? "+" : ""}${fields.text_expand.value} px`;
    dialog.querySelector("[data-spot-text-smooth-value]").value = Number(fields.text_smooth.value) ? fields.text_smooth.value + " px" : "Off";
    dialog.querySelector("[data-spot-letter-options]").hidden = fields.text_detail.value !== "letters";
    dialog.querySelector("[data-spot-apply-text]").disabled = fields.text_mode.value === "original";
    dialog.querySelector("[data-spot-show-text]").textContent=showingText?"Hide text preview":"Preview text";
    dialog.querySelector("[data-spot-detector-status]").textContent = textRegions.length
      ? `${textRegions.length} detected text regions.`
      : metadata?.text_detector_ready ? "AI text detection ready."
      : "Install or update Card Finishing Studio in Plugin Manager.";
    updateGenerationHint();
    if (showingText) scheduleRender();
  }
  for (const name of ["coverage","border_width","tolerance","text_mode","text_source","text_detail","text_ink","text_expand","text_smooth","border_mode"]) fields[name].addEventListener("input",updateRegionControls);
  fields.tool_coverage.addEventListener("input", () => {fields.coverage.value = fields.tool_coverage.value; updateRegionControls();});
  function updateFrameControls() {
    const active=fields.frame_mode.value!=="original";
    dialog.querySelector("[data-spot-frame-options]").hidden=!active;
    if(!active) showingFrame=false;
    const detected=frameMasks.get(fields.frame_layout.value);
    if(!detected)showingFrame=false;
    dialog.querySelector("[data-spot-frame-status]").textContent=detected
      ? detected.found ? "AI frame contours ready." : "No distinct frame found."
      : metadata?.frame_detector_ready ? "AI traces the frame, including legendary details." : "Install or update Card Finishing Studio.";
    dialog.querySelector("[data-spot-frame-install]").hidden=Boolean(metadata?.frame_detector_ready);
    dialog.querySelector("[data-spot-show-frame]").textContent=showingFrame?"Hide frame preview":"Preview frame";
    if(ready) scheduleRender();
  }
  for(const name of ["frame_mode","frame_scope","frame_layout"]) fields[name].addEventListener("change",updateFrameControls);
  dialog.querySelector("[data-spot-show-frame]").addEventListener("click",async()=>{
    if(!ready || busy) return;
    const token=session;
    try {
      if(!showingFrame && !(await detectFrame()))return;
      if(token!==session || !dialog.open || current?.artworkChanged)return;
      showingFrame=!showingFrame;showingText=false;updateFrameControls();renderMask();
    } catch(error) {if(token===session)message(error.message || "Frame detection failed.",true);}
  });
  function chooseColor(color, remember = false) {
    const focusedGroup = document.activeElement?.parentElement;
    const restoreFocus = focusedGroup?.classList.contains("spot-card-swatches");
    color = color.toUpperCase();
    fields.selection_color.value = color;
    dialog.querySelector("[data-spot-color-value]").value = color;
    if (remember) recentColors = [color, ...recentColors.filter(item => item !== color)].slice(0, 8);
    for (const [selector, colors] of [["[data-spot-art-swatches]", artworkColors], ["[data-spot-recent-swatches]", recentColors]]) {
      dialog.querySelector(selector).replaceChildren(...colors.map(value => {
        const button = document.createElement("button"); button.type = "button"; button.className = "spot-card-swatch";
        button.style.setProperty("--swatch", value); button.title = value;
        button.setAttribute("aria-label", `Select color ${value}`); button.setAttribute("aria-pressed", String(value === color));
        button.addEventListener("click", () => chooseColor(value));
        return button;
      }));
    }
    dialog.querySelector("[data-spot-recent-colors]").hidden = !recentColors.length;
    if (restoreFocus) focusedGroup.querySelector('[aria-pressed="true"]')?.focus({preventScroll: true});
  }
  function refineColorSelection(selection) {
    const expansion = Number(fields.color_expand.value), smoothing = Number(fields.color_smooth.value);
    return expansion || smoothing ? window.DeckadenceSpotSelection.refineMask(selection, expansion * mask.width / 756, smoothing * mask.width / 756) : selection;
  }
  fields.selection_color.addEventListener("input", () => chooseColor(fields.selection_color.value));
  dialog.querySelector("[data-spot-apply-color]").addEventListener("click", () => {
    if (!ready || busy) return;
    try {
      const color = fields.selection_color.value;
      const selection = window.DeckadenceSpotSelection.colorSelection(image, 0, 0, Number(fields.tolerance.value), false, mask.width, mask.height, color);
      chooseColor(color, true); showingText = false;
      applyToolMask(refineColorSelection(selection), fields.selection_action.value === "erase"); commitMask();
    } catch (error) {message(error.message || "Color selection could not be applied.", true);}
  });
  async function detectText() {
    const token=session; ready=false; controls(); message("Detecting text locally with AI…");
    try {
      const source=document.createElement("canvas"); source.width=756;source.height=1056;
      source.getContext("2d").drawImage(image,0,0,source.width,source.height);
      const result=await api(apiUrl(endpoint(current.target)+"/detect-text"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/png").split(",")[1]})});
      if(token!==session || current?.artworkChanged)return false;
      textRegions=result.regions;fields.text_source.value="detected";updateRegionControls();
      message(textRegions.length ? "Text detected. Check Preview text, then apply." : "No text found. Try Magic Wand or Match Color.");
      return textRegions.length>0;
    } catch(error){if(token===session)message(error.message,true);return false;}
    finally{if(token===session){ready=true;controls();}}
  }
  dialog.querySelector("[data-spot-detect]").addEventListener("click",()=>{if(ready&&!busy)detectText();});
  dialog.querySelector("[data-spot-show-text]").addEventListener("click",()=>{
    showingText=!showingText;showingFrame=false;renderMask();
    dialog.querySelector("[data-spot-show-text]").textContent=showingText?"Hide text preview":"Preview text";
  });
  dialog.querySelector("[data-spot-apply-text]").addEventListener("click", async () => {
    if (!ready || busy || fields.text_mode.value === "original") return;
    try {
      if (fields.text_source.value === "detected" && !textRegions.length && !(await detectText())) return;
      if (!dialog.open || !ready) return;
      const selection = window.DeckadenceSpotSelection.textRegions(image, generationOptions(), mask.width, mask.height);
      const region = selection.getContext("2d").getImageData(0, 0, mask.width, mask.height).data;
      const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
      const amount = fields.text_mode.value === "opaque" ? 0 : Number(fields.coverage.value) / 100;
      for (let i = 3; i < pixels.data.length; i += 4) {
        const weight = region[i] / 255;
        pixels.data[i] = Math.round(pixels.data[i] * (1 - weight) + 255 * amount * weight);
        pixels.data[i-3] = pixels.data[i-2] = pixels.data[i-1] = 255;
      }
      ctx.putImageData(pixels, 0, 0); showingText = false; commitMask();
      message("Text updated. Undo is available.");
    } catch (error) {message(error.message || "Text selection could not be applied.", true);}
  });
  function updateGenerationHint() {
    const choices = {
      highlights: "brightest",
      colors: "most colorful",
      details: "most textured",
      shadows: "darkest",
    };
    const mode = fields.selection_mode.value, none = mode === "none", solid = mode === "artwork", semantic = ["subject","background"].includes(mode);
    dialog.querySelectorAll("[data-spot-auto-option]").forEach(element => {element.hidden = none;});
    dialog.querySelector("[data-spot-auto-off]").hidden = !none;
    dialog.querySelector("[data-spot-apply]").disabled = none;
    if (none && (showingText || showingFrame)) {showingText = false; showingFrame = false; scheduleRender();}
    const all = solid || Number(fields.selection_amount.value) === 100;
    const box = fields.selection_region.value === "artwork";
    const area = box ? "art box" : "card", amount = fields.selection_amount.value;
    dialog.querySelector("[data-spot-amount-label]").textContent = "Area selected";
    dialog.querySelector("[data-spot-amount-help]").textContent = all
      ? `Selects every pixel in the ${area}. Text and border choices below still apply.`
      : `Targets the ${choices[mode]} ${amount}% of all pixels in the ${area}, including its background.`;
    dialog.querySelector("[data-spot-amount-value]").value = (solid ? 100 : amount) + "%";
    fields.selection_amount.disabled = solid || semantic;
    fields.selection_amount.closest("label").hidden = solid || semantic;
    dialog.querySelector("[data-spot-amount-help]").hidden = semantic;
    dialog.querySelector("[data-spot-subject-help]").hidden = !semantic;
    const subjectReady=metadata?.subject_detector_ready && (box || metadata?.frame_detector_ready);
    dialog.querySelector("[data-spot-subject-status]").textContent = subjectReady
      ? (mode==="background" ? "Selects everything behind the AI subject." : "Selects the main subject with local AI.")
      : "Install or update Card Finishing Studio.";
    dialog.querySelector("[data-spot-subject-install]").hidden = Boolean(subjectReady);
    dialog.querySelector("[data-spot-area-guide]").hidden = !ready || showingText || showingFrame || none || !box;
    dialog.querySelector("[data-spot-area-help]").textContent = box
      ? "Only the outlined art box is used. Choose Whole card for full-art layouts."
      : "";
    dialog.querySelector("[data-spot-area-help]").hidden = !box;
    dialog.querySelector("[data-spot-border-options]").hidden = fields.border_mode.value === "original";
    const treatments = [];
    if (fields.text_mode.value !== "original") {
      const text = fields.text_mode.value === "opaque" ? "kept opaque" : "foiled";
      treatments.push(fields.text_detail.value === "regions"
        ? `Text-box backgrounds will also be ${text}.`
        : "Letters cut off by a detection box stay unchanged.");
      treatments.push(fields.text_source.value === "detected"
        ? "Check Preview text for missed lettering."
        : "Fixed text positions; choose AI detected for full-art cards.");
    }
    if (fields.border_mode.value !== "original" && !Number(fields.border_width.value)) treatments.push("0% leaves the border unchanged.");
    dialog.querySelector("[data-spot-treatment-hint]").textContent = layerWording(treatments.join(" "));
    dialog.querySelector("[data-spot-treatment-hint]").hidden = !treatments.length;
  }
  fields.selection_mode.addEventListener("change", updateGenerationHint);
  fields.generation_action.addEventListener("change", updateGenerationHint);
  fields.selection_amount.addEventListener("input", updateGenerationHint);
  fields.selection_region.addEventListener("change", updateGenerationHint);
  function updateExclusionControls() {
    dialog.querySelector("[data-spot-exclusion-options]").hidden = fields.exclude_mode.value === "off";
    dialog.querySelector("[data-spot-exclude-color]").value = fields.exclude_color.value.toUpperCase();
    updateGenerationHint();
  }
  fields.exclude_mode.addEventListener("change", updateExclusionControls);
  fields.exclude_color.addEventListener("input", updateExclusionControls);
  dialog.querySelector("[data-spot-apply-exclusions]").addEventListener("click", () => {
    if (!ready || busy || fields.exclude_mode.value === "off") return;
    try {
      const filtered = window.DeckadenceSpotSelection.excludeColors(image, mask, fields.exclude_mode.value, fields.exclude_color.value);
      ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(filtered, 0, 0);
      showingText = false; commitMask();
      message(`Exclusions applied · ${coverage()}% of the card has foil. Undo is available.`);
    } catch (error) {message(error.message || "Color exclusions could not be applied.", true);}
  });
  dialog.querySelector("[data-spot-apply]").addEventListener("click", async () => {
    if (!ready || busy || fields.selection_mode.value === "none") return;
    const token=session;
    try {
      if(fields.text_mode.value!=="original" && fields.text_source.value==="detected" && !textRegions.length && !(await detectText()))return;
      if(token!==session || !dialog.open || !ready)return;
      const semantic=["subject","background"].includes(fields.selection_mode.value);
      const frame=fields.frame_mode.value!=="original" || (semantic && fields.selection_region.value==="full") ? await detectFrame() : null;
      if(token!==session || !dialog.open || !ready || current?.artworkChanged)return;
      const foreground=semantic ? await detectSubject() : null;
      if(token!==session || !dialog.open || !ready || current?.artworkChanged)return;
      showingText=false;
      if(foreground && frame?.found) {
        const context=foreground.getContext("2d");context.globalCompositeOperation="destination-out";
        context.drawImage(frame.panels,0,0,foreground.width,foreground.height);context.globalCompositeOperation="source-over";
      }
      const generated = window.DeckadenceSpotSelection.generate(image, {...generationOptions(),frame_mask:frame?.[fields.frame_scope.value]}, mask.width, mask.height, foreground);
      ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(generated, 0, 0);
      commitMask();
      message(hasInk ? `Applied · ${coverage()}% of the card selected` : "Fully opaque. Save to keep this mask.");
    } catch (error) {if(token===session)message(error.message || "The automatic selection could not be generated.", true);}
  });
  async function detectFrame() {
    const token=session, layout=fields.frame_layout.value;
    if(frameMasks.has(layout))return frameMasks.get(layout);
    ready=false;controls();message("Tracing frame contours locally… First use downloads the frame model (118 MB).");
    try {
      const source=document.createElement("canvas");source.width=Math.max(16,Math.min(1512,image.naturalWidth));
      source.height=Math.round(source.width*image.naturalHeight/image.naturalWidth);
      source.getContext("2d").drawImage(image,0,0,source.width,source.height);
      const response=await api(apiUrl(endpoint(current.target)+"/detect-frame"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/jpeg",.95).split(",")[1],layout})});
      if(token!==session || !dialog.open || current?.artworkChanged)return null;
      const detected={found:response.found,parts:response.parts};
      for(const key of ["material","panels"]) {
        const decoded=new Image();decoded.src=response.masks[key];await decoded.decode();detected[key]=decoded;
      }
      if(token!==session || !dialog.open || current?.artworkChanged)return null;
      frameMasks.set(layout,detected);message(detected.found?"Frame contours detected.":"No distinct frame found.");
      return detected;
    } finally {if(token===session){ready=true;controls();updateFrameControls();}}
  }
  async function detectSubject() {
    const token=session, region=fields.selection_region.value;
    const bounds=region==="artwork" ? [.08,.13,.92,.56] : [0,0,1,1];
    let detected=subjectMasks.get(region);
    if(!detected) {
      ready=false;controls();message("Finding the subject locally… First use may download the AI model (179 MB).");
      try {
        const source=document.createElement("canvas"), [l,t,r,b]=bounds;
        source.width=Math.max(16,Math.min(1512,Math.round(image.naturalWidth*(r-l))));
        source.height=Math.round(source.width*1056/756*(b-t)/(r-l));
        source.getContext("2d").drawImage(image,l*image.naturalWidth,t*image.naturalHeight,(r-l)*image.naturalWidth,(b-t)*image.naturalHeight,0,0,source.width,source.height);
        const response=await api(apiUrl(endpoint(current.target)+"/detect-subject"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/jpeg",.95).split(",")[1]})});
        if(token!==session || current?.artworkChanged)return null;
        detected=new Image();detected.src=response.mask_data;await detected.decode();
        if(token!==session || current?.artworkChanged)return null;
        subjectMasks.set(region,detected);
      } finally {if(token===session){ready=true;controls();}}
    }
    const result=document.createElement("canvas");result.width=mask.width;result.height=mask.height;
    const [l,t,r,b]=bounds, output=result.getContext("2d");output.imageSmoothingQuality="high";
    output.drawImage(detected,l*result.width,t*result.height,(r-l)*result.width,(b-t)*result.height);
    return result;
  }
  function updateBrushControls() {
    cursor.style.borderRadius = fields.brush_shape.value === "square" ? "0" : "50%";
    dialog.querySelector("[data-spot-brush-value]").value = fields.brush_size.value + " px";
    dialog.querySelector("[data-spot-brush-softness-value]").value = Number(fields.brush_softness.value) ? fields.brush_softness.value + "%" : "Hard";
  }
  for (const field of [fields.brush_size, fields.brush_softness, fields.brush_shape]) field.addEventListener("input", updateBrushControls);
  function updateEdgeControls() {
    for (const prefix of ["edge", "color"]) {
      const expand = Number(fields[prefix + "_expand"].value), smooth = Number(fields[prefix + "_smooth"].value);
      dialog.querySelector(`[data-spot-${prefix}-expand-value]`).value = `${expand > 0 ? "+" : ""}${expand} px`;
      dialog.querySelector(`[data-spot-${prefix}-smooth-value]`).value = smooth ? smooth + " px" : "Off";
    }
    dialog.querySelector("[data-spot-edge-sharpen-value]").value = Number(fields.edge_sharpen.value) ? fields.edge_sharpen.value + "%" : "Off";
  }
  for (const name of ["edge_expand", "edge_smooth", "edge_sharpen", "color_expand", "color_smooth"]) fields[name].addEventListener("input", updateEdgeControls);
  dialog.querySelector("[data-spot-refine-edges]").addEventListener("click", async () => {
    if (!ready || busy) return;
    const expansion = Number(fields.edge_expand.value), smoothing = Number(fields.edge_smooth.value), sharpening = Number(fields.edge_sharpen.value);
    if (!expansion && !smoothing && !sharpening) {message("Choose an edge adjustment first."); return;}
    const token = session;
    busy = true; controls(); message("Refining edges…");
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      if (token !== session || !dialog.open || current?.artworkChanged) return;
      const refined = window.DeckadenceSpotSelection.refineMask(mask, expansion * mask.width / 756, smoothing * mask.width / 756, sharpening);
      ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(refined, 0, 0);
      showingText = false; commitMask(); message("Edges updated. Undo is available.");
    } catch (error) {message(error.message || "Edges could not be refined.", true);}
    finally {if (token === session) {busy = false; controls();}}
  });
  fields.zoom.addEventListener("input", resizePreview);
  for (const [selector, amount] of [["[data-spot-zoom-in]", 25], ["[data-spot-zoom-out]", -25]]) {
    dialog.querySelector(selector).addEventListener("click", () => {fields.zoom.value = Math.max(50, Math.min(400, Number(fields.zoom.value) + amount)); resizePreview();});
  }
  dialog.querySelector("[data-spot-fit]").addEventListener("click", () => {fields.zoom.value = "100"; resizePreview(false);});
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
      if (token !== session || !dialog.open || current?.artworkChanged) return;
      const result = window.DeckadenceSpotSelection.cleanPockets(mask, maximum, fields.pocket_target.value);
      if (result.changed) {
        showingText = false;
        ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(result.canvas, 0, 0);
        commitMask();
      }
      const summary = result.changed
        ? `Removed ${result.removed.toLocaleString()} foil dots; filled ${result.filled.toLocaleString()} clear holes.`
        : "No pockets found at this size.";
      dialog.querySelector("[data-spot-pocket-result]").textContent = summary;
      message(summary);
    } catch (error) {message(error.message || "Pocket cleanup could not be applied.", true);}
    finally {if (token === session) {busy = false; controls();}}
  });
  dialog.querySelector("[data-spot-redo]").addEventListener("click", () => travelHistory(1));
  function selectArea(mode) {
    if (!ready || busy || activeStroke) return false;
    ctx.clearRect(0, 0, mask.width, mask.height); ctx.fillStyle = "white"; ctx.save(); ctx.globalAlpha=Number(fields.coverage.value)/100;
    if (mode === "all") ctx.fillRect(0, 0, mask.width, mask.height);
    if (mode === "art") ctx.fillRect(mask.width * .08, mask.height * .13, mask.width * .84, mask.height * .43);
    ctx.restore(); showingText=false;
    commitMask();
    return true;
  }
  dialog.querySelector("[data-spot-select-art]").addEventListener("click", () => selectArea("art"));
  dialog.querySelector("[data-spot-select-all]").addEventListener("click", () => selectArea("all"));
  dialog.querySelector("[data-spot-clear]").addEventListener("click", () => selectArea("none"));
  dialog.querySelector("[data-spot-invert]").addEventListener("click", () => {
    if (!ready || busy || activeStroke) return;
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = 255 - pixels.data[i + 3];
    }
    ctx.putImageData(pixels, 0, 0); showingText = false; commitMask();
    message("Foiling inverted. Undo is available.");
  });
  dialog.querySelector("[data-spot-remove]").addEventListener("click", () => {
    if (selectArea("none")) {removal = true; markChanged();}
  });
  for (const field of [fields.finish, fields.strength, fields.effect_scale, fields.effect_density, fields.effect_color, fields.effect_translucence]) field.addEventListener("input", () => {
    updateEffectColor(field===fields.finish);
    dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%"; scheduleRender(); markChanged();
  });
  dialog.querySelectorAll("[data-spot-effect-swatch]").forEach(button=>button.addEventListener("click",()=>{
    fields.effect_color.value=button.dataset.spotEffectSwatch;fields.effect_color.dispatchEvent(new Event("input",{bubbles:true}));
  }));
  dialog.querySelector("[data-spot-maximize]").addEventListener("click", event => {
    const maximized = dialog.classList.toggle("is-maximized"), button = event.currentTarget;
    button.setAttribute("aria-pressed", String(maximized));
    button.setAttribute("aria-label", `${maximized ? "Restore" : "Maximize"} card finishing effects`);
    button.querySelector("span").textContent = maximized ? "Restore" : "Maximize";
    requestAnimationFrame(() => resizePreview());
  });
  function updateOverlayPreference() {
    if (ready) scheduleRender();
    try {
      localStorage.setItem(`deckadence.${editingLayer==="mask"?"spot":editingLayer}.overlayColor`, fields.overlay_color.value);
      localStorage.setItem(`deckadence.${editingLayer==="mask"?"spot":editingLayer}.maskOnly`, String(fields.mask_only.checked));
    } catch (_) {}
  }
  try {
    const color = localStorage.getItem("deckadence.spot.overlayColor");
    if (/^#[0-9a-f]{6}$/i.test(color || "")) fields.overlay_color.value = color;
    fields.mask_only.checked = localStorage.getItem("deckadence.spot.maskOnly") === "true";
  } catch (_) {}
  fields.overlay_color.addEventListener("input", updateOverlayPreference);
  fields.mask_only.addEventListener("change", updateOverlayPreference);
  dialog.querySelectorAll("[data-spot-overlay-swatch]").forEach(button => button.addEventListener("click", () => {
    fields.overlay_color.value = button.dataset.spotOverlaySwatch; updateOverlayPreference();
  }));

  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {x: (event.clientX - box.left) * mask.width / box.width, y: (event.clientY - box.top) * mask.height / box.height};
  }
  function draw(from, to) {
    window.DeckadenceSpotSelection.brushStroke(strokeContext, from, to, activeStroke.width, activeStroke.shape);
    ctx.clearRect(0,0,mask.width,mask.height);ctx.drawImage(strokeBase,0,0);
    applyToolMask(strokeMask,activeStroke.erase,activeStroke.amount,activeStroke.blur);scheduleRender();
  }
  function applyToolMask(selection, erase, amount = Number(fields.coverage.value) / 100, blur = 0) {
    ctx.save();ctx.globalCompositeOperation=erase?"destination-out":"source-over";
    ctx.globalAlpha=amount;ctx.filter=blur ? `blur(${blur}px)` : "none";
    ctx.drawImage(selection,0,0);ctx.restore();
  }
  canvas.addEventListener("pointerdown", event => {
    if (!ready || busy || activeStroke || event.button !== 0) return;
    showingText=false;showingFrame=false;
    if (tool === "sample") {
      event.preventDefault(); const p = point(event);
      chooseColor(window.DeckadenceSpotSelection.sampleColor(image, p.x, p.y, mask.width, mask.height), true);
      renderMask(); message("Color picked. Choose Apply color across card."); return;
    }
    if(tool==="wand"||tool==="match") {
      event.preventDefault();const p=point(event);
      chooseColor(window.DeckadenceSpotSelection.sampleColor(image, p.x, p.y, mask.width, mask.height), true);
      const selection=window.DeckadenceSpotSelection.colorSelection(image,p.x,p.y,Number(fields.tolerance.value),tool==="wand",mask.width,mask.height);
      applyToolMask(refineColorSelection(selection),fields.selection_action.value==="erase");commitMask();return;
    }
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    strokeContext.clearRect(0,0,mask.width,mask.height);baseContext.clearRect(0,0,mask.width,mask.height);baseContext.drawImage(mask,0,0);
    const diameter = Number(fields.brush_size.value) * mask.width / 756, softness = Number(fields.brush_softness.value) / 100;
    activeStroke = {id: event.pointerId, last: point(event), x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pan: tool === "pan",
      width: diameter * (1 - softness * .5), blur: diameter * softness * .08, amount: Number(fields.coverage.value) / 100, erase: tool === "erase", shape:fields.brush_shape.value};
    controls();
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
    if (!ready || busy || activeStroke || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1);}
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {event.preventDefault(); travelHistory(1);}
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const tools = {b: "paint", e: "erase", h: "pan", w:"wand", c:"match", i:"sample"}; if (tools[event.key.toLowerCase()]) setTool(tools[event.key.toLowerCase()]);
    }
  });
  fields.mask_file.addEventListener("change", async () => {
    const file = fields.mask_file.files[0]; if (!file) return;
    const token = session; let url;
    ready = false; controls();
    try {
      if (file.size > 10_000_000 || file.type !== "image/png") throw new Error("Choose a PNG mask smaller than 10 MB.");
      url = URL.createObjectURL(file); const imported = new Image(); imported.src = url;
      await imported.decode().catch(() => {throw new Error("This PNG could not be opened. Choose another mask.");});
      if (token !== session || current?.artworkChanged) return;
      if (imported.width * imported.height > 24_000_000) throw new Error("Use a mask of 24 megapixels or less.");
      const width = Math.max(mask.width, Math.min(3024, Math.round(Math.min(imported.width, imported.height * 756 / 1056))));
      const result = window.DeckadenceSpotSelection.readMask(imported, fields.mask_channel.value, width, Math.round(width * 1056 / 756));
      if (width !== mask.width) sizeMask(width);
      ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(result.canvas, 0, 0);
      showingText = false; ready = true; commitMask();
      message("Mask imported. Undo is available.");
    } catch (error) {if (token === session) {ready = true; message(error.message, true); controls();}}
    finally {if (url) URL.revokeObjectURL(url); if (token === session) fields.mask_file.value = "";}
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!ready || busy || save.disabled) return;
    busy = true; controls(); message("Saving card finishes…");
    const target = current.target;
    try {
      layerDrafts[editingLayer]=captureLayer();
      const foil=layerDrafts.mask;
      const layerPayloads={};
      for(const layer of ["gloss","effect1","effect2"]) {
        const draft=layerDrafts[layer];let png=draft.png;
        if(draft.enabled&&png&&!png.startsWith("data:")) {
          const response=await fetch(png);if(!response.ok)throw new Error("Could not load "+layerNames[layer]+".");
          const blob=await response.blob();png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        }
        layerPayloads[layer]=draft.enabled?{finish:draft.values.finish,strength:Number(draft.values.strength),overlay_color:draft.values.overlay_color,generation:draft.generation,mask_data:png,
          ...(layer.startsWith("effect")?effectParams(draft.values):{})}:null;
      }
      if(current?.artworkChanged)throw new Error("Artwork changed. Close and reopen before saving.");
      const removeAll=!Object.values(layerDrafts).some(draft=>draft.enabled);
      const body=removeAll ? {revision:current.record?.revision||null,all_layers:true} : {
        finish:foil.values.finish,strength:Number(foil.values.strength),artwork_signature:current.signature,
        generation:foil.generation,mask_data:foil.png,foil_enabled:foil.enabled,revision:current.record?.revision||null,...layerPayloads,
      };
      const result = await api(apiUrl(endpoint(target), true), {method: removeAll ? "DELETE" : "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      publish(target, result.record); channel?.postMessage({scope: current.scope, target});
      document.dispatchEvent(new CustomEvent("deckadence:spot-foil-saved", {detail: {target, scope: current.scope}}));
      busy = false; dialog.close();
    } catch (error) {
      busy = false;
      message(error.message + (error.retryable ? " Your changes are still here; try Save again." : ""), true);
      controls();
    }
  });
  channel?.addEventListener("message", event => {
    if (event.data?.scope !== scopeToken || !event.data?.target) return;
    cache.delete(keyFor(event.data.target)); enhance();
  });
  document.addEventListener("imomir:card-image-refreshed", event => {
    if (dialog.open && event.detail?.cardUuid === current?.target.card_uuid && event.detail.imageChanged) {
      current.artworkChanged = true; ready = false; controls(); message("", true);
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
