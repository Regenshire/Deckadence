class ApplicationBackupController {
  constructor(panel) {
    this.panel = panel;
    const get = (suffix) => document.getElementById("application" + suffix);
    this.folder = get("BackupFolder");
    this.createButton = get("BackupCreate");
    this.path = get("RestorePath");
    this.file = get("RestoreFile");
    this.confirmation = get("RestoreConfirmation");
    this.restoreButton = get("RestoreStart");
    this.cancelButton = get("RestoreCancel");
    this.stage = get("BackupStage");
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
    this.busy = false;
    this.pending = false;
    this.uploading = false;
    this.pollTimer = null;
    this.pollGeneration = 0;
    this.createButton.addEventListener("click", () => this.createBackup());
    this.restoreButton.addEventListener("click", () => this.restoreBackup());
    this.cancelButton.addEventListener("click", () => this.cancelRestore());
    this.showProgress.addEventListener("click", () => this.openStatus());
    this.modalClose.addEventListener("click", () => this.modal.close());
    this.modal.addEventListener("cancel", (event) => { if (this.busy) event.preventDefault(); });
    [this.path, this.confirmation].forEach((input) => input.addEventListener("input", () => this.updateControls()));
    this.file.addEventListener("change", () => {
      if (this.file.files.length) this.path.value = "";
      this.updateControls();
    });
    this.path.addEventListener("input", () => {
      if (this.path.value.trim()) this.file.value = "";
    });
    this.poll();
  }

  updateControls() {
    const blocked = this.busy || this.pending;
    this.createButton.disabled = blocked;
    this.restoreButton.disabled = blocked || this.confirmation.value.trim().toUpperCase() !== "IMPORT" ||
      !(this.path.value.trim() || this.file.files.length);
    this.cancelButton.disabled = this.busy;
    this.cancelButton.classList.toggle("hidden", !this.pending);
    this.modalClose.disabled = this.busy;
    [this.folder, this.path, this.file, this.confirmation].forEach((input) => { input.disabled = blocked; });
  }

  openStatus() {
    this.showProgress.classList.remove("hidden");
    if (!this.modal.open) this.modal.showModal();
  }

  showError(error) {
    this.error.textContent = error.message || String(error);
    this.error.classList.remove("hidden");
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
    this.openStatus();
    this.stage.textContent = "Starting";
    this.message.textContent = "";
    this.currentFile.textContent = "";
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
    return this.start(() => this.jsonRequest(this.panel.dataset.createUrl, { output_directory: this.folder.value.trim() }));
  }

  restoreBackup() {
    const confirmation = this.confirmation.value.trim().toUpperCase();
    if (confirmation !== "IMPORT") return;
    const path = this.path.value.trim();
    const file = this.file.files[0];
    if (!path && !file) return;
    return this.start(async () => {
      if (path) {
        await this.jsonRequest(this.panel.dataset.importUrl, { archive_path: path, confirmation });
      } else {
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
          upload.addEventListener("error", () => reject(new Error("Backup upload failed. Check the connection or use a local ZIP path.")));
          upload.addEventListener("abort", () => reject(new Error("Backup upload was cancelled.")));
          upload.send(file);
        });
        this.uploading = false;
      }
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
      this.progress.classList.toggle("hidden", state.state === "idle");
      const files = Number(state.completed_files || 0).toLocaleString();
      this.detail.textContent = total ? `${this.formatBytes(state.completed_bytes)} / ${this.formatBytes(total)} · ${files} files` :
        this.busy ? `${files} files` : "";
      if (total && state.progress_unit && state.progress_unit !== "bytes") {
        this.detail.textContent = `${Number(state.completed_bytes || 0).toLocaleString()} / ${total.toLocaleString()} ${state.progress_unit}`;
      }
      if (state.download_url) {
        this.download.href = state.download_url;
        this.download.classList.remove("hidden");
        this.savedPath.textContent = `Saved to: ${state.result.zip_path}`;
      }
      if (state.state !== "idle") this.showProgress.classList.remove("hidden");
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
