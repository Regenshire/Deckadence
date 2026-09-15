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

    refreshContextTargets: refreshContextTargets,

    setContextHelpEnabled: setContextEnabled,

    isContextHelpEnabled: function () {
      return state.contextEnabled;
    },
  };

  registerContextTips({
    "navigation-home": {
      title: "Home",
      body: "Return to the Home Screen.",
    },

    "navigation-play": {
      title: "Play",
      body: "Play Momir or Chaos Draft.",
    },

    "navigation-cards": {
      title: "Cards",
      body: "Manage custom sets, decks, and saved packs.",
    },

    "navigation-settings": {
      title: "Settings",
      body: "Open Deckadence settings, database tools, print options, plugins, backups, and advanced tools.",
    },

    "navigation-qr": {
      title: "Open on Another Device",
      body: "Show a QR code so a phone or tablet on the same network can open Deckadence.",
    },

    "navigation-qr-panel": {
      title: "Open Deckadence",
      body: "Scan this QR code with another device, or enter the displayed address manually. The device must be on the same local network as the Deckadence host.",
    },

    "momir-card-type": {
      title: "Card Type",
      body: "In Momir Select mode, choose which enabled card type the next draw must use.",
    },

    "momir-mana-value": {
      title: "Mana Value",
      body: "This is the mana value that will be used for the next draw.",
    },

    "momir-keypad": {
      title: "Mana Value Keypad",
      body: "Enter the mana value for the next draw. Clear resets the value, and backspace removes the last digit.",
    },

    "momir-draw": {
      title: "Draw Card",
      body: "Draw a random card using the selected mana value and your current Momir settings.",
    },

    "momir-tower-draw": {
      title: "Tower of Power",
      body: "Draw cards for Tower of Power. When PDF printing is enabled, choose how many cards to draw before starting.",
    },

    menu_chaos_draft: {
      title: "Chaos Draft",
      body: "Spin on a chaos draft wheel for various packs to run in a Chaos Draft.",
    },

    menu_momir: {
      title: "Momir",
      body: "This highly randomized format pits players against each other while they draw from a Momir generator.  A highly random and addictive game mode.",
    },

    menu_manage_sets: {
      title: "Manage",
      body: "Create and Manage custom sets, and select which sets you want to use for Chaos Draft and Momir play modes.",
    },

    menu_manage_decks: {
      title: "Manage Decks",
      body: "Create and manage custom decks.",
    },

    menu_set_roulette: {
      title: "Deck Roulette",
      body: "Its like Chaos Draft. BUT FOR DECKS!!!\n\nThat's right, you can spin on the wheel of chaos for a whole entire deck!  You can do it for commander and most standard formats. Its a fun way to explore magic.",
    },

    menu_manage_packs: {
      title: "Manage Packs",
      body: "Manage your packs and run test drafts.",
    },

    chaos_new_draft: {
      title: "Start New Draft",
      body: "This creates a new fresh Draft with a cleared history and access to all the packs in the campaign.",
    },

    chaos_manage_campaigns: {
      title: "Manage Campaigns",
      body: "You create and manage Chaos Draft campaigns here.  A Chaos Draft Campaign is a unique draft where you select what packs are in the Chaos Draft.",
    },

    chaos_select_player: {
      title: "Select Player",
      body: "Choose the current player who is spinning for the next set of packs. Their name will be saved with the pack in the campaign history.",
    },

    chaos_edit_players: {
      title: "Edit Players",
      body: "Add, remove, rename, or update the players taking part in this campaign.",
    },

    chaos_manage_packs: {
      title: "Manage Packs",
      body: "View and manage the packs available in this campaign. You can add new packs, disable packs, print them, or remove packs you no longer want to use.\n\nYou can add custom packs and packs from custom sets. You can also do mock drafts to test out the draft dynamics.",
    },

    chaos_history: {
      title: "Campaign History",
      body: "View the packs that have already been opened during this campaign, including which player received each pack.",
    },

    chaos_next: {
      title: "Next Pack",
      body: "Move on to the next pack in the draft. Select the next player, then spin again when you are ready.",
    },

    chaos_view: {
      title: "View Pack",
      body: "Open the selected pack so you can see all of the cards inside without printing it.\n\nSPOILER - This will spoil the contents of the pack.",
    },

    chaos_print: {
      title: "Print / Export Pack",
      body: "Open the Print / Export tools for this pack. From here you can create printable proxies or export the card images for use elsewhere.",
    },

    chaos_copy_list: {
      title: "Copy Pack List",
      body: "Copy the cards in this pack as a text list so you can paste them into another application or document.",
    },

    chaos_spin: {
      title: "Spin",
      body: "Spin for a pack on the Chaos Draft wheel.  Clicking this button will result in a random pack from the available packs in the campaign to be selected.",
    },

    "alternate-image-modal": {
      title: "Alternate Image",
      body: "Manage alternate artwork for this card. You can upload an image, link to an image URL, choose card-face settings, and manage existing alternate sources.",
    },

    "alternate-image-card-name": {
      title: "Card",
      body: "The card whose alternate image settings you are currently editing.",
    },

    "alternate-image-isolation": {
      title: "Isolation On",
      body: "This collection uses its own alternate image library. Changes made here affect only this isolated deck, pack, set, or collection.",
    },

    "alternate-image-preview": {
      title: "Image Preview",
      body: "Preview the current image or the new uploaded or linked image before adding it as an alternate source.",
    },

    "alternate-image-active-source": {
      title: "Active Source",
      body: "Shows the alternate image source currently being used for this card. If no alternate is active, Deckadence uses the accepted upscale or Scryfall image.",
    },

    "alternate-image-source-list": {
      title: "Alternate Sources",
      body: "Lists the alternate images already saved for this card. You can enable, disable, or delete sources from this list.",
    },

    "alternate-image-source-entry": {
      title: "Alternate Source",
      body: "A saved alternate image for this card. The card face and full-bleed status are shown beneath the source name.",
    },

    "alternate-image-source-toggle": {
      title: "Enable / Disable Source",
      body: "Turn this alternate source on or off without deleting it.",
    },

    "alternate-image-source-delete": {
      title: "Delete Source",
      body: "Permanently remove this alternate image source from the current image library.",
    },

    "alternate-image-add-source-form": {
      title: "Add Alternate Source",
      body: "Use these controls to add a new alternate image to this card.",
    },

    "alternate-image-source-input": {
      title: "Image Source",
      body: "Choose where the alternate image comes from, then provide the file, URL, or local path in the same row.",
    },

    "alternate-image-source-type": {
      title: "Source Type",
      body: "Choose whether to upload an image file, link to an external image URL, or use a local file path.",
    },

    "alternate-image-upload": {
      title: "Upload Image",
      body: "Choose an image file from your computer. The selected image appears in the preview before you save it.",
    },

    "alternate-image-url": {
      title: "External Image URL",
      body: "Paste a direct image URL. Deckadence previews the linked image before you save it.",
    },

    "alternate-image-local-path": {
      title: "Local Image Path",
      body: "Enter a path to an image already available to Deckadence on the host computer.",
    },

    "alternate-image-card-face": {
      title: "Card Face",
      body: "For double-faced cards, choose whether this alternate image belongs to the front or back face. This control is hidden for single-faced cards.",
    },

    "alternate-image-frame-template": {
      title: "Card Frame Template",
      body: "Choose the frame template Deckadence should use when processing this alternate image. Automatic uses the frame from the selected printing.",
    },

    "alternate-image-full-bleed": {
      title: "3mm Full-Bleed",
      body: "Enable this when the uploaded image includes a 3mm full-bleed border such as images sourced from MPCFill.",
    },

    "alternate-image-foil": {
      title: "Foil",
      body: "Set the current card to foil when this option is available for the screen you are using.",
    },

    "alternate-image-add-source": {
      title: "Add Alternate Source",
      body: "Save the selected file, URL, or local path as a new alternate image source for this card.",
    },

    "alternate-image-save-frame": {
      title: "Save Frame Template",
      body: "Save the selected frame template for the active alternate image source.",
    },

    "alternate-image-status": {
      title: "Alternate Image Status",
      body: "Displays success messages or errors while alternate image settings are being loaded or saved.",
    },

    chaos_silhouette_template: {
      title: "Silhouette Cameo Templates",
      body: "Do you use a Silhouette Cameo cutter to cut your cards into card shapes?  If you do, this link is for you!\n\nThis bring up a dialogue where you can download various silhouette templates designed to work with PDF files generated by Deckadence.\n\nTo use Silhouette Templates, you must have Silhouette Registration marks enabled when you generate PDFs.",
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
