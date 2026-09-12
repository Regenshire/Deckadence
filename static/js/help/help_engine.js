(function () {
  if (window.DeckadenceHelp) {
    return;
  }

  const CONTEXT_STORAGE_KEY = "deckadence.contextHelpEnabled";

  const contextTips = new Map();

  const state = {
    contextEnabled: false,
    contextTarget: null,
  };

  let layer;
  let tooltip;
  let tooltipTitle;
  let tooltipBody;
  let exitButton;
  let helpToggleButton;

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function setLayerVisible(visible) {
    if (!layer) {
      return;
    }

    layer.hidden = !visible;

    layer.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function hideTooltip() {
    state.contextTarget = null;

    if (!tooltip) {
      return;
    }

    tooltip.hidden = true;

    tooltip.setAttribute("aria-hidden", "true");
  }

  function positionTooltip(target) {
    if (!target || !tooltip || tooltip.hidden) {
      return;
    }

    requestAnimationFrame(function () {
      if (state.contextTarget !== target) {
        return;
      }

      const targetRect = target.getBoundingClientRect();

      const tooltipRect = tooltip.getBoundingClientRect();

      const padding = 12;
      const gap = 10;

      let left = targetRect.right + gap;

      let top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;

      if (left + tooltipRect.width > window.innerWidth - padding) {
        left = targetRect.left - tooltipRect.width - gap;
      }

      if (left < padding) {
        left = Math.max(
          padding,
          Math.min(
            targetRect.left,
            window.innerWidth - tooltipRect.width - padding,
          ),
        );

        top = targetRect.bottom + gap;
      }

      top = Math.max(
        padding,
        Math.min(top, window.innerHeight - tooltipRect.height - padding),
      );

      tooltip.style.left = `${Math.round(left)}px`;

      tooltip.style.top = `${Math.round(top)}px`;
    });
  }

  function refreshContextTargets() {
    document.querySelectorAll("[data-help-id]").forEach(function (element) {
      const helpId = normalizeKey(element.dataset.helpId);

      element.classList.toggle(
        "deck-help-context-target",
        state.contextEnabled && contextTips.has(helpId),
      );
    });
  }

  function setContextEnabled(enabled) {
    state.contextEnabled = Boolean(enabled);

    try {
      sessionStorage.setItem(
        CONTEXT_STORAGE_KEY,
        state.contextEnabled ? "1" : "0",
      );
    } catch (error) {
      // Help remains usable even if
      // browser storage is unavailable.
    }

    document.body.classList.toggle(
      "deck-help-context-enabled",
      state.contextEnabled,
    );

    helpToggleButton.classList.toggle("is-active", state.contextEnabled);

    helpToggleButton.setAttribute(
      "aria-pressed",
      state.contextEnabled ? "true" : "false",
    );

    hideTooltip();
    refreshContextTargets();

    setLayerVisible(state.contextEnabled);

    if (exitButton) {
      exitButton.hidden = !state.contextEnabled;
    }
  }

  function showContextTip(target, tip) {
    if (!state.contextEnabled || !target || !tip) {
      return;
    }

    state.contextTarget = target;

    tooltipTitle.textContent = tip.title;

    tooltipBody.textContent = tip.body;

    tooltip.hidden = false;

    tooltip.setAttribute("aria-hidden", "false");

    positionTooltip(target);
  }

  function findRegisteredTarget(eventTarget) {
    if (!eventTarget || typeof eventTarget.closest !== "function") {
      return null;
    }

    const target = eventTarget.closest("[data-help-id]");

    if (!target) {
      return null;
    }

    const helpId = normalizeKey(target.dataset.helpId);

    if (!contextTips.has(helpId)) {
      return null;
    }

    return target;
  }

  function showTipForTarget(target) {
    if (!state.contextEnabled || !target) {
      return;
    }

    const helpId = normalizeKey(target.dataset.helpId);

    const tip = contextTips.get(helpId);

    if (!tip) {
      return;
    }

    showContextTip(target, tip);
  }

  function handleContextPointerOver(event) {
    if (!state.contextEnabled) {
      return;
    }

    const target = findRegisteredTarget(event.target);

    if (!target) {
      return;
    }

    if (event.relatedTarget && target.contains(event.relatedTarget)) {
      return;
    }

    showTipForTarget(target);
  }

  function handleContextPointerOut(event) {
    if (!state.contextEnabled || !state.contextTarget) {
      return;
    }

    const target = state.contextTarget;

    if (event.target !== target && !target.contains(event.target)) {
      return;
    }

    if (event.relatedTarget && target.contains(event.relatedTarget)) {
      return;
    }

    hideTooltip();
  }

  function handleContextFocusIn(event) {
    if (!state.contextEnabled) {
      return;
    }

    const target = findRegisteredTarget(event.target);

    if (target) {
      showTipForTarget(target);
    }
  }

  function handleContextFocusOut(event) {
    if (!state.contextEnabled || !state.contextTarget) {
      return;
    }

    if (
      event.relatedTarget &&
      state.contextTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    hideTooltip();
  }

  function registerContextTips(entries) {
    Object.entries(entries || {}).forEach(function ([rawId, rawTip]) {
      const helpId = normalizeKey(rawId);

      const tip = rawTip || {};

      if (!helpId || !tip.title || !tip.body) {
        return;
      }

      contextTips.set(helpId, {
        title: String(tip.title),

        body: String(tip.body),
      });
    });

    if (document.readyState !== "loading") {
      refreshContextTargets();
    }
  }

  function initialize() {
    layer = document.getElementById("deckHelpLayer");

    tooltip = document.getElementById("deckHelpTooltip");

    tooltipTitle = document.getElementById("deckHelpTooltipTitle");

    tooltipBody = document.getElementById("deckHelpTooltipBody");

    exitButton = document.getElementById("deckHelpExitButton");

    helpToggleButton = document.getElementById("appHelpToggleButton");

    if (!layer || !tooltip || !helpToggleButton) {
      return;
    }

    try {
      state.contextEnabled =
        sessionStorage.getItem(CONTEXT_STORAGE_KEY) === "1";
    } catch (error) {
      state.contextEnabled = false;
    }

    helpToggleButton.addEventListener("click", function () {
      setContextEnabled(!state.contextEnabled);
    });

    exitButton?.addEventListener("click", function () {
      setContextEnabled(false);
    });

    document.addEventListener("pointerover", handleContextPointerOver, true);

    document.addEventListener("pointerout", handleContextPointerOut, true);

    document.addEventListener("focusin", handleContextFocusIn, true);

    document.addEventListener("focusout", handleContextFocusOut, true);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.contextEnabled) {
        setContextEnabled(false);
      }
    });

    window.addEventListener("resize", function () {
      if (state.contextTarget) {
        positionTooltip(state.contextTarget);
      }
    });

    window.addEventListener(
      "scroll",
      function () {
        if (state.contextTarget) {
          positionTooltip(state.contextTarget);
        }
      },
      true,
    );

    setContextEnabled(state.contextEnabled);
  }

  window.DeckadenceHelp = {
    registerContextTips: registerContextTips,

    setContextHelpEnabled: setContextEnabled,

    isContextHelpEnabled: function () {
      return state.contextEnabled;
    },
  };

  registerContextTips({
    "navigation-settings": {
      title: "Settings",
      body: "Configure Deckadence, update card data sources, customize game modes, control proxy printing options, and access plugins and advanced settings",
    },
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true,
    });
  } else {
    initialize();
  }
})();
