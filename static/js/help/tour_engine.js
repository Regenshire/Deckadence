(function () {
  if (window.DeckadenceTours) {
    return;
  }

  const ACTIVE_TOUR_STORAGE_KEY = "deckadence.activeTourId";
  const CONTEXT_STORAGE_KEY = "deckadence.contextHelpEnabled";

  class GuidedTourEngine {
    constructor() {
      this.tours = new Map();
      this.activeTour = null;
      this.stepIndex = -1;
      this.target = null;
      this.routeMismatch = false;
      this.context = {};

      this.layer = null;
      this.exitButton = null;
      this.panel = null;
      this.title = null;
      this.progress = null;
      this.body = null;
      this.backButton = null;
      this.nextButton = null;
    }

    normalizeKey(value) {
      return String(value || "")
        .trim()
        .toLowerCase();
    }

    normalizePath(value) {
      const cleanValue = String(value || "/").trim() || "/";

      if (cleanValue === "/") {
        return "/";
      }

      return cleanValue.replace(/\/+$/, "") || "/";
    }

    currentPath() {
      return this.normalizePath(window.location.pathname);
    }

    setActiveTourSession(tourId) {
      try {
        sessionStorage.setItem(
          ACTIVE_TOUR_STORAGE_KEY,
          this.normalizeKey(tourId),
        );
      } catch (error) {
        // Tour still works on the current page if storage is unavailable.
      }
    }

    clearActiveTourSession() {
      try {
        sessionStorage.removeItem(ACTIVE_TOUR_STORAGE_KEY);
      } catch (error) {
        // Nothing else is required.
      }
    }

    disableContextHelp() {
      try {
        sessionStorage.setItem(CONTEXT_STORAGE_KEY, "0");
      } catch (error) {
        // Context Help can still be disabled in memory below.
      }

      if (
        window.DeckadenceHelp &&
        typeof window.DeckadenceHelp.setContextHelpEnabled === "function"
      ) {
        window.DeckadenceHelp.setContextHelpEnabled(false);
      }
    }

    getCurrentStep() {
      if (!this.activeTour) {
        return null;
      }

      return this.activeTour.steps[this.stepIndex] || null;
    }

    isWaitingForEvent(eventName) {
      const step = this.getCurrentStep();
      const cleanEventName = this.normalizeKey(eventName);

      return Boolean(
        step &&
        cleanEventName &&
        step.advanceOnEvent &&
        this.normalizeKey(step.advanceOnEvent) === cleanEventName,
      );
    }

    resolveStepTarget(step) {
      if (!step || !step.target) {
        return "";
      }

      if (typeof step.target === "function") {
        return String(step.target({ ...this.context }) || "").trim();
      }

      return String(step.target || "").trim();
    }

    async handleHelpEvent(detail) {
      const step = this.getCurrentStep();
      const eventName = this.normalizeKey(detail && detail.name);

      if (
        !step ||
        !step.advanceOnEvent ||
        this.normalizeKey(step.advanceOnEvent) !== eventName
      ) {
        return false;
      }

      const payload = detail && detail.payload;

      if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        this.context = {
          ...this.context,
          ...payload,
        };
      }

      await this.next();

      return true;
    }

    readPageEvent() {
      const url = new URL(window.location.href);
      const eventName = this.normalizeKey(url.searchParams.get("help_event"));

      if (!eventName) {
        return null;
      }

      const payload = {};
      const eventKeys = ["help_event"];

      for (const [key, value] of url.searchParams.entries()) {
        if (!key.startsWith("help_event_")) {
          continue;
        }

        eventKeys.push(key);

        const rawPayloadKey = key.slice("help_event_".length);

        if (!rawPayloadKey) {
          continue;
        }

        const payloadKey = rawPayloadKey.replace(
          /_([a-z0-9])/g,
          function (_match, character) {
            return character.toUpperCase();
          },
        );

        payload[payloadKey] = value;
      }

      eventKeys.forEach(function (key) {
        url.searchParams.delete(key);
      });

      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );

      return {
        name: eventName,
        payload: payload,
      };
    }

    register(rawTour) {
      const tour = rawTour || {};

      const tourId = this.normalizeKey(tour.id);

      if (!tourId || !Array.isArray(tour.steps) || tour.steps.length === 0) {
        throw new Error("A guided tour requires an id and at least one step.");
      }

      const normalizedTour = {
        ...tour,

        id: tourId,

        title: String(tour.title || tourId),

        version: Math.max(1, Number(tour.version) || 1),

        steps: tour.steps.map((step, index) => ({
          ...step,

          id: this.normalizeKey(step.id || `step_${index + 1}`),
        })),
      };

      this.tours.set(tourId, normalizedTour);
    }

    clearTarget() {
      if (this.target) {
        this.target.classList.remove("deck-help-tour-target");
      }

      this.target = null;
    }

    setLayerVisible(visible) {
      if (!this.layer) {
        return;
      }

      this.layer.hidden = !visible;

      this.layer.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    showTourUi() {
      this.setLayerVisible(true);

      if (this.exitButton) {
        this.exitButton.hidden = false;
      }

      if (this.panel) {
        this.panel.hidden = false;

        this.panel.setAttribute("aria-hidden", "false");
      }
    }

    hideTourUi() {
      this.clearTarget();

      if (this.panel) {
        this.panel.hidden = true;

        this.panel.setAttribute("aria-hidden", "true");

        this.panel.classList.remove("deck-help-tour-panel-centered");
      }

      const contextHelpEnabled = Boolean(
        window.DeckadenceHelp &&
        window.DeckadenceHelp.isContextHelpEnabled &&
        window.DeckadenceHelp.isContextHelpEnabled(),
      );

      if (!contextHelpEnabled) {
        if (this.exitButton) {
          this.exitButton.hidden = true;
        }

        this.setLayerVisible(false);
      }
    }

    positionPanel(target) {
      if (!this.panel || this.panel.hidden) {
        return;
      }

      this.panel.classList.remove("deck-help-tour-panel-centered");

      this.panel.style.left = "";
      this.panel.style.right = "";
      this.panel.style.top = "";
      this.panel.style.bottom = "";

      if (!target) {
        this.panel.classList.add("deck-help-tour-panel-centered");

        return;
      }

      requestAnimationFrame(() => {
        if (this.target !== target || this.panel.hidden) {
          return;
        }

        const targetRect = target.getBoundingClientRect();

        const panelRect = this.panel.getBoundingClientRect();

        const padding = 14;
        const gap = 14;

        let left = targetRect.right + gap;

        let top = targetRect.top + (targetRect.height - panelRect.height) / 2;

        if (left + panelRect.width > window.innerWidth - padding) {
          left = targetRect.left - panelRect.width - gap;
        }

        if (left < padding) {
          left = window.innerWidth - panelRect.width - padding;

          top = window.innerHeight - panelRect.height - 72;
        }

        left = Math.max(
          padding,
          Math.min(left, window.innerWidth - panelRect.width - padding),
        );

        top = Math.max(
          padding,
          Math.min(top, window.innerHeight - panelRect.height - padding),
        );

        this.panel.style.left = `${Math.round(left)}px`;

        this.panel.style.top = `${Math.round(top)}px`;
      });
    }

    findStepIndex(tour, stepId) {
      const cleanStepId = this.normalizeKey(stepId);

      return tour.steps.findIndex(
        (step) => this.normalizeKey(step.id) === cleanStepId,
      );
    }

    renderCurrentStep() {
      const step = this.getCurrentStep();

      if (!this.activeTour || !step) {
        this.hideTourUi();
        return;
      }

      this.clearTarget();
      this.showTourUi();

      this.title.textContent = step.title || this.activeTour.title;

      this.progress.textContent = `Step ${this.stepIndex + 1} of ${this.activeTour.steps.length}`;

      this.body.textContent = step.body || "";

      this.backButton.hidden = this.stepIndex <= 0;

      // Guided tours are informational. Never require a user action
      // before allowing them to continue.
      this.nextButton.hidden = false;

      this.nextButton.textContent =
        this.stepIndex >= this.activeTour.steps.length - 1
          ? step.nextLabel || "Finish"
          : step.nextLabel || "Next";

      const stepRoute = this.normalizePath(step.route || this.currentPath());

      this.routeMismatch = stepRoute !== this.currentPath();

      if (this.routeMismatch) {
        this.positionPanel(null);

        return;
      }

      const targetSelector = this.resolveStepTarget(step);

      if (!targetSelector) {
        this.positionPanel(null);

        return;
      }

      const target = document.querySelector(targetSelector);

      if (!target) {
        this.body.textContent =
          `${step.body || ""}\n\n` +
          "This control is not currently visible. " +
          "You can continue or exit Help.";

        this.positionPanel(null);

        return;
      }

      this.target = target;

      target.classList.add("deck-help-tour-target");

      if (step.scroll !== false) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }

      window.setTimeout(() => {
        this.positionPanel(target);
      }, 220);
    }

    async loadProgress(tourId) {
      try {
        const response = await fetch(
          `/api/help/progress/${encodeURIComponent(tourId)}`,
          {
            cache: "no-store",
          },
        );

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          return null;
        }

        return payload.progress || null;
      } catch (error) {
        console.warn("Unable to load guided tour progress:", error);

        return null;
      }
    }

    async saveProgress(status) {
      const step = this.getCurrentStep();

      if (!this.activeTour || !step) {
        return null;
      }

      try {
        const response = await fetch("/api/help/progress", {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            tour_id: this.activeTour.id,

            tour_version: this.activeTour.version,

            current_step_id: step.id,

            status: status || "active",

            context: this.context,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Unable to save help progress.");
        }

        return payload.progress || null;
      } catch (error) {
        console.warn("Unable to save guided tour progress:", error);

        return null;
      }
    }

    async start(tourId, options) {
      const cleanTourId = this.normalizeKey(tourId);

      const tour = this.tours.get(cleanTourId);

      if (!tour) {
        console.warn(`Unknown Deckadence guided tour: ${cleanTourId}`);

        return;
      }

      const startOptions = options || {};

      const progress = startOptions.restart
        ? null
        : await this.loadProgress(cleanTourId);

      let stepIndex = 0;
      let resumeProgress = false;

      if (
        progress &&
        Number(progress.tour_version) === tour.version &&
        progress.status === "active"
      ) {
        const savedIndex = this.findStepIndex(tour, progress.current_step_id);

        if (savedIndex >= 0) {
          stepIndex = savedIndex;
          resumeProgress = true;
        }
      }

      this.context =
        resumeProgress &&
        progress.context &&
        typeof progress.context === "object" &&
        !Array.isArray(progress.context)
          ? { ...progress.context }
          : {};

      this.disableContextHelp();

      this.activeTour = tour;

      this.stepIndex = stepIndex;

      this.setActiveTourSession(cleanTourId);

      await this.saveProgress("active");

      this.renderCurrentStep();
    }

    async reset() {
      if (!this.activeTour) {
        return;
      }

      await this.saveProgress("dismissed");

      this.clearActiveTourSession();

      this.activeTour = null;

      this.stepIndex = -1;

      this.routeMismatch = false;

      this.hideTourUi();
    }

    async complete() {
      if (!this.activeTour) {
        return;
      }

      await this.saveProgress("completed");

      this.clearActiveTourSession();

      this.activeTour = null;

      this.stepIndex = -1;

      this.routeMismatch = false;

      this.hideTourUi();
    }

    async moveToStep(nextIndex) {
      if (
        !this.activeTour ||
        nextIndex < 0 ||
        nextIndex >= this.activeTour.steps.length
      ) {
        return;
      }

      this.stepIndex = nextIndex;

      await this.saveProgress("active");

      const step = this.getCurrentStep();

      const stepRoute = this.normalizePath(step.route || this.currentPath());

      if (stepRoute !== this.currentPath()) {
        window.location.href = stepRoute;

        return;
      }

      this.renderCurrentStep();
    }

    async next() {
      if (!this.activeTour) {
        return;
      }

      if (this.stepIndex >= this.activeTour.steps.length - 1) {
        await this.complete();
        return;
      }

      await this.moveToStep(this.stepIndex + 1);
    }

    async previous() {
      if (!this.activeTour || this.stepIndex <= 0) {
        return;
      }

      await this.moveToStep(this.stepIndex - 1);
    }

    async restoreActiveTour() {
      try {
        const response = await fetch("/api/help/bootstrap", {
          cache: "no-store",
        });

        const payload = await response.json();

        const saved = response.ok && payload.ok ? payload.active_tour : null;

        if (!saved) {
          this.clearActiveTourSession();
          return false;
        }

        const tour = this.tours.get(this.normalizeKey(saved.tour_id));

        if (!tour || Number(saved.tour_version) !== tour.version) {
          this.clearActiveTourSession();
          return false;
        }

        const stepIndex = this.findStepIndex(tour, saved.current_step_id);

        if (stepIndex < 0) {
          this.clearActiveTourSession();
          return false;
        }

        this.disableContextHelp();

        this.activeTour = tour;

        this.stepIndex = stepIndex;

        this.context =
          saved.context &&
          typeof saved.context === "object" &&
          !Array.isArray(saved.context)
            ? { ...saved.context }
            : {};

        this.setActiveTourSession(tour.id);

        this.renderCurrentStep();

        return true;
      } catch (error) {
        console.warn("Unable to restore active guided tour:", error);

        return false;
      }
    }

    async restoreFromPage() {
      const restored = await this.restoreActiveTour();

      if (!restored) {
        return false;
      }

      const pageEvent = this.readPageEvent();

      if (pageEvent) {
        await this.handleHelpEvent(pageEvent);
      }

      return true;
    }

    initialize() {
      this.layer = document.getElementById("deckHelpLayer");

      this.exitButton = document.getElementById("deckHelpExitButton");

      this.panel = document.getElementById("deckHelpTourPanel");

      this.title = document.getElementById("deckHelpTourTitle");

      this.progress = document.getElementById("deckHelpTourProgress");

      this.body = document.getElementById("deckHelpTourBody");

      this.backButton = document.getElementById("deckHelpTourBackButton");

      this.nextButton = document.getElementById("deckHelpTourNextButton");

      if (!this.layer || !this.panel || !this.backButton || !this.nextButton) {
        return;
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.activeTour) {
          this.reset();
        }
      });

      this.backButton.addEventListener("click", () => {
        this.previous();
      });

      this.nextButton.addEventListener("click", () => {
        this.next();
      });

      this.exitButton?.addEventListener(
        "click",
        () => {
          if (this.activeTour) {
            this.reset();
          }
        },
        true,
      );

      const helpToggleButton = document.getElementById("appHelpToggleButton");

      helpToggleButton?.addEventListener(
        "click",
        (event) => {
          if (!this.activeTour) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          this.reset();
        },
        true,
      );

      document.addEventListener("deckadence:help-event", (event) => {
        this.handleHelpEvent(event.detail);
      });

      window.addEventListener("resize", () => {
        if (this.activeTour) {
          this.positionPanel(this.target);
        }
      });

      window.addEventListener(
        "scroll",
        () => {
          if (this.activeTour) {
            this.positionPanel(this.target);
          }
        },
        true,
      );
    }

    isActive() {
      return Boolean(this.activeTour);
    }
  }

  const engine = new GuidedTourEngine();

  window.DeckadenceTours = engine;

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        engine.initialize();
      },
      {
        once: true,
      },
    );
  } else {
    engine.initialize();
  }
})();
