// *** APP CONTROLS - Setup Shared Page Actions ***
// Personal tracking tags are independent of deck membership and artwork.
(() => {
  let state = {tags: [], assignments: {}};
  let loaded = false;
  let pending = Promise.resolve();
  const filters = new Map();
  const menus = new Set();
  let openFilter = null;
  let filterSequence = 0;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("deckadence-card-tags") : null;
  const cardSelector = ".deckbuilder-card, .deckbuilder-land-palette-card, .custom-draft-current-card-row, .custom-draft-current-grid-card, .chaos-pack-view-card, .custom-draft-card-search-row, [data-tracking-card]";

  function identity(card) {
    const uuid = card?.dataset.cardUuid || "";
    return uuid.startsWith("custom-") ? "custom:" + uuid :
      "name:" + String(card?.dataset.cardName || "").trim().toLowerCase();
  }
  function values(scope) {
    const selected = filters.get(scope) || new Map();
    return {include: [...selected].filter(([, value]) => value === "include").map(([id]) => id),
      exclude: [...selected].filter(([, value]) => value === "exclude").map(([id]) => id)};
  }
  function active(scope) {
    const selected = values(scope);
    return selected.include.length + selected.exclude.length > 0;
  }
  function matches(card, scope) {
    if (!active(scope)) return true;
    if (!loaded) return false;
    const assigned = state.assignments[identity(card)] || [];
    const selected = values(scope);
    return selected.include.every(id => assigned.includes(id)) && selected.exclude.every(id => !assigned.includes(id));
  }
  function announce(scope) {
    document.dispatchEvent(new CustomEvent("deckadence:tag-filters-changed", {detail: {scope}}));
  }
  function reset(scope) {
    filters.delete(scope);
    document.querySelectorAll("[data-tag-filter]").forEach(host => {
      if (host.dataset.tagFilter === scope) renderFilter(host);
    });
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function clampMenu(menu) {
    const box = menu.getBoundingClientRect();
    if (!box.width) return;
    menu.style.top = Math.max(10, Math.min(box.top, innerHeight - box.height - 10)) + "px";
    menu.style.left = Math.max(10, Math.min(box.left, innerWidth - box.width - 10)) + "px";
  }
  function accept(payload) {
    state = payload;
    loaded = true;
    const valid = new Set(state.tags.map(tag => tag.tag_id));
    const changedScopes = new Set();
    filters.forEach((selected, scope) => selected.forEach((value, id) => {
      if (!valid.has(id)) {selected.delete(id); changedScopes.add(scope);}
    }));
    document.querySelectorAll("[data-tag-filter]").forEach(renderFilter);
    menus.forEach(menu => {if (menu.isConnected) renderMenu(menu); else menus.delete(menu);});
    renderConfig();
    document.dispatchEvent(new CustomEvent("deckadence:card-tags-changed"));
    changedScopes.forEach(announce);
  }
  function api(path = "", body, method) {
    // Keep local reads and writes in order so an earlier response cannot undo
    // the displayed state of a later click.
    const operation = pending.catch(() => {}).then(async () => {
      const response = await fetch("/api/card-tracking-tags" + path, {
        method: method || (body === undefined ? "GET" : "POST"), cache: "no-store",
        headers: {"Content-Type": "application/json", Accept: "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Could not save card tags.");
      accept(payload);
      if (body !== undefined || method === "DELETE") channel?.postMessage("changed");
      return payload;
    });
    pending = operation;
    return operation;
  }
  function closeTagFilter(restoreFocus = false) {
    if (!openFilter) return;
    const {button, panel} = openFilter;
    if (typeof panel.hidePopover === "function" && panel.matches(":popover-open")) panel.hidePopover();
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    openFilter = null;
    if (restoreFocus) button.focus();
  }
  function positionTagFilter() {
    if (!openFilter) return;
    const {button, panel} = openFilter;
    const box = button.getBoundingClientRect();
    const below = innerHeight - box.bottom - 14;
    const above = box.top - 14;
    const upward = below < Math.min(panel.scrollHeight, 340) && above > below;
    panel.style.maxHeight = Math.max(100, upward ? above : below) + "px";
    const size = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(box.right - size.width, innerWidth - size.width - 8)) + "px";
    panel.style.top = Math.max(8, upward ? box.top - size.height - 6 : box.bottom + 6) + "px";
  }
  function showTagFilter(host, button, panel) {
    closeTagFilter();
    panel.hidden = false;
    if (typeof panel.showPopover === "function") panel.showPopover();
    button.setAttribute("aria-expanded", "true");
    openFilter = {host, button, panel};
    positionTagFilter();
  }
  function renderFilter(host) {
    const scope = host.dataset.tagFilter;
    const wasOpen = openFilter?.host === host;
    if (wasOpen) closeTagFilter();
    host.classList.add("custom-draft-filter-field", "tracking-tag-field");
    const inline = host.dataset.tagFilterLabel === "inline";
    const deck = scope === "deck" || scope === "sideboard";
    const controlClass = deck ? "campaign-test-draft-picked-sort-select" : "custom-draft-filter-input custom-draft-multi-select-button";
    const button = element("button", undefined, controlClass + " tracking-tag-filter-toggle");
    button.type = "button";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-haspopup", "dialog");
    const label = element("span", "Tags", "tracking-tag-field-label");
    const value = element("span", undefined, "tracking-tag-filter-value");
    if (inline) button.append(label);
    button.append(value);
    const arrow = element("span", "▾", "custom-draft-multi-select-chevron");
    arrow.setAttribute("aria-hidden", "true");
    button.append(arrow);
    const updateValue = () => {
      const selected = values(scope);
      const count = selected.include.length + selected.exclude.length;
      value.textContent = count ? count + " selected" : "Any";
      button.setAttribute("aria-label", "Tags: " + value.textContent);
    };
    updateValue();
    const panel = element("div", undefined, "tracking-tag-filter-panel");
    panel.id = "trackingTagFilter" + (++filterSequence);
    panel.hidden = true;
    if (typeof panel.showPopover === "function") panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Tag filters");
    button.setAttribute("aria-controls", panel.id);
    panel.append(element("p", "Match all included tags; hide any excluded tags.", "tracking-tag-hint"));
    const list = element("div", undefined, "tracking-tag-filter-list");
    state.tags.forEach(tag => {
      const label = element("label", undefined, "tracking-tag-filter-row");
      label.append(element("span", tag.name));
      const select = element("select", undefined, deck ? "campaign-test-draft-picked-sort-select" : "custom-draft-filter-input");
      select.setAttribute("aria-label", tag.name + " tag filter");
      [["", "Any"], ["include", "Include"], ["exclude", "Exclude"]].forEach(([value, text]) => {
        const option = element("option", text); option.value = value; select.append(option);
      });
      select.value = filters.get(scope)?.get(tag.tag_id) || "";
      select.addEventListener("change", () => {
        if (!filters.has(scope)) filters.set(scope, new Map());
        if (select.value) filters.get(scope).set(tag.tag_id, select.value);
        else filters.get(scope).delete(tag.tag_id);
        updateValue();
        announce(scope);
      });
      label.append(select); list.append(label);
    });
    if (!loaded) list.append(element("p", "Loading tags…", "tracking-tag-hint"));
    panel.append(list);
    const clear = element("button", "Clear tag filters", "tracking-tag-link"); clear.type = "button";
    clear.addEventListener("click", () => {
      filters.delete(scope);
      list.querySelectorAll("select").forEach(select => {select.value = "";});
      updateValue();
      announce(scope);
    });
    panel.append(clear);
    button.addEventListener("click", () => {
      if (openFilter?.host === host) closeTagFilter();
      else showTagFilter(host, button, panel);
    });
    button.addEventListener("keydown", event => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      showTagFilter(host, button, panel);
      panel.querySelector("select, button")?.focus();
    });
    host.replaceChildren(...(inline ? [] : [label]), button, panel);
    if (wasOpen) showTagFilter(host, button, panel);
  }
  document.addEventListener("click", event => {
    if (openFilter && !openFilter.host.contains(event.target)) closeTagFilter();
  });
  document.addEventListener("focusin", event => {
    if (openFilter && !openFilter.host.contains(event.target)) closeTagFilter();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && openFilter) {
      event.preventDefault(); event.stopImmediatePropagation(); closeTagFilter(true);
    }
  }, true);
  window.addEventListener("resize", positionTagFilter);
  document.addEventListener("scroll", event => {
    if (openFilter && !openFilter.panel.contains(event.target)) closeTagFilter();
  }, true);
  function renderMenu(menu) {
    if (!menu.trackingCard) return;
    menu.querySelectorAll(".tracking-tag-submenu").forEach(details => {
      const cards = details.dataset.tagTarget === "all" ? menu.trackingSelectedCards : [menu.trackingCard];
      renderMenuTags(menu, details, cards);
    });
    requestAnimationFrame(() => clampMenu(menu));
  }
  function renderMenuTags(menu, details, cards) {
    const list = details.querySelector(".tracking-tag-options");
    list.replaceChildren();
    const bulk = details.dataset.tagTarget === "all";
    state.tags.forEach(tag => {
      const button = element("button", undefined, trackingMenuItemClass(menu) + " tracking-tag-option"); button.type = "button";
      const assignedCount = cards.filter(card => (state.assignments[identity(card)] || []).includes(tag.tag_id)).length;
      const checked = assignedCount === cards.length;
      const mixed = assignedCount > 0 && !checked;
      button.setAttribute("role", "menuitemcheckbox");
      button.setAttribute("aria-checked", mixed ? "mixed" : String(checked));
      if (bulk) button.title = (checked ? "Remove " : "Apply ") + tag.name +
        (checked ? " from all " : " to all ") + cards.length + " selected cards";
      const check = element("span", checked ? "✓" : mixed ? "−" : "", "tracking-tag-check");
      check.setAttribute("aria-hidden", "true");
      button.append(check, element("span", tag.name));
      button.addEventListener("click", async event => {
        event.stopPropagation();
        menu.querySelectorAll(".tracking-tag-option").forEach(item => {item.disabled = true;});
        try {
          await api("/assign", {card_uuids: [...new Set(cards.map(card => card.dataset.cardUuid))], tag_id: tag.tag_id, enabled: !checked});
        } catch (error) {
          renderMenu(menu);
          details.querySelector(".tracking-tag-error").textContent = error.message;
        }
      });
      list.append(button);
    });
    if (!loaded) list.append(element("span", "Loading tags…"));
    details.querySelector(".tracking-tag-error").textContent = "";
  }
  function trackingMenuItemClass(menu) {
    if (menu.classList.contains("deckbuilder-card-context-menu")) return "deckbuilder-card-context-menu-item";
    if (menu.classList.contains("imomir-card-context-menu")) return "imomir-card-context-menu-item";
    return "tracking-tag-menu-item";
  }
  function buildTagSubmenu(menu, label, target) {
    const details = element("details", undefined, "tracking-tag-submenu");
    details.dataset.tagTarget = target;
    const summary = element("summary", label, trackingMenuItemClass(menu) + " tracking-tag-menu-toggle");
    const arrow = element("span", undefined, "tracking-tag-menu-arrow");
    arrow.setAttribute("aria-hidden", "true");
    summary.append(arrow);
    details.append(summary);
    const options = element("div", undefined, "tracking-tag-options"); options.setAttribute("role", "menu");
    options.setAttribute("aria-label", label);
    details.append(options);
    const error = element("p", "", "tracking-tag-error"); error.setAttribute("role", "status"); details.append(error);
    details.addEventListener("toggle", () => {
      if (details.open) menu.querySelectorAll(".tracking-tag-submenu").forEach(other => {
        if (other !== details) other.open = false;
      });
      clampMenu(menu);
    });
    return details;
  }
  function attachMenu(menu, card, selectedCards = []) {
    if (!menu || !card?.dataset.cardUuid) return;
    menu.trackingCard = card;
    menu.trackingSelectedCards = Array.from(selectedCards).filter(selected => selected?.dataset.cardUuid);
    menus.add(menu);
    menu.classList.add("tracking-tag-context-host");
    // Keep an expanded menu above navigation and out of workspace stacking
    // contexts. Its existing direct event handlers continue to work here.
    if (menu.parentElement !== document.body) document.body.append(menu);
    let details = menu.querySelector('.tracking-tag-submenu[data-tag-target="single"]');
    if (!details) {
      details = buildTagSubmenu(menu, "Tags", "single");
      menu.prepend(details);
    }
    details.open = false;
    let bulk = menu.querySelector('.tracking-tag-submenu[data-tag-target="all"]');
    if (menu.trackingSelectedCards.length > 1) {
      if (!bulk) {
        bulk = buildTagSubmenu(menu, "Tags (all)", "all");
        details.after(bulk);
      }
      bulk.querySelector("summary").title = menu.trackingSelectedCards.length + " selected cards";
      bulk.open = false;
    } else {
      bulk?.remove();
    }
    renderMenu(menu);
    if (!loaded) api().catch(error => {details.querySelector(".tracking-tag-error").textContent = error.message;});
  }
  function renderConfig() {
    const list = document.getElementById("cardTrackingTagList");
    if (!list) return;
    list.replaceChildren();
    state.tags.forEach(tag => {
      const row = element("div", undefined, "toggle-row tracking-tag-config-row");
      row.append(element("span", tag.name));
      if (tag.builtin) row.append(element("small", "Built in"));
      else {
        const remove = element("button", "Delete", "tracking-tag-link"); remove.type = "button";
        remove.setAttribute("aria-label", "Delete " + tag.name + " tag");
        remove.addEventListener("click", async () => {
          if (!confirm('Delete “' + tag.name + '” and remove it from every card?')) return;
          remove.disabled = true;
          try {await api("/" + encodeURIComponent(tag.tag_id), undefined, "DELETE"); configStatus("Tag deleted.");}
          catch (error) {configStatus(error.message); remove.disabled = false;}
        });
        row.append(remove);
      }
      list.append(row);
    });
  }
  function configStatus(message) {
    const status = document.getElementById("cardTrackingTagStatus");
    if (status) status.textContent = message;
  }
  document.addEventListener("DOMContentLoaded", () => {
    const hosts = document.querySelectorAll("[data-tag-filter]");
    hosts.forEach(renderFilter);
    if (hosts.length || document.querySelector("#cardTrackingTagList")) {
      api().catch(error => {
        configStatus(error.message);
        hosts.forEach(host => {
          const notice = element("p", error.message, "tracking-tag-error"); notice.setAttribute("role", "status"); host.append(notice);
        });
      });
    }
    const add = document.getElementById("cardTrackingTagAdd");
    const input = document.getElementById("cardTrackingTagName");
    add?.addEventListener("click", async () => {
      add.disabled = true;
      try {await api("", {name: input.value}); input.value = ""; configStatus("Tag saved. Available on all cards.");}
      catch (error) {configStatus(error.message);}
      finally {add.disabled = false;}
    });
    input?.addEventListener("keydown", event => {if (event.key === "Enter") {event.preventDefault(); add.click();}});
    const packFilter = () => document.querySelectorAll(".chaos-pack-view-card").forEach(card => {
      card.classList.toggle("tracking-tag-filtered-out", !matches(card, "pack"));
    });
    document.addEventListener("deckadence:card-tags-changed", packFilter);
    document.addEventListener("deckadence:tag-filters-changed", event => {if (event.detail.scope === "pack") packFilter();});
  });
  // Surfaces without an existing context menu (search results and pack previews).
  let fallback;
  function openFallback(event) {
    if (event.defaultPrevented) return;
    const card = event.target.closest(cardSelector);
    if (!card?.dataset.cardUuid) return;
    if (card.matches(".deckbuilder-card, .deckbuilder-land-palette-card") && document.getElementById("deckbuilderCardContextMenu")) return;
    if (card.matches(".custom-draft-current-card-row, .custom-draft-current-grid-card") && document.getElementById("customDraftCardContextMenu")) return;
    if (card.matches(".chaos-pack-view-card") && document.getElementById("campaignPackCardContextMenu")) return;
    event.preventDefault();
    if (!fallback) {fallback = element("div", undefined, "tracking-tag-fallback"); document.body.append(fallback);}
    attachMenu(fallback, card);
    fallback.hidden = false;
    const box = card.getBoundingClientRect();
    fallback.style.left = (event.clientX || box.left) + "px";
    fallback.style.top = (event.clientY || box.top) + "px";
    clampMenu(fallback);
  }
  document.addEventListener("contextmenu", openFallback);
  document.addEventListener("keydown", event => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) openFallback(event);
    if (event.key === "Escape" && fallback) fallback.hidden = true;
  });
  document.addEventListener("click", event => {if (fallback && !fallback.contains(event.target)) fallback.hidden = true;});
  window.addEventListener("resize", () => {if (fallback) fallback.hidden = true;});
  channel?.addEventListener("message", () => {if (loaded) api().catch(() => {});});
  document.addEventListener("visibilitychange", () => {if (!document.hidden && loaded) api().catch(() => {});});
  window.DeckadenceCardTags = {attachMenu, matches, active, values, reset, refresh: () => api(),
    clearPrinted: () => api("/clear-printed", {})};
})();
/* ==========================================
   Deckadence Client Refresh Tracker
   ------------------------------------------
   Lightweight page-local refresh/change helper.
   No database state. No server calls.
   
   Usage:
   - DeckadenceRefresh.check("object-key", signature, refreshCallback)
   - DeckadenceRefresh.changed("object-key", signature, refreshCallback)
   - DeckadenceRefresh.refreshCheck(0, "object-key", signature, refreshCallback)
   - DeckadenceRefresh.refreshCheck(1, "object-key", signature, refreshCallback)
   ========================================== */
