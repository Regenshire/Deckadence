// *** SETTINGS - Show and Save App Options ***
document.addEventListener("DOMContentLoaded", function () {
  initializeRefreshCards();
  initializeSettingsConsole();
  initializeConfigPanels();
  initializeGameModeCards();
  initializeConfigShortcutNavigation();
});
// Optional downloader controls must not prevent the rest of Settings from loading.
document.addEventListener("DOMContentLoaded", initializePackDownloader);

// *** PACK ART - Download Pack Images ***
function initializePackDownloader() {
  const modal = document.getElementById("packDownloaderModal");
  if (!modal) return;
  const get = (name) => document.getElementById(name);
  const start = get("startPackDownload");
  const cancel = get("cancelPackDownload");
  const clearGenerated = get("clearGeneratedPackArt");
  const options = get("packDownloaderOptions");
  const results = get("packDownloaderResults");
  const error = get("packDownloaderError");
  let jobId = "",
    cursor = 0,
    timer = null,
    revision = 0;
  let running = false;

  function showError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }
  async function api(path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/pack-art/download/" + path, {
        method: body === undefined ? "GET" : "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.ok)
        throw new Error(
          data.message || "Could not update the pack downloader.",
        );
      return data;
    } catch (e) {
      if (e.name === "AbortError" || e instanceof TypeError)
        throw new Error(
          "Could not reach Deckadence. Reopen this window to check the download; completed images are kept.",
        );
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
  function appendResult(item) {
    const card = document.createElement("article");
    card.className = "pack-download-result pack-download-" + item.status;
    if (item.image_src) {
      const image = document.createElement("img");
      image.src = item.image_src;
      image.alt = item.set_name + " " + item.label;
      image.loading = "lazy";
      card.append(image);
    }
    const name = document.createElement("strong");
    name.textContent = item.set_name + " (" + item.set_code + ")";
    const label = document.createElement("span");
    label.textContent = item.label;
    const status = document.createElement("span");
    status.className = "pack-download-result-status";
    status.textContent =
      {
        downloaded: "Downloaded",
        existing: "Existing image kept",
        unavailable: "Unavailable",
      }[item.status] || item.status;
    if (item.status === "downloaded") {
      status.textContent =
        {
          front: "Front-facing original",
          reconstructed: "Pack image corrected to face forward",
          created: "Pack image created from set images",
          label: "Created with era-based design",
          product: "Downloaded product image",
        }[item.method] || status.textContent;
      if (item.upgraded)
        status.textContent = "Upgraded · " + status.textContent;
    }
    card.append(name, label, status);
    if (item.detail) {
      const detail = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Details";
      const text = document.createElement("p");
      text.textContent = item.detail;
      detail.append(summary, text);
      card.append(detail);
    }
    results.append(card);
  }
  function apply(state) {
    if (state.job_id !== jobId) {
      jobId = state.job_id;
      results.replaceChildren();
      cursor = 0;
      if (state.product_types) {
        for (const input of options.querySelectorAll(
          'input[name="pack_art_type"]',
        ))
          input.checked = state.product_types.includes(input.value);
        get("packDownloaderSets").value = (state.set_codes || []).join(", ");
        get("packDownloaderStyle").value = state.pack_style || "auto";
        get("packDownloaderColor").value = state.base_color || "";
      }
    }
    running = state.state === "running" || state.state === "cancelling";
    options.disabled = running;
    start.disabled = running;
    if (clearGenerated) clearGenerated.disabled = running;
    cancel.disabled = state.state !== "running";
    cancel.textContent =
      state.state === "cancelling" ? "Cancelling…" : "Cancel download";
    get("packDownloaderStage").textContent = state.stage;
    get("packDownloaderMessage").textContent = state.message;
    get("packDownloaderCounts").textContent =
      `${state.downloaded} saved · ${state.existing} kept · ${state.unavailable} unavailable`;
    get("packDownloaderProgress").max = state.total_sets || 1;
    get("packDownloaderProgress").value = state.completed_sets || 0;
    get("packDownloaderSetProgress").textContent = state.total_sets
      ? `${state.completed_sets} of ${state.total_sets} sets checked`
      : "";
    get("packDownloaderTransfer").textContent = state.bytes_received
      ? `${(state.bytes_received / 1048576).toFixed(1)} MB received`
      : "";
    get("packDownloaderStatus").dataset.running = String(running);
    for (const item of state.results) appendResult(item);
    cursor = state.cursor;
    showError(state.error);
  }
  async function refresh() {
    clearTimeout(timer);
    const current = revision;
    let retry = false;
    try {
      const state = await api(
        `status?job_id=${encodeURIComponent(jobId)}&after=${cursor}`,
      );
      if (current !== revision) return;
      apply(state);
    } catch (e) {
      if (current !== revision) return;
      showError(e.message);
      retry = true;
    }
    if (modal.open && (running || retry))
      timer = setTimeout(refresh, retry ? 3000 : 1000);
  }
  get("openPackDownloader").addEventListener("click", () => {
    modal.showModal();
    revision += 1;
    refresh();
  });
  get("closePackDownloader").addEventListener("click", () => modal.close());
  modal.addEventListener("close", () => {
    clearTimeout(timer);
    revision += 1;
    get("openPackDownloader").focus();
  });
  start.addEventListener("click", async () => {
    const types = [
      ...options.querySelectorAll('input[name="pack_art_type"]:checked'),
    ].map((input) => input.value);
    if (!types.length) {
      showError("Choose at least one product type.");
      return;
    }
    const codes = get("packDownloaderSets")
      .value.trim()
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((code) => code.toUpperCase());
    const packStyle = get("packDownloaderStyle").value;
    const baseColor = get("packDownloaderColor").value.trim();
    if (baseColor && !/^#[0-9a-fA-F]{6}$/.test(baseColor)) {
      showError(
        "Enter a color such as #454474, or leave it blank for automatic colors.",
      );
      return;
    }
    revision += 1;
    clearTimeout(timer);
    start.disabled = true;
    if (clearGenerated) clearGenerated.disabled = true;
    options.disabled = true;
    showError("");
    try {
      await api("start", {
        set_codes: codes,
        product_types: types,
        pack_style: packStyle,
        base_color: baseColor || null,
      });
      await refresh();
    } catch (e) {
      showError(e.message);
      options.disabled = running;
      start.disabled = running;
      if (clearGenerated) clearGenerated.disabled = running;
      // Reconcile a possibly successful request whose response was interrupted.
      if (modal.open) timer = setTimeout(refresh, 3000);
    }
  });
  // A running server can still have a cached template without this newer button.
  clearGenerated?.addEventListener("click", async () => {
    const types = [
      ...options.querySelectorAll('input[name="pack_art_type"]:checked'),
    ].map((input) => input.value);
    if (!types.length) {
      showError("Choose at least one pack type.");
      return;
    }
    const codes = get("packDownloaderSets")
      .value.trim()
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map((code) => code.toUpperCase());
    revision += 1;
    clearTimeout(timer);
    clearGenerated.disabled = start.disabled = options.disabled = true;
    showError("");
    try {
      const preview = await api("clear-generated", {
        action: "preview",
        set_codes: codes,
        product_types: types,
      });
      if (!modal.open) return;
      if (!preview.count) {
        get("packDownloaderMessage").textContent =
          "No generated pack images can be cleared for the selected sets and pack types.";
        return;
      }
      const confirmation = get("clearPackImagesModal");
      get("clearPackImagesMessage").textContent =
        `Delete ${preview.count} generated pack image${preview.count === 1 ? "" : "s"}? These are images created by the pack builder when a downloaded pack image was unavailable.`;
      confirmation.returnValue = "cancel";
      const confirmed = new Promise((resolve) => {
        confirmation.addEventListener(
          "close",
          () => resolve(confirmation.returnValue === "delete"),
          { once: true },
        );
      });
      confirmation.showModal();
      if (!(await confirmed) || !modal.open) return;
      await api("clear-generated", { action: "clear", token: preview.token });
      await refresh();
    } catch (e) {
      showError(e.message);
    } finally {
      clearGenerated.disabled = start.disabled = options.disabled = running;
    }
  });
  cancel.addEventListener("click", async () => {
    cancel.disabled = true;
    try {
      await api("cancel", { job_id: jobId });
      revision += 1;
      await refresh();
    } catch (e) {
      showError(e.message);
      if (modal.open) timer = setTimeout(refresh, 1000);
    }
  });
}

