// Local image-analysis selections. These modes do not require an AI model.
(() => {
  "use strict";
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
  function generate(source, options, width, height) {
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
    const bounds = region === "artwork" ? [.08, .13, .92, .56] : [0, 0, 1, 1];
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
    const radius = cleanup === "off" || mode === "artwork" ? 0 : Math.max(1, Math.round(scale * (cleanup === "strong" ? 2.5 : 1)));
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
      const score = scores[p], matches = mode === "artwork" || (bin(score) >= bin(threshold) && score >= 2);
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
  function textRegions(source, options, width, height) {
    const result = document.createElement("canvas"); result.width = width; result.height = height;
    const output = result.getContext("2d"); output.fillStyle = "white";
    const standard = [[.06,.035,.94,.125],[.06,.565,.94,.635],[.07,.64,.93,.89],[.02,.92,.98,.99]];
    const regions = options.text_source === "detected" ? (options.text_regions || [])
      : standard.map(([l,t,r,b])=>[[l,t],[r,t],[r,b],[l,b]]);
    for (const region of regions) {
      output.beginPath(); region.forEach(([x,y],i)=>i ? output.lineTo(x*width,y*height) : output.moveTo(x*width,y*height)); output.closePath(); output.fill();
    }
    if (options.text_detail !== "letters" || !regions.length) return result;
    const art = document.createElement("canvas"); art.width = width; art.height = height;
    const ac = art.getContext("2d", {willReadFrequently:true}); ac.drawImage(source,0,0,width,height);
    const pixels = ac.getImageData(0,0,width,height).data, selected = output.getImageData(0,0,width,height);
    const keep = new Uint8Array(width*height);
    // Estimate the local background from each region's perimeter. This is a
    // reviewable contrast selection, not a claim to perfectly segment glyphs.
    for (const region of regions) {
      const xs=region.map(p=>p[0]*width), ys=region.map(p=>p[1]*height);
      const l=Math.max(0,Math.floor(Math.min(...xs))), r=Math.min(width-1,Math.ceil(Math.max(...xs)));
      const t=Math.max(0,Math.floor(Math.min(...ys))), b=Math.min(height-1,Math.ceil(Math.max(...ys)));
      const buckets=new Map();
      for(let y=t;y<=b;y++)for(let x=l;x<=r;x++) {
        if(x>l+2 && x<r-2 && y>t+2 && y<b-2)continue;
        const i=(y*width+x)*4, key=(pixels[i]>>5)*64+(pixels[i+1]>>5)*8+(pixels[i+2]>>5);
        const bin=buckets.get(key)||[0,0,0,0];bin[0]++;bin[1]+=pixels[i];bin[2]+=pixels[i+1];bin[3]+=pixels[i+2];buckets.set(key,bin);
      }
      const bg=[...buckets.values()].sort((a,b)=>b[0]-a[0])[0];if(!bg)continue;
      for(let y=t;y<=b;y++)for(let x=l;x<=r;x++) {
        const p=y*width+x,i=p*4;
        if(selected.data[i+3] && Math.hypot(pixels[i]-bg[1]/bg[0],pixels[i+1]-bg[2]/bg[0],pixels[i+2]-bg[3]/bg[0])>60)keep[p]=1;
      }
    }
    for(let p=0;p<keep.length;p++)if(!keep[p])selected.data[p*4+3]=0;
    output.putImageData(selected,0,0);return result;
  }
  function colorSelection(source, x, y, tolerance, connected, width, height) {
    const result=document.createElement("canvas");result.width=width;result.height=height;
    const context=result.getContext("2d",{willReadFrequently:true});context.drawImage(source,0,0,width,height);
    const pixels=context.getImageData(0,0,width,height), data=pixels.data;
    x=Math.max(0,Math.min(width-1,Math.floor(x)));y=Math.max(0,Math.min(height-1,Math.floor(y)));
    const seed=y*width+x, rgb=Array.from(data.slice(seed*4,seed*4+3));
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
  window.DeckadenceSpotSelection = {generate, textRegions, colorSelection, cleanPockets};
})();
