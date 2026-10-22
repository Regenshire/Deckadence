// The Edit layer stores colored pixels and editable text separately from finish masks.
window.DeckadenceArtEditor = {
  create({dialog,stage,image,viewport,onChange,onBusy,onMessage}) {
    const panel=dialog.querySelector('[data-art-edit-panel]');
    const el=name=>panel.querySelector(`[data-art-${name}]`);
    const typography=window.DeckadenceArtText;
    const make=()=>document.createElement('canvas');
    const paint=make(),selection=make(),original=make(),surface=make(),stroke=make(),before=make();
    surface.dataset.artSurface='';surface.hidden=true;surface.setAttribute('aria-label','Artwork editing canvas');stage.append(surface);
    let active=false,enabled=false,dirty=false,disabled=true,working=false,texts=[],palette=[],selectedText=-1;
    let tool='paint',drag=null,selected=false,history=[],historyIndex=-1,pending=null,job=null,epoch=0,url='',originalURL='',previewURL='',publishVersion=0;
    const context=c=>c.getContext('2d',{willReadFrequently:true});
    const opacity=()=>Number(el('opacity').value)/100;
    const status=text=>{el('status').textContent=text;onMessage(text);};
    const blocked=()=>disabled||working||Boolean(pending);
    const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
    function overlay() {
      const out=make();out.width=paint.width;out.height=paint.height;const c=context(out);c.drawImage(paint,0,0);
      for(const t of texts)typography.render(c,t,out.width,out.height);
      return out;
    }
    function composed() {const out=make();out.width=paint.width;out.height=paint.height;const c=context(out);c.drawImage(original,0,0);if(enabled)c.drawImage(overlay(),0,0);return out;}
    function draw() {
      if(!active||!original.width)return;
      const c=context(surface);c.clearRect(0,0,surface.width,surface.height);c.drawImage(composed(),0,0);
      if(pending)c.drawImage(pending,0,0,surface.width,surface.height);
      if(selected&&el('show-selection').checked&&!pending) {
        const tint=make();tint.width=paint.width;tint.height=paint.height;const x=context(tint);x.drawImage(selection,0,0);
        x.globalCompositeOperation='source-in';x.fillStyle='#00C8FF';x.fillRect(0,0,tint.width,tint.height);
        c.save();c.globalAlpha=.3;c.drawImage(tint,0,0);c.restore();
      }
      const t=texts[selectedText];if(tool==='text'&&t&&!pending){c.save();c.strokeStyle='#00D8FF';c.lineWidth=paint.width/756;c.setLineDash([6,4]);c.strokeRect(t.x*paint.width,t.y*paint.height,t.width*paint.width,t.height*paint.height);c.restore();}
    }
    async function publish() {
      const version=++publishVersion,token=epoch;
      previewURL=enabled?composed().toDataURL():originalURL;
      image.src=previewURL;await image.decode().catch(()=>{});
      if(token===epoch&&version===publishVersion)onChange();
    }
    function controls() {
      for(const group of panel.querySelectorAll('[data-art-controls]'))group.disabled=blocked();
      el('undo').disabled=blocked()||historyIndex<=0;el('redo').disabled=blocked()||historyIndex>=history.length-1;
      el('clear').disabled=blocked()||!enabled;
      el('cancel').hidden=!job;el('accept').hidden=el('discard').hidden=!pending;
      el('selection-status').textContent=selected?'Selected areas limit painting, fill and AI edits.':'No selection · painting is unrestricted.';
      el('clear-selected').disabled=!selected||blocked();el('fill').disabled=el('recolor').disabled=!selected||blocked();
      el('generate').disabled=el('remove-text').disabled=!selected||blocked();
    }
    function setWorking(value){working=value;onBusy(value);controls();}
    function paletteControls() {
      el('palette').replaceChildren(...palette.map((color,index)=>{
        const input=document.createElement('input');input.type='color';input.value=color;input.setAttribute('aria-label',`Palette color ${index+1}`);
        input.addEventListener('click',()=>{el('color').value=input.value;});
        input.addEventListener('change',()=>{palette[index]=input.value;el('color').value=input.value;enabled=true;commit();});return input;
      }));
    }
    function textControls() {
      el('text-list').replaceChildren(new Option('New text','-1'),...texts.map((t,i)=>new Option(t.text.slice(0,45)||'Text',String(i))));
      if(selectedText>=texts.length)selectedText=-1;el('text-list').value=String(selectedText);
      const t=texts[selectedText];if(t)textFields(t);
      el('delete-text').disabled=selectedText<0||blocked();draw();
    }
    function textFields(t){for(const k of ['text','font','align'])el(k).value=t[k];el('text-preset').value=t.type||'custom';el('text-size').value=t.size;el('color').value=t.color;el('bold').checked=t.bold;el('italic').checked=t.italic;
      for(const k of ['x','y','width','height'])el('text-'+k).value=(t[k]*100).toFixed(1);el('text-leading').value=t.line_height;el('text-autofit').checked=t.autofit;}
    function preset(preserve=true){const value=el('text').value,t=typography.preset(el('text-preset').value);textFields({...t,text:preserve?(value||t.text):t.text});draw();}
    function snapshot(){return JSON.stringify({paint:paint.toDataURL(),selection:selection.toDataURL(),texts,palette,enabled,selected});}
    function commit() {
      dirty=true;const next=snapshot();history=history.slice(0,historyIndex+1);if(history.at(-1)!==next)history.push(next);
      if(history.length>20)history.shift();historyIndex=history.length-1;controls();draw();void publish();
    }
    async function undo(offset) {
      if(blocked()||historyIndex+offset<0||historyIndex+offset>=history.length)return;
      const token=epoch;setWorking(true);
      try {
        const value=JSON.parse(history[historyIndex+offset]),[p,s]=await Promise.all([load(value.paint),load(value.selection)]);
        if(token!==epoch)return;historyIndex+=offset;
        context(paint).clearRect(0,0,paint.width,paint.height);context(paint).drawImage(p,0,0);
        context(selection).clearRect(0,0,paint.width,paint.height);context(selection).drawImage(s,0,0);
        ({texts,palette,enabled,selected}=value);dirty=true;selectedText=-1;paletteControls();textControls();draw();await publish();
      } finally {if(token===epoch)setWorking(false);}
    }
    function selectTool(value){tool=value;for(const b of panel.querySelectorAll('[data-art-tool]'))b.setAttribute('aria-pressed',String(b.dataset.artTool===value));surface.style.cursor=value==='pan'?'grab':value==='text'?'text':'crosshair';}
    function selectMask(candidate,base=selection) {
      const old=context(base).getImageData(0,0,paint.width,paint.height),incoming=context(candidate).getImageData(0,0,paint.width,paint.height),mode=el('selection-mode').value;
      for(let i=0;i<old.data.length;i+=4){const a=old.data[i+3],b=incoming.data[i+3];old.data[i]=old.data[i+1]=old.data[i+2]=255;old.data[i+3]=mode==='add'?Math.max(a,b):mode==='subtract'?Math.max(0,a-b):b;}
      context(selection).putImageData(old,0,0);selected=old.data.some((v,i)=>i%4===3&&v>0);controls();draw();
    }
    function limit(source) {if(selected){const c=context(source);c.globalCompositeOperation='destination-in';c.drawImage(selection,0,0);c.globalCompositeOperation='source-over';}return source;}
    function solid(color=el('color').value){const c=make();c.width=paint.width;c.height=paint.height;const x=context(c);x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c;}
    function apply(source,erase=false) {const c=context(paint);c.save();c.globalCompositeOperation=erase?'destination-out':'source-over';c.globalAlpha=opacity();c.drawImage(source,0,0);c.restore();enabled=true;}
    function fill(mask=selection,recolor=false) {
      const layer=recolor?composed():solid();const c=context(layer);
      if(recolor){c.globalCompositeOperation='color';c.fillStyle=el('color').value;c.fillRect(0,0,layer.width,layer.height);}
      c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);c.globalCompositeOperation='source-over';apply(layer);commit();
    }
    function textValue(){const value={type:el('text-preset').value,text:el('text').value||'Text',font:el('font').value,size:Math.min(200,Math.max(6,Number(el('text-size').value)||32)),color:el('color').value,
      bold:el('bold').checked,italic:el('italic').checked,align:el('align').value,line_height:Math.min(3,Math.max(.8,Number(el('text-leading').value)||1.15)),autofit:el('text-autofit').checked};
      for(const k of ['x','y','width','height'])value[k]=Math.min(1,Math.max(k==='width'||k==='height'?.01:0,Number(el('text-'+k).value)/100||0));return value;}
    function putText(position) {
      if(selectedText<0&&texts.length>=50){status('Use at most 50 text items.');return;}
      const value=textValue();if(position){value.x=position.x/paint.width;value.y=position.y/paint.height;}
      if(selectedText<0){texts.push(value);selectedText=texts.length-1;}else texts[selectedText]=value;
      enabled=true;textControls();commit();
    }
    const point=e=>{const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(paint.width,(e.clientX-r.left)*paint.width/r.width)),y:Math.max(0,Math.min(paint.height,(e.clientY-r.top)*paint.height/r.height))};};
    function drawStroke(to,e) {
      const axis=e.shiftKey?'x':e.ctrlKey?'y':null;if(axis!==drag.axis){drag.axis=axis;drag.anchor={...drag.last};}
      if(axis==='x')to.y=drag.anchor.y;if(axis==='y')to.x=drag.anchor.x;
      const c=context(stroke);c.lineWidth=Number(el('size').value)*paint.width/756;c.lineCap='round';c.lineJoin='round';c.strokeStyle=el('color').value;
      c.beginPath();c.moveTo(drag.last.x,drag.last.y);c.lineTo(to.x+.001,to.y);c.stroke();drag.last=to;
      const layer=make();layer.width=paint.width;layer.height=paint.height;context(layer).drawImage(stroke,0,0);limit(layer);
      const target=context(paint);target.clearRect(0,0,paint.width,paint.height);target.drawImage(before,0,0);apply(layer,tool==='erase');draw();
    }
    surface.addEventListener('pointerdown',e=>{
      if(!active||blocked()||e.button!==0)return;e.preventDefault();viewport.focus({preventScroll:true});const p=point(e);
      if(tool==='pick'){el('color').value=window.DeckadenceSpotSelection.sampleColor(composed(),p.x,p.y,paint.width,paint.height);selectTool('paint');return;}
      if(tool==='text'){putText(p);return;}
      if(['wand','match','bucket'].includes(tool)) {
        const candidate=window.DeckadenceSpotSelection.colorSelection(composed(),p.x,p.y,Number(el('tolerance').value),tool!=='match',paint.width,paint.height);
        if(tool==='bucket'){limit(candidate);fill(candidate);}else{selectMask(candidate);commit();}return;
      }
      surface.setPointerCapture(e.pointerId);drag={id:e.pointerId,start:p,last:p,scrollX:viewport.scrollLeft,scrollY:viewport.scrollTop,clientX:e.clientX,clientY:e.clientY};
      const target=tool==='rectangle'||tool==='ellipse'?selection:paint;context(before).clearRect(0,0,paint.width,paint.height);context(before).drawImage(target,0,0);
      context(stroke).clearRect(0,0,paint.width,paint.height);setWorking(true);
      if(tool==='paint'||tool==='erase')drawStroke(p,e);
    });
    surface.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const p=point(e);
      if(tool==='pan'){viewport.scrollLeft=drag.scrollX-e.clientX+drag.clientX;viewport.scrollTop=drag.scrollY-e.clientY+drag.clientY;return;}
      if(tool==='rectangle'||tool==='ellipse') {
        if(e.shiftKey&&tool==='ellipse'){const size=Math.min(Math.abs(p.x-drag.start.x),Math.abs(p.y-drag.start.y));p.x=drag.start.x+Math.sign(p.x-drag.start.x)*size;p.y=drag.start.y+Math.sign(p.y-drag.start.y)*size;}
        const c=context(stroke),x=Math.min(p.x,drag.start.x),y=Math.min(p.y,drag.start.y),w=Math.abs(p.x-drag.start.x),h=Math.abs(p.y-drag.start.y);c.clearRect(0,0,stroke.width,stroke.height);c.fillStyle='white';c.beginPath();
        if(tool==='ellipse')c.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);else c.rect(x,y,w,h);c.fill();selectMask(stroke,before);
      } else drawStroke(p,e);
    });
    function end(e){if(!drag||drag.id!==e.pointerId)return;drag=null;setWorking(false);if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(tool!=='pan')commit();}
    for(const event of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(event,end);
    function bind(name,fn,unblocked=false){el(name).addEventListener('click',()=>{if(unblocked||!blocked())fn();});}
    for(const button of panel.querySelectorAll('[data-art-tool]'))button.addEventListener('click',()=>{if(!blocked())selectTool(button.dataset.artTool);});
    bind('undo',()=>undo(-1));bind('redo',()=>undo(1));bind('pick',()=>selectTool('pick'));
    bind('clear',()=>{context(paint).clearRect(0,0,paint.width,paint.height);texts=[];selectedText=-1;enabled=false;textControls();commit();});
    bind('select-all',()=>{context(selection).fillStyle='white';context(selection).fillRect(0,0,paint.width,paint.height);selected=true;commit();});
    bind('deselect',()=>{context(selection).clearRect(0,0,paint.width,paint.height);selected=false;commit();});
    bind('clear-selected',()=>{if(selected){const c=context(paint);c.save();c.globalCompositeOperation='destination-out';c.drawImage(selection,0,0);c.restore();commit();}});
    bind('fill',()=>{if(selected)fill();});bind('recolor',()=>{if(selected)fill(selection,true);});
    bind('add-color',()=>{if(palette.length<12&&!palette.includes(el('color').value)){palette.push(el('color').value);paletteControls();enabled=true;commit();}});
    bind('remove-color',()=>{palette=palette.filter(c=>c.toLowerCase()!==el('color').value.toLowerCase());paletteControls();enabled=true;commit();});
    bind('add-text',()=>{selectedText=-1;putText();selectTool('text');draw();status('Text block added. Adjust its controls or click the card to move it.');});
    bind('reset-text',()=>preset());el('text-preset').addEventListener('change',()=>{selectedText=-1;preset(false);textControls();});
    bind('update-text',()=>putText());bind('delete-text',()=>{if(selectedText>=0){texts.splice(selectedText,1);selectedText=-1;textControls();commit();}});
    el('text-list').addEventListener('change',()=>{selectedText=Number(el('text-list').value);textControls();selectTool('text');});
    el('show-selection').addEventListener('change',draw);
    let insertion={start:0,end:0};
    function closeSymbols(){el('symbol-picker').hidden=true;el('symbols').setAttribute('aria-expanded','false');}
    function symbolButtons(){const search=el('symbol-search').value.toLowerCase(),keys=[...new Set(['W','U','B','R','G','C','T','Q','X','S','E','ARTIST',...Object.keys(typography.symbols)])];el('symbol-grid').replaceChildren(...keys.map(key=>[key,typography.symbols[key]]).filter(([key,s])=>(key+' '+s[1]).toLowerCase().includes(search)).map(([key,s])=>{
      const b=document.createElement('button');b.type='button';b.title=`${s[1]} {${key}}`;b.setAttribute('aria-label',b.title);const icon=make();icon.width=icon.height=48;icon.setAttribute('aria-hidden','true');typography.symbol(context(icon),key,2,2,44,'#E8EDF2');b.append(icon);
      b.addEventListener('click',()=>{const input=el('text'),short=/^(\d+|[WUBGCTQSEP])$/.test(key),code=short?'o'+key.toLowerCase():`{${key}}`;
        const prefix=input.value.slice(0,insertion.start),suffix=input.value.slice(insertion.end);
        const value=(short&&/[A-Za-z]$/.test(prefix)&&!/(?:o[0-9wubrgctqsexp]+)$/i.test(prefix)?' ':'')+code+(short&&/^[A-Za-z]/.test(suffix)&&!/^o(?:[0-9wubrgctqsexp])/i.test(suffix)?' ':'');
        input.setRangeText(value,insertion.start,insertion.end,'end');const caret=input.selectionEnd;closeSymbols();input.focus();if(selectedText>=0)putText();input.setSelectionRange(caret,caret);input.dispatchEvent(new Event('input',{bubbles:true}));});return b;
    }));}
    function showSymbols(){if(blocked())return;insertion={start:el('text').selectionStart,end:el('text').selectionEnd};el('symbol-search').value='';symbolButtons();el('symbol-picker').hidden=false;el('symbols').setAttribute('aria-expanded','true');el('symbol-search').focus();}
    el('text').addEventListener('contextmenu',e=>{e.preventDefault();showSymbols();});bind('symbols',()=>el('symbol-picker').hidden?showSymbols():closeSymbols());bind('symbol-close',closeSymbols);
    el('symbol-search').addEventListener('input',symbolButtons);
    dialog.addEventListener('pointerdown',e=>{if(!e.target.closest('.art-symbol-anchor'))closeSymbols();});
    el('symbol-picker').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSymbols();el('text').focus();}});
    for(const name of ['text','font','text-size','text-x','text-y','text-width','text-height','text-leading','text-autofit','bold','italic','align'])el(name).addEventListener('change',()=>{if(selectedText>=0&&!blocked())putText();});
    el('color').addEventListener('change',()=>{if(tool==='text'&&selectedText>=0&&!blocked())putText();});
    async function request(path,method='GET',body) {const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'The artwork edit could not be completed.');return result;}
    async function generate(mode) {
      if(!selected){status('Select an area first.');return;}
      if(mode==='replace'&&!el('prompt').value.trim()){status('Enter an instruction first.');return;}
      const token=epoch,base=url,currentJob={path:null};job=currentJob;setWorking(true);controls();status('Generating selected artwork locally…');
      try {
        const created=await request(base,'POST',{image_data:composed().toDataURL(),mask_data:selection.toDataURL(),mode,prompt:el('prompt').value.trim(),seed:crypto.getRandomValues(new Uint32Array(1))[0]%2147483648});
        const endpoint=new URL(base,location.href);endpoint.pathname+='/'+created.job;const path=endpoint.href;
        if(token!==epoch||job!==currentJob){void request(path,'DELETE').catch(()=>{});return;}job.path=path;
        while(token===epoch&&job===currentJob) {
          const result=await request(path);if(token!==epoch||job!==currentJob)return;
          if(result.state==='complete'){const decoded=await load(result.image_data);if(token!==epoch||job!==currentJob)return;pending=decoded;status('Review the preview. Apply AI result to keep it, or discard it.');break;}
          if(result.state==='failed'||result.state==='cancelled')throw new Error(result.message||'AI edit cancelled.');
          await new Promise(resolve=>setTimeout(resolve,800));
        }
      } catch(error){if(token===epoch&&job===currentJob)status(error.message);}
      finally {if(token===epoch&&job===currentJob){job=null;setWorking(false);controls();draw();}}
    }
    async function cancel(){const current=job;job=null;if(current?.path)void request(current.path,'DELETE').catch(()=>{});setWorking(false);controls();status('AI edit cancelled. Artwork unchanged.');}
    bind('generate',()=>generate('replace'));bind('remove-text',()=>generate('remove_text'));bind('cancel',cancel,true);
    bind('accept',()=>{if(!pending)return;context(paint).drawImage(pending,0,0,paint.width,paint.height);pending=null;enabled=true;commit();status('AI result applied. Undo is available.');},true);
    bind('discard',()=>{pending=null;setWorking(false);draw();status('AI result discarded.');},true);
    dialog.addEventListener('keydown',e=>{
      if(!active||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||blocked())return;
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void undo(e.shiftKey?1:-1);}
      else if(e.key==='Escape'&&selected){e.preventDefault();el('deselect').click();}
      else if(e.key==='Delete'&&selected){e.preventDefault();el('clear-selected').click();}
    });
    return {
      get active(){return active;},get enabled(){return enabled;},get dirty(){return dirty;},get pending(){return Boolean(pending);},
      async load(record,source,width,endpoint){
        const token=++epoch;url=endpoint;originalURL=source.src;previewURL=originalURL;await typography.ready();if(token!==epoch)return;
        width=Math.max(width,record?.width||0);
        for(const c of [paint,selection,original,surface,stroke,before]){c.width=width;c.height=Math.round(width*1056/756);}
        context(original).drawImage(source,0,0,width,original.height);texts=structuredClone(record?.texts||[]);palette=[...(record?.palette||['#FFFFFF','#000000','#C62626','#E6B84A','#3277B3','#3E8B58'])];
        if(record?.paint_url){const decoded=await load(record.paint_url);if(token!==epoch)return;context(paint).drawImage(decoded,0,0,width,paint.height);}
        textFields(typography.preset('title'));
        enabled=Boolean(record);dirty=false;selected=false;pending=null;selectedText=-1;paletteControls();textControls();selectTool('paint');history=[snapshot()];historyIndex=0;
        if(record){previewURL=composed().toDataURL();image.src=previewURL;await image.decode();}controls();
      },
      setActive(value){active=value;closeSymbols();panel.hidden=!value;surface.hidden=!value;stage.dataset.artEditing=String(value);dialog.classList.toggle('is-art-editing',value);dialog.querySelector('[data-spot-edit-tab]').setAttribute('aria-pressed',String(value));if(value){image.src=previewURL;draw();}controls();},
      setDisabled(value){disabled=value;controls();},
      showOriginal(value){if(previewURL)image.src=value?originalURL:previewURL;},
      payload(){return enabled?{image_data:overlay().toDataURL(),paint_data:paint.toDataURL(),texts:structuredClone(texts),palette:[...palette]}:null;},
      release(){epoch++;publishVersion++;closeSymbols();if(job?.path)void request(job.path,'DELETE').catch(()=>{});job=null;pending=null;active=false;enabled=false;dirty=false;working=false;drag=null;history=[];panel.hidden=true;surface.hidden=true;dialog.classList.remove('is-art-editing');dialog.querySelector('[data-spot-edit-tab]').setAttribute('aria-pressed','false');stage.dataset.artEditing='false';previewURL=originalURL='';}
    };
  }
};
