// *** SETS - Find and Select Card Sets ***
document.addEventListener("DOMContentLoaded", function () {
  initializeSetsPage();
  initializeCustomDraftSetDeleteActions();
});

const SET_TYPE_LABELS = {
  expansion: "Expansion", commander: "Commander", custom: "Custom", core: "Core",
  draft_innovation: "Draft Innovation", masterpiece: "Masterpiece", promo: "Promos",
  masters: "Masters", eternal: "Eternal", box: "Box", alchemy: "Alchemy",
  memorabilia: "Memorabilia", funny: "Un-Sets", token: "Tokens", minigame: "Mini Games",
  arsenal: "Arsenal", starter: "Starter", spellbook: "Spellbook", duel_deck: "Duel Decks",
  from_the_vault: "From the Vault", archenemy: "Archenemy", planechase: "Planechase",
  treasure_chest: "Treasure Chests", premium_deck: "Premium Decks", vanguard: "Vanguard"
};
const SET_TYPE_PRIORITY = ["expansion", "commander", "custom", "core", "draft_innovation", "masterpiece", "promo", "masters", "eternal", "box"];
function setTypeLabel(type) {
  return SET_TYPE_LABELS[type] || type.replace(/[_-]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function initializeSetsPage() {
  const allSetsCheckbox = document.getElementById("allSetsEnabled");
  const setsListWrapper = document.getElementById("setsListWrapper");
  const setSearchInput = document.getElementById("setSearchInput");
  const setTypeFilter = document.getElementById("setTypeFilter");
  const setYearRange = document.getElementById("setYearRange");
  const setYearStart = document.getElementById("setYearStart");
  const setYearEnd = document.getElementById("setYearEnd");
  const setYearStartLabel = document.getElementById("setYearStartLabel");
  const setYearEndLabel = document.getElementById("setYearEndLabel");
  const deselectAllSetsButton = document.getElementById(
    "deselectAllSetsButton",
  );
  const selectVisibleSetsButton = document.getElementById(
    "selectVisibleSetsButton",
  );
  const setCheckboxes = document.querySelectorAll(".set-checkbox");
  const setRows = document.querySelectorAll(".set-row");
  const selectedTypes = new Set();

  if (!allSetsCheckbox || !setsListWrapper) {
    return;
  }

  if (setTypeFilter) {
    const options = setTypeFilter.querySelector(".sets-type-options");
    const summary = document.getElementById("setTypeSummary");
    const available = [...new Set(Array.from(setRows, row => row.dataset.setType).filter(Boolean))];
    const types = [...SET_TYPE_PRIORITY.filter(type => available.includes(type)),
      ...available.filter(type => !SET_TYPE_PRIORITY.includes(type)).sort((a, b) => setTypeLabel(a).localeCompare(setTypeLabel(b)))];
    const controls = [];
    let dividerAdded = false;
    ["", ...types].forEach(type => {
      if (type && !SET_TYPE_PRIORITY.slice(0, 4).includes(type) && !dividerAdded) {
        options.append(document.createElement("hr"));
        dividerAdded = true;
      }
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = type;
      checkbox.checked = !type;
      label.append(checkbox, document.createTextNode(type ? setTypeLabel(type) : "All Types"));
      options.append(label);
      controls.push(checkbox);
      checkbox.addEventListener("change", () => {
        if (!type) selectedTypes.clear();
        else if (checkbox.checked) selectedTypes.add(type);
        else selectedTypes.delete(type);
        controls.forEach(control => { control.checked = control.value ? selectedTypes.has(control.value) : selectedTypes.size === 0; });
        const labels = types.filter(value => selectedTypes.has(value)).map(setTypeLabel);
        summary.textContent = labels.length ? labels.join(", ") : "All Types";
        filterSetRows();
      });
    });
    setTypeFilter.addEventListener("keydown", event => {
      if (event.key === "Escape") { setTypeFilter.open = false; setTypeFilter.querySelector("summary").focus(); }
    });
    document.addEventListener("click", event => {
      if (!setTypeFilter.contains(event.target)) setTypeFilter.open = false;
    });
  }

  function updateSelectionSummary() {
    const visible = Array.from(setRows).filter(row => !row.classList.contains("hidden"));
    const selected = allSetsCheckbox.checked ? setRows.length : Array.from(setCheckboxes).filter(box => box.checked).length;
    const count = document.getElementById("setsSelectionCount");
    if (count) count.textContent = `${visible.length} sets shown · ${selected} selected`;
    const empty = document.getElementById("setsNoMatches");
    if (empty) empty.classList.toggle("hidden", visible.length !== 0);
    setRows.forEach(row => row.classList.toggle("set-row-selected", allSetsCheckbox.checked || row.querySelector(".set-checkbox").checked));
  }
  setCheckboxes.forEach(box => box.addEventListener("change", updateSelectionSummary));

  function syncAllSetsState() {
    const disableIndividualSets = allSetsCheckbox.checked;

    if (disableIndividualSets) {
      setsListWrapper.classList.add("sets-disabled");
    } else {
      setsListWrapper.classList.remove("sets-disabled");
    }

    setCheckboxes.forEach(function (checkbox) {
      checkbox.disabled = disableIndividualSets;
    });
    if (selectVisibleSetsButton) selectVisibleSetsButton.disabled = disableIndividualSets;
    if (deselectAllSetsButton) deselectAllSetsButton.disabled = disableIndividualSets;
    updateSelectionSummary();
  }

  function syncYearLabels() {
    if (!setYearStart || !setYearEnd) {
      return;
    }

    let startValue = Number(setYearStart.value);
    let endValue = Number(setYearEnd.value);

    if (startValue > endValue) {
      if (document.activeElement === setYearStart) {
        endValue = startValue;
        setYearEnd.value = String(endValue);
      } else {
        startValue = endValue;
        setYearStart.value = String(startValue);
      }
    }

    if (setYearStartLabel) {
      setYearStartLabel.textContent = String(startValue);
    }

    if (setYearEndLabel) {
      setYearEndLabel.textContent = String(endValue);
    }

    if (setYearRange) {
      const minYear = Number(setYearStart.min);
      const maxYear = Number(setYearStart.max);
      const span = Math.max(1, maxYear - minYear);

      const startPercent = ((startValue - minYear) / span) * 100;
      const endPercent = ((endValue - minYear) / span) * 100;

      setYearRange.style.setProperty("--range-start", `${startPercent}%`);
      setYearRange.style.setProperty("--range-end", `${endPercent}%`);
    }
  }

  function filterSetRows() {
    const searchValue = setSearchInput
      ? setSearchInput.value.trim().toLowerCase()
      : "";
    const startYear = setYearStart ? Number(setYearStart.value) : 1993;
    const endYear = setYearEnd ? Number(setYearEnd.value) : 9999;

    setRows.forEach(function (row) {
      const haystack = row.getAttribute("data-set-search") || "";
      const rowType = (row.getAttribute("data-set-type") || "").toLowerCase();
      const rowYearText = row.getAttribute("data-set-year") || "";
      const rowYear = Number(rowYearText);

      const matchesSearch =
        searchValue === "" || haystack.includes(searchValue);
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(rowType);
      const matchesYear =
        rowYearText === "" ||
        (Number.isFinite(rowYear) &&
          rowYear >= startYear &&
          rowYear <= endYear);

      if (matchesSearch && matchesType && matchesYear) {
        row.classList.remove("hidden");
      } else {
        row.classList.add("hidden");
      }
    });
    updateSelectionSummary();
  }

  function deselectAllSets() {
    if (allSetsCheckbox.checked) {
      return;
    }

    setRows.forEach(function (row) {
      if (!row.classList.contains("hidden")) row.querySelector(".set-checkbox").checked = false;
    });
    updateSelectionSummary();
  }

  function selectAllVisibleSets() {
    if (allSetsCheckbox.checked) {
      return;
    }

    setRows.forEach(function (row) {
      if (row.classList.contains("hidden")) {
        return;
      }

      const checkbox = row.querySelector(".set-checkbox");
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = true;
      }
    });
    updateSelectionSummary();
  }

  if (deselectAllSetsButton) {
    deselectAllSetsButton.addEventListener("click", function () {
      deselectAllSets();
    });
  }

  if (selectVisibleSetsButton) {
    selectVisibleSetsButton.addEventListener("click", function () {
      selectAllVisibleSets();
    });
  }

  allSetsCheckbox.addEventListener("change", syncAllSetsState);

  if (setSearchInput) {
    setSearchInput.addEventListener("input", filterSetRows);
  }


  if (setYearStart) {
    setYearStart.addEventListener("input", function () {
      syncYearLabels();
      filterSetRows();
    });
  }

  if (setYearEnd) {
    setYearEnd.addEventListener("input", function () {
      syncYearLabels();
      filterSetRows();
    });
  }

  syncAllSetsState();
  syncYearLabels();
  filterSetRows();
}

function initializeCustomDraftSetDeleteActions() {
  const deleteModal = document.getElementById("customDraftSetDeleteModal");
  const deleteBackdrop = document.getElementById(
    "customDraftSetDeleteBackdrop",
  );
  const deleteCloseButton = document.getElementById(
    "customDraftSetDeleteCloseButton",
  );
  const deleteSetName = document.getElementById("customDraftSetDeleteName");
  const deleteConfirmInput = document.getElementById(
    "customDraftSetDeleteConfirmInput",
  );
  const deleteCancelButton = document.getElementById(
    "customDraftSetDeleteCancelButton",
  );
  const deleteConfirmButton = document.getElementById(
    "customDraftSetDeleteConfirmButton",
  );
  const deleteForms = document.querySelectorAll(
    ".custom-draft-set-delete-form",
  );

  if (!deleteModal || !deleteForms.length) {
    return;
  }

  let pendingDeleteForm = null;
  let deleteInProgress = false;

  function updateDeleteConfirmState() {
    if (!deleteConfirmButton) {
      return;
    }

    const confirmText = String(
      deleteConfirmInput ? deleteConfirmInput.value : "",
    )
      .trim()
      .toUpperCase();

    deleteConfirmButton.disabled = deleteInProgress || confirmText !== "DELETE";
  }

  function setDeleteModalVisible(isVisible) {
    deleteModal.classList.toggle("hidden", !isVisible);
    deleteModal.setAttribute("aria-hidden", isVisible ? "false" : "true");

    if (isVisible) {
      const setName = pendingDeleteForm
        ? pendingDeleteForm.dataset.setName || "this custom draft set"
        : "this custom draft set";
      const setCode = pendingDeleteForm
        ? pendingDeleteForm.dataset.setCode || ""
        : "";

      if (deleteSetName) {
        deleteSetName.textContent = setCode
          ? `${setName} (${setCode})`
          : setName;
      }

      if (deleteConfirmInput) {
        deleteConfirmInput.value = "";

        window.setTimeout(function () {
          deleteConfirmInput.focus();
        }, 60);
      }
    } else {
      if (deleteConfirmInput) {
        deleteConfirmInput.value = "";
      }

      pendingDeleteForm = null;
    }

    updateDeleteConfirmState();
  }

  function closeDeleteModal() {
    if (deleteInProgress) {
      return;
    }

    setDeleteModalVisible(false);
  }

  function deletePendingSet() {
    if (deleteInProgress || !pendingDeleteForm) {
      return;
    }

    const confirmText = String(
      deleteConfirmInput ? deleteConfirmInput.value : "",
    )
      .trim()
      .toUpperCase();

    if (confirmText !== "DELETE") {
      updateDeleteConfirmState();
      return;
    }

    const hiddenInput = pendingDeleteForm.querySelector(
      "input[name='delete_confirmation']",
    );

    if (!hiddenInput) {
      return;
    }

    hiddenInput.value = "DELETE";
    deleteInProgress = true;

    if (deleteConfirmButton) {
      deleteConfirmButton.disabled = true;
      deleteConfirmButton.textContent = "Deleting...";
    }

    pendingDeleteForm.submit();
  }

  deleteForms.forEach(function (formElement) {
    formElement.addEventListener("submit", function (event) {
      event.preventDefault();

      if (deleteInProgress) {
        return;
      }

      pendingDeleteForm = formElement;
      setDeleteModalVisible(true);
    });
  });

  if (deleteBackdrop) {
    deleteBackdrop.addEventListener("click", closeDeleteModal);
  }

  if (deleteCloseButton) {
    deleteCloseButton.addEventListener("click", closeDeleteModal);
  }

  if (deleteCancelButton) {
    deleteCancelButton.addEventListener("click", closeDeleteModal);
  }

  if (deleteConfirmInput) {
    deleteConfirmInput.addEventListener("input", updateDeleteConfirmState);

    deleteConfirmInput.addEventListener("keydown", function (event) {
      if (
        event.key === "Enter" &&
        String(deleteConfirmInput.value || "")
          .trim()
          .toUpperCase() === "DELETE"
      ) {
        event.preventDefault();
        deletePendingSet();
      }
    });
  }

  if (deleteConfirmButton) {
    deleteConfirmButton.addEventListener("click", deletePendingSet);
  }
}
