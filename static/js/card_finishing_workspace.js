// Arrange the existing, bound controls into the shared finishing workspace.
// Original inputs own settings; quick duplicates forward edits to those inputs.
window.DeckadenceFinishingWorkspace = {
  setup(dialog) {
    if (dialog.dataset.workspaceReady) return;
    dialog.dataset.workspaceReady = 'true';
    const q = selector => dialog.querySelector(selector);
    const make = (tag, className) => Object.assign(document.createElement(tag), {className});
    const layout = q('.spot-card-layout'), controls = q('.spot-card-controls');
    const panel = q('[data-art-edit-panel]');
    const dock = make('aside', 'studio-quick-dock');
    dock.setAttribute('aria-label', 'Quick painting controls');
    dock.innerHTML = '<h3>Quick controls</h3><p class="spot-card-caption">Always within reach</p>';
    layout.prepend(dock);
    function fieldset(parent, attribute, className) {
      const node = make('fieldset', className); node.setAttribute(attribute, '');
      const legend = document.createElement('legend'); legend.className='art-sr-only'; legend.textContent='Quick controls';
      node.append(legend); parent.append(node); return node;
    }
    const editQuick = fieldset(dock, 'data-art-controls', 'studio-edit-only studio-quick-fields');
    const maskQuick = fieldset(dock, 'data-spot-edit-controls', 'studio-mask-only studio-quick-fields');
    function move(selector, destination) { const node=q(selector); if(node)destination.append(node); return node; }
    // Quick controls are additional views of the originals, never replacements.
    // Only originals retain binding attributes and form names.
    function duplicate(source, destination, key) {
      const copy=source.cloneNode(true), originals=[source,...source.querySelectorAll('*')], copies=[copy,...copy.querySelectorAll('*')];
      for(const node of copies)for(const attr of [...node.attributes])
        if(attr.name.startsWith('data-')||['id','name','for'].includes(attr.name))node.removeAttribute(attr.name);
      copy.dataset.studioDuplicate=key;destination.append(copy);
      const sync=()=>originals.forEach((original,index)=>{
        const target=copies[index];
        const hidden=index===0&&key==='mask-tool_coverage'?false:original.hidden;
        if(target.hidden!==hidden)target.hidden=hidden;
        if(original.matches('input,select,button')){
          if(target.disabled!==original.matches(':disabled'))target.disabled=original.matches(':disabled');
          if(original.matches('input,select')&&target.value!==original.value)target.value=original.value;
          if(original.type==='checkbox')target.checked=original.checked;
          for(const attr of ['aria-pressed','aria-expanded'])if(original.hasAttribute(attr)&&target.getAttribute(attr)!==original.getAttribute(attr))target.setAttribute(attr,original.getAttribute(attr));
        }
        if(original.matches('output,strong,small')&&target.textContent!==original.textContent)target.textContent=original.textContent;
      });
      originals.forEach((original,index)=>{
        const target=copies[index];
        if(original.matches('button'))target.addEventListener('click',()=>{original.click();sync();});
        if(original.matches('input,select'))for(const type of ['input','change'])target.addEventListener(type,()=>{
          original.value=target.value;if(original.type==='checkbox')original.checked=target.checked;
          original.dispatchEvent(new Event(type,{bubbles:true}));sync();
        });
      });
      new MutationObserver(sync).observe(source,{subtree:true,attributes:true,childList:true,characterData:true});
      const owner=source.closest('fieldset');if(owner)new MutationObserver(sync).observe(owner,{attributes:true});
      dialog.addEventListener('input',()=>queueMicrotask(sync));dialog.addEventListener('change',()=>queueMicrotask(sync));
      sync();return copy;
    }
    const paintFields = q('[data-art-task-panel="paint"] [data-art-controls]');
    duplicate(paintFields.querySelector('.art-segment'),editQuick,'edit-tools');
    const colorTitle=document.createElement('p');colorTitle.textContent='Paint color';editQuick.append(colorTitle);
    duplicate(q('.art-active-color'),editQuick,'edit-color');
    duplicate(q('[data-art-size-row]'),editQuick,'edit-size');
    duplicate(q('[data-art-bucket-tolerance-row]'),editQuick,'edit-tolerance');
    const bucketMode=make('label','spot-card-check studio-wand-mode');bucketMode.hidden=true;
    bucketMode.innerHTML='<input type="checkbox" data-art-bucket-contiguous checked> Contiguous';
    bucketMode.title='On: fill connected colors. Off: fill matching colors across the card.';
    q('[data-art-opacity]').closest('.spot-card-fields-grid').after(bucketMode);

    duplicate(q('[data-art-opacity]').closest('label'),editQuick,'edit-opacity');
    duplicate(bucketMode,editQuick,'bucket-contiguous');
    duplicate(q('[data-art-paint-hint]'),editQuick,'edit-hint');
    // Keep the complete finishing toolset together in Touch up. Splitting it
    // between docks made its settings difficult to find and hid contextual UI.
    const shortcuts=make('div','studio-quick-buttons');maskQuick.prepend(shortcuts);
    for(const tool of ['paint','erase'])duplicate(q(`[data-spot-tool="${tool}"]`),shortcuts,`mask-${tool}`);
    for(const name of ['brush_size','tool_coverage'])duplicate(q(`[name="${name}"]`).closest('label'),maskQuick,`mask-${name}`);
    const maskHint=document.createElement('p');maskHint.className='spot-card-caption';maskHint.textContent='Shift: horizontal stroke. Ctrl: vertical stroke.';maskQuick.append(maskHint);
    const brushOptions=make('details','studio-quick-options');brushOptions.innerHTML='<summary>Brush options</summary>';maskQuick.append(brushOptions);
    for(const name of ['brush_shape','brush_softness'])duplicate(q(`[name="${name}"]`).closest('label'),brushOptions,`mask-${name}`);
    duplicate(q('[data-spot-tool="sample"]'),brushOptions,'mask-sample');
    const maskActions=make('div','studio-quick-mask-actions');maskQuick.append(maskActions);
    duplicate(q('[data-spot-select-art]'),maskActions,'mask-art-box');
    duplicate(q('[data-spot-invert]'),maskActions,'mask-invert');
    const brush=q('[data-spot-brush-tools]'),amount=q('[data-spot-tool-amount]');
    const toolSettings=make('div','studio-touch-settings');amount.before(toolSettings);
    toolSettings.append(amount,brush);

    const selectionBar=make('div','studio-selection-bar');selectionBar.setAttribute('aria-label','Selection tools');
    q('.spot-card-mask-transfer').after(selectionBar);
    const editSelect=fieldset(selectionBar,'data-art-controls','studio-edit-only studio-selection-fields');
    const selectFields=q('[data-art-task-panel="select"] [data-art-controls]');
    const selectTools=move('.art-selection-tools',editSelect);
    const paths={rectangle:'<rect x="3" y="4" width="18" height="16" stroke-dasharray="3 2"/>',ellipse:'<ellipse cx="12" cy="12" rx="9" ry="7" stroke-dasharray="3 2"/>',lasso:'<path d="M5 17C-2 6 13 0 20 7s-5 15-12 10c-4-3-1-7 2-4s-1 8-4 9"/>','selection-brush':'<path d="m14 4 6 6-9 9-6 1 1-6zM12 6l6 6M5 20l-2 1"/>',wand:'<path d="m4 20 12-12 3 3L7 23M3 3v4M1 5h4M18 1v4M16 3h4"/>',match:'<path d="M3 17c0-3 4-8 4-8s4 5 4 8a4 4 0 1 1-8 0M13 10c0-3 4-8 4-8s4 5 4 8a4 4 0 1 1-8 0"/>'};
    for(const button of selectTools.querySelectorAll('button')){
      const label=button.textContent;button.title=label;button.setAttribute('aria-label',label);
      button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[button.dataset.artTool]}</svg>`;
    }
    editSelect.append(selectFields.querySelector('.art-segment'));
    for(const button of editSelect.querySelectorAll('[data-art-operation]')){
      const op=button.dataset.artOperation;
      button.title=button.getAttribute('aria-label')||button.textContent.trim();button.setAttribute('aria-label',button.title);
      button.textContent=op==='replace'?'□':op==='add'?'＋':'−';
    }
    q('[data-art-selection-mode]').closest('label').hidden=true;
    editSelect.append(q('[data-art-selection-mode]').closest('label'));
    const selectionOptions=make('details','studio-selection-options');selectionOptions.innerHTML='<summary>Options</summary>';
    const selectionPopover=make('div','studio-selection-popover');selectionOptions.append(selectionPopover);
    while(selectFields.children.length)selectionPopover.append(selectFields.firstElementChild);
    selectionPopover.querySelector('legend')?.remove();selectionPopover.querySelector('.art-next')?.remove();
    selectionPopover.querySelector('[data-art-tool-hint]').hidden=true;
    const clearSelection=duplicate(q('[data-art-deselect]'),editSelect,'selection-clear');
    clearSelection.textContent='Clear';clearSelection.classList.remove('art-quiet');clearSelection.title='Clear selection';clearSelection.setAttribute('aria-label','Clear selection');
    editSelect.append(selectionOptions);
    const maskSelect=fieldset(selectionBar,'data-spot-edit-controls','studio-mask-only studio-selection-fields');
    const selectLabel=document.createElement('span');selectLabel.className='studio-dock-label';selectLabel.textContent='Select';maskSelect.append(selectLabel);
    for(const tool of ['marquee','ellipse','lasso','selection-brush','wand','match']){
      const original=q(`[data-spot-tool="${tool}"]`),button=duplicate(original,maskSelect,`selection-${tool}`);
      button.classList.add('studio-tool-icon');button.title=original.textContent.trim();button.setAttribute('aria-label',button.title);
      button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${paths[tool==='marquee'?'rectangle':tool]}</svg>`;
    }
    duplicate(q('[data-spot-select-all]'),maskSelect,'selection-all');
    duplicate(q('[data-spot-deselect]'),maskSelect,'selection-deselect');
    const maskOptions=make('details','studio-selection-options');maskOptions.innerHTML='<summary>Options</summary>';maskSelect.append(maskOptions);
    const maskPopover=make('div','studio-selection-popover');maskOptions.append(maskPopover);
    duplicate(q('[data-spot-marquee-shape]').closest('label'),maskPopover,'selection-shape');
    for(const name of ['selection_action','tolerance','color_expand','color_smooth'])duplicate(q(`[name="${name}"]`).closest('label'),maskPopover,`selection-${name}`);

    for(const [scope,host] of [['art',editSelect],['spot',maskSelect]]){
      const label=make('label','studio-wand-mode');label.hidden=true;
      const input=document.createElement('input');input.type='checkbox';input.checked=true;input.setAttribute(`data-${scope}-wand-contiguous`,'');
      label.append(input,document.createTextNode('Contiguous'));label.title='On: connected colors. Off: matching colors across the card.';host.append(label);
    }
    const header=make('div','studio-inspector-header');
    header.append(q('.spot-card-layer-switch'));
    const maskDisplay=fieldset(header,'data-spot-edit-controls','studio-mask-only studio-mask-display');
    const colorLabel=q('[name="overlay_color"]').closest('label');maskDisplay.append(colorLabel);
    colorLabel.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE)node.textContent='';});
    const colorCaption=colorLabel.querySelector('span');if(colorCaption)colorCaption.textContent='Mask Color';
    const maskOnly=q('[name="mask_only"]'),maskOnlyLabel=maskOnly.closest('label');maskOnlyLabel.hidden=true;maskDisplay.append(maskOnlyLabel);
    const swatches=make('details','studio-overlay-swatches');
    swatches.innerHTML='<summary aria-label="Mask color presets" title="Mask color presets"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.4a2.1 2.1 0 0 0 1.5-3.6 1.6 1.6 0 0 1 1.1-2.7h1.5A3.5 3.5 0 0 0 21 11.2 8.8 8.8 0 0 0 12 3Z"/><circle cx="7" cy="11" r="1"/><circle cx="9" cy="7" r="1"/><circle cx="14" cy="6.5" r="1"/><circle cx="17.5" cy="10" r="1"/></svg></summary>';
    swatches.append(q('[aria-label="Mask overlay colors"]'));maskDisplay.append(swatches);
    q('[data-art-selection-status]').hidden=true;
    const selectionDisplay=make('div','studio-edit-only studio-selection-display');
    selectionDisplay.append(q('[data-art-show-selection]').closest('label'),q('.art-selection-status'));header.append(selectionDisplay);
    const displayRow=make('div','studio-display-row');maskDisplay.before(displayRow);
    const collapseLabel=make('label','studio-auto-collapse');
    const autoCollapse=document.createElement('input');autoCollapse.type='checkbox';autoCollapse.dataset.studioAutoCollapse='';
    collapseLabel.append(autoCollapse,document.createTextNode('Auto-Collapse Groups'));
    displayRow.append(maskDisplay,selectionDisplay,collapseLabel);
    const collapseKey='deckadence.studio.autoCollapseGroups';
    try {autoCollapse.checked=localStorage.getItem(collapseKey)==='true';}catch(_){}
    header.append(q('[data-art-header]'),q('[data-spot-mirror-job-banner]'));header.querySelector('.art-task-tabs').hidden=true;
    const scroll=make('div','studio-inspector-scroll');
    const finishGroups=make('div','studio-mask-only studio-finishing-groups');
    for(const child of [...controls.children])if(child!==panel)finishGroups.append(child);
    scroll.append(panel,finishGroups);controls.replaceChildren(header,scroll);
    q('[data-art-task-panel="select"]').remove();
    function group(node,number,title,description){
      const detail=make('details','studio-group');detail.open=true;
      const summary=document.createElement('summary');
      summary.innerHTML=`<span class="studio-group-number">${number}</span><span><strong>${title}</strong><small>${description}</small></span>`;
      node.before(detail);detail.append(summary,node);return detail;
    }
    for(const [key,number,title,description] of [
      ['paint','01','Paint & color','Fill, recolor and manage painted edits'],
      ['text','02','Text','Remove existing lettering or add editable text'],
      ['ai','03','Generative edit','Change selected artwork with your own instruction']]){
      const section=q(`[data-art-task-panel="${key}"]`);section.hidden=false;section.removeAttribute('role');section.removeAttribute('aria-labelledby');
      group(section,number,title,description).dataset.studioEditGroup=key;
    }
    const repair=make('fieldset','studio-text-repair');repair.setAttribute('data-art-controls','');
    repair.innerHTML='<legend>AI text removal</legend><p class="spot-card-caption">Select lettering on the card. AI removes its strokes and shadows, then fills the area using the nearby background.</p><button type="button" data-art-remove-text>Remove with AI & preview</button>';
    q('[data-art-task-panel="text"]').prepend(repair);
    const repairSlot=document.createElement('div');repairSlot.dataset.artTextJobSlot='';repair.after(repairSlot);
    q('[data-art-ai-mode="remove_text"]').remove();q('.art-ai-actions').hidden=true;
    q('[data-art-prompt-row]').hidden=false;
    const jobSlot=make('div','studio-ai-job-slot');jobSlot.dataset.artAiJobSlot='';q('[data-art-job]').before(jobSlot);jobSlot.append(q('[data-art-job]'));
    const steps=[...q('.studio-finishing-groups').querySelectorAll('[data-spot-step]')];
    for(const [index,step] of steps.entries()){
      step.classList.add('studio-group');const titles=['Select mask','Touch up','Clean up'];const hints=['Choose where this layer appears','Paint, erase, select colors and import masks','Remove stray pixels and smooth edges'];
      if(step.matches('[data-spot-touch-up]'))step.open=true;
      step.querySelector('summary').innerHTML=`<span class="studio-group-number">0${index+1}</span><span><strong>${titles[index]}</strong><small>${hints[index]}</small></span>`;
    }
    const finishGroup=group(q('.spot-finish-controls'),'04','Effect','Set the effect or finish for this layer');
    // Progress actions must remain usable while the settings fieldset is disabled.
    finishGroup.insertBefore(q('[data-spot-mirror-job]'),q('.spot-finish-controls'));
    finishGroup.querySelector('summary strong').dataset.studioFinishTitle='';
    const applyAutoCollapse=()=>{
      for(const [index,scope] of [panel,finishGroups].entries()){
        const groups=[...scope.querySelectorAll('.studio-group')];
        const keep=groups.find(node=>node.open&&node.classList.contains('is-active'))||groups.find(node=>node.open);
        for(const node of groups){
          if(autoCollapse.checked){
            if(node!==keep)node.open=false;
            node.setAttribute('name',`${dialog.id}-groups-${index}`);
          }else node.removeAttribute('name');
        }
      }
    };
    autoCollapse.addEventListener('change',()=>{
      applyAutoCollapse();
      try {localStorage.setItem(collapseKey,String(autoCollapse.checked));}catch(_){}
    });
    applyAutoCollapse();
    const invert=q('[data-spot-invert]'),cleanupActions=make('div','spot-card-button-row');invert.before(cleanupActions);cleanupActions.append(invert);
    const clear=duplicate(q('[data-spot-clear]'),cleanupActions,'cleanup-clear');clear.textContent='Clear Mask';
    const pockets=q('[name="pocket_target"]').closest('.spot-card-treatment'),pocketRow=make('div','spot-card-fields-grid');
    pockets.querySelector('h3').after(pocketRow);pocketRow.append(q('[name="pocket_target"]').closest('label'));
    const exact=document.createElement('label');exact.textContent='Maximum area (pixels)';const area=document.createElement('input');area.type='number';area.min='1';area.max='65536';area.step='1';area.value='64';area.dataset.studioPocketArea='';exact.append(area);pocketRow.append(exact);
    const preset=q('[name="pocket_size"]'),custom=q('[name="pocket_size_custom"]');
    const syncArea=()=>{
      area.value=preset.value==='custom'?custom.value:preset.value;
      const count=Number(area.value),side=Math.sqrt(count);
      q('#spotPocketSizeHelp').textContent=Number.isInteger(side)?`${count} pixels = a ${side} × ${side} pocket. Larger limits remove more detail.`:`Remove pockets up to ${count} pixels in area. Larger limits remove more detail.`;
    };
    area.addEventListener('input',()=>{if(!area.checkValidity())return;preset.value='custom';preset.dispatchEvent(new Event('change',{bubbles:true}));custom.value=area.value;custom.dispatchEvent(new Event('input',{bubbles:true}));});
    dialog.addEventListener('change',()=>queueMicrotask(syncArea));dialog.addEventListener('click',()=>queueMicrotask(syncArea));
    const areaObserver=new MutationObserver(syncArea);areaObserver.observe(preset,{attributes:true});areaObserver.observe(custom,{attributes:true});syncArea();
    const presets=make('details','studio-pocket-presets');presets.innerHTML='<summary>Area presets</summary>';pockets.append(presets);presets.append(preset.closest('label'),custom.closest('label'));
    const edges=q('.spot-card-edge-settings');edges.open=true;edges.classList.add('studio-cleanup-edges');
    const edgeRow=make('div','spot-card-fields-grid');edges.querySelector('summary').after(edgeRow);
    for(const name of ['edge_expand','edge_smooth'])edgeRow.append(q(`[name="${name}"]`).closest('label'));
    const exclusions=q('[name="exclude_mode"]').closest('.spot-card-treatment'),excludeGroup=make('details','studio-cleanup-exclusions');excludeGroup.innerHTML='<summary>Exclude colors</summary>';exclusions.querySelector('h3').remove();edges.after(excludeGroup);excludeGroup.append(exclusions);
    dialog.addEventListener('pointerdown',event=>{
      for(const popover of dialog.querySelectorAll('.studio-selection-options[open],.studio-overlay-swatches[open]'))
        if(!popover.contains(event.target))popover.open=false;
    });
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape')for(const popover of dialog.querySelectorAll('.studio-selection-options[open],.studio-overlay-swatches[open]'))popover.open=false;
    });
    dialog.classList.add('studio-dual-dock');
    // Layout preferences are independent of card settings and saved masks.
    const preferenceKey='deckadence.studio.panes.v1';
    let preferences={quick:224,inspector:null,collapsed:false};
    try {
      const saved=JSON.parse(localStorage.getItem(preferenceKey)||'null');
      if(saved){
        if(Number.isFinite(saved.quick))preferences.quick=Math.max(180,Math.min(380,saved.quick));
        if(Number.isFinite(saved.inspector))preferences.inspector=Math.max(360,saved.inspector);
        preferences.collapsed=saved.collapsed===true;
      }
    } catch (_) { /* Storage can be unavailable in private browser contexts. */ }
    const saveLayout=()=>{try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch(_){}};
    const dockHeading=dock.querySelector('h3'),dockHeader=make('div','studio-quick-header');
    const dockBody=make('div','studio-quick-body');dockBody.id='studioQuickControlsBody';
    dockHeading.remove();while(dock.firstChild)dockBody.append(dock.firstChild);
    const toggle=document.createElement('button');toggle.type='button';toggle.dataset.studioCollapse='';
    toggle.setAttribute('aria-controls',dockBody.id);dockHeader.append(dockHeading,toggle);dock.append(dockHeader,dockBody);
    const preview=q('.spot-card-preview-panel');
    const grip=(name,before)=>{
      const node=make('div','studio-pane-grip');node.tabIndex=0;node.setAttribute('role','separator');
      node.setAttribute('aria-orientation','vertical');node.setAttribute('aria-label',name);
      node.title='Drag to resize. Arrow keys resize; double-click resets.';before.before(node);return node;
    };
    const leftGrip=grip('Resize Quick controls',preview),rightGrip=grip('Resize inspector',controls);
    let actualQuick=224,actualInspector=420;
    function arrangePanes(){
      const width=layout.clientWidth;if(!width)return;
      dockBody.hidden=preferences.collapsed;
      dock.classList.toggle('is-collapsed',preferences.collapsed);
      layout.classList.toggle('has-collapsed-quick',preferences.collapsed);
      toggle.innerHTML=preferences.collapsed?'&#8250;':'&#8249;';
      toggle.title=preferences.collapsed?'Expand Quick controls':'Collapse Quick controls';
      toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!preferences.collapsed));
      // Keep the separator in the grid: [hidden] removes its cell and shifts
      // the preview and inspector into the six-pixel separator columns.
      leftGrip.style.visibility=preferences.collapsed?'hidden':'';
      leftGrip.tabIndex=preferences.collapsed?-1:0;
      if(window.innerWidth<=940){layout.style.removeProperty('grid-template-columns');return;}
      const available=width-12;
      actualQuick=preferences.collapsed?44:Math.max(180,Math.min(preferences.quick,available-680));
      actualInspector=Math.max(360,Math.min(preferences.inspector??((available-actualQuick)/2.08),available-actualQuick-320));
      layout.style.gridTemplateColumns=`${actualQuick}px 6px minmax(320px,1fr) 6px ${actualInspector}px`;
      for(const [node,value,min,max] of [[leftGrip,actualQuick,preferences.collapsed?44:180,Math.min(380,available-actualInspector-320)],[rightGrip,actualInspector,360,available-actualQuick-320]]){
        node.setAttribute('aria-valuenow',Math.round(value));node.setAttribute('aria-valuemin',min);node.setAttribute('aria-valuemax',Math.round(max));
      }
    }
    toggle.addEventListener('click',()=>{preferences.collapsed=!preferences.collapsed;arrangePanes();saveLayout();});
    for(const [node,key] of [[leftGrip,'quick'],[rightGrip,'inspector']]){
      let drag=null;
      const resize=value=>{
        const min=Number(node.getAttribute('aria-valuemin')),max=Number(node.getAttribute('aria-valuemax'));
        preferences[key]=Math.max(min,Math.min(max,value));arrangePanes();
      };
      node.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;event.preventDefault();
        drag={id:event.pointerId,x:event.clientX,value:key==='quick'?actualQuick:actualInspector,previous:preferences[key]};
        node.focus({preventScroll:true});node.setPointerCapture(event.pointerId);layout.classList.add('is-resizing');
      });
      node.addEventListener('pointermove',event=>{if(drag)resize(drag.value+(event.clientX-drag.x)*(key==='quick'?1:-1));});
      const finish=event=>{if(!drag)return;if(event.type==='pointercancel'){preferences[key]=drag.previous;arrangePanes();}drag=null;layout.classList.remove('is-resizing');saveLayout();};
      node.addEventListener('pointerup',finish);node.addEventListener('pointercancel',finish);node.addEventListener('lostpointercapture',finish);
      node.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&drag){
          event.preventDefault();event.stopPropagation();const id=drag.id;
          finish({type:'pointercancel'});if(node.hasPointerCapture(id))node.releasePointerCapture(id);return;
        }
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();
        const value=Number(node.getAttribute('aria-valuenow'));
        resize(event.key==='Home'?Number(node.getAttribute('aria-valuemin')):event.key==='End'?Number(node.getAttribute('aria-valuemax')):value+(event.key==='ArrowRight'?1:-1)*(key==='quick'?1:-1)*(event.shiftKey?40:10));saveLayout();
      });
      node.addEventListener('dblclick',()=>{preferences[key]=key==='quick'?224:null;arrangePanes();saveLayout();});
    }
    new ResizeObserver(arrangePanes).observe(layout);
    window.addEventListener('resize',arrangePanes);arrangePanes();
  }
};