(function () {
  if (window.iMomirRefresh) {
    return;
  }

  const stateByKey = new Map();

  function normalizeKey(objectKey) {
    return String(objectKey || "").trim();
  }

  function normalizeSignature(signature) {
    if (signature === undefined || signature === null) {
      return "";
    }

    if (typeof signature === "string") {
      return signature;
    }

    try {
      return JSON.stringify(signature);
    } catch (error) {
      return String(signature);
    }
  }

  function runRefreshCallback(refreshCallback, context) {
    if (typeof refreshCallback !== "function") {
      return;
    }

    refreshCallback(context);
  }

  function check(objectKey, signature, refreshCallback) {
    const key = normalizeKey(objectKey);

    if (!key) {
      return {
        key: "",
        changed: false,
        currentSignature: "",
        previousSignature: "",
        initialized: false,
      };
    }

    const currentSignature = normalizeSignature(signature);
    const previousEntry = stateByKey.get(key);
    const previousSignature = previousEntry ? previousEntry.signature : "";
    const initialized = Boolean(previousEntry);
    const changed = initialized && previousSignature !== currentSignature;

    const context = {
      key: key,
      changed: changed,
      currentSignature: currentSignature,
      previousSignature: previousSignature,
      initialized: initialized,
    };

    if (!initialized) {
      stateByKey.set(key, {
        signature: currentSignature,
        updatedAt: Date.now(),
      });

      return context;
    }

    if (changed) {
      stateByKey.set(key, {
        signature: currentSignature,
        updatedAt: Date.now(),
      });

      runRefreshCallback(refreshCallback, context);
    }

    return context;
  }

  function changed(objectKey, signature, refreshCallback) {
    const key = normalizeKey(objectKey);

    if (!key) {
      return {
        key: "",
        changed: false,
        currentSignature: "",
        previousSignature: "",
        initialized: false,
      };
    }

    const currentSignature = normalizeSignature(signature);
    const previousEntry = stateByKey.get(key);
    const previousSignature = previousEntry ? previousEntry.signature : "";
    const initialized = Boolean(previousEntry);

    stateByKey.set(key, {
      signature: currentSignature,
      updatedAt: Date.now(),
    });

    const context = {
      key: key,
      changed: true,
      currentSignature: currentSignature,
      previousSignature: previousSignature,
      initialized: initialized,
    };

    runRefreshCallback(refreshCallback, context);

    return context;
  }

  function refreshCheck(mode, objectKey, signature, refreshCallback) {
    const parsedMode = Number(mode);

    if (parsedMode === 1) {
      return changed(objectKey, signature, refreshCallback);
    }

    return check(objectKey, signature, refreshCallback);
  }

  function forget(objectKey) {
    const key = normalizeKey(objectKey);

    if (!key) {
      return;
    }

    stateByKey.delete(key);
  }

  function clear() {
    stateByKey.clear();
  }

  window.iMomirRefresh = {
    check: check,
    changed: changed,
    refreshCheck: refreshCheck,
    forget: forget,
    clear: clear,
  };

  window.refreshCheck = refreshCheck;
})();

