// Disintegrate settings and AI reconstruction stay with each effect layer.
(() => {
  'use strict';
  const defaults=()=>({style:'burn',target:'impact',amount:68,size:62,x:50,y:35,stretch:115,rotation:0,roughness:55,
    beam:true,beam_type:'continuous',source_x:4,source_y:42,beam_width:5,beam_source_width:100,beam_target_width:100,beam_opacity:100,beam_inner:'#FFF7D7',edge_inner:'#FFF2C7',
    spacing:60,flare:75,beam_path:true,glow:78,density:85,edge_width:4,particle_size:3,scatter:42,drift:-35,brightness:100,opacity:100,
    outer_edge_reveal:0,edge_disintegration:true,inside_edge_color:'#FF9D35',
    subject_outline:true,subject_outline_width:4,subject_outline_opacity:100,subject_outline_color:'',scene:'',subject:'',prompt:''});
  const ranges={amount:['Disintegrated',0,100,'%'],size:['Affected size',10,180,'%'],x:['Impact X',0,100,'%'],y:['Impact Y',0,100,'%'],
    stretch:['Height',30,250,'%'],rotation:['Rotation',-180,180,'°'],roughness:['Edge irregularity',0,100,'%'],
    source_x:['Beam source X',-50,150,'%'],source_y:['Beam source Y',-50,150,'%'],beam_width:['Beam width',1,24,' px'],
    beam_source_width:['Origin width',10,400,'%'],beam_target_width:['Impact width',10,400,'%'],
    beam_opacity:['Beam opacity',0,100,'%'],spacing:['Shot spacing / bolt length',15,150,' px'],flare:['Impact flare',0,100,'%'],
    glow:['Edge glow',0,100,'%'],density:['Particle density',0,200,'%'],edge_width:['Rim thickness',0,14,' px'],
    particle_size:['Particle size',0,9,' px'],scatter:['Scatter distance',0,100,'%'],drift:['Drift angle',-180,180,'°'],
    brightness:['Brightness',25,200,'%'],opacity:['Energy opacity',0,100,'%'],outer_edge_reveal:['Outer-edge reveal',0,100,'%'],
    subject_outline_width:['Outline thickness',0,14,' px'],subject_outline_opacity:['Outline opacity',0,100,'%']};
  const colors=[['Hot white','#F4FBFF'],['Phaser amber','#FF9D35'],['Laser red','#FF343C'],['Plasma magenta','#ED40FF'],['Pulse violet','#9B6DFF'],['Ion blue','#368CFF'],['Particle cyan','#30E5FF'],['Disrupter green','#76FF35']];
  const styles=[['burn','Burn-through','Molten rim, hollow center'],['spark','Spark breakup','Flashes and scattered sparks'],['flash','Energy flash','Bright silhouette, fading core'],['dust','Particle dissolve','Fine fragments drifting away']];
  const beams=[['continuous','Continuous'],['plasma_beam','Plasma beam'],['particle','Particle beam'],['phase','Phase beam'],['disrupter','Disrupter Ray'],['plasma','Plasma bolt'],['rapid','Rapid shot'],['pulse','Pulse'],['ray','Ray gun']];
  function emblem(key,beam=false){
    // Lightweight vector previews keep the chooser sharp at any display scale.
    const id='dis-'+(beam?'beam-':'style-')+key;
    const tint=({burn:'#FFB74F',spark:'#FF6B65',flash:'#9AFFCE',dust:'#BA99FF',continuous:'#FFB74F',plasma_beam:'#ED40FF',particle:'#53DBFF',phase:'#A2B7FF',disrupter:'#76FF35',plasma:'#FF5454',rapid:'#46BFFF',pulse:'#FFB74F',ray:'#7CF0FF'})[key];
    const line=(d,width=3,color=tint)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    let shape='';
    if(beam){
      if(key==='phase')shape=[-9,-5,-1,3,7].map((y,i)=>line(`M14 ${40+y} Q85 ${36+y+i} 166 ${40+y}`,i%2?1:.6)).join('');
      else if(key==='rapid'||key==='plasma'){
        const shots=key==='plasma'?[[58,162,5]]:[[12,42,2.5],[55,73,2],[90,129,3],[143,166,2]];
        shape=shots.map(([a,b,r])=>`<path d="M${a} 40 Q${b-8} ${40-r*2} ${b} 40 Q${b-8} ${40+r*2} ${a} 40" fill="url(#${id}-tail)"/>`+line(`M${a+(b-a)*.55} 40H${b-2}`,r*.55,'#F4FBFF')).join('');
      }else if(key==='pulse')shape=[18,56,94,132].map(x=>line(`M${x} 40h23`,5)+line(`M${x} 40h23`,1.5,'#F4FBFF')).join('');
      else{
        const width=key==='plasma_beam'?10:key==='particle'?2.4:4;
        shape=line('M14 40H166',width)+line('M14 40H166',width*.45,'#F4FBFF');
        if(key==='disrupter')shape+=line('M28 40l5-7 4 2 3-8 7 3 3-2 8 12 6 8 7-3 2 7 7-4 5 5 7-13 5-8 5 2 2-7 8 5 4-2 9 10 6 12 5-3 3 4 7-13',1.3);
        if(key==='ray')shape+=line('M14 40C26 18 38 18 50 40S74 62 86 40S110 18 122 40S146 62 166 40',1.4);
        if(key==='plasma_beam')shape+=`<circle cx="17" cy="40" r="8" fill="#F4FBFF"/>`;
        if(key==='particle')shape+=[29,47,80,113,146].map(x=>`<circle cx="${x}" cy="40" r="1.6" fill="#F4FBFF"/>`).join('');
      }
    }else{
      const body='M79 18a11 11 0 1 1 22 0v7l13 7 12 36-13 5-12-28v35H79V45L67 73l-13-5 12-36 13-7Z';
      const rim='M66 37l3-7 8-2 5-6 9 2 6-2 6 7 9 1 2 9 5 5-3 8 2 7-8 4-5 9-8-2-8 4-6-6-9 1-3-8-7-4 3-9Z';
      if(key==='flash')shape=`<path d="${body}" fill="${tint}" fill-opacity=".65" stroke="#EDFFF6" stroke-width="2"/>`;
      else if(key==='dust')shape=`<path d="${body}" fill="${tint}" fill-opacity=".15"/>`+Array.from({length:28},(_,i)=>`<rect x="${64+(i*19)%64}" y="${10+(i*13)%66}" width="${2+i%3}" height="${2+i%3}" fill="${i%3?tint:'#F4FBFF'}" opacity="${.35+i%4*.16}"/>`).join('');
      else shape=`<path d="${body}" fill="#53657B" fill-opacity=".45"/><path d="${rim}" fill="#0D1827" stroke="${tint}" stroke-width="${key==='spark'?2:3}"/>`+line(rim,.8,'#FFF5DA');
      if(key!=='flash')shape+=Array.from({length:key==='spark'?21:10},(_,i)=>{const x=51+(i*31)%89,y=10+(i*17)%64;return key==='spark'&&i%3===0?line(`M${x-3} ${y}h6m-3-3v6`,1):`<circle cx="${x}" cy="${y}" r="${.7+i%3*.45}" fill="${tint}"/>`;}).join('');
    }
    return `<svg class="dis-type-emblem" viewBox="0 0 180 80" aria-hidden="true" focusable="false"><defs><filter id="${id}-glow" x="-50%" y="-80%" width="200%" height="260%"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="${id}-tail"><stop stop-color="${tint}" stop-opacity="0"/><stop offset=".8" stop-color="${tint}"/><stop offset="1" stop-color="#F4FBFF"/></linearGradient></defs><rect width="180" height="80" fill="#0D1827"/><path d="M0 68L180 8M0 32L180 72M36 0V80M144 0V80" stroke="#35475F" stroke-opacity=".3" fill="none"/><g filter="url(#${id}-glow)">${shape}</g>${shape}</svg>`;
  }
  // Appearance presets must not move or resize the disintegration area.
  const presets={burn:{density:85,glow:78},spark:{density:145,glow:90},flash:{density:45,glow:100},dust:{density:180,glow:48}};
  function create(host){
    const {dialog,stage}=host,panel=dialog.querySelector('[data-spot-disintegrate-controls]');
    const field=document.createElement('input');field.type='hidden';field.name='effect_disintegrate';field.value=JSON.stringify(defaults());panel.append(field);
    const range=keys=>keys.map(key=>{const [label,min,max,unit]=ranges[key];return `<label class="spot-card-range-label"><span>${label}</span><output data-dis-value="${key}" data-unit="${unit}"></output><input type="range" data-dis="${key}" aria-label="${label}" min="${min}" max="${max}" step="1"></label>`;}).join('');
    const effectColor=dialog.querySelector('[name="effect_color"]');
    const color=(key,label)=>`<div class="dis-color-control">${key==='effect'?'<div data-dis-color-slot></div>':`<label class="spot-card-color-picker"><span>${label}</span><input type="color" data-dis="${key}" aria-label="${label}"><output data-dis-color="${key}"></output></label>`}<div class="dis-swatches" role="group" aria-label="${label} presets">${colors.map(([name,value])=>`<button type="button" data-dis-swatch="${key}" data-color="${value}" aria-label="${label}: ${name}" title="${name} · ${value}" style="--swatch:${value}"></button>`).join('')}</div></div>`;
    panel.insertAdjacentHTML('beforeend',`
      <section class="spot-finish-group dis-type-pickers" aria-label="Effect types"><div><h3>Disintegration type</h3>
      <div class="dis-styles" role="group" aria-label="Disintegration style">${styles.map(([key,name,desc])=>`<button type="button" data-dis-style="${key}" aria-label="${name}" title="${desc}" aria-pressed="false">${emblem(key)}<strong>${name}</strong><small>${desc}</small></button>`).join('')}</div></div>
      <div><div class="dis-section-heading"><h3>Beam type</h3><label class="spot-card-check"><input type="checkbox" data-dis="beam"> Enabled</label></div><div class="dis-styles dis-beam-types" role="group" aria-label="Beam type">${beams.map(([key,name])=>`<button type="button" data-dis-beam-type="${key}" aria-label="${name}" aria-pressed="false">${emblem(key,true)}<strong>${name}</strong></button>`).join('')}</div></div></section>
      <section class="spot-finish-group"><h3>Target & disintegration</h3><div class="dis-segmented" role="group" aria-label="Target extent"><button type="button" data-dis-target="impact" aria-pressed="false">Impact area</button><button type="button" data-dis-target="subject" aria-pressed="false">Whole subject</button></div>
      <div class="spot-finish-pair">${range(['amount','size'])}</div>
      <div class="spot-card-button-row"><button type="button" data-dis-size="35">Small</button><button type="button" data-dis-size="62">Medium</button><button type="button" data-dis-size="100">Large</button><button type="button" data-dis-move>Move impact & beam</button></div>
      <div data-dis-outer-edges hidden>${range(['outer_edge_reveal'])}<p class="spot-card-caption">Bring the original subject back in splotchy patches from its outer edges inward, keeping the center disintegrated. Reuses the reconstructed background.</p><label class="spot-card-check"><input type="checkbox" data-dis="edge_disintegration"> Edge disintegration</label><p class="spot-card-caption">Color the inside boundaries of the visible patches. Choose Inside-edge color below; Rim thickness, Edge glow and Energy opacity also apply.</p></div>
      <p class="spot-card-caption">The impact reveals reconstructed background through the subject. No mask means the whole card.</p><details><summary>Impact position & shape</summary><div class="spot-finish-pair">${range(['x','y','stretch','rotation','roughness'])}</div></details></section>
      <section class="spot-finish-group" aria-label="Subject outline"><div class="dis-section-heading"><h3>Subject outline</h3><label class="spot-card-check"><input type="checkbox" data-dis="subject_outline"> Show subject outline</label></div><div data-dis-outline-controls><div class="spot-finish-pair">${range(['subject_outline_width','subject_outline_opacity'])}</div></div><p class="spot-card-caption">Controls only the line around the subject's silhouette, including its glow. Impact and inside edges keep their own Rim thickness. Choose Subject outline color in Energy colors.</p></section>
      <section class="spot-finish-group dis-colors" aria-label="Energy colors"><h3>Energy colors</h3><p class="spot-card-caption">Choose separate colors for the energy, beam, disintegration edges and subject outline. Every picker uses the same energy palette and supports a custom color.</p>${color('effect','Effect color')}${color('beam_inner','Beam inner color')}${color('edge_inner','Edge inner color')}<div data-dis-inside-color hidden>${color('inside_edge_color','Inside-edge color')}</div><div data-dis-outline-color>${color('subject_outline_color','Subject outline color')}</div></section>
      <section class="spot-finish-group" data-dis-beam-controls><h3>Beam shape & placement</h3><div>
      <div class="spot-finish-pair">${range(['beam_width','beam_opacity'])}</div>
      <h4>Beam perspective</h4><div class="spot-finish-pair">${range(['beam_source_width','beam_target_width'])}</div>
      <div class="spot-card-button-row"><button type="button" data-dis-perspective="flat">Uniform width</button><button type="button" data-dis-perspective="near">Origin closer</button><button type="button" data-dis-perspective="far">Impact closer</button></div>
      <p class="spot-card-caption">Each end is a percentage of Beam width. Make the closer end wider for perspective. All beam types follow the effect mask.</p>
      <div data-dis-spacing>${range(['spacing'])}</div><details><summary>Beam placement & flare</summary><div class="spot-card-button-row"><button type="button" data-dis-direction="left">From left</button><button type="button" data-dis-direction="above">From above</button><button type="button" data-dis-direction="right">From right</button></div><div class="spot-finish-pair">${range(['source_x','source_y','flare'])}</div><label class="spot-card-check"><input type="checkbox" data-dis="beam_path"> Include beam in Copy Path</label></details></div></section>
      <section class="spot-finish-group"><h3>Edge & particles</h3><div class="spot-finish-pair">${range(['glow','density','opacity'])}</div><details><summary>Appearance & drift</summary><div class="spot-finish-pair">${range(['edge_width','particle_size','scatter','drift','brightness'])}</div></details></section>
      <section class="spot-finish-group" data-dis-reconstruction><h3>AI background reconstruction</h3><p class="spot-card-caption">Detect the entire subject that will disintegrate, including its hands, feet and equipment. Inspect the cutout and use Refine target to paint in missing parts or erase unwanted areas. The impact outline shows the disappearing area, which can be smaller than the complete subject.</p>
      <div class="spot-card-button-row"><button type="button" data-dis-detect>Detect target</button><button type="button" data-dis-subject>Inspect subject</button><button type="button" data-dis-refine>Refine target</button></div>
      <div data-dis-correction hidden><p class="spot-card-caption">Paint adds to the target; Erase removes unwanted parts. Brush size and softness use the Studio brush controls. Your effect application mask is kept separately.</p><div class="spot-card-button-row" role="group" aria-label="Refine target tools"><button type="button" data-spot-tool="paint" data-dis-target-tool aria-pressed="true">Paint <kbd>B</kbd></button><button type="button" data-spot-tool="erase" data-dis-target-tool aria-pressed="false">Erase <kbd>E</kbd></button><button type="button" data-spot-tool="pan" data-dis-target-tool aria-pressed="false">Pan <kbd>H</kbd></button></div><div class="spot-card-button-row"><button type="button" data-dis-use-target>Use corrected target</button><button type="button" data-dis-cancel-target>Cancel target correction</button></div></div>
      <label>Background instructions (optional)<textarea data-dis="prompt" aria-label="Background instructions" maxlength="1200" rows="3" placeholder="For example: Continue the detailed metal corridor and floor behind the disintegrated subject. No people or creatures."></textarea></label>
      <p class="spot-card-caption">Rebuild detailed scenery where the subject has disintegrated, without generating people, creatures or leftover body parts. Describe the background to help correct a result. Changing these instructions takes effect on the next reconstruction.</p>
      <div class="spot-card-button-row"><button type="button" data-dis-generate>Reconstruct background</button><button type="button" data-dis-inspect>Inspect background</button></div><p class="spot-card-caption" role="status" data-dis-status></p><div data-dis-job-slot></div><div data-dis-review hidden><p class="spot-card-caption">Review the rebuilt background, then apply it to this effect.</p><div class="spot-card-button-row"><button type="button" data-dis-apply>Apply reconstruction</button><button type="button" data-dis-discard>Discard result</button></div></div></section>
      <div class="spot-card-button-row"><button type="button" data-dis-undo>Undo effect edit</button><button type="button" data-dis-redo>Redo</button></div>`);
    const cancel=document.createElement('button');cancel.type='button';cancel.hidden=true;cancel.textContent='Cancel reconstruction';dialog.querySelector('.spot-card-footer-actions').prepend(cancel);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 756 1056');svg.setAttribute('aria-label','Disintegrate impact and beam placement');svg.classList.add('dis-impact-guides');stage.append(svg);
    // Keep the shared job panel and its Cancel action outside the settings
    // fieldset, which is disabled while AI is working.
    const reconstruction=panel.querySelector('[data-dis-reconstruction]');
    panel.closest('.spot-finish-controls').after(reconstruction);
    let state,serialized='',scope='',history=[],future=[],before=null,drag=null,job=null,pending=null,statusText='',epoch=0,refining=false,targetBackup=null;
    const q=name=>panel.querySelector(`[data-dis-${name}]`)||reconstruction.querySelector(`[data-dis-${name}]`);
    const inputs=()=>[...panel.querySelectorAll('[data-dis]'),...reconstruction.querySelectorAll('[data-dis]')];
    function read(){
      const next=host.scope();if(scope!==next){scope=next;history=[];future=[];before=null;drag=null;serialized='';statusText='';pending=null;}
      if(!state||serialized!==field.value){const saved=JSON.parse(field.value||'{}');state={...defaults(),...saved,subject_outline_width:saved.subject_outline_width??saved.edge_width??4};delete state.scene_source;delete state.scene_selection;write();}
      return state;
    }
    function write(){field.value=serialized=JSON.stringify(state);}
    function commit(){if(!before)return;const old=before;before=null;if(JSON.stringify(old)!==JSON.stringify(state)){history.push(old);if(history.length>20)history.shift();future=[];host.changed();}update();}
    function change(fn){if(pending||refining)return;commit();read();before={...state};fn();write();commit();}
    function controls(){
      reconstruction.hidden=!host.active();
      const colorValue=key=>key==='effect'?effectColor.value:key==='subject_outline_color'?(state[key]||effectColor.value):state[key];
      for(const input of inputs()){const key=input.dataset.dis,value=key==='subject_outline_color'?colorValue(key):state[key];input.disabled=host.busy()||Boolean(pending)||refining;if(input.type==='checkbox')input.checked=value;else if(input.value!==String(value))input.value=value;const output=q('value="'+key+'"');if(output)output.value=value+output.dataset.unit;}
      for(const button of panel.querySelectorAll('[data-dis-style],[data-dis-size],[data-dis-swatch],[data-dis-direction],[data-dis-perspective],[data-dis-target],[data-dis-beam-type]'))button.disabled=host.busy()||Boolean(pending)||refining;
      for(const key of ['beam_inner','edge_inner','inside_edge_color','subject_outline_color'])panel.querySelector(`[data-dis-color="${key}"]`).value=colorValue(key).toUpperCase();
      for(const button of panel.querySelectorAll('[data-dis-style]'))button.setAttribute('aria-pressed',String(button.dataset.disStyle===state.style));
      for(const button of panel.querySelectorAll('[data-dis-beam-type]')){button.setAttribute('aria-pressed',String(button.dataset.disBeamType===state.beam_type));button.disabled||=!state.beam;}
      for(const button of panel.querySelectorAll('[data-dis-target]'))button.setAttribute('aria-pressed',String(button.dataset.disTarget===state.target));
      for(const button of panel.querySelectorAll('[data-dis-swatch]'))button.setAttribute('aria-pressed',String(button.dataset.color.toUpperCase()===colorValue(button.dataset.disSwatch).toUpperCase()));
      q('beam-controls').hidden=!state.beam;q('spacing').hidden=!['pulse','rapid','plasma','ray'].includes(state.beam_type);
      q('outer-edges').hidden=state.target!=='subject';q('inside-color').hidden=state.target!=='subject'||!state.edge_disintegration;
      q('outline-controls').hidden=q('outline-color').hidden=!state.subject_outline;
      q('generate').disabled=host.busy()||Boolean(pending)||refining;q('inspect').disabled=host.busy()||refining||!(pending?.scene||state.scene);
      q('detect').disabled=host.busy()||Boolean(pending)||refining;q('subject').disabled=host.busy()||refining||!state.subject;
      q('refine').disabled=host.busy()||Boolean(pending)||refining||!state.subject;
      q('correction').hidden=!refining;q('use-target').disabled=q('cancel-target').disabled=host.busy();
      for(const button of reconstruction.querySelectorAll('[data-dis-target-tool]'))button.disabled=host.busy()||!refining;
      q('apply').disabled=q('discard').disabled=host.busy();
      q('review').hidden=!pending;q('undo').disabled=host.busy()||!history.length||Boolean(pending)||refining;q('redo').disabled=host.busy()||!future.length||Boolean(pending)||refining;
      q('status').textContent=statusText||(state.scene?'Reconstruction ready.':state.subject?'Subject ready. Reconstruct the background behind it.':'Place the impact on the subject, then detect the target. Reconstruct background also detects it if needed.');
      cancel.hidden=!job;cancel.disabled=!job;
    }
    function guides(){
      svg.style.display=host.active()&&host.canMove()&&!host.busy()&&!refining?'block':'none';if(svg.style.display==='none')return;
      svg.replaceChildren();
      for(const [key,x,y,label] of [['impact',state.x,state.y,'Move impact'],...(state.beam?[['source',state.source_x,state.source_y,'Move beam source']]:[])]){
        const group=document.createElementNS(svg.namespaceURI,'g');group.setAttribute('transform',`translate(${x*7.56} ${y*10.56})`);
        group.setAttribute('data-dis-handle',key);group.setAttribute('tabindex','0');group.setAttribute('role','button');group.setAttribute('aria-label',label);
        const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('r','13');group.append(circle);
        const cross=document.createElementNS(svg.namespaceURI,'path');cross.setAttribute('d','M-6 0H6M0-6V6');group.append(cross);svg.append(group);
      }
    }
    function update(){read();if(drag)return;controls();guides();}
    for(const input of inputs()){
      input.addEventListener('input',()=>{if(host.busy()||pending||refining)return;read();before??={...state};const key=input.dataset.dis;state[key]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;write();controls();guides();if(key!=='prompt')host.preview();});
      input.addEventListener('change',commit);input.addEventListener('blur',commit);
    }
    for(const button of panel.querySelectorAll('[data-dis-style]'))button.addEventListener('click',()=>change(()=>Object.assign(state,presets[button.dataset.disStyle],{style:button.dataset.disStyle})));
    for(const button of panel.querySelectorAll('[data-dis-beam-type]'))button.addEventListener('click',()=>change(()=>{state.beam_type=button.dataset.disBeamType;}));
    for(const button of panel.querySelectorAll('[data-dis-target]'))button.addEventListener('click',()=>change(()=>{state.target=button.dataset.disTarget;}));
    for(const button of panel.querySelectorAll('[data-dis-size]'))button.addEventListener('click',()=>change(()=>{state.size=Number(button.dataset.disSize);}));
    for(const button of panel.querySelectorAll('[data-dis-swatch]'))button.addEventListener('click',()=>{
      if(host.busy()||pending||refining)return;
      if(button.dataset.disSwatch==='effect'){
        effectColor.value=button.dataset.color;effectColor.dispatchEvent(new Event('input',{bubbles:true}));
      }else change(()=>{state[button.dataset.disSwatch]=button.dataset.color;});
    });
    for(const button of panel.querySelectorAll('[data-dis-direction]'))button.addEventListener('click',()=>change(()=>{[state.source_x,state.source_y]=({left:[4,42],above:[50,0],right:[96,42]})[button.dataset.disDirection];}));
    for(const button of panel.querySelectorAll('[data-dis-perspective]'))button.addEventListener('click',()=>change(()=>{[state.beam_source_width,state.beam_target_width]=({flat:[100,100],near:[220,55],far:[55,220]})[button.dataset.disPerspective];}));
    q('move').addEventListener('click',()=>{host.moveTool();update();});
    function undo(redo){if(refining||pending||host.busy())return;commit();read();const from=redo?future:history,to=redo?history:future;if(!from.length)return;to.push(state);state=from.pop();write();host.changed();update();}
    q('undo').addEventListener('click',()=>undo(false));q('redo').addEventListener('click',()=>undo(true));
    const point=e=>{const rect=svg.getBoundingClientRect();return [(e.clientX-rect.left)/rect.width*100,(e.clientY-rect.top)/rect.height*100];};
    svg.addEventListener('pointerdown',event=>{const handle=event.target.closest('[data-dis-handle]');if(!handle||host.busy()||event.button!==0)return;event.preventDefault();event.stopPropagation();commit();read();before={...state};drag={id:event.pointerId,key:handle.dataset.disHandle};svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();const [x,y]=point(event),source=drag.key==='source';state[source?'source_x':'x']=Math.round(Math.max(source?-50:0,Math.min(source?150:100,x)));state[source?'source_y':'y']=Math.round(Math.max(source?-50:0,Math.min(source?150:100,y)));write();controls();guides();host.preview();});
    function end(event){if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();if(event.type==='pointercancel')state=before;drag=null;write();commit();if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);}
    svg.addEventListener('pointerup',end);svg.addEventListener('pointercancel',end);svg.addEventListener('lostpointercapture',end);
    svg.addEventListener('keydown',event=>{const handle=event.target.closest('[data-dis-handle]'),offset={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!handle||!offset)return;event.preventDefault();event.stopPropagation();const source=handle.dataset.disHandle==='source',key=handle.dataset.disHandle;change(()=>{for(const [i,name] of (source?['source_x','source_y']:['x','y']).entries())state[name]=Math.max(source?-50:0,Math.min(source?150:100,state[name]+offset[i]*(event.shiftKey?5:1)));});svg.querySelector(`[data-dis-handle="${key}"]`)?.focus();});
    async function request(url,method='GET',body){const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const value=await response.json();if(!response.ok)throw new Error(value.message||'Reconstruction failed.');return value;}
    async function detect(inputs,token,owner){
      const source=new Image();source.src=inputs.image_data;await source.decode();
      if(token!==epoch||owner!==host.scope())return null;
      const impact=[state.x/100,state.y/100];
      let bounds=inputs.source_bounds;
      if(impact[0]<bounds[0]||impact[0]>bounds[2]||impact[1]<bounds[1]||impact[1]>bounds[3])bounds=[0,0,1,1];
      const [left,top,right,bottom]=bounds.map((v,i)=>Math.round(v*(i%2?source.height:source.width)));
      const crop=document.createElement('canvas');crop.width=right-left;crop.height=bottom-top;
      crop.getContext('2d').drawImage(source,left,top,crop.width,crop.height,0,0,crop.width,crop.height);
      statusText='Detecting the subject at the impact point…';controls();
      host.job({phase:'analyze',title:'Detecting target',message:statusText,model_label:'Subject detection · on this PC'});
      const result=await request(host.url('detect-subject'),'POST',{image:crop.toDataURL('image/jpeg',.95).split(',')[1],point:impact.map((v,i)=>Math.max(0,Math.min(1,(v-bounds[i])/(bounds[i+2]-bounds[i]))))});
      if(token!==epoch||owner!==host.scope())return null;
      const detected=new Image();detected.src=result.mask_data;await detected.decode();
      if(token!==epoch||owner!==host.scope())return null;
      const cutout=document.createElement('canvas');cutout.width=source.width;cutout.height=source.height;
      const context=cutout.getContext('2d');context.drawImage(detected,left,top,crop.width,crop.height);
      context.globalCompositeOperation='source-in';context.drawImage(source,0,0);
      return cutout.toDataURL('image/png').split(',')[1];
    }
    async function generate(detectOnly=false){
      if(host.busy()||pending||refining)return;commit();read();const token=++epoch,owner=host.scope();job={url:null};host.setBusy(true);statusText='Preparing selected artwork…';update();host.job({start:true});
      try{
        const inputs=host.inputs(),subject=detectOnly||!state.subject?await detect(inputs,token,owner):state.subject;
        if(!subject||token!==epoch||owner!==host.scope())return;
        if(subject!==state.subject)change(()=>Object.assign(state,{subject,scene:''}));
        if(detectOnly){
          statusText='Subject cutout ready. Inspect the whole body and refine any missing parts before reconstructing its background.';
          host.job({phase:'review',title:'Subject ready',message:statusText,finished:true});return;
        }
        host.job({stage:'queued',message:'Reconstructing the background behind the detected subject.',model_label:'Generative Art AI · on this PC'});
        const instruction='The masked subject has completely disintegrated and is gone. Fill its entire silhouette with detailed, sharp background scenery continuing the surrounding environment, perspective, lighting, materials and texture. The reconstructed space is empty of people, creatures, faces, bodies, limbs, clothing, weapons and silhouettes. No replacement subject, blur, beams, glow, particles, emblems or text. Preserve the unmasked artwork. ';
        const result=await request(host.url('art-generation'),'POST',{...inputs,mask_data:'data:image/png;base64,'+subject,mode:'outpaint',background_reconstruction:true,prompt:instruction+(state.prompt.trim()?'Background guidance: '+state.prompt.trim():''),seed:host.seed(),maintain_style:true,style_mode:'match'});
        const url=host.url('art-generation/'+result.job);
        if(token!==epoch||owner!==host.scope()){void request(url,'DELETE').catch(()=>{});return;}job.url=url;update();
        while(token===epoch&&owner===host.scope()){
          const result=await request(url);if(token!==epoch||owner!==host.scope())return;
          host.job(result);
          if(result.state==='complete'){
            if(!result.image_data?.startsWith('data:image/png;base64,'))throw new Error('The AI did not return a reconstruction.');
            pending={scene:result.image_data.split(',')[1],subject};
            statusText=result.change_summary?.little_change?'The AI made very little change. Inspect the result before applying, or discard and try again.':'Background rebuilt. Inspect it, then apply or discard this result.';
            host.job({phase:'review',title:'Reconstruction ready · not applied',message:statusText,finished:true,diagnosticsUrl:result.diagnostics_available?url:null});
            break;
          }
          if(['failed','cancelled'].includes(result.state))throw new Error(result.message||'Reconstruction cancelled.');
          statusText=result.message||'Reconstructing the background…';controls();await new Promise(resolve=>setTimeout(resolve,1000));
        }
      }catch(error){if(token===epoch){if(job?.url)void request(job.url,'DELETE').catch(()=>{});statusText=error.message;host.job({phase:'failed',title:'Reconstruction failed',message:error.message,finished:true});host.message(error.message,true);}}
      finally{if(token===epoch){job=null;host.setBusy(false);update();}}
    }
    q('generate').addEventListener('click',()=>void generate());
    q('detect').addEventListener('click',()=>void generate(true));
    q('subject').addEventListener('click',()=>host.inspect(state.subject,true));
    q('refine').addEventListener('click',async()=>{
      if(host.busy()||pending||refining||!state.subject)return;
      commit();refining=true;host.setBusy(true);
      try{targetBackup=await host.beginTarget(state.subject);statusText='Paint to add missing parts or Erase to remove unwanted areas, then choose Use corrected target.';}
      catch(error){refining=false;host.message(error.message,true);}
      finally{host.setBusy(false);update();}
    });
    function finishTarget(apply){
      if(!refining||host.busy())return;
      try{
        const subject=apply?host.targetCutout():null;
        host.endTarget(targetBackup);targetBackup=null;refining=false;
        if(apply)change(()=>Object.assign(state,{subject,scene:''}));
        statusText=apply?'Corrected target ready. Reconstruct the background for this complete subject.':'Target correction cancelled.';
      }catch(error){host.message(error.message,true);}
      update();host.refresh();host.message(statusText);
    }
    q('use-target').addEventListener('click',()=>finishTarget(true));q('cancel-target').addEventListener('click',()=>finishTarget(false));
    async function cancelGeneration(){if(!job)return;const old=job;epoch++;job=null;statusText='Reconstruction cancelled. Your previous result is unchanged.';host.job({phase:'cancelled',title:'Reconstruction cancelled',message:statusText,finished:true});host.setBusy(false);update();if(old.url)try{await request(old.url,'DELETE');}catch(error){host.message(error.message,true);}}
    cancel.addEventListener('click',()=>void cancelGeneration());
    const inspect=()=>host.inspect(pending?.scene||state.scene||state.subject,!(pending?.scene||state.scene));
    q('inspect').addEventListener('click',inspect);
    q('apply').addEventListener('click',()=>{
      if(!pending||host.busy())return;const candidate=pending;
      try{
        pending=null;change(()=>Object.assign(state,candidate));statusText='Reconstruction applied to this effect. Save for this card to keep it.';
        host.job({phase:'review',title:'Reconstruction applied',message:statusText,finished:true});
      }catch(error){statusText=error.message;host.message(error.message,true);}finally{update();host.refresh();}
    });
    q('discard').addEventListener('click',()=>{pending=null;statusText='Result discarded. Your previous reconstruction is unchanged.';host.job({phase:'review',title:'Reconstruction discarded',message:statusText,finished:true});update();host.refresh();});
    function validate(value){
      if(!value.amount)return;
      if(!value.scene)throw new Error('Generate and apply the Disintegrate background before saving.');
    }
    function release(){epoch++;if(job?.url)void request(job.url,'DELETE').catch(()=>{});job=null;pending=null;before=null;drag=null;scope='';state=null;history=[];future=[];refining=false;targetBackup=null;cancel.hidden=true;svg.style.display='none';reconstruction.hidden=true;}
    return {update,flush:commit,release,validate,generate,cancel:cancelGeneration,inspect,get refining(){return refining;},get generating(){return Boolean(job);},get resultKind(){return pending?.scene||state?.scene?'background':'subject';},get hasResult(){return Boolean(pending?.scene||state?.scene||state?.subject);},get pending(){return Boolean(pending)||refining;},get moving(){return !refining&&host.active()&&host.canMove();}};
  }
  window.DeckadenceDisintegrate={create,defaults};
})();
