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
    const skipped = Array.isArray(state.skipped_sets) ? state.skipped_sets : [];
    get("packDownloaderCounts").textContent =
      `${state.downloaded} saved · ${state.existing} kept · ${state.unavailable} unavailable` +
      (skipped.length ? ` · ${skipped.length} ${skipped.length === 1 ? "set" : "sets"} skipped` : "");
    const skippedNotice = get("packDownloaderSkipped");
    const skippedMessage = skipped.length
      ? `Skipped ${skipped.join(", ")}: no imported booster definitions are available for these set codes. Other matching sets are processed normally.`
      : "";
    if (skippedNotice.textContent !== skippedMessage) skippedNotice.textContent = skippedMessage;
    skippedNotice.hidden = !skipped.length;
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
    document.dispatchEvent(
      new CustomEvent("deckadence:help-event", {
        detail: { name: "pack_downloader_opened" },
      }),
    );
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
      get("packDownloaderStatus").scrollIntoView({block: "nearest"});
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
  const databaseState = document.getElementById("databaseSettingsState");
  const database = databaseState ? JSON.parse(databaseState.textContent) : {ready: false, due: false};
  const databaseBadge = document.getElementById("databaseStatusBadge");
  const databaseTitle = document.getElementById("databaseStatusTitle");
  const refreshButtonLabel = refreshButton?.querySelector("span");
  let statusUnavailable = false;

  const clearHistoryButton = document.getElementById("clearHistoryButton");
  const historyCount = document.getElementById("historyCount");

  if (!refreshButton) {
    return;
  }

  let refreshPollTimer = null;
  let refreshPollPending = false;
  let refreshObservedRunning = Boolean(refreshButton.disabled);
  let refreshRunning = refreshObservedRunning;
  let refreshStarting = false;

  function setRefreshRunningUi(isRunning) {
    refreshRunning = isRunning;
    refreshButton.disabled = isRunning;

    if (forcedRefreshButton) {
      forcedRefreshButton.disabled = isRunning;
    }

    if (refreshSpinner) {
      refreshSpinner.classList.toggle("hidden", !isRunning);
    }
  }

  function displayDate(value) {
    if (!value) return "Not downloaded";
    const date = new Date(String(value).replace(" UTC", "Z").replace(/^(\d{4}-\d\d-\d\d) /, "$1T"));
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], {dateStyle: "medium", timeStyle: "short"});
  }

  function showRefreshError(text) {
    if (!refreshError) return;
    refreshError.textContent = text || "";
    refreshError.hidden = !text;
  }

  function renderDatabaseStatus(status) {
    const stage = status.stage || "Idle";
    const busy = Boolean(status.is_running);
    const failed = !busy && (stage === "Failed" || Boolean(status.error));
    let badge = "Ready", tone = "neutral", title = "Your card database is ready.";
    let copy = "Refresh to pick up newly released cards and updated set information.";
    let action = "Refresh database";
    if (!database.ready) {
      badge = "Setup needed"; tone = "warning"; title = "Get your card database ready.";
      copy = "Download the card and set information Deckadence needs to find cards and build packs.";
      action = "Download database";
    } else if (database.due) {
      badge = "Refresh due"; tone = "warning"; title = "Ready for a refresh.";
    } else if (stage === "Complete") {
      badge = "Updated"; tone = "success"; title = "Database refresh complete.";
      copy = "Your card and set information is ready to use.";
    }
    if (busy) {
      tone = "info";
      if (/download check|checking|starting/i.test(stage)) {
        badge = "Checking"; title = "Checking the database sources…";
      } else if (/download/i.test(stage)) {
        badge = "Downloading"; title = "Downloading database files…";
      } else {
        badge = "Importing"; title = "Updating cards and sets…";
      }
      action = badge + "…";
      copy = "Keep Deckadence running and this page open until the refresh finishes.";
    } else if (failed) {
      badge = "Refresh interrupted"; tone = "warning"; title = "The refresh couldn’t finish.";
      copy = "Review Refresh activity for details, then try again.";
      action = "Try refresh again";
    }
    if (databaseBadge) {databaseBadge.textContent = badge; databaseBadge.dataset.tone = tone;}
    if (databaseTitle) databaseTitle.textContent = title;
    if (refreshMessage && refreshMessage.textContent !== copy) refreshMessage.textContent = copy;
    if (refreshButtonLabel) refreshButtonLabel.textContent = action;
    const hint = document.getElementById("databaseRefreshHint");
    if (hint) hint.textContent = busy ? "Progress updates while the refresh is running." : "Checks for newer source data before refreshing.";
  }

  function clearDatabaseReminders() {
    document.querySelectorAll('.settings-reminder-shortcut[data-settings-section="card_database"]').forEach(row => {row.hidden = true;});
    const count = Array.from(document.querySelectorAll(".settings-reminder-shortcut")).filter(row => !row.hidden).length;
    const badge = document.getElementById("settingsReminderCount");
    const empty = document.getElementById("settingsRemindersEmpty");
    if (badge) {badge.textContent = count; badge.hidden = !count;}
    if (empty) empty.hidden = Boolean(count);
  }

  function applyRefreshStatus(status) {
    statusUnavailable = false;
    const progress = document.getElementById("refreshProgress");
    const summary = document.getElementById("refreshProgressSummary");
    const timing = document.getElementById("refreshTiming");
    const total = Math.max(0, Number(status.progress_total) || 0);
    const current = Math.max(0, Number(status.progress_current) || 0);
    const percent = total ? Math.min(100, current / total * 100) : null;
    const progressContainer = document.getElementById("databaseRefreshProgress");
    const progressStage = document.getElementById("refreshProgressStage");
    const progressPercent = document.getElementById("refreshProgressPercent");
    if (progressContainer) progressContainer.hidden = !status.is_running;
    if (progressStage) progressStage.textContent = (status.stage || "Preparing refresh").replace(/\s*- DO NOT LEAVE PAGE/i, "");
    if (progressPercent) progressPercent.textContent = total ? Math.floor(percent) + "%" : "Working…";
    if (progress) {
      progress.classList.toggle("is-indeterminate", !total);
      progress.querySelector(".database-progress-fill").style.width = total ? `${percent}%` : "";
      if (total) progress.setAttribute("aria-valuenow", percent);
      else progress.removeAttribute("aria-valuenow");
    }
    const unit = status.progress_unit || "items processed";
    const isBytes = unit.startsWith("bytes ");
    const formatCount = value => isBytes
      ? `${(value / 1024 / 1024).toLocaleString(undefined, {maximumFractionDigits: 1})} MB`
      : value.toLocaleString();
    if (summary) summary.textContent = total
      ? `${formatCount(current)} of ${formatCount(total)} ${isBytes ? unit.slice(6) : unit}`
      : current > 0
        ? `${formatCount(current)} ${isBytes ? unit.slice(6) : unit} · total not yet known`
        : status.message || "Working on this step…";
    const stepTotal = Number(status.step_total) || 0;
    const stepCurrent = Math.min(stepTotal, Math.max(0, Number(status.step_current) || 0));
    const completed = Math.min(stepTotal, Math.max(0, Number(status.steps_completed) || 0));
    const overall = document.getElementById("refreshOverallProgress");
    if (overall) {
      overall.hidden = !stepTotal;
      document.getElementById("refreshStepLabel").textContent = "Overall refresh";
      document.getElementById("refreshStepCount").textContent = stepCurrent ? `Step ${stepCurrent} of ${stepTotal}` : `${stepTotal} steps`;
      const track = document.getElementById("refreshOverallTrack");
      track.setAttribute("aria-valuemax", stepTotal);
      track.setAttribute("aria-valuenow", completed);
      track.setAttribute("aria-valuetext", `${completed} of ${stepTotal} steps finished. ${status.step_label || "Preparing refresh"}`);
      track.querySelector(".database-progress-fill").style.width = stepTotal ? `${completed / stepTotal * 100}%` : "0%";
    }
    if (timing) {
      const now = Date.now() / 1000;
      const age = Math.max(0, Math.floor(now - (status.updated_epoch || now)));
      const elapsed = Math.max(
        0,
        Math.floor(
          (status.is_running ? now : status.updated_epoch) -
            status.started_epoch,
        ),
      );
      timing.textContent = status.started_epoch
        ? `Elapsed: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s · ${status.is_running ? `Server responding · Last progress update ${age}s ago` : status.stage}`
        : "";
    }
    if (refreshStage) {
      refreshStage.textContent = status.stage || "Idle";
    }

    const activityMessage = document.getElementById("refreshActivityMessage");
    if (activityMessage) activityMessage.textContent = status.message || "";
    showRefreshError(status.error);

    if (refreshDetailLines) {
      const detailLines = Array.isArray(status.detail_lines)
        ? status.detail_lines
        : [];

      if (detailLines.length > 0) {
        const nextLogText = detailLines.join("\n");
        const logChanged = refreshDetailLines.textContent !== nextLogText;

        refreshDetailLines.textContent = nextLogText;
        refreshDetailLines.hidden = false;

        if (logChanged) {
          refreshDetailLines.scrollTop = refreshDetailLines.scrollHeight;
        }
      } else {
        refreshDetailLines.textContent = "";
        refreshDetailLines.hidden = true;
      }
      const empty = document.getElementById("refreshActivityEmpty");
      if (empty) empty.hidden = detailLines.length > 0;
    }

    // Keep the last successful database summary during a new or failed attempt.
    const complete = !status.is_running && status.stage === "Complete";
    if (complete || status.stage === "Idle - Setup Complete") {
      database.ready = true;
      if (complete && status.finished_at && status.finished_at !== database.last_refresh_utc) database.due = false;
      if (importCardsCount && status.cards_imported !== undefined) importCardsCount.textContent = Number(status.cards_imported).toLocaleString();
      if (importSetsCount && status.sets_represented !== undefined) importSetsCount.textContent = Number(status.sets_represented).toLocaleString();
      if (status.finished_at) {
        database.last_refresh_utc = status.finished_at;
        if (importLastRefresh) importLastRefresh.textContent = displayDate(status.finished_at);
      }
      if (importSourceLastUpdated && status.source_last_updated) importSourceLastUpdated.textContent = displayDate(status.source_last_updated);
      if (complete && !database.due) clearDatabaseReminders();
    }

    if (status.is_running) {
      refreshObservedRunning = true;
    }

    setRefreshRunningUi(Boolean(status.is_running));
    renderDatabaseStatus(status);
  }

  async function fetchRefreshStatus() {
    const response = await fetch("/refresh-cards/status", {
      signal: AbortSignal.timeout(15000),
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
    if (refreshPollPending) return;
    refreshPollPending = true;
    clearTimeout(refreshPollTimer);
    try {
      const status = await fetchRefreshStatus();
      applyRefreshStatus(status);

      if (!status.is_running && !refreshStarting) refreshObservedRunning = false;
    } catch (error) {
      statusUnavailable = true;
      const timing = document.getElementById("refreshTiming");
      if (timing)
        timing.textContent =
          "Status unavailable — reconnecting. The download may still be running.";
      showRefreshError(error.message);
      if (databaseBadge) {databaseBadge.textContent = "Status unavailable"; databaseBadge.dataset.tone = "warning";}
      if (databaseTitle) databaseTitle.textContent = "Couldn’t read the refresh status.";
      if (refreshMessage) refreshMessage.textContent = refreshObservedRunning ? "The refresh may still be running. Waiting to reconnect…" : "Check the connection to Deckadence and try again.";

      if (refreshObservedRunning) {
        setRefreshRunningUi(true);
        return;
      }

      setRefreshRunningUi(false);
      if (refreshButtonLabel) refreshButtonLabel.textContent = "Retry connection";
    } finally {
      refreshPollPending = false;
      if ((refreshRunning || refreshStarting) && !document.hidden) {
        refreshPollTimer = setTimeout(pollRefreshStatus, 2000);
      }
    }
  }

  async function startRefresh(forceDownload) {
    refreshStarting = true;
    try {
      refreshObservedRunning = true;
      setRefreshRunningUi(true);

      showRefreshError("");
      renderDatabaseStatus({is_running: true, stage: "Starting"});

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
    } catch (error) {
      refreshObservedRunning = false;
      setRefreshRunningUi(false);
      // The start request may have reached the server even if its response was lost.
      await pollRefreshStatus();
      if (refreshError && !refreshRunning) {
        showRefreshError(error.message);
      }
    } finally {
      refreshStarting = false;
    }
  }

  refreshButton.addEventListener("click", async function () {
    if (statusUnavailable) await pollRefreshStatus();
    else await startRefresh(false);
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

  document.addEventListener("visibilitychange", function () {
    clearTimeout(refreshPollTimer);
    if (!document.hidden) pollRefreshStatus();
  });
  document.addEventListener("settings:section-opened", function (event) {
    if (event.detail.section === "card_database") pollRefreshStatus();
  });
  if (importLastRefresh) importLastRefresh.textContent = displayDate(database.last_refresh_utc);
  if (importSourceLastUpdated) importSourceLastUpdated.textContent = displayDate(importSourceLastUpdated.textContent.trim());
  if (database.status) applyRefreshStatus(database.status);
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
    card_tracking_tags: {
      description: "Create personal tags for cards and use them across decks, sets, and searches.",
      showSave: false,
    },
    theme: {
      description:
        "Change your theme settings here.  Set your prefered colors and background.",
      showSave: false,
    },
    reminders: {
      description:
        "Shortcuts to things that need your attention.",
      showSave: false,
    },
    release_updates: {
      description: "Keep Deckadence up to date.",
      showSave: false,
    },
    print_settings: {
      description:
        "Shared print templates, PDF output, card backs, labels, and print defaults used outside Momir.",
    },
    cutter_templates: {
      description:
        "Create a template in your cutter software, then add its registration marks to Deckadence.",
      showSave: false,
    },
    card_database: {
      description:
        "Card and set information stored on this computer.",
      showSave: false,
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
      sections: ["reminders", "release_updates", "theme"],
      parent: "form",
    },
    {
      key: "database",
      eyebrow: "CARD DATA",
      title: "Database Settings",
      description:
        "Keep your cards, sets, and pack artwork current.",
      iconClass: "fa-solid fa-database",
      sections: ["card_database"],
      footerId: "databasePackImages",
      parent: "form",
    },
    {
      key: "cards",
      eyebrow: "COLLECTION",
      title: "Card Settings",
      description: "Manage personal card tags across all printings, decks, and sets.",
      iconClass: "fa-solid fa-tags",
      sections: ["card_tracking_tags"],
      parent: "form",
    },
    {
      key: "print",
      eyebrow: "OUTPUT",
      title: "Print Settings",
      description:
        "Configure shared printing and PDF defaults used throughout Deckadence outside Momir.",
      iconClass: "fa-solid fa-print",
      sections: ["print_settings", "cutter_templates"],
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
    if (definition.footerId) {
      const categoryFooter = document.getElementById(definition.footerId);
      if (categoryFooter) category.appendChild(categoryFooter);
    }

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

    header.setAttribute("aria-expanded", String(panel.classList.contains("is-open")));
    header.addEventListener("click", function () {
      panel.classList.toggle("is-open");
      header.setAttribute("aria-expanded", String(panel.classList.contains("is-open")));
      if (panel.classList.contains("is-open")) {
        document.dispatchEvent(new CustomEvent("settings:section-opened", {detail: {section: panel.dataset.section}}));
      }
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

  function openSection(sectionName, scroll = false, focus = false) {
    const panel = document.getElementById("section_" + sectionName);
    if (!panel || !panel.classList.contains("collapsible-panel")) return false;
    panel.classList.add("is-open");
    document.dispatchEvent(new CustomEvent("settings:section-opened", {detail: {section: sectionName}}));
    const header = panel.querySelector(".collapsible-header");
    if (header) {
      header.setAttribute("aria-expanded", "true");
      if (focus) header.focus({preventScroll: true});
    }
    if (scroll) panel.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
    return true;
  }

  document.querySelectorAll("[data-settings-section]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const sectionName = link.dataset.settingsSection;
      if (!openSection(sectionName, true, true)) return;
      event.preventDefault();
      const destination = new URL(window.location.href);
      destination.searchParams.set("open", sectionName);
      destination.searchParams.set("scroll", sectionName);
      window.history.replaceState(null, "", destination);
    });
  });

  if (openParam) {
    const sectionNames = openParam
      .split(",")
      .map(function (value) {
        return value.trim();
      })
      .filter(Boolean);

    sectionNames.forEach(function (sectionName) {
      openSection(sectionName);
    });
  }

  if (scrollParam) {
    setTimeout(() => openSection(scrollParam, true), 150);
  }
}
