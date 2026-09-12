(function () {
  if (window.DeckadenceTours) {
    return;
  }

  class GuidedTourEngine {
    constructor() {
      this.tours = new Map();
      this.activeTour = null;
      this.stepIndex = -1;
      this.target = null;
      this.routeMismatch = false;

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

    getCurrentStep() {
      if (!this.activeTour) {
        return null;
      }

      return this.activeTour.steps[this.stepIndex] || null;
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

      if (window.DeckadenceHelp && window.DeckadenceHelp.registerTour) {
        window.DeckadenceHelp.registerTour(normalizedTour);
      }
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

      this.nextButton.textContent =
        this.stepIndex >= this.activeTour.steps.length - 1
          ? step.nextLabel || "Finish"
          : step.nextLabel || "Next";

      const stepRoute = this.normalizePath(step.route || this.currentPath());

      this.routeMismatch = stepRoute !== this.currentPath();

      if (this.routeMismatch) {
        this.body.textContent =
          step.routeMessage ||
          "This part of the guide continues on another page. " +
            "You can return to the tour when you are ready.";

        this.nextButton.textContent = step.returnLabel || "Return to Tour";

        this.positionPanel(null);

        return;
      }

      if (!step.target) {
        this.positionPanel(null);

        return;
      }

      const target = document.querySelector(step.target);

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

      if (!this.activeTour || !step || !window.DeckadenceHelp) {
        return null;
      }

      try {
        return await window.DeckadenceHelp.saveTourProgress({
          tour_id: this.activeTour.id,

          tour_version: this.activeTour.version,

          current_step_id: step.id,

          status: status || "active",

          context: {},
        });
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

      if (
        progress &&
        Number(progress.tour_version) === tour.version &&
        progress.status === "active"
      ) {
        const savedIndex = this.findStepIndex(tour, progress.current_step_id);

        if (savedIndex >= 0) {
          stepIndex = savedIndex;
        }
      }

      if (window.DeckadenceHelp) {
        window.DeckadenceHelp.setContextHelpEnabled(false);
      }

      this.activeTour = tour;

      this.stepIndex = stepIndex;

      await this.saveProgress("active");

      this.renderCurrentStep();
    }

    async reset() {
      if (!this.activeTour) {
        return;
      }

      await this.saveProgress("dismissed");

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

      const step = this.getCurrentStep();

      if (this.routeMismatch && step && step.route) {
        window.location.href = this.normalizePath(step.route);

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
          return;
        }

        const tour = this.tours.get(this.normalizeKey(saved.tour_id));

        if (!tour || Number(saved.tour_version) !== tour.version) {
          return;
        }

        const stepIndex = this.findStepIndex(tour, saved.current_step_id);

        if (stepIndex < 0) {
          return;
        }

        if (window.DeckadenceHelp) {
          window.DeckadenceHelp.setContextHelpEnabled(false);
        }

        this.activeTour = tour;

        this.stepIndex = stepIndex;

        this.renderCurrentStep();
      } catch (error) {
        console.warn("Unable to restore active guided tour:", error);
      }
    }

    handleTourStart(event) {
      if (!event.target || typeof event.target.closest !== "function") {
        return;
      }

      const trigger = event.target.closest("[data-help-tour-start]");

      if (!trigger) {
        return;
      }

      event.preventDefault();

      this.start(trigger.dataset.helpTourStart);
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

      document.addEventListener("click", (event) => {
        this.handleTourStart(event);
      });

      document.addEventListener("keydown", (event) => {
        if (["Enter", " "].includes(event.key)) {
          this.handleTourStart(event);
        }

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

          this.pause();
        },
        true,
      );

      document.addEventListener("deckadence:help-event", (event) => {
        const step = this.getCurrentStep();

        const eventName = this.normalizeKey(event.detail && event.detail.name);

        if (
          step &&
          step.advanceOnEvent &&
          this.normalizeKey(step.advanceOnEvent) === eventName
        ) {
          this.next();
        }
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

      this.restoreActiveTour();
    }

    isActive() {
      return Boolean(this.activeTour);
    }
  }

  const engine = new GuidedTourEngine();

  window.DeckadenceTours = engine;

  document.addEventListener("DOMContentLoaded", () => {
    engine.initialize();
  });
})();
