(() => {
  "use strict";
  const panel = document.querySelector("[data-local-mirror]");
  if (!panel) return;
  const el = name => panel.querySelector(`[data-local-ai-${name}]`);
  let state, timer, sending = false;
  async function api(method = "GET", payload, suffix = "") {
    const response = await fetch(panel.dataset.url + suffix, {
      method, headers: {"Content-Type": "application/json"},
      ...(payload ? {body: JSON.stringify(payload)} : {})
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Could not update local AI settings.");
    return result;
  }
  function choices(name, values, active) {
    const select = el(name);
    if (select.options.length) return;
    for (const item of values) {
      select.add(new Option(item.name, item.id));
    }
    if (active && values.some(item => item.id === active)) select.value = active;
  }
  function bytes(value) {
    const n=Math.max(0,Number(value)||0);
    return n>=1073741824?(n/1073741824).toFixed(2)+' GiB':(n/1048576).toFixed(1)+' MiB';
  }
  function downloadProgress() {
    const setup=state.setup,download=setup.download||{},counter=download.bytes||download.transfer;
    el('progress-panel').hidden=!setup.running;
    const bar=el('progress');let label=setup.stage;
    if(counter?.total>0){
      const percent=Math.min(100,Math.max(0,counter.done/counter.total*100));bar.value=percent;
      label=`${percent.toFixed(1)}% · ${bytes(counter.done)} / ${bytes(counter.total)} ${setup.operation==='verify'?'checked':'prepared'}`;
    }else{bar.removeAttribute('value');if(counter?.done)label+=` · ${bytes(counter.done)} received`;}
    if(download.transfer)label+=` · ${bytes(download.transfer.done)} transferred`;
    if(download.files?.total)label+=` · ${download.files.done}/${download.files.total} files`;
    if(download.component)label=download.component+' · '+label;
    const seconds=Math.max(0,setup.elapsed_seconds||0);
    label+=` · ${Math.floor(seconds/60)}m ${seconds%60}s elapsed`;
    el('progress-label').textContent=label;
  }
  function render() {
    if (!state) return;
    const pack = state.packages.find(item => item.id === el("package").value);
    const hardware = state.hardware.find(item => item.id === el("hardware").value);
    if(!pack||!hardware)return;
    const details=pack.hardware[hardware.id],components=details.components;
    const model=state.models.find(item=>item.id===pack.default_model);
    const running = state.setup.running;
    downloadProgress();
    const selected = state.active?.package === pack.id && state.active?.hardware === hardware.id;
    const interrupted = state.setup.package === pack.id && state.setup.hardware === hardware.id && ['Interrupted','Cancelled','Setup failed','Repair needed','Setup incomplete'].includes(state.setup.stage);
    el("badge").textContent = state.ready ? "Enabled" : "Optional download";
    el("model-info").textContent = pack.description + " Image model: " + model.memory + " The shared 4B artwork analyzer runs separately and can share weights between GPU and system RAM when GPU memory is limited. This takes longer and requires available system RAM.";
    el("hardware-info").textContent = hardware.description;
    const total=components.reduce((sum,part)=>sum+(part.download_gb||0),0),remaining=components.filter(part=>!part.ready).reduce((sum,part)=>sum+(part.download_gb||0),0);
    el("size").textContent = `Package models and shared assets: approximately ${total.toFixed(1)} GB. ${details.ready?'All components ready.':`Approximately ${remaining.toFixed(1)} GB of missing assets; existing files are reused.`} ${hardware.installed?'Processor runtime installed.':'Processor libraries require additional download and disk space.'}`;
    el('components').replaceChildren(...components.map(part=>{const li=document.createElement('li');li.textContent=(part.ready?'Ready · ':'Required · ')+part.name;return li;}));
    el('package-progress').textContent=`${components.filter(part=>part.ready).length} of ${components.length} components ready · ${pack.name}`;
    el('outpaint-details').hidden = !pack.dependencies.includes('flux_outpaint');
    const sources=pack.models.flatMap(id=>{const item=state.models.find(value=>value.id===id);return item.edit_checkpoint?[item,item.edit_checkpoint]:[item];});
    el('licenses').replaceChildren(document.createTextNode('Models and licenses: '));
    sources.forEach((item,index)=>{if(index)el('licenses').append(document.createTextNode(' · '));const link=document.createElement('a');link.textContent=item.name+' ↗';link.href=item.license_url;link.target='_blank';link.rel='noopener noreferrer';el('licenses').append(link);});
    const activeModel = state.models.find(item => item.id === state.active?.model);
    const activeHardware = state.hardware.find(item => item.id === state.active?.hardware);
    el("active").textContent = state.ready ? `Active: ${state.packages.find(item=>item.id===state.active.package).name} · ${activeModel.name} · ${activeHardware.name}` : "Generative actions are disabled. Enable a complete package to use them.";
    el("status").textContent = state.setup.message ? (state.setup.message.startsWith(state.setup.stage) ? state.setup.message : `${state.setup.stage}: ${state.setup.message}`) : "Choose a package and processor to enable generation.";
    el("install").textContent = running ? (state.setup.operation==='verify'?'Verifying files…':'Setting up package…') : selected ? "Enabled" : details.ready ? "Enable package" : interrupted ? "Resume & enable package" : "Install & enable package";
    for (const name of ["package", "hardware"]) el(name).disabled = sending || running;
    el("install").disabled = sending || running || selected;
    el("downloaded").textContent = 'Complete packages for this processor: '+(state.packages.filter(item=>item.hardware[hardware.id].ready).map(item=>item.name).join(', ')||'None');
    el("download").disabled = sending || running || details.ready;
    el("download").textContent = details.ready ? 'Package installed' : interrupted ? 'Resume without switching' : 'Install without switching';
    el('hosted').textContent=Object.values(state.providers).filter(item=>item.kind==='hosted').map(item=>item.name+' — '+item.description+' Not available yet.').join(' ');
    el("cancel").hidden = !running;
    el("cancel").textContent = state.setup.operation==='verify'?'Cancel verification':'Cancel download';
    el("cancel").disabled = sending;
    el('verify').disabled = sending || running || !hardware.installed;
    el('verify').textContent = running && state.setup.operation==='verify'?'Verifying files…':'Verify files';
    el("disable").hidden = !state.ready;
    el("disable").disabled = sending || running;
  }
  function accept(result) {
    state = result;
    const recovery = ['Interrupted','Cancelled','Setup failed','Repair needed','Setup incomplete','Verification failed','Verification interrupted'].includes(state.setup.stage);
    const selected = state.setup.running || recovery ? state.setup : state.active || state.setup;
    choices("package", state.packages, selected.package || state.default_package);
    choices("hardware", state.hardware, selected.hardware);
    render();
    clearTimeout(timer);
    if (state.setup.running) timer = setTimeout(refresh, 2000);
  }
  async function refresh() {
    try { accept(await api()); }
    catch (error) {
      el("status").textContent = error.message;
      timer = setTimeout(refresh, 5000);
    }
  }
  async function action(method, payload, suffix) {
    sending = true; render(); clearTimeout(timer);
    let failure='';
    try { accept(await api(method, payload, suffix)); }
    catch (error) {
      failure=error.message;
      // The action may have succeeded even if its response was lost. Read the
      // current state again; never repeat a download, cancel or disable request.
      timer = setTimeout(refresh, 5000);
    }
    finally { sending = false; render(); if(failure)el('status').textContent=failure; }
  }
  el("package").addEventListener("change", render);
  el("hardware").addEventListener("change", render);
  el("install").addEventListener("click", () => action("POST", {package: el("package").value, hardware: el("hardware").value}));
  el("download").addEventListener("click", () => action("POST", {package: el("package").value, hardware: el("hardware").value, activate:false}));
  el("cancel").addEventListener("click", () => action("POST", undefined, "/cancel"));
  el("disable").addEventListener("click", () => action("DELETE"));
  el('verify').addEventListener('click',()=>action('POST',{package:el('package').value,hardware:el('hardware').value},'/verify'));
  let promptsLoaded=false,promptsLoading=false,promptDefaults=null;
  el('prompts').addEventListener('toggle',async()=>{
    if(!el('prompts').open||promptsLoaded||promptsLoading)return;
    promptsLoading=true;el('prompts-status').textContent='Loading prompt dictionary…';
    try {
      const result=await api('GET',undefined,'/prompt-dictionary');
      el('prompts-json').value=JSON.stringify(result.dictionary,null,2);
      el('prompts-path').textContent=result.path;
      el('prompts-distribution').textContent=result.distribution_path;
      promptDefaults=result.defaults;
      for(const [model,ops] of Object.entries(promptDefaults.planner.recipes))for(const op of Object.keys(ops))el('prompts-reset-target').add(new Option(model+' / '+op,model+'/'+op));
      el('prompts-json').disabled=el('prompts-save').disabled=false;promptsLoaded=true;
      el('prompts-status').textContent='Edit the entries under the model you want to change. Keep the keys and documented placeholders.';
    } catch(error){el('prompts-status').textContent=error.message;}
    finally{promptsLoading=false;}
  });
  el('prompts-save').addEventListener('click',async()=>{
    el('prompts-save').disabled=true;el('prompts-json').disabled=true;
    try {
      const dictionary=JSON.parse(el('prompts-json').value);
      await api('PUT',{dictionary},'/prompt-dictionary');
      el('prompts-status').textContent='Saved. New generation jobs will use these prompts.';
    } catch(error){el('prompts-status').textContent='Not saved: '+error.message;}
    finally{el('prompts-save').disabled=el('prompts-json').disabled=false;}
  });
  el('prompts-reset').addEventListener('click',()=>{
    if(!promptDefaults)return;
    try {
      let value=JSON.parse(el('prompts-json').value);const target=el('prompts-reset-target').value;
      if(target==='all')value=structuredClone(promptDefaults);
      else if(target==='analysis')value.planner.analysis_prompt=promptDefaults.planner.analysis_prompt;
      else {const [model,op]=target.split('/');value.planner.recipes[model][op]=structuredClone(promptDefaults.planner.recipes[model][op]);}
      el('prompts-json').value=JSON.stringify(value,null,2);el('prompts-status').textContent='Reset in editor. Save to apply these defaults.';
    }catch(error){el('prompts-status').textContent=error.message;}
  });
  el('prompts-export').addEventListener('click',async()=>{
    try {
      const result=await api('POST',{dictionary:JSON.parse(el('prompts-json').value)},'/prompt-dictionary');
      const href=URL.createObjectURL(new Blob([JSON.stringify(result.dictionary,null,2)+'\n'],{type:'application/json'}));
      const a=document.createElement('a');a.href=href;a.download='generation_prompts.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
      el('prompts-status').textContent='Exported the complete dictionary for plugin_src/card-finishing-studio/generation_prompts.json.';
    }catch(error){el('prompts-status').textContent='Export failed: '+error.message;}
  });
  refresh();
})();
