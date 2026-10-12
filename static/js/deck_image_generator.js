class DeckArtModal {
  constructor(options = {}) {
    this.root =
      typeof options.root === "string"
        ? document.querySelector(options.root)
        : options.root;
    this.settingsUrl = String(options.settingsUrl || "").trim();
    this.saveUrl = String(options.saveUrl || "").trim();
    this.onGenerated =
      typeof options.onGenerated === "function" ? options.onGenerated : null;

    if (!this.root) {
      throw new Error("Deck Art modal root was not found.");
    }

    this.cards = [];
    this.frames = [];
    this.manaSymbols = [];
    this.frameKey = "silver";
    this.sourceType = "deck";
    this.persistedUploadUrl = "";
    this.pendingUpload = null;
    this.pendingUploadUrl = "";
    this.busy = false;

    this.q = (selector) => this.root.querySelector(selector);
    this.qa = (selector) => Array.from(this.root.querySelectorAll(selector));

    this.el = {
      message: this.q("[data-deck-art-message]"),
      cardSelect: this.q("[data-deck-art-card-select]"),
      uploadPanel: this.q("[data-deck-art-upload-panel]"),
      deckPanel: this.q("[data-deck-art-deck-panel]"),
      uploadInput: this.q("[data-deck-art-upload-input]"),
      uploadDropzone: this.q("[data-deck-art-upload-dropzone]"),
      uploadName: this.q("[data-deck-art-upload-name]"),
      frameSelect: this.q("[data-deck-art-frame-select]"),
      frameMenu: this.q("[data-deck-art-frame-menu]"),
      frameCurrentSwatch: this.q("[data-deck-art-frame-current-swatch]"),
      frameCurrentLabel: this.q("[data-deck-art-frame-current-label]"),
      title: this.q("[data-deck-art-title]"),
      subtitle: this.q("[data-deck-art-subtitle]"),
      type: this.q("[data-deck-art-type]"),
      titleSize: this.q("[data-deck-art-title-size]"),
      subtitleSize: this.q("[data-deck-art-subtitle-size]"),
      titleY: this.q("[data-deck-art-title-y]"),
      subtitleY: this.q("[data-deck-art-subtitle-y]"),
      titleSizeOutput: this.q("[data-deck-art-title-size-output]"),
      subtitleSizeOutput: this.q("[data-deck-art-subtitle-size-output]"),
      titleYOutput: this.q("[data-deck-art-title-y-output]"),
      subtitleYOutput: this.q("[data-deck-art-subtitle-y-output]"),
      zoom: this.q("[data-deck-art-zoom]"),
      x: this.q("[data-deck-art-x]"),
      y: this.q("[data-deck-art-y]"),
      zoomOutput: this.q("[data-deck-art-zoom-output]"),
      xOutput: this.q("[data-deck-art-x-output]"),
      yOutput: this.q("[data-deck-art-y-output]"),
      previewStage: this.q("[data-deck-art-preview-stage]"),
      artBox: this.q("[data-deck-art-art-box]"),
      sourceImage: this.q("[data-deck-art-source-image]"),
      previewEmpty: this.q("[data-deck-art-preview-empty]"),
      frameImage: this.q("[data-deck-art-frame-image]"),
      previewMana: this.q("[data-deck-art-preview-mana]"),
      previewTitle: this.q("[data-deck-art-preview-title]"),
      previewSubtitle: this.q("[data-deck-art-preview-subtitle]"),
      previewType: this.q("[data-deck-art-preview-type]"),
      generate: this.q("[data-deck-art-generate]"),
    };

    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleResize = () => {
      this.updatePreviewLayout();
      this.updatePreviewTextLayout();
    };

    this.bindEvents();
  }

  bindEvents() {
    this.qa("[data-deck-art-close]").forEach((button) => {
      button.addEventListener("click", () => this.close());
    });

    this.qa("[data-deck-art-source]").forEach((button) => {
      button.addEventListener("click", () => {
        this.setSourceType(button.dataset.deckArtSource);
      });
    });

    this.el.cardSelect.addEventListener("change", () => {
      this.refreshSourcePreview();
    });

    this.el.uploadInput.addEventListener("change", () => {
      this.setUploadFile(this.el.uploadInput.files?.[0] || null);
    });

    this.el.uploadDropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.el.uploadDropzone.classList.add("is-dragging");
    });

    this.el.uploadDropzone.addEventListener("dragleave", () => {
      this.el.uploadDropzone.classList.remove("is-dragging");
    });

    this.el.uploadDropzone.addEventListener("drop", (event) => {
      event.preventDefault();

      this.el.uploadDropzone.classList.remove("is-dragging");

      this.setUploadFile(event.dataTransfer?.files?.[0] || null);
    });

    this.el.frameMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-deck-art-frame-key]");

      if (button) {
        this.setFrameKey(button.dataset.deckArtFrameKey);
        this.el.frameSelect.removeAttribute("open");
      }
    });

    [this.el.title, this.el.subtitle, this.el.type].forEach((element) => {
      element.addEventListener("input", () => this.updatePreviewText());

      element.addEventListener("change", () => this.updatePreviewText());
    });

    [
      this.el.titleSize,
      this.el.subtitleSize,
      this.el.titleY,
      this.el.subtitleY,
    ].forEach((element) => {
      element.addEventListener("input", () => {
        this.updateTextControlLabels();
        this.updatePreviewText();
      });
    });

    [this.el.zoom, this.el.x, this.el.y].forEach((element) => {
      element.addEventListener("input", () => {
        this.updateRangeLabels();
        this.updatePreviewLayout();
      });
    });

    this.q("[data-deck-art-reset]").addEventListener("click", () => {
      this.el.zoom.value = "1";
      this.el.x.value = "0";
      this.el.y.value = "0";

      this.updateRangeLabels();
      this.updatePreviewLayout();
    });

    this.el.sourceImage.addEventListener("load", () => {
      this.el.sourceImage.classList.remove("hidden");

      this.el.previewEmpty.classList.add("hidden");

      this.updatePreviewLayout();
    });

    this.el.sourceImage.addEventListener("error", () => {
      this.el.sourceImage.classList.add("hidden");

      this.el.previewEmpty.textContent = "Image preview unavailable.";

      this.el.previewEmpty.classList.remove("hidden");
    });

    this.el.generate.addEventListener("click", () => this.generate());
  }

  async open() {
    if (!this.settingsUrl || !this.saveUrl) {
      throw new Error("Deck Art modal URLs were not configured.");
    }

    this.clearPendingUpload();
    this.showMessage("");

    this.root.classList.remove("hidden");
    this.root.setAttribute("aria-hidden", "false");

    document.addEventListener("keydown", this.handleKeydown);

    window.addEventListener("resize", this.handleResize);

    this.setBusy(true);

    try {
      this.applySettings(await this.fetchJson(this.settingsUrl));
    } catch (error) {
      this.showMessage(
        error.message || "Deck Art settings could not be loaded.",
        true,
      );
    } finally {
      this.setBusy(false);
    }
  }

  close() {
    if (this.busy) {
      return;
    }

    this.root.classList.add("hidden");
    this.root.setAttribute("aria-hidden", "true");

    document.removeEventListener("keydown", this.handleKeydown);

    window.removeEventListener("resize", this.handleResize);

    this.el.frameSelect.removeAttribute("open");

    this.clearPendingUpload();
  }

  handleKeydown(event) {
    if (event.key === "Escape" && !this.busy) {
      event.preventDefault();
      this.close();
    }
  }

  setBusy(busy) {
    this.busy = Boolean(busy);

    this.root.setAttribute("aria-busy", this.busy ? "true" : "false");

    this.el.generate.disabled = this.busy;

    this.qa("[data-deck-art-close]").forEach((button) => {
      button.disabled = this.busy;
    });
  }

  async fetchJson(url, options = {}) {
    const response = await fetch(url, {
      cache: "no-store",

      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },

      ...options,
    });

    let payload = {};

    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Deck Art request failed.");
    }

    return payload;
  }

  applySettings(payload) {
    const settings = payload.settings || {};

    this.cards = Array.isArray(payload.cards) ? payload.cards : [];

    this.frames = Array.isArray(payload.frames) ? payload.frames : [];

    this.manaSymbols = Array.isArray(payload.mana_symbols)
      ? payload.mana_symbols
      : [];

    this.persistedUploadUrl = String(settings.upload_source_url || "").trim();

    this.renderCards(settings.card_uuid);

    this.renderFrames(settings.frame_key);

    this.renderDeckTypes(payload.deck_types, settings.deck_type);

    this.el.title.value = String(settings.title || "");

    this.el.subtitle.value = String(settings.subtitle || "");

    this.el.titleSize.value = String(settings.title_font_size ?? 34);

    this.el.subtitleSize.value = String(settings.subtitle_font_size ?? 18);

    this.el.titleY.value = String(settings.title_offset_y ?? 0);

    this.el.subtitleY.value = String(settings.subtitle_offset_y ?? 0);

    this.el.zoom.value = String(settings.zoom ?? 1);

    this.el.x.value = String(settings.offset_x ?? 0);

    this.el.y.value = String(settings.offset_y ?? 0);

    this.el.uploadName.textContent = this.persistedUploadUrl
      ? "Saved upload available"
      : "PNG, JPEG, or WebP up to 16 MB";

    this.setSourceType(settings.source_type || "deck");

    this.renderManaSymbols();

    this.setFrameKey(settings.frame_key || "silver");

    this.updateRangeLabels();
    this.updateTextControlLabels();
    this.updatePreviewText();
    this.refreshSourcePreview();
  }

  renderCards(selectedUuid) {
    const selected = String(selectedUuid || "").trim();

    this.el.cardSelect.replaceChildren();

    if (!this.cards.length) {
      this.el.cardSelect.add(
        new Option("No Deck or Sideboard cards available", ""),
      );

      this.el.cardSelect.disabled = true;
      return;
    }

    this.el.cardSelect.disabled = false;

    this.cards.forEach((card) => {
      const zone =
        String(card.deck_zone || "deck").toLowerCase() === "sideboard"
          ? "Sideboard"
          : "Deck";

      const option = new Option(
        `${zone} — ${card.card_name || "Unknown Card"}`,
        card.card_uuid || "",
      );

      option.selected = option.value === selected;

      this.el.cardSelect.add(option);
    });

    if (!this.el.cardSelect.value && this.cards[0]) {
      this.el.cardSelect.value = this.cards[0].card_uuid || "";
    }
  }

  renderFrames(selectedKey) {
    const selected = String(selectedKey || "silver").toLowerCase();

    this.el.frameMenu.replaceChildren();

    this.frames.forEach((frame) => {
      const key = String(frame.key || "").toLowerCase();

      if (!key) {
        return;
      }

      const button = document.createElement("button");
      const swatch = document.createElement("span");
      const label = document.createElement("span");

      button.type = "button";
      button.className = "deck-art-frame-button";
      button.dataset.deckArtFrameKey = key;
      button.setAttribute("aria-pressed", key === selected ? "true" : "false");

      swatch.className = "deck-art-frame-swatch";
      swatch.dataset.frameKey = key;

      label.textContent = String(frame.label || key);

      button.append(swatch, label);

      this.el.frameMenu.appendChild(button);
    });
  }

  renderManaSymbols() {
    this.el.previewMana.replaceChildren();

    const symbols = this.manaSymbols.length
      ? this.manaSymbols
      : [{ symbol: "C", image_url: "" }];

    symbols.forEach((item) => {
      const symbol = String(item.symbol || "C").toUpperCase();
      const imageUrl = String(item.image_url || "").trim();
      const symbolWrap = document.createElement("span");

      symbolWrap.className = "deck-art-preview-mana-symbol";
      symbolWrap.dataset.symbol = symbol;

      if (imageUrl) {
        const image = document.createElement("img");

        image.src = imageUrl;
        image.alt = "";

        symbolWrap.appendChild(image);
      } else {
        symbolWrap.textContent = symbol;
      }

      this.el.previewMana.appendChild(symbolWrap);
    });
  }

  renderDeckTypes(options, selectedValue) {
    const selected = String(selectedValue || "");

    this.el.type.replaceChildren();

    (Array.isArray(options) ? options : []).forEach((item) => {
      const option = new Option(
        item.label || item.value || "None",

        item.value || "",
      );

      option.selected = option.value === selected;

      this.el.type.add(option);
    });

    if (!this.el.type.options.length) {
      this.el.type.add(new Option("None", ""));
    }
  }

  setSourceType(sourceType) {
    this.sourceType =
      String(sourceType || "deck").toLowerCase() === "upload"
        ? "upload"
        : "deck";

    this.qa("[data-deck-art-source]").forEach((button) => {
      const active = button.dataset.deckArtSource === this.sourceType;

      button.classList.toggle("is-active", active);

      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    this.el.deckPanel.classList.toggle("hidden", this.sourceType !== "deck");

    this.el.uploadPanel.classList.toggle(
      "hidden",
      this.sourceType !== "upload",
    );

    this.refreshSourcePreview();
  }

  setFrameKey(frameKey) {
    const key = String(frameKey || "silver").toLowerCase();

    const frame = this.frames.find(
      (item) => String(item.key || "").toLowerCase() === key,
    );

    if (!frame) {
      return;
    }

    this.frameKey = key;

    this.el.previewStage.dataset.frame = key;

    this.qa("[data-deck-art-frame-key]").forEach((button) => {
      const active = button.dataset.deckArtFrameKey === key;

      button.classList.toggle("is-active", active);

      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    this.el.frameCurrentSwatch.dataset.frameKey = key;

    this.el.frameCurrentLabel.textContent = String(frame.label || key);

    this.el.previewMana.classList.toggle("hidden", key === "none");

    const frameUrl = String(frame.image_url || "").trim();

    if (frameUrl) {
      this.el.frameImage.src = frameUrl;

      this.el.frameImage.classList.remove("hidden");
    } else {
      this.el.frameImage.removeAttribute("src");

      this.el.frameImage.classList.add("hidden");
    }

    requestAnimationFrame(() => {
      this.updatePreviewLayout();
      this.updatePreviewTextLayout();
    });
  }

  setUploadFile(file) {
    if (!file) {
      return;
    }

    if (file.size > 16 * 1024 * 1024) {
      this.showMessage("Deck Art uploads must be 16 MB or smaller.", true);

      return;
    }

    if (
      !String(file.type || "").startsWith("image/") &&
      !/\.(png|jpe?g|webp)$/i.test(file.name || "")
    ) {
      this.showMessage("Choose a PNG, JPEG, or WebP image.", true);

      return;
    }

    this.clearPendingUpload();

    this.pendingUpload = file;

    this.pendingUploadUrl = URL.createObjectURL(file);

    this.el.uploadName.textContent = file.name || "Selected image";

    this.showMessage("");

    this.setSourceType("upload");
  }

  clearPendingUpload() {
    if (this.pendingUploadUrl) {
      URL.revokeObjectURL(this.pendingUploadUrl);
    }

    this.pendingUpload = null;
    this.pendingUploadUrl = "";

    if (this.el?.uploadInput) {
      this.el.uploadInput.value = "";
    }
  }

  refreshSourcePreview() {
    let url = "";

    if (this.sourceType === "upload") {
      url = this.pendingUploadUrl || this.persistedUploadUrl;
    } else {
      const selectedUuid = String(this.el.cardSelect.value || "");

      const card = this.cards.find(
        (item) => String(item.card_uuid || "") === selectedUuid,
      );

      url = card?.preview_url || "";
    }

    if (!url) {
      this.el.sourceImage.removeAttribute("src");

      this.el.sourceImage.classList.add("hidden");

      this.el.previewEmpty.textContent =
        this.sourceType === "upload"
          ? "Choose an image to preview."
          : "Choose a Deck or Sideboard card to preview.";

      this.el.previewEmpty.classList.remove("hidden");

      return;
    }

    this.el.previewEmpty.textContent = "Loading artwork...";

    this.el.previewEmpty.classList.remove("hidden");

    this.el.sourceImage.classList.add("hidden");

    this.el.sourceImage.src = url;
  }

  updatePreviewLayout() {
    const image = this.el.sourceImage;

    if (!image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const box = this.el.artBox.getBoundingClientRect();

    if (box.width < 1 || box.height < 1) {
      return;
    }

    const zoom = this.rangeValue(this.el.zoom, 1);

    const offsetX = this.rangeValue(this.el.x, 0);

    const offsetY = this.rangeValue(this.el.y, 0);

    const scale =
      Math.max(
        box.width / image.naturalWidth,

        box.height / image.naturalHeight,
      ) * zoom;

    const width = image.naturalWidth * scale;

    const height = image.naturalHeight * scale;

    const extraX = Math.max(0, width - box.width);

    const extraY = Math.max(0, height - box.height);

    const cropX = this.applyOffset(0.5, offsetX);

    const cropY = this.applyOffset(0.5, offsetY);

    image.style.width = `${width}px`;

    image.style.height = `${height}px`;

    image.style.left = `${-(extraX * cropX)}px`;

    image.style.top = `${-(extraY * cropY)}px`;
  }

  applyOffset(base, offset) {
    return offset < 0 ? base * (1 + offset) : base + (1 - base) * offset;
  }

  rangeValue(element, fallback) {
    const value = Number(element.value);

    return Number.isFinite(value) ? value : fallback;
  }

  updateRangeLabels() {
    const zoom = this.rangeValue(this.el.zoom, 1);

    const x = this.rangeValue(this.el.x, 0);

    const y = this.rangeValue(this.el.y, 0);

    this.el.zoomOutput.textContent = `${Math.round(zoom * 100)}%`;

    this.el.xOutput.textContent = this.offsetLabel(x, "Left", "Right");

    this.el.yOutput.textContent = this.offsetLabel(y, "Up", "Down");
  }

  offsetLabel(value, negative, positive) {
    if (Math.abs(value) < 0.01) {
      return "Center";
    }

    const percent = Math.round(Math.abs(value) * 100);

    return `${value < 0 ? negative : positive} ${percent}%`;
  }

  updateTextControlLabels() {
    const titleSize = Math.round(this.rangeValue(this.el.titleSize, 34));

    const subtitleSize = Math.round(this.rangeValue(this.el.subtitleSize, 18));

    const titleY = Math.round(this.rangeValue(this.el.titleY, 0));

    const subtitleY = Math.round(this.rangeValue(this.el.subtitleY, 0));

    this.el.titleSizeOutput.textContent = `${titleSize} px`;

    this.el.subtitleSizeOutput.textContent = `${subtitleSize} px`;

    this.el.titleYOutput.textContent = this.textOffsetLabel(titleY);

    this.el.subtitleYOutput.textContent = this.textOffsetLabel(subtitleY);
  }

  textOffsetLabel(value) {
    if (Math.abs(value) < 1) {
      return "Default";
    }

    return `${value < 0 ? "Up" : "Down"} ${Math.abs(value)} px`;
  }

  updatePreviewTextLayout() {
    const stageWidth = this.el.previewStage.clientWidth;

    if (stageWidth < 1) {
      return;
    }

    const scale = stageWidth / 477;

    const titleSize = this.rangeValue(this.el.titleSize, 34);

    const subtitleSize = this.rangeValue(this.el.subtitleSize, 18);

    const titleY = this.rangeValue(this.el.titleY, 0);

    const subtitleY = this.rangeValue(this.el.subtitleY, 0);

    this.el.previewTitle.style.fontSize = `${titleSize * scale}px`;

    this.el.previewSubtitle.style.fontSize = `${subtitleSize * scale}px`;

    this.el.previewTitle.style.top = `${((514 + titleY) / 721) * 100}%`;

    this.el.previewSubtitle.style.top = `${((584 + subtitleY) / 721) * 100}%`;
  }

  updatePreviewText() {
    this.el.previewTitle.textContent =
      this.el.title.value.trim() || "Untitled Deck";

    this.el.previewSubtitle.textContent = this.el.subtitle.value.trim();

    this.el.previewType.textContent = this.el.type.value.trim().toUpperCase();

    this.updatePreviewTextLayout();
  }

  async generate() {
    if (this.busy) {
      return;
    }

    const title = this.el.title.value.trim();

    if (!title) {
      this.showMessage("Deck Title is required.", true);

      this.el.title.focus();

      return;
    }

    if (this.sourceType === "deck" && !this.el.cardSelect.value) {
      this.showMessage("Choose a card from the Deck or Sideboard.", true);

      return;
    }

    if (
      this.sourceType === "upload" &&
      !this.pendingUpload &&
      !this.persistedUploadUrl
    ) {
      this.showMessage("Choose an image to upload.", true);

      return;
    }

    const formData = new FormData();

    formData.set("source_type", this.sourceType);

    formData.set("card_uuid", this.el.cardSelect.value || "");

    formData.set("frame_key", this.frameKey);

    formData.set("title", title);

    formData.set("subtitle", this.el.subtitle.value.trim());

    formData.set("deck_type", this.el.type.value || "");

    formData.set("title_font_size", this.el.titleSize.value || "34");

    formData.set("subtitle_font_size", this.el.subtitleSize.value || "18");

    formData.set("title_offset_y", this.el.titleY.value || "0");

    formData.set("subtitle_offset_y", this.el.subtitleY.value || "0");

    formData.set("zoom", this.el.zoom.value || "1");

    formData.set("offset_x", this.el.x.value || "0");

    formData.set("offset_y", this.el.y.value || "0");

    if (this.sourceType === "upload" && this.pendingUpload) {
      formData.set("art_file", this.pendingUpload, this.pendingUpload.name);
    }

    this.setBusy(true);

    this.showMessage("Generating Deck Art...");

    try {
      const payload = await this.fetchJson(this.saveUrl, {
        method: "POST",
        body: formData,
      });

      if (this.onGenerated) {
        await this.onGenerated(payload);
      }

      this.setBusy(false);
      this.close();
    } catch (error) {
      this.setBusy(false);

      this.showMessage(
        error.message || "Deck Art could not be generated.",
        true,
      );
    }
  }

  showMessage(message, isError = false) {
    const text = String(message || "").trim();

    this.el.message.textContent = text;

    this.el.message.classList.toggle("hidden", !text);

    this.el.message.classList.toggle("error", Boolean(text && isError));
  }
}

window.iMomirUI.DeckArtModal = DeckArtModal;

(function () {
  const workspace = document.getElementById("deckbuilderWorkspace");
  const editButton = document.getElementById("deckbuilderDeckArtEditButton");
  const modalRoot = document.getElementById("deckArtModal");

  if (
    !workspace ||
    !editButton ||
    !modalRoot ||
    !window.iMomirUI ||
    !window.iMomirUI.DeckArtModal
  ) {
    return;
  }

  const deckArtModal = new window.iMomirUI.DeckArtModal({
    root: modalRoot,
    settingsUrl: workspace.dataset.deckArtSettingsUrl,
    saveUrl: workspace.dataset.deckArtSaveUrl,
    onGenerated: function (payload) {
      const deckArtImage = document.getElementById("deckbuilderDeckArtImage");

      if (!deckArtImage) {
        return;
      }

      const imageUrl = new URL(
        payload.image_url || deckArtImage.src,
        window.location.origin,
      );

      imageUrl.searchParams.set("_art", String(Date.now()));

      deckArtImage.src = imageUrl.toString();
    },
  });

  window.iMomirUI.deckArt = deckArtModal;

  editButton.addEventListener("click", function () {
    deckArtModal.open().catch(function (error) {
      console.error("Deck Art modal failed to open:", error);
    });
  });
})();
