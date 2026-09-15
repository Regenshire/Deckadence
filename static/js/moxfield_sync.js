(function () {
  "use strict";

  class MoxfieldSyncController {
    constructor() {
      this.workspace = document.getElementById("deckbuilderWorkspace");

      this.openButton = document.getElementById(
        "deckbuilderMoxfieldSyncButton",
      );

      this.modal = document.getElementById("moxfieldSyncModal");

      this.backdrop = document.getElementById("moxfieldSyncBackdrop");

      this.closeButton = document.getElementById("moxfieldSyncCloseButton");

      this.cancelButton = document.getElementById("moxfieldSyncCancelButton");

      this.applyButton = document.getElementById("moxfieldSyncApplyButton");

      this.urlInput = document.getElementById("moxfieldSyncUrlInput");

      this.actionSelect = document.getElementById("moxfieldSyncActionSelect");

      this.actionHelp = document.getElementById("moxfieldSyncActionHelp");

      this.status = document.getElementById("moxfieldSyncStatus");

      this.currentLinkRow = document.getElementById("moxfieldSyncCurrentLink");

      this.currentLinkAnchor = document.getElementById(
        "moxfieldSyncCurrentLinkAnchor",
      );

      this.openLinkButton = document.getElementById(
        "moxfieldSyncOpenLinkButton",
      );

      this.syncUrl = this.workspace
        ? this.workspace.dataset.moxfieldSyncUrl || ""
        : "";

      this.currentUrl = this.openButton
        ? this.openButton.dataset.moxfieldUrl || ""
        : "";

      this.busy = false;
    }

    initialize() {
      if (!this.workspace || !this.openButton || !this.modal || !this.syncUrl) {
        return;
      }

      this.openButton.addEventListener("click", () => this.open());

      if (this.backdrop) {
        this.backdrop.addEventListener("click", () => this.close());
      }

      if (this.closeButton) {
        this.closeButton.addEventListener("click", () => this.close());
      }

      if (this.cancelButton) {
        this.cancelButton.addEventListener("click", () => this.close());
      }

      if (this.actionSelect) {
        this.actionSelect.addEventListener("change", () =>
          this.updateActionHelp(),
        );
      }

      if (this.applyButton) {
        this.applyButton.addEventListener("click", () => this.apply());
      }

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this.isOpen() && !this.busy) {
          this.close();
        }
      });

      this.updateActionHelp();
    }

    isOpen() {
      return this.modal && !this.modal.classList.contains("hidden");
    }

    open() {
      this.currentUrl = this.openButton.dataset.moxfieldUrl || "";

      if (this.urlInput) {
        this.urlInput.value = this.currentUrl;
      }

      this.updateCurrentLink();
      this.setStatus("", false);

      this.modal.classList.remove("hidden");
      this.modal.setAttribute("aria-hidden", "false");

      this.updateActionHelp();

      window.setTimeout(() => {
        if (this.urlInput) {
          this.urlInput.focus();
          this.urlInput.select();
        }
      }, 50);
    }

    close() {
      if (!this.modal || this.busy) {
        return;
      }

      this.modal.classList.add("hidden");
      this.modal.setAttribute("aria-hidden", "true");

      this.setStatus("", false);
    }

    updateCurrentLink() {
      const hasCurrentUrl = Boolean(this.currentUrl);

      if (this.currentLinkRow) {
        this.currentLinkRow.classList.toggle("hidden", !hasCurrentUrl);
      }

      if (this.currentLinkAnchor) {
        this.currentLinkAnchor.href = hasCurrentUrl ? this.currentUrl : "#";

        this.currentLinkAnchor.textContent = hasCurrentUrl
          ? this.currentUrl
          : "";
      }

      if (this.openLinkButton) {
        this.openLinkButton.href = hasCurrentUrl ? this.currentUrl : "#";
      }
    }

    updateActionHelp() {
      if (!this.actionHelp || !this.actionSelect) {
        return;
      }

      const action = this.actionSelect.value || "add_missing";

      const helpMessages = {
        add_missing:
          "Add cards from the Moxfield deck that are missing from the Deckadence deck.",

        add_all:
          "Adds every card from the Moxfield deck, even when that card is already present in Deckadence.",

        overwrite:
          "Removes the current Deckadence main deck and sideboard, then replaces them with the Moxfield deck.",

        link: "Saves the Moxfield URL to this deck without changing any cards.",
      };

      this.actionHelp.textContent = helpMessages[action] || "";
    }

    validateUrl(rawUrl) {
      const cleanUrl = String(rawUrl || "").trim();

      if (!cleanUrl) {
        return "Paste a Moxfield deck URL.";
      }

      let parsedUrl = null;

      try {
        parsedUrl = new URL(cleanUrl);
      } catch (error) {
        return "Enter a valid Moxfield deck URL.";
      }

      const hostname = parsedUrl.hostname.toLowerCase();

      const validHost =
        hostname === "moxfield.com" || hostname === "www.moxfield.com";

      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

      if (
        !validHost ||
        pathParts.length < 2 ||
        pathParts[0].toLowerCase() !== "decks"
      ) {
        return (
          "Enter a Moxfield deck URL such as " +
          "https://www.moxfield.com/decks/DECK_ID."
        );
      }

      return "";
    }

    getConfirmationOptions(action, externalUrl) {
      if (action === "overwrite") {
        return {
          title: "Overwrite Deck from Moxfield?",
          message:
            "This will remove every card currently in the main deck and " +
            "sideboard, then replace them with the Moxfield deck. " +
            "This cannot be undone.",
          confirmText: "Overwrite Deck",
          cancelText: "Cancel",
          danger: true,
        };
      }

      if (action === "add_all") {
        return {
          title: "Add All Cards from Moxfield?",
          message:
            "Every card from the Moxfield deck will be added to this " +
            "Deckadence deck, including copies of cards already present.",
          confirmText: "Add All Cards",
          cancelText: "Cancel",
        };
      }

      if (action === "add_missing") {
        return {
          title: "Add Missing Cards from Moxfield?",
          message:
            "Deckadence will compare the Moxfield deck with this deck and " +
            "add only the missing card copies.",
          confirmText: "Add Missing Cards",
          cancelText: "Cancel",
        };
      }

      if (
        action === "link" &&
        this.currentUrl &&
        this.currentUrl !== externalUrl
      ) {
        return {
          title: "Replace Moxfield Link?",
          message:
            "This will replace the Moxfield URL currently linked to this " +
            "Deckadence deck. No cards will be changed.",
          confirmText: "Replace Link",
          cancelText: "Cancel",
        };
      }

      return null;
    }

    async confirmAction(action, externalUrl) {
      const confirmationOptions = this.getConfirmationOptions(
        action,
        externalUrl,
      );

      if (!confirmationOptions) {
        return true;
      }

      if (
        !window.iMomirConfirm ||
        typeof window.iMomirConfirm.show !== "function"
      ) {
        this.setStatus(
          "Deckadence confirmation controls are unavailable. Reload the page and try again.",
          true,
        );

        return false;
      }

      return await window.iMomirConfirm.show(confirmationOptions);
    }

    setBusy(isBusy) {
      this.busy = Boolean(isBusy);

      if (this.applyButton) {
        this.applyButton.disabled = this.busy;

        this.applyButton.textContent = this.busy ? "Working..." : "Apply";
      }

      if (this.cancelButton) {
        this.cancelButton.disabled = this.busy;
      }

      if (this.closeButton) {
        this.closeButton.disabled = this.busy;
      }

      if (this.urlInput) {
        this.urlInput.disabled = this.busy;
      }

      if (this.actionSelect) {
        this.actionSelect.disabled = this.busy;
      }
    }

    setStatus(message, isError) {
      if (!this.status) {
        return;
      }

      const cleanMessage = String(message || "").trim();

      this.status.textContent = cleanMessage;

      this.status.classList.toggle("hidden", !cleanMessage);

      this.status.classList.toggle(
        "moxfield-sync-status-error",
        Boolean(isError),
      );
    }

    async apply() {
      if (this.busy || !this.urlInput || !this.actionSelect) {
        return;
      }

      const externalUrl = this.urlInput.value.trim();

      const action = this.actionSelect.value || "add_missing";

      const validationMessage = this.validateUrl(externalUrl);

      if (validationMessage) {
        this.setStatus(validationMessage, true);

        return;
      }

      const confirmed = await this.confirmAction(action, externalUrl);

      if (!confirmed) {
        return;
      }

      this.setBusy(true);

      this.setStatus("Checking the Moxfield deck...", false);

      try {
        const response = await fetch(this.syncUrl, {
          method: "POST",

          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            action: action,
            external_url: externalUrl,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "The Moxfield action failed.");
        }

        this.setStatus(payload.message || "Moxfield action completed.", false);

        if (window.iMomirToast) {
          window.iMomirToast.success(
            payload.message || "Moxfield action completed.",
          );
        }

        window.setTimeout(() => {
          window.location.reload();
        }, 500);
      } catch (error) {
        this.setStatus(error.message || "The Moxfield action failed.", true);

        this.setBusy(false);
      }
    }
  }

  function initializeMoxfieldSync() {
    const controller = new MoxfieldSyncController();

    controller.initialize();

    window.iMomirMoxfieldSync = controller;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeMoxfieldSync);
  } else {
    initializeMoxfieldSync();
  }
})();
