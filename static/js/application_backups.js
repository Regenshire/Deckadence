class ApplicationBackupController {
  constructor(panel) {
    this.panel = panel;
    const get = (suffix) => document.getElementById("application" + suffix);
    this.createButton = get("BackupCreate");
    this.openButton = get("BackupOpen");
    this.cancelExportButton = get("BackupCancelExport");
    this.selectionInputs = [...this.panel.querySelectorAll("[data-export-option]")];
    this.groupInputs = [...this.panel.querySelectorAll("[data-export-all]")];
    this.operation = null;
    this.jobId = null;
    this.cancelling = false;
    this.exportJobId = null;
    this.savedJobs = new Set();
    this.file = get("RestoreFile");
    this.confirmation = get("RestoreConfirmation");
    this.restoreButton = get("RestoreStart");
    this.cancelButton = get("RestoreCancel");
    this.stage = get("BackupStage");
    this.statusPanel = get("BackupStatusPanel");
    this.message = get("BackupMessage");
    this.progress = get("BackupProgress");
    this.detail = get("BackupDetail");
    this.error = get("BackupError");
    this.download = get("BackupDownload");
    this.savedPath = get("BackupSavedPath");
    this.modal = get("BackupModal");
    this.modalClose = get("BackupModalClose");
    this.showProgress = get("BackupShowProgress");
    this.currentFile = get("BackupCurrentFile");
    this.settings = get("BackupSettings");
    this.warnings = get("BackupWarnings");
    this.warningList = get("BackupWarningList");
    this.busy = false;
    this.pending = false;
    this.uploading = false;
    this.pollTimer = null;
    this.pollGeneration = 0;
    this.openButton.addEventListener("click", () => this.openStatus());
    this.cancelExportButton.addEventListener("click", () => this.cancelExport());
    this.groupInputs.forEach((parent) => parent.addEventListener("change", () => {
      this.selectionInputs.filter((input) => input.dataset.exportGroup === parent.dataset.exportAll).forEach((input) => { input.checked = parent.checked; });
      this.updateControls();
    }));
    this.selectionInputs.forEach((input) => input.addEventListener("change", () => this.updateControls()));
    this.createButton.addEventListener("click", () => this.createBackup());
    this.restoreButton.addEventListener("click", () => this.restoreBackup());
    this.cancelButton.addEventListener("click", () => this.cancelRestore());
    this.showProgress.addEventListener("click", () => this.openStatus());
    this.modalClose.addEventListener("click", () => this.modal.close());
    this.modal.addEventListener("cancel", (event) => { if (this.busy) event.preventDefault(); });
    this.confirmation.addEventListener("input", () => this.updateControls());
    this.file.addEventListener("change", () => this.updateControls());
    this.poll();
  }

  updateControls() {
    const blocked = this.busy || this.pending;
    this.createButton.disabled = blocked || !this.selectionInputs.some((input) => input.checked);
    this.openButton.disabled = blocked;
    this.selectionInputs.forEach((input) => { input.disabled = blocked; });
    this.groupInputs.forEach((parent) => {
      const children = this.selectionInputs.filter((input) => input.dataset.exportGroup === parent.dataset.exportAll);
      parent.checked = children.every((input) => input.checked);
      parent.indeterminate = !parent.checked && children.some((input) => input.checked);
      parent.disabled = blocked;
    });
    this.cancelExportButton.disabled = !this.busy || this.operation !== "backup" || this.cancelling || !this.jobId;
    this.cancelExportButton.textContent = this.cancelling ? "Cancelling..." : "Cancel Export";
    this.restoreButton.disabled = blocked || this.confirmation.value.trim().toUpperCase() !== "IMPORT" ||
      !this.file.files.length;
    this.cancelButton.disabled = this.busy;
    this.cancelButton.classList.toggle("hidden", !this.pending);
    this.modalClose.disabled = this.busy;
    [this.file, this.confirmation].forEach((input) => { input.disabled = blocked; });
  }

  openStatus() {
    this.showProgress.classList.remove("hidden");
    if (!this.modal.open) this.modal.showModal();
  }

  showError(error) {
    this.error.textContent = error.message || String(error);
    this.error.classList.remove("hidden");
    this.setFeedback("failed", "prepare");
  }

  setFeedback(state, step) {
    this.statusPanel.classList.toggle("print-export-status-panel-complete", state === "complete");
    this.statusPanel.classList.toggle("application-backup-status-cancelled", state === "cancelled");
    this.statusPanel.classList.toggle("print-export-status-panel-error", state === "failed");
    const steps = ["prepare", "generate", "deliver", "complete"];
    this.statusPanel.querySelectorAll("[data-backup-step]").forEach((element) => {
      const key = element.dataset.backupStep;
      element.classList.toggle("print-export-status-step-active", key === step);
      element.classList.toggle("print-export-status-step-complete", steps.indexOf(key) < steps.indexOf(step));
    });
  }

  formatBytes(bytes) {
    return `${(Number(bytes || 0) / (1024 ** 3)).toFixed(2)} GiB`;
  }

  async jsonRequest(url, payload) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Backup request failed.");
    return result;
  }

  async start(task) {
    if (this.busy || this.pending) return;
    window.clearTimeout(this.pollTimer);
    this.pollGeneration += 1;
    this.busy = true;
    this.cancelling = false;
    this.jobId = null;
    this.settings.open = false;
    this.openStatus();
    this.stage.textContent = "Starting";
    this.statusPanel.classList.remove("hidden");
    this.setFeedback("running", "prepare");
    this.message.textContent = "";
    this.currentFile.textContent = "";
    this.warnings.classList.add("hidden");
    this.warnings.open = false;
    this.progress.removeAttribute("value");
    this.error.classList.add("hidden");
    this.download.classList.add("hidden");
    this.savedPath.textContent = "";
    this.updateControls();
    try {
      await task();
      await this.poll();
    } catch (error) {
      this.busy = false;
      this.uploading = false;
      this.showError(error);
      this.updateControls();
    }
  }

  createBackup() {
    return this.start(async () => {
      this.operation = "backup";
      const selection = Object.fromEntries(this.selectionInputs.map((input) => [input.dataset.exportOption, input.checked]));
      const result = await this.jsonRequest(this.panel.dataset.createUrl, { selection });
      this.exportJobId = result.job_id;
      this.jobId = result.job_id;
    });
  }

  async cancelExport() {
    if (!this.busy || this.operation !== "backup" || this.cancelling || !this.jobId) return;
    this.cancelling = true;
    this.updateControls();
    try {
      await this.jsonRequest(this.panel.dataset.cancelExportUrl, { job_id: this.jobId });
      await this.poll();
    } catch (error) {
      this.cancelling = false;
      this.showError(error);
      this.updateControls();
    }
  }

  restoreBackup() {
    const confirmation = this.confirmation.value.trim().toUpperCase();
    if (confirmation !== "IMPORT") return;
    const file = this.file.files[0];
    if (!file) return;
    return this.start(async () => {
      this.operation = "restore";
      this.uploading = true;
      this.stage.textContent = "Uploading backup";
      await new Promise((resolve, reject) => {
        const upload = new XMLHttpRequest();
        upload.open("POST", this.panel.dataset.importUrl);
        upload.setRequestHeader("Content-Type", "application/zip");
        upload.setRequestHeader("X-Backup-Confirmation", confirmation);
        upload.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) this.progress.value = event.loaded / event.total * 100;
          this.detail.textContent = `${this.formatBytes(event.loaded)} / ${this.formatBytes(event.total)}`;
        });
        upload.addEventListener("load", () => {
          try {
            const result = JSON.parse(upload.responseText);
            if (upload.status >= 400 || !result.ok) throw new Error(result.message || "Backup upload failed.");
            resolve(result);
          } catch (error) { reject(error); }
        });
        upload.addEventListener("error", () => reject(new Error("Backup upload failed. Check the connection and try again.")));
        upload.addEventListener("abort", () => reject(new Error("Backup upload was cancelled.")));
        upload.send(file);
      });
      this.uploading = false;
    });
  }

  async cancelRestore() {
    if (this.busy) return;
    this.busy = true;
    this.updateControls();
    try {
      await this.jsonRequest(this.panel.dataset.cancelUrl, {});
      this.confirmation.value = "";
      await this.poll();
    } catch (error) {
      this.busy = false;
      this.showError(error);
      this.updateControls();
    }
  }

  async poll() {
    window.clearTimeout(this.pollTimer);
    if (this.uploading) return;
    const generation = ++this.pollGeneration;
    try {
      const response = await fetch(this.panel.dataset.statusUrl, { headers: { Accept: "application/json" }, cache: "no-store" });
      const state = await response.json();
      if (generation !== this.pollGeneration) return;
      if (!response.ok || !state.ok) throw new Error(state.message || "Could not read backup progress.");
      this.busy = ["running", "uploading"].includes(state.state);
      this.operation = state.operation || this.operation;
      this.jobId = state.job_id || this.jobId;
      this.cancelling = Boolean(state.cancelling);
      this.statusPanel.classList.toggle("hidden", state.state === "idle");
      this.setFeedback(state.state, state.state === "complete" ? "complete" : state.state === "cancelled" ? "" : this.busy ? "generate" : "prepare");
      this.pending = Boolean(state.pending_restore);
      this.stage.textContent = this.pending ? "Cancel old staged restore" : state.stage || "Idle";
      this.currentFile.textContent = state.current_file || "";
      if (this.busy) this.openStatus();
      this.message.textContent = state.pending_restore?.message || state.message || "";
      this.error.textContent = state.error || "";
      this.error.classList.toggle("hidden", !state.error);
      const total = Number(state.total_bytes || 0);
      if (this.busy && !total) this.progress.removeAttribute("value");
      else this.progress.value = total ? Math.min(100, Number(state.completed_bytes || 0) / total * 100) : 0;
      this.progress.classList.toggle("hidden", ["idle", "cancelled"].includes(state.state));
      const files = Number(state.completed_files || 0).toLocaleString();
      this.detail.textContent = total ? `${this.formatBytes(state.completed_bytes)} / ${this.formatBytes(total)} · ${files} files` :
        this.busy ? `${files} files` : "";
      if (total && state.progress_unit && state.progress_unit !== "bytes") {
        this.detail.textContent = `${Number(state.completed_bytes || 0).toLocaleString()} / ${total.toLocaleString()} ${state.progress_unit}`;
      }
      if (state.download_url) {
        this.download.href = state.download_url;
        this.download.download = state.result.zip_path.split(/[\\/]/).pop();
        this.download.classList.remove("hidden");
        this.savedPath.textContent = `Archive ready: ${this.download.download}`;
      }
      if (state.state !== "idle") this.showProgress.classList.remove("hidden");
      if (state.state === "complete" && state.download_url &&
          state.job_id === this.exportJobId && !this.savedJobs.has(state.job_id)) {
        this.savedJobs.add(state.job_id);
        this.setFeedback("running", "deliver");
        this.download.click();
        this.stage.textContent = "Export Complete";
        this.message.textContent = state.result.warning_count ? state.result.message : "The ZIP file is ready. Your browser is handling the download.";
        this.setFeedback("complete", "complete");
        window.iMomirToast?.success("Export to Zip complete.");
      }
      const hasWarnings = state.state === "complete" && Boolean(state.result?.warning_count);
      this.warnings.classList.toggle("hidden", !hasWarnings);
      if (hasWarnings) {
        this.currentFile.textContent = "";
        this.warningList.textContent = state.result.warnings.map((item) => `${item.path}: ${item.reason}`).join("\n");
      }
      this.updateControls();
    } catch (error) {
      if (generation !== this.pollGeneration) return;
      this.showError(error);
      this.pollTimer = window.setTimeout(() => this.poll(), 3000);
      return;
    }
    if (this.busy) this.pollTimer = window.setTimeout(() => this.poll(), 1000);
  }
}

const applicationBackupPanel = document.getElementById("applicationBackupPanel");
if (applicationBackupPanel) new ApplicationBackupController(applicationBackupPanel);
