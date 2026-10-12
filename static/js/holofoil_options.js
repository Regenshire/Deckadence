(() => {
  const selections = new WeakMap();
  const bound = new WeakSet();
  // Match the plugin's foil-component detector; return full-card percentages.
  function detectFoilCenter(image) {
    const w=image.naturalWidth,h=image.naturalHeight;
    const left=Math.round(w*.44),top=Math.round(h*.895),right=Math.round(w*.56),bottom=Math.round(h*.965);
    const canvas=document.createElement('canvas');canvas.width=right-left;canvas.height=bottom-top;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const luma=new Uint8Array(canvas.width*canvas.height),hist=new Uint32Array(256);
    for(let i=0;i<luma.length;i++){luma[i]=Math.round(pixels[i*4]*.299+pixels[i*4+1]*.587+pixels[i*4+2]*.114);hist[luma[i]]++;}
    let sum=0,background=0;for(;background<255;background++){sum+=hist[background];if(sum>=luma.length*.25)break;}
    const threshold=Math.min(160,Math.max(30,background+20)),seen=new Uint8Array(luma.length);let best=null;
    for(let i=0;i<luma.length;i++){
      if(seen[i]||luma[i]<=threshold)continue;
      const pending=[i];seen[i]=1;let count=0,minX=canvas.width,minY=canvas.height,maxX=0,maxY=0,boundary=false;
      while(pending.length){const index=pending.pop(),x=index%canvas.width,y=Math.floor(index/canvas.width);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);boundary ||= x===0||y===0||x===canvas.width-1||y===canvas.height-1;
        for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(nx<0||ny<0||nx>=canvas.width||ny>=canvas.height)continue;const next=ny*canvas.width+nx;if(!seen[next]&&luma[next]>threshold){seen[next]=1;pending.push(next);}}
      }
      const bw=maxX-minX+1,bh=maxY-minY+1,cx=left+(minX+maxX+1)/2;
      if(!boundary&&count>=w*h*.0002&&bw>=w*.045&&bw<=w*.11&&bh>=h*.012&&bh<=h*.05&&Math.abs(cx-w/2)<w*.02&&(!best||count>best.count))best={count,x:cx/w*100,y:(top+(minY+maxY+1)/2)/h*100};
    }
    return best;
  }
  async function api(payload) {
    const response = await fetch('/config/upscaling/emblems', payload ? {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    } : {});
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Could not load emblem settings.');
    return data;
  }
  function attach(select, defaults = false, previewSource = null) {
    if (bound.has(select)) return;
    bound.add(select);
    const gear = document.createElement('button');
    gear.type = 'button'; gear.className = 'holofoil-gear';
    gear.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
    gear.title = defaults ? 'Default emblem options' : 'Emblem options';
    gear.setAttribute('aria-label', gear.title);
    const wrap = document.createElement('span');
    wrap.className = 'holofoil-select-wrap';
    select.before(wrap);
    wrap.append(select, gear);
    function refresh() {
      wrap.hidden = select.classList.contains('hidden');
      gear.hidden = !['deckadance', 'custom'].includes(select.value) || select.classList.contains('hidden');
      gear.disabled = select.disabled;
    }
    select.addEventListener('change', refresh);
    new MutationObserver(refresh).observe(select, {attributes: true, attributeFilter: ['class', 'disabled']});
    refresh();
    gear.onclick = () => open(select, defaults, previewSource).catch(error => window.alert(error.message));
  }
  async function open(select, defaultsMode, previewSource) {
    let data = await api();
    let values = {...data.defaults, ...(selections.get(select) || {})};
    const custom = select.value === 'custom';
    const dialog = document.createElement('dialog');
    dialog.className = 'holofoil-options-dialog';
    dialog.setAttribute('aria-labelledby', 'holofoilOptionsTitle');
    dialog.innerHTML = `<form method="dialog"><header><h2 id="holofoilOptionsTitle">Emblem options</h2><button value="cancel" aria-label="Close">×</button></header>
      <div class="holofoil-editor-layout"><aside class="holofoil-preview-panel" hidden><h3>Preview</h3><canvas class="holofoil-placement" width="720" height="400" aria-label="Emblem position preview; use the position sliders to adjust"></canvas><p class="preview-caption"></p><div class="holofoil-position-controls"></div><button type="button" name="resetPosition">Reset position</button></aside><div class="holofoil-settings-panel"><section class="foil-fields"><label>Foil color<select name="color"></select></label>
      <div class="web-color"><label>Web color<input name="hex" placeholder="#3A8DFF" maxlength="7"></label><input name="picker" type="color" aria-label="Pick foil color"></div></section>
      <section class="custom-fields"><h3 class="holofoil-section-label">Emblem source</h3><div class="holofoil-source-tabs"><button type="button" name="showSaved" aria-pressed="true">Saved emblems</button><button type="button" name="expandUpload" aria-pressed="false" aria-controls="holofoilUploadFields">Upload SVG</button></div><div class="holofoil-saved-fields"><label>Saved emblem<select name="emblem"></select></label><button type="button" name="delete">Delete selected emblem</button>
      </div><fieldset id="holofoilUploadFields" hidden><legend>Add custom emblem</legend><label>Name<input name="name" maxlength="80" placeholder="My emblem"></label><label>SVG file<input name="file" type="file" accept=".svg,image/svg+xml"></label><button type="button" name="upload">Upload and save</button><small>Vector SVG, up to 256 KB. Original colors are retained.</small></fieldset>
      <fieldset class="holofoil-center-mode"><legend>Center based on</legend><label><input type="radio" name="centerMode" value="card"> Card Center</label><label><input type="radio" name="centerMode" value="holofoil"> Holofoil Center</label></fieldset>
      <label>Horizontal position <output name="xLabel"></output><input name="x" type="range" min="-100" max="100" step="1"></label>
      <label>Vertical position <output name="yLabel"></output><input name="y" type="range" min="-100" max="100" step="1"></label>
      <small>Card Center uses X 50%, Y 95%; Holofoil Center uses the detected stamp. Sliders offset the selected center by up to two percentage points.</small></section>
      <section class="holofoil-defaults-section"><h3 class="holofoil-section-label">Defaults</h3><label class="save-defaults"><input name="defaults" type="checkbox"> Use these options by default</label><small>Applies to future upscales using this replacement.</small></section><p class="status" role="status"></p></div></div>
      <footer><button value="cancel">Cancel</button><button type="button" name="apply">Apply</button></footer></form>`;
    const form = dialog.querySelector('form'), e = form.elements, status = dialog.querySelector('.status');
    const setStatus = message => status.textContent = message;
    const uploadFields = dialog.querySelector('#holofoilUploadFields');
    function showUpload(upload) {
      uploadFields.hidden = !upload;
      dialog.querySelector('.holofoil-saved-fields').hidden = upload;
      e.expandUpload.setAttribute('aria-pressed', String(upload));
      e.showSaved.setAttribute('aria-pressed', String(!upload));
    }
    e.expandUpload.onclick = () => showUpload(true);
    e.showSaved.onclick = () => showUpload(false);
    const previewPanel = dialog.querySelector('.holofoil-preview-panel');
    previewPanel.hidden = false;
    {
      dialog.classList.add('has-placement-preview');
      const positionControls = dialog.querySelector('.holofoil-position-controls');
      positionControls.append(dialog.querySelector('.holofoil-center-mode'), e.x.closest('label'), e.y.closest('label'));
    }
    if (!custom) {
      const baselineHelp = document.createElement('small');
      baselineHelp.textContent = '0% / 0% in Card Center uses your D outline anchor: X 50.9%, Y 94.0%. Width 6.4%, tilt 16.5°. Sliders adjust up to ±2 percentage points from that baseline.';
      dialog.querySelector('.holofoil-position-controls').append(baselineHelp);
    }
    const canvas = dialog.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const caption = dialog.querySelector('.preview-caption');
    let cardImage = null, emblemImage = null, previewVersion = 0, detectedCenter = null;
    e.centerMode.value = values.center_mode || 'card';
    function origin() { return e.centerMode.value === 'holofoil' && detectedCenter ? detectedCenter : custom ? {x:50,y:95} : {x:50.9,y:94}; }
    dialog.querySelectorAll('[name=centerMode]').forEach(input=>input.onchange=()=>positionChanged());
    // Crop percentages remain in full-card coordinates so preview and processing agree.
    const crop = {x: .25, y: .85, width: .5, height: .15};
    function drawPreview() {
      const width = cardImage ? cardImage.naturalWidth : 672;
      const height = cardImage ? cardImage.naturalHeight : 936;
      canvas.height = Math.round(canvas.width * (height * crop.height) / (width * crop.width));
      const scale = canvas.width / (width * crop.width);
      ctx.fillStyle = '#171714';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(cardImage) ctx.drawImage(cardImage,width*crop.x,height*crop.y,width*crop.width,height*crop.height,0,0,canvas.width,canvas.height);
      else {
        ctx.fillStyle='#ddd8c6';ctx.fillRect(0,0,canvas.width,canvas.height*.48);
        ctx.strokeStyle='#777366';ctx.lineWidth=4;ctx.strokeRect(-3,-3,canvas.width+6,canvas.height*.48);
      }
      const centerX = (origin().x + Number(e.x.value || 0)*.02)/100;
      const centerY = (origin().y + Number(e.y.value || 0)*.02)/100;
      const x=(centerX-crop.x)*width*scale,y=(centerY-crop.y)*height*scale;
      if(emblemImage) {
        const size=width*.064*scale;
        ctx.save();ctx.translate(x,y);
        if(!custom)ctx.rotate(16.5*Math.PI/180);
        ctx.drawImage(emblemImage,-size/2,-size/2,size,size);
        ctx.restore();
      }
      ctx.strokeStyle='rgba(233,175,66,.8)';ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();ctx.setLineDash([]);
      caption.textContent = e.centerMode.value==='holofoil' && !detectedCenter ? (cardImage ? 'Holofoil center could not be detected in this preview. Choose Card Center or try another source.' : 'Sample frame only. Holofoil Center will use the detected stamp on each processed card.') : cardImage ? 'Card bottom — drag the emblem or use the sliders. Original foil remains visible in this positioning preview.' : 'Sample frame — drag the emblem or use the sliders. Open options from a card to preview its actual image.';
    }
    async function loadEmblemPreview() {
      const version=++previewVersion;emblemImage=null;drawPreview();
      if(custom && !e.emblem.value)return;
      if(!custom && e.color.value==='custom' && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(e.hex.value))return;
      const image=new Image();
      image.onload=()=>{if(version===previewVersion){emblemImage=image;drawPreview();}};
      image.onerror=()=>{if(version===previewVersion)setStatus('Could not load the emblem preview.');};
      image.src=custom ? '/config/upscaling/emblems/'+encodeURIComponent(e.emblem.value)+'/preview.png' : e.color.value==='custom' ? '/config/upscaling/deckadance-preview.png?color='+encodeURIComponent(e.hex.value) : '/static/img/Logos/deckadance-foil-'+e.color.value+'.svg';
    }
    if(previewSource) {
      const src=previewSource();
      if(src){const image=new Image();image.onload=()=>{cardImage=image;try{detectedCenter=detectFoilCenter(image);}catch{detectedCenter=null;}drawPreview();};image.onerror=()=>{cardImage=null;drawPreview();};image.src=src;}
    }
    function placeFromPointer(event) {
      const bounds=canvas.getBoundingClientRect();
      if(e.centerMode.value==='holofoil' && cardImage && !detectedCenter)return;
      const x=crop.x+(event.clientX-bounds.left)/bounds.width*crop.width;
      const y=crop.y+(event.clientY-bounds.top)/bounds.height*crop.height;
      e.x.value=Math.round(Math.max(-100,Math.min(100,(x*100-origin().x)/.02)));
      e.y.value=Math.round(Math.max(-100,Math.min(100,(y*100-origin().y)/.02)));
      positionChanged();
    }
    canvas.onpointerdown=event=>{event.preventDefault();canvas.setPointerCapture(event.pointerId);placeFromPointer(event);};
    canvas.onpointermove=event=>{if(canvas.hasPointerCapture(event.pointerId))placeFromPointer(event);};
    canvas.onpointerup=event=>{if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
    e.resetPosition.onclick=()=>{e.x.value=0;e.y.value=0;positionChanged();};

    dialog.querySelector('.foil-fields').hidden = custom;
    dialog.querySelector('.custom-fields').hidden = !custom;
    e.apply.textContent='Save emblem settings';
    if(custom) { dialog.querySelector('.save-defaults').lastChild.textContent=' Use this emblem by default'; }
    e.defaults.checked = defaultsMode; e.defaults.disabled = defaultsMode;
    data.colors.forEach(color => e.color.add(new Option(color === 'custom' ? 'Custom web color' : color[0].toUpperCase()+color.slice(1), color)));
    e.color.value = values.color; e.hex.value = values.custom_color; e.picker.value = values.custom_color;
    function colorChanged() { dialog.querySelector('.web-color').hidden = e.color.value !== 'custom'; }
    e.color.onchange = () => {colorChanged();loadEmblemPreview();}; colorChanged();
    e.picker.oninput = () => {e.hex.value = e.picker.value;loadEmblemPreview();};
    e.hex.oninput = () => {if (/^#[0-9a-f]{6}$/i.test(e.hex.value)) e.picker.value = e.hex.value;loadEmblemPreview();};
    function loadPosition() {
      const entry = data.emblems.find(item => item.id === e.emblem.value);
      const position = !custom ? data.deckadance_position : entry ? entry.position : {center_mode:'card',custom_x:0,custom_y:0};
      e.centerMode.value = position.center_mode;
      e.x.value = position.custom_x;
      e.y.value = position.custom_y;
      positionChanged();
    }
    function populate(id) {e.emblem.replaceChildren(new Option('Choose a saved emblem', ''));data.emblems.forEach(item => e.emblem.add(new Option(item.name,item.id)));e.emblem.value=id || '';e.delete.disabled=!e.emblem.value;loadPosition();loadEmblemPreview();}
    populate(values.custom_id);e.emblem.onchange=()=>{e.delete.disabled=!e.emblem.value;loadPosition();loadEmblemPreview();};
    loadPosition();
    function positionChanged(){for(const key of ['x','y'])e[key+'Label'].value=(Number(e[key].value)>0?'+':'')+e[key].value+'%';drawPreview();}
    e.x.oninput=positionChanged;e.y.oninput=positionChanged;positionChanged();
    e.upload.onclick=async()=>{e.upload.disabled=true;try{const file=e.file.files[0];if(!file)throw new Error('Choose an SVG file.');if(file.size>262144)throw new Error('SVG files must be 256 KB or smaller.');data=await api({action:'upload',name:e.name.value || file.name,svg:await file.text()});populate(data.emblems[data.emblems.length-1].id);uploadFields.hidden=true;e.expandUpload.setAttribute('aria-expanded','false');showUpload(false);setStatus('Emblem saved.');}catch(error){setStatus(error.message);}finally{e.upload.disabled=false;}};
    e.delete.onclick=async()=>{const item=data.emblems.find(item=>item.id===e.emblem.value);if(!item||!window.confirm('Delete saved emblem “'+item.name+'”?'))return;e.delete.disabled=true;try{data=await api({action:'delete',id:item.id});populate('');setStatus('Emblem deleted.');}catch(error){setStatus(error.message);e.delete.disabled=false;}};
    e.apply.onclick=async()=>{e.apply.disabled=true;try{
      if(custom&&!e.emblem.value)throw new Error('Choose or upload an emblem.');
      if(!custom&&e.color.value==='custom'&&!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(e.hex.value))throw new Error('Enter a web color as #RGB or #RRGGBB.');
      values={center_mode:e.centerMode.value,color:e.color.value,custom_color:e.hex.value,custom_id:e.emblem.value,custom_x:Number(e.x.value),custom_y:Number(e.y.value)};
      if(custom) await api({action:'position',id:e.emblem.value,options:values});
      else await api({action:'deckadance_position',options:values});
      if(e.defaults.checked)await api({action:'defaults',replacement:select.value,options:values});
      delete values.center_mode;delete values.custom_x;delete values.custom_y;
      selections.set(select,values);dialog.close();
    }catch(error){setStatus(error.message);}finally{e.apply.disabled=false;}};
    dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  }
  window.HolofoilOptions = {attach, value: select => selections.get(select) || null};
  document.addEventListener('DOMContentLoaded',()=>{const select=document.getElementById('upscalingHolofoilStampReplacement');if(select)attach(select,true);});
})();
