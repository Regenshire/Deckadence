// *** CARD PRICES - Show Card Values ***
/* Price refreshes are independent from card rendering, selection and animations. */
(() => {
  "use strict";
  const selector = "[data-card-prices]";
  const vendors = {manapool: "Mana Pool", cardkingdom: "Card Kingdom"};
  let timer = 0, running = false, dirty = false, attempts = 0;
  let popup, activeHost, pinned = false, closeTimer;
  const key = (id, finish) => `${id}:${finish || "normal"}`;
  const amount = quote => typeof quote?.price === "number" && Number.isFinite(quote.price)
    ? `$${quote.price.toFixed(2)}` : "—";
  const defaultSource = () => document.querySelector('script[data-default-price-source]')?.dataset.defaultPriceSource || 'manapool';
  // Pass {manapool: quote, cardkingdom: quote}; the result identifies the actual
  // provider. Set fallback=false only when displaying a vendor-specific quote.
  // No network/database work is performed by selection or formatting.
  function select(prices, source = defaultSource(), fallback = true) {
    if (source === 'none') return {price:null, provider:null, fallback:false};
    const preferred = source === 'cardkingdom' ? 'cardkingdom' : 'manapool';
    const candidates = fallback ? [preferred, preferred === 'manapool' ? 'cardkingdom' : 'manapool'] : [preferred];
    for (const provider of candidates) {
      const quote = prices?.[provider];
      if (typeof quote?.price === 'number' && Number.isFinite(quote.price))
        return {...quote, provider, fallback:provider !== preferred};
    }
    return {price:null, provider:preferred, fallback:false};
  }

  function render(host, prices) {
    const merged = {...host._deckadencePrices};
    for (const provider of Object.keys(vendors)) {
      const quote = prices?.[provider];
      if (!quote) continue;
      // Preserve a known quote during a failed refresh, without substituting vendors.
      merged[provider] = amount(quote) === "—" && amount(merged[provider]) !== "—"
        ? {...merged[provider], ...quote, price:merged[provider].price, stale:true}
        : quote;
    }
    host._deckadencePrices = merged;
    const quote = select(merged, host.dataset.priceSource || defaultSource());
    host.hidden = (host.dataset.priceSource || defaultSource()) === 'none';
    host.textContent = host.dataset.pricePending === "1" ? "—" : amount(quote);
    host.setAttribute("aria-label", `${vendors[quote.provider] || 'Card price'} ${host.textContent}; show both vendor prices`);
    const sortHost = host.closest('[data-sort-price]');
    if (sortHost) sortHost.dataset.sortPrice = quote.price ?? '';
    if (host.classList.contains("chaos-pack-inline-price")) {
      host.classList.toggle("chaos-pack-inline-price-high", quote.price > 2);
    }
    if (host === activeHost) fillPopup();
    host.dispatchEvent(new CustomEvent("deckadence:prices", {bubbles:true, detail:merged}));
  }

  function fillPopup() {
    popup.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "card-price-popover-heading";
    heading.textContent = "Card prices · USD · Near mint";
    popup.append(heading);
    for (const [provider, label] of Object.entries(vendors)) {
      const quote = activeHost._deckadencePrices?.[provider] || {};
      const row = document.createElement("div"); row.className = "card-price-popover-row";
      row.dataset.priceProvider = provider;
      const name = document.createElement("span"); name.textContent = label;
      const value = document.createElement("span"); value.className = "card-price-popover-value";
      value.textContent = amount(quote);
      const status = document.createElement("small"); status.className = "card-price-popover-status";
      const hasValue = amount(quote) !== "—";
      const notes = [];
      if (quote.status === "loading" || quote.refreshing) notes.push(hasValue ? "Updating…" : "Checking…");
      else if (quote.status === "error") notes.push(hasValue ? "Cached · update unavailable" : "Temporarily unavailable");
      else if (quote.status === "unmapped") notes.push("Printing not matched");
      else if (quote.stale) notes.push("Last known price");
      else if (!hasValue) notes.push("No NM price listed");
      if (quote.quantity === 0 && hasValue && !quote.stale) notes.push("Out of stock");
      if (quote.fetched_at) {
        const date = new Date(quote.fetched_at * 1000);
        notes.push(`Checked ${date.toLocaleDateString(undefined, {month:"short", day:"numeric"})} ${date.toLocaleTimeString(undefined, {hour:"numeric", minute:"2-digit"})}`);
      }
      status.textContent = notes.join(" · ");
      row.title = quote.source_updated_at ? `${label} data timestamp: ${quote.source_updated_at}` : "";
      row.append(name, value, status); popup.append(row);
    }
    positionPopup();
  }

  function positionPopup() {
    if (!activeHost?.isConnected) { closePopup(); return; }
    const rect = activeHost.getBoundingClientRect(), box = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(12, Math.min(innerWidth-box.width-12, rect.right-box.width))}px`;
    popup.style.top = `${Math.max(12, rect.bottom+box.height+10 < innerHeight ? rect.bottom+8 : rect.top-box.height-8)}px`;
  }

  function showPopup(host) {
    if (host.dataset.pricePending === "1") return;
    clearTimeout(closeTimer);
    if (activeHost && activeHost !== host) closePopup();
    if (!popup) {
      popup = document.createElement("div"); popup.id = "cardPricePopover";
      popup.className = "card-price-popover"; popup.setAttribute("role", "tooltip");
      popup.addEventListener("pointerenter", () => clearTimeout(closeTimer));
      popup.addEventListener("pointerleave", dismissLater);
      document.body.append(popup);
    }
    activeHost = host; popup.hidden = false;
    host.setAttribute("aria-expanded", "true"); host.setAttribute("aria-describedby", popup.id);
    fillPopup();
  }

  function closePopup() {
    clearTimeout(closeTimer);
    if (popup) popup.hidden = true;
    activeHost?.setAttribute("aria-expanded", "false");
    activeHost?.removeAttribute("aria-describedby");
    activeHost = null; pinned = false;
  }

  function dismissLater() { if (!pinned) closeTimer = setTimeout(closePopup, 180); }

  function mount(host, card, prices = card.prices, source = defaultSource()) {
    if (source === "none") { host.hidden = true; host.remove(); return; }
    host.classList.add("card-price-trigger"); host.setAttribute("data-card-prices", "");
    host.dataset.priceCardUuid = card.card_uuid;
    host.dataset.priceFinish = card.finish_type || card.finish || (Number(card.sheet_is_foil || card.is_foil) === 1 ? 'foil' : 'normal');
    host.dataset.priceSource = source;
    host.setAttribute("aria-expanded", "false");
    render(host, prices);
    schedule(true);
  }

  function schedule(reset = false, delay = 100) {
    if (reset) attempts = 0;
    if (running) { dirty = true; return; }
    clearTimeout(timer);
    timer = setTimeout(refresh, delay);
  }

  async function refresh() {
    if (document.hidden) return;
    const hosts = [...document.querySelectorAll(selector)].filter(host => (host.dataset.priceSource || defaultSource()) !== 'none');
    if (!hosts.length) return;
    const unique = new Map(hosts.map(host => [key(host.dataset.priceCardUuid, host.dataset.priceFinish),
      {card_uuid: host.dataset.priceCardUuid, finish: host.dataset.priceFinish || "normal"}]));
    const cards = [...unique.values()];
    running = true; dirty = false; attempts++;
    let pending = false;
    try {
      for (let start = 0; start < cards.length; start += 1000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch("/api/card-prices", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({cards: cards.slice(start, start+1000)}), signal:controller.signal,
          });
          if (!response.ok) throw new Error("Price lookup unavailable");
          const payload = await response.json();
          if (!payload.ok || !Array.isArray(payload.cards)) throw new Error("Invalid price result");
          const results = new Map(payload.cards.map(card => [key(card.card_uuid, card.finish), card.prices]));
          hosts.forEach(host => {
            if (!host.isConnected) return;
            const prices = results.get(key(host.dataset.priceCardUuid, host.dataset.priceFinish));
            if (!prices) return;
            render(host, prices);
            if (Object.values(prices).some(quote => quote.refreshing || quote.status === "loading")) pending = true;
          });
        } finally { clearTimeout(timeout); }
      }
    } catch (_) {
      hosts.filter(host => host.isConnected).forEach(host => render(host, {
        manapool:{status:"error", refreshing:false}, cardkingdom:{status:"error", refreshing:false},
      }));
    } finally {
      running = false;
      if (dirty) schedule();
      else if (pending && attempts < 15) schedule(false, Math.min(5000, 500 * attempts));
      else if (pending) {
        hosts.filter(host => host.isConnected).forEach(host => {
          const quotes = {...host._deckadencePrices};
          for (const provider of Object.keys(vendors)) {
            if (quotes[provider]?.refreshing || quotes[provider]?.status === "loading") {
              quotes[provider] = {...quotes[provider], refreshing:false, status:"error"};
            }
          }
          render(host, quotes);
        });
      }
    }
  }
  function start() {
    document.querySelectorAll(selector).forEach(host => {
      try { render(host, JSON.parse(host.dataset.priceQuotes || "{}")); } catch (_) {}
    });
    document.addEventListener("pointerover", event => {
      const host = event.target.closest(selector);
      if (host && event.pointerType === "mouse" && (!pinned || host === activeHost)) showPopup(host);
    });
    document.addEventListener("pointerout", event => {
      const host = event.target.closest(selector);
      if (host && !host.contains(event.relatedTarget)) dismissLater();
    });
    document.addEventListener("focusin", event => {
      const host = event.target.closest(selector); if (host) showPopup(host);
    });
    document.addEventListener("focusout", event => {
      if (event.target.closest(selector)) closePopup();
    });
    document.addEventListener("click", event => {
      const host = event.target.closest(selector);
      if (host) {
        if (activeHost === host && pinned) closePopup();
        else { showPopup(host); pinned = true; }
      } else if (!popup?.contains(event.target)) closePopup();
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closePopup(); });
    window.addEventListener("resize", closePopup);
    window.addEventListener("scroll", closePopup, {capture:true, passive:true});
    if (document.querySelector(selector)) schedule(true);
    new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
          (node.matches(selector) || node.querySelector(selector))))) schedule(true);
    }).observe(document.body, {subtree:true, childList:true});
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(true); });
  window.addEventListener("online", () => schedule(true));
  function create(card, source = defaultSource()) {
    const host = document.createElement('button');host.type='button';
    mount(host, card, card.prices, source);return host;
  }
  window.DeckadencePrices = {select, amount, create, mount, refresh: () => schedule(true), setPending: (root, pending) => {
    if (pending && root.contains(activeHost)) closePopup();
    root.querySelectorAll(selector).forEach(host => {
      host.dataset.pricePending = pending ? "1" : "0";
      render(host);
    });
  }};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
})();
