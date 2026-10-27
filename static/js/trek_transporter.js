// Independent transporter beams and emblem placement in the finishing editor.
(() => {
  'use strict';
  const beamDefault=()=>({id:'beam1',x:50,y:41,width:100,height:82,size:100,rotation:0,strength:100,color:'#FFFFFF',density:100,style:'multicolor',cascade:35,base_rounding:0});
  const defaults=()=>({version:1,beams:[beamDefault()],emblem:{x:50,y:82,size:100,rotation:0,strength:100,color:'#FFFFFF',color_mode:'single'}});
  const clone=value=>JSON.parse(JSON.stringify(value));
  const clamp=(v,a,b)=>Math.round(Math.max(a,Math.min(b,v))*1000)/1000;
  function fromRecord(record){
    if(record?.transporter_layout){const value=clone(record.transporter_layout);value.beams=value.beams.map(item=>({...beamDefault(),...item}));return value;}
    const value=defaults();
    if(record?.finish!=='federation_transporter')return value;
    value.emblem.color_mode='multi';
    const scale=(record.scale??100)/100,rotation=record.rotation??0,angle=rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    for(const item of [...value.beams,value.emblem]){
      const dx=(item.x-50)*7.56*scale,dy=(item.y-50)*10.56*scale;
      item.x=clamp(50+(dx*c-dy*s)/7.56+(record.position_x??0),-100,200);
      item.y=clamp(50+(dx*s+dy*c)/10.56+(record.position_y??0),-100,200);
      item.size=clamp(scale*100,10,500);item.rotation=rotation;
      item.strength=(record.strength??100)*(1-(record.transparency??0)/100);item.color=record.color||'#FFFFFF';
    }
    value.beams[0].style=record.transporter_style==='none'?'multicolor':record.transporter_style||'multicolor';
    value.beams[0].density=record.density??100;
    if(record.transporter_style==='none')value.beams=[];
    return value;
  }
  function create(host){
    const {dialog,stage}=host,panel=dialog.querySelector('[data-spot-transporter-controls]');
    const field=document.createElement('input');field.type='hidden';field.name='effect_transporter_layout';field.value=JSON.stringify(defaults());panel.prepend(field);
    const ranges=(group,keys)=>keys.map(([key,label,min,max,unit])=>`<label class="spot-card-range-label"><span>${label}</span><output data-trek-value="${group}.${key}" data-unit="${unit}"></output><input type="range" data-trek="${group}.${key}" aria-label="${group==='beam'?'Beam':'Emblem'} ${label.toLowerCase()}" min="${min}" max="${max}" step="${unit===' mm'?'any':'0.1'}"></label>`).join('');
    const transforms=[['size','Size',10,500,'%'],['rotation','Rotation',-180,180,'°'],['x','Horizontal position',-100,200,'%'],['y','Vertical position',-100,200,'%']];
    const appearance=group=>`<label class="spot-card-color-picker">${group==='beam'?'Beam tint':'Emblem color'}<input type="color" data-trek="${group}.color" aria-label="${group==='beam'?'Beam tint color':'Emblem color'}"><output data-trek-color="${group}"></output></label>`;
    const beams=document.createElement('section');beams.className='spot-finish-group';beams.innerHTML=`<h3>Transporter beams</h3>
      <div class="spot-finish-pair"><label>Number of beams<select data-trek-count>${Array.from({length:9},(_,i)=>`<option value="${i}">${i?i+' '+(i===1?'beam':'beams'):'Emblem only'}</option>`).join('')}</select></label><button type="button" data-trek-move>Hand · Move beams</button></div>
      <p class="spot-card-caption">Choose a count to divide the light across the card. Drag each beam around a figure; drag its corner to resize. A mask can limit where the light appears.</p>
      <div class="spot-card-button-row"><button type="button" data-trek-undo>Undo placement edit</button><button type="button" data-trek-redo>Redo</button></div>
      <section data-trek-beam-controls><div class="spot-finish-group-heading mirror-selected-heading"><h3>Selected beam</h3><select data-trek-selected aria-label="Selected beam"></select></div>
      <div class="spot-card-button-row"><button type="button" data-trek-back>Send backward</button><button type="button" data-trek-front>Bring forward</button></div>
      <label>Transporter style<select data-trek="beam.style"><option value="multicolor">Multi-color Transporter Effect</option><option value="tos">TOS Transporter Effect</option><option value="tng">TNG Transporter Effect</option></select></label>
      <div class="spot-finish-pair">${ranges('beam',transforms)}${ranges('beam',[['width','Width',.63,126,' mm'],['height','Height',.88,176,' mm'],['strength','Effect strength',0,100,'%'],['density','Density',1,200,'%'],['cascade','Cascade',0,100,'%'],['base_rounding','Base Rounding',0,100,'%']])}${appearance('beam')}</div>
      <p class="spot-card-caption">Cascade staggers the top of the beam: 0% is level, 100% has the deepest steps. Base Rounding changes the bottom from flat to a rounded arc.</p>
      <p class="spot-card-caption">These controls affect only the selected beam. Width and height are on a 63 × 88 mm card; Size scales both. White tint preserves the transporter colors.</p></section>`;
    const emblemSection=document.createElement('section');emblemSection.className='spot-finish-group';emblemSection.dataset.trekEmblemControls='';
    const title=panel.querySelector('h3'),picker=panel.querySelector('.spot-transporter-emblems'),choice=panel.querySelector('[name="effect_transporter_emblem"]');
    title.textContent='Emblem';emblemSection.append(title,choice,picker);
    emblemSection.insertAdjacentHTML('beforeend',`<label>Emblem colors<select data-trek="emblem.color_mode"><option value="single">Single color</option><option value="multi">Multi-color · flat artwork</option></select></label><div class="spot-finish-pair">${ranges('emblem',transforms)}${ranges('emblem',[['strength','Effect strength',0,100,'%']])}${appearance('emblem')}</div><p class="spot-card-caption">Single color keeps the emblem’s cutout details. Position, size, rotation and strength are independent of the beams.</p>`);
    panel.append(beams,emblemSection);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 756 1056');svg.setAttribute('aria-label','Place transporter beams and emblem');svg.classList.add('trek-object-guides');stage.append(svg);
    let state=null,serialized='',scope='',selected='beam1',drag=null,pending=null,history=[],future=[];
    const selectedBeam=()=>state.beams.find(item=>item.id===selected)||state.beams[0];
    function read(){
      const nextScope=host.scope();
      if(scope!==nextScope){scope=nextScope;history=[];future=[];selected='beam1';drag=null;pending=null;serialized='';}
      if(!state||serialized!==field.value){state=JSON.parse(field.value||JSON.stringify(defaults()));serialized=field.value;}
      return state;
    }
    function write(){field.value=serialized=JSON.stringify(state);}
    function record(before){if(JSON.stringify(before)===JSON.stringify(state))return false;history.push(before);if(history.length>30)history.shift();future=[];return true;}
    function commit(){if(!pending)return;const before=pending;pending=null;write();if(record(before))host.changed();update();}
    function change(fn){commit();read();const before=clone(state);fn();write();if(record(before))host.changed();update();}
    const component=group=>group==='beam'?selectedBeam():state.emblem;
    function controls(){
      const beam=selectedBeam();panel.querySelector('[data-trek-count]').value=state.beams.length;
      const select=panel.querySelector('[data-trek-selected]');
      const options=state.beams.map((item,i)=>`${item.id}:${i}`).join('|');
      if(select.dataset.options!==options){select.replaceChildren(...state.beams.map((item,i)=>new Option('Beam '+(i+1),item.id)));select.dataset.options=options;}
      select.value=beam?.id||'';panel.querySelector('[data-trek-beam-controls]').hidden=!beam;
      for(const input of panel.querySelectorAll('[data-trek]')){
        const [group,key]=input.dataset.trek.split('.'),item=component(group);if(!item)continue;
        const value=key==='width'?item[key]*.63:key==='height'?item[key]*.88:item[key];input.value=value;
        const output=panel.querySelector(`[data-trek-value="${input.dataset.trek}"]`);
        if(output)output.value=Number(value.toFixed(2))+output.dataset.unit;
      }
      for(const group of ['beam','emblem']){const item=component(group);if(item)panel.querySelector(`[data-trek-color="${group}"]`).value=item.color.toUpperCase();}
      panel.querySelector('[data-trek-undo]').disabled=!history.length||host.busy();panel.querySelector('[data-trek-redo]').disabled=!future.length||host.busy();
      panel.querySelector('[data-trek-back]').disabled=!beam||state.beams.indexOf(beam)===0;panel.querySelector('[data-trek-front]').disabled=!beam||state.beams.indexOf(beam)===state.beams.length-1;
      const mode=state.emblem.color_mode;
      for(const img of picker.querySelectorAll('img')){const url=img.dataset.vectorBase+'-'+mode+'.svg?v=3';if(img.getAttribute('src')!==url)img.src=url;img.classList.toggle('is-single-color',mode==='single');}
    }
    function box(item,badge=false){
      const w=(badge?370/1512*100:item.width)*7.56*item.size/100,h=(badge?340/2112*100:item.height)*10.56*item.size/100;
      return {x:item.x*7.56,y:item.y*10.56,w,h,angle:item.rotation};
    }
    function guides(){
      svg.replaceChildren();svg.style.display=host.active()&&host.canMove()&&!host.busy()?'block':'none';if(svg.style.display==='none')return;
      const add=(tag,attrs,parent=svg)=>{const node=document.createElementNS(svg.namespaceURI,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);parent.append(node);return node;};
      const handles=document.createElementNS(svg.namespaceURI,'g');
      for(const [i,item] of [...state.beams,state.emblem].entries()){
        const badge=i===state.beams.length,id=badge?'emblem':item.id,b=box(item,badge),current=selected===id;
        const group=add('g',{transform:`translate(${b.x},${b.y}) rotate(${b.angle})`});
        add('rect',{x:-b.w/2,y:-b.h/2,width:b.w,height:b.h,rx:4,fill:'transparent','data-trek-object':id,tabindex:0,role:'button','aria-label':badge?'Move emblem':'Move beam '+(i+1),'aria-pressed':String(current),class:current?'is-selected':''},group);
        if(current){
          const text=add('text',{x:0,y:0,'text-anchor':'middle','pointer-events':'none'},group);text.textContent=badge?'Emblem':'Beam '+(i+1);
          const handleGroup=add('g',{transform:`translate(${b.x},${b.y}) rotate(${b.angle})`},handles);
          add('circle',{cx:b.w/2,cy:b.h/2,r:7,'data-trek-object':id,'data-resize':'true','aria-label':'Resize '+(badge?'emblem':'beam')},handleGroup);
        }
      }
      svg.append(handles);
    }
    function update(){read();if(drag)return;controls();guides();}
    for(const input of panel.querySelectorAll('[data-trek]')){
      input.addEventListener('input',()=>{if(host.busy())return;read();pending??=clone(state);const [group,key]=input.dataset.trek.split('.'),item=component(group);if(!item)return;
        let value=input.type==='range'?Number(input.value):input.value;if(key==='width')value/=.63;if(key==='height')value/=.88;item[key]=typeof value==='number'?Math.round(value*1000)/1000:value;write();controls();guides();});
      input.addEventListener('change',commit);input.addEventListener('blur',commit);
    }
    panel.querySelector('[data-trek-count]').addEventListener('change',event=>change(()=>{
      const count=Number(event.target.value),previous=state.beams,template=selectedBeam()||beamDefault();
      let nextId=Math.max(0,...previous.map(item=>Number(item.id.slice(4))))+1;
      state.beams=Array.from({length:count},(_,i)=>({...clone(previous[i]||template),id:previous[i]?.id||'beam'+nextId++,x:count===1?50:10+(i+.5)*80/count,width:count===1?100:100/count}));selected=state.beams[0]?.id||'emblem';
    }));
    panel.querySelector('[data-trek-selected]').addEventListener('change',event=>{commit();selected=event.target.value;update();});
    panel.querySelector('[data-trek-move]').addEventListener('click',()=>{host.moveTool();update();});
    for(const [selector,direction] of [['back',-1],['front',1]])panel.querySelector('[data-trek-'+selector+']').addEventListener('click',()=>change(()=>{const item=selectedBeam(),index=state.beams.indexOf(item),next=index+direction;if(next<0||next>=state.beams.length)return;state.beams.splice(index,1);state.beams.splice(next,0,item);}));
    function undo(redo=false){commit();read();const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(clone(state));state=from.pop();write();host.changed();update();}
    panel.querySelector('[data-trek-undo]').addEventListener('click',()=>undo());panel.querySelector('[data-trek-redo]').addEventListener('click',()=>undo(true));
    const point=event=>{const rect=svg.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*100,y:(event.clientY-rect.top)/rect.height*100};};
    svg.addEventListener('pointerdown',event=>{
      const id=event.target.dataset.trekObject;if(!id||host.busy()||event.button!==0)return;event.preventDefault();event.stopPropagation();commit();read();selected=id;
      const item=id==='emblem'?state.emblem:selectedBeam();drag={pointer:event.pointerId,start:point(event),before:clone(state),item:clone(item),resize:Boolean(event.target.dataset.resize)};svg.setPointerCapture(event.pointerId);controls();guides();
    });
    svg.addEventListener('pointermove',event=>{
      if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();const p=point(event),item=selected==='emblem'?state.emblem:selectedBeam();
      if(drag.resize){const b=box(drag.item,selected==='emblem'),angle=b.angle*Math.PI/180,dx=(p.x*7.56-b.x),dy=(p.y*10.56-b.y);const u=(dx*Math.cos(angle)+dy*Math.sin(angle))/b.w,v=(-dx*Math.sin(angle)+dy*Math.cos(angle))/b.h;item.size=clamp(drag.item.size*(u+v),10,500);}
      else{item.x=clamp(drag.item.x+p.x-drag.start.x,-100,200);item.y=clamp(drag.item.y+p.y-drag.start.y,-100,200);}
      write();controls();guides();
    });
    function end(event){if(!drag||drag.pointer!==event.pointerId)return;event.preventDefault();event.stopPropagation();const before=drag.before;drag=null;
      if(event.type==='pointercancel')state=before;const changed=record(before);write();if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);if(changed)host.changed();update();
      if(event.type==='pointerup'){
        const section=selected==='emblem'?emblemSection:panel.querySelector('[data-trek-beam-controls]'),pane=section.closest('.studio-inspector-scroll')||section.closest('.spot-card-controls');
        if(pane){for(let parent=section.parentElement;parent&&parent!==pane;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
          pane.scrollTo({top:pane.scrollTop+section.getBoundingClientRect().top-pane.getBoundingClientRect().top-14,behavior:'instant'});}
      }}
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
    svg.addEventListener('keydown',event=>{const id=event.target.dataset.trekObject;if(!id)return;
      if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();selected=id;update();return;}
      const offset={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!offset)return;
      event.preventDefault();event.stopPropagation();selected=id;change(()=>{const item=id==='emblem'?state.emblem:selectedBeam(),step=event.shiftKey?5:1;item.x=clamp(item.x+offset[0]*step,-100,200);item.y=clamp(item.y+offset[1]*step,-100,200);});svg.querySelector(`[data-trek-object="${id}"]`)?.focus();});
    dialog.addEventListener('close',()=>{drag=null;pending=null;svg.style.display='none';});
    return {update,flush:commit,get moving(){return host.active()&&host.canMove();}};
  }
  window.DeckadenceTrekTransporter={create,defaults,fromRecord};
})();
