// Card-coordinate text presets and ProxyGlyph symbols shared by preview and saved pixels.
window.DeckadenceArtText = (() => {
  const fonts=['Beleren Proxy','Plantin MT Pro','Beleren Small Caps','ProxyGlyph','Georgia','Arial','Times New Roman','Courier New'];
  const presets={
    title:{label:'Card title',font:fonts[0],size:38,x:.085,y:.052,width:.65,height:.05,bold:true},
    mana:{label:'Mana cost',font:fonts[3],size:34,x:.74,y:.055,width:.175,height:.047,align:'right'},
    type:{label:'Type line',font:fonts[0],size:30,x:.085,y:.565,width:.83,height:.042,bold:true},
    rules:{label:'Rules text',font:fonts[1],size:31,x:.085,y:.627,width:.83,height:.26},
    flavor:{label:'Flavor text',font:fonts[1],size:29,x:.085,y:.824,width:.83,height:.065,italic:true},
    artist:{label:'Artist credit',font:fonts[2],size:15,x:.07,y:.947,width:.7,height:.022,text:'{ARTIST} Artist name',color:'#FFFFFF'},
    legal:{label:'Bottom / legal text',font:fonts[2],size:12,x:.07,y:.973,width:.86,height:.018,color:'#FFFFFF'},
    power:{label:'Power / toughness',font:fonts[0],size:34,x:.802,y:.889,width:.12,height:.043,bold:true,align:'center'},
    custom:{label:'Custom text',font:fonts[1],size:32,x:.1,y:.45,width:.8,height:.15}
  };
  const symbols={W:['w','White','#F8F0D8'],U:['u','Blue','#A8D5EA'],B:['b','Black','#B9B1B1'],R:['r','Red','#E9A18D'],G:['g','Green','#A8C4AD'],C:['c','Colorless','#CDC9C2'],T:['t','Tap','#CDC9C2'],Q:['l','Untap','#FFFFFF'],S:['s','Snow','#E2E4E4'],E:['e','Energy',null],X:['X','Variable mana','#CDC9C2'],P:['p','Phyrexian','#CDC9C2'],CHAOS:['?','Chaos',null],ARTIST:['a','Artist',null]};
  for(let i=0;i<=20;i++)symbols[String(i)]=[i<10?String(i):({10:'A',11:'B',12:'C',13:'D',14:'E',15:'F',16:'G',17:'Å',18:'Æ',19:'Ã',20:'H'})[i],`${i} generic mana`,'#CDC9C2'];
  for(const pair of ['W/U','W/B','U/B','U/R','B/R','B/G','R/G','R/W','G/W','G/U',...['W','U','B','R','G'].flatMap(c=>[c+'/P','2/'+c])])symbols[pair]=[null,pair+' mana',null];
  const font=(t,size)=>`${t.italic?'italic ':''}${t.bold?'bold ':''}${size}px "${t.font}"`;
  function glyphText(c,glyph,x,y,size){c.font=`${size}px "ProxyGlyph"`;c.textAlign='left';c.textBaseline='alphabetic';const m=c.measureText(glyph);c.fillText(glyph,x-(m.actualBoundingBoxRight-m.actualBoundingBoxLeft)/2,y+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);}
  function symbol(c,key,x,y,size,color) {
    const [glyph,,background]=symbols[key];c.save();c.translate(x,y);
    const parts=key.split('/');
    if(parts.length===2) {
      c.beginPath();c.arc(size/2,size/2,size*.47,0,Math.PI*2);c.clip();
      c.fillStyle=symbols[parts[0]]?.[2]||'#CDC9C2';c.fillRect(0,0,size,size);
      c.fillStyle=symbols[parts[1]]?.[2]||'#CDC9C2';c.beginPath();c.moveTo(size,0);c.lineTo(size,size);c.lineTo(0,size);c.closePath();c.fill();
      c.fillStyle='#101010';glyphText(c,symbols[parts[0]][0],size*.3,size*.32,size*.57);glyphText(c,symbols[parts[1]][0],size*.72,size*.72,size*.57);
    } else {
      if(background){c.fillStyle=background;c.beginPath();c.arc(size/2,size/2,size*.47,0,Math.PI*2);c.fill();}
      c.fillStyle=background?'#101010':color;glyphText(c,glyph,size/2,size/2,size*(background ? .74 : .95));
    }
    c.restore();
  }
  function normalize(text,manaOnly=false) {
    // Recognize complete symbol-code runs, never the 'og' inside an ordinary word.
    return text.replace(/(^|[^A-Za-z0-9{])((?:o(?:\d{1,2}|[wWuUbBrRgGcCtTqQsSeExXpP]))+)(?![A-Za-z0-9}])/g,
      (_,prefix,codes)=>prefix+(!manaOnly&&['or','ox'].includes(codes)?codes:codes.replace(/o(\d{1,2}|[wWuUbBrRgGcCtTqQsSeExXpP])/g,(whole,key)=>symbols[key.toUpperCase()]?`{${key.toUpperCase()}}`:whole)));
  }
  function runs(text,manaOnly) {return normalize(text,manaOnly).split(/(\{[^{}]+\}|\n|[^\S\n]+)/).filter(Boolean).map(value=>{const key=value.startsWith('{')?value.slice(1,-1).toUpperCase():null;return symbols[key]?{key}:{text:value};});}
  function layout(c,t,size,w) {
    c.font=font(t,size);const lines=[[]];let used=0;
    const push=run=>{const width=run.key?size*1.06:c.measureText(run.text).width;if(used+width>w&&used>0){lines.push([]);used=0;if(run.text?.trim()==='')return;}lines.at(-1).push({...run,width});used+=width;};
    for(const run of runs(t.text,t.type==='mana')) {
      if(run.text==='\n'){lines.push([]);used=0;continue;}
      if(!run.key&&c.measureText(run.text).width>w){for(const char of run.text)push({text:char});}else push(run);
    }
    return lines;
  }
  function render(c,t,width,height) {
    const unit=width/756,x=t.x*width,y=t.y*height,w=(t.width??.8)*width,h=(t.height??.2)*height;
    let size=t.size*unit,lines=layout(c,t,size,w);const leading=t.line_height??1.15;
    if(t.autofit!==false)while(size>6*unit&&(lines.length*size*leading>h||lines.some(line=>line.reduce((a,b)=>a+b.width,0)>w))){size=Math.max(6*unit,size-.5*unit);lines=layout(c,t,size,w);}
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.font=font(t,size);c.fillStyle=t.color;c.textBaseline='top';c.textAlign='left';
    for(let i=0;i<lines.length;i++) {
      const line=lines[i],total=line.reduce((a,b)=>a+b.width,0);let left=x+(t.align==='right'?w-total:t.align==='center'?(w-total)/2:0);
      for(const run of line){if(run.key)symbol(c,run.key,left,y+i*size*leading,size,t.color);else c.fillText(run.text,left,y+i*size*leading);left+=run.width;}
    }
    c.restore();
  }
  function preset(key){return {type:key,text:'',font:fonts[1],size:32,x:.1,y:.4,width:.8,height:.15,bold:false,italic:false,align:'left',color:'#171717',line_height:1.15,autofit:true,...presets[key]};}
  async function ready(){await Promise.all(fonts.slice(0,4).map(name=>document.fonts.load(`32px "${name}"`)));await Promise.all(['italic','bold','bold italic'].map(style=>document.fonts.load(`${style} 32px "Plantin MT Pro"`)));}
  return {fonts,presets,symbols,preset,render,symbol,ready,normalize};
})();
