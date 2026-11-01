// Shared, data-only calculations for Set / Pack / Deck Analysis.
(function (global) {
  "use strict";
  const COLORS = "WUBRG";
  const TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Kindred", "Land", "Other"];
  const BASIC_LANDS = {Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G", Wastes: ""};
  const truth = value => value === true || value === 1 || value === "1";
  const number = value => value === null || value === undefined || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  function array(value) {
    if (Array.isArray(value)) return value;
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : null; } catch (_) { return null; }
  }
  function identity(value) {
    const parsed = array(value);
    if (!parsed) return null;
    const letters = new Set(parsed.map(x => String(x).trim().toUpperCase()).filter(x => COLORS.includes(x) && x.length === 1));
    return [...COLORS].filter(x => letters.has(x)).join("");
  }
  function coloredPips(cost) {
    const result = {W: 0, U: 0, B: 0, R: 0, G: 0};
    for (const match of String(cost || "").toUpperCase().matchAll(/\{([^}]+)\}/g)) {
      const choices = [...new Set(match[1].split("/").filter(x => x.length === 1 && COLORS.includes(x)))];
      choices.forEach(color => { result[color] += 1 / choices.length; });
    }
    return result;
  }
  function normalize(raw, index = 0) {
    const name = String(raw.card_name ?? raw.cardName ?? "").trim();
    const uuid = String(raw.card_uuid ?? raw.cardUuid ?? "").trim();
    const layout = String(raw.layout || "").toLowerCase();
    const rawType = String(raw.type_line ?? raw.typeLine ?? "").replace(/\\u2014/g, "—").trim();
    const faces = array(raw.faces_json) || [];
    const front = faces.find(face => face.side === "a" || face.face_index === 0) || faces[0];
    const split = layout === "split" || layout === "aftermath";
    // Lands on a reverse face do not turn a front-face spell into a land.
    const typeLine = String(!split && front?.type_line ? front.type_line : rawType).replace(/\\u2014/g, "—");
    const typeParts = split
      ? (faces.length ? faces.map(face => String(face.type_line || "").replace(/\\u2014/g, "—")) : typeLine.split(/\s+\/\/\s+/))
      : [typeLine.split(/\s+\/\/\s+/)[0]];
    const typeHeads = typeParts.map(part => part.split(/\s+[—–-]\s+/)[0]);
    const token = truth(raw.isToken ?? raw.is_token) || /\b(token|emblem)\b/i.test(rawType) || ["token", "double_faced_token", "emblem"].includes(layout);
    const basic = truth(raw.isBasicLand) || Object.hasOwn(BASIC_LANDS, name);
    const land = truth(raw.isLand) || basic || typeHeads.some(part => /\bland\b/i.test(part));
    let types = land ? ["Land"] : TYPES.filter(type => !["Land", "Other"].includes(type) && typeHeads.some(part => new RegExp("\\b" + (type === "Kindred" ? "(?:kindred|tribal)" : type) + "\\b", "i").test(part)));
    if (!types.length) types = ["Other"];
    const sub = [...new Set(typeParts.flatMap(part => (part.split(/\s+[—–-]\s+/)[1] || "").match(/Time Lord|\S+/gi) || []))];
    let colorIdentity = identity(raw.color_identity_json ?? raw.colorIdentity ?? raw.colorIdentityJson);
    if (colorIdentity === null && basic && Object.hasOwn(BASIC_LANDS, name)) colorIdentity = BASIC_LANDS[name];
    const mv = number(raw.mana_value ?? raw.manaValue);
    const rank = number(raw.edhrec_rank ?? raw.edhrecRank);
    let manaCost = String(raw.mana_cost ?? raw.manaCost ?? "");
    if (split && faces.length) manaCost = faces.map(face => face.mana_cost || "").join(" // ");
    else if (front && front.mana_cost !== undefined) manaCost = front.mana_cost || "";
    const quantity = number(raw.quantity ?? raw.qty ?? 1);
    return {
      id: String(raw.entryId ?? uuid ?? index), uuid, name: name || "Unknown card",
      key: name ? name.normalize("NFKC").toLowerCase() : uuid || "unknown:" + index,
      identity: colorIdentity === null ? "?" : colorIdentity,
      mv: mv !== null && mv >= 0 ? mv : null, manaCost,
      types, sub, land, token, rank: rank !== null && rank > 0 ? rank : null,
      qty: quantity !== null && quantity >= 0 ? quantity : 1,
      filtered: raw.filtered !== false,
    };
  }
  function unique(cards) {
    const result = new Map();
    for (const card of cards) {
      const previous = result.get(card.key);
      if (!previous) result.set(card.key, {...card});
      else {
        previous.qty += card.qty;
        if (previous.rank === null && card.rank !== null) previous.rank = card.rank;
      }
    }
    return [...result.values()];
  }
  function select(cards, scope = "all", count = "copies") {
    const selected = cards.filter(card => !card.token && card.qty > 0 && (scope !== "filtered" || card.filtered));
    return count === "unique" ? unique(selected) : selected;
  }
  function matches(card, color, includeMulti = false) {
    if (color === "L") return card.land;
    if (color === "N") return card.identity === "?";
    if (color === "M") return card.identity.length > 1;
    if (color === "C") return card.identity === "";
    return includeMulti ? card.identity.includes(color) : card.identity === color;
  }
  global.DeckadenceAnalysisModel = {COLORS, TYPES, normalize, unique, select, matches, coloredPips};
})(window);

