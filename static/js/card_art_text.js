// Card-coordinate text presets and ProxyGlyph symbols shared by preview and saved pixels.
window.DeckadenceArtText = (() => {
  const fonts=['Beleren Proxy','Plantin MT Pro','Beleren Small Caps','ProxyGlyph','LCARSGTJ2','LCARSGTJ3','Georgia','Arial','Times New Roman','Courier New'];
  const presets={
    title:{label:'Card title',font:fonts[0],size:40,x:.085,y:.059,width:.65,height:.05,bold:true},
    mana:{label:'Mana cost',font:fonts[3],size:38,x:.74,y:.058,width:.175,height:.047,align:'right'},
    type:{label:'Type line',font:fonts[0],size:34,x:.085,y:.573,width:.78,height:.042,bold:true},
    rules:{label:'Rules text',font:fonts[1],size:37,x:.085,y:.634,width:.83,height:.20,line_height:1,paragraph_spacing:0},
    flavor:{label:'Flavor text',font:fonts[1],size:34,x:.085,y:.844,width:.83,height:.075,italic:true,line_height:1.02},
    artist:{label:'Artist credit',font:fonts[2],size:15,x:.07,y:.947,width:.7,height:.022,text:'{ARTIST} Artist name',color:'#FFFFFF'},
    legal:{label:'Bottom / legal text',font:fonts[2],size:12,x:.07,y:.973,width:.86,height:.018,color:'#FFFFFF'},
    power:{label:'Power / toughness',font:fonts[1],size:40,x:.802,y:.900,width:.12,height:.043,align:'center'},
    custom:{label:'Custom text',font:fonts[1],size:32,x:.1,y:.45,width:.8,height:.15}
  };
  const symbols={W:['w','White','#F8F0D8'],U:['u','Blue','#A8D5EA'],B:['b','Black','#B9B1B1'],R:['r','Red','#E9A18D'],G:['g','Green','#A8C4AD'],C:['c','Colorless','#CDC9C2'],T:['t','Tap','#CDC9C2'],Q:['l','Untap','#FFFFFF'],S:['s','Snow','#E2E4E4'],E:['e','Energy',null],X:['X','Variable mana','#CDC9C2'],P:['p','Phyrexian','#CDC9C2'],CHAOS:['?','Chaos',null],ARTIST:['a','Artist',null]};
  for(let i=0;i<=20;i++)symbols[String(i)]=[i<10?String(i):({10:'A',11:'B',12:'C',13:'D',14:'E',15:'F',16:'G',17:'Å',18:'Æ',19:'Ã',20:'H'})[i],`${i} generic mana`,'#CDC9C2'];
  for(const pair of ['W/U','W/B','U/B','U/R','B/R','B/G','R/G','R/W','G/W','G/U',...['W','U','B','R','G'].flatMap(c=>[c+'/P','2/'+c])])symbols[pair]=[null,pair+' mana',null];
  const font=(t,size)=>`${t.italic?'italic ':''}${t.bold?'bold ':''}${size}px "${t.font}"`;
  function glyphText(c,glyph,x,y,size){c.font=`${size}px "ProxyGlyph"`;c.textAlign='left';c.textBaseline='alphabetic';let m=c.measureText(glyph);const extent=Math.max(m.actualBoundingBoxLeft+m.actualBoundingBoxRight,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);if(extent>0){c.font=`${size*size/extent}px "ProxyGlyph"`;m=c.measureText(glyph);}c.fillText(glyph,x+(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,y+(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);}
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
  function characterStyles(t) {
    const base={bold:Boolean(t.bold),italic:Boolean(t.italic)},styles=Array(t.text.length).fill(base);
    for(const span of t.styles||[])for(let i=Math.max(0,span.start);i<Math.min(styles.length,span.end);i++)styles[i]={bold:span.bold,italic:span.italic};
    return styles;
  }
  function compactStyles(t,styles) {
    const spans=[];
    for(let start=0;start<styles.length;){let end=start+1;const style=styles[start];
      while(end<styles.length&&styles[end].bold===style.bold&&styles[end].italic===style.italic)end++;
      if(style.bold!==Boolean(t.bold)||style.italic!==Boolean(t.italic))spans.push({start,end,...style});start=end;
    }
    return spans;
  }
  function formatRange(t,start,end,key,value) {
    const styles=characterStyles(t),whole=start===end,next={...t};
    if(whole){next[key]=value;start=0;end=styles.length;}
    for(let i=start;i<end;i++)styles[i]={...styles[i],[key]:value};
    return {...next,styles:compactStyles(next,styles)};
  }
  function editText(t,text,range=null) {
    if(t.text===text)return t;
    const previous=t.text,styles=characterStyles(t);let start=range?.start,end=range?.end;
    // beforeinput supplies the exact replacement range, including repeated words.
    // Fall back to a common prefix/suffix for native undo and programmatic edits.
    if(!Number.isInteger(start)||!Number.isInteger(end)||text.length<previous.length-(end-start)||text.slice(0,start)!==previous.slice(0,start)||text.slice(text.length-(previous.length-end))!==previous.slice(end)){
      start=0;while(start<previous.length&&start<text.length&&previous[start]===text[start])start++;
      let suffix=0;while(suffix<previous.length-start&&suffix<text.length-start&&previous[previous.length-1-suffix]===text[text.length-1-suffix])suffix++;
      end=previous.length-suffix;
    }
    const inserted=text.length-(previous.length-(end-start));
    const inherited=styles[start<end?start:Math.max(0,start-1)]||{bold:Boolean(t.bold),italic:Boolean(t.italic)};
    const updated=[...styles.slice(0,start),...Array(inserted).fill(inherited),...styles.slice(end)],next={...t,text};
    return {...next,styles:compactStyles(next,updated)};
  }
  function normalize(text,manaOnly=false,offsets=null) {
    // Keep source offsets when symbol shorthand expands, so formatting continues
    // to refer to the textarea's UTF-16 positions rather than rendered glyphs.
    let result='',end=0;
    const append=(value,start,atomic=false)=>{result+=value;if(offsets)for(let i=0;i<value.length;i++)offsets.push(start+(atomic?0:i));};
    const pattern=/(^|[^A-Za-z0-9{])((?:o(?:\d{1,2}|[wWuUbBrRgGcCtTqQsSeExXpP]))+)(?![A-Za-z0-9}])/g;
    for(const match of text.matchAll(pattern)){
      const start=match.index+match[1].length,codes=match[2];append(text.slice(end,start),end);
      if(!manaOnly&&['or','ox'].includes(codes))append(codes,start);
      else for(const code of codes.matchAll(/o(\d{1,2}|[wWuUbBrRgGcCtTqQsSeExXpP])/g)){
        const key=code[1].toUpperCase();append(symbols[key]?`{${key}}`:code[0],start+code.index,Boolean(symbols[key]));
      }
      end=match.index+match[0].length;
    }
    append(text.slice(end),end);return result;
  }
  function runs(t) {
    const offsets=[],styles=characterStyles(t),text=normalize(t.text,t.type==='mana',offsets);let offset=0;
    return text.split(/(\{[^{}]+\}|\n|[^\S\n]+)/).filter(Boolean).map(value=>{
      const key=value.startsWith('{')?value.slice(1,-1).toUpperCase():null,parts=[];
      if(symbols[key])parts.push({key,...styles[offsets[offset]]});
      else for(let i=0;i<value.length;i++){
        const style=styles[offsets[offset+i]],last=parts.at(-1);
        if(last&&last.bold===style.bold&&last.italic===style.italic)last.text+=value[i];else parts.push({text:value[i],...style});
      }
      offset+=value.length;return {value,parts};
    });
  }
  function layout(c,t,size,w) {
    const lines=[[]];let used=0;
    const sized=run=>{c.font=font({...t,...run},size);return {...run,width:run.key?size*1.06:c.measureText(run.text).width};};
    const push=run=>{const part=sized(run);if(used+part.width>w&&used>0){lines.push([]);used=0;if(part.text?.trim()==='')return;}lines.at(-1).push(part);used+=part.width;};
    for(const token of runs(t)) {
      if(token.value==='\n'){const line=[];line.paragraphStart=true;lines.push(line);used=0;continue;}
      const parts=token.parts.map(sized),width=parts.reduce((sum,part)=>sum+part.width,0);
      if(width>w){for(const part of parts){if(part.key)push(part);else for(const char of part.text)push({...part,text:char});}}
      else {if(used+width>w&&used>0){lines.push([]);used=0;if(token.value.trim()==='')continue;}lines.at(-1).push(...parts);used+=width;}
    }
    // Trailing spaces affect alignment measurements but should not shift ink.
    for(const line of lines)while(line.length&&line.at(-1).text?.trim()==='')line.pop();
    return lines;
  }
  const textHeight=(lines,size,t)=>lines.length*size*(t.line_height??1.15)+lines.filter(line=>line.paragraphStart).length*size*(t.paragraph_spacing??0);
  function measure(c,t,width,height){const unit=width/756,w=t.width*width,h=t.height*height;let size=t.size*unit,lines=layout(c,t,size,w);if(t.autofit!==false)while(size>6*unit&&(textHeight(lines,size,t)>h||lines.some(line=>line.reduce((a,b)=>a+b.width,0)>w))){size=Math.max(6*unit,size-.5*unit);lines=layout(c,t,size,w);}return {size,lines,height:textHeight(lines,size,t),overflow:textHeight(lines,size,t)>h+.5||lines.some(line=>line.reduce((a,b)=>a+b.width,0)>w+.5)};}
  function render(c,t,width,height) {
    const unit=width/756,x=t.x*width,y=t.y*height,w=(t.width??.8)*width,h=(t.height??.2)*height;
    const {size,lines}=measure(c,t,width,height),leading=t.line_height??1.15;let top=y;
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.font=font(t,size);c.fillStyle=t.color;c.textBaseline='top';c.textAlign='left';
    for(let i=0;i<lines.length;i++) {
      const line=lines[i],total=line.reduce((a,b)=>a+b.width,0);let left=x+(t.align==='right'?w-total:t.align==='center'?(w-total)/2:0);
      if(line.paragraphStart)top+=size*(t.paragraph_spacing??0);
      for(const run of line){if(run.key)symbol(c,run.key,left,top,size,t.color);else {c.font=font({...t,...run},size);c.fillText(run.text,left,top);}left+=run.width;}top+=size*leading;
    }
    c.restore();
  }
  function preset(key){return {type:key,text:'',font:fonts[1],size:32,x:.1,y:.4,width:.8,height:.15,bold:false,italic:false,align:'left',color:'#171717',line_height:1.15,paragraph_spacing:0,autofit:true,...presets[key]};}
  async function ready(){await Promise.all(fonts.slice(0,6).map(name=>document.fonts.load(`32px "${name}"`)));await Promise.all(['italic','bold','bold italic'].map(style=>document.fonts.load(`${style} 32px "Plantin MT Pro"`)));}
  return {fonts,presets,symbols,preset,render,measure,symbol,ready,normalize,characterStyles,formatRange,editText};
})();
