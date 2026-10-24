// Automatic selection is an Edit tool; finish-layer masks are never modified.
window.DeckadenceArtAutoSelect = {
  create({dialog, editor, request, setBusy, message}) {
    const panel=dialog.querySelector('[data-art-edit-panel]');
    const tool=document.createElement('details');tool.className='studio-auto-select';
    tool.innerHTML='<summary>Auto-select</summary><fieldset data-art-controls disabled><div class="spot-card-fields-grid" data-auto-fields></div><label class="spot-card-range-label" data-auto-amount>Amount <output>35%</output><input data-auto="amount" type="range" min="1" max="100" value="35"></label><details><summary>Frame, text &amp; border</summary><div class="spot-card-fields-grid" data-auto-parts></div></details><details><summary>Refine edges</summary><div class="spot-card-fields-grid"><label>Expand / contract (px)<input data-auto="expand" type="number" min="-20" max="20" value="0"></label><label>Smooth (px)<input data-auto="smooth" type="number" min="0" max="12" value="0"></label></div></details><div class="spot-card-button-row"><button type="button" data-auto-run>Create selection</button><button type="button" data-auto-clear>Clear</button></div></fieldset>';
    panel.prepend(tool);
    const q=name=>tool.querySelector(`[data-auto="${name}"]`);
    function select(name,label,options,target='fields') {
      const field=document.createElement('label');field.append(document.createTextNode(label));
      const input=document.createElement('select');input.dataset.auto=name;
      for(const [value,text] of options)input.add(new Option(text,value));
      field.append(input);tool.querySelector(`[data-auto-${target}]`).append(field);return input;
    }
    function copied(name,label,original,target='fields') {
      return select(name,label,[...dialog.querySelector(`[name="${original}"]`).options].map(o=>[o.value,o.textContent]),target);
    }
    const mode=copied('mode','Select by','selection_mode');mode.querySelector('[value="none"]').remove();mode.value='shadows';
    if(!mode.querySelector('[value="text"]'))mode.add(new Option('Text · AI','text'));mode.add(new Option('Frame · AI','frame'));
    select('operation','Selection action',[['replace','Replace selection'],['add','Add to selection'],['subtract','Subtract from selection'],['intersect','Intersect selection']]);
    const region=copied('region','Within','selection_region');region.add(new Option('Current selection','selection'));
    copied('cleanup','Cleanup','cleanup');
    const treatments=[['original','Automatic'],['opaque','Exclude'],['foil','Include']];
    select('frame_mode','Frame',treatments,'parts');copied('frame_scope','Include','frame_scope','parts');
    copied('frame_layout','Frame layout','frame_layout','parts');
    select('text_mode','Text',treatments,'parts');copied('text_source','Text layout','text_source','parts');
    copied('text_detail','Text selection','text_detail','parts');copied('text_ink','Letter color','text_ink','parts');
    select('border_mode','Border',treatments,'parts');
    const border=document.createElement('label');border.textContent='Border width (%)';
    const borderInput=document.createElement('input');Object.assign(borderInput,{type:'number',min:'0',max:'12',step:'.5',value:'2'});borderInput.dataset.auto='border_width';border.append(borderInput);tool.querySelector('[data-auto-parts]').append(border);
    mode.addEventListener('change',()=>{tool.querySelector('[data-auto-amount]').hidden=['artwork','subject','background','text','frame'].includes(mode.value);});
    q('amount').addEventListener('input',()=>tool.querySelector('output').value=q('amount').value+'%');
    tool.querySelector('[data-auto-clear]').addEventListener('click',()=>dialog.querySelector('[data-art-deselect]').click());
    const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
    const decode=async url=>{const image=new Image();image.src=url;await image.decode();return image;};
    tool.querySelector('[data-auto-run]').addEventListener('click',async()=>{
      const snapshot=editor.selectionSnapshot();if(!snapshot)return;
      if([...tool.querySelectorAll('input')].some(input=>!input.reportValidity()))return;
      if(region.value==='selection'&&!snapshot.selected){message('Select an area first.',true);return;}
      const options=Object.fromEntries([...tool.querySelectorAll('[data-auto]')].map(e=>[e.dataset.auto,['amount','border_width','expand','smooth'].includes(e.dataset.auto)?Number(e.value):e.value]));
      options.action='foil';options.coverage=100;options.text_expand=0;options.text_smooth=0;options.text_regions=[];
      if(options.region==='selection')options.region='full';
      const withinSelection=region.value==='selection',kind=options.mode;
      const source=snapshot.source,w=source.width,h=source.height;
      const small=canvas(756,1056);small.getContext('2d').drawImage(source,0,0,756,1056);
      let result,error;
      setBusy(true);message('Creating selection…');
      try {
        const current=()=>editor.selectionCurrent(snapshot)&&dialog.open;
        if(kind==='text'||(options.text_mode!=='original'&&options.text_source==='detected')) {
          message('Detecting text…');
          const detected=await request('detect-text',{image:small.toDataURL('image/png').split(',')[1]});
          if(!current())return;options.text_regions=detected.regions;options.text_source='detected';
        }
        let frame=null,foreground=null;
        if(kind==='frame'||options.frame_mode!=='original'||(['subject','background'].includes(kind)&&options.region==='full')) {
          message('Detecting frame…');
          const frameSource=canvas(Math.min(1512,w),Math.round(Math.min(1512,w)*h/w));frameSource.getContext('2d').drawImage(source,0,0,frameSource.width,frameSource.height);
          const detected=await request('detect-frame',{image:frameSource.toDataURL('image/jpeg',.95).split(',')[1],layout:options.frame_layout});
          if(!current())return;
          frame={found:detected.found,material:await decode(detected.masks.material),panels:await decode(detected.masks.panels)};
          options.frame_mask=frame[options.frame_scope];
        }
        if(['subject','background'].includes(kind)) {
          message('Detecting subject…');
          const bounds=options.region==='artwork'?window.DeckadenceSpotSelection.artworkBounds(options):[0,0,1,1];
          const [l,t,r,b]=bounds,part=canvas(756,Math.round(756*h/w*(b-t)/(r-l)));
          part.getContext('2d').drawImage(source,l*w,t*h,(r-l)*w,(b-t)*h,0,0,part.width,part.height);
          const detected=await request('detect-subject',{image:part.toDataURL('image/jpeg',.95).split(',')[1]});if(!current())return;
          foreground=canvas(w,h);const context=foreground.getContext('2d');context.drawImage(await decode(detected.mask_data),l*w,t*h,(r-l)*w,(b-t)*h);
          if(frame?.found){context.globalCompositeOperation='destination-out';context.drawImage(frame.panels,0,0,w,h);context.globalCompositeOperation='source-over';}
        }
        if(!current())return;
        const engine=window.DeckadenceSpotSelection;
        if(kind==='text')result=engine.textRegions(source,options,w,h);
        else if(kind==='frame'){
          if(!frame?.found)throw new Error('No frame found.');
          result=canvas(w,h);result.getContext('2d').drawImage(frame[options.frame_scope],0,0,w,h);
        }else result=engine.generate(source,options,w,h,foreground);
        if(options.expand||options.smooth)result=engine.refineMask(result,options.expand*w/756,options.smooth*w/756,0);
        if(withinSelection){const context=result.getContext('2d');context.globalCompositeOperation='destination-in';context.drawImage(snapshot.selection,0,0);context.globalCompositeOperation='source-over';}
        if(options.region==='artwork'&&['text','frame'].includes(kind)){
          const clip=canvas(w,h),context=clip.getContext('2d');context.fillStyle='white';const [l,t,r,b]=window.DeckadenceSpotSelection.artworkBounds(options);context.fillRect(l*w,t*h,(r-l)*w,(b-t)*h);
          const out=result.getContext('2d');out.globalCompositeOperation='destination-in';out.drawImage(clip,0,0);out.globalCompositeOperation='source-over';
        }
      }catch(e){error=e;}
      finally{setBusy(false);}
      if(!editor.selectionCurrent(snapshot)||!dialog.open)return;
      if(error){message(error.message||'Could not create selection.',true);return;}
      if(result){editor.applyAutoSelection(result,options.operation);message('Selection ready.');}
    });
    return tool;
  }
};