/* ==========================================
   Shared Card Context Menu
   ------------------------------------------
   Reusable right-click / long-press menu for
   card-based screens outside Deck Builder.
   ========================================== */
(function () {
  if (window.iMomirCardContextMenu) {
    return;
  }

  const LONG_PRESS_MS = 560;
  const MOVE_TOLERANCE_PX = 12;

  function bind(options) {
    const contextOptions = options || {};
    const menu =
      typeof contextOptions.menu === "string"
        ? document.getElementById(contextOptions.menu)
        : contextOptions.menu;
    const root = contextOptions.root || document;
    const targetSelector = String(contextOptions.targetSelector || "").trim();

    if (!menu || !targetSelector) {
      return null;
    }

    let activeTarget = null;
    let pressTimer = null;
    let pressPointerId = null;
    let pressTarget = null;
    let pressStartX = 0;
    let pressStartY = 0;
    let suppressClickTarget = null;

    function resolveTarget(rawTarget) {
      if (!(rawTarget instanceof Element)) {
        return null;
      }

      const target = rawTarget.closest(targetSelector);

      if (!target) {
        return null;
      }

      if (root !== document && !root.contains(target)) {
        return null;
      }

      return target;
    }

    function cancelLongPress() {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer);
      }

      pressTimer = null;
      pressPointerId = null;
      pressTarget = null;
    }

    function close() {
      menu.classList.add("hidden");
      menu.setAttribute("aria-hidden", "true");
      activeTarget = null;
    }

    function position(x, y) {
      const viewportWidth =
        window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight;
      const menuWidth = menu.offsetWidth || 230;
      const menuHeight = menu.offsetHeight || 240;

      menu.style.left =
        Math.max(10, Math.min(x, viewportWidth - menuWidth - 10)) + "px";
      menu.style.top =
        Math.max(10, Math.min(y, viewportHeight - menuHeight - 10)) + "px";
    }

    function open(target, x, y) {
      if (!target) {
        return;
      }

      activeTarget = target;
      window.DeckadenceCardTags?.attachMenu(menu, target,
        typeof contextOptions.getSelectedCards === "function" ? contextOptions.getSelectedCards(target) : []);

      if (typeof contextOptions.prepare === "function") {
        contextOptions.prepare(target, menu);
      }

      const visibleAction = menu.querySelector(
        "[data-card-context-action]:not(.hidden)",
      );

      if (!visibleAction) {
        close();
        return;
      }

      menu.classList.remove("hidden");
      menu.setAttribute("aria-hidden", "false");
      position(x, y);
    }

    root.addEventListener("contextmenu", function (event) {
      const target = resolveTarget(event.target);

      if (!target) {
        return;
      }

      if (
        typeof contextOptions.canOpen === "function" &&
        !contextOptions.canOpen(target, event)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      open(target, event.clientX, event.clientY);
    });

    root.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "mouse" || event.button !== 0) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("button, a, input, select, textarea, label")
      ) {
        return;
      }

      const target = resolveTarget(event.target);

      if (!target) {
        return;
      }

      cancelLongPress();
      pressPointerId = event.pointerId;
      pressTarget = target;
      pressStartX = event.clientX;
      pressStartY = event.clientY;

      pressTimer = window.setTimeout(function () {
        pressTimer = null;
        suppressClickTarget = pressTarget;
        open(pressTarget, pressStartX, pressStartY);
      }, LONG_PRESS_MS);
    });

    root.addEventListener("pointermove", function (event) {
      if (event.pointerId !== pressPointerId || pressTimer === null) {
        return;
      }

      if (
        Math.hypot(event.clientX - pressStartX, event.clientY - pressStartY) >
        MOVE_TOLERANCE_PX
      ) {
        cancelLongPress();
      }
    });

    root.addEventListener("pointerup", cancelLongPress);
    root.addEventListener("pointercancel", cancelLongPress);

    root.addEventListener(
      "click",
      function (event) {
        if (!suppressClickTarget) {
          return;
        }

        const target = resolveTarget(event.target);

        if (target !== suppressClickTarget) {
          return;
        }

        suppressClickTarget = null;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );

    menu.addEventListener("click", function (event) {
      const actionButton = event.target.closest("[data-card-context-action]");

      if (!actionButton || actionButton.classList.contains("hidden")) {
        return;
      }

      if (actionButton.hasAttribute("data-foil-expand")) {
        const choices = actionButton.nextElementSibling;
        choices.hidden = !choices.hidden;
        actionButton.setAttribute("aria-expanded", String(!choices.hidden));
        return;
      }
      const actionName = String(
        actionButton.dataset.cardContextAction || "",
      ).trim();
      const target = activeTarget;

      close();

      if (
        !actionName ||
        !target ||
        typeof contextOptions.onAction !== "function"
      ) {
        return;
      }

      Promise.resolve(
        contextOptions.onAction(actionName, target, actionButton),
      ).catch(function (error) {
        if (typeof contextOptions.onError === "function") {
          contextOptions.onError(error);
          return;
        }

        console.error(error);
      });
    });

    document.addEventListener("click", function (event) {
      if (!menu.contains(event.target)) {
        close();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        close();
      }
    });

    window.addEventListener("resize", close);
    window.addEventListener("scroll", event => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) close();
    }, true);

    return {
      close: close,
      getActiveTarget: function () {
        return activeTarget;
      },
    };
  }

  async function setFoil(options) {
    const foilOptions = options || {};
    const updateUrl = String(foilOptions.updateUrl || "").trim();
    const cardUuid = String(foilOptions.cardUuid || "").trim();
    const isFoil = Boolean(foilOptions.isFoil);

    if (!updateUrl || !cardUuid) {
      throw new Error("Foil controls are not available for this card.");
    }

    const response = await fetch(updateUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        is_foil: isFoil,
        foil_type: foilOptions.foilType || "foil",
      }),
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Could not update foil status.");
    }

    document.dispatchEvent(
      new CustomEvent("imomir:card-image-refreshed", {
        detail: {
          cardUuid: cardUuid,
          imageUrl: "",
          imageChanged: false,
          hasAlternateSource: null,
          removeBleed: null,
          isFoil: isFoil,
        },
      }),
    );

    return payload;
  }

  window.iMomirCardContextMenu = {
    bind: bind,
    setFoil: setFoil,
  };
})();

