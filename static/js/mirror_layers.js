(() => {
  'use strict';
  const cardMillimeters={width:63,height:88};
  const lightDefaults=()=>({x:20,y:5,height:65,size:24,color:'#F4FAFF',strength:100});
  const imageDefaults=()=>({x:0,y:0,zoom:100,rotation:0,rotation_x:0,rotation_y:0,skew:0,flip_x:false,flip_y:false});
  const objectTransform=o=>Object.fromEntries(['x','y','width','height','size','rotation','rotation_x','rotation_y','skew','flip_x','flip_y'].map(k=>[k,k==='size'?(o.size??100):k.startsWith('rotation_')?(o[k]??0):o[k]]));
  function defaults(){
    return {version:1,shape:'sphere',layout:'organic',layout_seed:0,mirror:false,mode:'replicated',variation:'automatic',target:'face',mirror_angle:false,theme:'normal',prompt:'',maintain_style:true,
      curvature:65,tint:12,light:lightDefaults(),scenes:{},shared_scene:'',image:imageDefaults(),objects:
      [[60,9,.43],[86,57,.56],[17,20,.65],[80,32,.92],[76,82,1.12],[21,70,1.35]].map(([x,y,s],i)=>({id:'m'+(i+1),
        x,y,width:Math.round(34.455*s*1000)/1000,height:Math.round(24.667*s*1000)/1000,rotation:0,skew:0,flip_x:false,flip_y:false,
        image:imageDefaults(),scene:'',prompt:'',style:'',theme:'inherit'})).map((o,i)=>({...o,size:100,rotation_x:0,rotation_y:0,home:objectTransform(o),appearance:{}}))};
  }
  function clone(value){return {...value,light:{...lightDefaults(),...value.light},image:{...value.image},objects:value.objects.map(o=>({...o,home:{...o.home},image:{...o.image},...(o.appearance?{appearance:{...o.appearance}}:{})})),scenes:{...value.scenes}};}
  function geometry(o){
    const angle=o.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),shear=Math.tan(o.skew*Math.PI/180);
    const ax=(o.rotation_x??0)*Math.PI/180,ay=(o.rotation_y??0)*Math.PI/180,cx3=Math.cos(ax),sx3=Math.sin(ax),cy3=Math.cos(ay),sy3=Math.sin(ay);
    const scale=(o.size??100)/100,x=o.width*7.56*scale*(o.flip_x?-1:1),y=o.height*10.56*scale*(o.flip_y?-1:1);
    const a=c*cy3*x,d=s*cy3*x,b=(c*(cy3*shear+sy3*sx3)-s*cx3)*y,e=(s*(cy3*shear+sy3*sx3)+c*cx3)*y;
    const zu=-sy3*x,zv=(-sy3*shear+cy3*sx3)*y,distance=Math.max(1056*1.25,(Math.abs(zu)+Math.abs(zv))*.6),g=-zu/distance,h=-zv/distance,cx=o.x*7.56,cy=o.y*10.56;
    return [a+cx*g,b+cx*h,cx,d+cy*g,e+cy*h,cy,g,h,1];
  }
  function project(m,x,y){const w=m[6]*x+m[7]*y+1;return [(m[0]*x+m[1]*y+m[2])/w,(m[3]*x+m[4]*y+m[5])/w];}
  function unproject(m,x,y){
    const a=m[0]-x*m[6],b=m[1]-x*m[7],c=x-m[2],d=m[3]-y*m[6],e=m[4]-y*m[7],f=y-m[5],det=a*e-b*d;
    return Math.abs(det)<1e-7?null:[(c*e-b*f)/det,(a*f-c*d)/det];
  }
  function create(host){
    const {dialog,stage}=host,field=document.createElement('input');field.type='hidden';field.name='effect_mirrors';field.value=JSON.stringify(defaults());
    const panel=document.createElement('div');panel.dataset.spotMirrorLayers='';panel.hidden=true;panel.style.gridColumn='1 / -1';
    const select=(key,label,options)=>`<label>${label}<select data-ml="${key}">${options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label>`;
    const themes=[['normal','Normal'],['dark','Dark'],['spooky','Spooky'],['modern','Modern'],['echo','Echo'],['angelic','Angelic'],['demonic','Demonic'],['evil_goatee','Evil Goatee'],['custom','Custom']];
    const layouts=[['organic','Floating depths'],['downward_v','Downward V from head'],['ring','Surround the subject'],['scatter','Scattered depths'],['diagonal','Drifting upward'],...Object.entries({falling:'Falling shards',impact:'Mirror impact',diagonal:'Diagonal split',frame:'Fractured frame',radiant:'Radiant burst',spell:'Spell splinters',cascade:'Crystal cascade',revelation:'Mirror revelation'}).map(([k,v])=>['shard_'+k,v]),['grid','Grid']];
    const ranges=(prefix,keys)=>keys.map(([key,label,min,max,unit])=>`<label class="spot-card-range-label"><span>${label}</span><output data-ml-value="${prefix}.${key}" data-ml-unit="${unit==='mm'?' mm':unit==='°'?'°':'%'}"></output><input aria-label="${label}${unit==='mm'?' (mm)':''}" type="range" data-ml="${prefix}.${key}" min="${min}" max="${max}" step="${unit==='mm'?'any':'0.1'}"></label>`).join('');
    const flips=prefix=>`<div class="spot-finish-pair"><label class="spot-card-check"><input type="checkbox" data-ml="${prefix}.flip_x"> Horizontal Flip</label><label class="spot-card-check"><input type="checkbox" data-ml="${prefix}.flip_y"> Vertical Flip</label></div>`;
    panel.innerHTML=`<section class="spot-finish-group"><div class="spot-finish-group-heading"><h3>Mirror objects</h3><button type="button" data-ml-action="copy">Copy Path</button></div>
      <div class="mirror-shape-choices">${[['sphere','Spheres'],['square','Square Mirrors'],['oval','Oval Mirrors']].map(([key,label])=>`<button type="button" data-ml-shape="${key}" aria-pressed="false"><span class="mirror-shape-sample ${key}" aria-hidden="true"></span>${label}</button>`).join('')}</div>
      <div class="mirror-layout-row">${select('layout','Arrangement',layouts)}<label>Count<input type="number" data-ml-count min="0" max="24" step="1" value="6"></label></div>
      <div class="spot-card-button-row"><button type="button" data-ml-action="layout">New arrangement</button><button type="button" data-ml-action="move" aria-pressed="true">Hand · Move mirrors</button></div>
      <div data-ml-v-controls hidden><button type="button" data-ml-action="v-origin" aria-pressed="false">Place V at head</button><p class="spot-card-caption" data-ml-v-help>Click Place V at head, then click the subject’s head on the card to position the arrangement.</p></div>
      <p class="spot-card-caption" data-ml-placement-help>Drag any mirror on the card. Drag its corner handle to resize it. Use a mask only if you want to limit where the glass appears.</p>
      <div class="spot-card-button-row"><button type="button" data-ml-action="undo">Undo mirror edit</button><button type="button" data-ml-action="redo">Redo</button></div>
      <div class="spot-finish-pair">${ranges('global',[['curvature','Orb curvature',0,100,'%'],['tint','Glass tint',0,100,'%']])}</div><div data-ml-color-slot></div></section>
      <section class="spot-finish-group" data-ml-light-controls><h3>Reflection light</h3>
      <div class="spot-finish-pair">${ranges('light',[['x','Light horizontal position',-100,200,'%'],['y','Light vertical position',-100,200,'%'],['height','Height above card',5,200,'%'],['size','Light size',1,100,'%'],['strength','Reflection brightness',0,200,'%']])}<label class="spot-card-color-picker">Reflection color<input type="color" data-ml="light.color" aria-label="Reflection color"><output data-ml-light-color></output></label></div>
      <p class="spot-card-caption">One light illuminates every mirror. Position and axes control where each reflection appears; distance and light size control its size and softness. Height is relative to the card height.</p></section>
      <section class="spot-finish-group" data-ml-object-controls><div class="spot-finish-group-heading mirror-selected-heading"><h3>Selected mirror</h3><select data-ml-selected aria-label="Selected mirror"></select></div>
      <div class="spot-card-button-row"><button type="button" data-ml-action="back">Send backward</button><button type="button" data-ml-action="front">Bring forward</button></div>
      <div class="spot-finish-pair mirror-object-transforms">${ranges('object',[['size','Size',25,300,'%'],['rotation','Z rotation',-180,180,'°'],['rotation_x','X rotation',-180,180,'°'],['rotation_y','Y rotation',-180,180,'°'],['x','Horizontal position',-100,200,'% of card'],['y','Vertical position',-100,200,'% of card'],['width','Width',.63,126,'mm'],['height','Height',.88,176,'mm'],['skew','Skew',-60,60,'°']])}</div>
      <p class="spot-card-caption">Dimensions are in mm on a 63 × 88 mm card, before rotation or skew. Size scales both dimensions together.</p>${flips('object')}
      <div class="spot-finish-pair"><div><label class="spot-card-check"><input type="checkbox" data-ml-override="tint"> Override glass tint</label>${ranges('appearance',[['tint','Glass tint',0,100,'%']])}<label class="spot-card-color-picker">Tint color<input type="color" data-ml="appearance.color" aria-label="Selected mirror tint color"><output data-ml-appearance-color></output></label></div><div><label class="spot-card-check"><input type="checkbox" data-ml-override="strength"> Override strength</label>${ranges('appearance',[['strength','Effect strength',0,100,'%']])}</div></div>
      <p class="spot-card-caption">Unchecked overrides use the layer settings. These values apply only to the selected mirror.</p>
      </section>
      <section class="spot-finish-group"><label class="spot-card-check"><input type="checkbox" data-ml="mirror"> Mirror · AI scene</label><p class="spot-card-caption">Leave off for empty glass. Turn on to place artwork inside the mirrors.</p>
      </section>
      <section class="spot-finish-group" data-ml-image-controls><div class="spot-finish-group-heading"><h3 data-ml-image-title>Image across all mirrors</h3><span class="spot-card-caption">Adjust without regenerating</span></div>
      <div class="spot-finish-pair">${ranges('image',[['x','Image horizontal position',-200,200,'%'],['y','Image vertical position',-200,200,'%'],['zoom','Image zoom',10,500,'%'],['rotation','Image Z rotation',-180,180,'°'],['rotation_x','Image X rotation',-180,180,'°'],['rotation_y','Image Y rotation',-180,180,'°'],['skew','Image skew',-60,60,'°']])}</div>${flips('image')}<p class="spot-card-caption">Rotation applies when you release the slider or finish entering a value. X and Y turn the artwork inside a sphere; Z spins it. Controls affect all mirrors in Large scene mode, or the selected mirror in other modes.</p></section>
      <section class="spot-finish-group" data-ml-generation-controls><h3>Generate artwork</h3>
      ${select('mode','Artwork in mirrors',[['continuous','Large scene across all mirrors'],['replicated','One scene replicated in every mirror'],['individual','Individual micro scenes']])}
      <div class="spot-finish-pair" data-ml-micro-options>${select('target','Target',[['face','Face'],['body','Body'],['random','Random'],['focus','Focus']])}</div>
      <div data-ml-shared-prompt>${select('theme','Theme',themes)}<label><span data-ml-prompt-label>Additional details (optional)</span><textarea data-ml="prompt" rows="3" maxlength="1000"></textarea></label></div>
      <section data-ml-micro-list><h4 data-ml-micro-heading>Micro scenes</h4><p class="spot-card-caption" data-ml-micro-help>Choose each mirror’s theme. Use its prompt button for optional details and style.</p><div data-ml-scene-rows></div></section>
      <p class="spot-card-caption" data-ml-margin-help>New micro scenes include extra artwork on every side for repositioning and zooming out. Regenerate older scenes to add that room.</p>
      <label class="spot-card-check"><input type="checkbox" data-ml="maintain_style"> Maintain art style</label><p class="spot-card-caption" data-ml-source-help></p>
      <div class="spot-card-button-row"><button type="button" data-ml-action="generate">Generate artwork</button><button type="button" data-ml-action="generate-one">Generate selected mirror</button><button type="button" data-ml-action="view">View selected image</button></div>
      <p class="spot-card-caption" data-ml-ready></p></section>`;
    panel.querySelector('[data-ml-image-controls]').insertAdjacentHTML('beforeend','<label class="spot-card-check"><input type="checkbox" data-ml="mirror_angle"> Mirror angle · reflect by position and axes</label><p class="spot-card-caption">Approximates a reflection from the available 2D scene. Moving or rotating a mirror changes the part it reflects; hidden scenery cannot be recovered.</p>');
    panel.prepend(field);
    // Keep this panel next to the effect fieldset so its progress actions can
    // remain enabled while only the editable settings are disabled.
    const generation=panel.querySelector('[data-ml-generation-controls]');generation.remove();
    const settings=document.createElement('fieldset');settings.dataset.spotEditControls='';settings.className='mirror-settings';settings.setAttribute('aria-label','Mirror settings');
    settings.append(...panel.childNodes);panel.append(settings,generation);
    const generationSettings=document.createElement('fieldset');generationSettings.dataset.spotEditControls='';generationSettings.className='mirror-settings mirror-generation-settings';generationSettings.setAttribute('aria-label','Mirror generation settings');
    generationSettings.append(...generation.childNodes);generation.append(generationSettings);
    const actions=panel.querySelector('[data-ml-action="generate"]').closest('.spot-card-button-row');
    actions.before(panel.querySelector('[data-ml-ready]'));
    panel.className='spot-finish-controls is-printable';
    dialog.querySelector('[data-spot-pattern-controls]').closest('fieldset').after(panel);
    const job=document.createElement('section');job.className='art-ai-job';job.dataset.mlJob='';job.hidden=true;job.setAttribute('aria-label','Mirror scene progress');
    job.innerHTML='<div class="art-job-title"><strong data-ml-job-title></strong><span data-ml-time></span></div><ol class="art-job-stages"><li>Prepare</li><li>Generate scenes</li><li>Review</li></ol><p class="spot-card-caption" data-ml-job-message role="status" aria-live="polite"></p><p class="spot-card-caption" data-ml-model></p><div class="spot-card-button-row"><button type="button" data-ml-cancel>Cancel generation</button><button type="button" data-ml-diagnostics hidden>Export AI diagnostics</button></div>';
    generation.append(job);
    const retry=document.createElement('button');retry.type='button';retry.hidden=true;retry.textContent='Retry unfinished mirrors';retry.dataset.mlRetry='';job.querySelector('.spot-card-button-row').append(retry);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 756 1056');svg.setAttribute('aria-label','Move mirror objects');
    svg.classList.add('mirror-object-guides');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:41;pointer-events:none;touch-action:none;';stage.append(svg);
    const liveTextures=document.createElement('div');liveTextures.className='mirror-live-surfaces';liveTextures.hidden=true;stage.append(liveTextures);
    const menu=document.createElement('div');menu.className='mirror-object-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Mirror object');menu.popover='manual';menu.hidden=true;
    menu.innerHTML='<button type="button" role="menuitem" data-ml-context="reset">Reset</button><button type="button" role="menuitem" data-ml-context="delete">Delete</button>';dialog.append(menu);
    let menuObject='',placingV=false;
    function closeMenu(focus=false){
      if(menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;menuObject='';
      if(focus)(svg.querySelector(`:scope > [data-object="${selected}"]`)||panel.querySelector('[data-ml-count]')).focus({preventScroll:true});
    }
    function openMenu(id,x,y){
      if(drag||host.busy()||!host.active()||!read().objects.some(o=>o.id===id))return;
      selectObject(id);update();menuObject=id;menu.hidden=false;menu.showPopover();
      const bounds=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-bounds.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-bounds.height-8))+'px';
      menu.querySelector('button').focus({preventScroll:true});
    }
    menu.addEventListener('click',event=>{
      const action=event.target.closest('[data-ml-context]')?.dataset.mlContext;
      if(!action||host.busy())return;
      const index=read().objects.findIndex(o=>o.id===menuObject);if(index<0){closeMenu();return;}
      remember();const obj=state.objects[index];
      if(action==='reset')Object.assign(obj,obj.home,{image:imageDefaults(),appearance:{}});
      else{state.objects.splice(index,1);selected=state.objects[Math.min(index,state.objects.length-1)]?.id||'';prune();}
      closeMenu();pendingPreview=false;store();closeMenu(true);
    });
    document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target))closeMenu();},true);
    document.addEventListener('keydown',event=>{
      if(menu.hidden)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMenu(true);}
      else if(event.key==='Tab')closeMenu(true);
      else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopPropagation();const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);
        items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:items.length-1))%items.length].focus();
      }
    },true);
    dialog.addEventListener('scroll',()=>closeMenu(),true);window.addEventListener('resize',()=>closeMenu());
    let state=null,serialized='',settingsDirty=false,selected='m1',moving=true,drag=null,operation=null,diagnosticsUrl=null,jobScope='',past=[],future=[],scope='';
    let surfaces={},surfaceKey='',surfaceTimer=null,surfaceRequest=null,pendingPreview=false,liveMask=null;
    let focusArtwork=null,focusPicker=null,focusVersion=0;
    const rotationDrafts=new Map();
    const visualDrafts=new Map();let retryBatch=null;
    const read=()=>{if(field.value!==serialized){settingsDirty=false;try{state=JSON.parse(field.value);state.mirror??=Boolean(Object.keys(state.scenes).length);state.layout_seed??=0;state.target??='face';state.mirror_angle??=false;state.light={...lightDefaults(),...state.light};state.image={...imageDefaults(),...state.image};for(const o of state.objects){o.size??=100;o.rotation_x??=0;o.rotation_y??=0;o.theme??='inherit';if(o.appearance)delete o.appearance.reflection;o.image={...imageDefaults(),...o.image};o.home??=objectTransform(o);o.home={size:100,rotation_x:0,rotation_y:0,...o.home};}}catch(_){state=defaults();}serialized=field.value;}normalizeMicro(state);return state;};
    function normalizeMicro(value){
      if(value?.mode!=='individual'||value.variation==='automatic')return;
      if(value.variation==='shared')for(const o of value.objects){o.theme=value.theme;o.prompt=[value.prompt,o.prompt].filter(Boolean).join(' ').slice(0,1000);}
      value.variation='automatic';
    }
    const object=()=>read().objects.find(o=>o.id===selected)||read().objects[0];
    const target=key=>(key==='object'?object():key==='image'?(read().mode==='continuous'?read().image:object()?.image):key==='light'?read().light:key==='appearance'?{...host.appearanceDefaults(),tint:read().tint,...object()?.appearance}:read())||{};
    // Keep stored geometry and print bakes stable; only the UI uses millimeters.
    // Include Size so these are the object's actual dimensions before projection.
    const dimensionFactor=(prefix,key)=>prefix==='object'&&key in cardMillimeters?cardMillimeters[key]*(object()?.size??100)/10000:1;
    const controlValue=(prefix,key)=>target(prefix)[key]*dimensionFactor(prefix,key);
    let controlBinding='';
    function selectObject(id){
      if(id===selected)return;
      // Canvas pointerdown deliberately prevents default focus changes. Finish
      // any old object's numeric/rotation edit before binding another object.
      const active=document.activeElement;
      if(panel.contains(active)&&(active.matches('[data-ml],[data-ml-scene-field],.studio-range-input')))active.blur();
      for(const input of [...rotationDrafts.keys()])input.dispatchEvent(new Event('change',{bubbles:true}));
      for(const input of [...visualDrafts.keys()])input.dispatchEvent(new Event('change',{bubbles:true}));
      selected=id;
    }
    const remember=()=>{past.push(clone(read()));if(past.length>25)past.shift();future=[];};
    function flush(){
      for(const input of [...visualDrafts.keys()])input.dispatchEvent(new Event('change',{bubbles:true}));
      if(!settingsDirty)return;
      read(); // An externally loaded layer replaces any old pending settings.
      if(settingsDirty){serialized=field.value=JSON.stringify(state);settingsDirty=false;}
    }
    function store(render=true){normalizeMicro(state);serialized=field.value=JSON.stringify(state);settingsDirty=false;if(render)host.changed();update();}
    function prune(){const used=new Set([state.shared_scene,...state.objects.map(o=>o.scene)]);state.scenes=Object.fromEntries(Object.entries(state.scenes).filter(([key])=>used.has(key)));}
    function prepareSurfaces(){
      if(drag||!host.active()||host.busy())return;
      const params=host.surfaceParams(),visual={...params,mirrors:{...params.mirrors,objects:params.mirrors.objects.map(o=>({...o}))}};
      // Prompt and theme edits do not change already generated textures.
      if(visual.mirrors){for(const k of ['target','variation','theme','prompt','maintain_style','layout','layout_seed','layout_origin'])delete visual.mirrors[k];for(const o of visual.mirrors.objects)for(const k of ['prompt','theme','style','home','focus'])delete o[k];}
      const key=host.scope()+JSON.stringify(visual);
      if(key===surfaceKey)return;surfaceKey=key;clearTimeout(surfaceTimer);surfaceRequest?.abort();
      surfaceTimer=setTimeout(async()=>{
        const controller=new AbortController();surfaceRequest=controller;
        try{const result=await host.request('mirror-surfaces',params,controller.signal);if(key!==surfaceKey||result.superseded)return;surfaces=result.surfaces;guides();}
        catch(error){if(error.name!=='AbortError'&&key===surfaceKey){surfaceKey='';host.message('Could not prepare movable mirrors. '+error.message,true);}}
      },220);
    }
    function guides(){
      svg.replaceChildren();const visible=(moving||rotationDrafts.size>0)&&host.active()&&host.canMove()&&!host.busy();svg.style.pointerEvents=placingV?'all':'none';svg.style.cursor=placingV?'crosshair':'';svg.style.display=visible?'block':'none';
      const live=visible&&(Boolean(drag)||pendingPreview)&&read().objects.every(o=>surfaces[o.id]);host.livePreview(live);
      liveTextures.hidden=!live;liveTextures.replaceChildren();
      if(!visible)return;
      const node=(tag,attrs,parent=svg)=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;};
      if(placingV){node('rect',{x:0,y:0,width:756,height:1056,fill:'transparent',style:'pointer-events:all;cursor:crosshair'});return;}
      const handles=document.createElementNS(svg.namespaceURI,'g');
      if(live){
        liveTextures.style.opacity=host.surfaceOpacity();liveTextures.style.maskImage=liveMask?`url("${liveMask}")`:'none';
        for(const o of read().objects){const img=new Image();img.src=surfaces[o.id];img.dataset.surface=o.id;img.alt='';img.style.transform=textureTransform(o);liveTextures.append(img);}
      }
      for(const o of read().objects){
        const m=geometry(o),[cx,cy]=project(m,0,0),current=o.id===object().id;
        const shape=node('path',{d:outline(o),fill:'transparent',stroke:current?'#40e788':'transparent','stroke-width':1.5,'vector-effect':'non-scaling-stroke','data-object':o.id,tabindex:0,'aria-label':`Mirror ${read().objects.indexOf(o)+1}`,style:'cursor:grab;pointer-events:all'});
        if(current){
          const label=node('text',{x:cx,y:cy-10,'text-anchor':'middle',fill:'white',stroke:'#101920','stroke-width':3,'paint-order':'stroke','font-size':17,'pointer-events':'none'},handles);label.textContent='Mirror '+(read().objects.indexOf(o)+1);
          const corner=project(m,.5,.5),handle=node('circle',{cx:corner[0],cy:corner[1],r:7,fill:'#40e788',stroke:'#0b1c14','stroke-width':2,'data-object':o.id,'data-resize':'true',style:'cursor:nwse-resize;pointer-events:all'},handles);
          handle.setAttribute('aria-label','Resize selected mirror');
        }
      }
      svg.append(handles);
      drawRotationIndicator();
    }
    function drawRotationIndicator(){
      svg.querySelector('[data-ml-rotation-guide]')?.remove();
      if(!rotationDrafts.size||!host.active()||!host.canMove()||host.busy()||!object())return;
      const entries=[...rotationDrafts].filter(([,draft])=>draft.scope===host.scope()&&draft.id===selected);
      if(!entries.length)return;
      const last=entries.at(-1)[0],imageRotation=last.dataset.ml.startsWith('image.'),draftObject={...object()},draftImage={...target('image')};
      for(const [input] of entries){const [prefix,key]=input.dataset.ml.split('.');(prefix==='object'?draftObject:draftImage)[key]=Number(input.value);}
      svg.style.display='block';
      const add=(tag,attrs,parent)=>{const el=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);parent.append(el);return el;};
      const group=add('g',{'data-ml-rotation-guide':'','pointer-events':'none'},svg),m=geometry(imageRotation?object():draftObject),[cx,cy]=project(m,0,0);
      const line=(points,color,dashed=false)=>add('path',{d:points.map(([x,y],i)=>(i?'L':'M')+x+','+y).join(' '),fill:'none',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...(dashed?{'stroke-dasharray':'5 4'}:{})},group);
      if(!imageRotation)add('path',{d:outline(draftObject),fill:'none',stroke:'#40e788','stroke-width':2,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke','data-ml-rotation-outline':''},group);
      const z=(imageRotation?draftImage.rotation:0)*Math.PI/180,x=(imageRotation?draftImage.rotation_x:0)*Math.PI/180,y=(imageRotation?draftImage.rotation_y:0)*Math.PI/180;
      const c=Math.cos(z),s=Math.sin(z),cx3=Math.cos(x),sx3=Math.sin(x),cy3=Math.cos(y),sy3=Math.sin(y);
      const axis=(u,v)=>project(m,.35*(c*cy3*u+(c*sy3*sx3-s*cx3)*v),.35*(s*cy3*u+(s*sy3*sx3+c*cx3)*v));
      line([axis(-1,0),axis(1,0)],'#40e788');line([axis(0,-1),axis(0,1)],'#ffffff');
      const tip=axis(1,0);add('circle',{cx:tip[0],cy:tip[1],r:3,fill:'#40e788'},group);
      const key=last.dataset.ml.split('.')[1],axisName=key==='rotation'?'Z':key==='rotation_x'?'X':'Y';
      const label=(imageRotation?'Image ':'')+axisName+' '+Number(last.value)+'°',fontSize=Math.max(14,12*756/Math.max(1,stage.clientWidth)),width=label.length*fontSize*.62+14;
      const lx=Math.max(width/2+3,Math.min(756-width/2-3,cx)),ly=Math.max(fontSize+8,Math.min(1056-fontSize-8,cy+fontSize*1.7));
      add('rect',{x:lx-width/2,y:ly-fontSize,width,height:fontSize+9,rx:4,fill:'#101920e8'},group);
      add('text',{x:lx,y:ly,'text-anchor':'middle',fill:'#ffffff','font-size':fontSize,'data-ml-rotation-angle':''},group).textContent=label;
    }
    function outline(o){
      const m=geometry(o),points=read().shape==='square'?[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]:Array.from({length:96},(_,i)=>[.5*Math.cos(i*Math.PI/48),.5*Math.sin(i*Math.PI/48)]);
      return points.map(([x,y],i)=>(i?'L':'M')+project(m,x,y).join(',')).join(' ')+'Z';
    }
    function textureTransform(o){
      // CSS uses the same homography as the printed PIL surface. Shift the
      // local [-.5,.5] plane to a 100px image, then scale to the stage viewport.
      const m=geometry(o),sx=stage.clientWidth/756,sy=stage.clientHeight/1056;
      const c=m[2]-(m[0]+m[1])/2,f=m[5]-(m[3]+m[4])/2,w=1-(m[6]+m[7])/2;
      return `matrix3d(${[m[0]*sx/100,m[3]*sy/100,0,m[6]/100,m[1]*sx/100,m[4]*sy/100,0,m[7]/100,0,0,1,0,c*sx,f*sy,0,w].join(',')})`;
    }
    function moveGuides(){
      // Reuse decoded texture images during dragging. No PNG serialization,
      // image decoding, network calls or whole-card rendering per pointer move.
      const o=object(),m=geometry(o),[x,y]=project(m,0,0),corner=project(m,.5,.5),image=liveTextures.querySelector(`[data-surface="${o.id}"]`);
      if(image)image.style.transform=textureTransform(o);
      svg.querySelector(`:scope > [data-object="${o.id}"]`)?.setAttribute('d',outline(o));
      const handle=svg.querySelector('[data-resize]');handle?.setAttribute('cx',corner[0]);handle?.setAttribute('cy',corner[1]);
      const label=svg.querySelector('text');label?.setAttribute('x',x);label?.setAttribute('y',y-10);
    }
    let sceneRowKey='';
    function captureFocusArtwork(){
      const {image,bounds}=host.focusSource(),box=bounds.map((v,i)=>Math.round(v*(i%2?image.height:image.width)));
      const canvas=document.createElement('canvas');canvas.width=box[2]-box[0];canvas.height=box[3]-box[1];
      canvas.getContext('2d').drawImage(image,box[0],box[1],canvas.width,canvas.height,0,0,canvas.width,canvas.height);
      focusArtwork={source:image,box,canvas,version:++focusVersion};
    }
    function closeFocus(){focusPicker=null;panel.querySelectorAll('[data-ml-focus-editor]').forEach(e=>e.hidden=true);panel.querySelectorAll('[data-ml-focus]').forEach(e=>e.setAttribute('aria-expanded','false'));}
    function focusSquare(x,y,side){
      const {canvas}=focusArtwork,size=Math.max(4,Math.min(canvas.width,canvas.height,side));
      const l=Math.max(0,Math.min(canvas.width-size,x-size/2)),t=Math.max(0,Math.min(canvas.height-size,y-size/2));return [l,t,l+size,t+size];
    }
    function drawFocus(){
      if(!focusPicker)return;
      const canvas=focusPicker.canvas,ctx=canvas.getContext('2d'),[l,t,r,b]=focusPicker.rect;
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(focusArtwork.canvas,0,0);
      ctx.fillStyle='#07101bb0';ctx.fillRect(0,0,canvas.width,t);ctx.fillRect(0,b,canvas.width,canvas.height-b);ctx.fillRect(0,t,l,b-t);ctx.fillRect(r,t,canvas.width-r,b-t);
      ctx.strokeStyle='#40e788';ctx.lineWidth=Math.max(2,canvas.width/250);ctx.strokeRect(l,t,r-l,b-t);
    }
    function openFocus(id){
      if(focusPicker?.id===id){closeFocus();return;}
      closeFocus();captureFocusArtwork();selectObject(id);
      const row=panel.querySelector(`[data-ml-scene-id="${id}"]`),canvas=row.querySelector('[data-ml-focus-canvas]'),o=read().objects.find(o=>o.id===id),{source,box}=focusArtwork;
      canvas.width=focusArtwork.canvas.width;canvas.height=focusArtwork.canvas.height;
      let rect=o.focus?.map((v,i)=>v*(i%2?source.height:source.width)-box[i%2]);
      if(!rect||rect[0]<0||rect[1]<0||rect[2]>canvas.width||rect[3]>canvas.height)rect=focusSquare(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)*.3);
      focusPicker={id,canvas,rect,pointer:null};update();drawFocus();row.querySelector('[data-ml-focus-editor]').scrollIntoView({block:'nearest'});canvas.focus({preventScroll:true});
    }
    function commitFocus(){
      if(!focusPicker)return;
      const {id,rect}=focusPicker,{source,box}=focusArtwork,o=read().objects.find(o=>o.id===id);if(!o){closeFocus();return;}
      remember();o.focus=rect.map((v,i)=>(v+box[i%2])/(i%2?source.height:source.width));
      closeFocus();host.settingsChanged();store(false);panel.querySelector(`[data-ml-scene-id="${id}"] [data-ml-focus]`)?.focus({preventScroll:true});
    }
    const focusPoint=(event,canvas)=>{const b=canvas.getBoundingClientRect();return [Math.max(0,Math.min(canvas.width,(event.clientX-b.left)*canvas.width/b.width)),Math.max(0,Math.min(canvas.height,(event.clientY-b.top)*canvas.height/b.height))];};
    panel.addEventListener('pointerdown',event=>{
      if(!event.target.matches('[data-ml-focus-canvas]')||!focusPicker||host.busy()||event.button!==0)return;
      event.preventDefault();event.stopPropagation();const canvas=focusPicker.canvas,[x,y]=focusPoint(event,canvas);
      focusPicker.pointer=event.pointerId;focusPicker.start=[x,y];focusPicker.rect=focusSquare(x,y,Math.min(canvas.width,canvas.height)*.3);canvas.setPointerCapture(event.pointerId);drawFocus();
    });
    panel.addEventListener('pointermove',event=>{
      if(!focusPicker||focusPicker.pointer!==event.pointerId)return;event.preventDefault();
      const [x,y]=focusPoint(event,focusPicker.canvas),[sx,sy]=focusPicker.start,dx=x-sx,dy=y-sy,side=Math.max(Math.abs(dx),Math.abs(dy));
      if(side<4)return;
      focusPicker.rect=focusSquare(sx+(dx<0?-1:1)*side/2,sy+(dy<0?-1:1)*side/2,side);drawFocus();
    });
    const finishFocus=event=>{if(!focusPicker||focusPicker.pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();focusPicker.canvas.releasePointerCapture(event.pointerId);focusPicker.pointer=null;if(event.type!=='pointercancel')commitFocus();};
    panel.addEventListener('pointerup',finishFocus);panel.addEventListener('pointercancel',finishFocus);
    panel.addEventListener('keydown',event=>{
      if(!focusPicker||!event.target.matches('[data-ml-focus-canvas]'))return;
      const [l,t,r,b]=focusPicker.rect,step=event.shiftKey?10:2,size=r-l,cx=(l+r)/2,cy=(t+b)/2;
      if(event.key==='Enter'){event.preventDefault();commitFocus();return;}
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();focusPicker.rect=focusSquare(cx+(event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0),cy+(event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0),size+(['+','='].includes(event.key)?step:event.key==='-'?-step:0));drawFocus();
    });
    function updateSceneRows(value){
      const list=panel.querySelector('[data-ml-scene-rows]'),key=value.objects.map(o=>o.id).join('|');
      if(key!==sceneRowKey){
        closeFocus();sceneRowKey=key;list.replaceChildren();
        value.objects.forEach((o,i)=>{
          const row=document.createElement('div');row.className='mirror-scene-row';row.dataset.mlSceneId=o.id;
          row.innerHTML=`<div class="mirror-scene-heading"><button type="button" data-ml-scene-select>Mirror ${i+1}</button><select data-ml-scene-field="theme" aria-label="Mirror ${i+1} theme">${themes.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><button type="button" data-ml-scene-prompt aria-label="Prompt for mirror ${i+1}" title="Edit optional prompt" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4h16v12H9l-5 4zM8 8h8M8 12h5"/></svg></button></div><div data-ml-scene-details hidden><label>Optional prompt<textarea data-ml-scene-field="prompt" rows="2" maxlength="1000" placeholder="Details for this micro scene…"></textarea></label><label>Optional style<textarea data-ml-scene-field="style" rows="2" maxlength="500" placeholder="Medium, palette, brushwork…"></textarea></label></div>`;
          row.querySelector('[data-ml-scene-select]').insertAdjacentHTML('afterend',`<button type="button" data-ml-focus aria-label="Choose focus for mirror ${i+1}" aria-expanded="false" title="Choose artwork focus"><canvas width="88" height="88" aria-hidden="true"></canvas><span aria-hidden="true">Focus</span></button>`);
          row.querySelector('.mirror-scene-heading').insertAdjacentHTML('afterend',`<div class="mirror-focus-editor" data-ml-focus-editor hidden><div class="mirror-focus-heading"><span>Focus · fixed art box</span><button type="button" data-ml-focus-close>Cancel</button></div><p class="spot-card-caption">Drag a square around the area to use, or click a detail. Release to select. Arrow keys move the box; + / − resize it; Enter selects.</p><canvas data-ml-focus-canvas tabindex="0" aria-label="Select artwork focus for mirror ${i+1}"></canvas></div>`);
          list.append(row);
        });
      }
      const focus=value.target==='focus',shared=false;
      if(focus&&!focusArtwork&&!host.busy())captureFocusArtwork();
      if(!focus||value.mode!=='individual'||host.busy())closeFocus();
      for(const row of list.children){
        const o=value.objects.find(o=>o.id===row.dataset.mlSceneId);row.classList.toggle('is-selected',o.id===selected);
        row.classList.toggle('has-focus',focus);row.classList.toggle('is-focus-only',shared);
        const focusButton=row.querySelector('[data-ml-focus]');focusButton.hidden=!focus;focusButton.setAttribute('aria-expanded',String(focusPicker?.id===o.id));
        row.querySelector('[data-ml-focus-editor]').hidden=focusPicker?.id!==o.id;
        row.querySelector('[data-ml-scene-field="theme"]').hidden=shared;row.querySelector('[data-ml-scene-prompt]').hidden=shared;
        row.querySelector('[data-ml-scene-details]').hidden=shared||row.querySelector('[data-ml-scene-prompt]').getAttribute('aria-expanded')!=='true';
        if(focus&&focusArtwork){
          const thumb=focusButton.querySelector('canvas'),key=focusArtwork.version+JSON.stringify(o.focus);
          focusButton.classList.toggle('has-focus-image',Boolean(o.focus));focusButton.title=o.focus?'Change artwork focus':'Choose artwork focus';
          if(thumb.dataset.focusKey!==key){thumb.dataset.focusKey=key;const ctx=thumb.getContext('2d');ctx.clearRect(0,0,88,88);if(o.focus){const image=focusArtwork.source,[l,t,r,b]=o.focus.map((v,i)=>v*(i%2?image.height:image.width));ctx.drawImage(image,l,t,r-l,b-t,0,0,88,88);}}
        }
        row.querySelector('[data-ml-scene-select]').setAttribute('aria-pressed',String(o.id===selected));
        row.querySelector('[data-ml-scene-prompt]').classList.toggle('has-prompt',Boolean(o.prompt||o.style));
        for(const input of row.querySelectorAll('[data-ml-scene-field]'))if(document.activeElement!==input)input.value=input.dataset.mlSceneField==='theme'&&o.theme==='inherit'?'normal':o[input.dataset.mlSceneField];
      }
    }
    function update(){
      const active=host.active();panel.hidden=!active;
      if(!menu.hidden&&(!active||host.busy()||scope!==host.scope()||!host.canMove()))closeMenu();
      if(scope!==host.scope()){scope=host.scope();past=[];future=[];rotationDrafts.clear();moving=true;placingV=false;closeFocus();focusArtwork=null;selected='m1';surfaces={};surfaceKey='';pendingPreview=false;surfaceRequest?.abort();}
      job.hidden=!active||jobScope!==scope;
      if(!active){guides();return;}
      const value=read(),current=object();selected=current?.id||'';
      const binding=scope+'/'+selected+'/'+value.mode,bindingChanged=binding!==controlBinding;controlBinding=binding;
      if(value.layout!=='downward_v'||!host.canMove())placingV=false;
      panel.querySelector('[data-ml-v-controls]').hidden=value.layout!=='downward_v';
      panel.querySelector('[data-ml-action="v-origin"]').setAttribute('aria-pressed',String(placingV));
      panel.querySelector('[data-ml-v-help]').textContent=placingV?'Click the subject’s head on the card. Press Escape to cancel.':'Click Place V at head, then click the subject’s head on the card to position the arrangement.';
      panel.querySelector('[data-ml-object-controls]').hidden=!current;
      panel.querySelectorAll('[data-ml-shape]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mlShape===value.shape)));
      for(const input of panel.querySelectorAll('[data-ml]')){
        const key=input.dataset.ml,[prefix,prop]=key.includes('.')?key.split('.'):['global',key];
        const dimension=prefix==='object'&&prop in cardMillimeters;
        if(dimension){const factor=dimensionFactor(prefix,prop);input.min=String(factor);input.max=String(factor*200);}
        const val=dimension?controlValue(prefix,prop):target(prefix)[prop];if((document.activeElement===input&&!bindingChanged&&input.type!=='checkbox')||rotationDrafts.has(input))continue;
        if(input.type==='checkbox')input.checked=Boolean(val);else input.value=dimension&&Number.isFinite(val)?Number(val.toFixed(2)):val??'';
      }
      for(const output of panel.querySelectorAll('[data-ml-value]')){
        const [prefix,prop]=output.dataset.mlValue.split('.'),range=panel.querySelector(`[data-ml="${output.dataset.mlValue}"]`),value=rotationDrafts.has(range)?Number(range.value):controlValue(prefix,prop);
        const precision=prefix==='object'&&prop in cardMillimeters?2:1;
        const text=Number.isFinite(value)?String(Number(value.toFixed(precision)))+output.dataset.mlUnit:'—';
        if(output.value!==text)output.value=text;
      }
      for(const key of ['tint','strength']){
        const enabled=Object.hasOwn(current?.appearance||{},key),toggle=panel.querySelector(`[data-ml-override="${key}"]`);toggle.checked=enabled;
        panel.querySelector(`[data-ml="appearance.${key}"]`).disabled=!enabled||host.busy();
        if(key==='tint')panel.querySelector('[data-ml="appearance.color"]').disabled=!enabled||host.busy();
      }
      panel.querySelector('[data-ml-appearance-color]').textContent=target('appearance').color.toUpperCase();
      panel.querySelector('[data-ml-light-color]').textContent=read().light.color.toUpperCase();
      const picker=panel.querySelector('[data-ml-selected]');picker.replaceChildren(...value.objects.map((o,i)=>new Option(`Mirror ${i+1}${o.scene?' · image ready':''}${o.prompt||o.style?' · custom':''}`,o.id)));picker.value=selected;
      if(document.activeElement!==panel.querySelector('[data-ml-count]'))panel.querySelector('[data-ml-count]').value=value.objects.length;
      panel.querySelector('[data-ml-micro-options]').hidden=value.mode!=='individual';
      panel.querySelector('[data-ml-margin-help]').hidden=value.mode!=='individual';
      const micro=value.mode==='individual';
      panel.querySelector('[data-ml-micro-list]').hidden=!micro;updateSceneRows(value);
      panel.querySelector('[data-ml-micro-heading]').textContent='Micro scenes';
      panel.querySelector('[data-ml-micro-help]').textContent='Variations are automatic. Each mirror’s prompt strongly directs its result.'+(value.target==='focus'?' Click its Focus thumbnail to choose the source artwork.':' Choose its theme and open the prompt button to add details.');
      panel.querySelector('[data-ml-source-help]').textContent=micro&&value.target==='focus'?'Uses each selected crop of your edited artwork. More mirrors require more generation time.':'Uses your edited artwork with detected text and frame excluded. More mirrors require more generation time.';
      panel.querySelector('[data-ml-shared-prompt]').hidden=micro;
      panel.querySelector('[data-ml="theme"]').closest('label').firstChild.textContent='Theme';
      panel.querySelector('[data-ml-prompt-label]').textContent='Additional details (optional)';
      panel.querySelector('[data-ml="global.curvature"]').closest('label').hidden=value.shape!=='sphere';
      for(const key of ['rotation_x','rotation_y'])panel.querySelector(`[data-ml="object.${key}"]`).closest('label').hidden=value.shape==='sphere';
      for(const key of ['rotation_x','rotation_y'])panel.querySelector(`[data-ml="image.${key}"]`).closest('label').hidden=value.shape!=='sphere';
      panel.querySelector('[data-ml="object.rotation"]').closest('label').querySelector('span').textContent=value.shape==='sphere'?'Rotation':'Z rotation';
      panel.querySelector('[data-ml-image-controls]').hidden=!current||!value.mirror;
      panel.querySelector('[data-ml-generation-controls]').hidden=!value.mirror;
      panel.querySelector('[data-ml-placement-help]').textContent=!current?'No mirrors. Increase Count to add objects, or Undo to restore them.':host.hasMask()?'Drag to move; drag the corner to resize. Right-click for Reset or Delete. The mask clips the glass.':'Drag to move; drag the corner to resize. Right-click for Reset or Delete. No mask: mirrors use the whole card.';
      panel.querySelector('[data-ml-image-title]').textContent=value.mode==='continuous'?'Image across all mirrors':'Image inside selected mirror';
      panel.querySelector('[data-ml-action="move"]').setAttribute('aria-pressed',String(moving&&host.canMove()));
      panel.querySelector('[data-ml-action="undo"]').disabled=!past.length;panel.querySelector('[data-ml-action="redo"]').disabled=!future.length;
      for(const name of ['generate','generate-one'])panel.querySelector(`[data-ml-action="${name}"]`).disabled=!current||!host.generatorReady();
      for(const name of ['copy','layout'])panel.querySelector(`[data-ml-action="${name}"]`).disabled=!current;
      panel.querySelector('[data-ml-action="generate-one"]').hidden=value.mode!=='individual';
      panel.querySelector('[data-ml-action="generate"]').textContent=value.mode==='individual'?'Generate all micro scenes':'Generate shared scene';
      panel.querySelector('[data-ml-ready]').textContent=host.generatorReady()?`${Object.keys(value.scenes).length} saved scene image(s). Save for this card to keep changes.`:'Install and enable a complete generation package in Card Finishing Studio settings.';
      panel.querySelector('[data-ml-action="view"]').disabled=!(value.mode==='individual'?current?.scene:value.shared_scene);
      guides();prepareSurfaces();
    }
    const beforeEdits=new WeakMap(),settingsHistory=new WeakSet();
    function historyButtons(){
      panel.querySelector('[data-ml-action="undo"]').disabled=!past.length;
      panel.querySelector('[data-ml-action="redo"]').disabled=!future.length;
    }
    function editSetting(input,owner,prop){
      // Prompts describe a future generation. Keep only their strings in the
      // draft; do not serialize scene PNGs, scan masks or refresh the preview.
      if(!beforeEdits.has(input)||beforeEdits.get(input).scope!==host.scope()){
        beforeEdits.set(input,{snapshot:clone(state),value:owner[prop],scope:host.scope(),settingsOnly:true});
        host.settingsChanged();
      }
      owner[prop]=input.value;settingsDirty=true;
      const row=input.closest('[data-ml-scene-id]');
      if(row){
        row.querySelector('[data-ml-scene-prompt]').classList.toggle('has-prompt',Boolean(owner.prompt||owner.style));
        const index=state.objects.indexOf(owner),option=panel.querySelector('[data-ml-selected]').options[index];
        if(option){const label=`Mirror ${index+1}${owner.scene?' · image ready':''}${owner.prompt||owner.style?' · custom':''}`;if(option.text!==label)option.text=label;}
      }
    }
    panel.addEventListener('click',event=>{
      const row=event.target.closest('[data-ml-scene-id]');if(!row||host.busy())return;
      if(event.target.closest('[data-ml-focus]'))openFocus(row.dataset.mlSceneId);
      if(event.target.closest('[data-ml-focus-close]')){closeFocus();row.querySelector('[data-ml-focus]').focus({preventScroll:true});}
      if(event.target.closest('[data-ml-scene-select]')){selectObject(row.dataset.mlSceneId);update();}
      if(event.target.closest('[data-ml-scene-prompt]')){
        const details=row.querySelector('[data-ml-scene-details]');details.hidden=!details.hidden;
        row.querySelector('[data-ml-scene-prompt]').setAttribute('aria-expanded',String(!details.hidden));
        if(!details.hidden)row.querySelector('textarea').focus({preventScroll:true});
      }
    });
    panel.addEventListener('input',event=>{
      const input=event.target,prop=input.dataset.mlSceneField;if(!prop)return;
      const obj=read().objects.find(o=>o.id===input.closest('[data-ml-scene-id]').dataset.mlSceneId);if(!obj)return;
      editSetting(input,obj,prop);
    });
    const isRotation=input=>/\.(rotation|rotation_x|rotation_y)$/.test(input.dataset.ml||'');
    const heldKeys=new Set();
    panel.addEventListener('keydown',event=>{if(isRotation(event.target)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))heldKeys.add(event.target);});
    panel.addEventListener('keyup',event=>{if(heldKeys.delete(event.target)&&rotationDrafts.has(event.target))event.target.dispatchEvent(new Event('change',{bubbles:true}));});
    panel.addEventListener('focusout',event=>{heldKeys.delete(event.target);if(rotationDrafts.has(event.target))event.target.dispatchEvent(new Event('change',{bubbles:true}));});
    panel.addEventListener('focusout',event=>{if(visualDrafts.has(event.target))event.target.dispatchEvent(new Event('change',{bubbles:true}));});
    panel.addEventListener('input',event=>{
      const override=event.target.dataset.mlOverride;
      if(override){
        remember();const o=object(),value=target('appearance');o.appearance={...o.appearance};
        const keys=override==='tint'?['tint','color']:['strength'];
        for(const key of keys){if(event.target.checked)o.appearance[key]=value[key];else delete o.appearance[key];}
        store();return;
      }
      const input=event.target,key=input.dataset.ml;if(!key)return;
      if(key==='layout')return;
      if(key==='prompt'||key==='theme'){editSetting(input,read(),key);return;}
      if(input.type==='number'&&!input.validity.valid)return;
      if(isRotation(input)){
        if(!rotationDrafts.has(input))rotationDrafts.set(input,{scope:host.scope(),id:selected});
        panel.querySelector(`[data-ml-value="${key}"]`).value=Number(input.value)+'°';
        if(placingV){placingV=false;guides();}else drawRotationIndicator();
        return; // Only lightweight SVG feedback; artwork rendering waits for commit.
      }
      if(['range','number','color'].includes(input.type)){
        if(!visualDrafts.has(input))visualDrafts.set(input,{scope:host.scope(),id:selected});
        const output=panel.querySelector(`[data-ml-value="${key}"]`);if(output)output.value=output.value.replace(/^-?[\d.]+/,input.value);
        return; // Keep slider feedback cheap; commit pixels and history on release.
      }
      if(!beforeEdits.has(input))beforeEdits.set(input,{snapshot:clone(read()),serialized:field.value});
      const [prefix,prop]=key.includes('.')?key.split('.'):['global',key];
      let value=input.type==='checkbox'?input.checked:['range','number'].includes(input.type)?Number(input.value):input.value;
      if(prefix==='object'&&prop in cardMillimeters)value=Math.max(1,Math.min(200,value/dimensionFactor(prefix,prop)));
      if(prefix==='appearance')object().appearance={...object().appearance,[prop]:value};else target(prefix)[prop]=value;
      store();
    });
    panel.addEventListener('change',event=>{const input=event.target;if(visualDrafts.has(input)){
      const draft=visualDrafts.get(input);visualDrafts.delete(input);
      if(draft.scope!==host.scope()||draft.id!==selected){update();return;}
      if(input.type==='number'&&!input.validity.valid)return;
      const [prefix,prop]=input.dataset.ml.includes('.')?input.dataset.ml.split('.'):['global',input.dataset.ml];
      let value=input.type==='color'?input.value:Number(input.value);
      if(prefix==='object'&&prop in cardMillimeters)value=Math.max(1,Math.min(200,value/dimensionFactor(prefix,prop)));
      if(target(prefix)[prop]!==value){remember();if(prefix==='appearance')object().appearance={...object().appearance,[prop]:value};else target(prefix)[prop]=value;store();}
      return;
    }if(rotationDrafts.has(input)){
      if(heldKeys.has(input))return;
      const draft=rotationDrafts.get(input);rotationDrafts.delete(input);
      if(draft.scope!==host.scope()||draft.id!==selected){update();return;}
      const [prefix,prop]=input.dataset.ml.split('.'),value=Number(input.value);
      if(target(prefix)[prop]!==value){remember();target(prefix)[prop]=value;store();}else guides();return;
    }if(input.dataset.ml==='layout'||input.hasAttribute('data-ml-count')){applyLayout(false);return;}const before=beforeEdits.get(input);if(before){beforeEdits.delete(input);
      if(before.settingsOnly){
        if(before.scope===host.scope()&&before.value!==input.value){settingsHistory.add(before.snapshot);past.push(before.snapshot);if(past.length>25)past.shift();future=[];historyButtons();}
        return;
      }
      if(before.serialized!==field.value){past.push(before.snapshot);if(past.length>25)past.shift();future=[];update();}}});
    panel.querySelector('[data-ml-selected]').addEventListener('change',event=>{selectObject(event.target.value);update();});
    async function applyLayout(shuffle=false,origin=null){
      const count=Number(panel.querySelector('[data-ml-count]').value);if(!Number.isInteger(count)||count<0||count>24){host.message('Choose 0 to 24 mirrors.',true);return;}
      const stamp=host.scope(),value=read(),layout=panel.querySelector('[data-ml="layout"]').value,seed=shuffle?(crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff):value.layout_seed;host.setBusy(true);
      const layoutOrigin=origin||value.layout_origin||[50,22];
      try{const result=await host.request('mirror-layout',{shape:value.shape,layout,count,seed,...(layout==='downward_v'?{origin:layoutOrigin}:{})});if(stamp!==host.scope())return;
        remember();state.layout=layout;state.layout_seed=seed;if(layout==='downward_v')state.layout_origin=layoutOrigin;state.objects=result.objects.map((o,i)=>({...o,image:value.objects[i]?.image||o.image,scene:value.objects[i]?.scene||'',prompt:value.objects[i]?.prompt||'',style:value.objects[i]?.style||'',theme:value.objects[i]?.theme||'normal',focus:value.objects[i]?.focus??null,...(value.objects[i]?.appearance?{appearance:{...value.objects[i].appearance}}:{})}));prune();store();
      }catch(error){host.message(error.message,true);}finally{host.setBusy(false);update();}
    }
    function status(title,message){jobScope=host.scope();job.hidden=false;job.querySelector('[data-ml-job-title]').textContent=title;job.querySelector('[data-ml-job-message]').textContent=message;}
    function applyMicroResults(op,result){
      if(op.detached||!op.individual||op.stamp!==host.scope())return;
      const incoming=Object.entries(result.scenes||{}).filter(([id])=>!op.received.has(id)&&op.targets.some(o=>o.id===id));
      if(!incoming.length)return;
      if(!op.remembered){remember();op.remembered=true;}
      for(const [id,scene] of incoming){const obj=read().objects.find(o=>o.id===id);if(obj){const key=id+'_'+op.seed;state.scenes[key]=scene;obj.scene=key;op.received.add(id);}}
      prune();store();
    }
    function finishGeneration(op){
      clearInterval(op.timer);
      if(operation!==op)return;
      operation=null;host.setBusy(false);job.querySelector('[data-ml-cancel]').hidden=true;
      const remaining=op.individual?op.targets.filter(o=>!op.received.has(o.id)).map(o=>o.id):[];
      retryBatch=remaining.length?{scope:op.stamp,ids:remaining}:null;
      retry.hidden=!retryBatch||retryBatch.scope!==host.scope();retry.textContent=`Retry unfinished mirrors (${remaining.length})`;update();
    }
    async function generate(one,unfinished=null){
      if(operation||host.busy()||!host.generatorReady()||!read().objects.length)return;
      flush();
      const config=clone(read()),stamp=host.scope(),seed=crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff;
      const individual=config.mode==='individual',perMirror=individual&&config.variation!=='shared',targets=unfinished?config.objects.filter(o=>unfinished.includes(o.id)):one?[object()]:config.objects;
      if(!targets.length)return;
      if(individual&&config.target==='focus'&&targets.some(o=>!o.focus)){host.message('Choose a Focus area for each micro scene being generated.',true);return;}
      const theme=perMirror?'normal':config.theme,prompt=perMirror?'':config.prompt;
      const needsPrompt=perMirror?targets.some(o=>o.theme==='custom'&&!o.prompt.trim()&&!o.style.trim()):theme==='custom'&&!prompt.trim();
      if(needsPrompt){host.message(perMirror?'Open the prompt button for each Custom micro scene and enter a prompt or style.':'Enter a prompt for the Custom theme.',true);return;}
      const op={controller:new AbortController(),url:null,stamp,seed,individual,targets,received:new Set(),completed:false,cancelling:false};operation=op;diagnosticsUrl=null;retry.hidden=true;retryBatch=null;host.setBusy(true);
      status('Preparing Mirror Layers',individual&&config.target==='focus'?'Preparing your selected focus areas from the edited artwork.':'Preparing the edited artwork and excluding detected frame and text.');
      const start=Date.now();job.querySelector('[data-ml-time]').textContent='0:00 elapsed';op.timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-start)/1000);job.querySelector('[data-ml-time]').textContent=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')} elapsed`;},1000);
      job.querySelector('[data-ml-cancel]').hidden=false;job.querySelector('[data-ml-cancel]').disabled=true;job.querySelector('[data-ml-diagnostics]').hidden=true;
      try{
        const payload={...host.generationInputs(),theme,custom_prompt:theme==='custom'?prompt:'',prompt_details:theme==='custom'?'':prompt,seed,maintain_style:config.maintain_style,outpaint_margin:individual?50:20};
        if(individual)payload.micro_scenes={variation:config.variation,target:config.target,objects:targets.map(({id,prompt,style,theme,focus})=>({...(perMirror?{id,prompt,style,theme:theme==='inherit'?'normal':theme}:{id,prompt:'',style:'',theme:'inherit'}),...(config.target==='focus'?{focus}:{})}))};
        const created=await host.request('mirror-generation',payload,op.controller.signal);op.url=host.url('mirror-generation/'+created.job);
        if(stamp!==host.scope()||operation!==op)return;
        job.querySelector('[data-ml-cancel]').disabled=false;
        for(;;){
          const poll=new URL(op.url,location.href);poll.searchParams.set('known_scenes',[...op.received].join(','));
          const response=await fetch(poll,{signal:op.controller.signal});const result=await response.json();
          if(!response.ok||!result.ok)throw new Error(result.message||'Could not check generation.');
          if(stamp!==host.scope()||operation!==op)return;
          applyMicroResults(op,result);
          status(individual?`Micro scenes · ${result.completed||0} of ${result.total||targets.length} complete`:'Mirror scene · '+(result.phase||'prepare'),result.message||'');
          job.querySelector('[data-ml-model]').textContent=result.model_label||'';
          [...job.querySelectorAll('li')].forEach((li,i)=>{li.classList.toggle('is-current',i===(result.state==='complete'?2:result.state==='queued'?0:1));li.classList.toggle('is-done',i<(result.state==='complete'?2:result.state==='queued'?0:1));});
          if(result.state==='failed')throw new Error(result.message);
          if(result.state==='cancelled')break;
          if(result.state==='complete'){
            op.completed=true;
            if(!individual){remember();const key='shared_'+seed;state.scenes[key]={image:result.scene,padding:result.scene_padding||[0,0],seed};state.shared_scene=key;prune();store();}
            if(result.diagnostics_available){const url=new URL(op.url,location.href);url.pathname+='/diagnostics';diagnosticsUrl=url.href;}
            job.querySelector('[data-ml-diagnostics]').hidden=!diagnosticsUrl;status('Mirror artwork ready · not saved',(result.target_message?result.target_message+' ':'')+'Review the mirrors, then save for this card.');break;
          }
          await new Promise(resolve=>setTimeout(resolve,1200));
        }
      }catch(error){if(error.name!=='AbortError'&&operation===op){op.error=error.message;host.message(error.message,true);}}
      finally{
        if(!op.cancelling){
          if(op.url&&!op.completed){try{const response=await fetch(op.url,{method:'DELETE'});if(response.ok)applyMicroResults(op,await response.json());}catch(_){} }
          if(operation===op&&!op.completed)status('Generation stopped · completed scenes kept',`${op.error||'Generation cancelled.'} ${op.received.size} scene(s) retained in this draft. Retry unfinished mirrors, or Save for this card.`);
          finishGeneration(op);
        }
      }
    }
    async function cancel(detach=false){
      const op=operation;if(!op)return;
      if(detach===true){op.detached=true;operation=null;host.setBusy(false);}
      if(op.cancelling)return;op.cancelling=true;op.controller.abort();clearInterval(op.timer);
      job.querySelector('[data-ml-cancel]').disabled=true;
      try{if(op.url){const response=await fetch(op.url,{method:'DELETE'});if(response.ok)applyMicroResults(op,await response.json());}}
      catch(_){}
      finally{if(!op.detached&&op.stamp===host.scope())status('Generation cancelled',`${op.received.size} completed scene(s) retained in this draft. Save for this card to keep them.`);finishGeneration(op);}
    }
    job.querySelector('[data-ml-cancel]').onclick=cancel;
    retry.onclick=()=>{if(retryBatch?.scope===host.scope())void generate(false,retryBatch.ids);};
    job.querySelector('[data-ml-diagnostics]').onclick=async()=>{
      const url=diagnosticsUrl,stamp=host.scope(),button=job.querySelector('[data-ml-diagnostics]');
      if(!url||host.busy()||stamp!==jobScope||button.disabled)return;
      button.disabled=true;
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'Could not export diagnostics. Generate a new scene if this render has expired.');}
        if(!(response.headers.get('content-type')||'').includes('application/zip'))throw new Error('The diagnostics download did not return a ZIP file. Please try again.');
        const blob=await response.blob();if(stamp!==host.scope()||url!==diagnosticsUrl)return;
        const href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;
        link.download='mirror-generation-diagnostics-'+new URL(url).pathname.split('/').at(-2)+'.zip';link.click();
        setTimeout(()=>URL.revokeObjectURL(href),1000);
        host.message('Mirror diagnostics exported, including each scene’s prompt, reference and output.');
      }catch(error){if(stamp===host.scope()&&url===diagnosticsUrl)host.message(error.message,true);}
      finally{button.disabled=false;}
    };
    panel.addEventListener('click',event=>{
      const shape=event.target.closest('[data-ml-shape]')?.dataset.mlShape;
      if(shape&&!host.busy()&&shape!==read().shape){
        remember();const old=state.shape;state.shape=shape;
        for(const [i,o] of state.objects.entries()){
          o.height=Math.max(1,Math.min(200,o.height*(shape==='oval'?1.4:1)/(old==='oval'?1.4:1)));
          if(shape==='sphere'){o.height=Math.min(200,o.width*756/1056);o.skew=0;o.rotation_x=0;o.rotation_y=0;}
          else if(old==='sphere'){o.rotation=[-19,26,-8,32,-28,12][i%6];o.rotation_x=[14,-19,8,-12,22,-6][i%6];o.rotation_y=[-28,12,-18,36,8,-31][i%6];o.skew=0;}
          o.home=objectTransform(o);
        }
        moving=true;host.moveTool();store();return;
      }
      const action=event.target.closest('[data-ml-action]')?.dataset.mlAction;if(!action||host.busy())return;
      if(action==='layout')applyLayout(true);
      if(action==='v-origin'){const enable=!placingV;moving=true;host.moveTool();placingV=enable;update();}
      if(action==='move'){moving=!(moving&&host.canMove());if(moving)host.moveTool();update();}
      if(action==='front'||action==='back'){
        const index=state.objects.indexOf(object()),next=Math.max(0,Math.min(state.objects.length-1,index+(action==='front'?1:-1)));
        if(index!==next){remember();const [item]=state.objects.splice(index,1);state.objects.splice(next,0,item);store();}
      }
      if(action==='copy')host.copyPath(read());
      if((action==='undo'&&past.length)||(action==='redo'&&future.length)){
        const from=action==='undo'?past:future,to=action==='undo'?future:past,next=from.pop(),settingsOnly=settingsHistory.has(next),previous=clone(read());
        if(settingsOnly)settingsHistory.add(previous);to.push(previous);state=next;store(!settingsOnly);if(settingsOnly)host.settingsChanged();
      }
      if(action==='generate')generate(false);if(action==='generate-one')generate(true);
      if(action==='view'){const key=read().mode==='individual'?object().scene:read().shared_scene;if(key)host.view(read().scenes[key].image);}
    });
    const pointer=event=>{const box=svg.getBoundingClientRect();return {x:(event.clientX-box.left)/box.width*100,y:(event.clientY-box.top)/box.height*100};};
    function showSelectedControls(){
      const section=panel.querySelector('[data-ml-object-controls]'),pane=section.closest('.studio-inspector-scroll')||section.closest('.spot-card-controls');
      if(!pane||section.hidden)return;
      for(let parent=section.parentElement;parent&&parent!==pane;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      const sticky=pane.matches('.spot-card-controls')?(pane.querySelector('.spot-card-layer-switch')?.offsetHeight||0):0;
      pane.scrollTo({top:pane.scrollTop+section.getBoundingClientRect().top-pane.getBoundingClientRect().top-14-sticky,behavior:'instant'});
    }
    svg.addEventListener('contextmenu',event=>{
      const id=event.target.dataset.object;if(!id||host.busy())return;
      event.preventDefault();event.stopPropagation();const bounds=event.target.getBoundingClientRect();
      openMenu(id,event.clientX||bounds.x+bounds.width/2,event.clientY||bounds.y+bounds.height/2);
    });
    svg.addEventListener('keydown',event=>{
      if(!(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)||!event.target.dataset.object)return;
      event.preventDefault();event.stopPropagation();const bounds=event.target.getBoundingClientRect();openMenu(event.target.dataset.object,bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    });
    svg.addEventListener('pointerdown',event=>{
      if(placingV&&!host.busy()&&event.button===0){event.preventDefault();event.stopPropagation();const p=pointer(event);placingV=false;applyLayout(false,[Math.max(0,Math.min(100,p.x)),Math.max(0,Math.min(100,p.y))]);return;}
      if(!moving||host.busy()||event.button!==0||!event.target.dataset.object)return;
      event.preventDefault();event.stopPropagation();selectObject(event.target.dataset.object);update();
      liveMask=host.surfaceMask();
      const o=object();drag={id:event.pointerId,start:pointer(event),x:o.x,y:o.y,width:o.width,height:o.height,size:o.size,resize:Boolean(event.target.dataset.resize),matrix:geometry(o),before:clone(read())};
      svg.setPointerCapture(event.pointerId);guides();
    });
    svg.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const p=pointer(event),o=object();
      if(drag.resize){
        const local=unproject(drag.matrix,p.x*7.56,p.y*10.56);if(!local)return;
        const factor=local[0]+local[1];
        o.size=Math.max(25,Math.min(300,drag.size*factor));
      }else{o.x=Math.max(-100,Math.min(200,drag.x+p.x-drag.start.x));o.y=Math.max(-100,Math.min(200,drag.y+p.y-drag.start.y));}
      moveGuides();
    });
    const end=event=>{
      if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();
      let changed=false;
      if(event.type==='pointercancel')state=drag.before;
      else{const o=object();for(const k of ['x','y','width','height','size']){o[k]=Math.round(o[k]*1000)/1000;changed||=Math.abs(o[k]-drag[k])>.001;}}
      if(changed){past.push(drag.before);if(past.length>25)past.shift();future=[];}
      drag=null;pendingPreview=changed;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);store(changed);
      if(event.type==='pointerup')showSelectedControls();
    };
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&(placingV||focusPicker)){event.preventDefault();event.stopPropagation();placingV=false;const id=focusPicker?.id;closeFocus();update();if(id)panel.querySelector(`[data-ml-scene-id="${id}"] [data-ml-focus]`)?.focus({preventScroll:true});}},true);
    dialog.addEventListener('close',()=>{closeMenu();closeFocus();focusArtwork=null;cancel(true);visualDrafts.clear();retryBatch=null;retry.hidden=true;moving=false;placingV=false;surfaceRequest?.abort();clearTimeout(surfaceTimer);guides();});
    return {update,cancel,flush,previewReady:()=>{pendingPreview=false;guides();},get moving(){return moving&&host.active()&&host.canMove();},defaults};
  }
  window.DeckadenceMirrorLayers={create,defaults,geometry};
})();
