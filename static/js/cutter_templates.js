(function () {
  "use strict";
  const modal = document.getElementById("cutterTemplateModal");
  if (!modal) return;
  const form = document.getElementById("cutterTemplateForm");
  const paper = document.getElementById("cutterTemplatePaper");
  const artwork = document.getElementById("cutterTemplateRegistration");
  const status = document.getElementById("cutterTemplateStatus");
  const dimensions = document.getElementById("cutterTemplateDimensions");
  const action = document.getElementById("cutterTemplateAction");
  const exportPanel = document.getElementById("cutterExportPanel");
  const registrationPanel = document.getElementById("cutterRegistrationPanel");
  const taskButtons = [...modal.querySelectorAll("[data-cutter-task]")];
  let task = "export";
  let busy = false;
  let previousBodyOverflow = "";
  const printForm = document.getElementById("printExportForm");
  const printPaper = document.getElementById("printExportPrintTemplate");
  const printCutter = document.getElementById("printExportCutterProfile");
  const marks = printForm?.querySelector('input[type="checkbox"][name="silhouette_registration_marks"]');
  const cutterRow = document.getElementById("printExportCutterRow");
  const cutterStatus = document.getElementById("printExportCutterStatus");
  const draftFields = ["friendly_name", "brand", "model"];
  const registrationFormats = new Set(["png", "svg", "pdf", "jpg", "jpeg", "webp"]);
  let setupRequest = 0;
  let optionsRequest = 0;
  let selectionLoading = false;
  let selectionError = "";
  let selectionWrites = Promise.resolve();

  function readStored(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
  }
  function writeStored(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Storage can be disabled. */ }
  }
  function draftKey() { return "deckadence.cutterDraft." + paper.value; }
  function saveDraft() {
    const draft = {};
    draftFields.forEach(name => { draft[name] = form.elements[name].value; });
    writeStored(draftKey(), draft);
  }
  function loadDraft() {
    const draft = readStored(draftKey(), {});
    draftFields.forEach(name => { form.elements[name].value = draft[name] || ""; });
    artwork.value = "";
  }
  async function requestJSON(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || "The cutter request failed. Please try again.");
    return payload;
  }
  function optionsURL(paperId) {
    const url = new URL(modal.dataset.optionsUrl, location.href);
    url.searchParams.set("print_template", paperId);
    return url;
  }
  async function showDimensions() {
    const sequence = ++setupRequest;
    dimensions.textContent = "Loading paper dimensions…";
    try {
      const payload = await requestJSON(optionsURL(paper.value), { cache: "no-store" });
      if (sequence !== setupRequest) return;
      dimensions.textContent = `${payload.paper.width_mm} × ${payload.paper.height_mm} mm · ${payload.paper.cards} card outlines`;
    } catch (error) {
      if (sequence === setupRequest) dimensions.textContent = error.message;
    }
  }
  function showStatus(message, error, success = false) {
    status.textContent = message;
    status.hidden = !message;
    status.dataset.error = error ? "true" : "false";
    status.dataset.success = success ? "true" : "false";
  }
  function setTask(value) {
    task = value === "registration" ? "registration" : "export";
    exportPanel.hidden = task !== "export";
    registrationPanel.hidden = task !== "registration";
    registrationPanel.querySelectorAll("input").forEach(input => { input.disabled = task !== "registration"; });
    taskButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.cutterTask === task)));
    action.innerHTML = task === "export"
      ? '<i class="fa-solid fa-file-zipper" aria-hidden="true"></i> Download ZIP'
      : '<i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> Upload Registration Marks';
    showStatus("", false);
  }
  function syncMarks() {
    if (cutterRow) cutterRow.hidden = !marks?.checked;
    if (printCutter) printCutter.disabled = !marks?.checked || selectionLoading || !printCutter.value;
  }
  async function refreshPrintCutters() {
    if (!printPaper || !printCutter) return;
    const sequence = ++optionsRequest;
    const paperId = printPaper.value;
    selectionLoading = true;
    selectionError = "";
    printCutter.replaceChildren(new Option("Loading cutters…", ""));
    cutterStatus.textContent = "Checking registration profiles on this system…";
    cutterStatus.dataset.error = "false";
    syncMarks();
    try {
      const payload = await requestJSON(optionsURL(paperId), { cache: "no-store" });
      if (sequence !== optionsRequest) return;
      const remembered = readStored("deckadence.cutterSelection." + paperId, "");
      const selected = payload.profiles.some(profile => profile.id === remembered) ? remembered : payload.selected;
      printCutter.replaceChildren();
      payload.profiles.forEach(profile => {
        const option = new Option(`${profile.name} — ${profile.brand} ${profile.model}`, profile.id, profile.id === selected, profile.id === selected);
        printCutter.add(option);
      });
      if (!payload.profiles.length) printCutter.add(new Option("No compatible cutters available", ""));
      cutterStatus.textContent = payload.profiles.length
        ? ""
        : "No cutter template available for this paper. Add one in Settings → Card Cutting Machine Templates → Cutter Template Setup. This print will have no registration marks.";
    } catch (error) {
      if (sequence !== optionsRequest) return;
      selectionError = error.message;
      printCutter.replaceChildren(new Option("Unable to load cutters", ""));
      cutterStatus.textContent = error.message;
      cutterStatus.dataset.error = "true";
    } finally {
      if (sequence === optionsRequest) { selectionLoading = false; syncMarks(); }
    }
  }
  function rememberSelection() {
    const paperId = printPaper.value;
    const selected = printCutter.value;
    if (!selected) return;
    writeStored("deckadence.cutterSelection." + paperId, selected);
    const data = new FormData();
    data.set("print_template", paperId);
    data.set("cutter_profile", selected);
    // Serialize preference writes so a slower earlier request cannot replace the newest choice.
    selectionWrites = selectionWrites.then(() => requestJSON(modal.dataset.selectUrl, { method: "POST", body: data }))
      .catch(error => {
        if (printPaper.value === paperId && printCutter.value === selected) {
          cutterStatus.textContent = "Remembered in this browser; saving to Deckadence failed: " + error.message;
        }
      });
  }
  function openSetup(button) {
    if (modal.open) return;
    const source = document.getElementById(button.dataset.cutterPaperTarget || "chaos_print_template") || printPaper;
    const paperId = source?.value || readStored("deckadence.cutterSetupPaper", paper.value);
    if ([...paper.options].some(option => option.value === paperId)) paper.value = paperId;
    loadDraft();
    setTask(button.dataset.cutterMode);
    showDimensions();
    const menu = button.closest(".app-nav-menu");
    if (menu) {
      menu.classList.remove("is-open");
      const toggle = menu.querySelector("[data-app-menu-toggle]");
      toggle?.setAttribute("aria-expanded", "false");
      toggle?.focus();
    }
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.showModal();
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-cutter-setup-open]");
    if (button) openSetup(button);
    if (event.target.closest("[data-cutter-close]") && !busy) modal.close();
  });
  modal.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  modal.addEventListener("close", () => { document.body.style.overflow = previousBodyOverflow; });
  taskButtons.forEach(button => button.addEventListener("click", () => setTask(button.dataset.cutterTask)));
  paper.addEventListener("change", () => {
    writeStored("deckadence.cutterSetupPaper", paper.value);
    loadDraft(); showDimensions(); showStatus("", false);
  });
  form.addEventListener("input", event => {
    if (draftFields.includes(event.target.name)) {
      saveDraft();
      if (status.dataset.error === "true") showStatus("", false);
    }
  });
  artwork.addEventListener("change", () => { showStatus("", false); });

  async function runSetup(saveRegistration) {
    if (busy) return;
    if (!form.reportValidity()) return;
    if (saveRegistration && !artwork.files.length) {
      showStatus("Choose the registration artwork exported by your cutter software.", true);
      artwork.focus();
      return;
    }
    if (saveRegistration && artwork.files[0].size > 20 * 1024 * 1024) {
      showStatus("Registration artwork must be no larger than 20 MB.", true);
      return;
    }
    if (saveRegistration) {
      const extension = artwork.files[0].name.split(".").pop().toLowerCase();
      if (!registrationFormats.has(extension)) {
        showStatus("Choose a PNG, SVG, PDF, JPG, JPEG, or WebP registration file.", true);
        return;
      }
    }
    saveDraft();
    const data = new FormData(form);
    if (!saveRegistration) data.delete("registration_file");
    const controls = [...modal.querySelectorAll("input, select, button")];
    const disabledStates = controls.map(control => control.disabled);
    busy = true;
    form.setAttribute("aria-busy", "true");
    controls.forEach(control => { control.disabled = true; });
    showStatus(saveRegistration ? "Checking and saving registration artwork…" : "Building cut paths and instructions…", false);
    try {
      if (saveRegistration) {
        const payload = await requestJSON(modal.dataset.registrationUrl, { method: "POST", body: data });
        writeStored("deckadence.cutterSelection." + data.get("print_template"), payload.profile_id);
        showStatus(payload.message, false, true);
        artwork.value = "";
        document.dispatchEvent(new CustomEvent("cutter-registration-saved", { detail: { paperId: data.get("print_template") } }));
        await refreshPrintCutters();
      } else {
        const response = await fetch(modal.dataset.exportUrl, { method: "POST", body: data });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "The template export failed.");
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        const disposition = response.headers.get("Content-Disposition") || "";
        link.download = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "cutter-template.zip";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        showStatus("ZIP downloaded. Create your template in the cutter software, then return to Upload Registration Marks.", false, true);
      }
    } catch (error) {
      showStatus(error.message || "The cutter request failed.", true);
    } finally {
      busy = false;
      form.removeAttribute("aria-busy");
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    }
  }
  form.addEventListener("submit", event => { event.preventDefault(); runSetup(task === "registration"); });
  printPaper?.addEventListener("change", refreshPrintCutters);
  printCutter?.addEventListener("change", rememberSelection);
  marks?.addEventListener("change", () => { syncMarks(); if (selectionError) refreshPrintCutters(); });
  printForm?.addEventListener("reset", () => setTimeout(refreshPrintCutters, 0));
  window.deckadenceCutters = {
    refresh: refreshPrintCutters,
    validate: () => !marks?.checked ? "" : selectionLoading ? "Please wait for the cutter choices to finish loading." : selectionError,
  };
  refreshPrintCutters();
})();