document.addEventListener("DOMContentLoaded", function () {
  initializeAppNavigationMenus();
  initializeAlternateBleedReprocessing();
});

function initializeAlternateBleedReprocessing() {
  const startButton = document.getElementById("reprocessAlternateBleedButton");

  if (!startButton) {
    return;
  }

  const remainingElement = document.getElementById("alternateBleedRemaining");

  const processedElement = document.getElementById("alternateBleedProcessed");

  const correctedElement = document.getElementById("alternateBleedCorrected");

  const missingElement = document.getElementById("alternateBleedMissing");

  const failedElement = document.getElementById("alternateBleedFailed");

  const messageElement = document.getElementById("alternateBleedStatusMessage");

  const failureList = document.getElementById("alternateBleedFailureList");

  let pollTimer = null;

  function updateStatus(status) {
    const isRunning = Boolean(status.is_running);

    startButton.disabled = isRunning;

    startButton.textContent = isRunning
      ? "Reprocessing Alternate Images..."
      : "Reprocess Bleed-Removed Alternate Images";

    if (remainingElement) {
      remainingElement.textContent = String(status.remaining || 0);
    }

    if (processedElement) {
      processedElement.textContent = String(status.processed || 0);
    }

    if (correctedElement) {
      correctedElement.textContent = String(status.corrected || 0);
    }

    if (missingElement) {
      missingElement.textContent = String(status.missing_originals || 0);
    }

    if (failedElement) {
      failedElement.textContent = String(status.failed || 0);
    }

    if (messageElement) {
      messageElement.textContent = status.message || "";
    }

    if (failureList) {
      const failures = Array.isArray(status.failure_samples)
        ? status.failure_samples
        : [];

      if (failures.length) {
        failureList.classList.remove("hidden");

        failureList.textContent = failures.join("\n");
      } else {
        failureList.classList.add("hidden");

        failureList.textContent = "";
      }
    }

    if (!isRunning && pollTimer) {
      window.clearInterval(pollTimer);

      pollTimer = null;
    }
  }

  async function loadStatus() {
    try {
      const response = await fetch(
        "/maintenance/alternate-bleed-reprocess/status",
        {
          cache: "no-store",
        },
      );

      const status = await response.json();

      updateStatus(status);
    } catch (error) {
      if (messageElement) {
        messageElement.textContent = "Unable to load reprocessing status.";
      }
    }
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }

    pollTimer = window.setInterval(loadStatus, 1000);
  }

  startButton.addEventListener("click", async function () {
    startButton.disabled = true;
    startButton.textContent = "Starting Reprocessing...";

    if (messageElement) {
      messageElement.textContent =
        "Starting alternate image bleed reprocessing...";
    }

    try {
      const response = await fetch(
        "/maintenance/alternate-bleed-reprocess/start",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Unable to start reprocessing.");
      }

      if (messageElement) {
        messageElement.textContent = result.message || "";
      }

      await loadStatus();
      startPolling();
    } catch (error) {
      startButton.disabled = false;
      startButton.textContent = "Reprocess Bleed-Removed Alternate Images";

      if (messageElement) {
        messageElement.textContent =
          error.message || "Unable to start reprocessing.";
      }

      console.error("Alternate bleed reprocessing failed to start:", error);
    }
  });

  loadStatus().then(function () {
    fetch("/maintenance/alternate-bleed-reprocess/status", {
      cache: "no-store",
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (status) {
        if (status.is_running) {
          startPolling();
        }
      })
      .catch(function () {
        return;
      });
  });
}

