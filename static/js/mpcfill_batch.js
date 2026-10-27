// Review each choice before downloading; apply sequentially through the scoped image editor.
(function () {
  const root = document.getElementById("mpcfillBatch");
  if (!root) return;
  const el = id => document.getElementById("mpcb" + id);
  const base = "/plugins/mpcfill-browser";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  let options = {creators:[], tags:[], languages:[], favorites:[]};
  let selectedTags = new Set(), selectedCreators = new Set();
  let uuids = [], rows = [], owner = {}, scope = null, busy = false, stopping = false;
  let returnFocus = null, previousOverflow = "", inertElements = [], generation = 0, onComplete = null, zoomOpener = null;
  let favoritePending = false;
  let reviewPage = 1;
  const reviewPageSize = 24;

  async function api(path, data) {
    const response = await fetch(base + path, {method:data ? "POST" : "GET",
      headers:{"Accept":"application/json", ...(data ? {"Content-Type":"application/json"} : {})},
      ...(data ? {body:JSON.stringify(data)} : {})});
    const result = await response.json();
    if (!response.ok || !result.ok) {
      const error = new Error(result.message || "MPCFill could not complete this request.");
      error.status=response.status;throw error;
    }
    return result;
  }
  function message(text, error = false) {
    el("Progress").textContent = text;
    el("Progress").classList.toggle("is-error", error);
  }
  function favorites() { return new Set(options.favorites.map(item=>String(item.id))); }
  function criteria() {
    return {exclude_ai:el("ExcludeAi").checked, target_dpi:el("Dpi").value,
      language:el("Language").value, faces:el("Faces").value,
      prioritize_favorites:el("PrioritizeFavorites").checked, preferred_creator:el("PreferredCreator").value,
      only_creators:el("OnlyCreators").checked, creators:[...selectedCreators], tags:[...selectedTags],
      strict:el("Strict").checked, replace_existing:el("Replace").checked};
  }
  function invalidate() {
    renderSummary();
    if (busy || !rows.length) return;
    rows=[];reviewPage=1;renderResults();message("Criteria changed. Find best matches again to refresh the review.");
  }
  function renderSummary() {
    const value=criteria();
    const labels=[value.target_dpi==="highest"?"Highest DPI":value.target_dpi+" DPI",value.strict?"All criteria required":"Fallbacks allowed"];
    if(value.exclude_ai)labels.push("Exclude AI art");
    if(value.language)labels.push(options.languages.find(item=>item.code===value.language)?.name||value.language);
    if(value.prioritize_favorites)labels.push("Favorite creators first");
    if(value.preferred_creator)labels.push(options.favorites.find(item=>item.id===value.preferred_creator)?.name||"Specific favorite");
    if(value.only_creators)labels.push(`${value.creators.length} allowed creators`);
    if(value.faces!=="both")labels.push(value.faces==="front"?"Front only":"Back only");
    labels.push(...value.tags);
    el("CriteriaSummary").innerHTML=labels.map(text=>`<span>${escape(text)}</span>`).join("");
  }
  function renderCreators() {
    const favored = favorites();
    const query = el("CreatorSearch").value.toLocaleLowerCase();
    el("Creators").innerHTML = [...options.creators].sort((a,b)=>Number(favored.has(b.id))-Number(favored.has(a.id)) || a.name.localeCompare(b.name))
      .filter(item=>item.name.toLocaleLowerCase().includes(query))
      .map(item=>`<div class="mpcf-creator-row"><label class="mpcf-check"><input type="checkbox" data-mpcb-creator="${escape(item.id)}" ${selectedCreators.has(item.id)?"checked":""} ${el("OnlyCreators").checked?"":"disabled"}><span>${escape(item.name)}</span></label><button type="button" class="mpcf-icon mpcf-favorite" data-mpcb-favorite="${escape(item.id)}" aria-pressed="${favored.has(item.id)}" aria-label="${favored.has(item.id)?"Unfavorite":"Favorite"} ${escape(item.name)}"><i class="fa-${favored.has(item.id)?"solid":"regular"} fa-star" aria-hidden="true"></i></button></div>`).join("") || '<p class="mpcb-help">No creators match.</p>';
    el("CreatorCount").textContent = `${favored.size} favorite${favored.size===1?"":"s"} · ${selectedCreators.size} allowed creator${selectedCreators.size===1?"":"s"} selected`;
    const previous = el("PreferredCreator").value;
    el("PreferredCreator").innerHTML = '<option value="">No specific creator</option>' + options.favorites.map(item=>`<option value="${escape(item.id)}">${escape(item.name)}</option>`).join("");
    if (favored.has(previous)) el("PreferredCreator").value=previous;
    el("PrioritizeFavorites").disabled=!favored.size;
    if (!favored.size) el("PrioritizeFavorites").checked=false;
    el("PreferredCreator").disabled=!favored.size;
  }
  function renderTags() {
    const query=el("TagSearch").value.toLocaleLowerCase();
    el("Tags").innerHTML=options.tags.filter(tag=>tag.toLocaleLowerCase().includes(query)).map(tag=>`<label class="mpcf-check"><input type="checkbox" data-mpcb-tag="${escape(tag)}" ${selectedTags.has(tag)?"checked":""}><span>${escape(tag)}</span></label>`).join("") || '<p class="mpcb-help">No tags match.</p>';
    el("TagCount").textContent=selectedTags.size ? `(${selectedTags.size} selected)` : "";
  }
  function renderResults() {
    const ready = rows.filter(row=>row.status==="ready");
    const selected = ready.filter(row=>row.selected);
    const applied = rows.filter(row=>row.status==="applied").length;
    const skipped = rows.filter(row=>row.status==="skipped").length;
    const errors = rows.filter(row=>row.status==="error").length;
    el("Counts").textContent=rows.length ? `${selected.length} selected · ${applied} applied · ${skipped} skipped${errors?` · ${errors} failed`:""}` : "";
    el("SelectAllLabel").hidden=!ready.length;
    el("SelectAll").disabled=busy;
    el("SelectAll").checked=!!ready.length && ready.length===selected.length;
    el("SelectAll").indeterminate=selected.length>0 && selected.length<ready.length;
    el("Apply").disabled=busy || favoritePending || !selected.length;
    el("Apply").textContent=selected.length ? `Download & apply (${selected.length})` : "Download & apply";
    const pageCount=Math.max(1,Math.ceil(rows.length/reviewPageSize));
    reviewPage=Math.min(reviewPage,pageCount);
    const start=(reviewPage-1)*reviewPageSize;
    el("Pages").hidden=pageCount<2;
    el("PageSummary").textContent=`${start+1}–${Math.min(start+reviewPageSize,rows.length)} of ${rows.length}`;
    el("PreviousPage").disabled=reviewPage===1;
    el("NextPage").disabled=reviewPage===pageCount;
    el("Results").innerHTML=rows.slice(start,start+reviewPageSize).map((row,offset)=>{
      const index=start+offset;
      const card=row.artwork;
      return `<article class="mpcb-result is-${row.status}${row.fallback?" is-fallback":""}">
        ${card?`<input type="checkbox" data-mpcb-row="${index}" aria-label="Apply artwork to ${escape(row.name)}" ${row.selected?"checked":""} ${busy||row.status!=="ready"?"disabled":""}><button type="button" class="mpcb-artwork-preview" data-mpcb-preview="${index}" aria-label="Enlarge ${escape(row.name)} artwork" ${busy?"disabled":""}><img src="${base}/images/${encodeURIComponent(card.key)}/preview" alt="${escape(card.name)}" loading="lazy"></button>`:""}
        <div><h4>${escape(row.name)}${row.face!=="single"?` · ${escape(row.face)}`:""}</h4>${card?`<p>${escape(card.sourceName)} · <strong>${Number(card.dpi)||0} DPI</strong></p><p class="mpcb-artwork-name">${escape(card.name)}</p>`:""}<p class="mpcb-status">${row.fallback&&row.status==="ready"?"Fallback · ":""}${escape(row.message)}${row.stale?" · Cached catalogue":""}</p>${row.status==="error"&&row.ticket?`<button type="button" class="mpcf-text-button" data-mpcb-retry="${index}" ${busy?"disabled":""}>Retry this download</button>`:""}</div></article>`;
    }).join("") || '<div class="mpcb-empty"><i class="fa-regular fa-images" aria-hidden="true"></i><strong>Your best matches will appear here</strong><span>Review artwork and fallback choices before downloading originals.</span></div>';
  }
  function setBusy(value) {
    busy=value;root.setAttribute("aria-busy",String(value));el("Fields").disabled=value;
    el("Find").disabled=value || !scope || favoritePending;
    el("Stop").hidden=!value;el("Stop").disabled=false;
    root.querySelectorAll("button[data-mpcb-close]").forEach(button=>button.disabled=value);
    renderResults();
  }
  function stop() {
    if (!busy) return;
    stopping=true;el("Stop").disabled=true;message("Stopping after the current card finishes. Completed downloads and changes will be kept.");
  }
  function close() {
    if(busy){stop();return;}
    generation++;root.hidden=true;el("Zoom").hidden=true;
    document.body.style.overflow=previousOverflow;
    inertElements.forEach(([node,value])=>node.inert=value);inertElements=[];
    returnFocus?.focus();
  }
  function isolateDialog() {
    inertElements=[];
    for(let node=root;node.parentElement;node=node.parentElement){
      [...node.parentElement.children].filter(sibling=>sibling!==node && !["SCRIPT","LINK","STYLE"].includes(sibling.tagName)).forEach(sibling=>{
        inertElements.push([sibling,sibling.inert]);sibling.inert=true;
      });
      if(node.parentElement===document.body)break;
    }
  }
  async function open(cardUuids, settings={}) {
    if(busy || !root.hidden)return;
    uuids=[...new Set(cardUuids.map(String).filter(Boolean))];
    if(!uuids.length){window.alert("Select at least one card first.");return;}
    if(uuids.length>5000){window.alert("Select up to 5,000 distinct cards per batch.");return;}
    returnFocus=document.activeElement;onComplete=settings.onComplete||null;
    const imageOwner=document.getElementById("alternateImageOverlay");
    owner=settings.owner || {kind:imageOwner?.dataset.imageOwnerKind||"",id:imageOwner?.dataset.imageOwnerId||""};
    rows=[];scope=null;stopping=false;reviewPage=1;el("ProgressBar").hidden=true;
    el("Subtitle").textContent=`${settings.sourceLabel||"Selected cards"} · ${uuids.length} distinct card${uuids.length===1?"":"s"}`;
    el("Scope").textContent="Checking image library…";
    previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    root.hidden=false;isolateDialog();root.querySelector("section").focus();
    const version=++generation;setBusy(true);el("Stop").hidden=true;message("Loading creators, tags and image settings…");
    try{
      const [metadata,context]=await Promise.all([api("/options"),api("/batch/context",{owner})]);
      if(version!==generation)return;
      options=metadata;scope=context.scope;
      el("Scope").textContent=scope.token==="global"?"Shared image library":"This collection only";
      el("Language").innerHTML='<option value="">All languages</option>'+options.languages.map(item=>`<option value="${escape(item.code)}">${escape(item.name)}</option>`).join("");
      selectedCreators=new Set([...selectedCreators].filter(id=>options.creators.some(item=>item.id===id)));
      selectedTags=new Set([...selectedTags].filter(tag=>options.tags.includes(tag)));
      renderCreators();renderTags();
      if(!root.dataset.initialized){el("PrioritizeFavorites").checked=!!options.favorites.length;root.dataset.initialized="true";}
      renderSummary();
      message(metadata.stale?"Using cached creator and tag metadata. Choose criteria, then find matches.":"Choose criteria, then find matches. Originals download only after you apply your reviewed selection.");
    }catch(error){message(error.message,true);}
    finally{setBusy(false);}
  }
  el("Find").addEventListener("click",async()=>{
    if(busy||!scope||favoritePending)return;
    const chosen=criteria();
    if(chosen.only_creators&&!chosen.creators.length){message("Select at least one allowed creator.",true);return;}
    rows=[];stopping=false;reviewPage=1;setBusy(true);el("ProgressBar").hidden=false;el("ProgressBar").max=uuids.length;el("ProgressBar").value=0;
    if(window.matchMedia("(max-width:700px)").matches)el("Progress").scrollIntoView({block:"start",behavior:"smooth"});
    let examined=0, failures=0;
    try{
      for(const uuid of uuids){
        if(stopping)break;
        message(`Finding best matches · ${examined+1} of ${uuids.length} cards…`);
        try{
          const result=await api("/batch/match",{card_uuid:uuid,criteria:chosen,owner,scope});
          rows.push(...result.rows.map(row=>({...row,selected:row.status==="ready"})));
          failures=0;
        }catch(error){rows.push({card_uuid:uuid,name:uuid,face:"single",status:"error",message:error.message});
          failures++;if(error.status===409 || error.status===503 || failures>=3)stopping=true;
        }
        examined++;el("ProgressBar").value=examined;renderResults();
      }
      message(`${stopping?"Stopped":"Review ready"} · ${examined} of ${uuids.length} cards searched. ${rows.filter(row=>row.fallback).length} fallback choice(s). Uncheck any artwork you do not want.`);
    }finally{setBusy(false);}
  });
  el("Apply").addEventListener("click",async()=>{
    if(busy||favoritePending)return;
    const selected=rows.filter(row=>row.status==="ready"&&row.selected);
    if(!selected.length)return;
    stopping=false;setBusy(true);el("ProgressBar").max=selected.length;el("ProgressBar").value=0;el("ProgressBar").hidden=false;
    let applied=0, failed=0, consecutiveFailures=0;
    try{
      for(const row of selected){
        if(stopping)break;
        message(`Downloading & applying ${row.name} · ${applied+failed+1} of ${selected.length}…`);
        try{
          const result=await api("/batch/apply",{ticket:row.ticket});
          row.status="applied";row.selected=false;row.message=result.already_applied?"Already applied · MPC bleed enabled":"Applied · MPC bleed enabled";applied++;
          consecutiveFailures=0;
          try{window.iMomirAlternateImage?.refreshFromPayload?.(row.card_uuid,result);}
          catch(error){row.message+=" · Reload the page to refresh its preview.";}
        }catch(error){row.status="error";row.message=error.message;row.selected=false;failed++;
          consecutiveFailures++;if(consecutiveFailures>=3)stopping=true;
        }
        el("ProgressBar").value=applied+failed;renderResults();
      }
      message(`${stopping?"Stopped":"Finished"} · ${applied} applied, ${failed} failed, ${selected.length-applied-failed} remaining. Completed artwork is saved.`,failed>0);
      if(applied&&onComplete){try{await onComplete();}catch(error){message(`Artwork saved. The page could not refresh: ${error.message}`,true);}}
    }finally{setBusy(false);}
  });
  el("Form").addEventListener("submit",event=>event.preventDefault());
  el("Form").addEventListener("change",event=>{
    if(busy)return;
    const creator=event.target.dataset.mpcbCreator,tag=event.target.dataset.mpcbTag;
    if(creator){event.target.checked?selectedCreators.add(creator):selectedCreators.delete(creator);renderCreators();}
    if(tag){event.target.checked?selectedTags.add(tag):selectedTags.delete(tag);renderTags();}
    if(event.target===el("OnlyCreators"))renderCreators();
    invalidate();
  });
  el("CreatorSearch").addEventListener("input",renderCreators);
  el("TagSearch").addEventListener("input",renderTags);
  root.addEventListener("click",async event=>{
    if(event.target.closest("[data-mpcb-close]")){close();return;}
    const button=event.target.closest("button");if(!button||button.disabled||busy)return;
    const id=button.dataset.mpcbFavorite;
    if(id){
      if(favoritePending)return;
      favoritePending=true;button.disabled=true;el("Find").disabled=true;el("Apply").disabled=true;
      try{const result=await api("/favorites",{id,favorite:!favorites().has(id)});
        document.dispatchEvent(new CustomEvent("deckadence:mpcfill-favorites",{detail:result.favorites}));}
      catch(error){message(error.message,true);}finally{favoritePending=false;button.disabled=false;el("Find").disabled=busy||!scope;renderResults();}
    }
    if(button.dataset.mpcbRetry!==undefined){const row=rows[Number(button.dataset.mpcbRetry)];row.status="ready";row.selected=true;row.message="Ready to retry";renderResults();}
    if(button.dataset.mpcbPreview!==undefined){
      const card=rows[Number(button.dataset.mpcbPreview)].artwork;zoomOpener=button;
      el("ZoomImage").src=base+"/images/"+encodeURIComponent(card.key)+"/preview";
      el("ZoomImage").alt=card.name;el("ZoomCaption").textContent=`${card.sourceName} · ${card.dpi} DPI · Cached preview`;
      el("Zoom").hidden=false;el("Unzoom").focus();
    }
  });
  el("Results").addEventListener("change",event=>{
    if(busy||event.target.dataset.mpcbRow===undefined)return;
    rows[Number(event.target.dataset.mpcbRow)].selected=event.target.checked;renderResults();
  });
  el("SelectAll").addEventListener("change",()=>{rows.filter(row=>row.status==="ready").forEach(row=>row.selected=el("SelectAll").checked);renderResults();});
  el("Stop").addEventListener("click",stop);
  function movePage(delta){reviewPage+=delta;renderResults();el("Results").closest(".mpcb-review").scrollTop=0;}
  el("PreviousPage").addEventListener("click",()=>movePage(-1));
  el("NextPage").addEventListener("click",()=>movePage(1));
  function unzoom(){el("Zoom").hidden=true;zoomOpener?.focus();}
  el("Unzoom").addEventListener("click",unzoom);
  document.addEventListener("deckadence:mpcfill-favorites",event=>{
    options.favorites=event.detail;if(!root.hidden){renderCreators();invalidate();}
  });
  document.addEventListener("keydown",event=>{
    if(root.hidden)return;
    if(event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();el("Zoom").hidden?close():unzoom();}
    if(event.key==="Tab"){
      const container=el("Zoom").hidden?root:el("Zoom");
      const focusable=[...container.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(node=>node.getClientRects().length&&!node.closest("fieldset:disabled"));
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&(document.activeElement===first||!focusable.includes(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!focusable.includes(document.activeElement))){event.preventDefault();event.stopImmediatePropagation();first?.focus();}
    }
  },true);
  document.querySelector("[data-mpcfill-pack-best]")?.addEventListener("click",()=>{
    open([...document.querySelectorAll(".chaos-pack-view-card[data-card-uuid]")].map(card=>card.dataset.cardUuid),{sourceLabel:"Pack contents"});
  });
  window.DeckadenceMpcFillBatch={open,isOpen:()=>!root.hidden};
})();
