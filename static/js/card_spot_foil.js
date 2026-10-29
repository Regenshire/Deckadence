// Card-specific selection, using the same shared/isolated library as alternate images.
(() => {
  "use strict";
  const dialog = document.getElementById("cardSpotFoilDialog");
  if (!dialog || !window.DeckadenceCardEffects) return;
  window.DeckadenceFinishingWorkspace.setup(dialog);
  const effects = window.DeckadenceCardEffects;
  const form = dialog.querySelector("form"), fields = form.elements;
  const disableEffect=document.createElement('label');disableEffect.className='spot-card-check';disableEffect.dataset.spotDisableEffect='';
  disableEffect.innerHTML='<input type="checkbox" name="effect_disabled"> Disable effect';
  dialog.querySelector('.spot-finish-effect-row').before(disableEffect);
  if(!fields.selection_mode.querySelector('[value="text"]'))fields.selection_mode.add(new Option('Text','text'));
  const clearSelection=document.createElement('button');clearSelection.type='button';clearSelection.dataset.spotClearSelection='';clearSelection.textContent='Clear selection';
  const maskActions=dialog.querySelector('.spot-card-auto-actions');
  maskActions.parentElement.after(maskActions);
  maskActions.append(clearSelection);
  dialog.querySelector('[data-spot-apply]').textContent='Apply Mask';
  clearSelection.addEventListener('click',()=>{if(selectArea('none',true))message('Selection cleared.');});
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
  const layerOrder={effect1:5,effect2:6,mask:7,gloss:8};
  const printedLayer=()=>editingLayer.startsWith("effect");
  const effectPreviews=new Map();
  let mirrorGeneration=null,mirrorLayers=null,trekTransporter=null,disintegrate=null;
  let mirrorDiagnostics=null;
  let mirrorJobState=null,mirrorClock=null;
  const mirrorExport=dialog.querySelector('[data-spot-export-mirror]');
  const mirrorJobPart=name=>dialog.querySelector('[data-spot-mirror-'+name+']');
  const mirrorJobHome=document.createComment('Shared AI progress panel');
  mirrorJobPart('job').before(mirrorJobHome);
  function mirrorElapsed(){
    const seconds=Math.max(0,Math.floor(((mirrorJobState?.finished||Date.now())-(mirrorJobState?.started||Date.now()))/1000));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' elapsed';
  }
  function renderMirrorJob(){
    const state=mirrorJobState,dis=state?.kind==='disintegrate',visible=Boolean(state&&state.session===session&&state.layer===editingLayer&&!artEditor.active&&printedLayer()&&(dis?fields.finish.value==='disintegrate':fields.finish.value==='mirror_shards'&&fields.effect_mirror.checked));
    const slot=dis?dialog.querySelector('[data-dis-job-slot]'):null;
    if(slot){if(mirrorJobPart('job').parentElement!==slot)slot.append(mirrorJobPart('job'));}
    else if(mirrorJobPart('job').previousSibling!==mirrorJobHome)mirrorJobHome.after(mirrorJobPart('job'));
    mirrorJobPart('job').hidden=!visible;
    mirrorJobPart('job-banner').hidden=!visible||dis;
    if(!visible)return;
    mirrorJobPart('job').setAttribute('aria-label',dis?'Disintegrate AI job progress':'Mirror AI job progress');
    mirrorJobPart('job-stages').setAttribute('aria-label',dis?'Disintegrate generation stages':'Mirror generation stages');
    mirrorJobPart('job-title').textContent=state.title;
    mirrorJobPart('job-message').textContent=state.message;
    mirrorJobPart('job-model').textContent=state.model||'Generative Art AI · on this PC';
    mirrorJobPart('elapsed').textContent=mirrorElapsed();
    mirrorJobPart('job-summary').textContent=state.title+(state.finished?'':' · '+mirrorElapsed());
    const index=state.stages.findIndex(([key])=>key===state.phase);
    for(const [i,node] of [...mirrorJobPart('job-stages').children].entries()){
      node.classList.toggle('is-done',i<index);node.classList.toggle('is-current',i===index);
      if(i===index)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');
    }
    mirrorJobPart('job-cancel').hidden=dis?!disintegrate?.generating:!mirrorGeneration;
    mirrorJobPart('job-cancel').disabled=dis?false:!mirrorGeneration?.url;
    mirrorJobPart('job-view').hidden=state.phase!=='review';
    mirrorJobPart('job-view').disabled=busy||(dis?!disintegrate?.hasResult:!fields.effect_scene.value);
    mirrorJobPart('job-view').textContent=dis?'Inspect '+disintegrate.resultKind:'View generated art';
    mirrorJobPart('job-retry').hidden=!dis||!['failed','cancelled'].includes(state.phase);
  }
  function updateMirrorJob(value){mirrorJobState={...mirrorJobState,...value};renderMirrorJob();}
  function stopMirrorClock(){clearInterval(mirrorClock);mirrorClock=null;}
  function openMirrorJob(){const panel=mirrorJobPart('job');panel.closest('.studio-group').open=true;panel.scrollIntoView({block:'nearest'});}
  function mirrorServerStage(result){
    const stages={queued:'Waiting for local AI',preparing:'Preparing artwork',detecting:'Detecting frame and text',analyzing:'Analyzing artwork',planning:'Building generation plan',loading:'Loading local model',generating:'Generating artwork',rendering:'Preparing preview'};
    const phase=result.phase||mirrorJobState.phase;
    const label=mirrorJobState.stages.find(([key])=>key===phase)?.[1];
    updateMirrorJob({phase,title:(phase!=='prepare'&&label?label+' · ':'')+(stages[result.stage]||'Generating artwork'),message:result.message||'The model is working.',model:result.model_label||mirrorJobState.model});
  }
  // Disintegrate uses the same job panel, banner, timer and actions as Mirror AI.
  function disintegrateJob(value){
    if(value.start){
      const stages=[['prepare','Prepare'],['analyze','Analyze'],['plan','Plan'],['generate','Generate'],['preview','Preview'],['review','Review']];
      mirrorJobState={kind:'disintegrate',session,layer:editingLayer,stages,started:Date.now(),phase:'prepare',title:'Starting background reconstruction',message:'Preparing the disintegration area and surrounding artwork.'};
      mirrorDiagnostics=null;
      mirrorJobPart('job-stages').replaceChildren(...stages.map(([,label])=>Object.assign(document.createElement('li'),{textContent:label})));
      stopMirrorClock();mirrorClock=setInterval(renderMirrorJob,1000);renderMirrorJob();openMirrorJob();return;
    }
    if(mirrorJobState?.kind!=='disintegrate')return;
    const phase=value.phase||({analyzing:'analyze',planning:'plan',loading:'generate',generating:'generate',rendering:'preview'}[value.stage]||'prepare');
    const titles={queued:'Waiting for local AI',preparing:'Preparing subject and background',detecting:'Detecting frame and text',analyzing:'Analyzing artwork',planning:'Building generation plan',loading:'Loading local model',generating:'Reconstructing background',rendering:'Preparing preview'};
    if(value.finished){stopMirrorClock();if(value.diagnosticsUrl)mirrorDiagnostics={url:value.diagnosticsUrl,session,layer:editingLayer};}
    updateMirrorJob({phase,title:value.title||titles[value.stage]||'Reconstructing background',message:value.message||'The local model is working.',model:value.model_label||mirrorJobState.model,...(value.finished?{finished:mirrorJobState.finished||Date.now()}:{})});
  }
  let mirrorSelectionCache=null;
  const artDialog=document.getElementById("spotGeneratedArtDialog"),artImage=artDialog.querySelector("[data-spot-art-image]"),artViewport=artDialog.querySelector("[data-spot-art-viewport]");
  function setArtView(actual) {
    artViewport.classList.toggle("is-actual",actual);artViewport.scrollTo(0,0);
    artDialog.querySelector("[data-spot-art-fit]").setAttribute("aria-pressed",String(!actual));
    artDialog.querySelector("[data-spot-art-actual]").setAttribute("aria-pressed",String(actual));
  }
  artDialog.querySelector("[data-spot-art-fit]").addEventListener("click",()=>setArtView(false));
  artDialog.querySelector("[data-spot-art-actual]").addEventListener("click",()=>setArtView(true));
  artDialog.querySelector("[data-spot-art-close]").addEventListener("click",()=>artDialog.close());
  artDialog.addEventListener("close",()=>artImage.removeAttribute("src"));
  dialog.querySelector("[data-spot-view-art]").addEventListener("click",()=>{
    if(!fields.effect_scene.value||busy)return;
    artDialog.querySelector("h2").textContent="Generated art · "+layerNames[editingLayer];
    const theme=[...fields.effect_shard_theme.options].find(option=>option.value===fields.effect_scene_theme.value)?.textContent||"Saved scene";
    artImage.onload=()=>{artDialog.querySelector("[data-spot-art-info]").textContent=`${theme} · ${artImage.naturalWidth} × ${artImage.naturalHeight} pixels · ${fields.effect_scene_margin.value}% background margin`;};
    artDialog.querySelector("[data-spot-art-info]").textContent="Loading generated art…";
    setArtView(false);artImage.src="data:image/png;base64,"+fields.effect_scene.value;artDialog.showModal();
  });
  let maskClipboard=null, maskClipboardRegion=null, marquee=null;
  window.addEventListener("focus",async()=>{
    if(!dialog.open||!metadata||busy)return;
    const token=session;
    try {
      const response=await fetch("/cards/spot-foil/mirror-generation-status",{cache:"no-store"});
      if(!response.ok)return;
      const result=await response.json();
      if(token===session&&dialog.open&&metadata){metadata.mirror_generator_ready=result.ready;updateShardControls();}
    } catch (_) { /* Keep current readiness when the app is temporarily unavailable. */ }
  });
  function sceneSelectionBits(surface) {
    // Keep the generation footprint at the same resolution sent to the model.
    // One bit per selected pixel lets later mask reductions reuse the scene.
    const small=document.createElement("canvas");small.width=756;small.height=1056;
    const context=small.getContext("2d");context.drawImage(surface,0,0,756,1056);
    const pixels=context.getImageData(0,0,756,1056).data,bits=new Uint8Array(756*1056/8);
    for(let pixel=0;pixel<756*1056;pixel++)if(pixels[pixel*4+3]>0)bits[pixel>>3]|=1<<(pixel&7);
    return bits;
  }
  function encodeSceneSelection(surface,wholeIfEmpty=false) {
    const bits=sceneSelectionBits(surface);if(wholeIfEmpty&&!bits.some(Boolean))bits.fill(255);let binary="";
    for(let offset=0;offset<bits.length;offset+=8192)binary+=String.fromCharCode(...bits.subarray(offset,offset+8192));
    return btoa(binary);
  }
  function mirrorSelectionExpanded() {
    if(!fields.effect_scene_selection.value)return false;
    if(mirrorSelectionCache?.png!==maskUrl || mirrorSelectionCache?.layer!==editingLayer)
      mirrorSelectionCache={png:maskUrl,layer:editingLayer,bits:sceneSelectionBits(mask)};
    const original=atob(fields.effect_scene_selection.value),bits=mirrorSelectionCache.bits;
    return bits.some((value,index)=>value&~original.charCodeAt(index));
  }
  function updateMirrorStatus() {
    if(!printedLayer()||fields.finish.value!=="mirror_shards")return;
    let text=metadata?.mirror_generator_ready ? "Generate the scene, then review it before saving." : "Install and enable a complete generation package in Card Finishing Studio settings.";
    if(fields.effect_scene.value) {
      text="Rendered scene loaded.";
      if(fields.effect_scene_theme.value!==fields.effect_shard_theme.value)text="Theme changed. Generate a new scene to apply this theme.";
      else if(fields.effect_shard_theme.value==="custom"&&fields.effect_custom_prompt.value.trim()!==fields.effect_scene_custom_prompt.value)text="Custom prompt changed. Generate a new scene to apply it.";
      else if(fields.effect_prompt_details.value.trim()!==fields.effect_scene_prompt_details.value)text="Additional details changed. Generate a new scene to apply them.";
      else if(String(fields.effect_maintain_style.checked)!==fields.effect_scene_maintain_style.value)text="Art style setting changed. Generate a new scene to apply it.";
      else if(fields.effect_outpaint_margin.value!==fields.effect_scene_margin.value)text="Outpainting margin changed. Generate a new scene to add the background.";
      else if(fields.effect_scene_source.value && fields.effect_scene_source.value!==current?.signature)text="Artwork changed since this scene was generated. Regenerate to match it; the saved scene is unchanged.";
      else if(ready && mirrorSelectionExpanded())text="The selection includes areas that were not generated. Regenerate to include them; the saved scene is unchanged.";
    }
    if(fields.effect_scene.value && text!=="Rendered scene loaded." && !metadata?.mirror_generator_ready)text+=" Enable local AI in Studio settings to regenerate.";
    dialog.querySelector("[data-spot-mirror-status]").textContent=text;
    dialog.querySelector("[data-spot-generate-mirror]").textContent=fields.effect_scene.value?"Regenerate mirror scene":"Generate mirror scene";
  }
  const legacyGlitter=finish=>["glitter_1","glitter_2","glitter_3","confetti"].includes(finish);
  const windWaveEffect=finish=>/^(wind_(ribbons|curls|storm|painted)|waves_(swells|crests|field))(_sparse)?$/.test(finish);
  const effectColors={confetti_glitter:"#FFFFFF",ukiyo_e:"#FFFFFF",stars:"#FFF4C3",halftone:"#121930",neon:"#46F5FF",mirror_shards:"#B8EFFF",mirror_layers:"#B8EFFF",chocobo_tracks:"#FFFFFF",phyrexian:"#FFFFFF",mana_foil:"#FFFFFF",dragonscale:"#FFFFFF",gilded:"#F4CA70",halo:"#FFFFFF",ripple:"#FFFFFF",invisible_ink:"#B7A1FF",neon_ink:"#FF298A"};
  for(const family of ["wind_ribbons","wind_curls","wind_storm","wind_painted","waves_swells","waves_crests","waves_field"])for(const suffix of ["","_sparse"])effectColors[family+suffix]="#FFFFFF";
  effectColors.dragon_strike="#FFFFFF";
  effectColors.federation_transporter="#FFFFFF";
  effectColors.raised_solar="#E8B94F";
  effectColors.disintegrate='#FF9D35';
  function solarShiftColor(color) {
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),maximum=Math.max(...rgb),minimum=Math.min(...rgb),delta=maximum-minimum;
    let hue=!delta?0:maximum===rgb[0]?((rgb[1]-rgb[2])/delta)%6:maximum===rgb[1]?(rgb[2]-rgb[0])/delta+2:(rgb[0]-rgb[1])/delta+4;
    hue=((hue/6-8/360)%1+1)%1;
    const saturation=Math.min(1,(maximum?delta/maximum:0)*1.06),value=maximum*.6,sector=hue*6;
    const chroma=value*saturation,x=chroma*(1-Math.abs(sector%2-1)),m=value-chroma;
    const shifted=sector<1?[chroma,x,0]:sector<2?[x,chroma,0]:sector<3?[0,chroma,x]:sector<4?[0,x,chroma]:sector<5?[x,0,chroma]:[chroma,0,x];
    return '#'+shifted.map(c=>Math.round((c+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  const solarDefaults={center_x:50,center_y:50,sun_size:300,sun_opacity:100,spacing:100,thickness:38,depth:55,rays:18,band_width:4,off_brightness:45,off_opacity:100,off_color:solarShiftColor('#E8B94F'),off_auto:true,relief:70,opacity:0,background_opacity:100,radial_bands:true,ring_bands:false};
  const solarFields=Object.keys(solarDefaults).map(key=>'effect_solar_'+key);
  const pathEffects=new Set(["confetti_glitter","ukiyo_e","chocobo_tracks","dragon_strike","federation_transporter","phyrexian","mana_foil","dragonscale","gilded","invisible_ink"]);
  const copyPathEffects=new Set([...pathEffects,"disintegrate","raised_solar","galaxy","confetti","glitter_1","glitter_2","glitter_3","halftone","stars","water_beads"]);
  const effectBlend=value=>value.finish==="raised_solar"?100-Number(value.solar?.opacity??0):value.finish==="oil_slick"?100:value.finish==="neon_ink"?85:value.finish==="fracture"?Number(value.translucence)||0:0;
  const effectHelp={silver_black:"Converts selected artwork to deep black shadows and silver highlights. For Oil Slick, use this in Effect 1 and Oil Slick Rainbow in Effect 2 with the same mask.",oil_slick:"A subtle rainbow that follows the light and dark detail underneath. Use above Silver & Black Art for the oil slick look; strength controls the color intensity.",phyrexian:"Repeating Phyrexian symbols inspired by Step-and-Compleat foil. Copy Path reuses the symbols as a foil or gloss mask.",mana_foil:"Staggered rows of the five mana symbols. Copy Path keeps the symbol shapes at full coverage.",dragonscale:"Overlapping pointed scales with fine reflective edges and clear centers.",gilded:"Gold Art Deco corner fans, stepped rails and ornaments. Copy Path can add foil or raised gloss to the filigree.",halo:"Flowing, irregular iridescent rings inspired by Halo foil.",ripple:"Fine, curved interference bands inspired by Ripple foil.",invisible_ink:"This effect has been removed. Choose another effect or remove this layer.",neon_ink:"Colored ink across the selected area, preserving artwork detail. Choose a color below."};
  let previousEffectFinish="";
  effectHelp.raised_solar="A raised circular sun with straight zig-zag ridges. Effect and off-band colors alternate in radial sections at each bend. Alternating zig-zag rings are optional. The default blends with the artwork underneath.";
  function updateEffectColor(resetDefault=false) {
    if(resetDefault && fields.effect_color.value.toUpperCase()===(effectColors[previousEffectFinish]||"#FFE7A0"))fields.effect_color.value=effectColors[fields.finish.value]||"#FFE7A0";
    previousEffectFinish=fields.finish.value;
    dialog.querySelector("[data-spot-effect-color-controls]").hidden=!printedLayer()||!effectColors[fields.finish.value]||fields.finish.value==='federation_transporter';
    dialog.querySelector("[data-spot-effect-color-label]").textContent=(["ukiyo_e","confetti_glitter","dragon_strike","federation_transporter"].includes(fields.finish.value)||windWaveEffect(fields.finish.value))?"Tint color":{stars:"Star color",halftone:"Dot color",neon:"Glow color",mirror_shards:"Tint color",mirror_layers:"Tint color",chocobo_tracks:"Track tint"}[fields.finish.value]||"Effect color";
    dialog.querySelector("[data-spot-wind-wave-tint-help]").hidden=!["ukiyo_e","confetti_glitter"].includes(fields.finish.value)&&!windWaveEffect(fields.finish.value);
    dialog.querySelector("[data-spot-effect-color]").textContent=fields.effect_color.value.toUpperCase();
    dialog.querySelector("[data-spot-fracture-controls]").hidden=!printedLayer()||fields.finish.value!=="fracture";
    dialog.querySelector("[data-spot-translucence-value]").value=fields.effect_translucence.value+"%";
    dialog.querySelector("[data-spot-black-depth-value]").value=fields.effect_black_depth.value+"%";
    dialog.querySelector("[data-spot-silver-brightness-value]").value=fields.effect_silver_brightness.value+"%";
    dialog.querySelector("[data-spot-rotation-value]").value=fields.effect_rotation.value+"°";
    dialog.querySelector("[data-spot-scene-rotation-value]").value=fields.effect_scene_rotation.value+"°";
    dialog.querySelector("[data-spot-scene-zoom-value]").value=fields.effect_scene_zoom.value+"%";
    dialog.querySelector("[data-spot-scene-skew-value]").value=fields.effect_scene_skew.value+"°";
    dialog.querySelector("[data-spot-scene-x-value]").value=fields.effect_scene_x.value+"%";
    dialog.querySelector("[data-spot-scene-y-value]").value=fields.effect_scene_y.value+"%";
    updateShardControls();
  }
  function updateShardControls() {
    disableEffect.hidden=!printedLayer();
    const dis=printedLayer()&&fields.finish.value==='disintegrate';
    dialog.querySelector('[data-spot-disintegrate-controls]').hidden=!dis;
    dialog.querySelector('[data-spot-transporter-controls]').hidden=!printedLayer()||fields.finish.value!=='federation_transporter';
    dialog.querySelectorAll('[data-spot-transporter-emblem]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.spotTransporterEmblem===fields.effect_transporter_emblem.value)));
    dialog.querySelector('[data-spot-dragon-controls]').hidden=!printedLayer()||fields.finish.value!=='dragon_strike';
    dialog.querySelectorAll('[data-spot-dragon-emblem]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.spotDragonEmblem===fields.effect_dragon_emblem.value)));
    dialog.querySelector("[data-spot-particle-controls]").hidden=!printedLayer()||fields.finish.value!=="confetti_glitter";
    dialog.querySelector("[data-spot-ukiyo-controls]").hidden=!printedLayer()||fields.finish.value!=="ukiyo_e";
    dialog.querySelector("[data-spot-ripple-origin]").hidden=!printedLayer()||fields.finish.value!=="ripple";
    dialog.querySelector('[data-spot-solar-controls]').hidden=!printedLayer()||fields.finish.value!=='raised_solar';
    fields.effect_solar_band_width.closest('label').hidden=!fields.effect_solar_ring_bands.checked;
    if(fields.finish.value==='raised_solar'&&fields.effect_solar_off_auto.checked)fields.effect_solar_off_color.value=solarShiftColor(fields.effect_color.value);
    for(const key of ['center_x','center_y','sun_opacity','thickness','depth','relief','off_brightness','off_opacity','opacity','background_opacity'])dialog.querySelector(`[data-spot-solar-${key}-value]`).value=fields['effect_solar_'+key].value+'%';
    dialog.querySelector('[data-spot-solar-sun-size-value]').value=fields.effect_solar_sun_size.value+' px';
    dialog.querySelector('[data-spot-solar-off-color-value]').value=fields.effect_solar_off_color.value.toUpperCase();
    dialog.querySelector("[data-spot-flame-controls]").hidden=!printedLayer()||!["flame_1","flame_2"].includes(fields.finish.value);
    const layers=printedLayer()&&fields.finish.value==="mirror_layers";
    const trek=printedLayer()&&fields.finish.value==='federation_transporter';
    fields.strength.closest('label').hidden=trek||dis;
    const shards=printedLayer()&&fields.finish.value==="mirror_shards";
    const tracks=printedLayer()&&["chocobo_tracks","dragon_strike"].includes(fields.finish.value);
    const pattern=printedLayer()&&pathEffects.has(fields.finish.value);
    const flat=["silver_black","neon_ink"].includes(fields.finish.value);
    const help=dialog.querySelector("[data-spot-effect-help]");help.textContent=effectHelp[fields.finish.value]||"";help.hidden=!help.textContent;
    const copyPath=dialog.querySelector("[data-spot-copy-path]");
    const pathSlot=dialog.querySelector(`[data-spot-${shards?"shard":"pattern"}-path-slot]`);
    if(copyPath.parentElement!==pathSlot)pathSlot.appendChild(copyPath);
    dialog.querySelector("[data-spot-pattern-path-slot]").hidden=!printedLayer()||!copyPathEffects.has(fields.finish.value);
    dialog.querySelector("[data-spot-track-controls]").hidden=!pattern||trek;
    fields.effect_track_x.setAttribute("aria-label",`${tracks?"Track":"Pattern"} horizontal position`);
    fields.effect_track_y.setAttribute("aria-label",`${tracks?"Track":"Pattern"} vertical position`);
    for(const name of ["x","y","transparency"])dialog.querySelector(`[data-spot-track-${name}-value]`).value=fields[`effect_track_${name}`].value+"%";
    // Move the shared controls, keeping their values and event handlers when
    // switching between a template and the other printable effects.
    for(const [control,slot] of [["effect-rotation","rotation"],["effect-color-controls","color"]]) {
      const element=dialog.querySelector(`[data-spot-${control}]`);
      const target=dis&&slot==='color'?dialog.querySelector('[data-dis-color-slot]'):fields.finish.value==='raised_solar'&&slot==='color'?dialog.querySelector('[data-spot-solar-color-slot]'):layers&&slot==='color'?dialog.querySelector('[data-ml-color-slot]'):dialog.querySelector(`[data-spot-${shards?"shard":"pattern"}-${slot}-slot]`);
      if(element.parentElement!==target)target.appendChild(element);
      dialog.querySelector(`[data-spot-pattern-${slot}-slot]`).hidden=shards || (slot==="color"&&(element.hidden||fields.finish.value==='raised_solar'));
    }
    dialog.querySelector("[data-spot-shard-controls]").hidden=!shards;
    dialog.querySelector("[data-spot-pattern-size]").hidden=shards||layers||flat||trek||dis;
    dialog.querySelector("[data-spot-pattern-rotation-slot]").hidden=shards||layers||flat||trek||dis;
    dialog.querySelector("[data-spot-pattern-density]").hidden=shards||layers||tracks||trek||dis||fields.finish.value==="neon_ink"||["oil_slick","halo","ripple","gilded","raised_solar"].includes(fields.finish.value);
    dialog.querySelector("[data-spot-density-label]").textContent=fields.finish.value==="silver_black"?"Contrast (%)":"Density (%)";
    dialog.querySelector("[data-spot-silver-controls]").hidden=!printedLayer()||fields.finish.value!=="silver_black";
    dialog.querySelector("[data-spot-new-pattern]").hidden=shards||layers||tracks||flat||fields.finish.value==="gilded";
    dialog.querySelector("[data-spot-mirror-controls]").hidden=!fields.effect_mirror.checked;
    dialog.querySelector("[data-spot-tint-value]").value=fields.effect_tint.value+"%";
    dialog.querySelector("[data-spot-shard-size-value]").value=fields.effect_shard_size.value+"%";
    dialog.querySelector("[data-spot-shard-x-value]").value=fields.effect_shard_x.value+"%";
    dialog.querySelector("[data-spot-shard-y-value]").value=fields.effect_shard_y.value+"%";
    dialog.querySelector("[data-spot-mirror-mode]").textContent=fields.effect_mirror.checked?"Use the generated image inside the glass":"Glass effect with tint";
    dialog.querySelector("[data-spot-custom-theme]").hidden=fields.effect_shard_theme.value!=="custom";
    dialog.querySelector("[data-spot-outpaint-margin-value]").value=fields.effect_outpaint_margin.value+"%";
    dialog.querySelectorAll("[data-spot-shard-template]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.spotShardTemplate===fields.effect_shard_template.value)));
    dialog.querySelector("[data-spot-generate-mirror]").disabled=!metadata?.mirror_generator_ready;
    dialog.querySelector("[data-spot-view-art]").disabled=!fields.effect_scene.value;
    if(mirrorExport)mirrorExport.disabled=busy||!mirrorDiagnostics||mirrorDiagnostics.session!==session||mirrorDiagnostics.layer!==editingLayer;
    renderMirrorJob();
    updateMirrorStatus();mirrorLayers?.update();trekTransporter?.update();disintegrate?.update();
  }
  async function generateMirrorScene() {
    if(!ready||busy||!metadata?.mirror_generator_ready||!printedLayer())return;
    if(!hasInk){message("Select an area for the mirror scene first.",true);return;}
    const token=session,layer=editingLayer,theme=fields.effect_shard_theme.value;
    const customPrompt=fields.effect_custom_prompt.value.trim(),promptDetails=fields.effect_prompt_details.value.trim(),margin=Number(fields.effect_outpaint_margin.value);
    const maintainStyle=fields.effect_maintain_style.checked;
    if(theme==="custom"&&!customPrompt){message("Enter a prompt for the Custom theme.",true);fields.effect_custom_prompt.focus();return;}
    // Regenerate requests a new variation. Commit its seed only with a
    // successful scene, so cancellation/failure preserves the previous layer.
    let seed=crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;
    if(seed===Number(fields.effect_seed.value))seed=(seed+1)&0x7fffffff;
    const operation={controller:new AbortController(),url:null,retain:false};mirrorGeneration=operation;
    const stages=[['prepare','Prepare'],['theme','Mirror artwork'],['canvas','Fill canvas'],...(margin?[['margin','Extend margin']]:[]),['review','Review']];
    mirrorJobPart('job-stages').replaceChildren(...stages.map(([,label])=>Object.assign(document.createElement('li'),{textContent:label})));
    mirrorJobState={session:token,layer,stages,started:Date.now(),phase:'prepare',title:'Starting local AI',message:'Preparing the edited artwork and detecting frame and text.'};
    stopMirrorClock();mirrorClock=setInterval(renderMirrorJob,1000);
    busy=true;controls();dialog.querySelector("[data-spot-cancel-generation]").hidden=false;dialog.querySelector("[data-spot-cancel-generation]").disabled=true;
    openMirrorJob();
    message(margin?"Generating the mirror scene and its background margin…":"Generating the mirror scene…");
    try {
      const source=document.createElement("canvas");source.width=1512;source.height=2112;
      source.getContext("2d").drawImage(artEditor.artworkSource(),0,0,source.width,source.height);
      const selection=document.createElement("canvas");selection.width=756;selection.height=1056;
      selection.getContext("2d").drawImage(mask,0,0,756,1056);
      const selectionBits=encodeSceneSelection(selection),sourceSignature=current.signature;
      const base=endpoint(current.target)+"/mirror-generation";
      const created=await api(apiUrl(base),{method:"POST",headers:{"Content-Type":"application/json"},signal:operation.controller.signal,
        body:JSON.stringify({image:source.toDataURL("image/png").split(",")[1],mask_data:selection.toDataURL("image/png"),theme,custom_prompt:customPrompt,prompt_details:promptDetails,outpaint_margin:margin,maintain_style:maintainStyle,seed,
          source_bounds:window.DeckadenceSpotSelection.artworkBounds(Object.fromEntries(['width','height','x','y'].map(key=>['art_box_'+key,Number(fields['art_box_'+key].value)])))})});
      operation.url=apiUrl(base+"/"+created.job);
      if(mirrorGeneration!==operation||token!==session)return;
      dialog.querySelector("[data-spot-cancel-generation]").disabled=false;
      renderMirrorJob();
      for(;;) {
        if(mirrorGeneration!==operation||token!==session||current?.artworkChanged)return;
        const result=await api(operation.url,{signal:operation.controller.signal});
        if(mirrorGeneration!==operation||token!==session)return;
        mirrorServerStage(result);
        if(result.state==="complete") {
          if(token!==session||current?.artworkChanged||editingLayer!==layer||mirrorGeneration!==operation)return;
          fields.effect_scene.value=result.scene;fields.effect_scene_theme.value=theme;
          fields.effect_seed.value=String(seed);
          fields.effect_scene_custom_prompt.value=result.scene_custom_prompt??(theme==="custom"?customPrompt:"");
          fields.effect_scene_prompt_details.value=result.scene_prompt_details??promptDetails;
          fields.effect_scene_maintain_style.value=String(result.scene_maintain_style??maintainStyle);
          fields.effect_scene_margin.value=String(result.scene_margin??0);
          fields.effect_scene_padding_x.value=String(result.scene_padding?.[0]??0);
          fields.effect_scene_padding_y.value=String(result.scene_padding?.[1]??0);
          fields.effect_scene_source.value=sourceSignature;
          // Artwork-only generation makes a complete scene usable anywhere in
          // the card mask. Keep the older footprint for legacy backends/scenes.
          fields.effect_scene_selection.value=result.source_region==="fixed_art_box"?btoa("\xff".repeat(756*1056/8)):selectionBits;
          operation.retain=Boolean(result.diagnostics_available);
          mirrorDiagnostics=operation.retain?{url:operation.url,session:token,layer}:null;
          updateMirrorJob({phase:'review',finished:Date.now(),title:'Mirror scene ready · not saved',message:'Review the generated art and its appearance in the shards. Save for this card to keep it.'});
          scheduleRender();markChanged();message("Mirror scene rendered. Review it, then save for this card.");break;
        }
        if(result.state==="failed")throw new Error(result.message||"Mirror generation failed. Your previous layer is unchanged.");
        if(result.state==="cancelled"){updateMirrorJob({phase:'cancelled',finished:Date.now(),title:'Generation cancelled',message:'Your previous mirror scene is unchanged.'});break;}
        if(result.message)message(result.message);
        await new Promise(resolve=>setTimeout(resolve,1500));
      }
    } catch(error) {
      if(error.name!=="AbortError"&&token===session&&mirrorGeneration===operation){updateMirrorJob({phase:'failed',finished:Date.now(),title:'Could not generate a mirror scene',message:error.message});message(error.message,true);}
    } finally {
      if(operation.url&&!operation.retain)fetch(operation.url,{method:"DELETE"}).catch(()=>{});
      if(mirrorGeneration===operation){mirrorGeneration=null;stopMirrorClock();busy=false;dialog.querySelector("[data-spot-cancel-generation]").hidden=true;updateShardControls();controls();}
    }
  }
  function cancelMirrorGeneration() {
    const operation=mirrorGeneration;if(!operation)return;
    mirrorGeneration=null;operation.controller.abort();
    stopMirrorClock();updateMirrorJob({phase:'cancelled',finished:Date.now(),title:'Generation cancelled',message:'Your previous mirror scene is unchanged.'});
    if(operation.url)fetch(operation.url,{method:"DELETE"}).catch(()=>{});
    busy=false;dialog.querySelector("[data-spot-cancel-generation]").hidden=true;
    message("Render cancelled. Your previous layer is unchanged.");controls();
  }
  dialog.querySelector("[data-spot-generate-mirror]").addEventListener("click",generateMirrorScene);
  dialog.querySelector("[data-spot-cancel-generation]").addEventListener("click",cancelMirrorGeneration);
  mirrorJobPart('job-cancel').addEventListener('click',()=>mirrorJobState?.kind==='disintegrate'?disintegrate.cancel():cancelMirrorGeneration());
  dialog.querySelector('[data-spot-open-mirror-job]').addEventListener('click',openMirrorJob);
  mirrorJobPart('job-view').addEventListener('click',()=>mirrorJobState?.kind==='disintegrate'?disintegrate.inspect():dialog.querySelector('[data-spot-view-art]').click());
  const retryAI=document.createElement('button');retryAI.type='button';retryAI.dataset.spotMirrorJobRetry='';retryAI.hidden=true;retryAI.textContent='Retry reconstruction';
  mirrorJobPart('job-view').after(retryAI);retryAI.addEventListener('click',()=>disintegrate.generate());
  if(mirrorExport)mirrorJobPart('job-view').after(mirrorExport);
  mirrorExport?.addEventListener('click',async()=>{
    const saved=mirrorDiagnostics;if(!saved||busy||saved.session!==session||saved.layer!==editingLayer)return;
    mirrorExport.disabled=true;
    try {
      const path=new URL(saved.url,location.href);path.pathname+='/diagnostics';
      const response=await fetch(path,{cache:'no-store'});
      if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'Generate a new scene to export its diagnostics.');}
      const blob=await response.blob();if(saved!==mirrorDiagnostics||saved.session!==session)return;
      const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;
      link.download='generation-diagnostics-'+new URL(saved.url,location.href).pathname.split('/').pop()+'.zip';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
      message('AI diagnostics exported, including each stage’s reference, prompt and output.');
    } catch(error){if(saved.session===session)message(error.message,true);}
    finally{if(saved.session===session)updateShardControls();}
  });
  const liveMask = document.createElement("canvas");
  const liveContext = liveMask.getContext("2d");
  const strokeMask = document.createElement("canvas"), strokeBase = document.createElement("canvas");
  strokeMask.width = strokeBase.width = mask.width; strokeMask.height = strokeBase.height = mask.height;
  const strokeContext = strokeMask.getContext("2d"), baseContext = strokeBase.getContext("2d");
  const save = form.querySelector(".spot-card-save");
  // Cached templates may still contain the former submit button.
  save.type = "button";
  const status = dialog.querySelector("[data-spot-status]");
  const hostSelector = ".custom-draft-current-card-row, .custom-draft-current-grid-card, .deckbuilder-card[data-card-uuid], .chaos-pack-view-card[data-card-uuid]";
  const viewImageSelector = "img[data-finishing-card-uuid], img[data-card-uuid], [data-card-effects] img, .campaign-test-draft-virtual-card-image";
  const imageSelector = ".custom-draft-current-card-image, .chaos-pack-view-image, .campaign-test-draft-picked-thumb";
  const cache = new Map(), waiting = new Map(), versions = new Map(), boundButtons = new WeakSet();
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h12a2 2 0 0 1 2 2v15H4zM11 7l1.3 3.7L16 12l-3.7 1.3L11 17l-1.3-3.7L6 12l3.7-1.3ZM19 3v5M16.5 5.5h5"/></svg>';
  let lookupTimer, renderFrame, session = 0, current = null, ready = false, busy = false;
  let history = [], historyIndex = -1, hasInk = false, maskReviewed = false, removal = false, activeStroke = null;
  let tool = "paint", view = "effect", artworkUrl = "", maskUrl = "", scopeToken = null;
  let maskVersion=0,encodedMaskVersion=-1,coverageVersion=-1,effectRenderTimer=null,artworkRevision=0;
  const maskPreviewUrls=new Map();
  const requestId=()=>crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('');
  const previewClient=requestId(),previewSequences=new Map();
  function previewHeaders(kind){const key=previewClient+':'+session+':'+kind,n=(previewSequences.get(key)||0)+1;previewSequences.set(key,n);return {'X-Studio-Preview-Session':key,'X-Studio-Preview-Sequence':String(n)};}
  function maskChanged(){maskVersion++;}
  function encodedMask(){if(encodedMaskVersion!==maskVersion){maskUrl=mask.toDataURL('image/png');encodedMaskVersion=maskVersion;}return maskUrl;}
  function maskPreviewUrl(layer,png) {
    const previous=maskPreviewUrls.get(layer);
    if(previous?.png===png)return previous.url;
    const prefix='data:image/png;base64,';
    let url=png;
    if(png.startsWith(prefix)) {
      // Detailed paths can exceed the browser's CSS value limit. Keep the
      // original PNG for save/undo, but reference its bytes by a short URL in
      // foil, gloss and overlay styles. No mask resolution is lost.
      const binary=atob(png.slice(prefix.length)),bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    }
    if(previous?.url.startsWith('blob:'))URL.revokeObjectURL(previous.url);
    maskPreviewUrls.set(layer,{png,url});
    return url;
  }
  function clearMaskPreviews() {
    for(const {url} of maskPreviewUrls.values())if(url.startsWith('blob:'))URL.revokeObjectURL(url);
    maskPreviewUrls.clear();
  }
  function scheduleEffectRender(){clearTimeout(effectRenderTimer);effectRenderTimer=setTimeout(()=>{effectRenderTimer=null;scheduleRender();},180);}
  function invalidateDetections(){
    artworkRevision++;subjectMasks.clear();frameMasks.clear();textRegions=[];textSymbols=[];showingText=showingFrame=false;
    for(const draft of Object.values(layerDrafts)){draft.textRegions=[];draft.textSymbols=[];if(draft.generation){draft.generation.text_regions=[];draft.generation.text_symbols=[];}}
  }
  let disableGlossOnView = false;
  let metadata = null, textRegions = [], textSymbols = [], showingText = false;
  let subjectMasks = new Map(), frameMasks = new Map(), showingFrame = false;
  // Reuse the selection engine while keeping each finish's pixels, controls,
  // and undo history independent. Both drafts share one atomic card save.
  let editingLayer = "mask", layerDrafts = {};
  const layerCopy = [];
  const copyWalker = document.createTreeWalker(dialog.querySelector(".spot-card-controls"), NodeFilter.SHOW_TEXT);
  while(copyWalker.nextNode()) {
    const node=copyWalker.currentNode;
    if(/foil|opaque|mask/iu.test(node.textContent) && !node.parentElement.closest('[data-spot-layer], [data-spot-effect-label], [data-spot-overlay-label], [data-spot-fixed-copy]')) layerCopy.push([node,node.textContent]);
  }
  const layerWording = text => printedLayer() ? text
    .replace(/spot foiling/giu,"effect").replace(/Opaque · no foil/gu,"Exclude Effect").replace(/Foiled/gu,"Effect").replace(/foiled/gu,"effect")
    .replace(/Foil strength/gu,"Mask strength").replace(/Foil/gu,"Effect").replace(/foil/gu,"effect").replace(/Opaque/gu,"No effect").replace(/opaque/gu,"clear")
    : editingLayer !== "gloss" ? text : text
    .replace(/Spot foiling/gu,"Gloss").replace(/spot foiling/gu,"gloss").replace(/Foiling/gu,"Gloss").replace(/foiling/gu,"gloss")
    .replace(/Opaque · no foil/gu,"No gloss").replace(/Foiled/gu,"Glossy").replace(/foiled/gu,"glossy")
    .replace(/Foil strength/gu,"Gloss amount").replace(/Foil/gu,"Gloss").replace(/foil/gu,"gloss").replace(/Opaque/gu,"No gloss").replace(/opaque/gu,"unglossed")
    .replace(/Mask cleanup/gu,"Gloss cleanup").replace(/Mask only/gu,"Gloss only").replace(/Mask overlay/gu,"Gloss overlay").replace(/Mask covers/gu,"Gloss covers");
  function activeSaved() {return editingLayer!=="mask" ? Boolean(current?.record?.[editingLayer]) : Boolean(current?.record && current.record.foil_enabled!==false);}
  function setLayerLabels() {
    dialog.querySelector('[data-studio-finish-title]').textContent=printedLayer()?'Effect':editingLayer==='gloss'?'Gloss':'Foil';
    const selectedFinish=fields.finish.value;
    for(const [node,copy] of layerCopy)node.textContent=layerWording(copy);
    dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.spotLayer===editingLayer)));
    const foilChoices=[["foil","Rainbow foil"],["surge","Surge foil"]];
    if(current?.record?.finish==="chocobo"||layerDrafts.mask?.values.finish==="chocobo")foilChoices.push(["chocobo","Chocobo foil (legacy)"]);
    fields.finish.replaceChildren(...(printedLayer() ? Object.entries(metadata?.effect_types||{}).sort((a,b)=>a[1].localeCompare(b[1])) : editingLayer==="gloss" ? [["gloss","Gloss"],["polished","Polished gloss"]] : foilChoices).map(([value,label])=>new Option(label,value)));
    const selectedParticle=fields.effect_particle_type.value;
    fields.effect_particle_type.replaceChildren(...Object.entries(metadata?.confetti_glitter_types||{glitter_1:"Glitter - Type 1"}).map(([value,label])=>new Option(label,value)));
    if([...fields.effect_particle_type.options].some(option=>option.value===selectedParticle))fields.effect_particle_type.value=selectedParticle;
    const selectedUkiyo=fields.effect_ukiyo_type.value;
    fields.effect_ukiyo_type.replaceChildren(...Object.entries(metadata?.ukiyo_types||{wind_ribbons:"Clouds - Wind ribbons"}).map(([value,label])=>new Option(label,value)));
    if([...fields.effect_ukiyo_type.options].some(option=>option.value===selectedUkiyo))fields.effect_ukiyo_type.value=selectedUkiyo;
    const selectedTrail=fields.effect_dragon_trail.value;
    fields.effect_dragon_trail.replaceChildren(...Object.entries(metadata?.dragon_trails||{winding_magic:'Wandering magic'}).map(([value,label])=>new Option(label,value)));
    const oldDragonTrails={spirit_ribbons:'Spirit ribbons',arc_lightning:'Arc lightning',entwined_streams:'Entwined streams',arcane_wake:'Arcane wake'};
    for(const value of new Set([selectedTrail,...Object.values(layerDrafts).map(draft=>draft.values.effect_dragon_trail)]))
      if(oldDragonTrails[value])fields.effect_dragon_trail.add(new Option('Previous path · '+oldDragonTrails[value],value));
    if([...fields.effect_dragon_trail.options].some(option=>option.value===selectedTrail))fields.effect_dragon_trail.value=selectedTrail;
    const selectedDragonColor=fields.effect_dragon_color_effect.value;
    fields.effect_dragon_color_effect.replaceChildren(...Object.entries(metadata?.dragon_color_effects||{normal:'Normal'}).map(([value,label])=>new Option(label,value)));
    if([...fields.effect_dragon_color_effect.options].some(option=>option.value===selectedDragonColor))fields.effect_dragon_color_effect.value=selectedDragonColor;
    // Existing cards can replace/remove a retired layer without losing its
    // stored settings when saving a different tab. It cannot be selected anew.
    if(printedLayer()&&layerDrafts[editingLayer]?.values.finish==="invisible_ink") {
      const retired=new Option("Removed effect · choose another or remove this layer","invisible_ink");retired.disabled=true;fields.finish.add(retired);
    }
    if([...fields.finish.options].some(option=>option.value===selectedFinish))fields.finish.value=selectedFinish;
    dialog.querySelector("[data-spot-effect-label]").textContent=printedLayer() ? "Effect" : editingLayer==="gloss" ? "Gloss effect" : "Foil effect";
    dialog.querySelector("[data-spot-finish-legend]").textContent=printedLayer() ? "Printable effect" : "Preview finish";
    dialog.querySelector(".spot-finish-controls").classList.toggle("is-printable",printedLayer());
    dialog.querySelector("[data-spot-preview-only]").hidden=printedLayer();
    dialog.querySelector("[data-spot-pattern-controls]").hidden=!printedLayer();
    dialog.querySelector("[data-spot-effect-strength-label]").textContent=printedLayer() ? "Effect strength" : "Preview Strength";
    dialog.querySelector("[data-spot-overlay-label]").textContent=dialog.classList.contains("studio-dual-dock") ? "Mask Color" : printedLayer() ? "Effect overlay color" : editingLayer==="gloss" ? "Gloss overlay color" : "Mask overlay color";
    dialog.querySelector('[data-spot-view="effect"]').textContent="Preview";
    stage.dataset.editLayer=editingLayer;
    dialog.querySelector('[data-spot-view="mask"]').textContent=printedLayer() ? "Effect overlay" : editingLayer==="gloss" ? "Gloss overlay" : "Mask overlay";
    dialog.querySelector("[data-spot-remove]").textContent=printedLayer() ? "Remove "+layerNames[editingLayer] : editingLayer==="gloss" ? "Remove gloss" : "Remove spot foiling";
    dialog.querySelector("[data-spot-invert]").title="Invert the mask across the whole card. 25% becomes 75%.";
    canvas.setAttribute("aria-label", `Paint or erase the ${printedLayer()?"effect":editingLayer==="gloss"?"gloss":"foil"} selection. Use the selection buttons as a keyboard alternative.`);
  }
  dialog.querySelector("[data-spot-new-pattern]").addEventListener("click",()=>{
    fields.effect_seed.value=String(crypto.getRandomValues(new Uint32Array(1))[0]%2147483648);markChanged();scheduleRender();
  });
  function captureLayer() {
    mirrorLayers?.flush();
    trekTransporter?.flush();
    disintegrate?.flush();
    const values={};
    for(const field of fields)if(field.name && !["mask_file","zoom"].includes(field.name))values[field.name]=field.type==="checkbox"?field.checked:field.value;
    return {values,generation:generationOptions(),png:encodedMask(),width:mask.width,
      history:[...history],historyIndex,maskReviewed,removal,enabled:!removal&&(hasInk||maskReviewed||activeSaved()||printedLayer()&&['mirror_layers','federation_transporter','disintegrate'].includes(fields.finish.value)),recentColors:[...recentColors],textRegions,textSymbols};
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
      maskReviewed:false,removal:false,enabled:Boolean(record),recentColors:record?.generation?.color_swatches||[],textRegions:record?.generation?.text_regions||[],textSymbols:record?.generation?.text_symbols||[]};
  }
  function effectDraft(record,base,layer) {
    const draft=glossDraft(record,base);
    Object.assign(draft.values,{finish:windWaveEffect(record?.finish||"")?"ukiyo_e":legacyGlitter(record?.finish)?"confetti_glitter":record?.finish||"confetti_glitter",
      effect_transporter_emblem:record?.transporter_emblem||'tos_badge',effect_transporter_style:record?.transporter_style||'multicolor',effect_transporter_alignment:record?.transporter_alignment||'emblem',
      effect_transporter_layout:JSON.stringify(window.DeckadenceTrekTransporter.fromRecord(record)),
      effect_disintegrate:JSON.stringify(record?.disintegrate||window.DeckadenceDisintegrate.defaults()),
      effect_dragon_emblem:record?.dragon_emblem||'bolas_command',effect_dragon_trail:record?.dragon_trail||'winding_magic',effect_dragon_alignment:record?.dragon_alignment||'dragon',effect_dragon_color_effect:record?.dragon_color_effect||'normal',
      effect_particle_type:record?.particle_type||(legacyGlitter(record?.finish)?record.finish:"glitter_1"),effect_particle_flip:Boolean(record?.flip_horizontal),
      effect_ukiyo_type:record?.ukiyo_type||(windWaveEffect(record?.finish||"")?record.finish.replace(/_sparse$/u,""):"wind_ribbons"),effect_ukiyo_sparse:record?.sparse??Boolean(record?.finish?.endsWith("_sparse")),effect_ukiyo_flip:Boolean(record?.flip_horizontal),strength:String(record?.strength||65),
      overlay_color:record?.overlay_color||(layer==="effect1"?"#FF9800":"#76FF03"),
      effect_origin_x:String(record?.origin_x??20),effect_origin_y:String(record?.origin_y??72),
      ...Object.fromEntries(Object.entries(solarDefaults).map(([key,value])=>['effect_solar_'+key,key==='off_auto'?(record?.solar?.off_auto??!record?.solar?.off_color):typeof value==='boolean'?(record?.solar?.[key]??value):String(record?.solar?.[key]??value)])),
      effect_disabled:Boolean(record?.disabled),effect_stacked:Boolean(record?.stacked),effect_scale:String(record?.scale||100),effect_density:String(record?.density||100),
      effect_black_depth:String(record?.black_depth??0),effect_silver_brightness:String(record?.silver_brightness??90),
      effect_mirrors:JSON.stringify(record?.mirrors||window.DeckadenceMirrorLayers.defaults()),
      effect_rotation:String(record?.rotation??0),effect_scene_rotation:String(record?.shards?.scene_rotation??0),
      effect_scene_zoom:String(record?.shards?.scene_zoom??100),effect_scene_skew:String(record?.shards?.scene_skew??0),
      effect_scene_x:String(record?.shards?.scene_x??0),effect_scene_y:String(record?.shards?.scene_y??0),
      effect_scene_flip_horizontal:Boolean(record?.shards?.scene_flip_horizontal),effect_scene_flip_vertical:Boolean(record?.shards?.scene_flip_vertical),
      effect_color:legacyGlitter(record?.finish)?"#FFFFFF":record?.color||effectColors[record?.finish]||(!record?"#FFFFFF":"#FFE7A0"),
      effect_translucence:String(record?.translucence||0),
      effect_track_x:String(record?.position_x??0),effect_track_y:String(record?.position_y??0),effect_track_transparency:String(record?.transparency??0),
      effect_shard_template:record?.shards?.template||"falling",effect_shard_theme:record?.shards?.theme||"dark",
      effect_shard_size:String(record?.shards?.template_scale??100),
      effect_shard_x:String(record?.shards?.template_x??0),effect_shard_y:String(record?.shards?.template_y??0),
      effect_mirror:Boolean(record?.shards?.mirror),effect_tint:String(record?.shards?.tint??18),effect_scene:record?.shards?.scene||"",
      effect_scene_theme:record?.shards?.scene_theme||record?.shards?.theme||"dark",
      effect_custom_prompt:record?.shards?.custom_prompt||"",effect_scene_custom_prompt:record?.shards?.scene_custom_prompt||"",
      effect_prompt_details:record?.shards?.prompt_details||"",effect_scene_prompt_details:record?.shards?.scene_prompt_details||"",
      effect_maintain_style:record?.shards?.maintain_style??!record?.shards?.scene,
      effect_scene_maintain_style:String(record?.shards?.scene_maintain_style??false),
      effect_outpaint_margin:String(record?.shards?.outpaint_margin??(record?.shards?.scene?(record.shards.scene_margin??0):30)),
      effect_scene_margin:String(record?.shards?.scene_margin??0),
      effect_scene_padding_x:String(record?.shards?.scene_padding?.[0]??0),effect_scene_padding_y:String(record?.shards?.scene_padding?.[1]??0),
      effect_scene_source:record?.shards?.scene_source||"",effect_scene_selection:record?.shards?.scene_selection||"",
      effect_seed:String(record?.seed??(layer==="effect1"?73:197))});
    draft.previewUrl=record?.overlay_url;draft.savedPng=draft.png;
    if(!record)draft.values.selection_mode="none";
    return draft;
  }
  function effectParams(values) {
    return {finish:values.finish,disabled:Boolean(values.effect_disabled),strength:Number(values.strength),scale:Number(values.effect_scale),density:Number(values.effect_density),seed:Number(values.effect_seed),color:values.effect_color||effectColors[values.finish]||"#FFE7A0",translucence:Number(values.effect_translucence||0),rotation:Number(values.effect_rotation||0),
      ...(values.finish==="mirror_layers"?{mirrors:JSON.parse(values.effect_mirrors||JSON.stringify(window.DeckadenceMirrorLayers.defaults()))}:{}),
      ...(values.finish==='disintegrate'?{disintegrate:JSON.parse(values.effect_disintegrate||JSON.stringify(window.DeckadenceDisintegrate.defaults())),strength:100,scale:100,density:100,rotation:0}:{}),
      ...(values.finish==="dragon_strike"?{dragon_emblem:values.effect_dragon_emblem||'bolas_command',dragon_trail:values.effect_dragon_trail||'winding_magic',dragon_alignment:values.effect_dragon_alignment||'dragon',dragon_color_effect:values.effect_dragon_color_effect||'normal'}:{}),
      ...(values.finish==="federation_transporter"?{transporter_emblem:values.effect_transporter_emblem||'tos_badge',transporter_style:values.effect_transporter_style||'multicolor',transporter_alignment:values.effect_transporter_alignment||'emblem',transporter_layout:JSON.parse(values.effect_transporter_layout||JSON.stringify(window.DeckadenceTrekTransporter.defaults())),strength:100,scale:100,density:100,color:'#FFFFFF',rotation:0}:{}),
      ...(values.finish==="confetti_glitter"?{particle_type:values.effect_particle_type||"glitter_1",flip_horizontal:Boolean(values.effect_particle_flip)}:{}),
      ...(values.finish==="ukiyo_e"?{ukiyo_type:values.effect_ukiyo_type||"wind_ribbons",sparse:Boolean(values.effect_ukiyo_sparse),flip_horizontal:Boolean(values.effect_ukiyo_flip)}:{}),
      ...(values.finish==="ripple"?{origin_x:Number(values.effect_origin_x??20),origin_y:Number(values.effect_origin_y??72)}:{}),
      ...(values.finish==='raised_solar'?{solar:Object.fromEntries(Object.entries(solarDefaults).map(([key,value])=>[key,key==='off_color'?(values['effect_solar_'+key]??value):typeof value==='boolean'?Boolean(values['effect_solar_'+key]??value):Number(values['effect_solar_'+key]??value)])),density:100}:{}),
      ...(["flame_1","flame_2"].includes(values.finish)?{stacked:Boolean(values.effect_stacked)}:{}),
      ...(values.finish==="silver_black"?{black_depth:Number(values.effect_black_depth??0),silver_brightness:Number(values.effect_silver_brightness??90)}:{}),
      ...(pathEffects.has(values.finish)?{position_x:values.finish==='federation_transporter'?0:Number(values.effect_track_x||0),position_y:values.finish==='federation_transporter'?0:Number(values.effect_track_y||0),transparency:values.finish==='federation_transporter'?0:Number(values.effect_track_transparency||0)}:{}),
      ...(values.finish==="mirror_shards"?{shards:{template:values.effect_shard_template||"falling",template_scale:Number(values.effect_shard_size??100),template_x:Number(values.effect_shard_x||0),template_y:Number(values.effect_shard_y||0),theme:values.effect_shard_theme||"dark",mirror:Boolean(values.effect_mirror),tint:Number(values.effect_tint??18),scene:values.effect_scene||"",scene_theme:values.effect_scene_theme||"dark",scene_source:values.effect_scene_source||"",scene_selection:values.effect_scene_selection||"",scene_rotation:Number(values.effect_scene_rotation||0),scene_zoom:Number(values.effect_scene_zoom||100),scene_skew:Number(values.effect_scene_skew||0),scene_x:Number(values.effect_scene_x||0),scene_y:Number(values.effect_scene_y||0),scene_flip_horizontal:Boolean(values.effect_scene_flip_horizontal),scene_flip_vertical:Boolean(values.effect_scene_flip_vertical),custom_prompt:(values.effect_custom_prompt||"").trim(),scene_custom_prompt:values.effect_scene_custom_prompt||"",prompt_details:(values.effect_prompt_details||"").trim(),scene_prompt_details:values.effect_scene_prompt_details||"",maintain_style:Boolean(values.effect_maintain_style),scene_maintain_style:values.effect_scene_maintain_style==="true",outpaint_margin:Number(values.effect_outpaint_margin??30),scene_margin:Number(values.effect_scene_margin??0),scene_padding:[Number(values.effect_scene_padding_x||0),Number(values.effect_scene_padding_y||0)]}}:{})};
  }
  function effectControlValues() {
    mirrorLayers?.flush();
    trekTransporter?.flush();
    disintegrate?.flush();
    const names=["finish","strength","effect_scale","effect_density","effect_seed","effect_color","effect_translucence","effect_rotation","effect_scene_rotation","effect_scene_zoom","effect_scene_skew","effect_scene_x","effect_scene_y","effect_shard_template","effect_shard_size","effect_shard_x","effect_shard_y","effect_shard_theme","effect_mirror","effect_tint","effect_scene","effect_scene_theme","effect_scene_source","effect_scene_selection","effect_custom_prompt","effect_scene_custom_prompt","effect_maintain_style","effect_scene_maintain_style","effect_outpaint_margin","effect_scene_margin","effect_scene_padding_x","effect_scene_padding_y"];
    names.push("effect_particle_type","effect_particle_flip","effect_ukiyo_type","effect_ukiyo_sparse","effect_ukiyo_flip","effect_origin_x","effect_origin_y","effect_disabled","effect_stacked","effect_track_x","effect_track_y","effect_track_transparency","effect_black_depth","effect_silver_brightness");
    names.push('effect_mirrors');
    names.push('effect_disintegrate');
    names.push('effect_dragon_emblem','effect_dragon_trail','effect_dragon_alignment','effect_dragon_color_effect');
    names.push('effect_transporter_emblem','effect_transporter_style','effect_transporter_alignment');
    names.push('effect_transporter_layout');
    names.push(...solarFields);
    names.push('effect_prompt_details','effect_scene_prompt_details','effect_scene_flip_horizontal','effect_scene_flip_vertical');
    return Object.fromEntries(names.map(name=>[name,fields[name].type==="checkbox"?fields[name].checked:fields[name].value]));
  }
  function visualEffectParams(params){
    const result={...params};delete result.translucence;
    if(result.mirrors){
      const value={...result.mirrors};
      for(const key of ['target','variation','theme','prompt','maintain_style','layout','layout_seed','layout_origin'])delete value[key];
      value.objects=(value.objects||[]).map(obj=>Object.fromEntries(Object.entries(obj).filter(([key])=>!['prompt','theme','style','home','focus'].includes(key))));
      result.mirrors=value;
    }
    if(result.shards){const keys=['template','mirror','scene','tint','scene_rotation','scene_zoom','scene_skew','template_scale','scene_x','scene_y','scene_padding','template_x','template_y','scene_flip_horizontal','scene_flip_vertical'];result.shards=Object.fromEntries(Object.entries(result.shards).filter(([key])=>keys.includes(key)));}
    return result;
  }
  function showPrintedPreviews() {effects.setPrintedEffects(stage,["effect1","effect2"].map(layer=>{const item=effectPreviews.get(layer);return item?.url?{url:item.url,translucence:item.translucence,finish:item.finish,density:item.density,black_depth:item.black_depth,silver_brightness:item.silver_brightness}:null;}));}
  function clearPrintedPreviews() {
    for(const item of effectPreviews.values()){clearTimeout(item.timer);item.controller?.abort();if(item.url?.startsWith("blob:"))URL.revokeObjectURL(item.url);}
    effectPreviews.clear();effects.setPrintedEffects(stage,[]);
  }
  function queuePrintedPreview(layer,draft) {
    const previous=effectPreviews.get(layer);
    if(!draft?.enabled||!draft.png||draft.values.effect_disabled) {
      clearTimeout(previous?.timer);previous?.controller?.abort();
      if(previous?.url?.startsWith("blob:"))URL.revokeObjectURL(previous.url);
      effectPreviews.delete(layer);showPrintedPreviews();return;
    }
    const params=effectParams(draft.values),key=JSON.stringify(visualEffectParams(params))+draft.png;
    const shards=params.shards;
    if(shards?.mirror&&(!shards.scene||shards.scene_theme!==shards.theme||shards.scene_margin!==shards.outpaint_margin||shards.maintain_style!==shards.scene_maintain_style||shards.prompt_details!==shards.scene_prompt_details||shards.theme==="custom"&&(!shards.custom_prompt||shards.custom_prompt!==shards.scene_custom_prompt)))return;
    const blend=effectBlend(params);
    if(previous?.key===key){previous.translucence=blend;showPrintedPreviews();return;}
    clearTimeout(previous?.timer);previous?.controller?.abort();
    const item={key,url:previous?.url||null,translucence:blend,finish:params.finish,density:params.density,black_depth:params.black_depth,silver_brightness:params.silver_brightness,controller:new AbortController()};effectPreviews.set(layer,item);
    if(draft.previewUrl&&draft.png===draft.savedPng) {item.url=draft.previewUrl;showPrintedPreviews();return;}
    const token=session;
    item.timer=setTimeout(async()=>{
      try {
        const source=new Image();source.src=draft.png;await source.decode();
        if(token!==session||effectPreviews.get(layer)!==item)return;
        const small=document.createElement("canvas");small.width=756;small.height=1056;small.getContext("2d").drawImage(source,0,0,756,1056);
        const body=JSON.stringify({effect:params,mask_data:small.toDataURL('image/png')});let response;
        for(let attempt=0;attempt<4;attempt++){
          if(token!==session||effectPreviews.get(layer)!==item)return;
          response=await fetch(apiUrl(endpoint(current.target)+"/effect-preview"),{method:"POST",headers:{"Content-Type":"application/json",...previewHeaders('effect:'+layer)},body,signal:item.controller.signal});
          if(response.status!==429)break;
          await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
        }
        if(response.status===204)return;
        if(!response.ok)throw new Error((await response.json()).message||"Effect preview failed.");
        const blob=await response.blob();
        if(token!==session||effectPreviews.get(layer)!==item)return;
        if(item.url?.startsWith("blob:"))URL.revokeObjectURL(item.url);
        item.url=URL.createObjectURL(blob);showPrintedPreviews();if(layer===editingLayer)mirrorLayers?.previewReady();
      }catch(error){if(error.name!=="AbortError"&&token===session&&effectPreviews.get(layer)===item){effectPreviews.delete(layer);message(error.message,true);}}
    },180);
  }
  async function switchLayer(layer) {
    if(!ready || busy || activeStroke)return;
    if(artEditor.active){artEditor.setActive(false);setLayerLabels();setView(view==='art'?'effect':view);}
    if(layer===editingLayer){renderMask();controls();message('Editing '+layerNames[layer]+'.');return;}
    const token=session;layerDrafts[editingLayer]=captureLayer();const draft=layerDrafts[layer];
    ready=false;controls();
    try {
      let saved=null;if(draft.png){saved=new Image();saved.src=draft.png;await saved.decode();}
      if(token!==session || current?.artworkChanged)return;
      editingLayer=layer;setLayerLabels();
      for(const [name,value] of Object.entries(draft.values))if(fields[name]){if(fields[name].type==="checkbox")fields[name].checked=value;else fields[name].value=value;}
      updateEffectColor();
      sizeMask(Math.max(draft.width,saved?.naturalWidth||0));ctx.clearRect(0,0,mask.width,mask.height);if(saved)ctx.drawImage(saved,0,0,mask.width,mask.height);
      textRegions=draft.textRegions;textSymbols=draft.textSymbols||[];recentColors=draft.recentColors;removal=draft.removal;maskReviewed=draft.maskReviewed;
      showingText=false;showingFrame=false;history=[...draft.history];historyIndex=draft.historyIndex;
      ready=true;updatePocketSize();updateBrushControls();updateEdgeControls();updateExclusionControls();updateRegionControls();updateFrameControls();chooseColor(fields.selection_color.value);
      dialog.querySelector("[data-spot-strength-value]").value=fields.strength.value+"%";
      coverage();renderMask();if(!history.length){history=[maskUrl];historyIndex=0;}updateMirrorStatus();controls();
      message(removal ? "Removal pending. Save to apply." : "Editing "+layerNames[layer]+".");
    }catch(error){if(token===session)message("Could not load this layer. "+error.message,true);}
    finally{if(token===session){ready=true;controls();}}
  }
  dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.addEventListener("click",()=>switchLayer(button.dataset.spotLayer)));
  let artworkColors = [], recentColors = [], maskArea = "0";
  const artEditor=window.DeckadenceArtEditor.create({dialog,stage,image,viewport,
    onChange:()=>{invalidateDetections();if(ready&&current){renderMask();controls();message(artEditor.dirty?'Unsaved artwork edits.':'Artwork unchanged.');}},
    onBusy:value=>{busy=value;controls();},onMessage:text=>message(text),onTool:()=>syncPreviewInteraction(),
    onView:value=>{setView(value);if(ready)renderMask();}});
  mirrorLayers=window.DeckadenceMirrorLayers.create({dialog,stage,
    active:()=>printedLayer()&&!artEditor.active&&!removal&&fields.finish.value==='mirror_layers',
    busy:()=>busy||!ready||Boolean(activeStroke),scope:()=>session+':'+editingLayer,
    generatorReady:()=>Boolean(metadata?.mirror_generator_ready),hasMask:()=>hasInk,
    canMove:()=>tool==='pan'&&view==='effect'&&!showingText&&!showingFrame&&!fields.effect_disabled.checked,
    surfaceParams:()=>effectParams(effectControlValues()),
    surfaceMask:()=>hasInk?maskUrl:null,
    surfaceOpacity:()=>{
      const overrides=JSON.parse(fields.effect_mirrors.value||'{}').objects?.some(o=>Object.hasOwn(o.appearance||{},'strength'));
      return (overrides?1:Number(fields.strength.value)/100)*(1-Number(fields.effect_translucence.value)/100);
    },
    appearanceDefaults:()=>({color:fields.effect_color.value,strength:Number(fields.strength.value)}),
    livePreview:value=>{stage.dataset.mirrorLive=value?editingLayer:'';},
    setBusy:value=>{busy=value;controls();},message,
    changed:()=>{scheduleEffectRender();markChanged();},settingsChanged:()=>message('Unsaved generation settings. Generate artwork to use them.'),moveTool:()=>{setTool('pan');setView('effect');syncPreviewInteraction();},
    request:(route,body,signal)=>api(apiUrl(endpoint(current.target)+'/'+route),{method:'POST',headers:{'Content-Type':'application/json',...(route==='mirror-surfaces'?previewHeaders('surfaces:'+editingLayer):{})},body:JSON.stringify(body),signal}),
    url:route=>apiUrl(endpoint(current.target)+'/'+route),
    focusSource:()=>({image:artEditor.artworkSource(),bounds:window.DeckadenceSpotSelection.artworkBounds(artBoxOptions())}),
    generationInputs:()=>{
      const source=document.createElement('canvas');source.width=1512;source.height=2112;source.getContext('2d').drawImage(artEditor.artworkSource(),0,0,1512,2112);
      const selection=document.createElement('canvas');selection.width=mask.width;selection.height=mask.height;
      if(hasInk)selection.getContext('2d').drawImage(mask,0,0);else selection.getContext('2d').fillRect(0,0,selection.width,selection.height);
      return {image:source.toDataURL('image/png').split(',')[1],mask_data:selection.toDataURL('image/png'),
        source_bounds:window.DeckadenceSpotSelection.artworkBounds(Object.fromEntries(['width','height','x','y'].map(key=>['art_box_'+key,Number(fields['art_box_'+key].value)])))};
    },
    view:encoded=>{artDialog.querySelector('h2').textContent='Mirror Layers · generated image';artImage.onload=()=>{artDialog.querySelector('[data-spot-art-info]').textContent=`${artImage.naturalWidth} × ${artImage.naturalHeight} pixels`;};setArtView(false);artImage.src='data:image/png;base64,'+encoded;artDialog.showModal();},
    copyPath:async value=>{
      if(busy||!ready)return;const token=session;busy=true;controls();
      const geometry={...value,scenes:{},shared_scene:'',objects:value.objects.map(o=>({...o,scene:''}))};
      try{
        const response=await fetch(apiUrl(endpoint(current.target)+'/mirror-path'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mirrors:geometry,width:mask.width})});
        if(!response.ok)throw new Error((await response.json()).message||'Could not copy mirror paths.');
        const bitmap=await createImageBitmap(await response.blob());
        try{if(token!==session)return;const copy=document.createElement('canvas');copy.width=mask.width;copy.height=mask.height;
          const c=copy.getContext('2d');if(!fields.effect_disabled.checked)c.drawImage(bitmap,0,0);if(hasInk){c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);}
          maskClipboard=copy;maskClipboardRegion=null;message('Visible mirror paths copied. Use Paste Mask or Append Paste on any layer.');
        }finally{bitmap.close();}
      }catch(error){if(token===session)message(error.message,true);}finally{if(token===session){busy=false;controls();}}
    }
  });
  window.DeckadenceArtAutoSelect?.create({dialog,editor:artEditor,
    request:(route,body)=>api(apiUrl(endpoint(current.target)+'/'+route),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),
    setBusy:value=>{busy=value;controls();},message});
  trekTransporter=window.DeckadenceTrekTransporter.create({dialog,stage,
    active:()=>printedLayer()&&!artEditor.active&&!removal&&fields.finish.value==='federation_transporter',
    busy:()=>busy||!ready||Boolean(activeStroke),scope:()=>session+':'+editingLayer,
    canMove:()=>tool==='pan'&&view==='effect'&&!showingText&&!showingFrame&&!fields.effect_disabled.checked,
    changed:()=>{scheduleEffectRender();markChanged();},
    moveTool:()=>{setTool('pan');setView('effect');syncPreviewInteraction();}});
  disintegrate=window.DeckadenceDisintegrate.create({dialog,stage,
    job:disintegrateJob,
    active:()=>printedLayer()&&!artEditor.active&&!removal&&fields.finish.value==='disintegrate',
    busy:()=>busy||!ready||Boolean(activeStroke),scope:()=>session+':'+editingLayer,
    seed:()=>Number(fields.effect_seed.value),
    canMove:()=>tool==='pan'&&view==='effect'&&!showingText&&!showingFrame&&!fields.effect_disabled.checked,
    changed:()=>{scheduleEffectRender();markChanged();},preview:scheduleEffectRender,refresh:controls,message,
    setBusy:value=>{busy=value;controls();},moveTool:()=>{setTool('pan');setView('effect');syncPreviewInteraction();},
    url:route=>apiUrl(endpoint(current.target)+'/'+route),
    inputs:()=>{
      const source=document.createElement('canvas');source.width=1512;source.height=2112;
      source.getContext('2d').drawImage(artEditor.artworkSource(),0,0,1512,2112);
      return {image_data:source.toDataURL('image/png'),source_bounds:window.DeckadenceSpotSelection.artworkBounds(artBoxOptions())};
    },
    beginTarget:async subject=>{
      const saved=document.createElement('canvas');saved.width=mask.width;saved.height=mask.height;saved.getContext('2d').drawImage(mask,0,0);
      const backup={mask:saved,history,historyIndex,maskReviewed,removal,view,tool,marquee,showingText,showingFrame};
      if(!await loadMask('data:image/png;base64,'+subject))throw new Error('The editor changed before the target could be opened.');
      history=[encodedMask()];historyIndex=0;maskReviewed=true;removal=false;marquee=null;showingText=false;showingFrame=false;
      coverage();setView('mask');setTool('paint');renderMask();message('Editing target cutout · Paint adds to the subject, Erase removes unwanted areas.');return backup;
    },
    targetCutout:()=>{
      coverage();if(!hasInk)throw new Error('Paint the subject before using the corrected target.');
      const cutout=document.createElement('canvas');cutout.width=1512;cutout.height=2112;
      const context=cutout.getContext('2d');context.drawImage(mask,0,0,1512,2112);context.globalCompositeOperation='source-in';context.drawImage(artEditor.artworkSource(),0,0,1512,2112);
      return cutout.toDataURL('image/png').split(',')[1];
    },
    endTarget:backup=>{
      if(!backup)return;
      sizeMask(backup.mask.width);ctx.drawImage(backup.mask,0,0);maskChanged();
      ({history,historyIndex,maskReviewed,removal,marquee,showingText,showingFrame}=backup);
      coverage();setView(backup.view);setTool(backup.tool);renderMask();
    },
    inspect:async (encoded,subject=false)=>{
      if(!encoded)return;const token=session,source=artEditor.artworkSource(),plate=new Image();plate.src='data:image/png;base64,'+encoded;await plate.decode();if(token!==session)return;
      const combined=document.createElement('canvas');combined.width=1512;combined.height=2112;
      const context=combined.getContext('2d');if(!subject)context.drawImage(source,0,0,1512,2112);context.drawImage(plate,0,0,1512,2112);
      artDialog.querySelector('h2').textContent=subject?'Disintegrate Foil · original subject cutout':'Disintegrate Foil · reconstructed background';artImage.onload=null;
      artDialog.querySelector('[data-spot-art-info]').textContent=subject?'Check that the entire subject is included, especially hands, feet and equipment. Use Refine target to correct missing or unwanted parts.':'Background behind the disintegrated subject. The effect reveals this scenery only where the original subject disappears.';
      setArtView(false);artImage.src=combined.toDataURL('image/png');artDialog.showModal();
    }
  });
  dialog.querySelector('[data-spot-edit-tab]').addEventListener('click',()=>{
    if(!ready||busy||activeStroke)return;
    artEditor.setActive(true);showingText=false;showingFrame=false;setView('art');renderMask();dialog.querySelectorAll('[data-spot-layer]').forEach(b=>b.setAttribute('aria-pressed','false'));controls();message('Editing artwork. Paint, select an area, or add text.');
  });
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
    if(response.status===204)return {ok:true,superseded:true};
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      const error = new Error(payload?.message || (response.ok
        ? "The server returned an unreadable response. Try again."
        : `The server could not complete the request (${response.status}). Try again.`));
      error.retryable = response.ok || response.status >= 500;
      throw error;
    }
    if(payload.preferences)disableGlossOnView=Boolean(payload.preferences.disable_gloss_on_view);
    return payload;
  }
  function originalArtUrl(raw) {
    if (!raw) return raw;
    const url = new URL(raw, location.href);
    return url.pathname.endsWith('/baked-art') ? (url.searchParams.get('original') || raw) : raw;
  }
  function describe(host) {
    // Search artwork stays lightweight, including its enlarged preview.
    if (host.closest('[data-card-finishing="off"]')) return null;
    const img = host.matches('img') ? host : host.querySelector(imageSelector);
    if(img?.closest("#cardSpotFoilDialog"))return null;
    const uuid = host.dataset.finishingCardUuid || host.dataset.cardUuid || img?.dataset.cardUuid || img?.closest("[data-card-uuid]")?.dataset.cardUuid;
    if (!img || !uuid) return null;
    const face = img.dataset.cardFlipFace === "back" ? "back" : "front";
    const raw = face === "back" ? (img.dataset.cardFlipBackSrc || img.src) : (img.dataset.cardImageSrc || img.currentSrc || img.src);
    if (!raw || raw.startsWith("data:")) return null;
    return {target: {card_uuid: uuid, face}, img,
      src: window.iMomirImageUrl ? window.iMomirImageUrl(originalArtUrl(raw)) : originalArtUrl(raw),
      name: host.dataset.displayCardName || host.dataset.cardName || img.alt || "Card"};
  }
  function applyBakedArt(info, record) {
    const img=info.img;
    const failed=img.dataset.finishingBakeFailed===record?.baked_url;
    const bake=record?.baked_url&&!failed ? record.baked_url : null;
    const attrs=['src','data-zoom-src'];
    if(info.target.face==='front')attrs.push('data-card-image-src','data-card-flip-front-src');
    else attrs.push('data-card-flip-back-src');
    // Keep lazy-load and zoom URLs in step with the actual image. Carry the
    // original URL in each wrapper so cloned grids, flips and the editor can
    // recover it without relying on an element's lifetime or a WeakMap.
    for(const attr of attrs) {
      const raw=img.getAttribute(attr);
      if(!raw||raw.startsWith('data:'))continue;
      const original=originalArtUrl(raw);
      let next=original;
      if(bake) {
        const url=new URL(bake,location.href);url.searchParams.set('original',original);
        next=url.href;
      }
      if(next!==raw)img.setAttribute(attr,next);
    }
    img.toggleAttribute('data-finishing-baked',Boolean(bake));
    return Boolean(bake);
  }
  function applyRecord(host, record) {
    const info = describe(host);
    if (!info) return;
    const baked=applyBakedArt(info,record);
    const surface = info.img.closest("[data-card-effects], .deckbuilder-card-image-wrap, .custom-draft-current-card-image-wrap, .chaos-pack-view-image-wrap");
    if (surface) {
      effects.setArtEdit(surface,baked?null:record?.edit?.image_url);
      effects.setSpotFoil(surface, record && record.foil_enabled!==false ? {maskUrl: record.mask_url, finish: record.finish, strength: record.strength} : null);
      effects.setGloss(surface, !disableGlossOnView && record?.gloss ? {maskUrl:record.gloss.mask_url,finish:record.gloss.finish,strength:record.gloss.strength} : null);
      effects.setPrintedEffects(surface,baked?[]:["effect1","effect2"].map(layer=>record?.[layer]?.overlay_url?{
        url:record[layer].overlay_url,translucence:effectBlend(record[layer]),finish:record[layer].finish,density:record[layer].density,black_depth:record[layer].black_depth,silver_brightness:record[layer].silver_brightness}:null));
    }
    const button = host.querySelector(".spot-card-button");
    if (button) {
      button.classList.toggle("is-saved", Boolean(record));
      button.title = record ? "Card Finishing Studio (saved)" : "Card Finishing Studio";
      button.setAttribute("aria-label", `${record ? "Edit" : "Add"} card finishing effects for ${info.name}`);
    }
  }
  window.addEventListener('finishing-view-settings',event=>{
    disableGlossOnView=Boolean(event.detail.disable_gloss_on_view);
    document.querySelectorAll(hostSelector+','+viewImageSelector).forEach(host=>{
      const info=describe(host);if(info&&cache.has(keyFor(info.target)))applyRecord(host,cache.get(keyFor(info.target)));
    });
  });
  function publish(target, record) {
    publishBatch([{target, record}]);
  }
  function publishBatch(records) {
    if (!records.length) return;
    const updates = new Map();
    records.forEach(({target, record}) => {
      const key = keyFor(target);
      versions.set(key, (versions.get(key) || 0) + 1);
      cache.set(key, record);
      updates.set(key, record);
    });
    // Lookup responses contain up to 200 finishes. Scan the page once for the
    // whole batch, rather than blocking every click with 200 full-page scans.
    document.querySelectorAll(hostSelector+','+viewImageSelector).forEach(host => {
      const info = describe(host);
      if (info && updates.has(keyFor(info.target))) applyRecord(host, updates.get(keyFor(info.target)));
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
        publishBatch(result.records.filter(item =>
          before.get(keyFor(item.target)) === versions.get(keyFor(item.target))));
      } catch (error) {
        // Opening an editor retries through a fresh GET; a failed lookup never writes defaults.
        console.warn("Spot foiling:", error.message);
      }
    }
  }
  function enhanceHost(host) {
    if(host.matches('img')) {
      const info=describe(host);if(!info)return;
      const key=keyFor(info.target);
      if(cache.has(key))applyRecord(host,cache.get(key));
      else {waiting.set(key,info.target);if(!lookupTimer)lookupTimer=setTimeout(lookup,30);}
      return;
    }
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
    if(cache.has(key))applyRecord(host, cache.get(key));
    if (!cache.has(key)) {
      waiting.set(key, info.target);
      if (!lookupTimer) lookupTimer = setTimeout(lookup, 30);
    }
  }
  function enhance(root = document) {
    if (root.closest?.('#cardSpotFoilDialog, [data-card-finishing="off"]')) return;
    if(root.matches?.(viewImageSelector))enhanceHost(root);
    root.querySelectorAll?.(viewImageSelector).forEach(enhanceHost);
    if (root.matches?.(hostSelector)) enhanceHost(root);
    root.querySelectorAll?.(hostSelector).forEach(enhanceHost);
  }
  function message(text, error = false, {preserveWording = false} = {}) {
    if (current?.artworkChanged) {
      text = "The artwork changed. Close and reopen Card Finishing Studio to realign the mask."; error = true;
    }
    const wasWorking = status.dataset.state === "busy";
    status.querySelector("[data-spot-status-text]").textContent = preserveWording ? text : layerWording(text);
    status.dataset.error = String(error);
    status.dataset.state = error ? "error" : wasWorking ? "success" : "info";
    updateStatusState();
  }
  function updateStatusState() {
    if (status.dataset.error === "true") {
      status.dataset.state = "error";
    } else if (busy || !ready) {
      status.dataset.state = "busy";
    } else if (status.dataset.state === "busy") {
      status.dataset.state = "success";
    }
  }
  function controls() {
    updateStatusState();
    updateMarquee();
    // An in-flight detection/import/history operation must not restore editing
    // after the source artwork has changed underneath this session.
    if (current?.artworkChanged) ready = false;
    syncPreviewInteraction();
    const painting = Boolean(activeStroke && !activeStroke.pan);
    dialog.querySelectorAll("[data-spot-edit-controls]").forEach(el => {el.disabled = !ready || busy || painting;});
    dialog.querySelector('.spot-finish-controls').disabled=!ready||busy||painting||Boolean(disintegrate?.pending);
    dialog.querySelector("[data-spot-apply]").disabled = fields.selection_mode.value === "none";
    artEditor.setDisabled(!ready||busy||painting);
    dialog.querySelector('[data-spot-edit-tab]').disabled=!ready||busy||painting||disintegrate?.pending;
    fields.finish.disabled=Boolean(disintegrate?.pending);
    save.disabled = !ready || busy || painting || artEditor.pending || disintegrate?.pending || (!artEditor.dirty && !hasInk && !maskReviewed && !current?.record && !removal && !(printedLayer()&&['mirror_layers','federation_transporter','disintegrate'].includes(fields.finish.value)) && !Object.values(layerDrafts).some(draft=>draft.enabled||draft.removal));
    dialog.querySelectorAll("[data-spot-layer]").forEach(button=>button.disabled=!ready||busy||Boolean(activeStroke)||artEditor.pending||disintegrate?.pending);
    dialog.querySelectorAll('[data-spot-view]').forEach(button=>{button.disabled=!ready||busy||painting||artEditor.pending;button.title=artEditor.pending?'Apply or discard the AI preview before changing views.':'';});
    dialog.querySelector("[data-spot-invert]").disabled = !ready || busy || painting;
    dialog.querySelector("[data-spot-undo]").disabled = !ready || busy || painting || historyIndex <= 0;
    dialog.querySelector("[data-spot-pocket-undo]").disabled = !ready || busy || painting || historyIndex <= 0;
    dialog.querySelector("[data-spot-redo]").disabled = !ready || busy || painting || historyIndex >= history.length - 1;
    dialog.querySelector("[data-spot-copy-mask]").disabled = !ready || busy || Boolean(activeStroke);
    dialog.querySelector("[data-spot-copy-path]").disabled = !ready || busy || Boolean(activeStroke);
    dialog.querySelector("[data-spot-paste-mask]").disabled = !ready || busy || Boolean(activeStroke) || !maskClipboard;
    dialog.querySelector("[data-spot-append-mask]").disabled = !ready || busy || Boolean(activeStroke) || !maskClipboard;
    dialog.querySelector("[data-spot-remove]").disabled = !ready || busy || painting || disintegrate?.pending || !activeSaved();
    dialog.querySelectorAll("[data-spot-close]").forEach(button => {button.disabled = busy;});
    renderMirrorJob();mirrorLayers?.update();disintegrate?.update();
  }
  function coverage() {
    if(coverageVersion===maskVersion)return maskArea;
    const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
    let selected = 0;
    for (let i = 3; i < pixels.length; i += 4) selected += pixels[i] > 0;
    hasInk = selected > 0;
    const percent = selected / (mask.width * mask.height) * 100;
    maskArea = selected && percent < 1 ? "<1" : String(Math.round(percent));
    coverageVersion=maskVersion;
    updatePreviewHelp();
    return maskArea;
  }
  function markChanged() {
    const area=coverage(),whole=printedLayer()&&['mirror_layers','federation_transporter','disintegrate'].includes(fields.finish.value)&&!hasInk;
    message(disintegrate?.refining?'Editing target cutout · Paint adds to the subject, Erase removes unwanted areas.':removal ? "Removal pending · save to restore the regular card finish." : whole?'Unsaved changes · no mask: free placement across the card.':`Unsaved changes · ${area}% of the card selected`);
    updateMirrorStatus();
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
      effectUrl = encodedMask();
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
      if(!element.hidden){element.style.setProperty("--spot-other-mask",`url("${maskPreviewUrl(layer,draft.png)}")`);element.style.backgroundColor=draft.values.overlay_color;element.style.zIndex=String(layerOrder[layer]);}
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
      const draftFor=layer=>layer===editingLayer?{enabled:!removal&&(hasInk||maskReviewed||activeSaved()||printedLayer()&&['mirror_layers','federation_transporter','disintegrate'].includes(fields.finish.value)),png:effectUrl,
        values:effectControlValues()}:layerDrafts[layer];
      const preview=layer=>{const draft=draftFor(layer);return draft?.enabled&&draft.png?{maskUrl:maskPreviewUrl(layer,draft.png),finish:draft.values.finish,strength:Number(draft.values.strength)}:null;};
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
      : view === "original" ? "Original artwork · comparison only in Edit."
      : view === "art" ? "Original artwork + Edit layer. Effect, Foil and Gloss layers are hidden."
      : artEditor.active ? "Full card preview · Edit, Effect 1, Effect 2, Foil and Gloss."
      : printedLayer()&&fields.finish.value==='mirror_layers' ? "Use Hand to select and drag mirrors. Drag the corner handle to resize."
      : printedLayer()&&fields.finish.value==='federation_transporter' ? "Use Hand to drag beams around figures. Drag a corner to resize; the emblem moves independently."
      : "Hover with Pan to tilt and catch the light.";
    const help=dialog.querySelector("[data-spot-preview-help]");if(!artEditor.active)help.textContent=layerWording(help.textContent);
  }
  function scheduleRender() {if (!renderFrame) renderFrame = requestAnimationFrame(renderMask);}
  function commitMask() {
    maskChanged();coverage();
    showingFrame = false;
    maskReviewed = true;
    // Commit the edited pixels and re-enable the layer before previewing it.
    // A paste after Remove must immediately restore foil/gloss, and a preview
    // failure must never leave saving or undo pointing at the previous mask.
    removal = false;
    const committed = encodedMask();
    if (history[historyIndex] !== committed) {
      history = history.slice(0, historyIndex + 1); history.push(committed);
      if (history.length > 40) history.shift();
      historyIndex = history.length - 1;
    }
    markChanged();renderMask();
  }
  function sizeMask(width) {
    maskChanged();
    const height = Math.round(width * 1056 / 756);
    for (const surface of [mask, canvas, strokeMask, strokeBase]) {
      surface.width = width; surface.height = height;
    }
  }
  function marqueePixels(region=marquee) {
    if(!region)return {x:0,y:0,width:mask.width,height:mask.height};
    const x=Math.round(region.x*mask.width),y=Math.round(region.y*mask.height);
    return {x,y,width:Math.max(1,Math.round((region.x+region.width)*mask.width)-x),height:Math.max(1,Math.round((region.y+region.height)*mask.height)-y)};
  }
  function updateMarquee() {
    const box=dialog.querySelector('[data-spot-marquee]');box.hidden=!marquee||!ready;
    box.replaceChildren();box.style.borderStyle='';box.style.outline='';
    if(marquee)Object.assign(box.style,{left:marquee.x*100+'%',top:marquee.y*100+'%',width:marquee.width*100+'%',height:marquee.height*100+'%',borderRadius:marquee.shape==='ellipse'?'50%':'0'});
    if(marquee?.points){
      box.style.borderStyle='none';box.style.outline='none';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');
      const bounds=box.getBoundingClientRect(),width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('preserveAspectRatio','none');svg.style.cssText='width:100%;height:100%;overflow:visible';
      // Outline the union, not every circle and segment in a brush selection.
      // White inside / black outside remains readable on both light and dark art.
      svg.innerHTML='<defs><filter id="studioSelectionBoundary" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="1" result="outer"/><feMorphology in="SourceAlpha" operator="erode" radius="1" result="inner"/><feComposite in="outer" in2="SourceAlpha" operator="out" result="outerEdge"/><feFlood flood-color="#151515" result="black"/><feComposite in="black" in2="outerEdge" operator="in" result="outline"/><feComposite in="SourceGraphic" in2="inner" operator="out" result="insideEdge"/><feMerge><feMergeNode in="outline"/><feMergeNode in="insideEdge"/></feMerge></filter></defs>';
      path.setAttribute('d',boundaryPath(marquee,{x:0,y:0,width,height}));path.setAttribute('fill','white');path.setAttribute('filter','url(#studioSelectionBoundary)');svg.append(path);box.append(svg);
    }
    const rect=marqueePixels();
    dialog.querySelector('[data-spot-marquee-status]').textContent=marquee?`${rect.width} × ${rect.height} px boundary`:'No marquee boundary';
    dialog.querySelector('[data-spot-deselect]').disabled=!marquee||!ready||busy||Boolean(activeStroke);
    dialog.querySelector('[data-spot-clear]').textContent=marquee?'Clear inside':'Clear mask';
    dialog.querySelector('[data-spot-copy-mask]').title=marquee?'Copy the mask inside the marquee.':'Copy the entire mask.';
  }
  function clipToMarquee(target=ctx,region=marquee,r=marqueePixels(region)) {
    if(!region)return;
    if(region.points){target.clip(new Path2D(boundaryPath(region,r)));return;}
    target.beginPath();
    if(region.shape==='ellipse')target.ellipse(r.x+r.width/2,r.y+r.height/2,r.width/2,r.height/2,0,0,Math.PI*2);
    else target.rect(r.x,r.y,r.width,r.height);
    target.clip();
  }
  function boundaryPath(region,r) {
    const points=region.points.map(p=>({x:r.x+(p.x-region.x)/region.width*r.width,y:r.y+(p.y-region.y)/region.height*r.height}));
    if(region.shape==='lasso')return points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')+' Z';
    const rx=region.radius/region.width*r.width,ry=region.radius*mask.width/mask.height/region.height*r.height;
    let path=points.map(p=>`M${p.x-rx},${p.y}a${rx},${ry} 0 1 1 ${2*rx},0a${rx},${ry} 0 1 1 ${-2*rx},0Z`).join(' ');
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=(b.x-a.x)/rx,dy=(b.y-a.y)/ry,len=Math.hypot(dx,dy);if(!len)continue;
      const nx=-dy/len*rx,ny=dx/len*ry;
      path+=` M${a.x-nx},${a.y-ny}L${b.x-nx},${b.y-ny}L${b.x+nx},${b.y+ny}L${a.x+nx},${a.y+ny}Z`;
    }
    return path;
  }
  function writeMaskRegion(pixels,region=marquee) {
    const rect=marqueePixels(region);
    if(region&&(region.shape==='ellipse'||region.points)) {
      const coverage=document.createElement('canvas');coverage.width=rect.width;coverage.height=rect.height;
      const target=coverage.getContext('2d');clipToMarquee(target,region,{...rect,x:0,y:0});
      target.fillStyle='white';target.fillRect(0,0,rect.width,rect.height);
      const edge=target.getImageData(0,0,rect.width,rect.height).data;
      const original=ctx.getImageData(rect.x,rect.y,rect.width,rect.height).data;
      // Blend the replacement once at the curved boundary. Clearing then
      // drawing through the same soft clip would leave a faint seam.
      for(let i=0;i<pixels.data.length;i+=4) {
        const amount=edge[i+3]/255;
        if(!amount) {for(let channel=0;channel<4;channel++)pixels.data[i+channel]=original[i+channel];}
        else {
          pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;
          pixels.data[i+3]=Math.round(original[i+3]*(1-amount)+pixels.data[i+3]*amount);
        }
      }
    }
    ctx.putImageData(pixels,rect.x,rect.y);
  }
  function deselectMarquee() {
    if(!ready||busy||activeStroke)return;
    marquee=null;updateMarquee();message('Marquee deselected. The mask is unchanged.');
  }
  dialog.querySelector('[data-spot-deselect]').addEventListener('click',deselectMarquee);
  dialog.querySelector('[data-spot-marquee-shape]').addEventListener('change',event=>{
    if(!ready||busy||activeStroke)return;
    if(marquee){marquee={...marquee,shape:event.target.value};delete marquee.points;delete marquee.radius;updateMarquee();}
    setTool('marquee');
  });
  dialog.querySelector("[data-spot-copy-mask]").addEventListener("click", () => {
    if (!ready || busy || activeStroke) return;
    const rect=marqueePixels(),copy=document.createElement("canvas");copy.width=rect.width;copy.height=rect.height;
    const target=copy.getContext("2d");clipToMarquee(target,marquee,{...rect,x:0,y:0});
    target.drawImage(mask,rect.x,rect.y,rect.width,rect.height,0,0,rect.width,rect.height);
    maskClipboard=copy;maskClipboardRegion=marquee?{...marquee}:null;
    controls();message(`Mask copied from ${layerNames[editingLayer]}. Choose a tab and paste it.`);
  });
  dialog.querySelector("[data-spot-copy-path]").addEventListener("click", async () => {
    if(!ready||busy||activeStroke||!printedLayer()||!(fields.finish.value==="mirror_shards"||copyPathEffects.has(fields.finish.value)))return;
    const token=session;
    // Snapshot unsaved mask edits before requesting geometry. Copy only the
    // portion visible through this layer, retaining feathered mask edges.
    const visibleMask=document.createElement('canvas');visibleMask.width=mask.width;visibleMask.height=mask.height;
    if(fields.finish.value==='federation_transporter'&&!hasInk&&!fields.effect_disabled.checked)visibleMask.getContext('2d').fillRect(0,0,mask.width,mask.height);
    if(!fields.effect_disabled.checked && !(pathEffects.has(fields.finish.value)&&Number(fields.effect_track_transparency.value)===100))
      visibleMask.getContext('2d').drawImage(mask,0,0);
    const tracks=copyPathEffects.has(fields.finish.value);
    let settings=tracks ? {finish:fields.finish.value,scale:Number(fields.effect_scale.value),
      rotation:Number(fields.effect_rotation.value),width:mask.width} : {finish:fields.finish.value,template:fields.effect_shard_template.value,
      scale:Number(fields.effect_shard_size.value),rotation:Number(fields.effect_rotation.value),
      x:Number(fields.effect_shard_x.value),y:Number(fields.effect_shard_y.value),width:mask.width};
    if(tracks&&!["chocobo_tracks","dragon_strike"].includes(fields.finish.value))Object.assign(settings,{density:Number(fields.effect_density.value),seed:Number(fields.effect_seed.value)});
    if(fields.finish.value==='raised_solar')settings.solar=effectParams(effectControlValues()).solar;
    if(fields.finish.value==='dragon_strike')Object.assign(settings,{dragon_emblem:fields.effect_dragon_emblem.value,dragon_trail:fields.effect_dragon_trail.value,dragon_alignment:fields.effect_dragon_alignment.value});
    if(fields.finish.value==='federation_transporter')Object.assign(settings,{transporter_emblem:fields.effect_transporter_emblem.value,transporter_style:fields.effect_transporter_style.value,transporter_alignment:fields.effect_transporter_alignment.value,transporter_layout:JSON.parse(fields.effect_transporter_layout.value),scale:100,rotation:0});
    if(fields.finish.value==="confetti_glitter")Object.assign(settings,{particle_type:fields.effect_particle_type.value,flip_horizontal:fields.effect_particle_flip.checked});
    if(fields.finish.value==="ukiyo_e")Object.assign(settings,{ukiyo_type:fields.effect_ukiyo_type.value,sparse:fields.effect_ukiyo_sparse.checked,flip_horizontal:fields.effect_ukiyo_flip.checked});
    if(pathEffects.has(fields.finish.value))Object.assign(settings,{x:Number(fields.effect_track_x.value),y:Number(fields.effect_track_y.value)});
    const dis=fields.finish.value==='disintegrate';
    if(dis){const effect=effectParams(effectControlValues());effect.disintegrate={...effect.disintegrate,scene:''};settings={effect,mask_data:encodedMask(),width:mask.width};}
    busy=true;controls();
    try {
      const response=await fetch(apiUrl(endpoint(current.target)+(dis?'/disintegrate-path':"/effect-path")),{method:"POST",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
      if(!response.ok){const result=await response.json();throw new Error(result.message||"Could not copy the template path.");}
      const bitmap=await createImageBitmap(await response.blob());
      try {
        if(token!==session||!dialog.open||current?.artworkChanged)return;
        const copy=document.createElement("canvas");copy.width=bitmap.width;copy.height=bitmap.height;
        const copied=copy.getContext("2d");copied.drawImage(bitmap,0,0);
        if(!dis){copied.globalCompositeOperation="destination-in";
        copied.drawImage(visibleMask,0,0,copy.width,copy.height);}
        copied.globalCompositeOperation="source-over";
        maskClipboard=copy;maskClipboardRegion=null;
        message(`${tracks?metadata.effect_types[fields.finish.value]:"Shard"} visible path copied. Choose any tab and use Paste Mask or Append Paste.`,false,{preserveWording:true});
      } finally {bitmap.close();}
    } catch(error) {if(token===session&&dialog.open)message(error.message,true);}
    finally {if(token===session){busy=false;controls();}}
  });
  function pasteMask(append=false) {
    if (!ready || busy || activeStroke || !maskClipboard) return;
    if (!marquee&&!maskClipboardRegion&&maskClipboard.width>mask.width) {
      const existing=append?document.createElement("canvas"):null;
      if(existing){existing.width=mask.width;existing.height=mask.height;existing.getContext("2d").drawImage(mask,0,0);}
      sizeMask(maskClipboard.width);
      if(existing)ctx.drawImage(existing,0,0,mask.width,mask.height);
    }
    const region=marquee||maskClipboardRegion,rect=marqueePixels(region);
    const pasted=document.createElement("canvas");pasted.width=rect.width;pasted.height=rect.height;
    const pastedContext=pasted.getContext("2d");
    if(append)clipToMarquee(pastedContext,region,{...rect,x:0,y:0});
    pastedContext.drawImage(maskClipboard,0,0,rect.width,rect.height);
    const incoming=pastedContext.getImageData(0,0,rect.width,rect.height);
    if(append) {
      const combined=ctx.getImageData(rect.x,rect.y,rect.width,rect.height),pixels=combined.data;
      // Selection union preserves soft coverage and does not build opacity
      // when the same mask is appended more than once.
      for(let i=3;i<pixels.length;i+=4)if(incoming.data[i]>pixels[i]) {
        pixels[i]=incoming.data[i];pixels[i-3]=pixels[i-2]=pixels[i-1]=255;
      }
      ctx.putImageData(combined,rect.x,rect.y);
    } else {
      writeMaskRegion(incoming,region);
    }
    showingText=false;commitMask();
    message(append?`Mask merged into ${layerNames[editingLayer]}.`:`Mask pasted into ${layerNames[editingLayer]}.`);
  }
  dialog.querySelector("[data-spot-paste-mask]").addEventListener("click",()=>pasteMask());
  dialog.querySelector("[data-spot-append-mask]").addEventListener("click",()=>pasteMask(true));
  async function loadMask(source) {
    const token = session;
    const img = new Image(); img.src = source;
    await img.decode();
    if (token !== session || current?.artworkChanged) return false;
    // Keep saved high-resolution strokes even if the artwork is later replaced
    // with a smaller image. Undo entries share the current canvas dimensions.
    if (img.naturalWidth > mask.width) sizeMask(Math.min(3024, img.naturalWidth));
    ctx.clearRect(0, 0, mask.width, mask.height); ctx.drawImage(img, 0, 0, mask.width, mask.height);maskChanged();
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
    if(marquee?.points)updateMarquee();
    cursor.hidden = true;
    syncPreviewInteraction();
  }
  function syncPreviewInteraction() {
    const enabled = ready && !busy && !mirrorLayers?.moving && !trekTransporter?.moving && !disintegrate?.moving && !artEditor.active && !showingText && !showingFrame && tool === "pan" && view === "effect" && !activeStroke;
    stage.dataset.tilt = String(enabled);
    effects.setInteractive(stage, enabled);
    const pan=dialog.querySelector('[data-spot-pan]');pan.disabled=!ready||busy||Boolean(activeStroke)||artEditor.pending;pan.setAttribute('aria-pressed',String(artEditor.active?artEditor.panning:tool==='pan'));
    mirrorLayers?.update();trekTransporter?.update();disintegrate?.update();
  }
  function setTool(value) {
    if (activeStroke) return;
    tool = value; stage.dataset.tool = tool; cursor.hidden = true;
    const contiguous=dialog.querySelector('[data-spot-wand-contiguous]');if(contiguous)contiguous.closest('label').hidden=tool!=='wand';
    if(tool==='ellipse'){
      const shape=dialog.querySelector('[data-spot-marquee-shape]');shape.value='ellipse';
      shape.dispatchEvent(new Event('input',{bubbles:true}));
    }
    dialog.querySelector("[data-spot-color-tools]").hidden = !["wand", "match", "sample"].includes(tool);
    dialog.querySelector("[data-spot-brush-tools]").hidden = !["paint", "erase", "selection-brush"].includes(tool);
    for(const name of ['brush_shape','brush_softness'])fields[name].closest('label').hidden=tool==='selection-brush';
    dialog.querySelector("[data-spot-marquee-tools]").hidden = !["marquee","ellipse"].includes(tool);
    dialog.querySelector("[data-spot-tool-amount]").hidden = ["pan", "marquee","ellipse","lasso","selection-brush"].includes(tool);
    syncPreviewInteraction();
    if (value !== "pan" && !disintegrate?.refining) {
      dialog.querySelector("[data-spot-touch-up]").open = true;
      activateStep(dialog.querySelector("[data-spot-touch-up]"));
    }
    dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotTool === tool)));
  }
  function setView(value) {
    view = value; stage.dataset.view = view;
    artEditor.setView(view);
    dialog.querySelector('[data-spot-view="art"]').hidden=!artEditor.active;
    dialog.querySelector('[data-spot-view="mask"]').hidden=artEditor.active;
    syncPreviewInteraction();
    dialog.querySelectorAll("[data-spot-view]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.spotView === view)));
  }
  window.DeckadenceCardFinishing = {
    canOpen: host => Boolean(host && describe(host)),
    open: openEditor,
  };
  async function openEditor(host, trigger = host) {
    if (dialog.open) return;
    // The native close event is queued. Release the old session now if another
    // card is opened before that event arrives.
    if (current) releaseEditor();
    const info = describe(host);
    if (!info) return;
    const token = ++session;
    current = {...info, trigger, record: null}; ready = false; busy = false; removal = false; activeStroke = null;
    metadata = null; history = []; historyIndex = -1; hasInk = false; maskArea = "0"; maskReviewed = false; textRegions = []; textSymbols = []; showingText = false;
    subjectMasks = new Map(); frameMasks = new Map(); showingFrame = false;
    editingLayer="mask";layerDrafts={};setLayerLabels();
    try {
      const color=localStorage.getItem("deckadence.spot.overlayColor");
      fields.overlay_color.value=/^#[0-9a-f]{6}$/i.test(color||"")?color:"#00D8FF";
      fields.mask_only.checked=localStorage.getItem("deckadence.spot.maskOnly")==="true";
    } catch (_) {}
    ctx.clearRect(0, 0, mask.width, mask.height);maskChanged(); overlay.clearRect(0, 0, canvas.width, canvas.height);
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
        setLayerLabels();
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
      for (const [key,value] of Object.entries({width:88,height:44,x:50,y:34})) fields['art_box_'+key].value = generation['art_box_'+key] ?? value;
      fields.selection_amount.value = generation.amount || workflowOptions.selection_amount || 35; updateGenerationHint();
      fields.coverage.value = generation.coverage || workflowOptions.foil_coverage_percent || 100;
      fields.text_mode.value = generation.text_mode || treatmentDefaults.text_treatment || "original"; fields.text_source.value = generation.text_source || "standard";
      fields.text_detail.value = generation.text_detail || "letters"; textRegions = generation.text_regions || []; textSymbols = generation.text_symbols || [];
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
      if(record?.artwork_signature && record.artwork_signature!==current.signature){textRegions=[];textSymbols=[];}
      fields.border_mode.value = generation.border_mode || treatmentDefaults.border_treatment || "original"; fields.border_width.value = generation.border_width ?? workflowOptions.border_width_percent ?? 2;
      fields.frame_mode.value = generation.frame_mode || "original";
      fields.frame_scope.value = generation.frame_scope || "material";
      fields.frame_layout.value = ({modern:"m15",classic:"retro"})[generation.frame_layout] || generation.frame_layout || "auto";
      updateFrameControls();
      updateRegionControls();
      layerDrafts.mask=captureLayer();layerDrafts.gloss=glossDraft(record?.gloss,layerDrafts.mask);
      for(const layer of ["effect1","effect2"])layerDrafts[layer]=effectDraft(record?.[layer],layerDrafts.mask,layer);
      await switchLayer("effect1");
      if(token!==session||current?.artworkChanged)return;
      ready=false;controls();
      await artEditor.load(record?.edit,image,mask.width,apiUrl(endpoint(current.target)+'/art-generation'));
      if(token!==session||current?.artworkChanged)return;
      artworkRevision++;ready=true;renderMask();controls();
      dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%";
      dialog.querySelector("[data-spot-scope]").textContent = payload.image_scope.is_isolated
        ? "Isolation on · saved only in this collection"
        : "Shared - Saved across decks and sets";
      message(record?.artwork_signature && record.artwork_signature !== current.signature
        ? "Artwork has changed. Check alignment and adjust the saved mask before saving."
        : record?.effect1 ? "Saved Effect 1 loaded." : "Editing Effect 1. Select or paint an area to apply an effect.");
      fields.selection_mode.focus({preventScroll:true});
    } catch (error) {
      if (token === session) {
        ready = false;
        dialog.querySelector("[data-spot-scope]").textContent = "Could not load card settings. Close and reopen to retry.";
        message(error.message, true); controls();
      }
    }
  }
  const discardDialog=document.createElement('dialog');
  discardDialog.className='studio-discard-dialog';
  discardDialog.setAttribute('aria-labelledby','studioDiscardTitle');
  discardDialog.setAttribute('aria-describedby','studioDiscardMessage');
  discardDialog.innerHTML='<h2 id="studioDiscardTitle">Discard changes?</h2><p id="studioDiscardMessage">Your unsaved artwork edits will be lost.</p><div class="studio-discard-actions"><button type="button" data-keep-editing autofocus>Keep editing</button><button type="button" data-discard-changes>Discard changes</button></div>';
  document.body.append(discardDialog);
  discardDialog.querySelector('[data-keep-editing]').addEventListener('click',()=>discardDialog.close());
  discardDialog.querySelector('[data-discard-changes]').addEventListener('click',()=>{
    if(busy)return;
    discardDialog.close();dialog.close();
  });
  discardDialog.addEventListener('keydown',event=>event.stopPropagation());
  function closeEditor() {
    if (busy || discardDialog.open) return;
    if (artEditor.dirty || artEditor.pending || disintegrate?.pending) {
      discardDialog.querySelector('p').textContent=disintegrate?.refining?'Your unapplied target correction will be lost.':disintegrate?.pending?'Your unapplied Disintegrate reconstruction will be lost.':artEditor.pending?'Your unsaved artwork edits and AI preview will be lost.':'Your unsaved artwork edits will be lost.';
      discardDialog.showModal();discardDialog.querySelector('[data-keep-editing]').focus();return;
    }
    dialog.close();
  }
  function releaseEditor() {
    if(discardDialog.open)discardDialog.close();
    artEditor.release();
    disintegrate?.release();
    if(artDialog.open)artDialog.close();artImage.removeAttribute("src");
    cancelMirrorGeneration();
    stopMirrorClock();mirrorJobState=null;renderMirrorJob();
    mirrorDiagnostics=null;if(mirrorExport)mirrorExport.disabled=true;
    mirrorSelectionCache=null;
    maskClipboard=null;maskClipboardRegion=null;marquee=null;updateMarquee();
    ++session; ready = false; activeStroke = null;
    subjectMasks.clear(); frameMasks.clear(); showingFrame = false;
    layerDrafts={};clearPrintedPreviews();effects.setSpotFoil(stage,null);effects.setGloss(stage,null);for(const element of otherOverlays){element.hidden=true;element.style.removeProperty("--spot-other-mask");}
    clearMaskPreviews();
    if (renderFrame) cancelAnimationFrame(renderFrame); renderFrame = null;
    clearTimeout(effectRenderTimer);effectRenderTimer=null;previewSequences.clear();
    if (artworkUrl) URL.revokeObjectURL(artworkUrl); artworkUrl = "";
    image.removeAttribute("src"); history = []; current?.trigger.focus(); current = null;
  }
  dialog.addEventListener("close", () => {if (!dialog.open && current) releaseEditor();});
  dialog.addEventListener("cancel", event => {
    if(artEditor.active||artEditor.dirty||artEditor.pending||disintegrate?.pending||busy||activeStroke)event.preventDefault();
    else if(!artEditor.active&&marquee){event.preventDefault();deselectMarquee();}
  });
  dialog.querySelectorAll("[data-spot-close]").forEach(button => button.addEventListener("click", closeEditor));
  dialog.querySelectorAll("[data-spot-tool]").forEach(button => button.addEventListener("click", () => setTool(button.dataset.spotTool)));
  dialog.querySelector('[data-spot-pan]').addEventListener('click',()=>{if(artEditor.active)artEditor.pan();else setTool('pan');syncPreviewInteraction();});
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
  function artBoxOptions() {
    return Object.fromEntries(['width','height','x','y'].map(key => ['art_box_' + key, Number(fields['art_box_' + key].value)]));
  }
  function updateArtBox() {
    const options = artBoxOptions(), [left,top,right,bottom] = window.DeckadenceSpotSelection.artworkBounds(options);
    const guide = dialog.querySelector('[data-spot-area-guide]');
    Object.assign(guide.style, {left:left*100+'%', top:top*100+'%', width:(right-left)*100+'%', height:(bottom-top)*100+'%'});
    dialog.querySelector('[data-spot-art-box-controls]').hidden = fields.selection_region.value !== 'artwork' || fields.selection_mode.value === 'none';
    for (const key of ['width','height','x','y']) dialog.querySelector('[data-spot-art-box-'+key+']').value = options['art_box_'+key]+'%';
  }
  for (const key of ['width','height','x','y']) fields['art_box_'+key].addEventListener('input', updateArtBox);
  function generationOptions() {
    return {mode: fields.selection_mode.value, cleanup: fields.cleanup.value, pocket_size: pocketSize(), pocket_target: fields.pocket_target.value, action: fields.generation_action.value, region: fields.selection_region.value, amount: Number(fields.selection_amount.value),
      ...artBoxOptions(), coverage:Number(fields.coverage.value), text_mode:fields.text_mode.value, text_source:fields.text_source.value,
      exclude_mode:fields.exclude_mode.value, exclude_color:fields.exclude_color.value.toUpperCase(),
      text_detail:fields.text_detail.value, text_ink:fields.text_ink.value, text_expand:Number(fields.text_expand.value), text_smooth:Number(fields.text_smooth.value),
      selected_color:fields.selection_color.value.toUpperCase(), color_tolerance:Number(fields.tolerance.value), color_swatches:recentColors,
      edge_expand:Number(fields.edge_expand.value), edge_smooth:Number(fields.edge_smooth.value), edge_sharpen:Number(fields.edge_sharpen.value),
      color_expand:Number(fields.color_expand.value), color_smooth:Number(fields.color_smooth.value),
      brush_size:Number(fields.brush_size.value), brush_softness:Number(fields.brush_softness.value), brush_shape:fields.brush_shape.value,
      text_regions:textRegions, text_symbols:textSymbols, border_mode:fields.border_mode.value, border_width:Number(fields.border_width.value),
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
      ? `${textRegions.length} detected text regions${textSymbols.length ? ` and ${textSymbols.length} circular symbols` : ""}.`
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
    const token=session,revision=artworkRevision; ready=false; controls(); message("Detecting text locally with AI…");
    try {
      const source=document.createElement("canvas"); source.width=Math.min(1512,Math.max(756,image.naturalWidth||756));source.height=Math.round(source.width*1056/756);
      source.getContext("2d").drawImage(image,0,0,source.width,source.height);
      const result=await api(apiUrl(endpoint(current.target)+"/detect-text"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/jpeg",.95).split(",")[1]})});
      if(token!==session || revision!==artworkRevision || current?.artworkChanged)return false;
      textRegions=result.regions;textSymbols=result.symbols||[];fields.text_source.value="detected";updateRegionControls();
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
    updateArtBox();
    const choices = {
      highlights: "brightest",
      colors: "most colorful",
      details: "most textured",
      shadows: "darkest",
    };
    const mode = fields.selection_mode.value, none = mode === "none", solid = mode === "artwork", textOnly = mode === "text", semantic = ["subject","background"].includes(mode);
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
    fields.selection_amount.disabled = solid || semantic || textOnly;
    fields.selection_amount.closest("label").hidden = solid || semantic || textOnly;
    dialog.querySelector("[data-spot-amount-help]").hidden = semantic || textOnly;
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
        : "Complete letter strokes are kept and isolated specks are removed. Detected mana symbols are selected as complete circles.");
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
      if((fields.selection_mode.value==="text" || fields.text_mode.value!=="original") && fields.text_source.value==="detected" && !textRegions.length && !(await detectText()))return;
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
    const token=session,revision=artworkRevision, layout=fields.frame_layout.value;
    if(frameMasks.has(layout))return frameMasks.get(layout);
    ready=false;controls();message("Tracing frame contours locally… First use downloads the frame model (118 MB).");
    try {
      const source=document.createElement("canvas");source.width=Math.max(16,Math.min(1512,image.naturalWidth));
      source.height=Math.round(source.width*image.naturalHeight/image.naturalWidth);
      source.getContext("2d").drawImage(image,0,0,source.width,source.height);
      const response=await api(apiUrl(endpoint(current.target)+"/detect-frame"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/jpeg",.95).split(",")[1],layout})});
      if(token!==session || revision!==artworkRevision || !dialog.open || current?.artworkChanged)return null;
      const detected={found:response.found,parts:response.parts};
      for(const key of ["material","panels"]) {
        const decoded=new Image();decoded.src=response.masks[key];await decoded.decode();detected[key]=decoded;
      }
      if(token!==session || revision!==artworkRevision || !dialog.open || current?.artworkChanged)return null;
      frameMasks.set(layout,detected);message(detected.found?"Frame contours detected.":"No distinct frame found.");
      return detected;
    } finally {if(token===session){ready=true;controls();updateFrameControls();}}
  }
  async function detectSubject() {
    const token=session,revision=artworkRevision, region=fields.selection_region.value;
    const bounds=region==="artwork" ? window.DeckadenceSpotSelection.artworkBounds(artBoxOptions()) : [0,0,1,1];
    const cacheKey=JSON.stringify(bounds);
    let detected=subjectMasks.get(cacheKey);
    if(!detected) {
      ready=false;controls();message("Finding the subject locally… First use may download the AI model (179 MB).");
      try {
        const source=document.createElement("canvas"), [l,t,r,b]=bounds;
        source.width=Math.max(16,Math.min(1512,Math.round(image.naturalWidth*(r-l))));
        source.height=Math.round(source.width*1056/756*(b-t)/(r-l));
        source.getContext("2d").drawImage(image,l*image.naturalWidth,t*image.naturalHeight,(r-l)*image.naturalWidth,(b-t)*image.naturalHeight,0,0,source.width,source.height);
        const response=await api(apiUrl(endpoint(current.target)+"/detect-subject"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:source.toDataURL("image/jpeg",.95).split(",")[1]})});
        if(token!==session || revision!==artworkRevision || current?.artworkChanged)return null;
        detected=new Image();detected.src=response.mask_data;await detected.decode();
        if(token!==session || revision!==artworkRevision || current?.artworkChanged)return null;
        subjectMasks.set(cacheKey,detected);
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
  function selectArea(mode, entireMask=false) {
    if (!ready || busy || activeStroke) return false;
    const region=entireMask?null:marquee,rect=marqueePixels(region);
    const selected=document.createElement('canvas');selected.width=rect.width;selected.height=rect.height;
    const target=selected.getContext('2d');target.fillStyle='white';target.globalAlpha=Number(fields.coverage.value)/100;
    if(mode==='all')target.fillRect(0,0,rect.width,rect.height);
    if(mode==='art'){const [l,t,r,b]=window.DeckadenceSpotSelection.artworkBounds(artBoxOptions());target.fillRect(mask.width*l-rect.x,mask.height*t-rect.y,mask.width*(r-l),mask.height*(b-t));}
    writeMaskRegion(target.getImageData(0,0,rect.width,rect.height),region);showingText=false;
    commitMask();
    return true;
  }
  dialog.querySelector("[data-spot-select-art]").addEventListener("click", () => selectArea("art"));
  dialog.querySelector("[data-spot-select-all]").addEventListener("click", () => selectArea("all"));
  dialog.querySelector("[data-spot-clear]").addEventListener("click", () => selectArea("none"));
  dialog.querySelector("[data-spot-invert]").addEventListener("click", () => {
    if (!ready || busy || activeStroke) return;
    const rect=marqueePixels(),pixels = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = 255 - pixels.data[i + 3];
    }
    writeMaskRegion(pixels); showingText = false; commitMask();
    message("Mask inverted. Undo is available.");
  });
  dialog.querySelector("[data-spot-remove]").addEventListener("click", () => {
    if (selectArea("none",true)) {removal = true; markChanged();renderMask();}
  });
  for (const field of [...solarFields.map(name=>fields[name]),fields.effect_particle_type,fields.effect_particle_flip,fields.effect_ukiyo_type,fields.effect_ukiyo_sparse,fields.effect_ukiyo_flip,fields.finish, fields.strength, fields.effect_origin_x,fields.effect_origin_y,fields.effect_disabled, fields.effect_stacked, fields.effect_scale, fields.effect_density,fields.effect_black_depth,fields.effect_silver_brightness, fields.effect_color, fields.effect_translucence,fields.effect_track_x,fields.effect_track_y,fields.effect_track_transparency,fields.effect_rotation,fields.effect_scene_rotation,fields.effect_scene_zoom,fields.effect_scene_skew,fields.effect_scene_x,fields.effect_scene_y,fields.effect_scene_flip_horizontal,fields.effect_scene_flip_vertical, fields.effect_shard_template,fields.effect_shard_size,fields.effect_shard_x,fields.effect_shard_y,fields.effect_shard_theme,fields.effect_mirror,fields.effect_tint,fields.effect_custom_prompt,fields.effect_prompt_details,fields.effect_maintain_style,fields.effect_outpaint_margin]) field.addEventListener("input", () => {
    if(field===fields.effect_custom_prompt||field===fields.effect_prompt_details){
      message('Unsaved prompt changes. Generate artwork to use them.');return;
    }
    if(field===fields.effect_rotation||field===fields.effect_scene_rotation){
      dialog.querySelector(field===fields.effect_rotation?'[data-spot-rotation-value]':'[data-spot-scene-rotation-value]').value=field.value+'°';return;
    }
    if(field===fields.effect_solar_off_color)fields.effect_solar_off_auto.checked=false;
    updateEffectColor(field===fields.finish);
    if(field===fields.finish&&['mirror_layers','federation_transporter'].includes(fields.finish.value)){setTool('pan');setView('effect');}
    dialog.querySelector("[data-spot-strength-value]").value = fields.strength.value + "%";
    scheduleEffectRender(); markChanged();
  });
  for(const button of dialog.querySelectorAll('[data-spot-dragon-emblem]'))button.addEventListener('click',()=>{
    if(!ready||busy||fields.effect_dragon_emblem.value===button.dataset.spotDragonEmblem)return;
    fields.effect_dragon_emblem.value=button.dataset.spotDragonEmblem;
    updateShardControls();scheduleRender();markChanged();
  });
  for(const button of dialog.querySelectorAll('[data-spot-transporter-emblem]'))button.addEventListener('click',()=>{
    if(!ready||busy||fields.effect_transporter_emblem.value===button.dataset.spotTransporterEmblem)return;
    fields.effect_transporter_emblem.value=button.dataset.spotTransporterEmblem;
    updateShardControls();scheduleRender();markChanged();
  });
  for(const field of [fields.effect_transporter_style,fields.effect_transporter_alignment])field.addEventListener('change',()=>{scheduleRender();markChanged();});
  fields.effect_dragon_trail.addEventListener('change',()=>{scheduleRender();markChanged();});
  fields.effect_dragon_alignment.addEventListener('change',()=>{scheduleRender();markChanged();});
  fields.effect_dragon_color_effect.addEventListener('change',()=>{scheduleRender();markChanged();});
  // Rotation sliders update their readouts immediately, but the costly artwork
  // preview is requested only when the gesture or numeric edit is committed.
  for(const field of [fields.effect_rotation,fields.effect_scene_rotation]){
    let held=false,pending=false;
    field.addEventListener('input',()=>{pending=true;});
    const commit=()=>{if(!pending||held)return;pending=false;scheduleRender();markChanged();};
    field.addEventListener('change',commit);
    field.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))held=true;});
    field.addEventListener('keyup',()=>{held=false;commit();});
    field.addEventListener('blur',()=>{held=false;commit();});
  }
  dialog.querySelectorAll("[data-spot-shard-template]").forEach(button=>button.addEventListener("click",()=>{
    fields.effect_shard_template.value=button.dataset.spotShardTemplate;fields.effect_shard_template.dispatchEvent(new Event("input",{bubbles:true}));
  }));
  dialog.querySelectorAll("[data-spot-effect-swatch]").forEach(button=>button.addEventListener("click",()=>{
    fields.effect_color.value=button.dataset.spotEffectSwatch;fields.effect_color.dispatchEvent(new Event("input",{bubbles:true}));
  }));
  dialog.querySelectorAll('[data-spot-solar-off-swatch]').forEach(button=>{
    const color=solarShiftColor(button.dataset.spotSolarOffSwatch);
    button.style.setProperty('--swatch',color);button.setAttribute('aria-label',`Use ${color} off-band color`);
    button.addEventListener('click',()=>{
      fields.effect_solar_off_color.value=color;
      fields.effect_solar_off_color.dispatchEvent(new Event('input',{bubbles:true}));
    });
  });
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
    maskChanged();
    ctx.save();clipToMarquee();ctx.globalCompositeOperation=erase?"destination-out":"source-over";
    ctx.globalAlpha=amount;ctx.filter=blur ? `blur(${blur}px)` : "none";
    ctx.drawImage(selection,0,0);ctx.restore();
  }
  function dragMarquee(to,circle=false) {
    if(activeStroke.points){
      const p={x:Math.max(0,Math.min(1,to.x/mask.width)),y:Math.max(0,Math.min(1,to.y/mask.height))};
      const last=activeStroke.points.at(-1);if(!last||Math.hypot((p.x-last.x)*mask.width,(p.y-last.y)*mask.height)>1)activeStroke.points.push(p);
      const radius=activeStroke.shape==='selection-brush'?activeStroke.radius:0,ry=radius*mask.width/mask.height;
      const xs=activeStroke.points.map(p=>p.x),ys=activeStroke.points.map(p=>p.y);
      const x=Math.max(0,Math.min(...xs)-radius),y=Math.max(0,Math.min(...ys)-ry),right=Math.min(1,Math.max(...xs)+radius),bottom=Math.min(1,Math.max(...ys)+ry);
      marquee={x,y,width:Math.max(1/mask.width,right-x),height:Math.max(1/mask.height,bottom-y),shape:activeStroke.shape,points:[...activeStroke.points],radius};updateMarquee();return;
    }
    const start=activeStroke.start;
    let x=Math.max(0,Math.min(mask.width,to.x)),y=Math.max(0,Math.min(mask.height,to.y));
    if(circle&&activeStroke.shape==='ellipse') {
      const extent=Math.min(Math.abs(x-start.x),Math.abs(y-start.y));
      x=start.x+Math.sign(x-start.x)*extent;y=start.y+Math.sign(y-start.y)*extent;
    }
    marquee={x:Math.min(start.x,x)/mask.width,y:Math.min(start.y,y)/mask.height,
      width:Math.abs(x-start.x)/mask.width,height:Math.abs(y-start.y)/mask.height,shape:activeStroke.shape};
    updateMarquee();
  }
  function lockedPoint(event) {
    const p=point(event),stroke=activeStroke;
    if(!stroke||stroke.pan||stroke.marquee)return p;
    const axis=event.shiftKey?'horizontal':event.ctrlKey?'vertical':null;
    if(axis!==stroke.axis){stroke.axis=axis;stroke.anchor={...stroke.last};}
    if(axis==='horizontal')p.y=stroke.anchor.y;
    if(axis==='vertical')p.x=stroke.anchor.x;
    return p;
  }
  canvas.addEventListener("pointerdown", event => {
    if (!ready || busy || activeStroke || event.button !== 0) return;
    viewport.focus({preventScroll:true});
    showingText=false;showingFrame=false;
    if (tool === "sample") {
      event.preventDefault(); const p = point(event);
      chooseColor(window.DeckadenceSpotSelection.sampleColor(image, p.x, p.y, mask.width, mask.height), true);
      renderMask(); message("Color picked. Choose Apply color across card."); return;
    }
    if(tool==="wand"||tool==="match") {
      event.preventDefault();const p=point(event);
      chooseColor(window.DeckadenceSpotSelection.sampleColor(image, p.x, p.y, mask.width, mask.height), true);
      const selection=window.DeckadenceSpotSelection.colorSelection(image,p.x,p.y,Number(fields.tolerance.value),tool==="wand"&&(dialog.querySelector('[data-spot-wand-contiguous]')?.checked??true),mask.width,mask.height);
      applyToolMask(refineColorSelection(selection),fields.selection_action.value==="erase");commitMask();return;
    }
    event.preventDefault(); canvas.setPointerCapture(event.pointerId);
    if(['marquee','ellipse','lasso','selection-brush'].includes(tool)) {
      const p=point(event);
      activeStroke={id:event.pointerId,marquee:true,previous:marquee,shape:tool==='marquee'?dialog.querySelector('[data-spot-marquee-shape]').value:tool,
        start:{x:Math.max(0,Math.min(mask.width,p.x)),y:Math.max(0,Math.min(mask.height,p.y))}};
      if(['lasso','selection-brush'].includes(tool)){activeStroke.points=[];activeStroke.radius=Number(fields.brush_size.value)/756/2;}
      dragMarquee(p);controls();return;
    }
    strokeContext.clearRect(0,0,mask.width,mask.height);baseContext.clearRect(0,0,mask.width,mask.height);baseContext.drawImage(mask,0,0);
    const diameter = Number(fields.brush_size.value) * mask.width / 756, softness = Number(fields.brush_softness.value) / 100;
    activeStroke = {id: event.pointerId, last: point(event), x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, pan: tool === "pan",
      width: diameter * (1 - softness * .5), blur: diameter * softness * .08, amount: Number(fields.coverage.value) / 100, erase: tool === "erase", shape:fields.brush_shape.value};
    controls();
    if (!activeStroke.pan) draw(activeStroke.last, activeStroke.last);
  });
  canvas.addEventListener("pointermove", event => {
    const p = lockedPoint(event), box = canvas.getBoundingClientRect();
    cursor.hidden = !["paint","erase","selection-brush"].includes(tool) || !ready;
    cursor.style.width = cursor.style.height = Number(fields.brush_size.value) * box.width / 756 + "px";
    cursor.style.left = p.x / mask.width * 100 + "%"; cursor.style.top = p.y / mask.height * 100 + "%";
    if (!activeStroke || activeStroke.id !== event.pointerId) return;
    if (activeStroke.pan) {viewport.scrollLeft = activeStroke.left - event.clientX + activeStroke.x; viewport.scrollTop = activeStroke.top - event.clientY + activeStroke.y;}
    else if(activeStroke.marquee)dragMarquee(p,event.shiftKey);
    else {draw(activeStroke.last, p); activeStroke.last = p;}
  });
  function endStroke(event) {
    if (!activeStroke || activeStroke.id !== event.pointerId) return;
    const stroke=activeStroke,painted = !stroke.pan&&!stroke.marquee;
    if(stroke.marquee) {
      if(event.type==='pointercancel')marquee=stroke.previous;
      else if(!marquee||marquee.width*mask.width<2||marquee.height*mask.height<2)marquee=null;
    }
    activeStroke = null;
    syncPreviewInteraction();
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (painted) commitMask();
    else controls();
    if(stroke.marquee)message(marquee?'Marquee ready. Edits stay inside this boundary.':'Marquee deselected. The mask is unchanged.');
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(name, endStroke);
  canvas.addEventListener("pointerleave", () => {cursor.hidden = true;});
  dialog.addEventListener("keydown", event => {
    if(!artEditor.active&&event.key==='Escape'&&activeStroke?.marquee){
      event.preventDefault();endStroke({pointerId:activeStroke.id,type:'pointercancel'});return;
    }
    if (artEditor.active || !ready || busy || activeStroke || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {event.preventDefault(); travelHistory(event.shiftKey ? 1 : -1);}
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {event.preventDefault(); travelHistory(1);}
    else if(event.key==='Escape'&&marquee){event.preventDefault();deselectMarquee();}
    else if((event.key==='Delete'||event.key==='Backspace')&&marquee){event.preventDefault();selectArea('none');}
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const tools = {b: "paint", e: "erase", h: "pan", w:"wand", c:"match", i:"sample",m:"marquee",o:"ellipse",l:"lasso"}; if (tools[event.key.toLowerCase()]) {event.preventDefault();setTool(tools[event.key.toLowerCase()]);}
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
  async function saveFinish(target,body,method){
    const send=attempt=>api(attempt.url,{method:attempt.method,headers:{'Content-Type':'application/json','X-Studio-Save-ID':attempt.id},body:attempt.body});
    // An explicit Save retries an uncertain request first. A subsequent edit
    // can then use the acknowledged revision without overwriting another editor.
    if(current.pendingSave){
      const previous=current.pendingSave,unchanged=previous.method===method&&previous.body===JSON.stringify(body);
      const result=await send(previous);current.pendingSave=null;current.record=result.record;
      if(unchanged)return result;
      body.revision=result.record?.revision||null;
    }
    const attempt={id:requestId(),url:apiUrl(endpoint(target),true),method,body:JSON.stringify(body)};
    current.pendingSave=attempt;
    const result=await send(attempt);current.pendingSave=null;current.record=result.record;return result;
  }
  // Saving requires explicit activation of Save, never implicit Enter submission.
  form.addEventListener("submit", event => event.preventDefault());
  save.addEventListener("click", async event => {
    event.preventDefault(); if (!ready || busy || save.disabled || !form.reportValidity()) return;
    busy = true; controls(); message("Baking effects and saving card finishes…");
    const target = current.target;
    try {
      layerDrafts[editingLayer]=captureLayer();
      const foil=layerDrafts.mask;
      const layerPayloads={edit:artEditor.payload()};
      for(const layer of ["gloss","effect1","effect2"]) {
        const draft=layerDrafts[layer];let png=draft.png;
        if(draft.enabled&&png&&!png.startsWith("data:")) {
          const response=await fetch(png);if(!response.ok)throw new Error("Could not load "+layerNames[layer]+".");
          const blob=await response.blob();png=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
        }
        layerPayloads[layer]=draft.enabled?{finish:draft.values.finish,strength:Number(draft.values.strength),overlay_color:draft.values.overlay_color,generation:draft.generation,mask_data:png,
          ...(layer.startsWith("effect")?effectParams(draft.values):{})}:null;
        if(layerPayloads[layer]?.finish==='disintegrate'&&!layerPayloads[layer].disabled){
          disintegrate.validate(layerPayloads[layer].disintegrate);
        }
      }
      if(current?.artworkChanged)throw new Error("Artwork changed. Close and reopen before saving.");
      const removeAll=!layerPayloads.edit&&!Object.values(layerDrafts).some(draft=>draft.enabled);
      const body=removeAll ? {revision:current.record?.revision||null,all_layers:true} : {
        finish:foil.values.finish,strength:Number(foil.values.strength),artwork_signature:current.signature,
        generation:foil.generation,mask_data:foil.png,foil_enabled:foil.enabled,revision:current.record?.revision||null,...layerPayloads,
      };
      const result = await saveFinish(target,body,removeAll?'DELETE':'PUT');
      publish(target, result.record); channel?.postMessage({scope: current.scope, target});
      document.dispatchEvent(new CustomEvent("deckadence:spot-foil-saved", {detail: {target, scope: current.scope}}));
      busy = false; dialog.close();
    } catch (error) {
      busy = false;
      if(!error.retryable&&current)current.pendingSave=null;
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
    document.addEventListener('error',event=>{
      const img=event.target;
      if(!img.matches?.('img[data-finishing-baked]'))return;
      const host=img.matches(viewImageSelector)?img:img.closest(hostSelector),info=host&&describe(host);
      const record=info&&cache.get(keyFor(info.target));
      if(!record?.baked_url)return;
      img.dataset.finishingBakeFailed=record.baked_url;
      console.warn('Could not load baked artwork; using editable finishing layers for this image.');
      applyRecord(host,record);
    },true);
    new MutationObserver(records => {
      const changed = new Set();
      for (const record of records) {
        if(record.target.matches?.(viewImageSelector))changed.add(record.target);
        const owner = record.target.closest?.(hostSelector); if (owner) changed.add(owner);
        if (record.type === "attributes") {
          continue;
        } else for (const node of record.addedNodes) if (node.nodeType === 1) enhance(node);
      }
      changed.forEach(enhanceHost);
    }).observe(document.body, {childList: true, subtree: true, attributes: true,
      attributeFilter: ["src", "data-card-uuid", "data-card-image-src", "data-card-flip-face", "data-finishing-card-uuid"]});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true}); else start();
})();