function initializeAppNavigationMenus() {
  const menuToggles = document.querySelectorAll("[data-app-menu-toggle]");
  const qrOpenButtons = document.querySelectorAll("[data-app-qr-open]");
  const qrModal = document.getElementById("appQrModal");
  const qrCloseButton = document.getElementById("appQrCloseButton");

  function closeAllMenus(exceptMenu) {
    document.querySelectorAll(".app-nav-menu.is-open").forEach(function (menu) {
      if (menu !== exceptMenu) {
        menu.classList.remove("is-open");
        const toggle = menu.querySelector("[data-app-menu-toggle]");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  function closeQrModal() {
    if (!qrModal) {
      return;
    }

    qrModal.classList.add("hidden");
    qrModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  menuToggles.forEach(function (toggle) {
    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const menu = toggle.closest(".app-nav-menu");
      if (!menu) {
        return;
      }

      const shouldOpen = !menu.classList.contains("is-open");
      closeAllMenus(menu);
      menu.classList.toggle("is-open", shouldOpen);
      toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    });
  });

  document.addEventListener("click", function (event) {
    if (!event.target.closest(".app-nav-menu")) {
      closeAllMenus(null);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeAllMenus(null);
      closeQrModal();
    }
  });

  if (qrModal) {
    qrOpenButtons.forEach(function (qrOpenButton) {
      qrOpenButton.addEventListener("click", function (event) {
        event.preventDefault();
        closeAllMenus(null);
        qrModal.classList.remove("hidden");
        qrModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
      });
    });

    qrModal.addEventListener("click", function (event) {
      if (event.target === qrModal) {
        closeQrModal();
      }
    });
  }

  if (qrCloseButton) {
    qrCloseButton.addEventListener("click", function () {
      closeQrModal();
    });
  }
}

/* ==========================================
   Deckadence Toast + Confirm UI Helpers
   ========================================== */
(function () {
  if (window.iMomirToast && window.iMomirConfirm) {
    return;
  }

  function ensureToastHost() {
    let host = document.getElementById("imomirToastHost");

    if (host) {
      return host;
    }

    host = document.createElement("div");
    host.id = "imomirToastHost";
    host.style.position = "fixed";
    host.style.right = "18px";
    host.style.bottom = "18px";
    host.style.zIndex = "10050";
    host.style.display = "flex";
    host.style.flexDirection = "column";
    host.style.gap = "10px";
    host.style.width = "min(420px, calc(100vw - 36px))";

    document.body.appendChild(host);
    return host;
  }

  function showToast(message, type, timeoutMs) {
    const host = ensureToastHost();
    const cleanType = String(type || "info")
      .trim()
      .toLowerCase();

    const toast = document.createElement("div");
    toast.className = "imomir-toast imomir-toast-" + cleanType;
    toast.textContent = message || "";

    toast.style.border = "1px solid var(--border)";
    toast.style.borderRadius = "14px";
    toast.style.padding = "12px 14px";
    toast.style.boxShadow = "0 14px 32px rgba(0, 0, 0, 0.38)";
    toast.style.background =
      cleanType === "error"
        ? "linear-gradient(180deg, rgba(82, 30, 30, 0.98), rgba(48, 22, 22, 0.98))"
        : cleanType === "success"
          ? "linear-gradient(180deg, rgba(30, 82, 48, 0.98), rgba(22, 48, 32, 0.98))"
          : "linear-gradient(180deg, rgba(34, 38, 46, 0.98), rgba(26, 29, 36, 0.98))";
    toast.style.color = "#ffffff";
    toast.style.fontWeight = "700";
    toast.style.lineHeight = "1.35";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "opacity 0.16s ease, transform 0.16s ease";

    host.appendChild(toast);

    window.requestAnimationFrame(function () {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    window.setTimeout(
      function () {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";

        window.setTimeout(function () {
          toast.remove();

          if (host.children.length === 0) {
            host.remove();
          }
        }, 180);
      },
      Number(timeoutMs) || 2800,
    );
  }

  function ensureConfirmModal() {
    let overlay = document.getElementById("imomirConfirmOverlay");

    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = "imomirConfirmOverlay";
    overlay.className = "hidden";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = [
      '<div id="imomirConfirmBackdrop"></div>',
      '<div id="imomirConfirmDialog" role="dialog" aria-modal="true" aria-labelledby="imomirConfirmTitle">',
      '  <div id="imomirConfirmTitle"></div>',
      '  <div id="imomirConfirmMessage"></div>',
      '  <div id="imomirConfirmActions">',
      '    <button type="button" id="imomirConfirmCancelButton" class="action-button secondary-button">Cancel</button>',
      '    <button type="button" id="imomirConfirmOkButton" class="action-button">Continue</button>',
      "  </div>",
      "</div>",
    ].join("");

    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "10040";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.padding = "22px";

    const backdrop = overlay.querySelector("#imomirConfirmBackdrop");
    backdrop.style.position = "absolute";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(0, 0, 0, 0.72)";
    backdrop.style.backdropFilter = "blur(3px)";

    const dialog = overlay.querySelector("#imomirConfirmDialog");
    dialog.style.position = "relative";
    dialog.style.zIndex = "1";
    dialog.style.width = "min(100%, 440px)";
    dialog.style.border = "2px solid var(--insert-frame, var(--border))";
    dialog.style.borderRadius = "20px";
    dialog.style.background = "var(--panel)";
    dialog.style.color = "var(--text)";
    dialog.style.boxShadow = "none";
    dialog.style.padding = "22px";

    const title = overlay.querySelector("#imomirConfirmTitle");
    title.style.fontSize = "1.35rem";
    title.style.fontWeight = "800";
    title.style.marginBottom = "8px";
    title.style.color = "var(--text)";

    const message = overlay.querySelector("#imomirConfirmMessage");
    message.style.color = "var(--muted)";
    message.style.lineHeight = "1.45";
    message.style.marginBottom = "18px";
    message.style.textAlign = "left";

    const actions = overlay.querySelector("#imomirConfirmActions");
    actions.style.display = "grid";
    actions.style.gridTemplateColumns = "1fr 1fr";
    actions.style.gap = "12px";

    document.body.appendChild(overlay);
    return overlay;
  }

  function showConfirm(options) {
    const overlay = ensureConfirmModal();
    const title = overlay.querySelector("#imomirConfirmTitle");
    const message = overlay.querySelector("#imomirConfirmMessage");
    const cancelButton = overlay.querySelector("#imomirConfirmCancelButton");
    const okButton = overlay.querySelector("#imomirConfirmOkButton");
    const backdrop = overlay.querySelector("#imomirConfirmBackdrop");

    const settings = options || {};

    title.textContent = settings.title || "Confirm Action";
    message.textContent = settings.message || "Continue?";
    cancelButton.textContent = settings.cancelText || "Cancel";
    okButton.textContent = settings.confirmText || "Continue";

    okButton.classList.toggle(
      "campaign-danger-button",
      Boolean(settings.danger),
    );

    overlay.classList.remove("hidden");
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");

    return new Promise(function (resolve) {
      let resolved = false;

      function close(result) {
        if (resolved) {
          return;
        }

        resolved = true;

        overlay.classList.add("hidden");
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");

        cancelButton.removeEventListener("click", onCancel);
        okButton.removeEventListener("click", onOk);
        backdrop.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeyDown);

        resolve(result);
      }

      function onCancel() {
        close(false);
      }

      function onOk() {
        close(true);
      }

      function onKeyDown(event) {
        if (event.key === "Escape") {
          close(false);
        }
      }

      cancelButton.addEventListener("click", onCancel);
      okButton.addEventListener("click", onOk);
      backdrop.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeyDown);

      okButton.focus();
    });
  }

  window.iMomirToast = {
    show: showToast,
    success: function (message, timeoutMs) {
      showToast(message, "success", timeoutMs);
    },
    error: function (message, timeoutMs) {
      showToast(message, "error", timeoutMs);
    },
    info: function (message, timeoutMs) {
      showToast(message, "info", timeoutMs);
    },
  };

  window.iMomirConfirm = {
    show: showConfirm,
  };
})();

(function () {
  const appTabs = document.querySelector(".app-tabs");
  const menuToggleButton = document.getElementById("appMenuToggleButton");
  let navigationTrayButton = document.getElementById("appNavigationTrayButton");
  const appFrame = document.querySelector(".app-frame");

  if (!appTabs || !menuToggleButton) {
    return;
  }

  // A running server can still have the previous base template cached.
  // Upgrade that markup too, so refreshing loads the new navigation.
  appTabs.classList.add("app-tabs-adaptive");
  const navigationLinks = appTabs.querySelector(".app-tabs-nav");
  if (navigationLinks && !navigationTrayButton) {
    navigationLinks.id = navigationLinks.id || "appNavigationLinks";
    navigationTrayButton = document.createElement("button");
    navigationTrayButton.type = "button";
    navigationTrayButton.id = "appNavigationTrayButton";
    navigationTrayButton.className = "app-navigation-tray-button";
    navigationTrayButton.setAttribute("aria-label", "Open navigation");
    navigationTrayButton.setAttribute("aria-expanded", "false");
    navigationTrayButton.setAttribute("aria-controls", navigationLinks.id);
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-bars";
    icon.setAttribute("aria-hidden", "true");
    navigationTrayButton.append(icon);
    appTabs.append(navigationTrayButton);
  }

  const menuStorageKey = "imomir-main-menu-collapsed";
  const mobileNavigationMedia = window.matchMedia("(max-width: 760px)");
  const mobileHomeUrl = String(menuToggleButton.dataset.mobileHomeUrl || "/");
  const workspace = document.getElementById("deckbuilderWorkspace");
  const pageContent = workspace || appFrame?.querySelector(":scope > main, :scope > .screen, :scope > .deckbuilder-manage-page") || appFrame;
  const priceSidebar = document.querySelector(".sim-price-sidebar");
  let navigationLayoutFrame = 0;

  function setNavigationTrayOpen(open, restoreFocus) {
    const wasOpen = appTabs.classList.contains("app-navigation-tray-open");
    const shouldOpen = isMobileNavigation() && Boolean(open);
    appTabs.classList.toggle("app-navigation-tray-open", shouldOpen);
    if (navigationTrayButton) {
      navigationTrayButton.setAttribute("aria-expanded", String(shouldOpen));
      navigationTrayButton.setAttribute("aria-label", shouldOpen ? "Close navigation" : "Open navigation");
    }
    if (!shouldOpen) {
      appTabs.querySelectorAll(".app-nav-menu.is-open").forEach(function (menu) {
        menu.classList.remove("is-open");
        menu.querySelector("[data-app-menu-toggle]")?.setAttribute("aria-expanded", "false");
      });
      if (restoreFocus && wasOpen) navigationTrayButton?.focus();
    }
  }

  function scheduleNavigationLayout() {
    if (navigationLayoutFrame) return;
    navigationLayoutFrame = window.requestAnimationFrame(function () {
      navigationLayoutFrame = 0;
      updateWorkspaceNavigationOffset();
    });
  }

  function isMobileNavigation() {
    return mobileNavigationMedia.matches;
  }

  function isMenuCollapsed() {
    return appTabs.classList.contains("app-tabs-collapsed");
  }

  function updateWorkspaceNavigationOffset() {
    /*
     * A collapsed navigation floats over the upper-left corner rather
     * than reserving vertical space for the complete navigation bar.
     */
    if (isMenuCollapsed()) {
      document.documentElement.style.setProperty(
        "--imomir-workspace-nav-offset",
        "0px",
      );
      document.documentElement.style.setProperty("--app-navigation-panel-top", "24px");

      return;
    }

    if (appFrame && pageContent) {
      const frameRect = appFrame.getBoundingClientRect();
      const contentRect = pageContent.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      let left = Math.max(12, contentRect.left);
      let right = Math.min(viewportWidth - 12, contentRect.right);
      if (workspace) {
        left = 8;
        right = viewportWidth - 8;
      }
      if (priceSidebar && !priceSidebar.hidden && window.matchMedia("(min-width: 1024px)").matches) {
        const sidebarRect = priceSidebar.getBoundingClientRect();
        if (sidebarRect.width > 0) {
          left = Math.min(left, sidebarRect.left);
          right = Math.max(right, Math.min(viewportWidth - 12, sidebarRect.right));
        }
      }
      if (right - left < 280) {
        left = 8;
        right = viewportWidth - 8;
      }
      appTabs.style.setProperty("--app-navigation-left", (left - frameRect.left) + "px");
      appTabs.style.setProperty("--app-navigation-width", (right - left) + "px");
    }

    const tabsRect = appTabs.getBoundingClientRect();
    // Fixed workspaces and panels should not follow the page's scroll offset.
    const navigationBottom = Math.ceil(tabsRect.bottom + window.scrollY);

    document.documentElement.style.setProperty(
      "--imomir-workspace-nav-offset",
      (navigationBottom + 12) + "px",
    );
    document.documentElement.style.setProperty("--app-navigation-panel-top", (navigationBottom + 24) + "px");
  }

  function updateMenuAccessibilityState() {
    if (isMobileNavigation()) {
      menuToggleButton.removeAttribute("aria-expanded");
      menuToggleButton.setAttribute("aria-label", "Home");
      menuToggleButton.title = "Home";
      return;
    }

    const collapsed = isMenuCollapsed();

    menuToggleButton.setAttribute(
      "aria-expanded",
      collapsed ? "false" : "true",
    );

    menuToggleButton.setAttribute(
      "aria-label",
      collapsed ? "Expand navigation" : "Minimize navigation",
    );

    menuToggleButton.title = collapsed
      ? "Expand Navigation"
      : "Minimize Navigation";
  }

  function setMenuCollapsed(collapsed, savePreference) {
    const shouldCollapse = !isMobileNavigation() && Boolean(collapsed);
    setNavigationTrayOpen(false, false);

    appTabs.classList.toggle("app-tabs-collapsed", shouldCollapse);

    document.body.classList.toggle("app-menu-is-collapsed", shouldCollapse);

    updateMenuAccessibilityState();

    /*
     * Wait for the class change to be applied before measuring the
     * expanded menu's size.
     */
    scheduleNavigationLayout();

    if (savePreference && !isMobileNavigation()) {
      try {
        window.localStorage.setItem(menuStorageKey, shouldCollapse ? "1" : "0");
      } catch (error) {
        /*
         * The menu still works when localStorage is unavailable.
         */
      }
    }
  }

  function loadSavedMenuState() {
    if (isMobileNavigation()) {
      setMenuCollapsed(false, false);
      return;
    }

    let savedValue = "0";

    try {
      savedValue = window.localStorage.getItem(menuStorageKey) || "0";
    } catch (error) {
      savedValue = "0";
    }

    setMenuCollapsed(savedValue === "1", false);
  }

  menuToggleButton.addEventListener("click", function () {
    if (isMobileNavigation()) {
      window.location.assign(mobileHomeUrl);
      return;
    }

    setMenuCollapsed(!isMenuCollapsed(), true);
  });

  navigationTrayButton?.addEventListener("click", function () {
    setNavigationTrayOpen(!appTabs.classList.contains("app-navigation-tray-open"), false);
  });
  document.addEventListener("pointerdown", function (event) {
    if (!appTabs.contains(event.target)) setNavigationTrayOpen(false, false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setNavigationTrayOpen(false, true);
  });
  document.addEventListener("focusin", function (event) {
    if (!appTabs.contains(event.target)) setNavigationTrayOpen(false, false);
  });
  window.addEventListener("resize", scheduleNavigationLayout);
  window.addEventListener("load", scheduleNavigationLayout);

  if (typeof mobileNavigationMedia.addEventListener === "function") {
    mobileNavigationMedia.addEventListener("change", loadSavedMenuState);
  } else if (typeof mobileNavigationMedia.addListener === "function") {
    mobileNavigationMedia.addListener(loadSavedMenuState);
  }

  if (window.ResizeObserver) {
    const navigationResizeObserver = new ResizeObserver(scheduleNavigationLayout);
    navigationResizeObserver.observe(appTabs);
    if (appFrame) navigationResizeObserver.observe(appFrame);
    if (pageContent) navigationResizeObserver.observe(pageContent);
    if (priceSidebar) navigationResizeObserver.observe(priceSidebar);
  }
  if (window.MutationObserver) {
    const layoutObserver = new MutationObserver(scheduleNavigationLayout);
    if (pageContent) layoutObserver.observe(pageContent, { attributes: true, attributeFilter: ["class"] });
    if (priceSidebar) layoutObserver.observe(priceSidebar, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  loadSavedMenuState();
})();

(function () {
  const multiSelectSelector = "[data-imomir-multi-select]";
  const noWasteSectionSelector = "[data-no-waste-surprise-section]";

  function updateMultiSelectLabel(container) {
    const label = container.querySelector(".custom-draft-multi-select-label");

    if (!label) {
      return;
    }

    const selectedLabels = Array.from(
      container.querySelectorAll('input[type="checkbox"]:checked'),
    )
      .map(function (checkbox) {
        const optionLabel = checkbox.closest("label");
        const textNode = optionLabel ? optionLabel.querySelector("span") : null;

        return textNode
          ? textNode.textContent.trim()
          : String(checkbox.value || "").trim();
      })
      .filter(Boolean);

    label.textContent = selectedLabels.length
      ? selectedLabels.join(", ")
      : container.dataset.placeholder || "Any";
  }

  function closeMultiSelectMenu(container) {
    const button = container.querySelector(".custom-draft-multi-select-button");
    const menu = container.querySelector(".custom-draft-multi-select-menu");

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }

    if (menu) {
      menu.classList.add("hidden");
    }
  }

  function bindMultiSelect(container) {
    if (container.dataset.imomirMultiSelectBound === "1") {
      return;
    }

    container.dataset.imomirMultiSelectBound = "1";

    const button = container.querySelector(".custom-draft-multi-select-button");
    const menu = container.querySelector(".custom-draft-multi-select-menu");

    if (button && menu) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen = menu.classList.contains("hidden");

        document
          .querySelectorAll(multiSelectSelector)
          .forEach(function (otherContainer) {
            if (otherContainer !== container) {
              closeMultiSelectMenu(otherContainer);
            }
          });

        menu.classList.toggle("hidden", !shouldOpen);
        button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      });
    }

    container
      .querySelectorAll('input[type="checkbox"]')
      .forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
          const exclusiveValue = String(container.dataset.exclusiveValue || "")
            .trim()
            .toLowerCase();

          if (checkbox.checked && exclusiveValue) {
            const checkboxValue = String(checkbox.value || "")
              .trim()
              .toLowerCase();

            container
              .querySelectorAll('input[type="checkbox"]')
              .forEach(function (otherCheckbox) {
                const otherValue = String(otherCheckbox.value || "")
                  .trim()
                  .toLowerCase();

                if (checkboxValue === exclusiveValue) {
                  if (otherCheckbox !== checkbox) {
                    otherCheckbox.checked = false;
                  }
                } else if (otherValue === exclusiveValue) {
                  otherCheckbox.checked = false;
                }
              });
          }

          updateMultiSelectLabel(container);
        });
      });

    updateMultiSelectLabel(container);
  }

  function updateNoWasteSection(section) {
    const toggle = section.querySelector("[data-no-waste-surprise-toggle]");
    const details = section.querySelector("[data-no-waste-surprise-details]");
    const isEnabled = Boolean(toggle && toggle.checked);

    section.classList.toggle("no-waste-surprise-section-active", isEnabled);

    if (details) {
      details.classList.toggle("hidden", !isEnabled);
    }
  }

  function bindNoWasteSection(section) {
    if (section.dataset.noWasteSurpriseBound === "1") {
      return;
    }

    section.dataset.noWasteSurpriseBound = "1";

    const toggle = section.querySelector("[data-no-waste-surprise-toggle]");

    if (toggle) {
      toggle.addEventListener("change", function () {
        updateNoWasteSection(section);
      });
    }

    updateNoWasteSection(section);
  }

  document.querySelectorAll(multiSelectSelector).forEach(bindMultiSelect);

  document.querySelectorAll(noWasteSectionSelector).forEach(bindNoWasteSection);

  document.addEventListener("click", function (event) {
    if (event.target.closest(multiSelectSelector)) {
      return;
    }

    document
      .querySelectorAll(multiSelectSelector)
      .forEach(closeMultiSelectMenu);
  });

  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("reset", function () {
      window.requestAnimationFrame(function () {
        form
          .querySelectorAll(multiSelectSelector)
          .forEach(updateMultiSelectLabel);

        form
          .querySelectorAll(noWasteSectionSelector)
          .forEach(updateNoWasteSection);
      });
    });
  });
})();

