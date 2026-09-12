(function () {
  if (window.DeckadenceHelpLoader) {
    return;
  }

  const CONTEXT_STORAGE_KEY = "deckadence.contextHelpEnabled";
  const ACTIVE_TOUR_STORAGE_KEY = "deckadence.activeTourId";

  const loaderScriptUrl =
    (document.currentScript && document.currentScript.src) ||
    "/static/js/help/help_loader.js";

  const assetUrls = {
    helpCss: new URL("../../css/help.css", loaderScriptUrl).href,
    helpEngine: new URL("help_engine.js", loaderScriptUrl).href,
    tourEngine: new URL("tour_engine.js", loaderScriptUrl).href,
  };

  const tourScripts = {
    settings_and_tribulations: new URL("tours/settings.js", loaderScriptUrl)
      .href,
    chaos_in_the_making: new URL("tours/chaos_campaign.js", loaderScriptUrl)
      .href,
    design_custom_draft_set: new URL(
      "tours/custom_draft_set.js",
      loaderScriptUrl,
    ).href,
    initial_setup: new URL("tours/initial_setup.js", loaderScriptUrl).href,
  };

  const pendingAssets = new Map();

  let tourStartPromise = null;

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function getSessionValue(key) {
    try {
      return sessionStorage.getItem(key) || "";
    } catch (error) {
      return "";
    }
  }

  function clearSessionValue(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      // Nothing else is required.
    }
  }

  function loadStylesheet(url) {
    const assetKey = `style:${url}`;

    if (pendingAssets.has(assetKey)) {
      return pendingAssets.get(assetKey);
    }

    const existing = Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
    ).find((link) => link.href === url);

    if (existing) {
      return Promise.resolve(existing);
    }

    const promise = new Promise((resolve, reject) => {
      const link = document.createElement("link");

      link.rel = "stylesheet";
      link.href = url;
      link.dataset.deckadenceHelpAsset = "1";

      link.addEventListener("load", () => resolve(link), {
        once: true,
      });

      link.addEventListener(
        "error",
        () => {
          reject(new Error(`Unable to load Help stylesheet: ${url}`));
        },
        {
          once: true,
        },
      );

      document.head.appendChild(link);
    });

    pendingAssets.set(assetKey, promise);

    return promise;
  }

  function loadScript(url) {
    const assetKey = `script:${url}`;

    if (pendingAssets.has(assetKey)) {
      return pendingAssets.get(assetKey);
    }

    const existing = Array.from(document.scripts).find(
      (script) => script.src === url,
    );

    if (existing) {
      return Promise.resolve(existing);
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src = url;
      script.async = false;
      script.dataset.deckadenceHelpAsset = "1";

      script.addEventListener("load", () => resolve(script), {
        once: true,
      });

      script.addEventListener(
        "error",
        () => {
          reject(new Error(`Unable to load Help script: ${url}`));
        },
        {
          once: true,
        },
      );

      document.body.appendChild(script);
    });

    pendingAssets.set(assetKey, promise);

    return promise;
  }

  async function ensureHelpStyles() {
    await loadStylesheet(assetUrls.helpCss);
  }

  async function ensureContextHelp() {
    await ensureHelpStyles();

    if (!window.DeckadenceHelp) {
      await loadScript(assetUrls.helpEngine);
    }

    return window.DeckadenceHelp || null;
  }

  async function ensureTour(tourId) {
    const cleanTourId = normalizeKey(tourId);

    const tourScriptUrl = tourScripts[cleanTourId];

    if (!tourScriptUrl) {
      throw new Error(`Unknown Deckadence guided tour: ${cleanTourId}`);
    }

    await ensureHelpStyles();

    if (!window.DeckadenceTours) {
      await loadScript(assetUrls.tourEngine);
    }

    await loadScript(tourScriptUrl);

    return window.DeckadenceTours || null;
  }

  function getActiveTourId() {
    return normalizeKey(getSessionValue(ACTIVE_TOUR_STORAGE_KEY));
  }

  async function startTour(tourId) {
    const cleanTourId = normalizeKey(tourId);

    if (!cleanTourId) {
      return;
    }

    if (tourStartPromise) {
      return tourStartPromise;
    }

    tourStartPromise = (async () => {
      const engine = await ensureTour(cleanTourId);

      if (!engine) {
        return;
      }

      await engine.start(cleanTourId, {
        restart: true,
      });
    })();

    try {
      await tourStartPromise;
    } finally {
      tourStartPromise = null;
    }
  }

  async function restoreActiveTour() {
    const tourId = getActiveTourId();

    if (!tourId) {
      return;
    }

    try {
      const engine = await ensureTour(tourId);

      if (!engine) {
        return;
      }

      await engine.restoreFromPage();
    } catch (error) {
      console.warn("Unable to restore guided tour:", error);

      clearSessionValue(ACTIVE_TOUR_STORAGE_KEY);
    }
  }

  async function enableContextHelp() {
    try {
      const help = await ensureContextHelp();

      if (help) {
        help.setContextHelpEnabled(true);
      }
    } catch (error) {
      console.warn("Unable to load Context Help:", error);
    }
  }

  function getClosestElement(event, selector) {
    if (!event.target || typeof event.target.closest !== "function") {
      return null;
    }

    return event.target.closest(selector);
  }

  function handleClick(event) {
    const helpButton = getClosestElement(event, "#appHelpToggleButton");

    if (
      helpButton &&
      !window.DeckadenceHelp &&
      !window.DeckadenceTours?.isActive()
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      enableContextHelp();

      return;
    }

    const tourTrigger = getClosestElement(event, "[data-help-tour-start]");

    if (!tourTrigger) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    startTour(tourTrigger.dataset.helpTourStart).catch((error) => {
      console.warn("Unable to start guided tour:", error);
    });
  }

  function handleKeydown(event) {
    if (!["Enter", " "].includes(event.key)) {
      return;
    }

    const tourTrigger = getClosestElement(event, "[data-help-tour-start]");

    if (!tourTrigger) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    startTour(tourTrigger.dataset.helpTourStart).catch((error) => {
      console.warn("Unable to start guided tour:", error);
    });
  }

  function emit(eventName, payload) {
    document.dispatchEvent(
      new CustomEvent("deckadence:help-event", {
        detail: {
          name: String(eventName || ""),

          payload: payload || {},
        },
      }),
    );
  }

  window.DeckadenceHelpLoader = {
    ensureContextHelp: ensureContextHelp,

    startTour: startTour,

    emit: emit,
  };

  document.addEventListener("click", handleClick, true);

  document.addEventListener("keydown", handleKeydown, true);

  const activeTourId = getActiveTourId();

  if (activeTourId) {
    restoreActiveTour();
  } else if (getSessionValue(CONTEXT_STORAGE_KEY) === "1") {
    ensureContextHelp().catch((error) => {
      console.warn("Unable to restore Context Help:", error);
    });
  }
})();
