(() => {
  "use strict";
  const root = document.querySelector(".pack-simulator");
  if (!root) return;
  const $ = (id) => document.getElementById(id),
    vendors = { manapool: "Mana Pool", cardkingdom: "Card Kingdom" };
  const source = root.dataset.priceSource,
    money = (n) =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      !root.classList.contains("is-opening")
        ? "$" + n.toFixed(2)
        : "—";
  const key = (c) => `${c.card_uuid}:${c.finish_type}`,
    productKey = (p) => `${p.set_code}:${p.booster_name}`;
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const option = (value, text) => {
    const n = node("option", text);
    n.value = value;
    return n;
  };
  const store = (k, v) => {
    try {
      localStorage.setItem("deckadence.sim." + k, JSON.stringify(v));
    } catch (_) {}
  };
  const stored = (k, f) => {
    try {
      return JSON.parse(localStorage.getItem("deckadence.sim." + k)) ?? f;
    } catch (_) {
      return f;
    }
  };
  let catalog = [],
    selected = null,
    candidate = null,
    selectionRevision = 0,
    boxId = null,
    quantity = 1;
  let opening = null,
    packIndex = 0,
    revealed = new Set(),
    busy = false,
    openRequest = null,
    animationController = null;
  let quotes = new Map(),
    priceHosts = new Set(),
    sealed = new Map(),
    sealedTimer = 0,
    sealedGeneration = 0;
  let activeSlot = null,
    pool = [],
    poolLimit = 24,
    poolRevision = 0,
    sidebarFrame = 0,
    saveTimer = 0,
    saving = false;
  const pendingSaves = new Map(),
    productCache = new Map();
  function status(text, retry) {
    const host = $("simStatus");
    host.replaceChildren();
    host.hidden = !text;
    if (!text) return;
    host.append(document.createTextNode(text));
    if (retry) {
      const b = node("button", "Retry", "sim-text-button");
      b.type = "button";
      b.onclick = retry;
      host.append(" ", b);
    }
  }
  async function api(path, data, timeout = 15000) {
    const ctl = new AbortController(),
      timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch("/api/pack-simulator/" + path, {
        method: data === undefined ? "GET" : "POST",
        cache: "no-store",
        signal: ctl.signal,
        ...(data === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }),
      });
      const result = await r.json();
      if (!r.ok || !result.ok)
        throw Error(
          result.message ||
            "This operation could not be completed. Please try again.",
        );
      return result;
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError)
        throw Error(
          "Could not reach Deckadence. Your current opening is safe.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  const query = (p) =>
    `set=${encodeURIComponent(p.set_code)}&booster=${encodeURIComponent(p.booster_name)}`;
  async function getProduct(p) {
    const k = productKey(p);
    if (!productCache.has(k))
      productCache.set(k, (await api("product?" + query(p))).product);
    return productCache.get(k);
  }
  const cards = () => (opening ? opening.packs.flatMap((p) => p.cards) : []);
  const shownCards = () => cards().filter((c) => revealed.has(c.index));
  const currentPack = () => opening?.packs[packIndex];
  const combinedBox = () =>
    Boolean(opening?.box_id) && !stored("individualBox", false);
  const currentBox = () => selected?.boxes.find((b) => b.id === boxId);
  const price = (c, s = source) => quotes.get(key(c))?.[s]?.price;
  function setBusy(value) {
    busy = value;
    root.setAttribute("aria-busy", String(value));
    $("openButton").disabled = value || !selected || selected.unavailable;
    $("detailsButton").disabled = value;
    $("sealedPrice").disabled = value;
    $("chooseProduct").disabled = value;
    $("packArtworkButton").disabled =
      value || !selected || selected.unavailable;
    document.querySelector('[data-dialog="historyDialog"]').disabled = value;
    for (const id of [
      "previousPack",
      "nextPack",
      "packPosition",
      "openRest",
      "showAllCards",
      "cardSort",
      "revealPack",
      "saveButton",
    ])
      $(id).disabled = value;
    $("skipAnimation").hidden = !value || !animationController;
    if (!value && opening) updateNavigation();
  }
  function setOpenLabel() {
    if (combinedBox()) {
      $("openButton").querySelector("span").textContent = cards().some(
        (c) => !revealed.has(c.index),
      )
        ? "Reveal all cards"
        : "Open another box";
      return;
    }
    const unopened =
      opening?.packs.findIndex((p) =>
        p.cards.some((c) => !revealed.has(c.index)),
      ) ?? -1;
    $("openButton").querySelector("span").textContent = opening
      ? currentPack().cards.some((c) => !revealed.has(c.index))
        ? "Reveal this pack"
        : unopened >= 0
          ? "Open next pack"
          : "Open another"
      : boxId
        ? "Open box"
        : quantity > 1
          ? "Open first pack"
          : "Open pack";
  }
  function updateProduct() {
    if (!selected) return;
    const box = currentBox();
    $("productName").textContent = selected.set_name;
    $("productType").textContent = box
      ? "Booster box · " + selected.label
      : selected.label;
    const img = $("packArtwork");
    img.src = selected.image_src;
    img.alt = selected.set_name + " " + selected.label;
    const count = box
      ? box.packs.reduce((sum, p) => sum + p.count, 0)
      : quantity;
    $("productDescription").textContent = box
      ? `${count} packs · ${box.name}`
      : `${quantity} ${selected.label.toLowerCase()}${quantity === 1 ? "" : "s"} · ${selected.min_cards === selected.max_cards ? selected.min_cards : selected.min_cards + "–" + selected.max_cards} cards per pack`;
    window.DeckadenceSealedEffects?.setBox(
      $("packArtworkButton"),
      Boolean(box),
      selected.set_name,
      count,
      selected.booster_name.toLowerCase().includes("collector"),
      selected.booster_name.toLowerCase().includes("play"),
    );
    setOpenLabel();
    renderSealed();
  }
  function resetForProduct(productChanged = true) {
    rememberOpening();
    if (productChanged) sessionOpenings.clear();
    opening = null;
    packIndex = 0;
    revealed.clear();
    recentReveals.clear();
    orderedPacks.clear();
    quotes.clear();
    priceHosts.clear();
    $("simPriceCache").replaceChildren();
    $("previewCards").replaceChildren();
    $("packStage").hidden = false;
    $("openedCards").hidden = true;
    $("saveButton").hidden = true;
    $("openingHeading").textContent = "Ready to crack a pack?";
    $("showAllCards").checked = false;
    const u = new URL(location.href);
    u.searchParams.delete("opening");
    history.replaceState(null, "", u);
    status("");
    updateProduct();
    renderSidebar();
    requestSealed();
  }
  async function chooseCandidate(p) {
    const rev = ++selectionRevision;
    candidate = null;
    $("useProduct").disabled = true;
    $("selectionSummary").textContent = "Loading product…";
    $("selectionName").textContent = p.set_name;
    $("selectionType").textContent = p.label;
    $("selectionArt").src = p.image_src;
    try {
      const full = await getProduct(p);
      if (rev !== selectionRevision) return;
      candidate = full;
      $("openingSize").replaceChildren(
        option("packs", "Packs"),
        ...full.boxes.map((b) => option(b.id, b.name)),
      );
      if (selected && productKey(selected) === productKey(full) && boxId)
        $("openingSize").value = boxId;
      $("packQuantity").value = quantity;
      updateSelectionSize();
      $("useProduct").disabled = false;
      renderProducts();
    } catch (e) {
      if (rev === selectionRevision)
        $("selectionSummary").textContent = e.message;
    }
  }
  function updateSelectionSize() {
    const box = candidate?.boxes.find((b) => b.id === $("openingSize").value);
    $("quantityField").hidden = Boolean(box);
    $("individualBoxChoice").hidden = !box;
    $("packQuantity").disabled = Boolean(box);
    $("selectionSummary").textContent = box
      ? box.packs
          .map((p) => `${p.count} × ${p.booster_name.replaceAll("-", " ")}`)
          .join(" · ")
      : candidate
        ? `${candidate.min_cards === candidate.max_cards ? candidate.min_cards : candidate.min_cards + "–" + candidate.max_cards} cards per pack`
        : "";
  }
  function renderProducts() {
    const terms = $("productSearch")
        .value.toLowerCase()
        .split(/\s+/)
        .filter(Boolean),
      type = $("boosterFilter").value;
    const choices = catalog.filter(
      (p) =>
        (!type || p.booster_name === type) &&
        terms.every((t) =>
          (p.set_name + " " + p.set_code + " " + p.label + " " + p.release_date)
            .toLowerCase()
            .includes(t),
        ),
    );
    choices.sort((a, b) =>
      $("productSort").value === "name"
        ? a.set_name.localeCompare(b.set_name)
        : (b.release_date || "").localeCompare(a.release_date || "") ||
          a.set_name.localeCompare(b.set_name),
    );
    $("productCount").textContent = `${choices.length} matching products`;
    $("productResults").replaceChildren(
      ...choices.map((p) => {
        const b = node("button", undefined, "campaign-add-pack-search-result");
        b.type = "button";
        b.setAttribute(
          "aria-pressed",
          String(candidate && productKey(candidate) === productKey(p)),
        );
        const wrap = node(
            "div",
            undefined,
            "campaign-add-pack-search-image-wrap",
          ),
          img = node("img", undefined, "campaign-add-pack-search-image");
        img.src = p.image_src;
        img.alt = "";
        img.loading = "lazy";
        wrap.append(img);
        const info = node("div", undefined, "campaign-add-pack-search-info");
        info.append(
          node("div", p.set_name, "campaign-add-pack-search-title"),
          node(
            "div",
            `${p.label} · ${p.set_code} · ${p.release_date?.slice(0, 4) || ""}`,
            "campaign-add-pack-search-meta",
          ),
        );
        b.append(
          wrap,
          info,
          node(
            "span",
            candidate && productKey(candidate) === productKey(p) ? "✓" : "",
          ),
        );
        b.onclick = () => chooseCandidate(p);
        return b;
      }),
    );
    if (!choices.length)
      $("productResults").append(
        node("p", "No products match these filters.", "sim-muted"),
      );
  }
  $("chooseProduct").onclick = () => {
    $("productSearch").value = "";
    $("boosterFilter").value = "";
    $("revealIndividually").checked = stored("individualReveal", false);
    $("openIndividualPack").checked = stored("individualBox", false);
    renderProducts();
    if (selected) chooseCandidate(selected);
    $("productDialog").showModal();
  };
  $("productSearch").oninput = renderProducts;
  $("boosterFilter").onchange = renderProducts;
  $("productSort").onchange = renderProducts;
  $("openingSize").onchange = updateSelectionSize;
  $("useProduct").onclick = () => {
    if (!candidate || !$("packQuantity").reportValidity()) return;
    const productChanged =
      !selected ||
      productKey(selected) !== productKey(candidate) ||
      (boxId || "packs") !== $("openingSize").value;
    selected = candidate;
    boxId = $("openingSize").value === "packs" ? null : $("openingSize").value;
    quantity = boxId ? 1 : Number($("packQuantity").value);
    store("selection", {
      set: selected.set_code,
      booster: selected.booster_name,
      box: boxId,
      count: quantity,
    });
    store("individualReveal", $("revealIndividually").checked);
    store("individualBox", $("openIndividualPack").checked);
    $("productDialog").close();
    resetForProduct(productChanged);
    setBusy(false);
  };
  async function openNew() {
    if (busy || !selected || selected.unavailable) return;
    const params = {
      set_code: selected.set_code,
      booster_name: selected.booster_name,
      count: quantity,
      box_id: boxId,
    };
    const fingerprint = JSON.stringify(params);
    if (!openRequest || openRequest.fingerprint !== fingerprint)
      openRequest = { fingerprint, id: uuid() };
    setBusy(true);
    status("Opening your packs…");
    try {
      const result = await api(
        "open",
        { ...params, request_id: openRequest.id },
        30000,
      );
      openRequest = null;
      await useOpening(result.opening, true);
      status("");
      await presentPack(0, true, Boolean(boxId));
    } catch (e) {
      status(e.message, openNew);
    } finally {
      root.classList.remove("is-opening");
      setBusy(false);
    }
  }
  async function useOpening(result, fresh = false) {
    root.classList.toggle("is-opening", fresh);
    rememberOpening();
    if (!fresh) sessionOpenings.clear();
    opening = result;
    packIndex = 0;
    recentReveals.clear();
    orderedPacks.clear();
    if (!fresh) quotes.clear();
    priceHosts.clear();
    $("simPriceCache").replaceChildren();
    const valid = new Set(cards().map((c) => c.index));
    const local = stored("reveals." + result.id, []);
    revealed = new Set(
      [...result.revealed, ...(Array.isArray(local) ? local : [])].filter((i) =>
        valid.has(i),
      ),
    );
    const preferredSort = stored("sort", "pack");
    $("cardSort").value = [...$("cardSort").options].some(
      (o) => o.value === preferredSort,
    )
      ? preferredSort
      : "pack";
    $("showAllCards").checked = false;
    $("openedCards").hidden = false;
    $("saveButton").hidden = false;
    if (!fresh) $("packStage").hidden = true;
    $("openingHeading").textContent = "Pack contents";
    const url = new URL(location.href);
    url.searchParams.set("opening", result.id);
    history.replaceState(null, "", url);
    try {
      selected = await getProduct(result);
      boxId = result.box_id;
      quantity = result.count;
      updateProduct();
    } catch (_) {
      selected = {
        set_code: result.set_code,
        booster_name: result.booster_name,
        set_name: result.name,
        label: "Saved opening",
        image_src: result.product_image_src,
        boxes: [],
        slots: [],
        min_cards: result.packs[0].cards.length,
        max_cards: result.packs[0].cards.length,
        unavailable: true,
      };
      boxId = result.box_id;
      quantity = result.count;
      $("productName").textContent = result.name;
      $("productType").textContent = "Saved opening";
      $("productDescription").textContent =
        result.packs.length + " saved packs";
      $("packArtwork").src = result.product_image_src;
    }
    if (!fresh) {
      await prepareSortPrices(currentPack());
      renderPack();
    } else $("previewCards").style.visibility = "hidden";
    ensurePrices();
    requestSealed();
    if (revealed.size > result.revealed.length) queueSave();
  }
  function updateNavigation() {
    if (!opening) return;
    $("cardSort").disabled = busy;
    $("saveButton").disabled = busy;
    $("packNavigation").hidden = combinedBox() || opening.packs.length === 1;
    $("singlePackSummary").hidden = !combinedBox() && opening.packs.length > 1;
    $("packPosition").replaceChildren(
      ...opening.packs.map((p, i) =>
        option(
          i,
          `Pack ${i + 1} of ${opening.packs.length} · ${p.booster_name.replaceAll("-", " ")}`,
        ),
      ),
    );
    $("packPosition").value = packIndex;
    $("previousPack").disabled = busy || packIndex === 0;
    $("nextPack").disabled = busy || packIndex === opening.packs.length - 1;
    $("openRest").hidden = cards().every((c) => revealed.has(c.index));
    $("allCardsLabel").hidden = combinedBox() || opening.packs.length === 1;
    const summaryCards = combinedBox() ? cards() : currentPack().cards;
    const shown = summaryCards.filter((c) => revealed.has(c.index));
    $("singlePackSummary").textContent =
      `${shown.length} / ${summaryCards.length} cards · ${shown.filter((c) => c.rarity === "mythic").length} mythics · ${shown.filter((c) => c.rarity === "rare").length} rares`;
    $("revealPack").hidden = summaryCards.every((c) => revealed.has(c.index));
    setOpenLabel();
  }
  const orderedPacks = new Map();
  function orderedCards(pack) {
    if (orderedPacks.has(pack)) return orderedPacks.get(pack);
    const list = sortCards([...pack.cards].reverse());
    orderedPacks.set(pack, list);
    return list;
  }
  function sortCards(list) {
    const sort = $("cardSort").value,
      rarities = { mythic: 0, rare: 1, uncommon: 2, common: 3 };
    if (sort === "price")
      list.sort((a, b) => (price(b) ?? -1) - (price(a) ?? -1));
    if (sort === "name")
      list.sort((a, b) => a.card_name.localeCompare(b.card_name));
    if (sort === "rarity")
      list.sort(
        (a, b) => (rarities[a.rarity] ?? 9) - (rarities[b.rarity] ?? 9),
      );
    return list;
  }
  async function prepareSortPrices(pack) {
    if (
      source === "none" ||
      $("cardSort").value !== "price" ||
      orderedPacks.has(pack) ||
      pack.cards.every((c) => typeof price(c) === "number")
    )
      return;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch("/api/card-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: pack.cards.map((c) => ({
            card_uuid: c.card_uuid,
            finish: c.finish_type,
          })),
        }),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const result = await response.json();
      if (result.ok && Array.isArray(result.cards))
        result.cards.forEach((c) =>
          quotes.set(`${c.card_uuid}:${c.finish}`, c.prices),
        );
    } catch (_) {
      /* An unavailable quote leaves its card in stable pack order. */
    } finally {
      clearTimeout(timer);
    }
  }
  function renderPack() {
    if (!opening) return;
    const list = combinedBox()
      ? sortCards(opening.packs.flatMap(orderedCards))
      : $("showAllCards").checked
        ? sortCards(
            opening.packs
              .flatMap(orderedCards)
              .filter((c) => revealed.has(c.index)),
          )
        : orderedCards(currentPack());
    $("previewCards").replaceChildren(
      ...list.map((c) => cardTile(c, revealed.has(c.index))),
    );
    updateNavigation();
    renderSidebar();
  }
  function cardTile(card, shown, inPool = false) {
    const tile = node("article", undefined, "chaos-pack-inline-card");
    tile.dataset.cardIndex = card.index ?? "";
    const wrap = node("div", undefined, "chaos-pack-inline-image-wrap"),
      b = node(
        "button",
        undefined,
        "chaos-pack-inline-image-wrap sim-card-button",
      );
    b.type = "button";
    const img = node("img", undefined, "chaos-pack-inline-image");
    img.src = shown ? card.image_src : root.dataset.cardBack;
    img.alt = shown ? card.card_name : "Unrevealed card";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      if (img.src.endsWith(root.dataset.cardBack)) return;
      img.src = root.dataset.cardBack;
    };
    b.setAttribute(
      "aria-label",
      shown ? "View " + card.card_name : "Reveal card",
    );
    b.append(img);
    b.onclick = () => {
      if (busy || img.dataset.cardFlipping) return;
      if (shown) zoom(card, img.src);
      else revealCard(card, tile, img);
    };
    wrap.append(b);
    if (shown) {
      window.DeckadenceCardEffects?.attach(b, {
        isFoil: card.sheet_is_foil,
        promo_types: card.promo_types,
      });
      if (card.back_image_src) {
        let back = false;
        const flip = node("button", "↻", "sim-card-flip");
        flip.type = "button";
        flip.setAttribute("aria-label", "Flip " + card.card_name);
        flip.onclick = () => {
          window.DeckadenceCardEffects.flip(img, () => {
            back = !back;
            img.src = back ? card.back_image_src : card.image_src;
          });
        };
        wrap.append(flip);
      }
    }
    const info = node("div", undefined, "chaos-pack-inline-info"),
      name = node(
        "div",
        shown ? card.card_name : "Click to reveal",
        "chaos-pack-inline-name",
      );
    name.title = shown ? card.card_name : "";
    const meta = node("div", undefined, "chaos-pack-inline-meta-row");
    if (shown) {
      if (source !== "none") {
        const host = node("button", undefined, "chaos-pack-inline-price");
        host.type = "button";
        host.dataset.pricePending = root.classList.contains("is-opening")
          ? "1"
          : "0";
        meta.append(host);
        window.DeckadencePrices?.mount(
          host,
          card,
          quotes.get(key(card)),
          source,
        );
      }
      if (inPool)
        meta.append(
          node(
            "span",
            `${card.set_code} #${card.collector_number}`,
            "sim-muted sim-small",
          ),
        );
      meta.append(node("span", card.rarity, "sim-rarity " + card.rarity));
      if (card.finish_label)
        meta.append(node("span", card.finish_label, "chaos-pack-inline-badge"));
    }
    info.append(name, meta);
    tile.append(wrap, info);
    return tile;
  }
  async function presentPack(index, animate = true, box = false) {
    if (!opening) return;
    root.classList.toggle("is-opening", animate);
    packIndex = Math.max(0, Math.min(index, opening.packs.length - 1));
    $("showAllCards").checked = false;
    const pack = currentPack();
    setBusy(true);
    const revealCards = combinedBox() ? cards() : pack.cards;
    await prepareSortPrices({ cards: revealCards });
    if (!stored("individualReveal", false))
      revealCards.forEach((c) => revealed.add(c.index));
    renderPack();
    queueSave();
    ensurePrices();
    requestSealed();
    if (!animate) {
      setBusy(false);
      return;
    }
    animationController = new AbortController();
    setBusy(true);
    const grid = $("previewCards");
    grid.style.visibility = "hidden";
    const stage = $("packStage");
    const sourceImage = !stage.hidden && !box ? $("packArtwork") : null;
    const prepareGrid = async () => {
      if (
        !stage.hidden &&
        typeof stage.animate === "function" &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const previousOverflow = stage.style.overflow;
        stage.style.overflow = "hidden";
        const a = stage.animate(
          [{ height: stage.offsetHeight + "px" }, { height: "0px" }],
          { duration: 360, fill: "both", easing: "cubic-bezier(.4,0,.2,1)" },
        );
        const cancel = () => a.cancel();
        animationController.signal.addEventListener("abort", cancel, {
          once: true,
        });
        await a.finished.catch(() => {});
        animationController.signal.removeEventListener("abort", cancel);
        stage.hidden = true;
        a.cancel();
        stage.style.overflow = previousOverflow;
      } else stage.hidden = true;
      if (!sourceImage)
        document
          .querySelector(".campaign-draft-stage")
          .scrollIntoView({ behavior: "instant", block: "start" });
    };
    try {
      const art = new Image();
      art.src = pack.image_src || opening.product_image_src;
      await window.DeckadenceSealedEffects?.open({
        grid,
        image: art,
        sourceImage,
        sourcePanel: stage,
        prepareGrid,
        box,
        boxImage: opening.product_image_src,
        boxName: selected.set_name,
        collector: selected.booster_name.toLowerCase().includes("collector"),
        play: selected.booster_name.toLowerCase().includes("play"),
        count: opening.packs.length,
        signal: animationController.signal,
      });
    } catch (_) {
      /* Presentation must never block the saved opening. */
    } finally {
      stage.hidden = true;
      root.classList.remove("is-opening");
      grid.style.visibility = "";
      animationController = null;
      setBusy(false);
      window.DeckadencePrices?.setPending?.(root, false);
      renderSidebar();
      renderSealed();
    }
  }
  $("openButton").onclick = () => {
    if (busy) return;
    if (combinedBox()) {
      if (cards().some((c) => !revealed.has(c.index)))
        reveal(cards().map((c) => c.index));
      else openNew();
      return;
    }
    if (currentPack()?.cards.some((c) => !revealed.has(c.index))) {
      reveal(currentPack().cards.map((c) => c.index));
      return;
    }
    const next =
      opening?.packs.findIndex((p) =>
        p.cards.some((c) => !revealed.has(c.index)),
      ) ?? -1;
    if (next >= 0) presentPack(next);
    else openNew();
  };
  $("packArtworkButton").onclick = openNew;
  $("skipAnimation").onclick = () => animationController?.abort();
  $("previousPack").onclick = () => {
    if (!busy) {
      packIndex--;
      renderPack();
      requestSealed();
    }
  };
  $("nextPack").onclick = () => {
    if (!busy) presentPack(packIndex + 1);
  };
  $("packPosition").onchange = () => {
    if (!busy)
      presentPack(
        Number($("packPosition").value),
        !opening.packs[Number($("packPosition").value)].cards.every((c) =>
          revealed.has(c.index),
        ),
      );
  };
  $("cardSort").onchange = async () => {
    store("sort", $("cardSort").value);
    orderedPacks.clear();
    setBusy(true);
    try {
      await prepareSortPrices(currentPack());
      renderPack();
    } finally {
      setBusy(false);
    }
  };
  $("showAllCards").onchange = renderPack;
  function reveal(indices) {
    const focusIndex =
      document.activeElement.closest("[data-card-index]")?.dataset.cardIndex;
    indices.forEach((i) => revealed.add(i));
    renderPack();
    ensurePrices();
    queueSave();
    if (focusIndex)
      $("previewCards")
        .querySelector(`[data-card-index="${focusIndex}"] button`)
        ?.focus({ preventScroll: true });
  }
  const recentReveals = new Map();
  function sparkle(card, tile) {
    const value = price(card);
    if (
      source === "none" ||
      !(value > 10) ||
      !tile?.isConnected ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      tile.dataset.sparkled
    )
      return;
    tile.dataset.sparkled = "1";
    const bright = value > 50,
      layer = node("span", undefined, "sim-value-sparkles");
    layer.dataset.valueTier = bright ? "50" : "10";
    layer.setAttribute("aria-hidden", "true");
    tile.querySelector(".chaos-pack-inline-image-wrap").append(layer);
    const points = [
      [2, 12],
      [98, 30],
      [18, 1],
      [1, 66],
      [99, 85],
      [69, 99],
      [81, 2],
      [1, 38],
      [98, 56],
      [40, 1],
      [4, 92],
      [40, 99],
      [98, 8],
      [83, 98],
    ];
    const sparks = points.slice(0, bright ? 14 : 7).map(([x, y], i) => {
      const star = node("i");
      star.style.cssText = `left:${x}%;top:${y}%;width:${bright ? 7 : 4}px;height:${bright ? 7 : 4}px;`;
      layer.append(star);
      return star.animate(
        [
          { opacity: 0, transform: "scale(.3) rotate(0deg)" },
          {
            opacity: bright ? 0.8 : 0.45,
            transform: "scale(1) rotate(12deg)",
            offset: 0.35,
          },
          {
            opacity: 0,
            transform: `translate(${x < 50 ? -5 : 5}px,-8px) scale(.3) rotate(24deg)`,
          },
        ],
        {
          duration: bright ? 900 : 650,
          delay: (i % 4) * 55,
          fill: "both",
          easing: "ease-out",
        },
      );
    });
    Promise.allSettled(sparks.map((a) => a.finished)).finally(() => {
      sparks.forEach((a) => a.cancel());
      layer.remove();
    });
  }
  async function revealCard(card, tile, img) {
    const id = opening.id;
    revealed.add(card.index);
    queueSave();
    const changeFace = () => {
      if (opening?.id !== id || !tile.isConnected) return img;
      const replacement = cardTile(card, true);
      tile.replaceWith(replacement);
      recentReveals.set(key(card), {
        tile: replacement,
        at: performance.now(),
      });
      sparkle(card, replacement);
      updateNavigation();
      renderSidebar();
      ensurePrices();
      replacement.querySelector("button").focus({ preventScroll: true });
      return replacement.querySelector("img");
    };
    if (window.DeckadenceCardEffects?.flip)
      await window.DeckadenceCardEffects.flip(img, changeFace);
    else changeFace();
  }
  $("revealPack").onclick = () =>
    reveal((combinedBox() ? cards() : currentPack().cards).map((c) => c.index));
  $("openRest").onclick = () => {
    reveal(cards().map((c) => c.index));
    $("showAllCards").checked = true;
    renderPack();
  };
  function queueSave() {
    if (!opening) return;
    rememberOpening();
    const values = [...revealed];
    store("reveals." + opening.id, values);
    pendingSaves.set(opening.id, values);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveReveals, 250);
  }
  async function saveReveals() {
    if (saving) return;
    saving = true;
    try {
      while (pendingSaves.size) {
        const [id, indices] = pendingSaves.entries().next().value;
        await api(`openings/${id}/reveal`, { indices });
        if (pendingSaves.get(id) === indices) pendingSaves.delete(id);
      }
      if ($("simStatus").dataset.saveFailure) {
        status("");
        delete $("simStatus").dataset.saveFailure;
      }
    } catch (_) {
      status(
        "Your cards are still here. Reveal progress could not be saved to the app.",
        saveReveals,
      );
      $("simStatus").dataset.saveFailure = "1";
    } finally {
      saving = false;
    }
  }
  function ensurePrices() {
    if (source === "none" || !opening) return;
    // Warm both quotes for the pack's upcoming reveals without displaying them.
    for (const card of [
      ...shownCards(),
      ...currentPack().cards,
      ...sessionEntries().flatMap((o) => o.packs.flatMap((p) => p.cards)),
    ]) {
      const k = key(card);
      if (priceHosts.has(k)) continue;
      priceHosts.add(k);
      const host = node("button");
      host.type = "button";
      $("simPriceCache").append(host);
      window.DeckadencePrices?.mount(host, card, quotes.get(k), source);
    }
  }
  root.addEventListener("deckadence:prices", (event) => {
    if (!opening) return;
    quotes.set(
      `${event.target.dataset.priceCardUuid}:${event.target.dataset.priceFinish}`,
      event.detail,
    );
    const k = `${event.target.dataset.priceCardUuid}:${event.target.dataset.priceFinish}`;
    const recent = recentReveals.get(k);
    if (recent && performance.now() - recent.at < 800) {
      const card = currentPack().cards.find((c) => key(c) === k);
      if (card) sparkle(card, recent.tile);
    } else if (recent) recentReveals.delete(k);
    if (!sidebarFrame)
      sidebarFrame = requestAnimationFrame(() => {
        sidebarFrame = 0;
        renderSidebar();
      });
  });
  const sealedKey = (p, box = "") => productKey(p) + ":" + (box || "pack");
  function sealedTarget() {
    if (opening?.box_id) return { p: opening, box: opening.box_id };
    if (opening && $("valueScope").value === "pack")
      return { p: currentPack(), box: null };
    return { p: selected, box: boxId };
  }
  async function requestSealed() {
    clearTimeout(sealedTimer);
    const generation = ++sealedGeneration;
    if (source === "none" || (!selected && !opening)) return;
    const targets = [
      { p: selected, box: boxId },
      { p: opening ? currentPack() : selected, box: null },
      ...sessionEntries().map((o) => ({ p: o, box: o.box_id })),
    ];
    const unique = new Map(targets.map((t) => [sealedKey(t.p, t.box), t]));
    async function check(attempt = 0) {
      if (generation !== sealedGeneration || document.hidden) return;
      let pending = false;
      await Promise.allSettled(
        [...unique].map(async ([k, t]) => {
          try {
            const result = await api(
              "prices?" +
                query(t.p) +
                (t.box ? "&box=" + encodeURIComponent(t.box) : ""),
              undefined,
              5000,
            );
            if (generation !== sealedGeneration) return;
            if (result.product) {
              sealed.set(k, result.product);
              pending ||= Object.values(result.product.prices).some(
                (p) => p.refreshing,
              );
            }
          } catch (_) {
            if (generation === sealedGeneration && !sealed.has(k))
              sealed.set(k, {
                prices: {
                  manapool: { price: null, status: "error" },
                  cardkingdom: { price: null, status: "error" },
                },
              });
          }
        }),
      );
      if (generation !== sealedGeneration) return;
      renderSealed();
      renderSidebar();
      if (pending && attempt < 12)
        sealedTimer = setTimeout(
          () => check(attempt + 1),
          Math.min(5000, 600 * (attempt + 1)),
        );
      else if (pending) {
        for (const k of unique.keys()) {
          const value = sealed.get(k);
          for (const q of Object.values(value?.prices || {})) {
            if (q.refreshing) {
              q.refreshing = false;
              q.status = "error";
            }
          }
        }
        renderSealed();
        renderSidebar();
      }
    }
    check();
  }
  function renderSealed() {
    if (source === "none" || !selected) return;
    const t = opening
      ? opening.box_id
        ? { p: opening, box: opening.box_id }
        : { p: currentPack(), box: null }
      : { p: selected, box: boxId };
    const result = sealed.get(sealedKey(t.p, t.box)),
      quote = result?.prices?.[source];
    $("sealedPrice").textContent =
      `${t.box ? "Box" : "Pack"} ${source === "manapool" ? "market" : "price"} · ${money(quote?.price)}`;
    $("sealedPrice").title =
      Object.entries(result?.prices || {})
        .map(([v, q]) => `${vendors[v]}: ${money(q.price)}`)
        .join("\n") || "Prices are loading";
  }
  function toggleSidebar(show) {
    if (source === "none") return;
    $("priceSidebar").hidden = !show;
    root.classList.toggle("prices-open", show);
    $("detailsButton").setAttribute("aria-expanded", String(show));
    store("priceSidebar", show);
    if (show) {
      renderSidebar();
      requestSealed();
    }
  }
  $("detailsButton").onclick = () => toggleSidebar($("priceSidebar").hidden);
  $("sealedPrice").onclick = () => toggleSidebar(true);
  $("closePrices").onclick = () => {
    toggleSidebar(false);
    $("detailsButton").focus();
  };
  function quoteNote(q) {
    if (!q) return "Checking…";
    if (q.stale) return "Cached · updating when available";
    if (q.status === "loading") return "Checking…";
    if (q.status === "error") return "Temporarily unavailable";
    if (q.price == null) return "No matching price available";
    if (q.quantity === 0) return "Out of stock";
    return q.fetched_at
      ? "Checked " + new Date(q.fetched_at * 1000).toLocaleDateString()
      : "";
  }
  const sessionOpenings = new Map();
  const resetOpeningIds = new Set();
  let sessionDay = new Date().toDateString();
  function rememberOpening() {
    const today = new Date().toDateString();
    if (today !== sessionDay) {
      sessionOpenings.clear();
      sessionDay = today;
    }
    if (
      opening &&
      !resetOpeningIds.has(opening.id) &&
      new Date(opening.created_at * 1000).toDateString() === today
    )
      sessionOpenings.set(opening.id, { ...opening, revealed: [...revealed] });
  }
  function sessionEntries() {
    rememberOpening();
    return [...sessionOpenings.values()];
  }
  function valueSummary() {
    if ($("valueScope").value === "opening") {
      const entries = sessionEntries();
      return {
        entries,
        list: entries.flatMap((o) =>
          o.packs
            .flatMap((p) => p.cards)
            .filter((c) => o.revealed.includes(c.index)),
        ),
        expected: entries.reduce((n, o) => n + o.card_count, 0),
        packCount: entries.reduce((n, o) => n + o.packs.length, 0),
      };
    }
    if (opening?.box_id) {
      return {
        entries: [opening],
        list: opening.packs
          .flatMap((p) => p.cards)
          .filter((c) => revealed.has(c.index)),
        expected: opening.card_count,
        packCount: opening.packs.length,
      };
    }
    return {
      entries: null,
      list: currentPack().cards.filter((c) => revealed.has(c.index)),
      expected: currentPack().cards.length,
      packCount: 1,
    };
  }
  function marketCost(vendor, summary) {
    const targets = summary.entries
      ? summary.entries.map((o) => ({
          p: o,
          box: o.box_id,
          count: o.box_id ? 1 : o.packs.length,
        }))
      : [{ p: currentPack(), box: null, count: 1 }];
    const costs = targets.map((t) => {
      const value = sealed.get(sealedKey(t.p, t.box))?.prices?.[vendor]?.price;
      return typeof value === "number" && Number.isFinite(value)
        ? Math.round(value * 100) * t.count
        : null;
    });
    return costs.every((n) => n !== null)
      ? costs.reduce((a, b) => a + b, 0)
      : null;
  }
  function pullValues(list, vendor) {
    const value = (card) => {
      const own = price(card, vendor);
      return Number.isFinite(own)
        ? own
        : price(card, vendor === "manapool" ? "cardkingdom" : "manapool");
    };
    const input = $("excludeBelow");
    const threshold =
      input?.value && input.checkValidity()
        ? Number(input.value)
        : Number(stored("excludeBelow", 2));
    const minimum = $("excludeLowCards")?.checked
      ? Math.round(threshold * 100)
      : 0;
    const available = list.filter((c) => Number.isFinite(value(c)));
    const included = available.filter(
      (c) => Math.round(value(c) * 100) >= minimum,
    );
    return {
      available,
      included,
      total: included.reduce((sum, c) => sum + Math.round(value(c) * 100), 0),
      excluded: available.length - included.length,
      fallback: available.filter((c) => !Number.isFinite(price(c, vendor)))
        .length,
    };
  }
  function renderProfit() {
    const panel = $("profitPanel");
    if (!panel || !opening) return;
    panel.dataset.result = "pending";
    panel.querySelector("h3").textContent = "Profit / Loss";
    $("profitValue").textContent = "—";
    $("profitBasis").textContent = "Card value − market price";
    if (root.classList.contains("is-opening")) {
      window.DeckadenceProfitEffects?.update(panel, null, null);
      return;
    }
    const summary = valueSummary();
    if (!summary.expected) {
      window.DeckadenceProfitEffects?.update(panel, null, null);
      $("profitBasis").textContent = "No packs opened today in this session.";
      return;
    }
    if (summary.list.length < summary.expected) {
      window.DeckadenceProfitEffects?.update(panel, null, null);
      $("profitBasis").textContent =
        "Reveal all cards to calculate profit or loss.";
      return;
    }
    const valueSource = root.dataset.valueSource || "lower";
    const required =
      valueSource === "lower" ? Object.keys(vendors) : [valueSource];
    const totals = required.map((v) => {
      const values = pullValues(summary.list, v);
      return {
        vendor: v,
        total:
          values.available.length === summary.expected ? values.total : null,
        cost: marketCost(v, summary),
      };
    });
    const completeTotals = totals.filter((t) => t.total !== null);
    const availableCosts = totals.filter((t) => t.cost !== null);
    if (!completeTotals.length || !availableCosts.length) {
      window.DeckadenceProfitEffects?.update(panel, null, null);
      $("profitBasis").textContent =
        "Waiting for complete card and market prices.";
      return;
    }
    const chosen = completeTotals.reduce((a, b) =>
      a.total <= b.total ? a : b,
    );
    const market = availableCosts.reduce((a, b) => (a.cost <= b.cost ? a : b));
    const difference = chosen.total - market.cost;
    window.DeckadenceProfitEffects?.update(
      panel,
      chosen.total,
      market.cost,
      `${opening.id}:${$("valueScope").value}:${packIndex}`,
    );
    panel.dataset.result =
      difference > 0 ? "profit" : difference < 0 ? "loss" : "even";
    panel.querySelector("h3").textContent =
      difference > 0 ? "Profit" : difference < 0 ? "Loss" : "Break even";
    $("profitValue").textContent =
      `${difference < 0 ? "−" : difference > 0 ? "+" : ""}${money(Math.abs(difference) / 100)}`;
    $("profitBasis").textContent =
      `${money(chosen.total / 100)} pull value − ${money(market.cost / 100)} market price. ` +
      (valueSource === "lower"
        ? completeTotals.length === 1
          ? `Uses the complete ${vendors[chosen.vendor]} pull value.`
          : "Uses the lower vendor values."
        : "Uses your Settings selection.");
  }
  function renderSidebar() {
    if (source === "none" || !selected) return;
    $("valueScope").querySelector('option[value="pack"]').textContent = (
      opening ? opening.box_id : boxId
    )
      ? "This box"
      : "This pack";
    const target = sealedTarget(),
      product = sealed.get(sealedKey(target.p, target.box));
    $("detailsProduct").textContent = opening
      ? opening.name
      : selected.set_name + " · " + selected.label;
    $("sealedPriceHeading").textContent = target.box
      ? "Current box prices"
      : "Current pack prices";
    if (
      opening &&
      $("valueScope").value === "opening" &&
      (target.box
        ? valueSummary().entries.length > 1
        : valueSummary().packCount > 1)
    )
      $("sealedPriceHeading").textContent = target.box
        ? "Box price totals"
        : "Pack price totals";
    $("sealedValues").replaceChildren(
      ...Object.entries(vendors).map(([v, label]) => {
        const q = product?.prices[v],
          row = node("div", undefined, "sim-market-row"),
          text = node("div");
        text.append(
          node("span", label),
          node(
            "small",
            (v === "manapool" ? "Market price" : "Retail price") +
              " · " +
              quoteNote(q),
          ),
        );
        const cost = opening ? marketCost(v, valueSummary()) : null;
        const amount = money(
          opening ? (cost === null ? null : cost / 100) : q?.price,
        );
        row.append(
          text,
          node(
            "strong",
            amount === "—" ? amount : "− " + amount,
            "sim-price-cost",
          ),
        );
        return row;
      }),
    );
    $("pullsSection").hidden = !opening;
    $("detailStats").hidden = !opening;
    $("resetOpenings").hidden = !opening || $("valueScope").value !== "opening";
    $("resetOpenings").disabled =
      root.classList.contains("is-opening") || sessionEntries().length === 0;
    if (!opening) return;
    renderProfit();
    const summary = valueSummary(),
      scope = $("valueScope").value,
      list = summary.list,
      expected = summary.expected;
    $("detailStats").textContent =
      `${summary.packCount} pack${summary.packCount === 1 ? "" : "s"} · ${list.length} / ${expected} cards revealed · ${list.filter((c) => c.rarity === "mythic").length} mythics · ${list.filter((c) => c.rarity === "rare").length} rares`;
    $("marketValues").replaceChildren(
      ...Object.entries(vendors).map(([v, label]) => {
        const values = pullValues(list, v),
          available = values.available,
          total = values.total / 100,
          complete = available.length === expected;
        const row = node("div", undefined, "sim-market-row"),
          text = node("div");
        text.append(
          node("span", label + (complete ? " pull value" : " pull subtotal")),
          node("small", `${available.length} / ${expected} cards priced`),
        );
        if (values.fallback)
          text.append(
            node(
              "small",
              `${values.fallback} using ${vendors[v === "manapool" ? "cardkingdom" : "manapool"]} pricing`,
            ),
          );
        if ($("excludeLowCards")?.checked)
          text.append(
            node(
              "small",
              `${values.included.length} included · ${values.excluded} below minimum`,
            ),
          );
        const staleCount = available.filter(
          (c) => quotes.get(key(c))?.[v]?.stale,
        ).length;
        if (staleCount)
          text.append(node("small", `${staleCount} cached prices`));
        const marketCents = marketCost(v, summary);
        const cost = marketCents === null ? null : marketCents / 100;
        if (complete && cost != null) {
          const delta = total - cost;
          text.append(
            node(
              "small",
              root.classList.contains("is-opening")
                ? "—"
                : `${delta < 0 ? "−" : "+"}${money(Math.abs(delta))} vs ${scope === "opening" ? "opening market price" : opening.box_id ? "box price" : "pack price"}`,
            ),
          );
        }
        row.append(
          text,
          node(
            "strong",
            available.length ? money(total) : "—",
            total > 0 ? "sim-price-pull" : "",
          ),
        );
        return row;
      }),
    );
    const vendor = $("detailSource").value,
      sorted = [...list].sort(
        (a, b) => (price(b, vendor) ?? -1) - (price(a, vendor) ?? -1),
      );
    $("topPulls").replaceChildren(
      ...sorted
        .filter((c) => price(c, vendor) != null)
        .slice(0, 3)
        .map((c) => {
          const b = node("button", undefined, "sim-pull");
          b.type = "button";
          const img = node("img");
          img.src = c.image_src;
          img.alt = "";
          const text = node("span", c.card_name);
          text.append(
            node(
              "small",
              `${c.set_code} #${c.collector_number}${c.finish_label ? " · " + c.finish_label : ""}`,
            ),
          );
          b.append(img, text, node("strong", money(price(c, vendor))));
          b.onclick = () => zoom(c);
          return b;
        }),
    );
    if (!$("topPulls").childElementCount) {
      const checking = list.some((c) => {
        const q = quotes.get(key(c))?.[vendor];
        return !q || q.refreshing || q.status === "loading";
      });
      $("topPulls").append(
        node(
          "p",
          !list.length
            ? "Reveal cards to see your top pulls."
            : checking
              ? `Checking ${vendors[vendor]} prices…`
              : `No ${vendors[vendor]} prices available for these cards.`,
          "sim-muted sim-small",
        ),
      );
    }
    $("priceRows").replaceChildren(
      ...sorted.map((c) => {
        const row = node("tr");
        row.append(
          node(
            "td",
            c.card_name + (c.finish_label ? " · " + c.finish_label : ""),
          ),
          node("td", money(price(c, "manapool"))),
          node("td", money(price(c, "cardkingdom"))),
        );
        return row;
      }),
    );
  }
  $("valueScope").onchange = () => {
    renderSidebar();
    requestSealed();
  };
  $("resetOpenings").onclick = () => {
    for (const id of sessionOpenings.keys()) resetOpeningIds.add(id);
    if (opening) resetOpeningIds.add(opening.id);
    sessionOpenings.clear();
    renderSidebar();
  };
  if ($("excludeLowCards") && $("excludeBelow")) {
    $("excludeLowCards").checked = stored("excludeLowCards", false) === true;
    const savedMinimum = Number(stored("excludeBelow", 2));
    $("excludeBelow").value =
      Number.isFinite(savedMinimum) &&
      savedMinimum >= 0 &&
      savedMinimum <= 1000000
        ? savedMinimum
        : 2;
    $("excludeLowCards").onchange = () => {
      store("excludeLowCards", $("excludeLowCards").checked);
      renderSidebar();
    };
    $("excludeBelow").oninput = () => {
      if (!$("excludeBelow").value || !$("excludeBelow").checkValidity())
        return;
      store("excludeBelow", Number($("excludeBelow").value));
      renderSidebar();
    };
    $("excludeBelow").onchange = () => {
      if (!$("excludeBelow").value || !$("excludeBelow").checkValidity()) {
        $("excludeBelow").value = stored("excludeBelow", 2);
        renderSidebar();
      }
    };
  }
  $("detailSource").value = source === "none" ? "manapool" : source;
  $("detailSource").onchange = renderSidebar;
  function zoom(card, src) {
    $("zoomImage").src = src || card.image_src;
    $("zoomImage").alt = card.card_name;
    $("zoomLabel").textContent = card.card_name;
    delete $("zoomSurface").dataset.cardFinish;
    window.DeckadenceCardEffects?.attach($("zoomSurface"), {
      isFoil: card.sheet_is_foil,
      promo_types: card.promo_types,
    });
    let back = src === card.back_image_src;
    $("flipZoom").hidden = !card.back_image_src;
    $("flipZoom").onclick = () => {
      back = !back;
      $("zoomImage").src = back ? card.back_image_src : card.image_src;
    };
    $("zoomDialog").showModal();
  }
  async function showLayout() {
    if (!selected || !selected.slots.length) {
      status(
        "Pack Layout is temporarily unavailable. Your saved cards are still available.",
      );
      return;
    }
    const p = selected;
    $("layoutProduct").textContent = p.set_name + " / " + p.label;
    $("slotList").replaceChildren(
      ...p.slots.map((slot) => {
        const b = node("button", undefined, "sim-slot");
        b.type = "button";
        b.dataset.slot = slot.name;
        const text = node("div");
        text.append(
          node("strong", slot.label),
          node(
            "small",
            `${slot.foil ? "Foil" : "Nonfoil"} · ${slot.pool_count} cards · ${Math.round(slot.chance * 1000) / 10}% chance`,
          ),
        );
        b.append(
          node(
            "span",
            slot.min === slot.max
              ? String(slot.min)
              : `${slot.min}–${slot.max}`,
            "sim-slot-count",
          ),
          text,
        );
        b.onclick = () => chooseSlot(slot, p);
        return b;
      }),
    );
    $("layoutDialog").showModal();
    chooseSlot(p.slots[0], p);
  }
  async function chooseSlot(slot, p) {
    const rev = ++poolRevision;
    activeSlot = slot;
    pool = [];
    poolLimit = 24;
    $("poolSearch").value = "";
    $("poolRarity").value = "";
    document
      .querySelectorAll(".sim-slot")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.slot === slot.name)),
      );
    $("slotTitle").textContent = slot.label;
    $("slotDescription").textContent = "Loading card pool…";
    $("poolCards").replaceChildren();
    $("poolMore").hidden = true;
    try {
      const r = await api(
        "pool?" + query(p) + "&sheet=" + encodeURIComponent(slot.name),
      );
      if (rev !== poolRevision) return;
      pool = r.cards;
      renderPool();
    } catch (e) {
      if (rev === poolRevision) $("slotDescription").textContent = e.message;
    }
  }
  function renderPool() {
    const search = $("poolSearch").value.toLowerCase(),
      rarity = $("poolRarity").value,
      list = pool.filter(
        (c) =>
          (!rarity || c.rarity === rarity) &&
          c.card_name.toLowerCase().includes(search),
      );
    $("slotDescription").textContent =
      `${list.length} cards · ${activeSlot.foil ? "Foil" : "Nonfoil"} · Slot appears in ${Math.round(activeSlot.chance * 1000) / 10}% of packs`;
    $("poolCards").replaceChildren(
      ...list.slice(0, poolLimit).map((c) => cardTile(c, true, true)),
    );
    $("poolMore").hidden = list.length <= poolLimit;
    if (!list.length)
      $("poolCards").append(
        node("p", "No cards match these filters.", "sim-muted"),
      );
  }
  $("packLayoutButton").onclick = showLayout;
  $("poolSearch").oninput = () => {
    poolLimit = 24;
    renderPool();
  };
  $("poolRarity").onchange = () => {
    poolLimit = 24;
    renderPool();
  };
  $("poolMore").onclick = () => {
    poolLimit += 24;
    renderPool();
  };
  async function showHistory() {
    $("historyItems").textContent = "Loading saved openings…";
    $("historyDialog").showModal();
    try {
      const r = await api("history");
      $("historyItems").replaceChildren(
        ...r.openings.map((saved) => {
          const b = node("button", undefined, "sim-history-item");
          b.type = "button";
          const text = node("span", saved.name);
          text.append(
            node(
              "small",
              `${saved.pack_count} packs · ${saved.revealed_count}/${saved.card_count} revealed · ${new Date(saved.created_at * 1000).toLocaleString()}`,
            ),
          );
          b.append(text, node("span", "→"));
          b.onclick = async () => {
            b.disabled = true;
            try {
              const r = await api("openings/" + saved.id);
              await useOpening(r.opening);
              $("historyDialog").close();
              status("");
            } catch (e) {
              $("historyItems").prepend(node("p", e.message, "sim-muted"));
              b.disabled = false;
            }
          };
          return b;
        }),
      );
      if (!r.openings.length)
        $("historyItems").textContent = "No saved openings yet.";
    } catch (e) {
      $("historyItems").textContent = e.message;
    }
  }
  document.querySelector('[data-dialog="historyDialog"]').onclick = showHistory;
  let saveTarget = null,
    destinations = null,
    destinationRevision = 0,
    savingPack = false;
  const savePreferences = stored("saveDestination", {});
  function rememberDestination() {
    savePreferences.kind = $("saveKind").value;
    const destination = $("saveDestination").value;
    if (destination) savePreferences[savePreferences.kind] = destination;
    store("saveDestination", savePreferences);
  }
  function renderDestinations() {
    const kind = $("saveKind").value;
    const entries =
      destinations?.[kind === "campaign" ? "campaigns" : "sets"] || [];
    $("saveDestinationLabel").textContent =
      kind === "campaign" ? "Campaign" : "Custom draft set";
    $("saveDestination").replaceChildren(
      ...entries.map((d) => option(d.id, d.name)),
    );
    if (entries.some((d) => String(d.id) === String(savePreferences[kind])))
      $("saveDestination").value = savePreferences[kind];
    if (!entries.length)
      $("saveDestination").append(
        option(
          "",
          destinations ? "No active destinations available" : "Loading…",
        ),
      );
    $("saveDestination").disabled = savingPack || !entries.length;
    $("confirmSave").disabled = savingPack || !entries.length;
    $("saveDescription").textContent =
      kind === "campaign"
        ? "Keep this complete pack in the campaign, ready to open during a draft."
        : "Add these cards to the set’s card pool. Custom sets keep one printing per card name; cards already in the set stay unchanged.";
    $("confirmSave").textContent =
      kind === "campaign" ? "Save pack" : "Add cards";
  }
  async function loadDestinations() {
    const revision = ++destinationRevision;
    destinations = null;
    $("saveStatus").textContent = "";
    $("saveRetry").hidden = true;
    renderDestinations();
    try {
      const result = await api("save-destinations");
      if (revision !== destinationRevision) return;
      destinations = result;
      renderDestinations();
    } catch (e) {
      if (revision !== destinationRevision) return;
      $("saveStatus").textContent = e.message;
      $("saveRetry").hidden = false;
    }
  }
  $("saveButton").onclick = () => {
    if (!opening || busy || savingPack) return;
    saveTarget = { id: opening.id, pack_index: packIndex };
    $("savePackSummary").textContent =
      `${currentPack().name} · Pack ${packIndex + 1} · ${currentPack().cards.length} cards`;
    $("saveKind").value = savePreferences.kind === "set" ? "set" : "campaign";
    $("saveDialog").showModal();
    loadDestinations();
  };
  $("saveKind").onchange = () => {
    renderDestinations();
    rememberDestination();
    $("saveStatus").textContent = "";
  };
  $("saveDestination").onchange = () => {
    rememberDestination();
    $("saveStatus").textContent = "";
  };
  $("saveRetry").onclick = loadDestinations;
  $("confirmSave").onclick = async () => {
    if (savingPack || !saveTarget || !$("saveDestination").value) return;
    const target = { ...saveTarget };
    const data = {
      pack_index: target.pack_index,
      kind: $("saveKind").value,
      destination: $("saveDestination").value,
    };
    rememberDestination();
    savingPack = true;
    $("saveKind").disabled = true;
    renderDestinations();
    $("saveStatus").textContent = "Saving…";
    try {
      const result = await api(`openings/${target.id}/save`, data, 30000);
      $("saveStatus").textContent = result.message;
    } catch (e) {
      $("saveStatus").textContent = e.message;
      $("saveRetry").hidden = false;
    } finally {
      savingPack = false;
      $("saveKind").disabled = false;
      renderDestinations();
    }
  };
  document
    .querySelectorAll(".pack-simulator [data-close]")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  document.querySelectorAll(".pack-simulator dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.querySelector("dialog[open]"))
      toggleSidebar(false);
  });
  window.addEventListener("online", () => {
    saveReveals();
    requestSealed();
  });
  window.addEventListener("pagehide", () => {
    for (const [id, indices] of pendingSaves)
      navigator.sendBeacon(
        `/api/pack-simulator/openings/${id}/reveal`,
        new Blob([JSON.stringify({ indices })], { type: "application/json" }),
      );
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestSealed();
  });
  async function start() {
    const saved = new URL(location.href).searchParams.get("opening");
    const results = await Promise.allSettled([
      api("catalog"),
      saved
        ? api("openings/" + encodeURIComponent(saved))
        : Promise.resolve(null),
    ]);
    if (results[0].status === "fulfilled") {
      catalog = results[0].value.products;
      $("boosterFilter").replaceChildren(
        option("", "All boosters"),
        ...[...new Map(catalog.map((p) => [p.booster_name, p.label]))].map(
          ([v, label]) => option(v, label),
        ),
      );
    } else status(results[0].reason.message, start);
    if (results[1].status === "fulfilled" && results[1].value) {
      await useOpening(results[1].value.opening);
    } else if (catalog.length) {
      const choice = stored("selection", {}),
        today = new Date().toISOString().slice(0, 10);
      const p =
        catalog.find(
          (p) => p.set_code === choice.set && p.booster_name === choice.booster,
        ) ||
        catalog.find((p) => p.release_date <= today) ||
        catalog[0];
      try {
        selected = await getProduct(p);
        boxId = selected.boxes.some((b) => b.id === choice.box)
          ? choice.box
          : null;
        quantity =
          Number.isInteger(choice.count) &&
          choice.count >= 1 &&
          choice.count <= 36
            ? choice.count
            : 1;
        updateProduct();
        requestSealed();
      } catch (e) {
        status(e.message, start);
      }
      if (results[1].status === "rejected") status(results[1].reason.message);
    } else
      $("productDescription").textContent =
        "Download the card database in Settings to open packs.";
    window.DeckadenceSealedEffects?.attach($("packArtworkButton"));
    toggleSidebar(stored("priceSidebar", false));
    setBusy(false);
  }
  start();
})();
