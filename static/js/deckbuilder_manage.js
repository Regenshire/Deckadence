// *** SAVED DECKS - Find and Manage Decks ***
class DeckManagementController {
  constructor(page) {
    this.page = page;
    this.cards = Array.from(page.querySelectorAll(".deckbuilder-manage-card"));
    this.modal = document.getElementById("deckbuilderManageDeleteDeckModal");
    this.confirmInput = document.getElementById("deckbuilderManageDeleteDeckConfirmInput");
    this.confirmButton = document.getElementById("deckbuilderManageDeleteDeckConfirmButton");
    this.selectionCount = document.getElementById("deckbuilderManageSelectionCount");
    this.selectPageButton = document.getElementById("deckbuilderManageSelectPage");
    this.clearButton = document.getElementById("deckbuilderManageClearSelection");
    this.deleteSelectedButton = document.getElementById("deckbuilderManageDeleteSelected");
    this.pendingDelete = null;
    this.deleteInProgress = false;
    this.returnFocus = null;
    this.bindEvents();
    this.updateSelectionState();
  }

  getSelectedCards() {
    return this.cards.filter((card) => card.classList.contains("deckbuilder-manage-card-selected"));
  }

  setCardSelected(card, selected) {
    card.classList.toggle("deckbuilder-manage-card-selected", selected);
    const checkbox = card.querySelector(".manage-deck-checkbox");
    if (checkbox) checkbox.checked = selected;
    card.setAttribute("aria-label", `${card.dataset.deckName || "Untitled Deck"}. ${selected ? "Selected" : "Not selected"}. Press Space to select or deselect.`);
  }

  updateSelectionState() {
    const count = this.getSelectedCards().length;
    const blocked = this.deleteInProgress || Boolean(this.pendingDelete);
    if (this.selectionCount) {
      this.selectionCount.textContent = `${count} deck${count === 1 ? "" : "s"} selected on this page`;
    }
    if (this.selectPageButton) this.selectPageButton.disabled = blocked || count === this.cards.length;
    if (this.clearButton) this.clearButton.disabled = blocked || count === 0;
    if (this.deleteSelectedButton) this.deleteSelectedButton.disabled = blocked || count === 0;
  }

  selectPage(selected) {
    if (this.deleteInProgress || this.pendingDelete) return;
    this.cards.forEach((card) => this.setCardSelected(card, selected));
    this.updateSelectionState();
  }

  openDeleteDialog(cards, url, bulk = false) {
    if (this.deleteInProgress || this.pendingDelete || !cards.length) return;
    this.returnFocus = document.activeElement;
    this.pendingDelete = {
      url,
      bulk,
      decks: cards.map((card) => ({
        id: Number(card.dataset.deckId),
        name: card.dataset.deckName || "Untitled Deck",
      })),
    };
    const count = this.pendingDelete.decks.length;
    const label = bulk ? `Delete ${count} Selected Deck${count === 1 ? "" : "s"}` : "Delete Deck";
    document.getElementById("deckbuilderManageDeleteDeckTitle").textContent = label;
    this.confirmButton.textContent = label;
    this.modal.querySelector(".campaign-add-pack-subtitle").textContent =
      `This removes ${bulk ? "the selected decks" : "the deck"} from saved decks. Type DELETE to confirm.`;
    this.modal.querySelector(".deckbuilder-delete-deck-warning-title").textContent =
      bulk ? `You are about to delete ${count} saved deck${count === 1 ? "" : "s"}.` : "You are about to delete this saved deck.";
    document.getElementById("deckbuilderManageDeleteDeckName").textContent =
      this.pendingDelete.decks.map((deck) => deck.name).join("\n");
    this.confirmInput.value = "";
    this.modal.classList.remove("hidden");
    this.modal.setAttribute("aria-hidden", "false");
    this.updateConfirmState();
    this.updateSelectionState();
    this.confirmInput.focus();
  }