// *** CARD DATABASE - Download and Refresh Card Data ***
function initializeRefreshCards() {
  const refreshButton = document.getElementById("refreshCardsButton");
  const forcedRefreshButton = document.getElementById(
    "forcedRefreshCardsButton",
  );
  const refreshSpinner = document.getElementById("refreshSpinner");
  const refreshStage = document.getElementById("refreshStage");
  const refreshMessage = document.getElementById("refreshMessage");
  const refreshError = document.getElementById("refreshError");
  const refreshDetailLines = document.getElementById("refreshDetailLines");
  const importCardsCount = document.getElementById("importCardsCount");
  const importSetsCount = document.getElementById("importSetsCount");
  const importLastRefresh = document.getElementById("importLastRefresh");
  const importSourceLastUpdated = document.getElementById(
    "importSourceLastUpdated",
  );

  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const historyCount = document.getElementById("historyCount");

  if (!refreshButton) {
    return;
  }

  let refreshPollTimer = null;
  let lastRefreshFinishedAtPrompted = null;
  let refreshObservedRunning = Boolean(refreshButton.disabled);

  function setRefreshRunningUi(isRunning) {
    refreshButton.disabled = isRunning;

    if (forcedRefreshButton) {
      forcedRefreshButton.disabled = isRunning;
    }

    if (refreshSpinner) {
      refreshSpinner.classList.toggle("hidden", !isRunning);
    }
  }

  function applyRefreshStatus(status) {
    if (refreshStage) {
      refreshStage.textContent = status.stage || "Idle";
    }

    if (refreshMessage) {
      refreshMessage.textContent = status.message || "";
    }

    if (refreshError) {
      if (status.error) {
        refreshError.textContent = status.error;
        refreshError.classList.remove("hidden");
      } else {
        refreshError.textContent = "";
        refreshError.classList.add("hidden");
      }
    }

    if (refreshDetailLines) {
      const detailLines = Array.isArray(status.detail_lines)
        ? status.detail_lines
        : [];

      if (detailLines.length > 0) {
        const nextLogText = detailLines.join("\n");
        const logChanged = refreshDetailLines.textContent !== nextLogText;

        refreshDetailLines.textContent = nextLogText;
        refreshDetailLines.classList.remove("hidden");

        if (logChanged) {
          refreshDetailLines.scrollTop = refreshDetailLines.scrollHeight;
        }
      } else {
        refreshDetailLines.textContent = "";
        refreshDetailLines.classList.add("hidden");
      }
    }

    if (importCardsCount && status.cards_imported !== undefined) {
      importCardsCount.textContent = String(status.cards_imported);
    }

    if (importSetsCount && status.sets_represented !== undefined) {
      importSetsCount.textContent = String(status.sets_represented);
    }

    if (importLastRefresh && status.finished_at) {
      importLastRefresh.textContent = status.finished_at;
    }

    if (importSourceLastUpdated && status.source_last_updated) {
      importSourceLastUpdated.textContent = status.source_last_updated;
    }

    if (status.is_running) {
      refreshObservedRunning = true;
    }

    setRefreshRunningUi(Boolean(status.is_running));
  }

  async function fetchRefreshStatus() {
    const response = await fetch("/refresh-cards/status", {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Failed to get refresh status.");
    }

    return await response.json();
  }

  async function pollRefreshStatus() {
    try {
      const status = await fetchRefreshStatus();
      applyRefreshStatus(status);

      if (!status.is_running && refreshPollTimer) {
        clearInterval(refreshPollTimer);
        refreshPollTimer = null;
      }

      if (
        refreshObservedRunning &&
        !status.is_running &&
        status.stage === "Complete" &&
        status.finished_at &&
        status.finished_at !== lastRefreshFinishedAtPrompted
      ) {
        lastRefreshFinishedAtPrompted = status.finished_at;
        refreshObservedRunning = false;

        window.alert("Card database download complete.");
      }
    } catch (error) {
      if (refreshError) {
        refreshError.textContent = error.message;
        refreshError.classList.remove("hidden");
      }

      if (refreshObservedRunning) {
        setRefreshRunningUi(true);
        return;
      }

      setRefreshRunningUi(false);
    }
  }

  async function startRefresh(forceDownload) {
    try {
      refreshObservedRunning = true;
      setRefreshRunningUi(true);

      if (refreshError) {
        refreshError.textContent = "";
        refreshError.classList.add("hidden");
      }

      if (refreshStage) {
        refreshStage.textContent = "Starting";
      }

      if (refreshMessage) {
        refreshMessage.textContent = forceDownload
          ? "Starting forced refresh..."
          : "Checking whether download is needed...";
      }

      const response = await fetch("/refresh-cards/start", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          force_download: forceDownload,
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to start refresh.");
      }

      await pollRefreshStatus();

      if (!refreshPollTimer) {
        refreshPollTimer = setInterval(pollRefreshStatus, 1000);
      }
    } catch (error) {
      setRefreshRunningUi(false);

      if (refreshError) {
        refreshError.textContent = error.message;
        refreshError.classList.remove("hidden");
      }
    }
  }

  refreshButton.addEventListener("click", async function () {
    await startRefresh(false);
  });

  if (forcedRefreshButton) {
    forcedRefreshButton.addEventListener("click", async function () {
      await startRefresh(true);
    });
  }

  if (clearHistoryButton) {
    clearHistoryButton.addEventListener("click", async function () {
      const confirmed = window.confirm(
        "Clear the recent card history?\n\nThis will allow previously shown cards to be selected again immediately.",
      );

      if (!confirmed) {
        return;
      }

      try {
        clearHistoryButton.disabled = true;

        const response = await fetch("/history/clear", {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to clear history.");
        }

        if (historyCount) {
          historyCount.textContent = "0";
        }
      } catch (error) {
        window.alert(error.message || "Failed to clear history.");
      } finally {
        clearHistoryButton.disabled = false;
      }
    });
  }

  pollRefreshStatus();
}

// *** SETTINGS GROUPS - Organize the Settings Page ***
function initializeSettingsConsole() {
  const configForm = document.getElementById("configForm");

  if (!configForm) {
    return;
  }

  const screen = configForm.closest(".screen");

  if (!screen) {
    return;
  }

  if (screen.dataset.settingsConsoleInitialized === "1") {
    return;
  }

  screen.dataset.settingsConsoleInitialized = "1";
  screen.classList.add("settings-console-screen");

  const sectionMetadata = {
    theme: {
      description:
        "Change your theme settings here.  Set your prefered colors and background.",
      showSave: false,
    },
    reminders: {
      description:
        "Release checks, reminder status, and notification preferences.",
    },
    print_settings: {
      description:
        "Shared print templates, PDF output, card backs, labels, and print defaults used outside Momir.",
    },
    card_database: {
      description:
        "Card database status, refresh controls, and source information.",
    },
    draft_modes: {
      description:
        "Choose the Chaos Draft experience used when opening Play → Draft.",
    },
    chaos_print_settings: {
      description:
        "Chaos Draft-specific exports, pack tracking, pricing, and draft output behavior.",
    },
    momir_modes: {
      description: "Choose the active Momir-style random card mode.",
    },
    other_modes: {
      description: "Configure related modes that use the Momir play interface.",
    },
    card_repeats: {
      description: "Control duplicate card draws and recent-card history.",
    },
    primary_types: {
      description: "Choose the primary card types available to Momir draws.",
    },
    supplemental_types: {
      description: "Enable supplemental and specialty card types.",
    },
    other_filters: {
      description:
        "Fine-tune additional filters applied to Momir card selection.",
    },
    momir_print_settings: {
      description: "Printer and output defaults for Momir and Other Modes.",
    },
    exports: {
      description: "Manage generated files and automatic export cleanup.",
    },
    backup: {
      description: "Create, download, import, and restore Deckadence backups.",
    },
    image_maintenance: {
      description:
        "Repair and reprocess generated alternate-image derivatives.",
    },
    plugins: {
      description:
        "View installed plugins and add optional Deckadence capabilities.",
    },
    image_upscaling: {
      description:
        "Choose the active Upscaler and configure image upscaling behavior.",
    },
    danger_zone: {
      description: "Diagnostics and destructive maintenance operations.",
    },
  };

  const categoryDefinitions = [
    {
      key: "system",
      eyebrow: "APPLICATION",
      title: "System Settings",
      description:
        "Application-wide reminders, release information, and notification preferences.",
      iconClass: "fa-solid fa-sliders",
      sections: ["reminders", "theme"],
      parent: "form",
    },
    {
      key: "print",
      eyebrow: "OUTPUT",
      title: "Print Settings",
      description:
        "Configure shared printing and PDF defaults used throughout Deckadence outside Momir.",
      iconClass: "fa-solid fa-print",
      sections: ["print_settings"],
      parent: "form",
    },
    {
      key: "chaos",
      eyebrow: "GAME MODE",
      title: "Chaos Draft Settings",
      description:
        "Configure the Draft play experience and Chaos Draft-specific behavior.",
      iconClass: "fa-solid fa-shuffle",
      sections: ["draft_modes", "chaos_print_settings"],
      parent: "form",
    },
    {
      key: "momir",
      eyebrow: "GAME MODE",
      title: "Momir Settings",
      description:
        "Configure Momir modes, card selection rules, repeat behavior, filters, and printing.",
      iconClass: "fa-solid fa-wand-magic-sparkles",
      sections: [
        "momir_modes",
        "other_modes",
        "card_repeats",
        "primary_types",
        "supplemental_types",
        "other_filters",
        "momir_print_settings",
      ],
      parent: "form",
    },
    {
      key: "database",
      eyebrow: "CARD DATA",
      title: "Database Settings",
      description:
        "Manage the local card database, refresh status, and card data source.",
      iconClass: "fa-solid fa-database",
      sections: ["card_database"],
      parent: "form",
    },
    {
      key: "plugins",
      eyebrow: "EXTENSIONS",
      title: "Plugins",
      description: "Install and manage optional capabilities for Deckadence.",
      iconClass: "fa-solid fa-puzzle-piece",
      sections: ["plugins"],
      parent: "screen",
    },
    {
      key: "advanced",
      eyebrow: "ADMINISTRATION",
      title: "Advanced",
      description:
        "Export retention, backups, image tools, diagnostics, and destructive maintenance tools.",
      iconClass: "fa-solid fa-toolbox",
      sections: [
        "exports",
        "backup",
        "image_maintenance",
        "image_upscaling",
        "danger_zone",
      ],
      parent: "screen",
    },
  ];

  function decorateSection(panel, sectionName) {
    const metadata = sectionMetadata[sectionName] || {};
    const header = panel.querySelector(".collapsible-header");
    const body = panel.querySelector(".collapsible-body");

    if (!header || !body) {
      return;
    }

    panel.classList.add("settings-console-panel");

    if (!header.querySelector(".settings-section-header-copy")) {
      const currentTitle = header.firstElementChild;

      if (currentTitle) {
        const headerCopy = document.createElement("span");
        headerCopy.className = "settings-section-header-copy";

        header.insertBefore(headerCopy, currentTitle);
        headerCopy.appendChild(currentTitle);

        currentTitle.classList.add("settings-section-title");

        if (metadata.description) {
          const description = document.createElement("span");
          description.className = "settings-section-description";
          description.textContent = metadata.description;

          headerCopy.appendChild(description);
        }
      }
    }

    if (
      metadata.showSave !== false &&
      !body.querySelector(".settings-section-save-row")
    ) {
      const saveRow = document.createElement("div");
      saveRow.className = "settings-section-save-row";

      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.setAttribute("form", "configForm");
      saveButton.name = "return_section";
      saveButton.value = sectionName;
      saveButton.className = "action-button settings-section-save-button";

      const saveIcon = document.createElement("i");
      saveIcon.className = "fa-solid fa-floppy-disk";

      const saveText = document.createElement("span");
      saveText.textContent = "Save Settings";

      saveButton.appendChild(saveIcon);
      saveButton.appendChild(saveText);

      saveRow.appendChild(saveButton);

      body.appendChild(saveRow);
    }
  }

  function createCategory(definition, panels) {
    const category = document.createElement("section");
    category.className =
      "settings-category settings-category-" + definition.key;

    const categoryHeader = document.createElement("div");
    categoryHeader.className = "settings-category-header";

    const icon = document.createElement("div");
    icon.className = "settings-category-icon";

    const iconElement = document.createElement("i");
    iconElement.className = definition.iconClass;

    icon.appendChild(iconElement);

    const copy = document.createElement("div");
    copy.className = "settings-category-copy";

    const eyebrow = document.createElement("div");
    eyebrow.className = "settings-category-eyebrow";
    eyebrow.textContent = definition.eyebrow;

    const title = document.createElement("h2");
    title.className = "settings-category-title";
    title.textContent = definition.title;

    const description = document.createElement("p");
    description.className = "settings-category-description";
    description.textContent = definition.description;

    copy.appendChild(eyebrow);
    copy.appendChild(title);
    copy.appendChild(description);

    categoryHeader.appendChild(icon);
    categoryHeader.appendChild(copy);

    const panelContainer = document.createElement("div");
    panelContainer.className = "settings-category-panels";

    panels.forEach(function (panel) {
      panelContainer.appendChild(panel);
    });

    category.appendChild(categoryHeader);
    category.appendChild(panelContainer);

    return category;
  }

  /*
   * Remove the old visual separator that previously divided
   * the flat settings list.
   */
  Array.from(configForm.children).forEach(function (child) {
    if (child.classList && child.classList.contains("config-section-divider")) {
      child.remove();
    }
  });

  categoryDefinitions.forEach(function (definition) {
    const panels = [];

    definition.sections.forEach(function (sectionName) {
      const panel = document.getElementById("section_" + sectionName);

      if (!panel) {
        return;
      }

      decorateSection(panel, sectionName);
      panels.push(panel);
    });

    if (!panels.length) {
      return;
    }

    const category = createCategory(definition, panels);

    if (definition.parent === "form") {
      configForm.appendChild(category);
      return;
    }

    const footer = screen.querySelector(".app-footer");

    if (footer) {
      screen.insertBefore(category, footer);
    } else {
      screen.appendChild(category);
    }
  });
}

// *** SETTINGS PANELS - Open and Close Sections ***
function initializeConfigPanels() {
  const panels = document.querySelectorAll(".collapsible-panel");

  if (!panels.length) {
    return;
  }

  panels.forEach(function (panel) {
    const header = panel.querySelector(".collapsible-header");
    const body = panel.querySelector(".collapsible-body");

    if (!header || !body) {
      return;
    }

    header.addEventListener("click", function () {
      panel.classList.toggle("is-open");
    });
  });
}

// *** GAME MODES - Select the Active Game ***
function initializeGameModeCards() {
  const gameModeLists = document.querySelectorAll(".game-mode-card-list");
  const momirInput = document.getElementById("momir_mode");
  const chaosDraftInput = document.getElementById("chaos_draft_mode");
  const printButtons = document.querySelectorAll(
    ".print-selected-token-button",
  );

  if (!gameModeLists.length || !momirInput || !chaosDraftInput) {
    return;
  }

  function getScopeInput(scope) {
    return scope === "chaos" ? chaosDraftInput : momirInput;
  }

  function applySelection(scope, selectedValue, selectedPrintHref) {
    const hiddenInput = getScopeInput(scope);
    hiddenInput.value = selectedValue;

    document
      .querySelectorAll('.game-mode-card[data-mode-scope="' + scope + '"]')
      .forEach(function (button) {
        const isSelected =
          button.getAttribute("data-mode-value") === selectedValue;
        button.classList.toggle("game-mode-card-selected", isSelected);
      });

    if (scope === "momir" && selectedPrintHref) {
      printButtons.forEach(function (printButton) {
        printButton.setAttribute("href", selectedPrintHref);
      });
    }
  }

  gameModeLists.forEach(function (gameModeList) {
    gameModeList.addEventListener("click", function (event) {
      const modeButton = event.target.closest(".game-mode-card");
      if (!modeButton) {
        return;
      }

      const selectedValue = modeButton.getAttribute("data-mode-value") || "";
      const selectedScope =
        modeButton.getAttribute("data-mode-scope") || "momir";
      const selectedPrintHref =
        modeButton.getAttribute("data-mode-print-href") || "";

      if (!selectedValue) {
        return;
      }

      applySelection(selectedScope, selectedValue, selectedPrintHref);
    });
  });
}

// *** SETTINGS SHORTCUTS - Open a Settings Section ***
function initializeConfigShortcutNavigation() {
  const panels = document.querySelectorAll(".collapsible-panel");

  if (!panels.length) {
    return;
  }

  const url = new URL(window.location.href);
  const openParam = (url.searchParams.get("open") || "").trim();
  const scrollParam = (url.searchParams.get("scroll") || "").trim();

  if (openParam) {
    const sectionNames = openParam
      .split(",")
      .map(function (value) {
        return value.trim();
      })
      .filter(Boolean);

    sectionNames.forEach(function (sectionName) {
      const panel = document.querySelector(
        '.collapsible-panel[data-section="' + sectionName + '"]',
      );
      if (panel) {
        panel.classList.add("is-open");
      }
    });
  }

  if (scrollParam) {
    const scrollTarget = document.getElementById("section_" + scrollParam);
    if (scrollTarget) {
      setTimeout(function () {
        scrollTarget.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 150);
    }
  }
}
