// *** CUTTING TEMPLATES - Browse and Upload Silhouette Files ***
(function () {
  const modal = document.getElementById("silhouetteTemplateLibraryModal");

  if (!modal) {
    return;
  }

  const grid = document.getElementById("silhouetteTemplateLibraryGrid");

  const emptyState = document.getElementById("silhouetteTemplateLibraryEmpty");

  const statusElement = document.getElementById(
    "silhouetteTemplateLibraryStatus",
  );

  const filterSelect = document.getElementById(
    "silhouetteTemplateLibraryFilter",
  );

  const brandFilterSelect = document.getElementById(
    "silhouetteTemplateLibraryBrandFilter",
  );

  const filterSummary = document.getElementById(
    "silhouetteTemplateLibraryFilterSummary",
  );

  const uploadToggleButton = document.getElementById(
    "silhouetteTemplateUploadToggle",
  );

  const uploadDialog = document.getElementById(
    "silhouetteTemplateUploadModal",
  );
  const uploadStatus = document.getElementById("silhouetteTemplateUploadStatus");

  const uploadForm = document.getElementById("silhouetteTemplateUploadForm");

  const uploadFileInput = document.getElementById(
    "silhouetteTemplateUploadFile",
  );

  const uploadBrandInput = document.getElementById(
    "silhouetteTemplateUploadBrand",
  );

  const uploadNameInput = document.getElementById(
    "silhouetteTemplateUploadName",
  );

  const uploadDescriptionInput = document.getElementById(
    "silhouetteTemplateUploadDescription",
  );

  const uploadPrintTemplateSelect = document.getElementById(
    "silhouetteTemplateUploadPrintTemplate",
  );

  let templates = [];
  let registrationTemplates = [];
  let activeView = "cutting";
  let removing = false;
  const viewButtons = [...modal.querySelectorAll("[data-template-view]")];
  let printTemplateOptions = [];
  let activePrintTemplate = "";
  let selectedPrintTemplateFilter = "";
  let selectedMachineBrandFilter = "";
  let uploading = false;
  let previousUploadOverflow = "";

  function setStatus(message, isError) {
    const cleanMessage = String(message || "").trim();

    if (!statusElement) {
      return;
    }

    statusElement.textContent = cleanMessage;

    statusElement.classList.toggle("hidden", !cleanMessage);

    statusElement.classList.toggle(
      "is-error",
      Boolean(cleanMessage && isError),
    );
  }

  function setUploadStatus(message, isError) {
    uploadStatus.textContent = message || "";
    uploadStatus.classList.toggle("hidden", !message);
    uploadStatus.classList.toggle("is-error", Boolean(message && isError));
  }

  function openUploadModal() {
    if (!uploadDialog || uploadDialog.open) return;
    if (
      uploadPrintTemplateSelect &&
      selectedPrintTemplateFilter &&
      printTemplateOptions.some(function (option) {
        return option.value === selectedPrintTemplateFilter;
      })
    ) {
      uploadPrintTemplateSelect.value = selectedPrintTemplateFilter;
    }
    setUploadStatus("", false);
    previousUploadOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    uploadDialog.showModal();
  }

  function closeModal() {
    if (uploading || removing) return;
    if (uploadDialog?.open) uploadDialog.close();
    modal.classList.add("hidden");

    modal.setAttribute("aria-hidden", "true");

    setStatus("", false);
  }

  function populatePrintTemplateOptions() {
    if (!uploadPrintTemplateSelect) {
      return;
    }

    const previousValue = String(uploadPrintTemplateSelect.value || "").trim();

    uploadPrintTemplateSelect.innerHTML = "";

    printTemplateOptions.forEach(function (option) {
      const optionElement = document.createElement("option");

      optionElement.value = option.value || "";

      optionElement.textContent =
        option.label || option.value || "Print Template";

      uploadPrintTemplateSelect.appendChild(optionElement);
    });

    if (
      activePrintTemplate &&
      printTemplateOptions.some(function (option) {
        return option.value === activePrintTemplate;
      })
    ) {
      uploadPrintTemplateSelect.value = activePrintTemplate;
    } else if (previousValue) {
      uploadPrintTemplateSelect.value = previousValue;
    }
  }

  function populateTemplateFilterOptions() {
    if (!filterSelect) {
      return;
    }

    filterSelect.innerHTML = "";

    const allOption = document.createElement("option");

    allOption.value = "";
    allOption.textContent = "All";

    filterSelect.appendChild(allOption);

    printTemplateOptions.forEach(function (option) {
      const optionElement = document.createElement("option");

      optionElement.value = option.value || "";

      optionElement.textContent =
        option.label || option.value || "Print Template";

      filterSelect.appendChild(optionElement);
    });

    const hasRequestedFilter =
      selectedPrintTemplateFilter &&
      printTemplateOptions.some(function (option) {
        return option.value === selectedPrintTemplateFilter;
      });

    if (!hasRequestedFilter) {
      selectedPrintTemplateFilter = "";
    }

    filterSelect.value = selectedPrintTemplateFilter;
  }

  function populateMachineBrandFilterOptions() {
    if (!brandFilterSelect) {
      return;
    }

    const brands = Array.from(
      new Set(
        currentTemplates()
          .map(function (template) {
            return String(template.machine_brand || "Other").trim();
          })
          .filter(Boolean),
      ),
    ).sort(function (left, right) {
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    });

    brandFilterSelect.innerHTML = "";

    const allOption = document.createElement("option");

    allOption.value = "";
    allOption.textContent = "All Brands";

    brandFilterSelect.appendChild(allOption);

    brands.forEach(function (brand) {
      const optionElement = document.createElement("option");

      optionElement.value = brand.toLowerCase();

      optionElement.textContent = brand;

      brandFilterSelect.appendChild(optionElement);
    });

    if (!brands.some(brand => brand.toLowerCase() === selectedMachineBrandFilter)) selectedMachineBrandFilter = "";
    brandFilterSelect.value = selectedMachineBrandFilter;
  }

  function currentTemplates() {
    return activeView === "registration" ? registrationTemplates : templates;
  }

  function setView(view) {
    activeView = view;
    viewButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.templateView === view)));
    populateMachineBrandFilterOptions();
    renderTemplates();
  }

  async function removeTemplate(template, opener) {
    if (removing) return;
    removing = true;
    const registration = activeView === "registration";
    const confirmed = await window.iMomirConfirm.show({
      title: registration ? "Remove Registration Marks?" : "Remove Cutting Template?",
      message: `Remove “${template.name}” from Deckadence? ${registration ? "Its registration file will be deleted and it will no longer be available in Print / Export." : "Its uploaded cutting file will be deleted."} The paper layout will be kept.`,
      confirmText: "Remove", cancelText: "Cancel", danger: true,
    });
    if (!confirmed) { removing = false; opener.focus(); return; }
    const controls = [...modal.querySelectorAll("button, select")];
    const disabledStates = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    grid.setAttribute("aria-busy", "true");
    setStatus("Removing template…", false);
    try {
      const data = new FormData();
      if (!registration) data.set("filename", template.filename);
      const response = await fetch(template.remove_url, { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || payload.message || "The template could not be removed.");
      if (registration) {
        try {
          const key = "deckadence.cutterSelection." + template.print_template;
          if (JSON.parse(localStorage.getItem(key)) === template.id) localStorage.removeItem(key);
        } catch (_) { /* Storage can be disabled. */ }
        await window.deckadenceCutters?.refresh();
      }
      await loadOptions();
      setStatus(payload.message, false);
    } catch (error) {
      setStatus(error.message || "The template could not be removed.", true);
    } finally {
      removing = false;
      grid.removeAttribute("aria-busy");
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
      viewButtons.find(button => button.dataset.templateView === activeView)?.focus();
    }
  }

  function renderTemplates() {
    if (!grid) {
      return;
    }

    grid.innerHTML = "";

    const entries = currentTemplates();
    const registration = activeView === "registration";
    const filteredTemplates = entries.filter(function (template) {
      const matchesPrintTemplate =
        !selectedPrintTemplateFilter ||
        template.print_template === selectedPrintTemplateFilter;

      const machineBrand = String(template.machine_brand || "Other")
        .trim()
        .toLowerCase();

      const matchesBrand =
        !selectedMachineBrandFilter ||
        machineBrand === selectedMachineBrandFilter;

      return matchesPrintTemplate && matchesBrand;
    });

    const sortedTemplates = filteredTemplates
      .slice()
      .sort(function (left, right) {
        const leftCompatible =
          left.print_template === activePrintTemplate ? 0 : 1;

        const rightCompatible =
          right.print_template === activePrintTemplate ? 0 : 1;

        if (leftCompatible !== rightCompatible) {
          return leftCompatible - rightCompatible;
        }

        return String(left.name || "").localeCompare(String(right.name || ""));
      });

    sortedTemplates.forEach(function (template) {
      const card = document.createElement("article");

      card.className = "silhouette-template-library-card";

      if (template.print_template === activePrintTemplate) {
        card.classList.add("is-compatible");
      }

      const isCompatible = template.print_template === activePrintTemplate;

      if (isCompatible) {
        const compatibleLabel = document.createElement("div");

        compatibleLabel.className =
          "silhouette-template-library-compatible-label";

        compatibleLabel.textContent = "Matches Current Print Template";

        card.appendChild(compatibleLabel);
      }

      const header = document.createElement("div");

      header.className = "silhouette-template-library-card-header";

      const titleWrap = document.createElement("div");

      titleWrap.className = "silhouette-template-library-card-title-wrap";

      const title = document.createElement("h3");

      title.textContent =
        template.name || template.filename || "Cutting Machine Template";

      const templateLabel = document.createElement("span");

      templateLabel.className = "silhouette-template-library-print-template";

      templateLabel.textContent =
        template.print_template_label || template.print_template || "Unlinked";

      titleWrap.appendChild(title);

      titleWrap.appendChild(templateLabel);

      const machineLabel = document.createElement("span");

      machineLabel.className = "silhouette-template-library-machine-brand";

      machineLabel.textContent = [
        template.machine_brand || "Other",
        template.model || "",
        template.file_format || "Template",
      ]
        .filter(Boolean)
        .join(" · ");

      titleWrap.appendChild(machineLabel);

      const downloadLink = document.createElement("a");

      downloadLink.className =
        "action-button secondary-button silhouette-template-library-download";

      downloadLink.href = template.download_url || "#";

      downloadLink.innerHTML =
        '<i class="fa-solid fa-download"></i>' +
        `<span>${registration ? "Download Marks" : "Download Template"}</span>`;
      downloadLink.setAttribute("aria-label", `Download ${template.name}`);

      downloadLink.setAttribute(
        "download",
        template.filename || "cutting-template",
      );

      header.appendChild(titleWrap);

      const description = document.createElement("p");

      description.className = "silhouette-template-library-description";

      description.textContent =
        template.issue || (registration ? "Registration marks used by Deckadence when printing this paper layout." : template.description || "No description provided.");
      if (template.issue) description.classList.add("is-unavailable");

      const filename = document.createElement("div");

      filename.className = "silhouette-template-library-filename";

      filename.textContent = template.filename || "";

      card.appendChild(header);

      card.appendChild(description);

      card.appendChild(filename);

      const actions = document.createElement("div");
      actions.className = "silhouette-template-library-card-actions";
      if (template.download_url) actions.appendChild(downloadLink);
      if (template.removable) {
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "action-button secondary-button silhouette-template-remove";
        removeButton.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Remove';
        removeButton.setAttribute("aria-label", `Remove ${template.name}`);
        removeButton.addEventListener("click", () => removeTemplate(template, removeButton));
        actions.appendChild(removeButton);
      }
      card.appendChild(actions);

      grid.appendChild(card);
    });

    if (emptyState) {
      emptyState.classList.toggle("hidden", sortedTemplates.length > 0);
      emptyState.textContent =
        selectedPrintTemplateFilter || selectedMachineBrandFilter
          ? `No ${registration ? "registration marks" : "cutting templates"} match the selected filters.`
          : registration ? "No registration marks have been uploaded. Add them using Cutter Template Setup."
            : "No cutting machine templates are currently available.";
    }

    if (filterSummary) {
      filterSummary.textContent =
        "Showing " +
        sortedTemplates.length +
        " of " +
        entries.length +
        " template" +
        (entries.length === 1 ? "" : "s");
    }
  }

  async function loadOptions() {
    const optionsUrl = String(modal.dataset.optionsUrl || "").trim();

    if (!optionsUrl) {
      throw new Error(
        "Card cutting machine template options URL is not configured.",
      );
    }

    setStatus("Loading card cutting machine templates...", false);

    const [payload, registrationPayload] = await Promise.all(
      [optionsUrl, modal.dataset.registrationLibraryUrl].map(async url => {
        const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || data.error || "Template files could not be loaded.");
        return data;
      }),
    );

    templates = Array.isArray(payload.templates) ? payload.templates : [];
    registrationTemplates = Array.isArray(registrationPayload.templates) ? registrationPayload.templates : [];

    printTemplateOptions = Array.isArray(payload.print_template_options)
      ? payload.print_template_options
      : [];

    const apiActivePrintTemplate = String(payload.active_print_template || "")
      .trim()
      .toLowerCase();

    if (!activePrintTemplate) {
      activePrintTemplate = apiActivePrintTemplate;
    }

    populatePrintTemplateOptions();
    populateTemplateFilterOptions();
    populateMachineBrandFilterOptions();
    renderTemplates();

    setStatus("", false);
  }

  async function openModal(button) {
    activePrintTemplate = String(
      (button && button.dataset.activePrintTemplate) || "",
    )
      .trim()
      .toLowerCase();

    selectedPrintTemplateFilter = activePrintTemplate;
    selectedMachineBrandFilter = "";

    modal.classList.remove("hidden");

    modal.setAttribute("aria-hidden", "false");

    try {
      await loadOptions();
    } catch (error) {
      setStatus(
        error && error.message
          ? error.message
          : "Card cutting machine templates could not be loaded.",
        true,
      );
    }
  }

  async function uploadTemplate(event) {
    event.preventDefault();
    if (uploading) return;

    if (
      !uploadForm ||
      !uploadFileInput ||
      !uploadFileInput.files ||
      !uploadFileInput.files[0]
    ) {
      setUploadStatus("Choose a cutting machine template file to upload.", true);

      return;
    }

    const uploadFile = uploadFileInput.files[0];
    const uploadFilename = String(uploadFile.name || "").toLowerCase();
    const supportedExtensions = [".studio3", ".svg", ".dxf", ".fcm"];

    const hasSupportedExtension = supportedExtensions.some(
      function (extension) {
        return uploadFilename.endsWith(extension);
      },
    );

    if (!hasSupportedExtension) {
      setUploadStatus("Supported formats are .studio3, .svg, .dxf, and .fcm.", true);

      return;
    }

    const uploadUrl = String(modal.dataset.uploadUrl || "").trim();

    if (!uploadUrl) {
      setUploadStatus(
        "Card cutting machine template upload URL is not configured.",
        true,
      );

      return;
    }

    const formData = new FormData();

    formData.append("template_file", uploadFile);

    formData.append(
      "machine_brand",
      uploadBrandInput ? uploadBrandInput.value : "",
    );

    formData.append("name", uploadNameInput ? uploadNameInput.value : "");

    formData.append(
      "description",
      uploadDescriptionInput ? uploadDescriptionInput.value : "",
    );

    formData.append(
      "print_template",
      uploadPrintTemplateSelect ? uploadPrintTemplateSelect.value : "",
    );

    const controls = [...uploadDialog.querySelectorAll("input, select, textarea, button")];
    const disabledStates = controls.map(control => control.disabled);
    uploading = true;
    uploadForm.setAttribute("aria-busy", "true");
    controls.forEach(control => { control.disabled = true; });
    setUploadStatus("Uploading cutting machine template...", false);

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json",
        },
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Cutting machine template upload failed.",
        );
      }

      templates = Array.isArray(payload.templates)
        ? payload.templates
        : templates;

      uploadForm.reset();

      selectedPrintTemplateFilter = formData.get("print_template");
      selectedMachineBrandFilter = "";
      setView("cutting");
      populatePrintTemplateOptions();
      populateTemplateFilterOptions();
      populateMachineBrandFilterOptions();
      uploadDialog.close();
      renderTemplates();

      setStatus(payload.message || "Cutting machine template uploaded.", false);
    } catch (error) {
      setUploadStatus(
        error && error.message
          ? error.message
          : "Cutting machine template upload failed.",
        true,
      );
    } finally {
      uploading = false;
      uploadForm.removeAttribute("aria-busy");
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    }
  }

  document
    .querySelectorAll("[data-silhouette-template-library-open]")
    .forEach(function (button) {
      button.addEventListener("click", function () {
        openModal(button);
      });
    });

  modal
    .querySelectorAll("[data-silhouette-template-library-close]")
    .forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

  if (uploadToggleButton && uploadDialog) {
    uploadToggleButton.addEventListener("click", openUploadModal);
    uploadDialog.querySelectorAll("[data-silhouette-template-upload-close]").forEach(button => {
      button.addEventListener("click", () => { if (!uploading) uploadDialog.close(); });
    });
    uploadDialog.addEventListener("cancel", event => { if (uploading) event.preventDefault(); });
    uploadDialog.addEventListener("close", () => {
      document.body.style.overflow = previousUploadOverflow;
    });
  }

  if (filterSelect) {
    filterSelect.addEventListener("change", function () {
      selectedPrintTemplateFilter = String(filterSelect.value || "")
        .trim()
        .toLowerCase();

      renderTemplates();
    });
  }

  if (brandFilterSelect) {
    brandFilterSelect.addEventListener("change", function () {
      selectedMachineBrandFilter = String(brandFilterSelect.value || "")
        .trim()
        .toLowerCase();

      renderTemplates();
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", uploadTemplate);
  }

  viewButtons.forEach(button => button.addEventListener("click", () => {
    setView(button.dataset.templateView);
    setStatus("", false);
  }));

  document.addEventListener("cutter-registration-saved", async event => {
    selectedPrintTemplateFilter = event.detail.paperId;
    selectedMachineBrandFilter = "";
    setView("registration");
    if (!modal.classList.contains("hidden")) {
      try { await loadOptions(); }
      catch (error) { setStatus(error.message, true); }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (removing || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      event.preventDefault();
      closeModal();
    }
  });
})();