  closeDeleteDialog() {
    if (this.deleteInProgress) return;
    this.modal.classList.add("hidden");
    this.modal.setAttribute("aria-hidden", "true");
    this.pendingDelete = null;
    this.confirmInput.value = "";
    this.updateConfirmState();
    this.updateSelectionState();
    this.returnFocus?.focus();
  }

  updateConfirmState() {
    this.confirmButton.disabled = this.deleteInProgress || !this.pendingDelete ||
      this.confirmInput.value.trim().toUpperCase() !== "DELETE";
  }

  async deletePendingDecks() {
    if (this.deleteInProgress || !this.pendingDelete ||
        this.confirmInput.value.trim().toUpperCase() !== "DELETE") return;
    this.deleteInProgress = true;
    const buttonLabel = this.confirmButton.textContent;
    this.confirmButton.textContent = "Deleting...";
    this.confirmInput.disabled = true;
    this.updateConfirmState();
    this.updateSelectionState();
    try {
      const response = await fetch(this.pendingDelete.url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          deck_ids: this.pendingDelete.decks.map((deck) => deck.id),
          confirmation: "DELETE",
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to delete the selected decks.");
      }
      if (window.iMomirToast) window.iMomirToast.success(payload.message || "Decks deleted.");
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      this.deleteInProgress = false;
      this.confirmInput.disabled = false;
      this.confirmButton.textContent = buttonLabel;
      this.updateConfirmState();
      this.updateSelectionState();
      if (window.iMomirToast) {
        window.iMomirToast.error(error.message || "Failed to delete the selected decks.");
      } else {
        window.alert(error.message || "Failed to delete the selected decks.");
      }
    }
  }

  bindEvents() {
    this.page.addEventListener('change', event => {
      if (!event.target.matches('.manage-deck-checkbox')) return;
      const card = event.target.closest('.deckbuilder-manage-card');
      if (this.deleteInProgress || this.pendingDelete) {
        event.target.checked = card.classList.contains('deckbuilder-manage-card-selected'); return;
      }
      this.setCardSelected(card, event.target.checked);
      this.updateSelectionState();
    });
    this.page.addEventListener("click", (event) => {
      if (this.deleteInProgress || this.pendingDelete) return;
      const card = event.target.closest(".deckbuilder-manage-card");
      if (!card || event.target.closest("button, a, input, select, textarea, label, form")) return;
      this.setCardSelected(card, !card.classList.contains("deckbuilder-manage-card-selected"));
      this.updateSelectionState();
    });
    this.page.addEventListener("keydown", (event) => {
      if (!event.target.matches(".deckbuilder-manage-card") || event.repeat ||
          ![" ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      event.target.click();
    });
    this.selectPageButton?.addEventListener("click", () => this.selectPage(true));
    this.clearButton?.addEventListener("click", () => this.selectPage(false));
    this.deleteSelectedButton?.addEventListener("click", () => {
      this.openDeleteDialog(this.getSelectedCards(), this.page.dataset.bulkDeleteUrl, true);
    });
    this.page.querySelectorAll(".deckbuilder-manage-delete-form").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.openDeleteDialog([form.closest(".deckbuilder-manage-card")], form.action);
      });
    });
    ["deckbuilderManageDeleteDeckBackdrop", "deckbuilderManageDeleteDeckCloseButton",
      "deckbuilderManageDeleteDeckCancelButton"].forEach((id) => {
      document.getElementById(id).addEventListener("click", () => this.closeDeleteDialog());
    });
    document.addEventListener("keydown", (event) => {
      if (!this.pendingDelete) return;
      if (event.key === "Escape") this.closeDeleteDialog();
      if (event.key === "Tab") {
        const controls = Array.from(this.modal.querySelectorAll("button:not(:disabled), input:not(:disabled)"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    this.confirmInput.addEventListener("input", () => this.updateConfirmState());
    this.confirmInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.deletePendingDecks();
      }
    });
    this.confirmButton.addEventListener("click", () => this.deletePendingDecks());
  }
}

const deckManagementPage = document.getElementById("deckbuilderManagePage");
if (deckManagementPage) {
  deckManagementPage.deckManagementController = new DeckManagementController(deckManagementPage);
}
