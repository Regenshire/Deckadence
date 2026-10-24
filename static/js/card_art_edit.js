// The Edit layer stores colored pixels and editable text separately from finish masks.
window.DeckadenceArtEditor = {
  create({dialog,stage,image,viewport,onChange,onBusy,onMessage,onTool,onView}) {
    const panel=dialog.querySelector('[data-art-edit-panel]');
    const el=name=>dialog.querySelector(`[data-art-${name}]`);
    const typography=window.DeckadenceArtText;
    const make=()=>document.createElement('canvas');
    const paint=make(),selection=make(),original=make(),surface=make(),stroke=make(),before=make(),selectionOutline=make(),guides=make();
    surface.dataset.artSurface='';surface.hidden=true;surface.setAttribute('aria-label','Artwork editing canvas');stage.append(surface);
    guides.dataset.artGuides='';guides.hidden=true;guides.setAttribute('aria-hidden','true');stage.append(guides);
    const brushCursor=document.createElement('span');brushCursor.className='art-brush-cursor';brushCursor.hidden=true;brushCursor.setAttribute('aria-hidden','true');stage.append(brushCursor);
    let cursorPoint=null,spacePrevious=null,spacePressed=false;
    let previewMode='art',editingView='art';
    let active=false,enabled=false,dirty=false,disabled=true,working=false,texts=[],palette=[],selectedText=-1;
    let tool='paint',drag=null,selected=false,history=[],historyIndex=-1,pending=null,job=null,epoch=0,url='',originalURL='',previewURL='',publishVersion=0;
    let task='paint',selectionTool='rectangle',paintTool='paint',aiMode='replace',compare='result',reviewCrop=true,reviewBase=null,reviewBounds=null;
    let jobState=null,clockTimer=null,textTimer=null,textDraftChanged=false,savedArtwork='';
    let diagnosticsPath='',exportingDiagnostics=false;
    let generationReady=false,generationModels=[];
    const canGenerate=mode=>generationReady&&generationModels.find(model=>model.id===el('model').value)?.operations.includes(mode);
    let draftFormat={text:'',bold:false,italic:false,styles:[]},textBeforeInput=null;
    const selectTools=new Set(['rectangle','ellipse','lasso','selection-brush','wand','match']);
    const hints={rectangle:'Drag a rectangular boundary.',ellipse:'Drag an oval boundary.',lasso:'Draw a freehand outline. Release to close it.','selection-brush':'Brush over an area to select it. This does not paint color.',wand:'Click a connected area of similar color.',match:'Click to select matching colors throughout the card.'};
    const textBox=document.createElement('div');textBox.className='art-text-box';textBox.hidden=true;textBox.dataset.artTextBox='';
    for(const handle of ['move','n','ne','e','se','s','sw','w','nw']){const button=document.createElement('button');button.type='button';button.dataset.artTextHandle=handle;button.setAttribute('aria-label',handle==='move'?'Move text box':'Resize text box '+({n:'top',ne:'top right',e:'right',se:'bottom right',s:'bottom',sw:'bottom left',w:'left',nw:'top left'}[handle]));if(handle==='move')button.textContent='⠿ Move text';textBox.append(button);}stage.append(textBox);
    const context=c=>c.getContext('2d',{willReadFrequently:true});
    const opacity=()=>Number(el('opacity').value)/100;
    const status=text=>{el('status').textContent=text;onMessage(text);};
    const blocked=()=>disabled||working||Boolean(pending);
    const originalView=()=>active&&previewMode==='original';
    const cannotEdit=()=>blocked()||originalView();
    const load=async src=>{const im=new Image();im.src=src;await im.decode();return im;};
    function overlay() {
      const out=make();out.width=paint.width;out.height=paint.height;const c=context(out);c.drawImage(paint,0,0);
      for(const t of texts)typography.render(c,t,out.width,out.height);
      return out;
    }
    function composed(includeText=true) {const out=make();out.width=paint.width;out.height=paint.height;const c=context(out);c.drawImage(original,0,0);if(enabled)c.drawImage(includeText?overlay():paint,0,0);return out;}
    function drawText(c){if(enabled)for(const t of texts)typography.render(c,t,paint.width,paint.height);}
    function draw(artworkChanged=true) {
      if(!active||!original.width)return;
      if(artworkChanged){const c=context(surface);c.clearRect(0,0,surface.width,surface.height);c.drawImage(previewMode==='original'?original:composed(!pending),0,0);
        if(pending){if(compare==='result')c.drawImage(pending,0,0,surface.width,surface.height);drawText(c);}}
      const g=context(guides);g.clearRect(0,0,guides.width,guides.height);
      if(selected&&el('show-selection').checked&&!pending&&previewMode!=='original') {
        if(task==='select'){g.save();g.globalAlpha=.12;g.drawImage(selection,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-in';g.fillStyle='#55DE85';g.fillRect(0,0,guides.width,guides.height);g.restore();}
        g.drawImage(selectionOutline,0,0,paint.width,paint.height);
      }
      syncTextBox();updateCursor();
    }
    function outlineSelection(){const w=selection.width,h=selection.height,data=context(selection).getImageData(0,0,w,h).data,out=context(selectionOutline).createImageData(w,h);selected=false;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(data[i+3]>0)selected=true;if(data[i+3]>127&&(x===0||x===w-1||y===0||y===h-1||data[i-1]<128||data[i+7]<128||data[i-w*4+3]<128||data[i+w*4+3]<128)){const v=((x+y)%16<8)?255:20;out.data[i]=out.data[i+1]=out.data[i+2]=v;out.data[i+3]=255;}}
      context(selectionOutline).putImageData(out,0,0);
    }
    function syncTextBox(){const t=texts[selectedText];textBox.hidden=!active||task!=='text'||!t||Boolean(pending)||Boolean(job)||previewMode==='original';el('text-fit').textContent='';if(!t)return;for(const [key,value] of Object.entries({left:t.x,top:t.y,width:t.width,height:t.height}))textBox.style[key]=(value*100)+'%';textBox.classList.toggle('is-near-top',t.y<.06);const fit=typography.measure(context(surface),t,paint.width,paint.height);textBox.classList.toggle('is-overflowing',fit.overflow);el('text-fit').classList.toggle('is-warning',fit.overflow);el('text-fit').textContent=fit.overflow?'Text extends beyond this box. Enlarge it, reduce the font size, or enable Shrink text to fit.':t.autofit&&fit.size<t.size*paint.width/756-.1?`Fits at ${(fit.size*756/paint.width).toFixed(1)} px · requested ${t.size} px.`:'Text fits its box.';}
    function drawReview(){if(!pending||!reviewBase)return;const c=el('review-canvas'),box=reviewCrop?reviewBounds:{x:0,y:0,width:paint.width,height:paint.height};c.width=box.width;c.height=box.height;const out=context(c);out.drawImage(reviewBase,box.x,box.y,box.width,box.height,0,0,box.width,box.height);if(compare==='result')out.drawImage(pending,box.x,box.y,box.width,box.height,0,0,box.width,box.height);out.save();out.translate(-box.x,-box.y);drawText(out);out.restore();el('review-label').textContent=compare==='result'?'AI preview · not applied':'Original · before this AI edit';el('review-fit').textContent=reviewCrop?'Fit card':'Inspect selection';for(const b of dialog.querySelectorAll('[data-art-compare]'))b.setAttribute('aria-pressed',String(b.dataset.artCompare===compare));}
    async function publish() {
      const version=++publishVersion,token=epoch;
      previewURL=enabled?composed().toDataURL():originalURL;
      image.src=previewMode==='original'?originalURL:previewURL;await image.decode().catch(()=>{});
      if(token===epoch&&version===publishVersion)onChange();
    }
    function controls() {
      for(const group of dialog.querySelectorAll('[data-art-controls]'))group.disabled=cannotEdit();
      el('original-notice').hidden=!originalView();
      el('resume-edit').disabled=el('original-pick').disabled=blocked();
      el('original-pick').setAttribute('aria-pressed',String(tool==='pick'));
      el('undo').disabled=cannotEdit()||historyIndex<=0;el('redo').disabled=cannotEdit()||historyIndex>=history.length-1;
      el('clear').disabled=blocked()||!enabled;
      el('cancel').hidden=!job;el('accept').hidden=el('discard').hidden=!pending;
      if(el('export-diagnostics')){el('export-diagnostics').hidden=!pending||!diagnosticsPath;el('export-diagnostics').disabled=exportingDiagnostics;el('export-diagnostics').textContent=exportingDiagnostics?'Exporting…':'Export diagnostics';}
      el('selection-status').textContent=selected?'Selected area · paint and AI stay inside.':task==='text'?'No selection · text boxes move independently.':'No selection · paint anywhere.';
      el('clear-selected').disabled=!selected||blocked();el('fill').disabled=el('recolor').disabled=!selected||blocked();
      el('remove-text').disabled=!selected||cannotEdit();el('generate').disabled=!selected||cannotEdit();el('remove-object').disabled=!selected||cannotEdit();el('extend-artwork').disabled=!selected||cannotEdit();el('deselect').disabled=!selected||cannotEdit();el('invert').disabled=!selected||blocked();
      el('prepare').disabled=!selected||cannotEdit();
      el('generate').disabled||=!canGenerate('replace');el('remove-object').disabled||=!canGenerate('remove_object');el('extend-artwork').disabled||=!canGenerate('outpaint');
      el('prepare').disabled||=!canGenerate(el('prepare-mode').value);
      el('model').disabled=cannotEdit()||!generationReady;
      el('soften').disabled=!selected||blocked()||Number(el('feather').value)===0;
      el('ai-selection-hint').hidden=selected;el('ai-setup').hidden=Boolean(job||pending);
      el('delete-text').disabled=selectedText<0||blocked();
      el('add-text').disabled=blocked()||!el('text').value.trim()||texts.length>=50;
      const colorSaved=palette.some(c=>c.toLowerCase()===el('color').value.toLowerCase());el('add-color').disabled=blocked()||palette.length>=12||colorSaved;el('remove-color').disabled=blocked()||!colorSaved;
      el('review').hidden=!active||!pending;dialog.classList.toggle('art-ai-reviewing',active&&Boolean(pending));
      el(aiMode==='remove_text'?'text-job-slot':'ai-job-slot').append(el('job'));
      el('job').hidden=!jobState;el('retry').hidden=!jobState||Boolean(job);el('retry').textContent=pending?'Discard & try again':'Review settings & retry';
      el('job-banner').hidden=!active||!jobState;
      el('job-summary').textContent=jobState?(jobState.title+(job?' · '+elapsed():'')):'';
      for(const b of dialog.querySelectorAll('[data-art-task]'))b.disabled=disabled&&!job||Boolean(drag);
      for(const b of dialog.querySelectorAll('[data-art-tool]'))b.disabled=cannotEdit();
      syncTextBox();updateCursor();
    }
    function setWorking(value){working=value;onBusy(value);controls();}
    function paletteControls() {
      el('palette').replaceChildren(...palette.map((color,index)=>{
        const button=document.createElement('button');button.type='button';button.className='art-color-swatch';button.style.setProperty('--art-swatch',color);button.setAttribute('aria-label',`Use saved color ${color}`);button.setAttribute('aria-pressed',String(color.toLowerCase()===el('color').value.toLowerCase()));
        button.addEventListener('click',()=>{if(!blocked())chooseColor(color);});return button;
      }));
      const add=document.createElement('button');add.type='button';add.className='art-save-color';add.textContent='+';add.setAttribute('aria-label','Save current color');add.disabled=palette.length>=12||palette.some(c=>c.toLowerCase()===el('color').value.toLowerCase());add.title=palette.length>=12?'Remove a saved color before adding another.':add.disabled?'This color is already saved.':'Save current color';add.addEventListener('click',()=>el('add-color').click());el('palette').append(add);
      el('color-value').textContent=el('color').value.toUpperCase();
    }
    function chooseColor(color){el('color').value=color;paletteControls();controls();}
    function textControls() {
      el('text-list').replaceChildren(new Option('New text block','-1'),...texts.map((t,i)=>new Option(t.text.slice(0,45)||'Text',String(i))));
      if(selectedText>=texts.length)selectedText=-1;el('text-list').value=String(selectedText);
      const t=texts[selectedText];if(t)textFields(t);
      el('delete-text').hidden=el('text-saved').hidden=selectedText<0;el('delete-text').disabled=selectedText<0||blocked();el('add-text').hidden=selectedText>=0;el('text-heading').textContent=selectedText<0?'Add card text':'Edit text';el('preset-row').hidden=selectedText>=0;draw();controls();
    }
    function textFields(t){
      draftFormat={text:t.text,bold:Boolean(t.bold),italic:Boolean(t.italic),styles:structuredClone(t.styles||[])};textBeforeInput=null;
      for(const k of ['text','font','align'])if(el(k).value!==t[k])el(k).value=t[k];
      el('text-preset').value=t.type||'custom';el('text-size').value=t.size;el('text-color').value=t.color;
      for(const k of ['x','y','width','height'])el('text-'+k).value=(t[k]*100).toFixed(1);el('text-leading').value=t.line_height;el('text-paragraph').value=t.paragraph_spacing??0;el('text-autofit').checked=t.autofit;syncTextFormatting();}
    function syncDraftText(){draftFormat=typography.editText(draftFormat,el('text').value,textBeforeInput);textBeforeInput=null;}
    function syncTextFormatting(){
      const input=el('text'),start=input.selectionStart,end=input.selectionEnd,styles=start===end?[]:typography.characterStyles(draftFormat).slice(start,end);
      for(const key of ['bold','italic']){
        const all=styles.length?styles.every(style=>style[key]):draftFormat[key];
        el(key).checked=all;el(key).indeterminate=styles.length>0&&!all&&styles.some(style=>style[key]);
      }
    }
    function preset(preserve=true){const value=el('text').value,t={...typography.preset(el('text-preset').value),autofit:false};textFields({...t,text:preserve?(value||t.text):t.text});draw();}
    function snapshot(){return JSON.stringify({paint:paint.toDataURL(),selection:selection.toDataURL(),texts,palette,enabled,selected,selectedText});}
    function artworkStamp(snapshot){const {selection,selected,selectedText,...artwork}=JSON.parse(snapshot);return JSON.stringify(artwork);}
    function rememberTextSelection(){if(historyIndex<0)return;const value=JSON.parse(history[historyIndex]);value.selectedText=selectedText;history[historyIndex]=JSON.stringify(value);}
    function commit() {
      const next=snapshot();dirty=artworkStamp(next)!==savedArtwork;history=history.slice(0,historyIndex+1);if(history.at(-1)!==next)history.push(next);
      if(history.length>20)history.shift();historyIndex=history.length-1;controls();draw();void publish();
    }
    async function undo(offset) {
      if(cannotEdit()||historyIndex+offset<0||historyIndex+offset>=history.length)return;
      const token=epoch;setWorking(true);
      try {
        const value=JSON.parse(history[historyIndex+offset]),[p,s]=await Promise.all([load(value.paint),load(value.selection)]);
        if(token!==epoch)return;historyIndex+=offset;
        context(paint).clearRect(0,0,paint.width,paint.height);context(paint).drawImage(p,0,0);
        context(selection).clearRect(0,0,paint.width,paint.height);context(selection).drawImage(s,0,0);
        ({texts,palette,enabled,selected,selectedText}=value);dirty=artworkStamp(history[historyIndex])!==savedArtwork;outlineSelection();paletteControls();textControls();draw();await publish();
      } finally {if(token===epoch)setWorking(false);}
    }
    function selectTool(value){
      if(selectTools.has(value))task='select';else if(['paint','erase','bucket','pick'].includes(value))task='paint';else if(value==='text')task='text';
      tool=value;
      if(selectTools.has(value))selectionTool=value;else if(['paint','erase','bucket'].includes(value))paintTool=value;
      for(const b of dialog.querySelectorAll('[data-art-tool]'))b.setAttribute('aria-pressed',String(b.dataset.artTool===value));
      el('pick').setAttribute('aria-pressed',String(value==='pick'));
      el('original-pick').setAttribute('aria-pressed',String(value==='pick'));
      surface.style.cursor=value==='pan'?'grab':value==='text'?'default':value==='pick'?'copy':'crosshair';
      el('tool-hint').textContent=hints[selectionTool];
      if(el('wand-contiguous'))el('wand-contiguous').closest('label').hidden=selectionTool!=='wand';
      el('selection-size-row').hidden=selectionTool!=='selection-brush';el('tolerance-row').hidden=!['wand','match'].includes(selectionTool);
      if(el('bucket-contiguous'))el('bucket-contiguous').closest('label').hidden=paintTool!=='bucket';
      el('paint-color-controls').hidden=paintTool==='erase';el('size-row').hidden=paintTool==='bucket';el('bucket-tolerance-row').hidden=paintTool!=='bucket';el('selection-color-actions').hidden=paintTool==='erase';
      el('paint-hint').textContent=value==='pick'?'Click the artwork to pick a color.':paintTool==='erase'?'Erase your paint to reveal the original artwork.':paintTool==='bucket'?'Click a connected area to fill it. The selection limits where color can go.':'Shift locks painting horizontally; Ctrl locks vertically.';
      draw();onTool?.();
    }
    function setTask(value){
      if(drag||textDrag)return;flushText();task=value;
      const group=dialog.querySelector(`[data-studio-edit-group="${value}"]`);if(group)group.open=true;
      selectTool(value==='select'?selectionTool:value==='paint'?paintTool:value==='text'?'text':'pan');controls();
    }
    const operationFor=e=>e.altKey?'subtract':e.shiftKey?'add':el('selection-mode').value;
    function selectMask(candidate,base=selection,mode=el('selection-mode').value) {
      if(mode==='replace'){const c=context(selection);c.save();c.globalCompositeOperation='copy';c.drawImage(candidate,0,0);c.restore();}
      else{const old=context(base).getImageData(0,0,paint.width,paint.height),incoming=context(candidate).getImageData(0,0,paint.width,paint.height);
        for(let i=0;i<old.data.length;i+=4){const a=old.data[i+3],b=incoming.data[i+3];old.data[i]=old.data[i+1]=old.data[i+2]=255;old.data[i+3]=mode==='add'?Math.max(a,b):mode==='intersect'?Math.min(a,b):Math.max(0,a-b);}
        context(selection).putImageData(old,0,0);}
      outlineSelection();controls();draw(false);
    }
    function limit(source) {if(selected){const c=context(source);c.globalCompositeOperation='destination-in';c.drawImage(selection,0,0);c.globalCompositeOperation='source-over';}return source;}
    function solid(color=el('color').value){const c=make();c.width=paint.width;c.height=paint.height;const x=context(c);x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c;}
    function apply(source,erase=false) {if(erase&&!enabled)return;const c=context(paint);c.save();c.globalCompositeOperation=erase?'destination-out':'source-over';c.globalAlpha=opacity();c.drawImage(source,0,0);c.restore();enabled=true;}
    function fill(mask=selection,recolor=false) {
      const layer=recolor?composed(false):solid();const c=context(layer);
      if(recolor){c.globalCompositeOperation='color';c.fillStyle=el('color').value;c.fillRect(0,0,layer.width,layer.height);}
      c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);c.globalCompositeOperation='source-over';apply(layer);commit();
    }
    function textValue(changedField=null){syncDraftText();const value={type:el('text-preset').value,text:el('text').value,font:el('font').value,size:Math.min(200,Math.max(6,Number(el('text-size').value)||32)),color:el('text-color').value,
      bold:draftFormat.bold,italic:draftFormat.italic,...(draftFormat.styles.length?{styles:structuredClone(draftFormat.styles)}:{}),align:el('align').value,line_height:Math.min(3,Math.max(.8,Number(el('text-leading').value)||1.15)),paragraph_spacing:Math.min(3,Math.max(0,Number(el('text-paragraph').value)||0)),autofit:el('text-autofit').checked};
      // The inspector rounds percentages for readability; unrelated edits must
      // retain the precise geometry created by dragging or keyboard nudges.
      for(const k of ['x','y','width','height'])value[k]=selectedText>=0&&changedField!=='all'&&changedField!=='text-'+k?texts[selectedText][k]:Math.min(1,Math.max(k==='width'||k==='height'?.01:0,Number(el('text-'+k).value)/100||0));return value;}
    function putText(resetGeometry=false) {
      if(selectedText<0&&texts.length>=50){status('Use at most 50 text items.');return;}
      rememberTextSelection();const value=textValue(resetGeometry?'all':null);
      if(selectedText<0){texts.push(value);selectedText=texts.length-1;}else texts[selectedText]=value;
      enabled=true;textControls();commit();
    }
    const point=e=>{const r=surface.getBoundingClientRect();return {x:Math.max(0,Math.min(paint.width,(e.clientX-r.left)*paint.width/r.width)),y:Math.max(0,Math.min(paint.height,(e.clientY-r.top)*paint.height/r.height))};};
    function updateCursor(){brushCursor.hidden=!active||!cursorPoint||previewMode==='original'||Boolean(job||pending)||!['paint','erase','selection-brush'].includes(tool);if(brushCursor.hidden)return;const p=drag&&!drag.pan&&drag.last?drag.last:cursorPoint,size=Number(el(tool==='selection-brush'?'selection-size':'size').value);Object.assign(brushCursor.style,{left:p.x/paint.width*100+'%',top:p.y/paint.height*100+'%',width:size/756*100+'%',height:size/756*paint.width/paint.height*100+'%'});}
    // Text is moved only through an explicit handle gesture. Canvas clicks select.
    let textDrag=null;
    function textGeometry(){const t=texts[selectedText];for(const k of ['x','y','width','height'])el('text-'+k).value=(t[k]*100).toFixed(1);draw();}
    function transformText(t,h,dx,dy){const next={...t};if(h==='move'){next.x=Math.max(0,Math.min(1-t.width,t.x+dx));next.y=Math.max(0,Math.min(1-t.height,t.y+dy));}else{if(h.includes('e'))next.width=Math.max(.01,Math.min(1-t.x,t.width+dx));if(h.includes('s'))next.height=Math.max(.01,Math.min(1-t.y,t.height+dy));if(h.includes('w')){next.x=Math.max(0,Math.min(t.x+t.width-.01,t.x+dx));next.width=t.width+t.x-next.x;}if(h.includes('n')){next.y=Math.max(0,Math.min(t.y+t.height-.01,t.y+dy));next.height=t.height+t.y-next.y;}}return next;}
    for(const handle of textBox.querySelectorAll('[data-art-text-handle]')){
      handle.addEventListener('pointerdown',e=>{if(blocked()||e.button!==0||selectedText<0)return;e.preventDefault();e.stopPropagation();handle.focus({preventScroll:true});flushText();rememberTextSelection();textDrag={id:e.pointerId,handle:handle.dataset.artTextHandle,x:e.clientX,y:e.clientY,original:{...texts[selectedText]}};handle.setPointerCapture(e.pointerId);setWorking(true);});
      handle.addEventListener('pointermove',e=>{if(!textDrag||textDrag.id!==e.pointerId)return;const r=surface.getBoundingClientRect(),dx=(e.clientX-textDrag.x)/r.width,dy=(e.clientY-textDrag.y)/r.height;
        texts[selectedText]=transformText(textDrag.original,textDrag.handle,dx,dy);textGeometry();
      });
      const finish=e=>{if(!textDrag||textDrag.id!==e.pointerId)return;const initial=textDrag.original;textDrag=null;if(e.type==='pointercancel')texts[selectedText]=initial;setWorking(false);textGeometry();if(e.type!=='pointercancel'&&JSON.stringify(initial)!==JSON.stringify(texts[selectedText]))commit();};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(event,finish);
      handle.addEventListener('keydown',e=>{if(blocked()||selectedText<0||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();rememberTextSelection();const unit=e.shiftKey?10:1,dx=(e.key==='ArrowLeft'?-unit:e.key==='ArrowRight'?unit:0)/paint.width,dy=(e.key==='ArrowUp'?-unit:e.key==='ArrowDown'?unit:0)/paint.height;texts[selectedText]=transformText(texts[selectedText],handle.dataset.artTextHandle,dx,dy);textGeometry();commit();});
    }
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
      if(previewMode==='original'&&!['pan','pick'].includes(tool)){status('Original is a comparison view. Choose Edit layer or Preview to continue editing.');return;}
      if(tool==='pick'){chooseColor(window.DeckadenceSpotSelection.sampleColor(previewMode==='original'?original:composed(),p.x,p.y,paint.width,paint.height));selectTool(paintTool);return;}
      if(tool==='text'){flushText();const x=p.x/paint.width,y=p.y/paint.height,index=texts.findLastIndex(t=>x>=t.x&&y>=t.y&&x<=t.x+t.width&&y<=t.y+t.height);if(index>=0){selectedText=index;textControls();}return;}
      if(['wand','match','bucket'].includes(tool)) {
        const candidate=window.DeckadenceSpotSelection.colorSelection(composed(),p.x,p.y,Number(el(tool==='bucket'?'bucket-tolerance':'tolerance').value),tool==='bucket'?(el('bucket-contiguous')?.checked??true):(tool==='wand'&&(el('wand-contiguous')?.checked??true)),paint.width,paint.height);
        if(tool==='bucket'){limit(candidate);fill(candidate);}else{selectMask(candidate,selection,operationFor(e));commit();}return;
      }
      surface.setPointerCapture(e.pointerId);drag={id:e.pointerId,pan:tool==='pan',enabledBefore:enabled,start:p,last:p,points:[p],operation:operationFor(e),scrollX:viewport.scrollLeft,scrollY:viewport.scrollTop,clientX:e.clientX,clientY:e.clientY};
      const target=selectTools.has(tool)?selection:paint;context(before).clearRect(0,0,paint.width,paint.height);context(before).drawImage(target,0,0);
      context(stroke).clearRect(0,0,paint.width,paint.height);setWorking(true);
      if(tool==='paint'||tool==='erase')drawStroke(p,e);
      if(tool==='selection-brush')selectionGesture(p,e);
    });
    function selectionGesture(p,e){const c=context(stroke);drag.operation=operationFor(e);c.fillStyle=c.strokeStyle='white';
      if(tool==='selection-brush'){c.lineWidth=Number(el('selection-size').value)*paint.width/756;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(drag.last.x,drag.last.y);c.lineTo(p.x+.001,p.y);c.stroke();drag.last=p;}
      else {c.clearRect(0,0,stroke.width,stroke.height);c.beginPath();if(tool==='lasso'){const last=drag.points.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)>.5)drag.points.push(p);c.moveTo(drag.start.x,drag.start.y);for(const v of drag.points)c.lineTo(v.x,v.y);c.closePath();}
        else{const x=Math.min(p.x,drag.start.x),y=Math.min(p.y,drag.start.y),w=Math.abs(p.x-drag.start.x),h=Math.abs(p.y-drag.start.y);if(tool==='ellipse')c.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);else c.rect(x,y,w,h);}c.fill();}
      selectMask(stroke,before,drag.operation);
    }
    surface.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const p=point(e);
      if(drag.pan){viewport.scrollLeft=drag.scrollX-e.clientX+drag.clientX;viewport.scrollTop=drag.scrollY-e.clientY+drag.clientY;return;}
      if(selectTools.has(tool))selectionGesture(p,e);else drawStroke(p,e);
    });
    function end(e){if(!drag||drag.id!==e.pointerId)return;const pan=drag.pan;if(e.type==='pointercancel'&&!pan){const target=selectTools.has(tool)?selection:paint;context(target).clearRect(0,0,target.width,target.height);context(target).drawImage(before,0,0);enabled=drag.enabledBefore;if(selectTools.has(tool))outlineSelection();}drag=null;setWorking(false);if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(!pan&&e.type!=='pointercancel')commit();restorePan();draw();}
    for(const event of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(event,end);
    surface.addEventListener('pointermove',e=>{cursorPoint=point(e);updateCursor();});surface.addEventListener('pointerleave',()=>{cursorPoint=null;updateCursor();});
    for(const key of ['size','selection-size'])el(key).addEventListener('input',updateCursor);
    function restorePan(){if(spacePrevious!==null&&!spacePressed&&!drag){const previous=spacePrevious;spacePrevious=null;selectTool(previous);}}
    window.addEventListener('keyup',e=>{if(e.code==='Space'){spacePressed=false;restorePan();}});
    window.addEventListener('blur',()=>{spacePressed=false;if(drag)end({pointerId:drag.id,type:'pointercancel'});restorePan();cursorPoint=null;updateCursor();});
    function bind(name,fn,unblocked=false){el(name).addEventListener('click',()=>{if(unblocked||!cannotEdit())fn();});}
    bind('resume-edit',()=>{if(!blocked())onView(editingView);},true);
    bind('original-pick',()=>{if(!blocked()){setTask('paint');selectTool('pick');controls();}},true);
    for(const button of dialog.querySelectorAll('[data-art-tool]'))button.addEventListener('click',()=>{if(!cannotEdit()){flushText();selectTool(button.dataset.artTool);}});
    panel.querySelector('[data-art-task-panel="text"]').addEventListener('focusin',e=>{
      if(cannotEdit()||e.target.closest('.studio-text-repair,[data-art-text-job-slot]'))return;
      if(task!=='text'){flushText();selectTool('text');}
    });
    for(const button of dialog.querySelectorAll('[data-art-task]')){button.addEventListener('click',()=>setTask(button.dataset.artTask));button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...dialog.querySelectorAll('[data-art-task]')],i=buttons.indexOf(button),next=buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length];next.focus();next.click();});}
    for(const button of dialog.querySelectorAll('[data-art-operation]'))button.addEventListener('click',()=>{el('selection-mode').value=button.dataset.artOperation;el('selection-mode').dispatchEvent(new Event('change'));});
    el('selection-mode').addEventListener('change',()=>{for(const b of dialog.querySelectorAll('[data-art-operation]'))b.setAttribute('aria-pressed',String(b.dataset.artOperation===el('selection-mode').value));});
    for(const key of ['size','opacity','selection-size','tolerance','bucket-tolerance','feather'])el(key).addEventListener('input',()=>{el(key+'-value').value=el(key).value+(key==='opacity'?'%':key.endsWith('tolerance')?'':' px');if(key==='feather')controls();});
    bind('undo',()=>undo(-1));bind('redo',()=>undo(1));bind('pick',()=>selectTool('pick'));
    bind('clear',()=>{rememberTextSelection();context(paint).clearRect(0,0,paint.width,paint.height);texts=[];selectedText=-1;enabled=false;textControls();commit();});
    bind('select-all',()=>{context(selection).fillStyle='white';context(selection).fillRect(0,0,paint.width,paint.height);outlineSelection();commit();});
    bind('deselect',()=>{context(selection).clearRect(0,0,paint.width,paint.height);outlineSelection();commit();});
    bind('invert',()=>{const data=context(selection).getImageData(0,0,paint.width,paint.height);for(let i=0;i<data.data.length;i+=4){data.data[i]=data.data[i+1]=data.data[i+2]=255;data.data[i+3]=255-data.data[i+3];}context(selection).putImageData(data,0,0);outlineSelection();commit();});
    bind('soften',()=>{if(!selected)return;const radius=Number(el('feather').value)*paint.width/756;if(!radius)return;const softened=make();softened.width=paint.width;softened.height=paint.height;const c=context(softened);c.filter=`blur(${radius}px)`;c.drawImage(selection,0,0);selectMask(softened,selection,'replace');commit();status('Selection edges softened. Paint and AI use the softened boundary. Undo restores the previous selection.');});
    bind('clear-selected',()=>{if(selected){const c=context(paint);c.save();c.globalCompositeOperation='destination-out';c.drawImage(selection,0,0);c.restore();commit();}});
    bind('fill',()=>{if(selected)fill();});bind('recolor',()=>{if(selected)fill(selection,true);});
    bind('add-color',()=>{if(palette.length<12&&!palette.some(c=>c.toLowerCase()===el('color').value.toLowerCase())){palette.push(el('color').value);paletteControls();enabled=true;commit();}});
    bind('remove-color',()=>{palette=palette.filter(c=>c.toLowerCase()!==el('color').value.toLowerCase());paletteControls();enabled=true;commit();});
    bind('manage-colors',()=>{el('palette-actions').hidden=!el('palette-actions').hidden;el('manage-colors').setAttribute('aria-expanded',String(!el('palette-actions').hidden));});
    bind('add-text',()=>{flushText();selectedText=-1;putText();selectTool('text');draw();status('Text added. Drag its Move text handle or resize an edge.');});
    bind('new-text',()=>{flushText();selectedText=-1;preset(false);textControls();el('text').focus();});
    bind('reset-text',()=>{preset();if(selectedText>=0)putText(true);});el('text-preset').addEventListener('change',()=>{flushText();selectedText=-1;preset(false);textControls();});
    bind('update-text',()=>putText());bind('delete-text',()=>{if(selectedText>=0){rememberTextSelection();texts.splice(selectedText,1);selectedText=-1;textControls();commit();}});
    el('text-list').addEventListener('change',()=>{const index=Number(el('text-list').value);flushText();selectedText=index;if(index<0)preset(false);textControls();selectTool('text');});
    el('show-selection').addEventListener('change',draw);
    let insertion={start:0,end:0};
    function closeSymbols(){el('symbol-picker').hidden=true;el('symbols').setAttribute('aria-expanded','false');}
    function symbolButtons(){const search=el('symbol-search').value.toLowerCase(),keys=[...new Set(['W','U','B','R','G','C','T','Q','X','S','E','ARTIST',...Object.keys(typography.symbols)])];el('symbol-grid').replaceChildren(...keys.map(key=>[key,typography.symbols[key]]).filter(([key,s])=>(key+' '+s[1]).toLowerCase().includes(search)).map(([key,s])=>{
      const b=document.createElement('button');b.type='button';b.title=`${s[1]} {${key}}`;b.setAttribute('aria-label',b.title);const icon=make();icon.width=icon.height=48;icon.setAttribute('aria-hidden','true');typography.symbol(context(icon),key,2,2,44,'#E8EDF2');b.append(icon);
      b.addEventListener('click',()=>{const input=el('text'),short=/^(\d+|[WUBGCTQSEP])$/.test(key),code=short?'o'+key.toLowerCase():`{${key}}`;
        const prefix=input.value.slice(0,insertion.start),suffix=input.value.slice(insertion.end);
        const value=(short&&/[A-Za-z]$/.test(prefix)&&!/(?:o[0-9wubrgctqsexp]+)$/i.test(prefix)?' ':'')+code+(short&&/^[A-Za-z]/.test(suffix)&&!/^o(?:[0-9wubrgctqsexp])/i.test(suffix)?' ':'');
        textBeforeInput={...insertion};input.setRangeText(value,insertion.start,insertion.end,'end');const caret=input.selectionEnd;closeSymbols();input.focus();if(selectedText>=0)putText();input.setSelectionRange(caret,caret);input.dispatchEvent(new Event('input',{bubbles:true}));});return b;
    }));}
    function showSymbols(){if(blocked())return;insertion={start:el('text').selectionStart,end:el('text').selectionEnd};el('symbol-search').value='';symbolButtons();el('symbol-picker').hidden=false;el('symbols').setAttribute('aria-expanded','true');el('symbol-search').focus();}
    el('text').addEventListener('contextmenu',e=>{e.preventDefault();showSymbols();});bind('symbols',()=>el('symbol-picker').hidden?showSymbols():closeSymbols());bind('symbol-close',closeSymbols);
    el('symbol-search').addEventListener('input',symbolButtons);
    dialog.addEventListener('pointerdown',e=>{if(!e.target.closest('.art-symbol-anchor'))closeSymbols();});
    el('symbol-picker').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeSymbols();el('text').focus();}});
    function flushText(){clearTimeout(textTimer);textTimer=null;if(textDraftChanged){textDraftChanged=false;commit();textControls();}}
    el('text').addEventListener('beforeinput',()=>{textBeforeInput={start:el('text').selectionStart,end:el('text').selectionEnd};});
    for(const event of ['select','keyup','pointerup','focus'])el('text').addEventListener(event,syncTextFormatting);
    for(const key of ['bold','italic'])el(key).addEventListener('change',()=>{
      if(cannotEdit())return;
      const input=el('text'),start=input.selectionStart,end=input.selectionEnd,value=el(key).checked;
      flushText();syncDraftText();draftFormat=typography.formatRange(draftFormat,start,end,key,value);
      if(selectedText>=0){rememberTextSelection();texts[selectedText]=textValue();enabled=true;commit();}else controls();
      input.focus({preventScroll:true});input.setSelectionRange(start,end);syncTextFormatting();
    });
    el('text').addEventListener('keydown',event=>{
      if(!(event.ctrlKey||event.metaKey)||event.altKey||!['b','i'].includes(event.key.toLowerCase())||cannotEdit())return;
      event.preventDefault();event.stopPropagation();syncTextFormatting();const control=el(event.key.toLowerCase()==='b'?'bold':'italic');control.checked=control.indeterminate||!control.checked;control.dispatchEvent(new Event('change',{bubbles:true}));
    });
    for(const name of ['text','font','text-color','text-size','text-x','text-y','text-width','text-height','text-leading','text-paragraph','text-autofit','align']){
      el(name).addEventListener('input',()=>{if(name==='text'){syncDraftText();syncTextFormatting();}if(selectedText<0){controls();return;}if(cannotEdit())return;rememberTextSelection();texts[selectedText]=textValue(name);enabled=true;dirty=true;textDraftChanged=true;clearTimeout(textTimer);textTimer=setTimeout(flushText,400);draw();});
      el(name).addEventListener('change',()=>{if(selectedText>=0&&!cannotEdit()){rememberTextSelection();texts[selectedText]=textValue(name);enabled=true;textDraftChanged=true;flushText();}});
    }
    for(const button of panel.querySelectorAll('[data-art-text-ink]'))button.addEventListener('click',()=>{if(blocked())return;el('text-color').value=button.dataset.artTextInk;el('text-color').dispatchEvent(new Event('input',{bubbles:true}));flushText();});
    el('color').addEventListener('input',()=>chooseColor(el('color').value));el('color').addEventListener('change',()=>chooseColor(el('color').value));
    async function request(path,method='GET',body) {const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),method==='POST'?90000:30000);try{const response=await fetch(path,{method,signal:controller.signal,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||'The artwork edit could not be completed.');return result;}catch(error){if(error.name==='AbortError')throw new Error('The app did not respond in time. Your artwork is unchanged. Try again.');throw error;}finally{clearTimeout(timer);}}
    function elapsed(){const seconds=Math.floor((Date.now()-(jobState?.started||Date.now()))/1000);return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' elapsed';}
    function updateJob(value){jobState={...jobState,...value};el('job-title').textContent=jobState.title;el('job-message').textContent=jobState.message;el('job-model').textContent=jobState.model||'';el('elapsed').textContent=elapsed();for(const [i,stage] of [...el('job-stages').children].entries()){stage.classList.toggle('is-done',i<jobState.step);stage.classList.toggle('is-current',i===jobState.step);if(i===jobState.step)stage.setAttribute('aria-current','step');else stage.removeAttribute('aria-current');}controls();}
    function stopClock(){clearInterval(clockTimer);clockTimer=null;}
    function cropSelection(){const data=context(selection).getImageData(0,0,paint.width,paint.height).data;let l=paint.width,t=paint.height,r=0,b=0;for(let y=0;y<paint.height;y++)for(let x=0;x<paint.width;x++)if(data[(y*paint.width+x)*4+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x+1);b=Math.max(b,y+1);}const padding=Math.max(12,Math.round(Math.max(r-l,b-t)*.08));l=Math.max(0,l-padding);t=Math.max(0,t-padding);r=Math.min(paint.width,r+padding);b=Math.min(paint.height,b+padding);return{x:l,y:t,width:r-l,height:b-t};}
    function serverStage(result){const titles={analyzing:'Analyzing artwork',planning:'Building generation plan',queued:'Waiting for local AI',preparing:'Preparing selected artwork',loading:'Loading local model',generating:'Generating artwork',rendering:'Preparing preview',detecting:aiMode==='remove_text'?'Detecting text strokes':'Detecting frame and text',repairing:'Repairing the background',blending:'Blending repaired edges'};updateJob({title:titles[result.stage]||'Generating artwork',message:result.message||'The model is working. Timing depends on your hardware.',step:aiMode==='remove_text'?(['rendering','blending'].includes(result.stage)?2:result.stage==='repairing'?1:0):({analyzing:1,planning:2,loading:3,generating:3,rendering:4}[result.stage]||0),model:result.model_label||jobState.model});}
    async function refreshModels() {
      const select=el('model'),token=epoch;
      try {
        const response=await fetch(select.dataset.modelsUrl,{cache:'no-store'}),state=await response.json();
        if(!response.ok||!state.ok)throw Error(state.message||'Could not load downloaded models.');
        if(token!==epoch)return;
        generationReady=Boolean(state.ready);generationModels=state.models.filter(m=>m.ready);
        const previous=select.value,models=generationModels,current=state.models.find(m=>m.id===state.active?.model);
        select.replaceChildren(...models.map(m=>new Option(m.name,m.id)));
        if(!models.length)select.add(new Option('No complete package enabled',''));
        if(models.some(m=>m.id===previous))select.value=previous;
        else if(current&&models.some(m=>m.id===current.id))select.value=current.id;
        el('analyzer-status').textContent=state.ready?'Artwork analyzer and planner dependencies ready.':'Complete packages include the artwork analyzer and required detection models.';
        el('model-status').textContent=state.ready?'Choose a model from your complete packages for this edit.':'Install and enable a complete package in Generative Art AI settings to generate artwork.';
        controls();
      } catch(error){if(token===epoch){generationReady=false;generationModels=[];controls();el('model-status').textContent=error.message;}}
    }
    el('model').addEventListener('focus',refreshModels);
    el('model').addEventListener('change',controls);el('prepare-mode').addEventListener('change',controls);
    window.addEventListener('focus',()=>{if(active&&!job)void refreshModels();});
    let lastPlan=null;
    function showPlan(result) {
      if(!result.plan||result.plan.id===lastPlan?.id)return;
      lastPlan=result.plan;el('plan').hidden=false;
      el('plan-images').replaceChildren(...(result.reference_previews||[]).map((src,i)=>{const image=document.createElement('img');image.src=src;image.alt=i?'Selection guide':'Model reference';image.style.cssText='max-width:100%;max-height:300px;object-fit:contain';return image;}));
      el('plan-style').value=lastPlan.style;el('plan-prompt').value=lastPlan.prompt;
      el('plan-notes').textContent=lastPlan.warnings.join(' ');
      el('plan-info').textContent=JSON.stringify({plan:lastPlan.id,model:lastPlan.model,model_revision:lastPlan.model_revision,pipeline:lastPlan.pipeline,conditioning:lastPlan.conditioning,analyzer:lastPlan.analyzer,adapter:lastPlan.adapter,dictionary_hash:lastPlan.dictionary_hash,recipe:lastPlan.recipe_revision,status:lastPlan.recipe_status,seed:lastPlan.seed,dimensions:lastPlan.dimensions,parameters:lastPlan.parameters,tokens:lastPlan.token_counts,runtime:lastPlan.runtime_versions,negative_prompt:lastPlan.negative_prompt,geometry:lastPlan.geometry,analysis:lastPlan.analysis,color_reference:lastPlan.color_reference,postprocessing:lastPlan.postprocessing},null,2);
    }
    el('style-mode').addEventListener('change',()=>{el('custom-style-row').hidden=el('style-mode').value!=='custom';});
    bind('use-style',()=>{if(!lastPlan)return;el('custom-style').value=lastPlan.style;el('style-mode').value='custom';el('style-mode').dispatchEvent(new Event('change'));});
    bind('repeat-seed',()=>{if(lastPlan)el('seed').value=lastPlan.seed;});
    bind('export-plan',()=>{if(!lastPlan)return;const href=URL.createObjectURL(new Blob([JSON.stringify(lastPlan,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=href;a.download='generation-plan-'+lastPlan.id.slice(0,12)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);},true);
    bind('prepare',()=>generate(el('prepare-mode').value,true));
    async function generate(mode=aiMode,prepareOnly=false) {
      if(!selected){status('Select an area first.');return;}
      if(mode!=='remove_text'&&!canGenerate(mode)){status('Enable a complete package that supports this operation in Studio settings.');return;}
      if(mode==='replace'&&!el('prompt').value.trim()){status('Enter an instruction first.');return;}
      el('plan').hidden=true;lastPlan=null;diagnosticsPath='';
      aiMode=mode;el('prepare-mode').value=mode==='remove_text'?'replace':mode;const labels=mode==='remove_text'?['Detect','Repair','Blend','Review']:['Prepare','Analyze','Plan','Generate','Preview','Review'];el('job-stages').replaceChildren(...labels.map(label=>{const li=document.createElement('li');li.textContent=label;return li;}));flushText();const token=epoch,base=url,currentJob={path:null};job=currentJob;setWorking(true);reviewBase=composed(false);reviewBounds=cropSelection();reviewCrop=true;compare='result';setTask(mode==='remove_text'?'text':'ai');
      updateJob({started:Date.now(),title:'Starting local AI',message:'Preparing the selected artwork and nearby context…',model:'Generative Art AI · on this PC',step:0});status(mode==='remove_text'?'Text repair started. Progress and Cancel are shown in Text.':'Generation started. Progress and Cancel are shown below.');stopClock();clockTimer=setInterval(()=>{if(job){el('elapsed').textContent=elapsed();el('job-summary').textContent=jobState.title+' · '+elapsed();}},1000);
      try {
        const created=await request(base,'POST',{image_data:reviewBase.toDataURL(),mask_data:selection.toDataURL(),mode,...(mode!=='remove_text'&&el('model').value?{model:el('model').value}:{}),...({source_bounds:window.DeckadenceSpotSelection.artworkBounds(Object.fromEntries(['width','height','x','y'].map(key=>['art_box_'+key,Number(dialog.querySelector('[name=art_box_'+key+']').value)])))}),prompt:el('prompt').value.trim(),style_mode:el('style-mode').value,custom_style:el('custom-style').value.trim(),prepare_only:prepareOnly,seed:el('seed').value===''?crypto.getRandomValues(new Uint32Array(1))[0]%2147483648:Number(el('seed').value)});
        const endpoint=new URL(base,location.href);endpoint.pathname+='/'+created.job;const path=endpoint.href;
        if(token!==epoch||job!==currentJob){void request(path,'DELETE').catch(()=>{});return;}job.path=path;
        while(token===epoch&&job===currentJob) {
          const result=await request(path);if(token!==epoch||job!==currentJob)return;
          showPlan(result);
          if(result.state==='prepared'){updateJob({title:'Reference and prompt ready',message:result.message,step:2});el('plan').open=true;break;}
          if(result.state==='complete'){updateJob({title:'Preparing preview',message:'Loading the generated artwork…',step:mode==='remove_text'?2:4});const decoded=await load(result.image_data);if(token!==epoch||job!==currentJob)return;pending=decoded;if(mode!=='remove_text'){const download=new URL(path);download.pathname+='/diagnostics';diagnosticsPath=download.href;}setTask(mode==='remove_text'?'text':'ai');updateJob({title:result.change_summary?.little_change?'Little visible change detected':'Preview ready · not applied',message:result.change_summary?.little_change?'This result closely matches the original. Compare both views before applying, or try a tighter selection and a clearer instruction.':'The selected area is enlarged on the canvas. Compare Original and AI result, then Apply or Discard.',step:mode==='remove_text'?3:5});drawReview();el('job').scrollIntoView({block:'nearest'});status('AI preview is ready. It has not been applied.');break;}
          if(result.state==='failed'||result.state==='cancelled')throw new Error(result.message||'AI edit cancelled.');
          serverStage(result);
          await new Promise(resolve=>setTimeout(resolve,800));
        }
      } catch(error){if(token===epoch&&job===currentJob){if(currentJob.path)void request(currentJob.path,'DELETE').catch(()=>{});updateJob({title:'Could not generate a preview',message:error.message,step:-1});status(error.message);}}
      finally {if(token===epoch&&job===currentJob){job=null;stopClock();setWorking(false);controls();draw();}}
    }
    async function cancel(){const current=job;job=null;stopClock();if(current?.path)void request(current.path,'DELETE').catch(()=>{});updateJob({title:'Generation cancelled',message:'Your artwork is unchanged.',step:-1});setWorking(false);controls();status('AI edit cancelled. Artwork unchanged.');}
    function leaveReview(){pending=null;reviewBase=null;jobState=null;diagnosticsPath='';setWorking(false);draw();controls();}
    if(el('export-diagnostics'))bind('export-diagnostics',async()=>{
      if(!pending||!diagnosticsPath||exportingDiagnostics)return;
      const path=diagnosticsPath,token=epoch;exportingDiagnostics=true;controls();
      try {
        const response=await fetch(path,{cache:'no-store'});
        if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.message||'Could not export this preview. Generate a new preview and try again.');}
        const blob=await response.blob();if(token!==epoch||path!==diagnosticsPath)return;
        const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;
        a.download='generation-diagnostics-'+new URL(path).pathname.split('/').at(-2)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
        status('Diagnostics exported. A local copy is saved in .dev_prompts/ai_work/generation-diagnostics/exports. The preview has not been applied.');
      } catch(error){if(token===epoch&&path===diagnosticsPath)status(error.message);}
      finally{exportingDiagnostics=false;controls();}
    },true);
    bind('remove-text',()=>generate('remove_text'));bind('generate',()=>generate('replace'));bind('remove-object',()=>generate('remove_object'));bind('extend-artwork',()=>generate('outpaint'));bind('cancel',cancel,true);
    bind('accept',()=>{if(!pending)return;context(paint).drawImage(pending,0,0,paint.width,paint.height);leaveReview();enabled=true;commit();status('AI result applied. Undo is available. Save the card to keep it.');},true);
    bind('discard',()=>{leaveReview();status('AI result discarded. Your artwork is unchanged.');},true);
    bind('retry',()=>{leaveReview();setTask(aiMode==='remove_text'?'text':'ai');el(aiMode==='remove_text'?'remove-text':'ai-setup').scrollIntoView({block:'nearest'});status('Review the selection and instruction, then generate another preview.');},true);
    bind('open-job',()=>{setTask(aiMode==='remove_text'?'text':'ai');el('job').scrollIntoView({block:'nearest'});},true);
    bind('review-fit',()=>{reviewCrop=!reviewCrop;drawReview();},true);
    for(const button of dialog.querySelectorAll('[data-art-compare]'))button.addEventListener('click',()=>{compare=button.dataset.artCompare;drawReview();draw();});
    for(const button of panel.querySelectorAll('[data-art-ai-mode]'))button.addEventListener('click',()=>{aiMode=button.dataset.artAiMode;for(const b of panel.querySelectorAll('[data-art-ai-mode]'))b.setAttribute('aria-pressed',String(b===button));el('prompt-row').hidden=aiMode!=='replace';});
    dialog.addEventListener('keydown',e=>{
      if(!active||e.key!=='Escape')return;
      // Escape never closes the Edit workspace, including from inputs or while
      // AI is running. Explicit close actions handle unsaved-change decisions.
      e.preventDefault();e.stopImmediatePropagation();
      if(!el('symbol-picker').hidden){closeSymbols();el('text').focus();return;}
      if(textDrag){texts[selectedText]=textDrag.original;textDrag=null;setWorking(false);textGeometry();return;}
      if(drag){end({pointerId:drag.id,type:'pointercancel'});return;}
      if(blocked()||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
      if(task==='text'&&selectedText>=0){flushText();selectedText=-1;textControls();}
      else if(selected)el('deselect').click();
    },true);
    dialog.addEventListener('keydown',e=>{
      if(!active||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||blocked())return;
      if(originalView()&&e.code!=='Space'){
        const key=e.key.toLowerCase(),plain=!e.ctrlKey&&!e.metaKey&&!e.altKey;
        if(plain&&key==='h'){e.preventDefault();selectTool('pan');}
        else if(plain&&key==='i'){e.preventDefault();el('original-pick').click();}
        else if((plain&&['b','e','g','m','o','l','w','t','delete','[',']'].includes(key))||((e.ctrlKey||e.metaKey)&&['z','y','a','d','i'].includes(key)))e.preventDefault();
        return;
      }
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();flushText();void undo(e.shiftKey?1:-1);}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();flushText();void undo(1);}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();el('deselect').click();}
      else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();el('select-all').click();}
      else if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='i'){e.preventDefault();el('invert').click();}
      else if(e.code==='Space'&&!/^(BUTTON|A)$/.test(e.target.tagName)){e.preventDefault();if(spacePrevious===null){spacePrevious=tool;spacePressed=true;selectTool('pan');}}
      else if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&['[',']'].includes(e.key)&&['paint','erase','selection-brush'].includes(tool)){e.preventDefault();const size=el(tool==='selection-brush'?'selection-size':'size');size.value=Math.max(2,Math.min(160,Number(size.value)+(e.key===']'?5:-5)));size.dispatchEvent(new Event('input'));}
      else if(e.key==='Escape'&&task==='text'&&selectedText>=0){e.preventDefault();e.stopPropagation();flushText();selectedText=-1;textControls();}
      else if(e.key==='Escape'&&selected){e.preventDefault();e.stopPropagation();el('deselect').click();}
      else if(e.key==='Delete'){e.preventDefault();if(task==='text'&&selectedText>=0)el('delete-text').click();else if(selected)el('clear-selected').click();}
      else if(!e.ctrlKey&&!e.metaKey&&!e.altKey){const shortcuts={b:['paint','paint'],e:['paint','erase'],g:['paint','bucket'],i:['paint','pick'],m:['select','rectangle'],o:['select','ellipse'],l:['select','lasso'],w:['select','wand'],t:['text','text'],h:[task,'pan']},shortcut=shortcuts[e.key.toLowerCase()];if(shortcut){e.preventDefault();setTask(shortcut[0]);selectTool(shortcut[1]);}}
    });
    for(const [value,key] of Object.entries({paint:'B',erase:'E',bucket:'G',rectangle:'M',ellipse:'O',lasso:'L',wand:'W'})){const button=dialog.querySelector(`[data-art-tool="${value}"]`);button.title=button.textContent.trim()+` (${key})`;}
    return {
      artworkSource(){return composed(false);},
      get active(){return active;},get enabled(){return enabled;},get dirty(){return dirty;},get pending(){return Boolean(pending);},get panning(){return tool==='pan';},pan(){if(!blocked())selectTool('pan');},
      selectionSnapshot(){
        if(!active||cannotEdit())return null;
        const copy=make();copy.width=selection.width;copy.height=selection.height;context(copy).drawImage(selection,0,0);
        return {epoch,source:composed(false),selection:copy,selected};
      },
      selectionCurrent(snapshot){return active&&snapshot.epoch===epoch;},
      applyAutoSelection(candidate,operation){
        if(!active||cannotEdit())return false;
        const sized=make();sized.width=paint.width;sized.height=paint.height;context(sized).drawImage(candidate,0,0,paint.width,paint.height);
        selectMask(sized,selection,operation);el('show-selection').checked=true;commit();draw(false);return true;
      },
      async load(record,source,width,endpoint){
        const token=++epoch;url=endpoint;originalURL=source.src;previewURL=originalURL;await typography.ready();if(token!==epoch)return;
        width=Math.max(width,record?.width||0);
        for(const c of [paint,selection,original,surface,stroke,before,selectionOutline,guides]){c.width=width;c.height=Math.round(width*1056/756);}
        context(original).drawImage(source,0,0,width,original.height);texts=structuredClone(record?.texts||[]);palette=[...(record?.palette||['#FFFFFF','#000000','#C62626','#E6B84A','#3277B3','#3E8B58'])];
        if(record?.paint_url){const decoded=await load(record.paint_url);if(token!==epoch)return;context(paint).drawImage(decoded,0,0,width,paint.height);}
        textFields({...typography.preset('title'),autofit:false});
        enabled=Boolean(record);dirty=false;selected=false;pending=null;jobState=null;lastPlan=null;diagnosticsPath="";generationReady=false;generationModels=[];el('plan').hidden=true;el('custom-style').value='';el('seed').value='';el('style-mode').value='match';el('custom-style-row').hidden=true;selectedText=-1;textDraftChanged=false;selectionTool='rectangle';paintTool='paint';paletteControls();textControls();setTask('paint');history=[snapshot()];historyIndex=0;savedArtwork=artworkStamp(history[0]);
        if(record){previewURL=composed().toDataURL();image.src=previewURL;await image.decode();}controls();
      },
      setActive(value){flushText();active=value;closeSymbols();panel.hidden=!value;el('header').hidden=!value;el('preview-tools').hidden=!value;surface.hidden=guides.hidden=!value;stage.dataset.artEditing=String(value);dialog.classList.toggle('is-art-editing',value);dialog.querySelector('[data-spot-edit-tab]').setAttribute('aria-pressed',String(value));if(value){image.src=previewURL;draw();void refreshModels();}else{textBox.hidden=true;}controls();},
      setDisabled(value){disabled=value;controls();},
      setView(value){if(previewMode!==value)flushText();previewMode=value;if(active&&value!=='original')editingView=value;if(value==='original')closeSymbols();if(previewURL)image.src=value==='original'?originalURL:previewURL;controls();draw();},
      payload(){flushText();return enabled?{image_data:overlay().toDataURL(),paint_data:paint.toDataURL(),texts:structuredClone(texts),palette:[...palette]}:null;},
      release(){
        epoch++;publishVersion++;stopClock();clearTimeout(textTimer);textTimer=null;textDraftChanged=false;closeSymbols();
        if(job?.path)void request(job.path,'DELETE').catch(()=>{});
        job=null;pending=null;jobState=null;active=false;enabled=false;dirty=false;working=false;drag=null;textDrag=null;history=[];
        spacePrevious=null;spacePressed=false;cursorPoint=null;brushCursor.hidden=true;
        panel.hidden=true;surface.hidden=guides.hidden=true;el('header').hidden=true;el('preview-tools').hidden=true;el('review').hidden=true;textBox.hidden=true;
        dialog.classList.remove('is-art-editing','art-ai-reviewing');dialog.querySelector('[data-spot-edit-tab]').setAttribute('aria-pressed','false');stage.dataset.artEditing='false';previewMode=editingView='art';previewURL=originalURL='';
      }
    };
  }
};
