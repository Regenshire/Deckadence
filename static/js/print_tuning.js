(function () {
  "use strict";
  const copy = value => JSON.parse(JSON.stringify(value));
  window.DeckadencePrintTuning = {
    init({form, getSelectionForm}) {
      const modal = document.getElementById("printTuningModal");
      const openButton = document.getElementById("printTuningOpen");
      const hidden = document.getElementById("printTuningSettings");
      const summary = document.getElementById("printTuningSummary");
      if (!modal || !openButton || !hidden) return null;
      const el = suffix => document.getElementById("printTuning" + suffix);
      let catalog = null, applied = JSON.parse(hidden.value || '{"mode":"none"}'), draft = copy(applied);
      let modeDrafts = {};
      let cards = [], selected = 0, loadedSelection = false, busy = false;
      let jobVersion = 0, previewVersion = 0, previewAbort = null, selectionAbort = null, timer = 0;
      let pendingSettings = Promise.resolve();
      const previewCache = new Map();
      const title = settings => settings.mode === "none" ? "None" :
        (settings.mode === "manual" ? "Manual · " : "Auto · ") + (catalog?.profiles.find(p => p.id === settings.profile)?.name || "Neutral") +
        (settings.paper && settings.paper !== "standard" ? " · " + (catalog?.papers.find(p => p.id === settings.paper)?.name || settings.paper) : "");
      const adjustmentText = (key, value) => (value > 0 ? "+" : "") + value + (key === "hue" ? "°" : "");
      const colorSwatches = {color_red:"#e56363", color_orange:"#ed9950", color_yellow:"#dfc652", color_green:"#62bb77",
        color_cyan:"#53c6cd", color_blue:"#6995eb", color_purple:"#b18bea", color_magenta:"#d877bf"};
      function zeroAdjustments() {
        return Object.fromEntries(catalog.adjustments.map(([key]) => [key, 0]));
      }
      function loadManualProfile() {
        const profile = catalog.profiles.find(p => p.id === draft.profile);
        const paper = catalog.papers.find(p => p.id === draft.paper);
        draft.adjustments = Object.fromEntries(catalog.adjustments.map(([key, , min, max]) => {
          const monochromeColor = draft.profile === "gray" && (key.startsWith("color_") || ["vibrance", "saturation", "hue", "warmth", "tint"].includes(key));
          const value = (profile.adjustments[key] || 0) + (monochromeColor ? 0 : paper.adjustments[key] || 0);
          return [key, Math.max(min, Math.min(max, value))];
        }));
      }
      function selectMode(mode) {
        if (mode === draft.mode) return;
        modeDrafts[draft.mode] = copy(draft);
        if (modeDrafts[mode]) draft = copy(modeDrafts[mode]);
        else {
          const wasOff = draft.mode === "none";
          draft = {...copy(draft), mode, adjustments:zeroAdjustments()};
          // Older saved Off settings carried Balanced as an inactive profile.
          // Activating tuning must not silently load those corrections.
          if (wasOff) draft.profile = "neutral";
          if (mode === "manual") loadManualProfile();
        }
        change();
      }
      function status(message, error = false) {
        el("Status").textContent = message;
        el("Status").classList.toggle("print-tuning-error", error);
      }
      async function jsonResponse(response) {
        let data;
        try { data = await response.json(); } catch (_) { throw new Error("The server did not return a valid response. Try again."); }
        if (!response.ok || !data.ok) throw new Error(data.message || "Print Tuning could not complete this request.");
        return data;
      }
      function commit(settings) {
        applied = copy(settings);
        hidden.value = JSON.stringify(applied);
        summary.textContent = title(applied);
      }
      function setBusy(value) {
        busy = value;
        ["Apply", "SaveConfirm", "SaveAs", "SetDefault", "Delete", "IccUpload"].forEach(id => el(id).disabled = value);
        el("Delete").disabled = value || !el("Saved").value;
      }
      function drawCatalog(data) {
        catalog = data;
        el("Profile").replaceChildren(...catalog.profiles.map(p => new Option(p.name, p.id)));
        const paperGroups = new Map();
        catalog.papers.forEach(paper => {
          const name = paper.group || "Common card stocks";
          if (!paperGroups.has(name)) {
            const group = document.createElement("optgroup"); group.label = name;
            paperGroups.set(name, group);
          }
          paperGroups.get(name).append(new Option(paper.name, paper.id));
        });
        el("Paper").replaceChildren(...paperGroups.values());
        el("Icc").replaceChildren(new Option("Choose a profile…", ""), ...catalog.icc_profiles.map(p => new Option(p.label, p.id)));
        const previousName = el("Saved").value;
        el("Saved").replaceChildren(new Option("Choose saved settings…", ""), ...catalog.preferences.presets.map(p => new Option(p.name, p.name)));
        el("Saved").value = previousName;
        el("Default").textContent = title(catalog.preferences.default);
        if (!el("PrimarySliders").children.length) {
          catalog.adjustments.forEach(([key, name, min, max]) => {
            const label = document.createElement("label"); label.className = "print-tuning-slider";
            const heading = document.createElement("span"); heading.textContent = name;
            const output = document.createElement("output"); output.htmlFor = "printTuningAdjust-" + key;
            const input = document.createElement("input"); input.type = "range"; input.min = min; input.max = max;
            input.step = 1; input.id = output.htmlFor; input.dataset.adjustment = key;
            if (key === "hue") input.title = "Rotate colors around the color wheel. 0° keeps their original hues.";
            if (key.startsWith("color_")) {
              label.classList.add("print-tuning-color-slider");
              label.style.setProperty("--pt-color", colorSwatches[key]);
              input.setAttribute("aria-describedby", "printTuningColorStrengthHelp");
              input.title = "Increase " + name.toLowerCase() + " strength for richer, deeper tones; decrease to soften.";
            }
            heading.append(output); label.append(heading, input);
            el(key.startsWith("color_") ? "ColorSliders" : ["brightness", "contrast", "vibrance", "hue"].includes(key) ? "PrimarySliders" : "ExtraSliders").append(label);
            input.addEventListener("input", () => { draft.adjustments[key] = Number(input.value); change(); });
          });
        }
      }
      function render() {
        if (!catalog) return;
        const active = draft.mode !== "none", auto = draft.mode === "auto";
        modal.dataset.mode = draft.mode;
        modal.querySelectorAll("[data-tuning-active]").forEach(element => element.hidden = !active);
        el("AutoStrength").hidden = !auto;
        modal.querySelectorAll("[data-tuning-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.tuningMode === draft.mode)));
        el("ModeHelp").textContent = !active ? "Print Tuning is off. No tuning adjustments will be applied." : auto ?
          "Auto analyzes each card for your paper and target look. Sliders fine-tune the automatic result." :
          "Choose your paper and a visual profile to load starting values, then edit the sliders. The same values apply to every card.";
        el("Paper").value = draft.paper; el("Paper").disabled = !active;
        const hasCorrections = (auto && draft.profile !== "neutral") || Object.values(draft.adjustments).some(value => value !== 0);
        el("PaperHelp").textContent = draft.paper === "standard" ?
          (hasCorrections ? "This stock starts neutral. Your selected profile or manual adjustments are currently active." :
            "Neutral: no color or tone adjustments. All values are zero.") :
          catalog.papers.find(p => p.id === draft.paper)?.description || "";
        el("PaperNote").hidden = draft.paper === "standard";
        el("ProfileLabel").textContent = auto ? "Target look" : "Visual profile";
        el("Profile").value = draft.profile; el("Profile").disabled = !active;
        el("ProfileHelp").textContent = catalog.profiles.find(p => p.id === draft.profile)?.description || "";
        el("Strength").value = draft.strength; el("Strength").disabled = !auto;
        el("StrengthValue").textContent = draft.strength + "%";
        el("Offsets").textContent = auto ? "Offsets after Auto" : "Applied to all cards";
        const grayscale = (auto && draft.profile === "gray") || draft.adjustments.saturation <= -100;
        el("ColorStrengthHelp").textContent = grayscale ? "Individual colors are unavailable while the output is grayscale." :
          "Increase a color for richer, deeper tones; decrease it to soften that color. Nearby hues blend smoothly, and neutral grays stay unchanged.";
        el("ResetColors").disabled = !active || !Object.entries(draft.adjustments).some(([key, value]) => key.startsWith("color_") && value !== 0);
        modal.querySelectorAll("[data-adjustment]").forEach(input => {
          const value = draft.adjustments[input.dataset.adjustment]; input.value = value;
          input.disabled = !active || (grayscale && input.dataset.adjustment.startsWith("color_"));
          input.previousElementSibling.querySelector("output").textContent = adjustmentText(input.dataset.adjustment, value);
          input.setAttribute("aria-valuetext", adjustmentText(input.dataset.adjustment, value));
        });
        el("Reset").disabled = !active; el("Output").value = draft.output; el("Output").disabled = !active;
        el("Reset").textContent = auto ? "Reset fine-tuning" : "Reload paper & profile values";
        el("IccFields").hidden = draft.output !== "icc";
        if (draft.icc && ![...el("Icc").options].some(o => o.value === draft.icc)) el("Icc").add(new Option(draft.icc + " (missing)", draft.icc));
        el("Icc").value = draft.icc; el("Intent").value = draft.intent; el("BlackPoint").checked = draft.black_point;
        el("IccFields").querySelectorAll("select,input").forEach(input => input.disabled = !active || busy);
        el("OutputSummary").textContent = active && draft.output === "icc" ? "Printer / paper ICC" : "Current PDF behavior";
        el("AfterLabel").textContent = active ? "Tuned" : "Current PDF";
        el("BeforeLabel").textContent = active ? "Original" : "Current PDF";
        setBusy(busy);
      }
      function change() {
        el("Saved").value = ""; status(""); render(); schedulePreview();
      }
      function cancelPreview() {
        clearTimeout(timer); ++previewVersion; previewAbort?.abort();
      }
      function schedulePreview(immediate = false) {
        cancelPreview();
        if (!modal.open || !cards.length) return;
        el("PreviewStatus").hidden = false; el("PreviewStatus").textContent = "Updating preview…";
        el("Comparison").style.opacity = ".5";
        timer = setTimeout(preview, immediate ? 0 : 180);
      }
      async function preview() {
        const version = ++previewVersion;
        previewAbort = new AbortController(); el("Retry").hidden = true;
        try {
          const settings = copy(draft);
          // Output conversion is intentionally excluded from the screen preview.
          settings.output = "current"; settings.icc = "";
          const previewSize = modal.classList.contains("print-tuning-maximized") ? 1280 : 640;
          const key = JSON.stringify([cards[selected].token, settings, previewSize]);
          let data = previewCache.get(key);
          if (!data) {
            data = await fetch(modal.dataset.previewUrl, {method:"POST", headers:{"Content-Type":"application/json"},
              body:JSON.stringify({card:cards[selected].token, settings, preview_size:previewSize}), signal:previewAbort.signal}).then(jsonResponse);
          }
          const original = new Image(), tuned = new Image(); original.src = data.original; tuned.src = data.tuned;
          await Promise.all([original.decode(), tuned.decode()]);
          if (version !== previewVersion || !modal.open) return;
          if (previewCache.size >= 16) previewCache.delete(previewCache.keys().next().value);
          previewCache.set(key, data);
          el("Original").src = data.original; el("Result").src = data.tuned;
          el("Original").alt = cards[selected].name + " before tuning";
          el("Result").alt = cards[selected].name + " with " + title(draft);
          el("Comparison").hidden = false; el("Comparison").style.opacity = "1";
          el("PreviewStatus").hidden = true;
          const adjustments = Object.entries(data.adjustments).filter(([, value]) => Math.abs(value) >= 1)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 3).map(([key, value]) => (catalog.adjustments.find(a => a[0] === key)?.[1] || key) + " " + adjustmentText(key, value));
          el("Analysis").textContent = draft.mode === "none" ? "None · current PDF color settings." :
            draft.profile !== "gray" && Object.values(data.adjustments).every(value => value === 0) ? "No color or tone adjustments." :
            draft.mode === "manual" ? "Manual adjustments apply equally to every selected card." :
              data.analysis + (adjustments.length ? " · " + adjustments.join(" · ") : " · minimal correction needed.");
        } catch (error) {
          if (error.name === "AbortError" || version !== previewVersion) return;
          el("Comparison").hidden = true; el("PreviewStatus").hidden = false;
          el("PreviewStatus").textContent = error.message; el("Analysis").textContent = ""; el("Retry").hidden = false;
        }
      }
      function chooseCard(index) {
        selected = (index + cards.length) % cards.length;
        el("Card").value = String(selected);
        el("CardPosition").textContent = (selected + 1) + " / " + cards.length;
        el("Printing").textContent = cards[selected].printing + (cards[selected].copies > 1 ? " · " + cards[selected].copies + " copies" : "");
        el("Comparison").hidden = true; el("Analysis").textContent = ""; schedulePreview(true);
      }
      async function loadSelection() {
        selectionAbort?.abort(); const controller = new AbortController(); selectionAbort = controller;
        loadedSelection = false; cards = []; el("Comparison").hidden = true;
        el("Card").replaceChildren(new Option("Loading selection…", ""));
        ["Card", "Previous", "Next"].forEach(id => el(id).disabled = true);
        el("CardPosition").textContent = ""; el("Printing").textContent = ""; el("Analysis").textContent = "";
        el("PreviewStatus").hidden = false; el("PreviewStatus").textContent = "Loading your print selection…";
        el("Retry").hidden = true;
        try {
          const data = await fetch(modal.dataset.selectionUrl, {method:"POST", body:getSelectionForm(), signal:controller.signal}).then(jsonResponse);
          if (selectionAbort !== controller || !modal.open) return;
          cards = data.cards; loadedSelection = true;
          el("Card").replaceChildren(...cards.map((card, index) => new Option(card.name, index)));
          ["Card", "Previous", "Next"].forEach(id => el(id).disabled = false);
          chooseCard(0);
        } catch (error) {
          if (error.name === "AbortError" || selectionAbort !== controller) return;
          el("Card").replaceChildren(new Option("Preview unavailable", ""));
          el("PreviewStatus").textContent = error.message; el("Retry").hidden = false;
        }
      }
      function close() {
        cancelPreview(); selectionAbort?.abort();
        if (modal.open) modal.close();
        document.body.classList.remove("print-tuning-open");
      }
      function validOutput() {
        if (draft.mode !== "none" && draft.output === "icc" && (!draft.icc || !catalog.icc_profiles.some(p => p.id === draft.icc))) {
          modal.querySelector(".print-tuning-color").open = true; status("Choose an installed printer / paper ICC profile.", true); el("Icc").focus(); return false;
        }
        return true;
      }
      async function save(action, extras = {}) {
        if (busy || (action !== "delete" && !validOutput())) return;
        setBusy(true); status("Saving…");
        try {
          const data = await fetch(modal.dataset.settingsUrl, {method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action, settings:draft, ...extras})}).then(jsonResponse);
          drawCatalog(data); render();
          if (action === "save") {el("SaveForm").hidden = true; el("Saved").value = extras.name;}
          status(action === "default" ? "Default saved for future print jobs." : action === "delete" ? "Saved settings removed. The app default is unchanged." : "Settings saved.");
        } catch (error) { status(error.message, true); }
        finally {setBusy(false); render();}
      }
      async function beginJob() {
        const version = ++jobVersion; openButton.disabled = true;
        close();
        try {
          const data = await fetch(modal.dataset.settingsUrl, {cache:"no-store"}).then(jsonResponse);
          if (version !== jobVersion) return;
          drawCatalog(data); commit(catalog.preferences.default); draft = copy(applied); render();
          openButton.textContent = "Adjust color & tone";
        } catch (error) {
          catalog = null;
          openButton.textContent = "Retry Print Tuning";
          status(error.message, true);
        } finally {if (version === jobVersion) openButton.disabled = false;}
      }
      openButton.addEventListener("click", async () => {
        if (!catalog) await beginJob();
        if (!catalog) {window.iMomirToast?.error("Print Tuning settings could not load. Try again."); return;}
        draft = copy(applied); modeDrafts = {}; el("Saved").value = ""; el("SaveForm").hidden = true; status(""); render();
        modal.showModal(); document.body.classList.add("print-tuning-open"); loadSelection();
      });
      modal.querySelectorAll("[data-tuning-close]").forEach(button => button.addEventListener("click", close));
      el("Maximize").addEventListener("click", () => {
        const maximized = modal.classList.toggle("print-tuning-maximized");
        el("Maximize").setAttribute("aria-pressed", String(maximized));
        el("Maximize").setAttribute("aria-label", maximized ? "Restore Print Tuning size" : "Maximize Print Tuning");
        el("Maximize").title = maximized ? "Restore" : "Maximize";
        schedulePreview(true);
      });
      modal.addEventListener("cancel", event => {event.preventDefault(); event.stopPropagation(); close();});
      document.addEventListener("keydown", event => {
        if (modal.open && event.key === "Escape") {event.preventDefault(); event.stopImmediatePropagation(); close();}
      }, true);
      modal.addEventListener("close", () => {document.body.classList.remove("print-tuning-open"); openButton.focus();});
      modal.querySelectorAll("[data-tuning-mode]").forEach(button => button.addEventListener("click", () => selectMode(button.dataset.tuningMode)));
      el("Profile").addEventListener("change", () => {
        draft.profile = el("Profile").value;
        if (draft.mode === "manual") loadManualProfile();
        else if (draft.profile === "neutral") draft.adjustments = zeroAdjustments();
        change();
      });
      el("Paper").addEventListener("change", () => {
        draft.paper = el("Paper").value;
        if (draft.paper === "standard") {
          draft.profile = "neutral";
          draft.adjustments = zeroAdjustments();
          // Do not restore a stale corrected recipe after choosing neutral stock.
          modeDrafts = {};
        }
        if (draft.mode === "manual") loadManualProfile();
        change();
      });
      el("Strength").addEventListener("input", () => {draft.strength = Number(el("Strength").value); change();});
      el("Reset").addEventListener("click", () => {
        if (draft.mode === "manual") loadManualProfile();
        else draft.adjustments = zeroAdjustments();
        change();
      });
      el("ResetColors").addEventListener("click", () => {
        Object.keys(draft.adjustments).filter(key => key.startsWith("color_")).forEach(key => draft.adjustments[key] = 0);
        change();
      });
      for (const [suffix, key] of [["Output","output"], ["Icc","icc"], ["Intent","intent"]]) el(suffix).addEventListener("change", () => {draft[key] = el(suffix).value; change();});
      el("BlackPoint").addEventListener("change", () => {draft.black_point = el("BlackPoint").checked; change();});
      el("Card").addEventListener("change", () => chooseCard(Number(el("Card").value)));
      el("Previous").addEventListener("click", () => chooseCard(selected - 1)); el("Next").addEventListener("click", () => chooseCard(selected + 1));
      el("Wipe").addEventListener("input", () => {el("Result").style.clipPath = "inset(0 0 0 " + el("Wipe").value + "%)"; modal.querySelector(".print-tuning-divider").style.left = el("Wipe").value + "%";});
      el("Retry").addEventListener("click", () => loadedSelection ? schedulePreview(true) : loadSelection());
      el("Saved").addEventListener("change", () => {
        const preset = catalog.preferences.presets.find(p => p.name === el("Saved").value);
        if (preset) {draft = copy(preset.settings); modeDrafts = {}; render(); schedulePreview(true); status("Loaded “" + preset.name + "”.");}
      });
      el("SaveAs").addEventListener("click", () => {el("SaveForm").hidden = !el("SaveForm").hidden; if (!el("SaveForm").hidden) el("SaveName").focus();});
      el("SaveConfirm").addEventListener("click", () => {
        const name = el("SaveName").value.trim(); if (!name) {status("Enter a name for these settings.", true); return;}
        const existing = catalog.preferences.presets.some(p => p.name.toLowerCase() === name.toLowerCase());
        if (existing && !confirm("Replace the saved settings “" + name + "”?")) return;
        save("save", {name, replace:existing});
      });
      el("Delete").addEventListener("click", () => {const name = el("Saved").value; if (name && confirm("Delete the saved settings “" + name + "”?")) save("delete", {name});});
      el("SetDefault").addEventListener("click", () => save("default"));
      el("Apply").addEventListener("click", () => {if (validOutput()) {commit(draft); close();}});
      el("IccUpload").addEventListener("change", async () => {
        const file = el("IccUpload").files[0]; if (!file) return;
        if (file.size > 16 * 1024 * 1024) {status("Choose an ICC profile smaller than 16 MB.", true); el("IccUpload").value = ""; return;}
        setBusy(true); status("Importing ICC profile…");
        try {
          const body = new FormData(); body.append("profile", file);
          const data = await fetch(modal.dataset.uploadUrl, {method:"POST", body}).then(jsonResponse);
          catalog.icc_profiles = data.icc_profiles; draft.icc = data.selected;
          el("Icc").replaceChildren(new Option("Choose a profile…", ""), ...data.icc_profiles.map(p => new Option(p.label, p.id)));
          status("ICC profile imported.");
        } catch (error) {status(error.message, true);}
        finally {el("IccUpload").value = ""; setBusy(false); render();}
      });
      summary.textContent = title(applied);
      return {
        beginJob() {pendingSettings = beginJob(); return pendingSettings;},
        async ready() {
          await pendingSettings;
          if (!catalog) throw new Error("Print Tuning defaults could not load. Reopen Print / Export or retry Print Tuning.");
        },
        close,
      };
    },
  };
})();