/* ==========================================
   Reusable checkbox multi-select dropdowns
   ========================================== */
(function () {
  const selector = "[data-imomir-multi-select]";

  function getContainers(root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function closeContainer(container) {
    if (!container) {
      return;
    }

    const button = container.querySelector(".custom-draft-multi-select-button");
    const menu = container.querySelector(".custom-draft-multi-select-menu");

    if (button) {
      button.setAttribute("aria-expanded", "false");
    }

    if (menu) {
      menu.classList.add("hidden");
    }
  }

  function getSelectedLabels(container) {
    return Array.from(
      container.querySelectorAll('input[type="checkbox"]:checked'),
    )
      .map(function (checkbox) {
        const label = checkbox.closest("label");
        const labelText = label ? label.querySelector("span") : null;

        return labelText && labelText.textContent
          ? labelText.textContent.trim()
          : String(checkbox.value || "").trim();
      })
      .filter(Boolean);
  }

  function updateContainerLabel(container) {
    if (!container) {
      return;
    }

    const labelElement = container.querySelector(
      ".custom-draft-multi-select-label",
    );

    if (!labelElement) {
      return;
    }

    const selectedLabels = getSelectedLabels(container);

    const totalOptions = container.querySelectorAll(
      'input[type="checkbox"]',
    ).length;

    const placeholder = container.dataset.placeholder || "Any";

    const allLabel = container.dataset.allLabel || "All";

    if (!selectedLabels.length) {
      labelElement.textContent = placeholder;
      return;
    }

    if (totalOptions > 0 && selectedLabels.length === totalOptions) {
      labelElement.textContent = allLabel;
      return;
    }

    labelElement.textContent = selectedLabels.join(", ");
  }

  function bindContainer(container) {
    if (!container || container.dataset.imomirMultiSelectBound === "1") {
      return;
    }

    container.dataset.imomirMultiSelectBound = "1";

    const button = container.querySelector(".custom-draft-multi-select-button");

    const menu = container.querySelector(".custom-draft-multi-select-menu");

    if (button && menu) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const shouldOpen = menu.classList.contains("hidden");

        getContainers(document).forEach(function (otherContainer) {
          if (otherContainer !== container) {
            closeContainer(otherContainer);
          }
        });

        menu.classList.toggle("hidden", !shouldOpen);

        button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      });
    }

    Array.from(container.querySelectorAll('input[type="checkbox"]')).forEach(
      function (checkbox) {
        checkbox.addEventListener("change", function () {
          const exclusiveValue = String(container.dataset.exclusiveValue || "")
            .trim()
            .toLowerCase();

          if (checkbox.checked && exclusiveValue) {
            const checkboxValue = String(checkbox.value || "")
              .trim()
              .toLowerCase();

            if (checkboxValue === exclusiveValue) {
              Array.from(
                container.querySelectorAll('input[type="checkbox"]'),
              ).forEach(function (otherCheckbox) {
                if (otherCheckbox !== checkbox) {
                  otherCheckbox.checked = false;
                }
              });
            } else {
              const exclusiveCheckbox = container.querySelector(
                'input[type="checkbox"][value="' +
                  CSS.escape(exclusiveValue) +
                  '"]',
              );

              if (exclusiveCheckbox) {
                exclusiveCheckbox.checked = false;
              }
            }
          }

          updateContainerLabel(container);
        });
      },
    );

    updateContainerLabel(container);
  }

  getContainers(document).forEach(bindContainer);

  document.addEventListener("click", function (event) {
    if (event.target.closest(selector)) {
      return;
    }

    getContainers(document).forEach(closeContainer);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }

    getContainers(document).forEach(closeContainer);
  });

  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("reset", function () {
      window.requestAnimationFrame(function () {
        getContainers(form).forEach(updateContainerLabel);
      });
    });
  });
})();
