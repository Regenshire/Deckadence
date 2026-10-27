// Optional MPCFill Browser. Every artwork URL points at Deckadence's disk cache.
(function () {
  const root = document.getElementById("mpcfillBrowser");
  if (!root) return;
  const byId = id => document.getElementById("mpcf" + id);
  const base = "/plugins/mpcfill-browser";
  let context = null;
  let cards = [];
  let saved = new Set();
  let favorites = new Set();
  let selected = null;
  let selectedCreators = new Set();
  let tab = "all";
  let page = 1;
  let resultsPerPage = 24;
  let busy = false;
  let searchVersion = 0;
  let searchAbort = null;
  let languageNames = new Map();
  let resultQuery = "";
  let previousBodyOverflow = "";
  const pageSize = () => resultsPerPage;
  const imageUrl = (key, variant = "preview") => base + "/images/" + encodeURIComponent(key) + "/" + variant;
  const icon = name => '<i class="fa-solid fa-' + name + '" aria-hidden="true"></i>';
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const megabytes = value => ((Number(value) || 0) / 1048576).toFixed(1) + " MB";
  const dateValue = value => Date.parse(String(value || "").replace(/(\d+)(st|nd|rd|th)/g, "$1")) || 0;
  const tagsFor = card => Array.isArray(card.tags) ? card.tags : [];

  const filterWidthKey = "deckadence.mpcfill.filterWidth.v1";
  const filterResize = byId("FilterResize");
  const workspace = root.querySelector(".mpcf-workspace");
  const stackedFilters = window.matchMedia("(max-width:850px)");
  const defaultFilterWidth = 280;
  const minFilterWidth = 240;
  const maxFilterWidth = 440;
  let filterWidth = defaultFilterWidth;
  let filterDrag = null;
  try {
    const stored = Number(localStorage.getItem(filterWidthKey));
    if (Number.isFinite(stored) && stored > 0) filterWidth = Math.max(minFilterWidth, Math.min(maxFilterWidth, stored));
  } catch (_) { /* Layout remains usable when browser storage is unavailable. */ }

  function saveFilterWidth() {
    try { localStorage.setItem(filterWidthKey, String(filterWidth)); } catch (_) {}
  }

  function arrangeFilters() {
    if (root.hidden || stackedFilters.matches) return;
    const previewWidth = byId("Preview").hidden ? 0 : byId("Preview").getBoundingClientRect().width;
    const max = Math.max(minFilterWidth, Math.min(maxFilterWidth, Math.floor(workspace.clientWidth - previewWidth - 328)));
    // Constrain the visible panel without overwriting the user's preferred width.
    const width = Math.min(filterWidth, max);
    workspace.style.setProperty("--mpcf-filter-width", width + "px");
    filterResize.setAttribute("aria-valuemax", String(max));
    filterResize.setAttribute("aria-valuenow", String(width));
    filterResize.setAttribute("aria-valuetext", width + " pixels");
  }

  function resizeFilters(width) {
    filterWidth = Math.max(minFilterWidth, Math.min(Number(filterResize.getAttribute("aria-valuemax")), Math.round(width)));
    arrangeFilters();
  }

  function finishFilterResize(cancel = false) {
    if (!filterDrag) return;
    const drag = filterDrag;
    filterDrag = null;
    if (cancel) { filterWidth = drag.previous; arrangeFilters(); }
    else saveFilterWidth();
    workspace.classList.remove("is-resizing-filters");
    if (filterResize.hasPointerCapture(drag.id)) filterResize.releasePointerCapture(drag.id);
  }

  filterResize.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.isPrimary || stackedFilters.matches || busy) return;
    event.preventDefault();
    filterDrag = {id:event.pointerId, x:event.clientX, width:byId("Filters").getBoundingClientRect().width, previous:filterWidth};
    filterResize.focus({preventScroll:true});
    filterResize.setPointerCapture(event.pointerId);
    workspace.classList.add("is-resizing-filters");
  });
  filterResize.addEventListener("pointermove", event => {
    if (filterDrag?.id === event.pointerId) resizeFilters(filterDrag.width + event.clientX - filterDrag.x);
  });
  filterResize.addEventListener("pointerup", () => finishFilterResize());
  filterResize.addEventListener("pointercancel", () => finishFilterResize(true));
  filterResize.addEventListener("lostpointercapture", () => finishFilterResize());
  filterResize.addEventListener("keydown", event => {
    if (busy || !["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const current = Number(filterResize.getAttribute("aria-valuenow"));
    resizeFilters(event.key === "Home" ? minFilterWidth : event.key === "End" ? maxFilterWidth : current + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 40 : 10));
    saveFilterWidth();
  });
  filterResize.addEventListener("dblclick", () => {
    if (busy) return;
    filterWidth = defaultFilterWidth; arrangeFilters(); saveFilterWidth();
  });
  const filterLayoutObserver = new ResizeObserver(arrangeFilters);
  filterLayoutObserver.observe(workspace);
  filterLayoutObserver.observe(byId("Preview"));
  window.addEventListener("resize", () => { finishFilterResize(true); arrangeFilters(); });

  function artworkName(card) {
    const name = String(card.name || "");
    const prefix = name.slice(0, resultQuery.length);
    const suffix = name.slice(resultQuery.length).trim();
    if (resultQuery && prefix.toLocaleLowerCase() === resultQuery.toLocaleLowerCase() && /^[({\[]/.test(suffix)) {
      return {title: prefix, variant: suffix.replace(/^[({\[]|[)}\]]$/g, "")};
    }
    return {title: name, variant: ""};
  }

  function message(text, error = false) {
    const el = byId("Message");
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle("is-error", error);
    el.setAttribute("role", error ? "alert" : "status");
  }

  async function api(path, options = {}) {
    const response = await fetch(base + path, {
      ...options, headers: {"Accept":"application/json", ...(options.body ? {"Content-Type":"application/json"} : {}), ...options.headers},
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "MPCFill could not complete this request.");
    return result;
  }

  function setBusy(value) {
    busy = value;
    root.setAttribute("aria-busy", String(value));
    root.querySelectorAll("button,input,select").forEach(el => {el.disabled = value;});
    if (!value) {
      byId("Apply").disabled = !selected;
      renderPages(filteredCards().length);
    }
  }

  function filteredCards() {
    const text = byId("ArtworkFilter").value.toLocaleLowerCase().trim();
    const dpi = Number(byId("Dpi").value);
    const language = byId("Language").value;
    const tag = byId("Tag").value;
    const result = cards.filter(card => (!selectedCreators.size || selectedCreators.has(String(card.sourceId))) &&
      (!byId("ExcludeAi").checked || !card.isAiArt) &&
      (!byId("FavoritesOnly").checked || favorites.has(String(card.sourceId))) &&
      Number(card.dpi) >= dpi && (!language || card.language === language) &&
      (!tag || tagsFor(card).includes(tag)) && (tab !== "saved" || saved.has(card.key)) &&
      (!text || [card.name, card.sourceName, ...tagsFor(card)].join(" ").toLocaleLowerCase().includes(text)));
    const sort = byId("Sort").value;
    if (sort === "dpi") result.sort((a,b) => Number(b.dpi)-Number(a.dpi));
    if (sort === "size") result.sort((a,b) => Number(a.size)-Number(b.size));
    if (sort === "creator") result.sort((a,b) => String(a.sourceName).localeCompare(String(b.sourceName)));
    if (sort === "newest") result.sort((a,b) => dateValue(b.dateCreated)-dateValue(a.dateCreated));
    return result;
  }

  function renderPages(total) {
    const pages = Math.max(1, Math.ceil(total / pageSize()));
    page = Math.min(Math.max(page, 1), pages);
    const start = (page-1)*pageSize();
    byId("PageSummary").textContent = total ? `${start+1}–${Math.min(start+pageSize(), total)} of ${total} images` : "0 images";
    const numbers = [...new Set([1,page-1,page,page+1,pages])].filter(p=>p>0&&p<=pages).sort((a,b)=>a-b);
    byId("Pages").innerHTML = `<button type="button" class="mpcf-icon" data-mpcf-page="${page-1}" aria-label="Previous page" ${page===1||busy?"disabled":""}>${icon("chevron-left")}</button>` +
      numbers.map((p,i)=>`${i&&p-numbers[i-1]>1?'<span aria-hidden="true">…</span>':''}<button type="button" class="mpcf-icon" data-mpcf-page="${p}" aria-label="Page ${p}" aria-pressed="${p===page}" ${busy?"disabled":""}>${p}</button>`).join("") +
      `<button type="button" class="mpcf-icon" data-mpcf-page="${page+1}" aria-label="Next page" ${page===pages||busy?"disabled":""}>${icon("chevron-right")}</button>`;
  }

  function render() {
    const filtered = filteredCards();
    if (selected && !filtered.some(card=>card.key===selected.key)) {
      selected = null;
      byId("Preview").hidden = true;
    }
    renderPages(filtered.length);
    const creators = new Set(filtered.map(card=>card.sourceId)).size;
    byId("ResultCount").textContent = `${filtered.length} images · ${creators} ${creators===1?"creator":"creators"}`;
    byId("Total").textContent = cards.length;
    byId("SavedCount").textContent = cards.filter(card=>saved.has(card.key)).length;
    root.querySelectorAll("[data-mpcf-tab]").forEach(el=>el.setAttribute("aria-pressed", String(el.dataset.mpcfTab===tab)));
    const gallery = byId("Gallery");
    const start = (page-1)*pageSize();
    gallery.innerHTML = filtered.slice(start,start+pageSize()).map(card=>{const name=artworkName(card);return `<article class="mpcf-artwork">
      <button type="button" class="mpcf-artwork-choice" data-mpcf-select="${card.key}" aria-pressed="${selected?.key===card.key}" aria-label="Preview ${escape(card.name)}, ${escape(card.sourceName)}, ${Number(card.dpi)||0} DPI">
        <img src="${imageUrl(card.key)}" alt="${escape(card.name)}" loading="lazy" decoding="async"><span class="mpcf-image-error" hidden>${icon("image")}Preview unavailable<span>Click to retry</span></span>
      </button><button type="button" class="mpcf-bookmark" data-mpcf-save="${card.key}" aria-pressed="${saved.has(card.key)}" aria-label="${saved.has(card.key)?"Unsave":"Save"} ${escape(card.name)}"><i class="fa-${saved.has(card.key)?"solid":"regular"} fa-bookmark" aria-hidden="true"></i></button>
      <div class="mpcf-artwork-name" title="${escape(card.name)}">${escape(name.title)}</div>${name.variant?`<div class="mpcf-artwork-variant" title="${escape(name.variant)}">${escape(name.variant)}</div>`:""}<div class="mpcf-artwork-meta"><span title="${escape(card.sourceName)}">${escape(card.sourceName)}</span><b>${Number(card.dpi)||0} DPI</b></div></article>`;}).join("");
    if (!filtered.length) gallery.innerHTML = `<div class="mpcf-empty"><strong>${tab==="saved"?"No saved artwork matches":"No artwork matches"}</strong><span>${cards.length?"Adjust your filters or reset them to see all results.":"Try another card name, card type, or broader name matching."}</span></div>`;
    gallery.querySelectorAll("img").forEach(img=>{
      img.addEventListener("error",()=>{img.hidden=true;img.nextElementSibling.hidden=false;});
    });
    byId("Apply").disabled = !selected || busy;
  }

  function renderCreators() {
    const creators = new Map();
    cards.forEach(card=>{const key=String(card.sourceId);const item=creators.get(key)||{name:card.sourceName||"Unknown creator",count:0};item.count++;creators.set(key,item);});
    const find = byId("CreatorSearch").value.toLocaleLowerCase();
    byId("Creators").innerHTML = [...creators.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name))
      .filter(([,item])=>item.name.toLocaleLowerCase().includes(find))
      .map(([key,item])=>`<div class="mpcf-creator-row"><label class="mpcf-check"><input type="checkbox" data-mpcf-creator="${escape(key)}" ${selectedCreators.has(key)?"checked":""}><span>${escape(item.name)}</span><small>${item.count}</small></label><button type="button" class="mpcf-icon mpcf-favorite" data-mpcf-favorite="${escape(key)}" aria-pressed="${favorites.has(key)}" aria-label="${favorites.has(key)?'Unfavorite':'Favorite'} ${escape(item.name)}" title="${favorites.has(key)?'Remove favorite':'Favorite creator'}"><i class="fa-${favorites.has(key)?'solid':'regular'} fa-star" aria-hidden="true"></i></button></div>`).join("");
  }

  function renderMetadata() {
    const previousLanguage = byId("Language").value;
    const previousTag = byId("Tag").value;
    const languages = [...new Set(cards.map(card=>card.language).filter(Boolean))].sort();
    byId("Language").innerHTML = '<option value="">All languages</option>' + languages.map(code=>`<option value="${escape(code)}">${escape(languageNames.get(code)||code)}</option>`).join("");
    const tags = [...new Set(cards.flatMap(tagsFor))].sort();
    byId("Tag").innerHTML = '<option value="">All tags</option>' + tags.map(tag=>`<option value="${escape(tag)}">${escape(tag)}</option>`).join("");
    if(languages.includes(previousLanguage)) byId("Language").value=previousLanguage;
    if(tags.includes(previousTag)) byId("Tag").value=previousTag;
    renderCreators();
  }

  async function search(refresh = false) {
    const query = byId("Query").value.trim();
    if (!query || busy) return;
    const version = ++searchVersion;
    searchAbort?.abort();
    searchAbort = new AbortController();
    selected = null;
    cards = [];
    render();
    byId("Gallery").innerHTML = '<div class="mpcf-empty"><strong>Searching MPCFill…</strong>Loading the catalogue and your cached results.</div>';
    byId("Preview").hidden = true;
    byId("Apply").disabled = true;
    message("Searching MPCFill…");
    byId("SearchButton").textContent = "Searching…";
    try {
      const result = await api("/search", {method:"POST", signal:searchAbort.signal,
        body:JSON.stringify({query,card_type:byId("CardType").value,fuzzy:byId("Fuzzy").checked,refresh})});
      if (version !== searchVersion || root.hidden) return;
      cards = result.cards;
      resultQuery = query;
      saved = new Set(result.saved || []);
      favorites = new Set((result.favorites || []).map(item=>String(item.id)));
      languageNames = new Map((result.languages||[]).map(item=>[item.code,item.name]));
      selectedCreators.clear();
      page = 1;
      renderMetadata();
      render();
      byId("GalleryScroll").scrollTop = 0;
      message(result.stale ? "MPCFill is unavailable. Showing the last locally cached results; previously viewed images remain available." : "");
    } catch (error) {
      if (version !== searchVersion || root.hidden || error.name === "AbortError") return;
      renderMetadata();
      render();
      message(error.message || "MPCFill could not be reached.", true);
    } finally {
      if (version === searchVersion) byId("SearchButton").textContent = "Search";
    }
  }

  function preview(card) {
    selected = card;
    byId("PreviewImage").src = imageUrl(card.key);
    byId("PreviewImage").alt = card.name;
    byId("PreviewName").textContent = card.name;
    byId("PreviewCreator").textContent = card.sourceName;
    byId("PreviewDpi").textContent = `${Number(card.dpi)||0} DPI`;
    byId("PreviewSize").textContent = `${String(card.extension||"").toUpperCase()} · ${megabytes(card.size)}`;
    byId("PreviewLanguage").textContent = languageNames.get(card.language)||card.language||"Unknown";
    byId("PreviewTags").innerHTML = tagsFor(card).map(tag=>`<span>${escape(tag)}</span>`).join("");
    byId("SourceLink").href = "https://drive.google.com/file/d/" + encodeURIComponent(card.identifier) + "/view";
    byId("Preview").hidden = false;
    root.querySelectorAll("[data-mpcf-select]").forEach(el=>el.setAttribute("aria-pressed",String(el.dataset.mpcfSelect===card.key)));
    byId("Apply").disabled = false;
  }

  function close() {
    if (busy) return;
    finishFilterResize();
    searchVersion++;
    searchAbort?.abort();
    byId("Zoom").hidden = true;
    root.hidden = true;
    if (context?.parent) context.parent.inert = false;
    document.body.style.overflow = previousBodyOverflow;
    context?.returnFocus?.focus();
  }

  function resetFilters() {
    selectedCreators.clear();
    ["CreatorSearch","ArtworkFilter"].forEach(id=>byId(id).value="");
    byId("Dpi").value="0";byId("Language").value="";byId("Tag").value="";
    byId("ExcludeAi").checked=false;byId("FavoritesOnly").checked=false;
    tab="all";page=1;renderCreators();render();
  }

  function updateCardSize() {
    const size = window.DeckadenceCardSizes.normalize(byId("Size").value);
    const gallery = byId("Gallery");
    gallery.classList.toggle("is-auto", size === "auto");
    gallery.style.setProperty("--mpcf-card-width", (size === "auto" ? 230 : window.DeckadenceCardSizes.pixels(size)) + "px");
  }

  window.DeckadenceMpcFill = {
    isOpen: () => !root.hidden,
    open: options => {
      if (busy) return;
      context = options;
      cards=[];selected=null;selectedCreators.clear();tab="all";page=1;
      byId("CardName").textContent=options.cardName;
      byId("Query").value=options.faces.length>1
        ? (options.cardName.split(" // ")[options.face==="back"?1:0]||options.cardName)
        : options.cardName;
      byId("CardType").value=options.cardType||"CARD";
      byId("Scope").textContent=options.scope;
      byId("Face").innerHTML=options.faces.map(face=>`<option value="${escape(face.value)}">${escape(face.label)}</option>`).join("");
      byId("Face").value=options.face;
      byId("FaceLabel").hidden=options.faces.length<2;
      byId("Preview").hidden=true;byId("Zoom").hidden=true;
      byId("Filters").hidden=window.matchMedia("(max-width:850px)").matches;
      root.querySelector('[data-mpcf-action="filters"]').setAttribute("aria-expanded",String(!byId("Filters").hidden));
      previousBodyOverflow=document.body.style.overflow;
      document.body.style.overflow="hidden";
      root.hidden=false;options.parent.inert=true;
      arrangeFilters();
      updateCardSize();resetFilters();byId("Query").focus();search();
    },
  };

  byId("SearchForm").addEventListener("submit",event=>{event.preventDefault();search();});
  byId("CreatorSearch").addEventListener("input",renderCreators);
  byId("Size").addEventListener("change",updateCardSize);
  byId("PerPage").addEventListener("change",()=>{
    const first = (page-1)*pageSize();
    resultsPerPage = Number(byId("PerPage").value);
    page = Math.floor(first/pageSize())+1;
    render();byId("GalleryScroll").scrollTop=0;
  });
  byId("ArtworkFilter").addEventListener("input",()=>{page=1;render();});
  ["Dpi","Language","Tag","Sort","ExcludeAi","FavoritesOnly"].forEach(id=>byId(id).addEventListener("change",()=>{page=1;render();byId("GalleryScroll").scrollTop=0;}));
  document.addEventListener("deckadence:mpcfill-favorites",event=>{
    favorites=new Set(event.detail.map(item=>String(item.id)));renderCreators();render();
  });
  byId("Face").addEventListener("change",()=>{
    const faces=context.cardName.split(" // ");
    if(faces.length>1){byId("Query").value=faces[byId("Face").value==="back"?1:0];search();}
  });
  byId("Creators").addEventListener("change",event=>{
    const key=event.target.dataset.mpcfCreator;
    if(!key)return;
    if(event.target.checked)selectedCreators.add(key);else selectedCreators.delete(key);
    page=1;render();
  });

  root.addEventListener("click",async event=>{
    const button=event.target.closest("button,[data-mpcf-action]");
    if(!button||button.disabled||busy)return;
    if(button.dataset.mpcfFavorite){
      const id=button.dataset.mpcfFavorite;button.disabled=true;
      try{const result=await api("/favorites",{method:"POST",body:JSON.stringify({id,favorite:!favorites.has(id)})});
        document.dispatchEvent(new CustomEvent("deckadence:mpcfill-favorites",{detail:result.favorites}));}
      catch(error){message(error.message,true);}finally{button.disabled=false;}
      return;
    }
    if(button.dataset.mpcfSelect){
      const card=cards.find(card=>card.key===button.dataset.mpcfSelect);
      if(!card)return;
      const img=button.querySelector("img");
      if(img?.hidden){img.hidden=false;img.nextElementSibling.hidden=true;img.src=imageUrl(card.key)+"?retry="+Date.now();}
      preview(card);return;
    }
    if(button.dataset.mpcfSave){
      const key=button.dataset.mpcfSave;
      button.disabled=true;
      const version=searchVersion;
      try{const result=await api("/saved",{method:"POST",body:JSON.stringify({key,saved:!saved.has(key)})});if(version===searchVersion&&!root.hidden){saved=new Set(result.saved);render();}}
      catch(error){if(version===searchVersion&&!root.hidden)message(error.message,true);}
      finally{button.disabled=false;}
      return;
    }
    if(button.dataset.mpcfPage){page=Number(button.dataset.mpcfPage);render();byId("GalleryScroll").scrollTop=0;return;}
    if(button.dataset.mpcfTab){tab=button.dataset.mpcfTab;page=1;render();return;}
    const action=button.dataset.mpcfAction;
    if(action==="close")close();
    if(action==="maximize"){
      const maximized=root.classList.toggle("is-maximized");
      byId("MaximizeLabel").textContent=maximized?"Restore":"Maximize";
      button.setAttribute("aria-pressed",String(maximized));
      button.setAttribute("aria-label",(maximized?"Restore":"Maximize")+" MPCFill browser");
      button.title=maximized?"Restore":"Maximize";
    }
    if(action==="filters"){finishFilterResize();byId("Filters").hidden=!byId("Filters").hidden;button.setAttribute("aria-expanded",String(!byId("Filters").hidden));arrangeFilters();}
    if(action==="reset")resetFilters();
    if(action==="refresh")search(true);
    if(action==="hide-preview")byId("Preview").hidden=true;
    if(action==="zoom"&&selected){byId("ZoomImage").src=imageUrl(selected.key);byId("Zoom").hidden=false;byId("Zoom").querySelector("button").focus();}
    if(action==="unzoom"){byId("Zoom").hidden=true;root.querySelector('[data-mpcf-action="zoom"]').focus();}
  });

  byId("Apply").addEventListener("click",async()=>{
    if(!selected||busy)return;
    const card=selected;
    const applyContext=context;
    const face=byId("Face").value;
    setBusy(true);
    message("Downloading the original image to Deckadence…");
    byId("Apply").innerHTML=icon("spinner fa-spin")+" Downloading…";
    try{
      await api("/images/"+encodeURIComponent(card.key)+"/prepare",{method:"POST"});
      message("Adding alternate image with MPC full bleed…");
      await applyContext.apply(card.key,face);
      setBusy(false);close();
    }catch(error){message(error.message||"The image could not be applied.",true);}
    finally{setBusy(false);byId("Apply").innerHTML=icon("download")+" Use this image";}
  });

  document.addEventListener("keydown",event=>{
    if(root.hidden||event.key!=="Escape")return;
    event.stopImmediatePropagation();event.preventDefault();
    if(filterDrag){finishFilterResize(true);return;}
    if(busy)return;
    if(!byId("Zoom").hidden){byId("Zoom").hidden=true;root.querySelector('[data-mpcf-action="zoom"]').focus();}
    else if(!byId("Preview").hidden)byId("Preview").hidden=true;
    else close();
  },true);
})();