(function () {
  "use strict";
  const model = window.DeckadenceAnalysisModel;
  function init(config = {}) {
    const root = document.getElementById("statsModal");
    if (!root) return {open() {}, close() {}, isOpen: () => false};
    if (root.analysisController) return root.analysisController;
    document.body.appendChild(root);
    const $ = selector => root.querySelector(selector);
    const $$ = selector => [...root.querySelectorAll(selector)];
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
    const names = {W:"White", U:"Blue", B:"Black", R:"Red", G:"Green", M:"Multicolor", C:"Colorless", L:"Land", N:"Unknown"};
    let colors = ["W", "U", "B", "R", "G", "M", "C"];
    const mana = k => `<span class="an-mana" style="--mana-color:var(--an-${k.toLowerCase()})">${k === "N" ? "?" : k}</span>`;
    const combos={2:['WU','WB','WR','WG','UB','UR','UG','BR','BG','RG'],3:['WUB','WUR','WUG','WBR','WBG','WRG','UBR','UBG','URG','BRG'],4:['WUBR','WUBG','WURG','WBRG','UBRG'],5:['WUBRG']};
const comboNames={WU:'Azorius',WB:'Orzhov',WR:'Boros',WG:'Selesnya',UB:'Dimir',UR:'Izzet',UG:'Simic',BR:'Rakdos',BG:'Golgari',RG:'Gruul',WUG:'Bant',WUB:'Esper',UBR:'Grixis',BRG:'Jund',WRG:'Naya',WBG:'Abzan',WUR:'Jeskai',UBG:'Sultai',WBR:'Mardu',URG:'Temur',UBRG:'Non-White',WBRG:'Non-Blue',WURG:'Non-Black',WUBG:'Non-Red',WUBR:'Non-Green',WUBRG:'Five-color'};
    function getContext() {
      const value = typeof config.context === "function" ? config.context() : config.context;
      return ["Set", "Pack", "Deck"].includes(value) ? value : "Set";
    }
    let context = getContext();
    const defaults = {scope:"all", count:config.defaultCount || (context === "Set" ? "unique" : "copies"), lands:false, multi:false, tab:"balance", unit:"count", combo:"all", subtypeType:"Creature", subtype:"", rankColor:"all", maximized:false};
    let state = {...defaults};
    const storageKey = "deckadence.analysis." + context.toLowerCase();
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      for (const [key, allowed] of Object.entries({scope:["all","filtered"],count:["copies","unique"],tab:["balance","types","rank"],unit:["count","share"],combo:["all","2","3","4","5"]})) {
        if (allowed.includes(saved[key])) state[key] = saved[key];
      }
      for (const key of ["lands", "multi", "maximized"]) if (typeof saved[key] === "boolean") state[key] = saved[key];
    } catch (_) {}
    if (config.allowFiltered === false) {
      state.scope = "all";
      $("#an-scope").closest(".an-field").hidden = true;
    }
    let cards = [], inspection = null, inspectionPage = 0, requestId = 0, requestController = null;
    let previousFocus = null, previousOverflow = "";
    const metadata = new Map();
    const fmt = n => Number(n).toLocaleString();
    const pc = (n,d) => d ? Math.round(n / d * 100) : 0;
    const weight = c => state.count === "copies" ? c.qty : 1;
    const total = cs => cs.reduce((sum,c) => sum + weight(c), 0);
    const eligible = () => model.select(cards, state.scope, state.count);
    const matches = (c,k,includeMulti=state.multi) => model.matches(c,k,includeMulti);
    const average = cs => {
      const known = cs.filter(c => c.mv !== null), n = total(known);
      return n ? (known.reduce((sum,c) => sum + c.mv * weight(c),0) / n).toFixed(1) : "—";
    };
    const median = cs => {
      const values = model.unique(cs).filter(c => c.rank !== null).map(c => c.rank).sort((a,b) => a-b);
      return values.length ? Math.round((values[Math.floor((values.length-1)/2)] + values[Math.ceil((values.length-1)/2)]) / 2) : null;
    };
    const coloredPips = model.coloredPips;
    const manaBins = spells => [...Array.from({length:8},(_,i) => i), ...(spells.some(c => c.mv === null) ? ["unknown"] : [])];
    const inBucket = (c,mv) => mv === "unknown" ? c.mv === null : c.mv !== null && Math.min(7,Math.floor(c.mv)) === Number(mv);
    const bucketLabel = mv => mv === "unknown" ? "?" : Number(mv) === 7 ? "7+" : mv;
    function persist() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {} }
    function listMarkup(cs,rank=false) {
      return cs.map(c => `<div class="an-card-line"><div><strong>${esc(c.name)}</strong><small>${esc(c.types.join(" "))}${c.sub.length ? " — " + esc(c.sub.join(" ")) : ""}${c.manaCost ? " · " + esc(c.manaCost) : ""}</small></div><span>${esc(c.identity || "C")} · MV ${c.mv === null ? "?" : c.mv}</span><span>${rank ? (c.rank ? "#" + fmt(c.rank) : "Unranked") : fmt(weight(c)) + (state.count === "copies" ? " copies" : " card")}</span></div>`).join("") || '<p class="an-empty">No matching cards.</p>';
    }
    function renderInspection() {
      if (!inspection) return;
      const entries = state.count === "copies" ? [...inspection.cs.reduce((map,c) => {
        const key = c.uuid || c.key, previous = map.get(key);
        if (previous) previous.qty += c.qty; else map.set(key,{...c});
        return map;
      },new Map()).values()] : inspection.cs;
      const pages = Math.max(1,Math.ceil(entries.length / 24));
      inspectionPage = Math.min(inspectionPage,pages-1);
      $("#an-inspector-title").textContent = inspection.label;
      $("#an-inspector-count").textContent = fmt(total(inspection.cs)) + (state.count === "copies" ? " copies · " + model.unique(inspection.cs).length + " unique names" : " cards");
      $("#an-inspector-cards").innerHTML = listMarkup(entries.slice(inspectionPage*24,(inspectionPage+1)*24));
      $("#an-inspector-page").textContent = `Page ${inspectionPage+1} of ${pages}`;
      $("#an-inspector-prev").disabled = inspectionPage === 0;
      $("#an-inspector-next").disabled = inspectionPage === pages-1;
      $("#an-inspector-pagination").hidden = pages === 1;
    }
    function inspect(label,cs) {
      inspection = {label,cs}; inspectionPage = 0;
      $("#an-inspector").hidden = false;
      renderInspection();
      $("#an-inspector").scrollIntoView({block:"nearest",behavior:"auto"});
    }
    function renderCurves(spells) {
      const bins = manaBins(spells);
      const groups = [...colors.map(k => ({k,label:k === "M" ? "Multi" : names[k],cs:spells.filter(c => matches(c,k))})),{k:"all",label:"All",cs:spells}];
      const value = (g,mv) => state.unit === "count" ? total(g.cs.filter(c => inBucket(c,mv))) : pc(total(g.cs.filter(c => inBucket(c,mv))),total(g.cs));
      const max = Math.max(1,...groups.flatMap(g => bins.map(mv => value(g,mv))));
      $(".an-curves-panel").style.setProperty("--an-bin-count",bins.length);
      $("#an-curve-rows").style.setProperty("--an-color-count",colors.length);
      $(".an-curve-axis").innerHTML = '<span>Mana value</span>' + bins.map(mv => `<span>${bucketLabel(mv)}</span>`).join("");
      $("#an-curve-rows").innerHTML = groups.map(g => `<div class="an-curve-row" data-summary="${g.k === "all"}" style="--mana-color:var(--an-${g.k === "all" ? "blue" : g.k.toLowerCase()})"><span class="an-curve-label">${g.k === "all" ? '<span class="an-mana" style="--mana-color:var(--an-blue)">Σ</span>' : mana(g.k)}<span class="an-curve-name">${g.label}</span></span>${bins.map(mv => {
        const n = total(g.cs.filter(c => inBucket(c,mv))), v = value(g,mv);
        return `<button type="button" class="an-bucket" data-curve="${g.k}" data-mv="${mv}" data-count="${n}" style="--height:${v/max*100}%" aria-label="${g.k === "all" ? "All nonland cards" : names[g.k]}, mana value ${mv === "unknown" ? "unknown" : bucketLabel(mv)}: ${n} cards${state.unit === "share" ? ", " + v + " percent" : ""}"><i></i><span>${v}${state.unit === "share" ? "%" : ""}</span></button>`;
      }).join("")}</div>`).join("");
      $$("[data-curve]").forEach(b => b.onclick = () => inspect(`${b.dataset.curve === "all" ? "All nonland cards" : names[b.dataset.curve]} · mana value ${bucketLabel(b.dataset.mv)}`,spells.filter(c => (b.dataset.curve === "all" || matches(c,b.dataset.curve)) && inBucket(c,b.dataset.mv))));
    }
    function renderOverallCurve(spells) {
      const buckets = manaBins(spells).map(mv => { const cs = spells.filter(c => inBucket(c,mv)); return {mv,cs,n:total(cs),creatures:total(cs.filter(c => c.types.includes("Creature")))}; });
      const max = Math.max(1,...buckets.map(b => b.n));
      $(".an-total-curve-n").textContent = fmt(total(spells)) + " cards";
      $("#an-total-curve").style.setProperty("--an-bin-count",buckets.length);
      $("#an-total-curve").innerHTML = buckets.map(b => `<button type="button" class="an-total-bucket" data-total-mv="${b.mv}" aria-label="Mana value ${bucketLabel(b.mv)}: ${b.n} cards, ${b.creatures} creatures and ${b.n-b.creatures} other spells"><strong>${b.n}</strong><span class="an-total-bar-space"><span class="an-total-bar" style="--bar-height:${b.n/max*100}%"><i style="height:${b.n ? b.creatures/b.n*100 : 0}%;background:var(--an-blue)"></i><i style="height:${b.n ? (b.n-b.creatures)/b.n*100 : 0}%;background:var(--an-rank-muted)"></i></span></span><span>${bucketLabel(b.mv)}</span></button>`).join("");
      $$("[data-total-mv]").forEach(b => b.onclick = () => inspect("All nonland cards · mana value " + bucketLabel(b.dataset.totalMv),spells.filter(c => inBucket(c,b.dataset.totalMv))));
    }
    function renderMulticolorSummary(multi) {
      // This total always covers all 2–5-color identities in the analysis scope.
      // The exact-combination tabs below do not change the total.
      const {parts, sum} = pipShares(multi, model.COLORS);
      const n = total(multi), unit = state.count === "copies" ? "copies" : "cards";
      const noPips = total(multi.filter(card => !Object.values(coloredPips(card.manaCost)).some(Boolean)));
      const items = parts.map(part => ({...part, count:total(multi.filter(card => card.identity.includes(part.k)))}));
      const description = item => `${names[item.k]}: ${fmt(item.count)} multicolor ${unit}, ${sum ? item.percent + "% of colored casting-cost pips (" + fmt(item.pips) + " pips)" : "no colored casting-cost pips recorded"}`;
      $("#an-multicolor-summary").innerHTML = `
        <div class="an-multicolor-summary-heading">
          <h4 id="an-multicolor-summary-title">Total multicolor balance</h4>
          <span>${fmt(n)} ${unit} · all 2–5 colors</span>
        </div>
        <p class="an-multicolor-summary-method">Colored mana pips · 20% per color is an even split</p>
        <div class="an-multicolor-total-bar" aria-label="Total colored mana pip distribution">
          ${items.filter(item => item.pips > 0).map(item => `<button type="button" data-multicolor-total="${item.k}" aria-label="${description(item)}" title="${description(item)}" style="--pip-color:var(--an-${item.k.toLowerCase()});width:${item.share}%"></button>`).join("")}
        </div>
        <div class="an-multicolor-total-colors">
          ${items.map(item => `<button type="button" class="an-multicolor-total-color" data-multicolor-total="${item.k}" data-pips="${item.pips}" data-share="${item.percent}" data-cards="${item.count}" aria-label="${description(item)}" title="${description(item)}" ${item.count ? "" : "disabled"}>
            <span class="an-multicolor-total-name">${mana(item.k)}${names[item.k]}</span>
            <strong>${sum ? item.percent + "%" : "—"}</strong>
            <span>${fmt(item.count)} ${unit}</span>
          </button>`).join("")}
        </div>
        <p class="an-multicolor-summary-note">${!n ? "No multicolor nonland cards in this scope." : "Card counts include each matching color." + (noPips ? ` ${fmt(noPips)} ${unit} have no colored cost pips.` : "")}</p>`;
      $$("[data-multicolor-total]").forEach(button => {
        button.onclick = () => inspect(names[button.dataset.multicolorTotal] + " · all multicolor cards", multi.filter(card => card.identity.includes(button.dataset.multicolorTotal)));
      });
    }
    function pipShares(cs,key){
  const counts=Object.fromEntries([...key].map(k=>[k,0]));
  for(const c of cs){const pips=coloredPips(c.manaCost);for(const k of key)counts[k]+=pips[k]*weight(c);}
  const sum=Object.values(counts).reduce((a,b)=>a+b,0);
  const parts=[...key].map(k=>({k,pips:counts[k],share:sum?counts[k]/sum*100:0}));
  parts.forEach(p=>p.percent=Math.floor(p.share));
  if(sum){const ranked=[...parts].sort((a,b)=>(b.share-b.percent)-(a.share-a.percent));for(let i=0,left=100-parts.reduce((s,p)=>s+p.percent,0);i<left;i++)ranked[i].percent++;}
  return {parts,sum};
}
function colorRows(cs,container,interactive=true){const denominator=total(cs),peak=Math.max(1,...colors.map(k=>total(cs.filter(c=>matches(c,k)))));container.innerHTML=colors.map(k=>{const group=cs.filter(c=>matches(c,k)),n=total(group);return `<button type="button" class="an-color-row" data-color="${k}" style="--mana-color:var(--an-${k.toLowerCase()});--fill:${n/peak}" aria-label="${names[k]}: ${n} cards, ${pc(n,denominator)} percent, average mana value ${average(group.filter(c=>!c.land))}"><span class="an-color-label">${mana(k)}${names[k]}</span><span class="an-color-value"><strong>${fmt(n)}</strong><small>${pc(n,denominator)}%</small></span><span class="an-color-mv">${average(group.filter(c=>!c.land))}</span><i class="an-color-fill"></i></button>`}).join('');if(interactive)container.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>inspect(names[b.dataset.color]+' color identity',cs.filter(c=>matches(c,b.dataset.color))));}
function barRows(container,items,max,handler){container.innerHTML=items.map(x=>`<button type="button" class="an-type-bar" data-label="${esc(x.label)}" aria-label="${esc(x.label)}: ${x.n} cards"><span>${esc(x.label)}</span><span class="an-track" style="--width:${max?x.n/max*100:0}%;--bar-color:${x.color||'var(--an-blue)'}"><i></i></span><strong>${fmt(x.n)}</strong></button>`).join('');container.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>handler(items[i]));}
function renderMulticolor(spells){
  const multi=spells.filter(c=>c.identity.length>1);
  renderMulticolorSummary(multi);
  const groups=Object.entries(combos).map(([size,keys])=>({size,items:keys.map(key=>{const cs=multi.filter(c=>c.identity===key);return {key,cs,n:total(cs),...pipShares(cs,key)};})}));
  const max=Math.max(1,...groups.flatMap(g=>g.items.map(x=>x.n)));
  $$('[data-combo-size]').forEach(b=>{const count=b.querySelector('span');if(count)count.textContent=total(multi.filter(c=>c.identity.length===+b.dataset.comboSize));});
  $('#an-combos').dataset.focused=String(state.combo!=='all');
  $('#an-combos').innerHTML=groups.filter(g=>state.combo==='all'||state.combo===g.size).map(g=>`<section class="an-combo-group" data-combo-group="${g.size}"><h4>${g.size} colors <small>${g.items.reduce((s,x)=>s+x.n,0)} cards</small></h4><div class="an-combo-items">${g.items.map(x=>{
    const label=x.parts.map(p=>`${names[p.k]} ${p.percent}%`).join(', ');
    return `<button type="button" class="an-combo" data-combo="${x.key}" data-card-count="${x.n}" title="${comboNames[x.key]} · ${x.n} cards · ${x.sum?label:'No colored pips'}" aria-label="${comboNames[x.key]} (${x.key}): ${x.n} cards. ${x.sum?'Casting-cost pips: '+label:'No colored casting-cost pips'}"><span class="an-combo-symbols">${x.key}</span><span class="an-pip-track"><span class="an-pip-fill" style="--width:${x.n/max*100}%;${!x.sum?'background:var(--an-rank-muted)':''}">${x.parts.map(p=>`<i data-pip-color="${p.k}" data-pips="${p.pips}" data-share="${p.percent}" style="--pip-color:var(--an-${p.k.toLowerCase()});--pip-width:${p.share}%"></i>`).join('')}</span></span><strong>${x.n}</strong><span class="an-combo-secondary"><span>${comboNames[x.key]}</span><span class="an-combo-shares">${x.sum?x.parts.map(p=>`<span><b>${p.k}</b><em>${names[p.k]}</em> ${p.percent}%</span>`).join(''):(x.n?'No colored pips':'No cards')}</span></span></button>`;
  }).join('')}</div></section>`).join('');
  $$('[data-combo]').forEach(b=>b.onclick=()=>inspect(comboNames[b.dataset.combo]+' · '+b.dataset.combo,multi.filter(c=>c.identity===b.dataset.combo)));
  $('#an-combo-total').innerHTML=`<span><b>${fmt(total(state.combo==='all'?multi:multi.filter(c=>c.identity.length===+state.combo)))}</b> ${state.combo==='all'?'multicolor':state.combo+'-color'} cards</span><span>${state.combo==='all'?'2–5 colors':fmt(total(multi))+' multicolor nonlands total'}</span>`;
}
function renderBalance(nonTokens){const spells=nonTokens.filter(c=>!c.land),lands=nonTokens.filter(c=>c.land),colorSet=state.lands?nonTokens:spells,n=total(colorSet);$('#an-method').textContent=(state.lands?'Lands contribute to color identity. ':'Lands are separate from color identity. ')+(state.multi?'Multicolor cards count in each matching color; color shares can overlap.':'Multicolor cards stay in their own group.');$('#an-color-subtitle').textContent=state.lands?'Color identity · including lands':'Nonland color identity';$('#an-color-n').textContent=fmt(n)+' '+(state.count==='copies'?'copies':'cards');colorRows(colorSet,$('#an-color-rows'));$('#an-land-row').innerHTML=`${mana('L')}<span>Lands<small>${state.lands?'Included in color counts above':'Separate from color counts and mana curves'}</small></span><strong>${fmt(total(lands))}</strong>`;
renderCurves(spells);
renderMulticolor(spells);
renderOverallCurve(spells);
const typeItems=model.TYPES.map(label=>({label,cs:label==='Land'?lands:spells.filter(c=>c.types.includes(label)),color:label==='Land'?'var(--an-l)':'var(--an-blue)'})).map(x=>({...x,n:total(x.cs)})).filter(x=>x.n||['Creature','Land'].includes(x.label));$('#an-type-bars').style.setProperty('--an-type-count',typeItems.length);barRows($('#an-type-bars'),typeItems,Math.max(1,...typeItems.map(x=>x.n)),x=>inspect(x.label,x.cs));}
function renderTypes(nonTokens){const spells=nonTokens.filter(c=>!c.land);const types=model.TYPES.filter(type=>type!=='Land'&&spells.some(c=>c.types.includes(type)));$('#an-types-matrix').innerHTML=`<table class="an-table"><thead><tr><th>Spell type</th>${colors.map(k=>`<th>${mana(k)}</th>`).join('')}<th>Total</th></tr></thead><tbody>${types.map(type=>{const a=spells.filter(c=>c.types.includes(type)),max=Math.max(1,...colors.map(k=>total(a.filter(c=>matches(c,k,false)))));return `<tr><td>${type}</td>${colors.map(k=>{const n=total(a.filter(c=>matches(c,k,false)));return `<td><button type="button" class="an-cell" data-type="${type}" data-type-color="${k}" style="--mana-color:var(--an-${k.toLowerCase()});--intensity:${n/max*28}%" aria-label="${names[k]} ${type}: ${n} cards">${n}</button></td>`}).join('')}<td>${total(a)}</td></tr>`}).join('')}<tr><td>Lands</td><td colspan="${colors.length}">Tracked separately</td><td>${total(nonTokens.filter(c=>c.land))}</td></tr></tbody></table>`;$$('[data-type-color]').forEach(b=>b.onclick=()=>inspect(names[b.dataset.typeColor]+' '+b.dataset.type,spells.filter(c=>c.types.includes(b.dataset.type)&&matches(c,b.dataset.typeColor,false))));
const subtypeBase=nonTokens.filter(c=>state.subtypeType==='Land'?c.land:!c.land&&c.types.includes(state.subtypeType));const subs=[...new Set(subtypeBase.flatMap(c=>c.sub))].map(label=>({label,cs:subtypeBase.filter(c=>c.sub.includes(label))})).map(x=>({...x,n:total(x.cs)})).sort((a,b)=>b.n-a.n);if(!subs.some(x=>x.label===state.subtype))state.subtype=subs[0]?.label||'';barRows($('#an-subtype-bars'),subs,Math.max(1,...subs.map(x=>x.n)),x=>{state.subtype=x.label;render();persist()});$('#an-subtype-bars').querySelectorAll('button').forEach(b=>{b.classList.add('an-subtype-choice');b.setAttribute('aria-pressed',String(b.dataset.label===state.subtype))});const chosen=subs.find(x=>x.label===state.subtype)?.cs||[];$('#an-subtype-title').textContent=(state.subtype||state.subtypeType)+' by color';$('#an-subtype-subtitle').textContent=state.subtypeType==='Land'?'Land subtypes are kept outside color balance.':'Exact color groups · multicolor separate';if(state.subtypeType==='Land'){$('#an-subtype-colors').innerHTML=`<div class="an-land-row">${mana('L')}<span>${esc(state.subtype||'No subtype')}</span><strong>${total(chosen)}</strong></div>`}else{const items=colors.map(k=>({label:names[k],cs:chosen.filter(c=>matches(c,k,false)),color:`var(--an-${k.toLowerCase()})`})).map(x=>({...x,n:total(x.cs)}));barRows($('#an-subtype-colors'),items,Math.max(1,...items.map(x=>x.n)),x=>inspect(state.subtype+' · '+x.label,x.cs))}$('#an-subtype-metrics').innerHTML=`<span><b>${total(chosen)}</b> matching cards</span><span>${state.subtypeType==='Land'?'Land category':'Average MV <b>'+average(chosen)+'</b>'}</span>`;}
function renderRanks(nonTokens){const spells=model.unique(nonTokens.filter(c=>!c.land)),buckets=[c=>c.rank&&c.rank<=1000,c=>c.rank>1000&&c.rank<=5000,c=>c.rank>5000,c=>!c.rank],labels=['Top 1,000','Rank 1,001–5,000','Rank 5,001+','Unranked'];$('#an-rank-rows').innerHTML=colors.map(k=>{const cs=spells.filter(c=>matches(c,k,false)),ranked=cs.filter(c=>c.rank).length,med=median(cs);return `<div class="an-rank-row"><span class="an-color-label">${mana(k)}${names[k]}</span><div class="an-rank-stacked">${buckets.map((f,i)=>`<button type="button" data-rank-bucket="${i}" data-rank-k="${k}" aria-label="${names[k]}: ${cs.filter(f).length} ${labels[i]} cards" style="width:${cs.length?cs.filter(f).length/cs.length*100:0}%;background:${['var(--an-blue)','var(--an-teal)','var(--an-rank-muted)','var(--an-button)'][i]}"></button>`).join('')}</div><span class="an-rank-value">${med?'#'+fmt(med):'—'}<small>median rank</small></span><span class="an-rank-value">${ranked}/${cs.length}<small>cards ranked</small></span></div>`}).join('');$$('[data-rank-bucket]').forEach(b=>b.onclick=()=>inspect(names[b.dataset.rankK]+' · '+labels[+b.dataset.rankBucket],spells.filter(c=>matches(c,b.dataset.rankK,false)&&buckets[+b.dataset.rankBucket](c))));const ranked=spells.filter(c=>c.rank&&(state.rankColor==='all'||matches(c,state.rankColor,false))).sort((a,b)=>a.rank-b.rank);$('#an-ranked-cards').innerHTML=listMarkup(ranked.slice(0,10),true);$('#an-rank-list-note').textContent=`${state.rankColor==='all'?'All colors':names[state.rankColor]} · ${Math.min(10,ranked.length)} of ${ranked.length} ranked cards`;}

    function render() {
      const selected = eligible(), spells = selected.filter(c => !c.land), lands = selected.filter(c => c.land), n = total(selected);
      colors = ["W","U","B","R","G","M","C",...(selected.some(c => c.identity === "?") ? ["N"] : [])];
      $("#an-color-rows").style.gridTemplateRows = `repeat(${colors.length},1fr)`;
      $("#an-title").textContent = context + " Analysis";
      $("#an-source").textContent = (typeof config.getSubtitle === "function" ? config.getSubtitle() : config.subtitle) || (context === "Deck" ? "Main deck" : "Card balance and composition");
      $("#an-scope").options[0].textContent = "Entire " + context.toLowerCase();
      $("#an-scope").value = state.scope; $("#an-count").value = state.count;
      const creatures = total(spells.filter(c => c.types.includes("Creature")));
      $("#an-summary").innerHTML = [
        ["Analyzed cards",fmt(n),state.count === "copies" ? model.unique(selected).length + " unique names" : "Unique card names"],
        ["Nonlands",fmt(total(spells)),pc(total(spells),n) + "% of analyzed cards"],
        ["Creatures",fmt(creatures),pc(creatures,total(spells)) + "% of nonlands"],
        ["Lands",fmt(total(lands)),pc(total(lands),n) + "% · separate by default"],
        ["Average mana value",average(spells),"Nonlands only"]
      ].map(x => `<div class="an-metric"><div class="an-metric-label">${x[0]}</div><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join("");
      for (const key of ["lands","multi"]) { const el = $("#an-"+key); el.setAttribute("aria-checked",String(state[key])); el.querySelector("b").textContent = state[key] ? "On" : "Off"; }
      $$("[data-tab]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.tab === state.tab)));
      $$("[data-view]").forEach(el => { el.hidden = el.dataset.view !== state.tab; });
      $$("[data-unit]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.unit === state.unit)));
      $$("[data-combo-size]").forEach(b => b.setAttribute("aria-pressed",String(b.dataset.comboSize === state.combo)));
      $("#an-subtype-type").value = state.subtypeType; $("#an-rank-color").value = state.rankColor;
      root.classList.toggle("an-maximized",state.maximized);
      $(".an-window").classList.toggle("an-maximized",state.maximized);
      $(".an-window-toggle").setAttribute("aria-pressed",String(state.maximized));
      $(".an-window-toggle").setAttribute("aria-label",state.maximized ? "Restore analysis" : "Maximize analysis");
      $(".an-window-toggle span").textContent = state.maximized ? "Restore" : "Maximize";
      $(".an-window-toggle i").className = "fa-solid " + (state.maximized ? "fa-compress" : "fa-expand");
      $("#an-footer-scope").textContent = (state.scope === "all" ? "Entire " + context.toLowerCase() : "Current filtered cards") + " · " + (state.count === "copies" ? "copies" : "unique names");
      const missingMV = total(spells.filter(c => c.mv === null));
      $("#an-data-note").hidden = !missingMV && n > 0;
      $("#an-data-note").textContent = !n ? "No cards to analyze in this scope." : `${missingMV} cards have no mana value recorded; they appear in the ? bucket and are omitted from the average.`;
      renderBalance(selected); renderTypes(selected); renderRanks(selected);
    }
    function change(patch) {
      Object.assign(state,patch); inspection = null; $("#an-inspector").hidden = true; render(); persist();
    }
    // Capture data only when opening or explicitly retrying a failed load.
    // Host-page rendering must not interrupt scrolling or card drilldowns.
    async function loadSnapshot() {
      if (!isOpen()) return;
      const current = ++requestId;
      requestController?.abort(); requestController = new AbortController();
      root.dataset.loading = "true"; root.setAttribute("aria-busy","true");
      $("#an-status").hidden = false; $("#an-status-message").textContent = "Loading card analysis…"; $("#an-retry").hidden = true;
      try {
        const rawCards = await Promise.resolve(config.getCards?.() || []);
        if (current !== requestId || !isOpen()) return;
        const ids = [...new Set(rawCards.map(c => String(c.cardUuid || c.card_uuid || "")).filter(Boolean))].filter(id => !metadata.has(id));
        for (let start = 0; start < ids.length; start += 400) {
          const response = await fetch(root.dataset.cardsUrl,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({card_uuids:ids.slice(start,start+400)}),signal:requestController.signal});
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.message || "Could not load card details.");
          for (const id of ids.slice(start,start+400)) {
            if (!payload.cards?.[id]) throw new Error("Some card details are unavailable. Refresh the page or try again.");
            metadata.set(id,payload.cards[id]);
          }
        }
        if (current !== requestId || !isOpen()) return;
        cards = rawCards.map((raw,index) => model.normalize({...raw,...metadata.get(String(raw.cardUuid || raw.card_uuid || ""))},index));
        inspection = null; $("#an-inspector").hidden = true;
        render(); root.dataset.loading = "false"; $("#an-status").hidden = true;
      } catch (error) {
        if (current !== requestId || error.name === "AbortError") return;
        $("#an-status-message").textContent = error.message || "Could not load analysis.";
        $("#an-retry").hidden = false;
      } finally { if (current === requestId) root.setAttribute("aria-busy","false"); }
    }
    function isOpen() { return !root.classList.contains("hidden"); }
    function open() {
      if (isOpen()) return;
      context = getContext();
      config.beforeOpen?.(); previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden"; metadata.clear();
      root.classList.remove("hidden"); root.setAttribute("aria-hidden","false");
      render(); $(".an-close").focus(); loadSnapshot();
    }
    function close() {
      if (!isOpen()) return;
      requestId++; requestController?.abort();
      root.classList.add("hidden"); root.setAttribute("aria-hidden","true"); root.setAttribute("aria-busy","false");
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    }
    $("#an-scope").onchange = e => change({scope:e.target.value});
    $("#an-count").onchange = e => change({count:e.target.value});
    for (const key of ["lands","multi"]) $("#an-"+key).onclick = () => change({[key]:!state[key]});
    $$("[data-tab]").forEach(b => b.onclick = () => change({tab:b.dataset.tab}));
    $$("[data-go]").forEach(b => b.onclick = () => change({tab:b.dataset.go}));
    $$("[data-unit]").forEach(b => b.onclick = () => change({unit:b.dataset.unit}));
    $$("[data-combo-size]").forEach(b => b.onclick = () => change({combo:b.dataset.comboSize}));
    $("#an-subtype-type").onchange = e => change({subtypeType:e.target.value,subtype:""});
    $("#an-rank-color").onchange = e => change({rankColor:e.target.value});
    $(".an-window-toggle").onclick = () => { state.maximized = !state.maximized; render(); persist(); };
    $("#an-inspector-close").onclick = () => { $("#an-inspector").hidden = true; inspection = null; };
    $("#an-inspector-prev").onclick = () => { inspectionPage--; renderInspection(); };
    $("#an-inspector-next").onclick = () => { inspectionPage++; renderInspection(); };
    $(".an-close").onclick = close; $(".an-done").onclick = close; $("#statsBackdrop").onclick = close;
    $("#an-retry").onclick = loadSnapshot;
    document.getElementById(config.openButtonId)?.addEventListener("click",open);
    document.addEventListener("keydown",event => {
      if (!isOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        if (inspection) { inspection = null; $("#an-inspector").hidden = true; $(".an-close").focus(); } else close();
      } else if (event.key === "Tab") {
        const focusable = $$("button:not(:disabled),select:not(:disabled),[href]").filter(el => el.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    },true);
    root.analysisController = {open,close,isOpen};
    return root.analysisController;
  }
  window.DeckadenceAnalysis = {init};
  window.iMomirStatsModal = window.DeckadenceAnalysis;
  // Both saved/preview packs and opened packs use this same adapter.
  const packScreen = document.getElementById("campaignPackDetailScreen") || document.getElementById("basicPackDetailScreen");
  if (packScreen) init({
    context:"Pack",openButtonId:"packAnalysisButton",
    getSubtitle:() => packScreen.dataset.packDisplayName || packScreen.querySelector("h1")?.textContent || "Pack",
    getCards:() => [...packScreen.querySelectorAll(".chaos-pack-view-card")].map((el,index) => ({cardUuid:el.dataset.cardUuid,cardName:el.dataset.cardName,entryId:el.dataset.trackedPackCardId || index,filtered:!window.DeckadenceCardTags || window.DeckadenceCardTags.matches(el,"pack")})),
  });
})();
