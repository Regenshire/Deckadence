/* Review prototypes: no network calls, production globals, or persistent writes. */
"use strict";

class DialogController {
  constructor(dialog) {
    this.dialog = dialog;
    this.opener = null;
    this.resolve = null;
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-close], [data-cancel]")) this.close(false);
      if (event.target.closest("[data-confirm]")) this.close(true);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.close(false);
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll(
        "button, a[href], input, select, textarea, summary, [tabindex]",
      )).filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
    dialog.addEventListener("close", () => {
      this.opener?.focus();
      this.resolve?.(dialog.returnValue === "confirmed");
      this.resolve = null;
    });
  }

  open() {
    if (this.dialog.open) return;
    this.opener = document.activeElement;
    this.dialog.returnValue = "";
    this.dialog.showModal();
  }

  confirm({ title, message, confirmText = "Delete" }) {
    if (this.dialog.open) return Promise.resolve(false);
    this.dialog.querySelector("h2").textContent = title;
    this.dialog.querySelector("p").textContent = message;
    this.dialog.querySelector("[data-confirm]").textContent = confirmText;
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  close(confirmed = false) {
    this.dialog.close(confirmed ? "confirmed" : "cancelled");
  }
}

class CollectionController {
  constructor(root, { confirmDialog, detailDialog }) {
    this.root = root;
    this.form = root.querySelector("form");
    this.rows = Array.from(root.querySelectorAll("[data-name]"));
    this.confirmDialog = confirmDialog;
    this.detailDialog = detailDialog;
    this.form.addEventListener("submit", (event) => { event.preventDefault(); this.filter(); });
    root.querySelector("[data-filter-toggle]").addEventListener("click", (event) => {
      const button = event.currentTarget;
      const panel = root.querySelector(".filters");
      panel.hidden = !panel.hidden;
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    root.querySelectorAll("[data-clear]").forEach((button) => button.addEventListener("click", () => {
      this.form.reset(); this.filter(); this.form.elements.query.focus();
    }));
    root.querySelector("[data-select-page]").addEventListener("change", (event) => {
      this.rows.filter((row) => !row.hidden).forEach((row) => { row.querySelector("[data-select]").checked = event.target.checked; });
      this.updateSelection();
    });
    root.querySelectorAll("[data-select]").forEach((input) => input.addEventListener("change", () => this.updateSelection()));
    root.querySelector("[data-clear-selection]").addEventListener("click", () => {
      this.clearSelection(); root.querySelector("[data-select-page]").focus();
    });
    root.querySelector("[data-delete]").addEventListener("click", () => this.confirmSelection());
    root.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => {
      this.detailDialog.dialog.querySelector("h2").textContent = button.closest("[data-name]").dataset.name;
      this.detailDialog.open();
    }));
    this.filter();
  }

  filter() {
    const { query, format, sort } = this.form.elements;
    const search = query.value.trim().toLocaleLowerCase();
    this.rows.sort((a,b) => sort.value === "name" ? a.dataset.name.localeCompare(b.dataset.name) : Number(b.dataset.order) - Number(a.dataset.order));
    this.rows.forEach((row) => {
      row.hidden = !`${row.dataset.name} ${row.dataset.format}`.toLocaleLowerCase().includes(search) || Boolean(format.value && row.dataset.format !== format.value);
      this.root.querySelector("[data-rows]").append(row);
    });
    this.clearSelection();
    const count = this.rows.filter((row) => !row.hidden).length;
    this.root.querySelector("[data-results]").textContent = `${count} ${count === 1 ? "deck" : "decks"}${format.value ? ` · ${format.value}` : ""}`;
    this.root.querySelector("[data-filter-count]").textContent = format.value ? "(1)" : "";
    this.root.querySelector("[data-empty]").hidden = count > 0;
    this.root.querySelector("[data-select-page]").disabled = count === 0;
  }

  clearSelection() {
    this.rows.forEach((row) => { row.querySelector("[data-select]").checked = false; });
    this.updateSelection();
  }

  updateSelection() {
    const visible = this.rows.filter((row) => !row.hidden);
    const count = visible.filter((row) => row.querySelector("[data-select]").checked).length;
    const all = this.root.querySelector("[data-select-page]");
    all.checked = count > 0 && count === visible.length;
    all.indeterminate = count > 0 && count < visible.length;
    this.root.querySelector("[data-selection]").hidden = count === 0;
    this.root.querySelector("[data-selected-count]").textContent = `${count} selected on this page`;
  }

  async confirmSelection() {
    const selected = this.rows.filter((row) => !row.hidden && row.querySelector("[data-select]").checked);
    if (!selected.length) return;
    const confirmed = await this.confirmDialog.confirm({ title: `Delete ${selected.length} ${selected.length === 1 ? "deck" : "decks"}?`, message: `${selected.map((row) => row.dataset.name).join(", ")}. This would permanently delete the selected saved decks.`, confirmText: "Delete selected" });
    if (confirmed) this.root.querySelector("[data-collection-status]").textContent = "Confirmation demonstrated. Sample decks have been kept.";
  }
}

