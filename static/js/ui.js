/* ==========================================
   Deckadence Shared UI Controllers
   ========================================== */

(function () {
  "use strict";

  class UINavigationController {
    constructor(options = {}) {
      this.navigationSelector =
        options.navigationSelector || "[data-ui-navigation-action]";

      this.defaultFallbackUrl = options.defaultFallbackUrl || "/";

      this.isInitialized = false;

      this.handleDocumentClick = this.handleDocumentClick.bind(this);
    }

    initialize() {
      if (this.isInitialized) {
        return;
      }

      document.addEventListener("click", this.handleDocumentClick);

      this.isInitialized = true;
    }

    destroy() {
      if (!this.isInitialized) {
        return;
      }

      document.removeEventListener("click", this.handleDocumentClick);

      this.isInitialized = false;
    }

    handleDocumentClick(event) {
      const navigationElement = event.target.closest(this.navigationSelector);

      if (!navigationElement) {
        return;
      }

      const action = String(navigationElement.dataset.uiNavigationAction || "")
        .trim()
        .toLowerCase();

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "back") {
        this.navigateBack(navigationElement);

        return;
      }

      if (action === "forward") {
        this.navigateForward(navigationElement);
      }
    }

    getSafeFallbackUrl(navigationElement) {
      const fallbackUrl = String(
        navigationElement.dataset.uiNavigationFallback ||
          navigationElement.getAttribute("href") ||
          this.defaultFallbackUrl,
      ).trim();

      if (fallbackUrl.startsWith("/") && !fallbackUrl.startsWith("//")) {
        return fallbackUrl;
      }

      return this.defaultFallbackUrl;
    }

    hasSameOriginReferrer() {
      if (!document.referrer) {
        return false;
      }

      try {
        const referrerUrl = new URL(document.referrer, window.location.href);

        return referrerUrl.origin === window.location.origin;
      } catch (error) {
        return false;
      }
    }

    navigateBack(navigationElement) {
      if (this.hasSameOriginReferrer() && window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.assign(this.getSafeFallbackUrl(navigationElement));
    }

    navigateForward(navigationElement) {
      if (window.history.length > 1) {
        window.history.forward();
        return;
      }

      window.location.assign(this.getSafeFallbackUrl(navigationElement));
    }
  }

  class FileExportController {
    constructor(options = {}) {
      const byId = (id) => document.getElementById(id || "");

      this.form = byId(options.formId);
      this.submitButton = byId(options.submitButtonId);
      this.statusPanel = byId(options.statusPanelId);
      this.statusTitle = byId(options.statusTitleId);
      this.statusMessage = byId(options.statusMessageId);
      this.statusCloseButton = byId(options.statusCloseButtonId);

      this.steps = {
        prepare: byId(options.stepPrepareId),
        generate: byId(options.stepGenerateId),
        deliver: byId(options.stepDeliverId),
        complete: byId(options.stepCompleteId),
      };

      this.progressUrl = String(options.progressUrl || "").trim();

      this.fallbackFilename = String(
        options.fallbackFilename || "deckadence_export.zip",
      ).trim();

      this.generateTitle = String(
        options.generateTitle || "Building Export",
      ).trim();

      this.generateMessage = String(
        options.generateMessage ||
          "Collecting data and creating " + "the export archive...",
      ).trim();

      this.successTitle = String(
        options.successTitle || "Export Complete",
      ).trim();

      this.successMessage = String(
        options.successMessage || "The export has been downloaded.",
      ).trim();

      this.beforeSubmit =
        typeof options.beforeSubmit === "function"
          ? options.beforeSubmit
          : null;

      this.getExtraFormFields =
        typeof options.getExtraFormFields === "function"
          ? options.getExtraFormFields
          : null;

      this.showMessage =
        typeof options.showMessage === "function" ? options.showMessage : null;

      this.pollTimer = 0;
      this.pollInFlight = false;
      this.objectUrl = "";
      this.initialized = false;

      this.handleSubmit = this.handleSubmit.bind(this);
    }

    initialize() {
      if (this.initialized || !this.form) {
        return this;
      }

      this.form.addEventListener("submit", this.handleSubmit);

      this.initialized = true;
      this.reset();

      return this;
    }

    createProgressId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
      }

      return `${Date.now()}-` + Math.random().toString(36).slice(2, 14);
    }

    setWorking(isWorking) {
      if (!this.submitButton) {
        return;
      }

      this.submitButton.disabled = Boolean(isWorking);

      this.submitButton.classList.toggle(
        "action-button-loading",
        Boolean(isWorking),
      );
    }

    setStep(activeStep) {
      const order = ["prepare", "generate", "deliver", "complete"];

      const activeIndex = order.indexOf(activeStep);

      Object.entries(this.steps).forEach(([stepName, element]) => {
        if (!element) {
          return;
        }

        element.classList.toggle(
          "print-export-status-step-active",
          stepName === activeStep,
        );

        element.classList.toggle(
          "print-export-status-step-complete",
          order.indexOf(stepName) < activeIndex,
        );
      });
    }

    showStatus() {
      if (!this.statusPanel) {
        return;
      }

      this.statusPanel.classList.remove("hidden");

      this.statusPanel.setAttribute("aria-hidden", "false");
    }

    updateStatus(step, title, message) {
      this.showStatus();
      this.setStep(step);

      if (this.statusTitle) {
        this.statusTitle.textContent = title || "Export";
      }

      if (this.statusMessage) {
        this.statusMessage.textContent = message || "";
      }
    }

    reset() {
      this.stopPolling();
      this.setWorking(false);

      if (!this.statusPanel) {
        return;
      }

      this.statusPanel.classList.add("hidden");

      this.statusPanel.setAttribute("aria-hidden", "true");

      this.statusPanel.classList.remove(
        "print-export-status-panel-error",
        "print-export-status-panel-complete",
      );

      if (this.statusTitle) {
        this.statusTitle.textContent = "Preparing Export";
      }

      if (this.statusMessage) {
        this.statusMessage.textContent = "Preparing request...";
      }

      if (this.statusCloseButton) {
        this.statusCloseButton.classList.add("hidden");
      }

      this.setStep("prepare");
    }

    complete() {
      this.stopPolling();
      this.showStatus();
      this.setStep("complete");

      this.statusPanel?.classList.remove("print-export-status-panel-error");

      this.statusPanel?.classList.add("print-export-status-panel-complete");

      if (this.statusTitle) {
        this.statusTitle.textContent = this.successTitle;
      }

      if (this.statusMessage) {
        this.statusMessage.textContent = this.successMessage;
      }

      this.statusCloseButton?.classList.remove("hidden");

      this.setWorking(false);
    }

    fail(message) {
      this.stopPolling();
      this.showStatus();

      this.statusPanel?.classList.remove("print-export-status-panel-complete");

      this.statusPanel?.classList.add("print-export-status-panel-error");

      if (this.statusTitle) {
        this.statusTitle.textContent = "Export Failed";
      }

      if (this.statusMessage) {
        this.statusMessage.textContent = message || "Export failed.";
      }

      this.statusCloseButton?.classList.remove("hidden");

      this.setWorking(false);
    }

    stopPolling() {
      if (this.pollTimer) {
        window.clearInterval(this.pollTimer);

        this.pollTimer = 0;
      }

      this.pollInFlight = false;
    }

    async poll(progressId) {
      if (!this.progressUrl || !progressId || this.pollInFlight) {
        return;
      }

      this.pollInFlight = true;

      try {
        const url = new URL(this.progressUrl, window.location.href);

        url.searchParams.set("job_id", progressId);

        const response = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();

        if (payload.ok && payload.found) {
          this.updateStatus(
            payload.step || "generate",
            payload.title || "Building Export",
            payload.message || "Working...",
          );
        }
      } catch (error) {
        // Progress polling is supplemental.
      } finally {
        this.pollInFlight = false;
      }
    }

    startPolling(progressId) {
      this.stopPolling();

      if (!this.progressUrl || !progressId) {
        return;
      }

      window.setTimeout(() => this.poll(progressId), 250);

      this.pollTimer = window.setInterval(() => this.poll(progressId), 1000);
    }

    appendExtraFields(formData) {
      if (!this.getExtraFormFields) {
        return;
      }

      const extraFields = this.getExtraFormFields() || {};

      Object.entries(extraFields).forEach(([name, rawValue]) => {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue];

        values.forEach((value) => {
          if (value !== null && value !== undefined) {
            formData.append(name, String(value));
          }
        });
      });
    }

    getFilename(response) {
      const header = response.headers.get("Content-Disposition") || "";

      const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);

      if (utfMatch?.[1]) {
        try {
          return (
            decodeURIComponent(utfMatch[1].replace(/"/g, "").trim()) ||
            this.fallbackFilename
          );
        } catch (error) {
          return utfMatch[1].replace(/"/g, "").trim() || this.fallbackFilename;
        }
      }

      const normalMatch = header.match(/filename="?([^"]+)"?/i);

      return normalMatch?.[1]?.trim() || this.fallbackFilename;
    }

    download(blob, filename) {
      this.objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = this.objectUrl;
      link.download = filename || this.fallbackFilename;
      link.style.display = "none";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const objectUrl = this.objectUrl;
      this.objectUrl = "";

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }

    notify(message, isError) {
      if (this.showMessage) {
        this.showMessage(message, isError);

        return;
      }

      if (!window.iMomirToast) {
        return;
      }

      if (isError) {
        window.iMomirToast.error(message || "Export failed.");
      } else {
        window.iMomirToast.success(message || "Export complete.");
      }
    }

    async handleSubmit(event) {
      event.preventDefault();

      const validationMessage = this.beforeSubmit
        ? this.beforeSubmit() || ""
        : "";

      if (validationMessage) {
        this.notify(validationMessage, true);

        return;
      }

      const actionUrl = String(this.form?.action || "").trim();

      if (!actionUrl) {
        this.fail("Export URL was not configured.");

        return;
      }

      this.reset();
      this.setWorking(true);

      this.updateStatus(
        "prepare",
        "Preparing Export",
        "Collecting export settings...",
      );

      const formData = new FormData(this.form);

      this.appendExtraFields(formData);

      const progressId = this.createProgressId();

      formData.set("print_export_action", "export");

      formData.set("print_export_progress_id", progressId);

      this.startPolling(progressId);

      window.setTimeout(() => {
        this.updateStatus("generate", this.generateTitle, this.generateMessage);
      }, 150);

      try {
        const response = await fetch(actionUrl, {
          method: "POST",
          body: formData,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        this.stopPolling();

        if (!response.ok) {
          const errorText = String((await response.text()) || "").trim();

          throw new Error(errorText || "Export failed.");
        }

        this.updateStatus(
          "deliver",
          "Downloading Export",
          "The export is ready. " + "Starting download...",
        );

        const blob = await response.blob();

        this.download(blob, this.getFilename(response));

        this.complete();

        this.notify("Export complete.", false);
      } catch (error) {
        console.error(error);

        const message = error?.message || "Export failed.";

        this.fail(message);

        this.notify(message, true);
      }
    }
  }

  /*
   * Shared Deckadence UI namespace.
   *
   * Future reusable UI controllers can be added here:
   *
   * window.iMomirUI.navigation
   * window.iMomirUI.dialogs
   * window.iMomirUI.notifications
   * window.iMomirUI.tooltips
   *
   * without putting those systems into app.js.
   */
  window.iMomirUI = window.iMomirUI || {};

  window.iMomirUI.UINavigationController = UINavigationController;
  window.iMomirUI.FileExportController = FileExportController;

  window.iMomirUI.navigation = new UINavigationController();

  function initializeSharedUi() {
    window.iMomirUI.navigation.initialize();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSharedUi, {
      once: true,
    });
  } else {
    initializeSharedUi();
  }
})();
