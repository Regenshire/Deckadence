// Reusable finishing masks: image analysis, optional AI masks, and touch-up tools.
(() => {
  "use strict";
  function brushStroke(context, from, to, size, shape = "round") {
    context.fillStyle = context.strokeStyle = "white";
    const half = size / 2;
    if (shape !== "square") {
      context.lineWidth = size; context.lineCap = context.lineJoin = "round";
      context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
      context.beginPath(); context.arc(to.x, to.y, half, 0, Math.PI * 2); context.fill(); return;
    }
    // Sweep an axis-aligned square continuously, even between sparse pointer events.
    const points = [from, to].flatMap(p => [[p.x-half,p.y-half],[p.x+half,p.y-half],[p.x+half,p.y+half],[p.x-half,p.y+half]])
      .sort((a,b) => a[0]-b[0] || a[1]-b[1]);
    const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
    const halfHull = sequence => {
      const hull = [];
      for (const p of sequence) {while (hull.length > 1 && cross(hull.at(-2),hull.at(-1),p) <= 0) hull.pop(); hull.push(p);}
      return hull.slice(0,-1);
    };
    const hull = halfHull(points).concat(halfHull([...points].reverse()));
    context.beginPath(); hull.forEach(([x,y],i) => i ? context.lineTo(x,y) : context.moveTo(x,y)); context.closePath(); context.fill();
  }
  // Separable box filter: linear work and bounded memory at print resolution.
  function soften(values, w, h, radius) {
    if (!radius) return values;
    const horizontal = new Float32Array(values.length), result = new Float32Array(values.length);
    const span = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += values[row + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        horizontal[row + x] = sum / span;
        sum += values[row + Math.min(w - 1, x + radius + 1)] - values[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += horizontal[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        result[y * w + x] = sum / span;
        sum += horizontal[Math.min(h - 1, y + radius + 1) * w + x] - horizontal[Math.max(0, y - radius) * w + x];
      }
    }
    return result;
  }
  // Sliding extrema keep outline adjustments linear even for large masks.
  function outline(values, w, h, radius, grow) {
    if (!radius) return values;
    function pass(input, vertical) {
      const result = new Uint8Array(input.length), length = vertical ? h : w, lines = vertical ? w : h;
      const samples = new Uint8Array(length + radius * 2), deque = new Int32Array(samples.length);
      const index = (line, position) => vertical ? position * w + line : line * w + position;
      for (let line = 0; line < lines; line++) {
        samples.fill(0);
        for (let p = 0; p < length; p++) samples[p + radius] = input[index(line, p)];
        let head = 0, tail = 0;
        for (let p = 0; p < samples.length; p++) {
          while (tail > head && (grow ? samples[deque[tail - 1]] <= samples[p] : samples[deque[tail - 1]] >= samples[p])) tail--;
          deque[tail++] = p;
          while (deque[head] < p - radius * 2) head++;
          if (p >= radius * 2) result[index(line, p - radius * 2)] = samples[deque[head]];
        }
      }
      return result;
    }
    return pass(pass(values, false), true);
  }
  function refineMask(source, expansion = 0, smoothing = 0, sharpening = 0) {
    const result = document.createElement("canvas"); result.width = source.width; result.height = source.height;
    const context = result.getContext("2d", {willReadFrequently: true}); context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, result.width, result.height), count = result.width * result.height;
    let alpha = new Uint8Array(count);
    for (let p = 0; p < count; p++) alpha[p] = pixels.data[p * 4 + 3];
    alpha = outline(alpha, result.width, result.height, Math.round(Math.abs(expansion)), expansion > 0);
    if (smoothing > 0) alpha = soften(alpha, result.width, result.height, Math.round(smoothing));
    if (sharpening > 0) {
      // Unsharp masking tightens transitions without converting partial coverage
      // into solid ink. Local limits prevent bright/dark halos around the edge.
      const radius = Math.max(1, Math.round(2 * result.width / 756));
      const samples = Uint8Array.from(alpha, value => Math.round(value));
      const low = outline(samples, result.width, result.height, radius, false);
      const high = outline(samples, result.width, result.height, radius, true);
      const blurred = soften(alpha, result.width, result.height, radius);
      const strength = Math.min(100, sharpening) / 100 * 4;
      for (let p = 0; p < count; p++) alpha[p] = Math.round(Math.max(low[p], Math.min(high[p], alpha[p] + strength * (alpha[p] - blurred[p]))));
    }
    for (let p = 0; p < count; p++) {
      pixels.data[p * 4] = pixels.data[p * 4 + 1] = pixels.data[p * 4 + 2] = 255;
      pixels.data[p * 4 + 3] = Math.round(alpha[p]);
    }
    context.putImageData(pixels, 0, 0); return result;
  }
  function removeSpeckles(alpha, eligible, w, h, minimum) {
    if (!minimum) return;
    const visited = new Uint8Array(alpha.length), queue = new Int32Array(alpha.length);
    for (let seed = 0; seed < alpha.length; seed++) {
      if (visited[seed] || !eligible[seed]) continue;
      const selected = alpha[seed] >= 128;
      let head = 0, tail = 1, boundary = false;
      queue[0] = seed; visited[seed] = 1;
      while (head < tail) {
        const p = queue[head++], x = p % w;
        if (!x || x === w - 1 || p < w || p >= w * (h - 1)) boundary = true;
        for (let direction = 0; direction < 4; direction++) {
          if ((!x && direction === 0) || (x === w - 1 && direction === 1)) continue;
          const n = p + (direction === 0 ? -1 : direction === 1 ? 1 : direction === 2 ? -w : w);
          if (n < 0 || n >= alpha.length) continue;
          if (!eligible[n]) {boundary = true; continue;}
          if (!visited[n] && (alpha[n] >= 128) === selected) {visited[n] = 1; queue[tail++] = n;}
        }
      }
      // Do not fill holes connected to the edge of the selected region.
      if (tail < minimum && (selected || !boundary)) {
        for (let i = 0; i < tail; i++) alpha[queue[i]] = selected ? 0 : 255;
      }
    }
  }
  function excludedColors(pixels, mode, color) {
    if (!["darker", "lighter"].includes(mode) || !/^#[0-9a-f]{6}$/i.test(color || "")) return null;
    const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
    const brightness = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
    const threshold = brightness(...rgb), excluded = new Uint8Array(pixels.length / 4);
    for (let p = 0; p < excluded.length; p++) {
      const i = p * 4;
      if (!pixels[i + 3]) continue;
      const value = brightness(pixels[i], pixels[i + 1], pixels[i + 2]);
      excluded[p] = mode === "darker" ? value <= threshold + 1e-7 : value >= threshold - 1e-7;
    }
    return excluded;
  }
  function removeExcluded(canvas, excluded) {
    if (!excluded) return canvas;
    const context = canvas.getContext("2d"), pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let p = 0; p < excluded.length; p++) if (excluded[p]) pixels.data[p * 4 + 3] = 0;
    context.putImageData(pixels, 0, 0);
    return canvas;
  }
  function excludeColors(source, mask, mode, color) {
    const result = document.createElement("canvas"); result.width = mask.width; result.height = mask.height;
    const context = result.getContext("2d", {willReadFrequently: true});
    context.drawImage(source, 0, 0, result.width, result.height);
    const excluded = excludedColors(context.getImageData(0, 0, result.width, result.height).data, mode, color);
    context.clearRect(0, 0, result.width, result.height); context.drawImage(mask, 0, 0);
    return removeExcluded(result, excluded);
  }
  // Sizes and center positions are percentages of the card; keep the box inside it.
  function artworkBounds(options = {}) {
    const number = (key, fallback, min, max) => {
      const value = Number(options[key] ?? fallback);
      return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback)) / 100;
    };
    const width = number('art_box_width', 88, 1, 100), height = number('art_box_height', 44, 1, 100);
    const left = Math.max(0, Math.min(1 - width, number('art_box_x', 50, 0, 100) - width / 2));
    const top = Math.max(0, Math.min(1 - height, number('art_box_y', 34, 0, 100) - height / 2));
    return [left, top, left + width, top + height].map(value => Math.round(value * 1e6) / 1e6);
  }
  function generate(source, options, width, height, foreground = null) {
    if (options.mode === "none") throw new Error("Automatic selection is off.");
    if (options.mode === "text") return semanticSelection(source, {...options, cleanup:"off"}, width, height, textRegions(source, options, width, height));
    if (["subject", "background"].includes(options.mode)) return semanticSelection(source, options, width, height, foreground);
    const {mode, region, amount} = options;
    const work = document.createElement("canvas");
    work.width = width; work.height = height;
    const context = work.getContext("2d", {willReadFrequently: true});
    context.drawImage(source, 0, 0, work.width, work.height);
    const pixels = context.getImageData(0, 0, work.width, work.height);
    const w = work.width, h = work.height, luminance = new Float32Array(w * h);
    for (let p = 0; p < luminance.length; p++) {
      const i = p * 4;
      luminance[p] = .2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2];
    }
    const bounds = region === "artwork" ? artworkBounds(options) : [0, 0, 1, 1];
    const eligible = new Uint8Array(w * h);
    let scores = new Float32Array(w * h), count = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (!pixels.data[i + 3]) continue;
      let score;
      if (mode === "colors") {
        const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2];
        score = Math.max(r, g, b) - Math.min(r, g, b);
      } else if (mode === "details") {
        const left = luminance[y * w + Math.max(0, x - 1)], right = luminance[y * w + Math.min(w - 1, x + 1)];
        const top = luminance[Math.max(0, y - 1) * w + x], bottom = luminance[Math.min(h - 1, y + 1) * w + x];
        score = Math.hypot(right - left, bottom - top);
      } else if (mode === "shadows") score = 255 - luminance[p];
      else if (mode === "artwork") score = 255;
      else score = luminance[p];
      scores[p] = score;
      if (x >= w * bounds[0] && y >= h * bounds[1] && x < w * bounds[2] && y < h * bounds[3]) {eligible[p] = 1; count++;}
    }
    const cleanup = options.cleanup || "balanced", scale = w / 756;
    const selectAll = mode === "artwork" || Number(amount) >= 100;
    const radius = cleanup === "off" || selectAll ? 0 : Math.max(1, Math.round(scale * (cleanup === "strong" ? 2.5 : 1)));
    scores = soften(scores, w, h, radius);
    // A histogram avoids sorting millions of boxed JavaScript numbers.
    const histogram = new Uint32Array(65536);
    const bin = value => Math.max(0, Math.min(65535, Math.round(value * 64)));
    for (let p = 0; p < scores.length; p++) if (eligible[p]) histogram[bin(scores[p])]++;
    const rank = Math.min(count - 1, Math.floor(count * (1 - amount / 100)));
    let total = 0, threshold = 255;
    for (let i = 0; i < histogram.length; i++) if ((total += histogram[i]) > rank) {threshold = i / 64; break;}
    const alpha = new Uint8Array(w * h);
    for (let p = 0; p < alpha.length; p++) if (eligible[p]) {
      const score = scores[p], matches = selectAll || (bin(score) >= bin(threshold) && score >= 2);
      let value = matches ? 255 : 0;
      if (radius && mode !== "artwork" && score >= 2) {
        const x = p % w;
        const gradient = Math.hypot(scores[p + (x < w - 1 ? 1 : 0)] - scores[p - (x > 0 ? 1 : 0)],
          scores[Math.min(scores.length - 1, p + w)] - scores[Math.max(0, p - w)]) / 2;
        if (gradient > .01) value = Math.round(255 * Math.max(0, Math.min(1, .5 + (score - threshold) / gradient)));
      }
      alpha[p] = value;
    }
    removeSpeckles(alpha, eligible, w, h, radius ? Math.max(2, Math.round((cleanup === "strong" ? 64 : 12) * scale * scale)) : 0);
    pixels.data.fill(0);
    for (let p = 0; p < alpha.length; p++) if (eligible[p]) {
      const i = p * 4;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = options.action === "opaque" ? 255 - alpha[p] : alpha[p];
    }
    context.putImageData(pixels, 0, 0);
    const result = document.createElement("canvas"); result.width = width; result.height = height;
    const output = result.getContext("2d"); output.imageSmoothingEnabled = true;
    output.drawImage(work, 0, 0, width, height);
    return finishSelection(source, result, options);
  }
  function semanticSelection(source, options, width, height, foreground) {
    if (!foreground) throw new Error("Detect a subject before applying this selection.");
    const result = document.createElement("canvas"); result.width = width; result.height = height;
    const context = result.getContext("2d", {willReadFrequently:true});
    context.drawImage(foreground, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height), alpha = new Uint8Array(width*height), eligible = new Uint8Array(alpha.length);
    context.clearRect(0,0,width,height); context.drawImage(source,0,0,width,height);
    const artwork = context.getImageData(0,0,width,height).data;
    const bounds = options.region === "artwork" ? artworkBounds(options) : [0,0,1,1];
    for (let p=0;p<alpha.length;p++) {
      const x=p%width, y=Math.floor(p/width);
      eligible[p] = artwork[p*4+3] > 0 && x>=width*bounds[0] && x<width*bounds[2] && y>=height*bounds[1] && y<height*bounds[3];
      alpha[p] = pixels.data[p*4+3];
    }
    const cleanup = options.cleanup || "balanced", scale=width/756;
    removeSpeckles(alpha,eligible,width,height,cleanup==="off" ? 0 : Math.round((cleanup==="strong"?64:12)*scale*scale));
    const inverse = (options.mode === "background") !== (options.action === "opaque");
    for (let p=0;p<alpha.length;p++) {
      pixels.data[p*4]=pixels.data[p*4+1]=pixels.data[p*4+2]=255;
      pixels.data[p*4+3]=eligible[p] ? (inverse ? 255-alpha[p] : alpha[p]) : 0;
    }
    context.putImageData(pixels,0,0);
    return finishSelection(source,result,options);
  }
  function finishSelection(source, result, options) {
    const width=result.width, height=result.height, output=result.getContext("2d");
    if (options.frame_mode && options.frame_mode !== "original") {
      const frame = frameSelection(source, options, width, height, options.frame_mask);
      if (!frame.found) throw new Error("No frame contours found. Preview the frame or leave Frame on Follow automatic selection.");
      applyRegion(result, frame.canvas, options.frame_mode);
    }
    if (options.text_mode && options.text_mode !== "original") {
      const textMask = textRegions(source, options, width, height);
      applyRegion(result, textMask, options.text_mode);
    }
    if (options.border_mode && options.border_mode !== "original") {
      const border = document.createElement("canvas"); border.width = width; border.height = height;
      const bc = border.getContext("2d"), size = width * (options.border_width ?? 2) / 100;
      bc.fillStyle = "white"; bc.fillRect(0, 0, width, height);
      bc.clearRect(size, size, width - size * 2, height - size * 2);
      applyRegion(result, border, options.border_mode);
    }
    output.globalCompositeOperation = "destination-in";
    output.fillStyle = `rgba(255,255,255,${(options.coverage || 100) / 100})`;
    output.fillRect(0, 0, width, height); output.globalCompositeOperation = "source-over";
    return result;
  }
  function applyRegion(canvas, region, mode) {
    if (!mode || mode === "original") return;
    const context = canvas.getContext("2d");
    context.globalCompositeOperation = mode === "opaque" ? "destination-out" : "source-over";
    context.drawImage(region, 0, 0); context.globalCompositeOperation = "source-over";
  }
  function frameSelection(source, options, width, height, detected = null) {
    const result=document.createElement("canvas"); result.width=width; result.height=height;
    if(!detected) return {canvas:result,found:false};
    const output=result.getContext("2d",{willReadFrequently:true});
    output.imageSmoothingQuality="high";output.drawImage(detected,0,0,width,height);
    const pixels=output.getImageData(0,0,width,height).data;
    let found=false;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i]){found=true;break;}
    return {canvas:result,found};
  }
  function textRegions(source, options, width, height) {
    const result = document.createElement("canvas"); result.width = width; result.height = height;
    const output = result.getContext("2d"); output.fillStyle = "white";
    const standard = [[.06,.035,.94,.125],[.06,.565,.94,.635],[.07,.64,.93,.89],[.02,.92,.98,.99]];
    const regions = options.text_source === "detected" ? (options.text_regions || [])
      : standard.map(([l,t,r,b])=>[[l,t],[r,t],[r,b],[l,b]]);
    for (const region of regions) {
      output.beginPath(); region.forEach(([x,y],i)=>i ? output.lineTo(x*width,y*height) : output.moveTo(x*width,y*height)); output.closePath(); output.fill();
    }
    const refine = () => {
      // Mana pips are complete printed symbols: protect both their circular
      // background and internal glyph, irrespective of light/dark text ink.
      if(options.text_source === "detected")for(const symbol of options.text_symbols||[]){
        const xs=symbol.map(p=>p[0]*width),ys=symbol.map(p=>p[1]*height);
        const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
        output.fillStyle="white";output.beginPath();output.ellipse((left+right)/2,(top+bottom)/2,(right-left)/2,(bottom-top)/2,0,0,2*Math.PI);output.fill();
      }
      return refineMask(result, (options.text_expand || 0) * width / 756, (options.text_smooth || 0) * width / 756);
    };
    if (options.text_detail !== "letters" || !regions.length) return refine();
    const art = document.createElement("canvas"); art.width = width; art.height = height;
    const ac = art.getContext("2d", {willReadFrequently:true}); ac.drawImage(source,0,0,width,height);
    const pixels = ac.getImageData(0,0,width,height).data, selected = output.getImageData(0,0,width,height);
    const keep = new Uint8Array(width*height);
    const local = document.createElement("canvas");
    const luminance = p => .2126*pixels[p*4]+.7152*pixels[p*4+1]+.0722*pixels[p*4+2];
    for (const region of regions) {
      const points=region.map(([x,y])=>[x*width,y*height]);
      const lengths=points.map((p,i)=>Math.hypot(p[0]-points[(i+1)%4][0],p[1]-points[(i+1)%4][1]));
      const lineHeight=Math.max(3,Math.min(...lengths));
      // OCR outlines often graze serifs and italic strokes. Resolve complete
      // glyphs in a small padded search area instead of deleting edge letters.
      const padding=options.text_source==="detected"?Math.max(width/756,lineHeight*.18):0;
      const padded=points.map((p,i)=>{
        const previous=points[(i+3)%4],next=points[(i+1)%4];
        const a=Math.max(1,lengths[(i+3)%4]),b=Math.max(1,lengths[i]);
        return [p[0]+padding*((p[0]-previous[0])/a+(p[0]-next[0])/b),p[1]+padding*((p[1]-previous[1])/a+(p[1]-next[1])/b)];
      });
      const l=Math.max(0,Math.floor(Math.min(...padded.map(p=>p[0])))),r=Math.min(width-1,Math.ceil(Math.max(...padded.map(p=>p[0]))));
      const t=Math.max(0,Math.floor(Math.min(...padded.map(p=>p[1])))),b=Math.min(height-1,Math.ceil(Math.max(...padded.map(p=>p[1]))));
      const w=r-l+1,h=b-t+1;if(w<=0||h<=0)continue;
      local.width=w;local.height=h;
      const lc=local.getContext("2d",{willReadFrequently:true});lc.fillStyle="white";lc.beginPath();
      padded.forEach(([x,y],i)=>i?lc.lineTo(x-l,y-t):lc.moveTo(x-l,y-t));lc.closePath();lc.fill();
      const clip=lc.getImageData(0,0,w,h).data,histogram=new Uint32Array(256),edgeHistogram=new Uint32Array(256);
      const inside=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&clip[(y*w+x)*4+3]>0;
      let count=0,total=0,edgeCount=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(clip[(y*w+x)*4+3]&&pixels[((y+t)*width+x+l)*4+3]){
        const value=Math.round(luminance((y+t)*width+x+l));histogram[value]++;count++;total+=value;
        if(!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1)){edgeHistogram[value]++;edgeCount++;}
      }
      if(!count)continue;
      const percentile=q=>{let sum=0;for(let i=0;i<256;i++){sum+=histogram[i];if(sum>=count*q)return i;}return 255;};
      const low=percentile(.01),high=percentile(.99),median=percentile(.5);
      if(high-low<25)continue;
      let below=0,weight=0,best=-1,split=median;
      for(let i=0;i<255;i++){
        weight+=histogram[i];below+=i*histogram[i];if(!weight||weight===count)continue;
        const difference=below/weight-(total-below)/(count-weight),score=weight*(count-weight)*difference*difference;
        if(score>best){best=score;split=i;}
      }
      const light=options.text_ink==="light"||(options.text_ink!=="dark"&&median<=split);
      const threshold=light?Math.max(split,high-55):Math.min(split,low+55);
      const strong=light?Math.min(high,Math.max(threshold+8,high-20)):Math.max(low,Math.min(threshold-8,low+20));
      let edgeMode=0;for(let i=1;i<256;i++)if(edgeHistogram[i]>edgeHistogram[edgeMode])edgeMode=i;
      let uniform=0;for(let i=Math.max(0,edgeMode-8);i<=Math.min(255,edgeMode+8);i++)uniform+=edgeHistogram[i];
      // A flat mid-tone surface can carry light and dark ink in the same box.
      const both=options.text_ink!=="light"&&options.text_ink!=="dark"&&uniform>edgeCount*.85&&edgeMode-low>35&&high-edgeMode>35;
      const candidates=new Uint8Array(w*h),cores=new Uint8Array(w*h),smallInk=new Uint8Array(w*h);
      // Small antialiased dots may never reach the full ink color. Keep a
      // softer candidate map for punctuation only, not for whole letter bodies.
      const smallThreshold=light?Math.min(threshold,median+(high-median)*.28):Math.max(threshold,median-(median-low)*.28);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=y*w+x,alpha=clip[p*4+3],index=(y+t)*width+x+l;if(!alpha||!pixels[index*4+3])continue;
        const value=luminance(index);
        if(both?Math.abs(value-edgeMode)>30:light?value>threshold:value<=threshold)candidates[p]=Math.min(alpha,pixels[index*4+3]);
        if(both?Math.abs(value-edgeMode)>50:light?value>=strong:value<=strong)cores[p]=1;
        if(both?Math.abs(value-edgeMode)>20:light?value>smallThreshold:value<smallThreshold)smallInk[p]=Math.min(alpha,pixels[index*4+3]);
      }
      const queue=new Int32Array(w*h);
      function connected(values){
       const visited=new Uint8Array(w*h),components=[];
       for(let p=0;p<values.length;p++)if(values[p]&&!visited[p]){
        let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0,core=0,ink=0;queue[0]=p;visited[p]=1;
        while(head<tail){
          const index=queue[head++],x=index%w,y=Math.floor(index/w);core+=cores[index];ink+=Number(candidates[index]>0);
          minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
            const nx=x+dx,ny=y+dy,n=ny*w+nx;
            if(nx>=0&&nx<w&&ny>=0&&ny<h&&!visited[n]&&values[n]){visited[n]=1;queue[tail++]=n;}
          }
        }
        const cw=maxX-minX+1,ch=maxY-minY+1;
        // Panel rules and large connected pieces of background are not ink.
        if(tail>count*.65||(cw>lineHeight*2.5&&ch<lineHeight*.2))continue;
        components.push({pixels:queue.slice(0,tail),minX,minY,maxX,maxY,cw,ch,area:tail,core,ink});
       }
       return components;
      }
      const components=connected(candidates),smallComponents=connected(smallInk);
      // Standard layout boxes contain several lines, so their box height is
      // not a font size. Estimate stroke height from substantial components.
      const heights=smallComponents.filter(c=>c.area>=4&&c.ch>=3).map(c=>c.ch).sort((a,b)=>a-b);
      const glyphHeight=Math.min(lineHeight,(heights[Math.floor(heights.length*.75)]||lineHeight)*1.4);
      const minimum=Math.max(2,Math.round(glyphHeight*glyphHeight*.018));
      // Use complete antialiased stems for punctuation context. A thin stem
      // need not contain a pixel as dark/bright as the largest letter strokes.
      const bodies=smallComponents.filter(c=>c.area>=minimum&&c.ch>=glyphHeight*.4);
      const compact=smallComponents.filter(c=>c.cw<=glyphHeight*.45&&c.ch<=glyphHeight*.55&&c.area/(c.cw*c.ch)>=.25);
      const contexts=new Map();
      const context=c=>{
        if(contexts.has(c))return contexts.get(c);
        // A layout region can contain several lines. Associate punctuation
        // with its own row rather than one baseline for the entire region.
        const row=bodies.filter(body=>body.maxY>=c.minY-glyphHeight*.25&&body.maxY<=c.maxY+glyphHeight*1.1);
        const baselines=row.map(body=>body.maxY).sort((a,b)=>a-b);
        const value={baseline:baselines[Math.floor(baselines.length*.5)],
          first:Math.min(...row.map(body=>body.minX)),last:Math.max(...row.map(body=>body.maxX))};
        contexts.set(c,value);return value;
      };
      const inLine=c=>c.maxX>=context(c).first-glyphHeight*.3&&c.minX<=context(c).last+glyphHeight*.7;
      const atBaseline=c=>inLine(c)&&Math.abs(c.maxY-context(c).baseline)<=glyphHeight*.25;
      const aboveLetter=c=>bodies.some(body=>{
        const gapX=Math.max(0,body.minX-c.maxX,c.minX-body.maxX),gapY=body.minY-c.maxY;
        // Italic dots sit to the right of their stems, not directly above them.
        return gapX<=glyphHeight*.25&&gapY>0&&gapY<=glyphHeight*.5&&c.ch<=glyphHeight*.3;
      });
      const aboveJoinedStem=c=>{
        if(c.ch>glyphHeight*.3||!inLine(c))return false;
        const {baseline}=context(c);
        // A neighboring capital may share the stem's component, so its box
        // starts at cap height. Inspect ink below the dot instead of assuming
        // the entire component begins below it.
        const start=Math.max(c.maxY+1,Math.floor(baseline-glyphHeight*.6));
        const end=Math.min(h-1,Math.ceil(baseline));
        if(baseline-c.maxY<glyphHeight*.35||baseline-c.maxY>glyphHeight*1.1)return false;
        let rows=0;
        for(let y=start;y<=end;y++){
          const left=Math.max(0,Math.floor(c.minX-glyphHeight*.2)),right=Math.min(w-1,Math.ceil(c.maxX));
          for(let x=left;x<=right;x++)if(smallInk[y*w+x]){rows++;break;}
        }
        return rows>=glyphHeight*.35;
      };
      const pairedDot=c=>inLine(c)&&compact.some(other=>{
        if(other===c)return false;
        const dx=Math.abs((c.minX+c.maxX-other.minX-other.maxX)/2);
        const dy=Math.abs((c.minY+c.maxY-other.minY-other.maxY)/2);
        return dx<=glyphHeight*.3&&dy>=glyphHeight*.15&&dy<=glyphHeight*.75
          &&Math.max(c.area,other.area)<=Math.min(c.area,other.area)*12
          &&(atBaseline(c)||atBaseline(other));
      });
      for(const component of components){
        const accept=component.core&&component.area>=minimum;
        if(accept)for(const index of component.pixels){const p=(Math.floor(index/w)+t)*width+index%w+l;keep[p]=Math.max(keep[p],candidates[index]);}
      }
      // At small sizes a dot can join the next serif or the preceding italic
      // descender. Recover that complete glyph only when it has a substantial
      // ink core and stays within letter-sized bounds, not a background patch.
      for(const component of bodies)if((component.core&&component.ink>=component.area*.3
        &&component.ch<=glyphHeight*1.25&&component.cw<=glyphHeight*1.5)
        ||(component.cw<=glyphHeight*.35&&component.ch<=glyphHeight&&compact.some(dot=>
          atBaseline(dot)&&dot.minY>component.maxY&&dot.minY-component.maxY<=glyphHeight*.35
          &&Math.abs((dot.minX+dot.maxX-component.minX-component.maxX)/2)<=glyphHeight*.25))){
        for(const index of component.pixels){const p=(Math.floor(index/w)+t)*width+index%w+l;keep[p]=Math.max(keep[p],smallInk[index]);}
      }
      for(const component of compact)if(atBaseline(component)||aboveLetter(component)||aboveJoinedStem(component)||pairedDot(component)){
        for(const index of component.pixels){const p=(Math.floor(index/w)+t)*width+index%w+l;keep[p]=Math.max(keep[p],smallInk[index]);}
      }
    }
    for(let p=0;p<keep.length;p++)selected.data[p*4+3]=keep[p];
    output.putImageData(selected,0,0);return refine();
  }
  const hexColor = rgb => "#" + Array.from(rgb, value => Math.round(value).toString(16).padStart(2, "0")).join("").toUpperCase();
  function sampleColor(source, x, y, width, height) {
    const sample = document.createElement("canvas"); sample.width = sample.height = 1;
    const context = sample.getContext("2d"), sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    x = Math.max(0, Math.min(width - 1, Math.floor(x))); y = Math.max(0, Math.min(height - 1, Math.floor(y)));
    context.drawImage(source, x * sw / width, y * sh / height, sw / width, sh / height, 0, 0, 1, 1);
    return hexColor(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }
  function artworkPalette(source) {
    // Small sampling is only for swatches; actual selections use the full mask resolution.
    const sample = document.createElement("canvas"); sample.width = 96; sample.height = 134;
    const context = sample.getContext("2d"); context.drawImage(source, 0, 0, sample.width, sample.height);
    const data = context.getImageData(0, 0, sample.width, sample.height).data, buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = (data[i] >> 4) * 256 + (data[i+1] >> 4) * 16 + (data[i+2] >> 4);
      const bucket = buckets.get(key) || [0, 0, 0, 0];
      bucket[0]++; for (let c = 0; c < 3; c++) bucket[c + 1] += data[i + c];
      buckets.set(key, bucket);
    }
    const colors = [];
    for (const bucket of [...buckets.values()].sort((a, b) => b[0] - a[0])) {
      const rgb = bucket.slice(1).map(value => value / bucket[0]);
      if (colors.every(other => Math.hypot(...rgb.map((value, i) => value - other[i])) > 36)) colors.push(rgb);
      if (colors.length === 8) break;
    }
    return colors.map(hexColor);
  }
  function colorSelection(source, x, y, tolerance, connected, width, height, selectedColor = null) {
    const result=document.createElement("canvas");result.width=width;result.height=height;
    const context=result.getContext("2d",{willReadFrequently:true});context.drawImage(source,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height), data=pixels.data;
    x=Math.max(0,Math.min(width-1,Math.floor(x)));y=Math.max(0,Math.min(height-1,Math.floor(y)));
    const seed=y*width+x, rgb=selectedColor ? selectedColor.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)) : Array.from(data.slice(seed*4,seed*4+3));
    const selected=new Uint8Array(width*height), visited=new Uint8Array(width*height);
    const matches=p=>data[p*4+3]>0 && Math.hypot(data[p*4]-rgb[0],data[p*4+1]-rgb[1],data[p*4+2]-rgb[2])/Math.sqrt(3)<=tolerance;
    if(connected){
      const queue=new Int32Array(width*height);let head=0,tail=1;queue[0]=seed;visited[seed]=1;
      while(head<tail){const p=queue[head++];if(!matches(p))continue;selected[p]=1;
        const neighbors=[];if(p%width)neighbors.push(p-1);if(p%width<width-1)neighbors.push(p+1);if(p>=width)neighbors.push(p-width);if(p<width*(height-1))neighbors.push(p+width);
        for(const n of neighbors)if(!visited[n]){visited[n]=1;queue[tail++]=n;}
      }
    }else for(let p=0;p<selected.length;p++)selected[p]=matches(p)?1:0;
    for(let p=0;p<selected.length;p++){const i=p*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=selected[p]*255;}
    context.putImageData(pixels,0,0);return result;
  }
  function cleanPockets(source, maximum, target = "both") {
    const result = document.createElement("canvas");
    result.width = source.width; result.height = source.height;
    const context = result.getContext("2d", {willReadFrequently: true});
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, result.width, result.height);
    const data = pixels.data, w = result.width, h = result.height, count = w * h;
    const visited = new Uint8Array(count), queue = new Int32Array(count);
    const limit = Math.max(1, Math.floor(maximum));
    let removed = 0, filled = 0, changed = 0;
    // Remove islands first, then find holes again. A hole inside a removed
    // little ring must join the background, not become a new foil island.
    for (const foil of [true, false]) {
      if ((foil && target === "holes") || (!foil && target === "foil")) continue;
      visited.fill(0);
      for (let seed = 0; seed < count; seed++) {
        if (visited[seed] || (data[seed * 4 + 3] > 0) !== foil) continue;
        let head = 0, tail = 1, boundary = false, surrounding = 0;
        queue[0] = seed; visited[seed] = 1;
        while (head < tail) {
          const p = queue[head++], x = p % w, y = Math.floor(p / w);
          if (!x || x === w - 1 || !y || y === h - 1) boundary = true;
          // Diagonal connections count, so fine diagonal lines are retained.
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
            const n = p + dy * w + dx, alpha = data[n * 4 + 3];
            if ((alpha > 0) !== foil) {surrounding = Math.max(surrounding, alpha); continue;}
            if (!visited[n]) {visited[n] = 1; queue[tail++] = n;}
          }
        }
        if (!boundary && tail <= limit) {
          for (let i = 0; i < tail; i++) data[queue[i] * 4 + 3] = foil ? 0 : surrounding;
          if (foil) removed++; else filled++;
          changed += tail;
        }
      }
    }
    // Imported masks can have black RGB in transparent areas. Filled holes
    // must become white coverage pixels for the existing foil preview.
    for (let p = 0; p < count; p++) data[p*4] = data[p*4+1] = data[p*4+2] = 255;
    context.putImageData(pixels, 0, 0);
    return {canvas: result, removed, filled, changed};
  }
  function readMask(source, channel, width, height) {
    const native = document.createElement("canvas");
    native.width = source.naturalWidth || source.width; native.height = source.naturalHeight || source.height;
    const context = native.getContext("2d", {willReadFrequently: true});
    context.drawImage(source, 0, 0);
    const pixels = context.getImageData(0, 0, native.width, native.height);
    if (channel === "auto") {
      channel = "brightness";
      // Detect transparency before scaling: a tiny transparent feature may
      // disappear when a large mask is reduced to the supported print size.
      for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] < 255) {channel = "alpha"; break;}
    }
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = channel === "alpha" ? pixels.data[i + 3]
        : Math.round((.2126 * pixels.data[i] + .7152 * pixels.data[i + 1] + .0722 * pixels.data[i + 2]) * pixels.data[i + 3] / 255);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255; pixels.data[i + 3] = value;
    }
    context.putImageData(pixels, 0, 0);
    const result = document.createElement("canvas"); result.width = width; result.height = height;
    const output = result.getContext("2d"); output.imageSmoothingEnabled = true; output.imageSmoothingQuality = "high";
    output.drawImage(native, 0, 0, width, height);
    return {canvas: result, channel};
  }
  window.DeckadenceSpotSelection = {artworkBounds, generate, excludeColors, textRegions, colorSelection, cleanPockets, refineMask, sampleColor, artworkPalette, readMask, brushStroke, frameSelection};
})();