class DirtyFormController {
  constructor(form, { save }) {
    this.form = form;
    this.save = save;
    this.baseline = this.serialize();
    this.busy = false;
    this.status = form.querySelector("[data-save-status]");
    this.status.tabIndex = -1;
    form.addEventListener("invalid", (event) => {
      let parent = event.target.parentElement;
      while (parent && parent !== form) {
        if (parent.tagName === "DETAILS") parent.open = true;
        parent = parent.parentElement;
      }
    }, true);
    form.addEventListener("input", () => this.update());
    form.addEventListener("change", () => this.update());
    form.addEventListener("submit", (event) => { event.preventDefault(); this.submit(); });
    form.querySelector("[data-discard]").addEventListener("click", () => {
      const values = new Map(JSON.parse(this.baseline));
      for (const field of form.elements) {
        if (!field.name || field.disabled) continue;
        if (field.type === "checkbox") field.checked = values.has(field.name);
        else field.value = values.get(field.name) ?? "";
      }
      this.update(); this.status.focus();
    });
    window.addEventListener("beforeunload", (event) => {
      if (!this.dirty) return;
      event.preventDefault(); event.returnValue = "";
    });
  }

  serialize() { return JSON.stringify(Array.from(new FormData(this.form))); }
  get dirty() { return this.busy || this.serialize() !== this.baseline; }

  update() {
    this.form.querySelector("[data-savebar]").hidden = !this.dirty && !this.busy;
    this.status.classList.remove("error");
    this.status.textContent = this.dirty ? "Changes apply when you save." : "All changes saved";
  }

  async submit() {
    if (this.busy || !this.dirty || !this.form.reportValidity()) return;
    const snapshot = this.serialize();
    this.busy = true;
    this.form.setAttribute("aria-busy", "true");
    const controls = new Map(Array.from(this.form.elements, (control) => [control, control.disabled]));
    controls.forEach((disabled, control) => { control.disabled = true; });
    this.status.classList.remove("error");
    this.status.textContent = "Saving…";
    this.status.tabIndex = -1;
    this.status.focus();
    try {
      await this.save(JSON.parse(snapshot));
      this.baseline = snapshot;
      this.status.textContent = "Changes saved";
      this.form.querySelector("[data-savebar]").hidden = true;
    } catch (error) {
      this.status.textContent = error.message;
      this.status.classList.add("error");
      this.status.focus();
    } finally {
      this.busy = false;
      controls.forEach((disabled, control) => { control.disabled = disabled; });
      this.form.removeAttribute("aria-busy");
      if (!this.dirty) this.status.focus();
    }
  }
}

class JobController {
  constructor({ button, panel, message, progress, run }) {
    Object.assign(this, { button, panel, message, progress, run });
    this.busy = false;
    button.addEventListener("click", () => this.start());
  }

  async start() {
    if (this.busy) return;
    this.busy = true;
    this.button.disabled = true;
    this.panel.hidden = false;
    this.message.classList.remove("error");
    this.message.textContent = "Preparing PDF…";
    this.message.tabIndex = -1;
    this.message.focus();
    this.progress.hidden = false;
    this.panel.setAttribute("aria-busy", "true");
    try {
      await this.run();
      this.message.textContent = "PDF ready. Demo only — no file was generated.";
      this.button.textContent = "Create again";
    } catch (error) {
      this.message.textContent = error.message;
      this.message.classList.add("error");
      this.button.textContent = "Try again";
    } finally {
      this.busy = false;
      this.button.disabled = false;
      this.progress.hidden = true;
      this.panel.removeAttribute("aria-busy");
    }
  }
}

class NumericEntryController {
  constructor(form, { input, error, onSubmit }) {
    this.form = form;
    this.input = input;
    this.error = error;
    this.onSubmit = onSubmit;
    form.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button || button.type === "submit") return;
      if (button.hasAttribute("data-clear-number")) input.value = "";
      if (button.hasAttribute("data-backspace")) input.value = input.value.slice(0, -1);
      if (button.dataset.digit && input.value.length < input.maxLength) input.value += button.dataset.digit;
      this.clearError();
    });
    input.addEventListener("input", () => this.clearError());
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!input.checkValidity()) {
        error.hidden = false;
        error.textContent = "Enter a whole number from 0 to 99.";
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      this.clearError();
      this.onSubmit(Number(input.value));
    });
  }

  clearError() {
    this.error.hidden = true;
    this.error.textContent = "";
    this.input.removeAttribute("aria-invalid");
  }
}

