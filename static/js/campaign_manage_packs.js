(function () {
  const config = document.getElementById("campaignManagePacksConfig");

  if (!config) {
    return;
  }

  const form = document.getElementById("campaignManagePacksForm");
  const summaryButton = document.getElementById("campaignSummaryButton");
  const summaryModal = document.getElementById("campaignSummaryModal");
  const summaryBackdrop = document.getElementById("campaignSummaryBackdrop");
  const summaryCloseButton = document.getElementById(
    "campaignSummaryCloseButton",
  );
  const summaryRefreshOnClose = document.getElementById(
    "campaignSummaryRefreshOnClose",
  );
  const summaryForm = document.getElementById("campaignSummaryForm");
  const summarySortSelect = document.getElementById(
    "campaignSummarySortSelect",
  );
  const summaryList = document.getElementById("campaignSummaryList");
  const summarySelectAllButton = document.getElementById(
    "campaignSummarySelectAllButton",
  );
  const summaryClearSelectionButton = document.getElementById(
    "campaignSummaryClearSelectionButton",
  );
  const summaryDeleteConfirmationInput = document.getElementById(
    "campaignSummaryDeleteConfirmation",
  );
  const selectAllButton = document.getElementById(
    "campaignSelectAllPacksButton",
  );
  const clearSelectedButton = document.getElementById(
    "campaignClearSelectedPacksButton",
  );
  const deleteSelectedButton = document.getElementById(
    "campaignDeleteSelectedButton",
  );
  const deleteConfirmationInput = document.getElementById(
    "campaignDeleteConfirmation",
  );
  const packLabelSettingsModal = document.getElementById(
    "campaignPackLabelSettingsModal",
  );
  const packLabelSettingsBackdrop = document.getElementById(
    "campaignPackLabelSettingsBackdrop",
  );
  const packLabelSettingsCloseButton = document.getElementById(
    "campaignPackLabelSettingsCloseButton",
  );
  const packLabelSettingsSubtitle = document.getElementById(
    "campaignPackLabelSettingsSubtitle",
  );
  const packLabelSettingsStatus = document.getElementById(
    "campaignPackLabelSettingsStatus",
  );
  const packDisableLabelsCheckbox = document.getElementById(
    "campaignPackDisableLabelsCheckbox",
  );
  const packLabelSettingsSaveButton = document.getElementById(
    "campaignPackLabelSettingsSaveButton",
  );
  const addPackButton = document.getElementById("campaignAddPackButton");
  const addPackModal = document.getElementById("campaignAddPackModal");
  const addPackBackdrop = document.getElementById("campaignAddPackBackdrop");
  const addPackCloseButton = document.getElementById(
    "campaignAddPackCloseButton",
  );
  const addRandomPackButton = document.getElementById(
    "campaignAddRandomPackButton",
  );
  const addPackStatus = document.getElementById("campaignAddPackStatus");
  const addPackPreview = document.getElementById("campaignAddPackPreview");
  const addPackPreviewTitle = document.getElementById(
    "campaignAddPackPreviewTitle",
  );
  const addPackPreviewMeta = document.getElementById(
    "campaignAddPackPreviewMeta",
  );
  const addPackPreviewViewLink = document.getElementById(
    "campaignAddPackPreviewViewLink",
  );
  const addPackPreviewPrintExportButton = document.getElementById(
    "campaignAddPackPreviewPrintExportButton",
  );
  const addPackPreviewSaveButton = document.getElementById(
    "campaignAddPackPreviewSaveButton",
  );
  const showSearchPanelButton = document.getElementById(
    "campaignShowSearchPanelButton",
  );
  const addPackSearchPanel = document.getElementById(
    "campaignAddPackSearchPanel",
  );
  const addPackSearchInput = document.getElementById(
    "campaignAddPackSearchInput",
  );
  const addPackSearchButton = document.getElementById(
    "campaignAddPackSearchButton",
  );
  const addPackSearchResults = document.getElementById(
    "campaignAddPackSearchResults",
  );
  const showCustomPanelButton = document.getElementById(
    "campaignShowCustomPanelButton",
  );
  const showImportCampaignPanelButton = document.getElementById(
    "campaignShowImportCampaignPanelButton",
  );
  const addPackCustomPanel = document.getElementById(
    "campaignAddPackCustomPanel",
  );
  const addPackImportCampaignPanel = document.getElementById(
    "campaignAddPackImportCampaignPanel",
  );
  const importSourceCampaignSelect = document.getElementById(
    "campaignImportSourceCampaignSelect",
  );
  const loadImportCampaignPacksButton = document.getElementById(
    "campaignLoadImportCampaignPacksButton",
  );
  const importPackTools = document.getElementById("campaignImportPackTools");
  const importPackResults = document.getElementById(
    "campaignImportPackResults",
  );
  const importSelectAllButton = document.getElementById(
    "campaignImportSelectAllButton",
  );
  const importClearSelectionButton = document.getElementById(
    "campaignImportClearSelectionButton",
  );
  const importSelectedPacksButton = document.getElementById(
    "campaignImportSelectedPacksButton",
  );
  const customSetCodeInput = document.getElementById(
    "campaignCustomSetCodeInput",
  );
  const customPopulateMainButton = document.getElementById(
    "campaignCustomPopulateMainButton",
  );
  const customPopulateMenuButton = document.getElementById(
    "campaignCustomPopulateMenuButton",
  );
  const customPopulateMenu = document.getElementById(
    "campaignCustomPopulateMenu",
  );
  const customPackNameInput = document.getElementById(
    "campaignCustomPackNameInput",
  );
  const customDecklistInput = document.getElementById(
    "campaignCustomDecklistInput",
  );
  const generateCustomPackButton = document.getElementById(
    "campaignGenerateCustomPackButton",
  );
  const printCustomTitleSheetButton = document.getElementById(
    "campaignPrintCustomTitleSheetButton",
  );
  const customTitleSheetModal = document.getElementById(
    "campaignCustomTitleSheetModal",
  );
  const customTitleSheetBackdrop = document.getElementById(
    "campaignCustomTitleSheetBackdrop",
  );
  const customTitleSheetCloseButton = document.getElementById(
    "campaignCustomTitleSheetCloseButton",
  );
  const customTitleSetCodeInput = document.getElementById(
    "campaignCustomTitleSetCodeInput",
  );
  const customTitlePackNameInput = document.getElementById(
    "campaignCustomTitlePackNameInput",
  );
  const customTitleDisablePackTypeCheckbox = document.getElementById(
    "campaignCustomTitleDisablePackTypeCheckbox",
  );
  const customTitleDisableSignatureCheckbox = document.getElementById(
    "campaignCustomTitleDisableSignatureCheckbox",
  );
  const customTitleDisableSetCodeCheckbox = document.getElementById(
    "campaignCustomTitleDisableSetCodeCheckbox",
  );
  const customTitleColorInput = document.getElementById(
    "campaignCustomTitleColorInput",
  );
  const customTitleBackgroundTopColorInput = document.getElementById(
    "campaignCustomTitleBackgroundTopColorInput",
  );
  const customTitleBackgroundMidColorInput = document.getElementById(
    "campaignCustomTitleBackgroundMidColorInput",
  );
  const customTitleBackgroundBottomColorInput = document.getElementById(
    "campaignCustomTitleBackgroundBottomColorInput",
  );
  const customTitleAccentColorInput = document.getElementById(
    "campaignCustomTitleAccentColorInput",
  );
  const customTitleBorderColorInput = document.getElementById(
    "campaignCustomTitleBorderColorInput",
  );
  const customTitleTextColorInput = document.getElementById(
    "campaignCustomTitleTextColorInput",
  );
  const customTitleSubtitleColorInput = document.getElementById(
    "campaignCustomTitleSubtitleColorInput",
  );
  const customTitleFooterColorInput = document.getElementById(
    "campaignCustomTitleFooterColorInput",
  );
  const testDraftButton = document.getElementById("campaignTestDraftButton");
  const testDraftModal = document.getElementById("campaignTestDraftModal");
  const testDraftBackdrop = document.getElementById(
    "campaignTestDraftBackdrop",
  );
  const testDraftCloseButton = document.getElementById(
    "campaignTestDraftCloseButton",
  );
  const testDraftStartForm = document.getElementById(
    "campaignTestDraftStartForm",
  );
  const testDraftHiddenInputsWrap = document.getElementById(
    "campaignTestDraftSelectedPackInputs",
  );
  const testDraftPodSizeSelect = document.getElementById(
    "campaignTestDraftPodSize",
  );
  const testDraftPacksPerPlayerSelect = document.getElementById(
    "campaignTestDraftPacksPerPlayer",
  );
  const testDraftValidationMessage = document.getElementById(
    "campaignTestDraftValidationMessage",
  );
  const testDraftStartButton = document.getElementById(
    "campaignTestDraftStartButton",
  );
  const testDraftHumanPlayerSelect = document.getElementById(
    "campaignTestDraftHumanPlayerSelect",
  );
  const testDraftHumanNameInput = document.getElementById(
    "campaignTestDraftHumanName",
  );
  const testDraftPlayerPortraitWrap = document.getElementById(
    "campaignTestDraftPlayerPortraitWrap",
  );
  const testDraftPlayerName = document.getElementById(
    "campaignTestDraftPlayerName",
  );
  const openPrintExportButton = document.getElementById(
    "campaignOpenPrintExportButton",
  );

  const packExportOpenButton = document.getElementById(
    "campaignPackExportOpenButton",
  );

  const packExportModal = document.getElementById("campaignPackExportModal");

  const packExportBackdrop = document.getElementById(
    "campaignPackExportBackdrop",
  );

  const packExportCloseButton = document.getElementById(
    "campaignPackExportCloseButton",
  );

  const packExportCancelButton = document.getElementById(
    "campaignPackExportCancelButton",
  );

  const packExportStatusCloseButton = document.getElementById(
    "campaignPackExportStatusCloseButton",
  );

  const packExportForm = document.getElementById("campaignPackExportForm");

  const campaignPrintUrl = config.dataset.campaignPrintUrl || "";
  const campaignExportZipUrl = config.dataset.campaignExportZipUrl || "";
  const campaignPreviewPrintUrl = config.dataset.campaignPreviewPrintUrl || "";
  const campaignPreviewExportZipUrl =
    config.dataset.campaignPreviewExportZipUrl || "";
  const bulkCreateOnePackUrl = config.dataset.bulkCreateOnePackUrl || "";
  const managePacksUrl = config.dataset.managePacksUrl || "";
  const customTitleSetNameUrl = config.dataset.customTitleSetNameUrl || "";
  const importCampaignPacksUrl = config.dataset.importCampaignPacksUrl || "";
  const importCampaignPacksPostUrl =
    config.dataset.importCampaignPacksPostUrl || "";
  const searchOptionsUrl = config.dataset.searchOptionsUrl || "";
  const addSpecificRandomUrl = config.dataset.addSpecificRandomUrl || "";
  const customPopulateOptionsUrl =
    config.dataset.customPopulateOptionsUrl || "";
  const customPopulateUrl = config.dataset.customPopulateUrl || "";
  const addCustomPreviewUrl = config.dataset.addCustomPreviewUrl || "";
  const addRandomUrl = config.dataset.addRandomUrl || "";

  let activePackLabelSettingsUrl = "";
  let activePackLabelSettingsButton = null;
  let customTitlePackNameWasEdited = false;

  let addPackModalHasSavedChanges = false;

  const campaignPrintExportModal = window.iMomirPrintExportModal.init({
    openButtonId: "campaignPrintExportUnusedButton",
    printUrl: campaignPrintUrl,
    exportZipUrl: campaignExportZipUrl,

    beforeOpen: function () {
      if (addPackModal && !addPackModal.classList.contains("hidden")) {
        closeAddPackModal();
      }

      if (summaryModal && !summaryModal.classList.contains("hidden")) {
        closeSummaryModal();
      }

      if (testDraftModal && !testDraftModal.classList.contains("hidden")) {
        closeTestDraftModal();
      }
    },

    showMessage: showUiMessage,
  });

  const campaignPackFileExportController =
    window.iMomirUI && window.iMomirUI.FileExportController && packExportForm
      ? new window.iMomirUI.FileExportController({
          formId: "campaignPackExportForm",
          submitButtonId: "campaignPackExportSubmitButton",
          statusPanelId: "campaignPackExportStatusPanel",
          statusTitleId: "campaignPackExportStatusTitle",
          statusMessageId: "campaignPackExportStatusMessage",
          statusCloseButtonId: "campaignPackExportStatusCloseButton",
          stepPrepareId: "campaignPackExportStatusStepPrepare",
          stepGenerateId: "campaignPackExportStatusStepGenerate",
          stepDeliverId: "campaignPackExportStatusStepDeliver",
          stepCompleteId: "campaignPackExportStatusStepComplete",
          progressUrl: packExportModal?.dataset.progressUrl || "",
          fallbackFilename: "deckadence_packs_export.zip",
          generateTitle: "Building Pack Export",
          generateMessage:
            "Collecting selected pack data " +
            "and building the export archive...",
          successTitle: "Pack Export Complete",
          successMessage: "The selected-pack export " + "has been downloaded.",

          beforeSubmit: function () {
            return getSelectedPackIdsForTestDraft().length
              ? ""
              : "Select at least one " + "saved pack first.";
          },

          getExtraFormFields: function () {
            return {
              pack_ids: getSelectedPackIdsForTestDraft(),
            };
          },

          showMessage: showUiMessage,
        }).initialize()
      : null;

  function showUiMessage(messageText, isError) {
    const cleanMessage = messageText || "";

    if (!cleanMessage) {
      return;
    }

    if (window.iMomirToast) {
      if (isError) {
        window.iMomirToast.error(cleanMessage);
      } else {
        window.iMomirToast.success(cleanMessage);
      }
      return;
    }

    console.log(cleanMessage);
  }

  async function confirmUiAction(options) {
    if (
      window.iMomirConfirm &&
      typeof window.iMomirConfirm.show === "function"
    ) {
      return await window.iMomirConfirm.show(options || {});
    }

    return window.confirm((options && options.message) || "Continue?");
  }

  function submitFormWithAction(formElement, submitterElement) {
    if (!formElement) {
      return;
    }

    if (submitterElement && submitterElement.name) {
      const actionInput = document.createElement("input");
      actionInput.type = "hidden";
      actionInput.name = submitterElement.name;
      actionInput.value = submitterElement.value || "";
      formElement.appendChild(actionInput);
    }

    formElement.submit();
  }

  if (!form) {
    return;
  }

  function getAllCheckboxes() {
    return Array.from(form.querySelectorAll(".campaign-pack-checkbox"));
  }

  function getSelectedCheckboxes() {
    return Array.from(form.querySelectorAll(".campaign-pack-checkbox:checked"));
  }

  function getSelectedPackIdsForTestDraft() {
    return getSelectedCheckboxes()
      .map(function (checkbox) {
        return checkbox.value || "";
      })
      .filter(function (value) {
        return value !== "";
      });
  }

  function openPackExportModal() {
    const selectedPackIds = getSelectedPackIdsForTestDraft();

    if (!selectedPackIds.length) {
      showUiMessage("Select at least one saved pack first.", true);

      return;
    }

    if (packExportForm) {
      const defaultMode = packExportForm.querySelector(
        'input[name="export_mode"][value="data_only"]',
      );

      if (defaultMode) {
        defaultMode.checked = true;
      }
    }

    if (campaignPackFileExportController) {
      campaignPackFileExportController.reset();
    }

    if (!packExportModal) {
      return;
    }

    packExportModal.classList.remove("hidden");

    packExportModal.setAttribute("aria-hidden", "false");

    document.body.classList.add("modal-open");
  }

  function closePackExportModal() {
    if (!packExportModal) {
      return;
    }

    packExportModal.classList.add("hidden");

    packExportModal.setAttribute("aria-hidden", "true");

    document.body.classList.remove("modal-open");
  }

  function clearCampaignPrintExportPackInputs() {
    const printExportForm = document.getElementById("printExportForm");

    if (!printExportForm) {
      return;
    }

    Array.from(
      printExportForm.querySelectorAll(".campaign-print-export-pack-input"),
    ).forEach(function (inputElement) {
      inputElement.remove();
    });
  }

  function setCampaignPrintExportPackInputs(packIds) {
    const printExportForm = document.getElementById("printExportForm");

    if (!printExportForm) {
      return;
    }

    clearCampaignPrintExportPackInputs();

    (packIds || []).forEach(function (packId) {
      const hiddenInput = document.createElement("input");

      hiddenInput.type = "hidden";
      hiddenInput.name = "pack_ids";
      hiddenInput.value = String(packId || "");
      hiddenInput.className = "campaign-print-export-pack-input";

      printExportForm.appendChild(hiddenInput);
    });
  }

  function getRequiredTestDraftPackCount() {
    const players = parseInt(
      testDraftPodSizeSelect ? testDraftPodSizeSelect.value || "8" : "8",
      10,
    );
    const packsPerPlayer = parseInt(
      testDraftPacksPerPlayerSelect
        ? testDraftPacksPerPlayerSelect.value || "3"
        : "3",
      10,
    );

    return players * packsPerPlayer;
  }

  function syncTestDraftHiddenPackInputs(selectedPackIds) {
    if (!testDraftHiddenInputsWrap) {
      return;
    }

    testDraftHiddenInputsWrap.innerHTML = "";

    selectedPackIds.forEach(function (packId) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "pack_ids";
      input.value = packId;
      testDraftHiddenInputsWrap.appendChild(input);
    });
  }

  function renderTestDraftSelectedPlayer() {
    if (
      !testDraftHumanPlayerSelect ||
      !testDraftHumanNameInput ||
      !testDraftPlayerPortraitWrap ||
      !testDraftPlayerName
    ) {
      return;
    }

    const selectedOption =
      testDraftHumanPlayerSelect.options[
        testDraftHumanPlayerSelect.selectedIndex
      ];
    const playerName =
      (selectedOption?.dataset.playerName || "You").trim() || "You";
    const portraitUrl = (selectedOption?.dataset.portrait || "").trim();

    testDraftHumanNameInput.value = playerName;
    testDraftPlayerName.textContent = playerName;

    if (portraitUrl) {
      testDraftPlayerPortraitWrap.innerHTML =
        '<img id="campaignTestDraftPlayerPortrait" src="' +
        portraitUrl +
        '" alt="' +
        playerName.replace(/"/g, "&quot;") +
        '" class="campaign-current-player-portrait">';
    } else {
      testDraftPlayerPortraitWrap.innerHTML =
        '<div id="campaignTestDraftPlayerPlaceholder" class="campaign-current-player-placeholder">' +
        playerName.charAt(0).toUpperCase() +
        "</div>";
    }
  }

  function updateTestDraftValidationState() {
    if (!testDraftValidationMessage || !testDraftStartButton) {
      return;
    }

    renderTestDraftSelectedPlayer();

    const selectedPackIds = getSelectedPackIdsForTestDraft();
    const requiredPackCount = getRequiredTestDraftPackCount();
    const selectedCount = selectedPackIds.length;

    syncTestDraftHiddenPackInputs(selectedPackIds);

    testDraftValidationMessage.classList.remove("hidden");

    if (selectedCount < requiredPackCount) {
      testDraftValidationMessage.textContent =
        "Not enough packs selected. This draft requires " +
        requiredPackCount +
        " pack(s), but only " +
        selectedCount +
        " are selected.";
      testDraftStartButton.disabled = true;
      return;
    }

    testDraftValidationMessage.textContent =
      "Ready: " +
      selectedCount +
      " selected pack(s). This draft requires " +
      requiredPackCount +
      ".";
    testDraftStartButton.disabled = false;
  }

  function openCampaignPrintExportModal() {
    const selectedPackIds = getSelectedPackIdsForTestDraft();

    if (!selectedPackIds.length) {
      showUiMessage("Select at least one saved pack first.", true);
      return;
    }

    setCampaignPrintExportPackInputs(selectedPackIds);

    if (campaignPrintExportModal) {
      campaignPrintExportModal.open({
        printUrl: campaignPrintUrl,
        exportZipUrl: campaignExportZipUrl,
      });
    }
  }

  function openCampaignPreviewPrintExportModal() {
    clearCampaignPrintExportPackInputs();

    if (campaignPrintExportModal) {
      campaignPrintExportModal.open({
        printUrl: campaignPreviewPrintUrl,
        exportZipUrl: campaignPreviewExportZipUrl,
      });
    }
  }

  function openTestDraftModal() {
    if (!testDraftModal) {
      return;
    }

    updateTestDraftValidationState();

    testDraftModal.classList.remove("hidden");
    testDraftModal.setAttribute("aria-hidden", "false");
  }

  function closeTestDraftModal() {
    if (!testDraftModal) {
      return;
    }

    testDraftModal.classList.add("hidden");
    testDraftModal.setAttribute("aria-hidden", "true");
  }

  if (selectAllButton) {
    selectAllButton.addEventListener("click", function () {
      getAllCheckboxes().forEach(function (checkbox) {
        checkbox.checked = true;
      });
    });
  }

  if (clearSelectedButton) {
    clearSelectedButton.addEventListener("click", function () {
      getAllCheckboxes().forEach(function (checkbox) {
        checkbox.checked = false;
      });
    });
  }

  if (deleteSelectedButton && deleteConfirmationInput) {
    deleteSelectedButton.addEventListener("click", async function (event) {
      const selectedCount = getSelectedCheckboxes().length;

      if (selectedCount <= 0) {
        showUiMessage("Select at least one saved pack first.", true);
        event.preventDefault();
        return;
      }

      event.preventDefault();

      const confirmed = await confirmUiAction({
        title: "Delete Saved Packs",
        message:
          "You are about to permanently delete " +
          selectedCount +
          " saved pack(s). This cannot be undone.",
        confirmText: "Delete Packs",
        cancelText: "Cancel",
        danger: true,
      });

      if (!confirmed) {
        deleteConfirmationInput.value = "";
        return;
      }

      deleteConfirmationInput.value = "DELETE";
      submitFormWithAction(form, deleteSelectedButton);
    });
  }

  function openSummaryModal() {
    if (!summaryModal) {
      return;
    }

    summaryModal.classList.remove("hidden");
    summaryModal.setAttribute("aria-hidden", "false");
  }

  function closeSummaryModal() {
    if (!summaryModal) {
      return;
    }

    summaryModal.classList.add("hidden");
    summaryModal.setAttribute("aria-hidden", "true");

    if (summaryRefreshOnClose && summaryRefreshOnClose.checked) {
      window.location.href = managePacksUrl;
    }
  }

  function getSummaryRows() {
    if (!summaryList) {
      return [];
    }

    return Array.from(summaryList.querySelectorAll(".campaign-summary-row"));
  }

  function getSummaryCheckedRows() {
    return getSummaryRows().filter(function (row) {
      const checkbox = row.querySelector(".campaign-summary-checkbox");
      return checkbox && checkbox.checked;
    });
  }

  function syncSummaryPackInputs() {
    getSummaryRows().forEach(function (row) {
      const checkbox = row.querySelector(".campaign-summary-checkbox");
      const hiddenPackInputs = Array.from(
        row.querySelectorAll(".campaign-summary-pack-id"),
      );
      const isChecked = checkbox && checkbox.checked;

      hiddenPackInputs.forEach(function (input) {
        input.disabled = !isChecked;
      });
    });
  }

  function sortSummaryRows(sortMode) {
    if (!summaryList) {
      return;
    }

    const rows = getSummaryRows();

    rows.sort(function (left, right) {
      if (sortMode === "release_date") {
        const leftDate = left.dataset.releaseDate || "";
        const rightDate = right.dataset.releaseDate || "";

        if (leftDate !== rightDate) {
          return rightDate.localeCompare(leftDate);
        }
      }

      if (sortMode === "name") {
        const leftName = left.dataset.name || "";
        const rightName = right.dataset.name || "";

        if (leftName !== rightName) {
          return leftName.localeCompare(rightName);
        }
      }

      if (sortMode === "set_code") {
        const leftSet = left.dataset.setCode || "";
        const rightSet = right.dataset.setCode || "";

        if (leftSet !== rightSet) {
          return leftSet.localeCompare(rightSet);
        }
      }

      const leftQuantity = parseInt(left.dataset.quantity || "0", 10);
      const rightQuantity = parseInt(right.dataset.quantity || "0", 10);

      if (leftQuantity !== rightQuantity) {
        return rightQuantity - leftQuantity;
      }

      return (left.dataset.name || "").localeCompare(right.dataset.name || "");
    });

    rows.forEach(function (row) {
      summaryList.appendChild(row);
    });
  }

  function setPackLabelSettingsStatus(messageText, isError) {
    if (!packLabelSettingsStatus) {
      return;
    }

    packLabelSettingsStatus.textContent = messageText || "";
    packLabelSettingsStatus.classList.toggle(
      "campaign-add-pack-status-error",
      Boolean(isError),
    );
    packLabelSettingsStatus.classList.toggle("hidden", !messageText);
  }

  function openPackLabelSettingsModal(button) {
    if (!packLabelSettingsModal || !button) {
      return;
    }

    activePackLabelSettingsUrl = button.dataset.labelSettingsUrl || "";
    activePackLabelSettingsButton = button;

    const packName = button.dataset.packDisplayName || "this pack";
    const currentOverride =
      button.dataset.printLabelsEnabledOverride || "global";

    if (packLabelSettingsSubtitle) {
      packLabelSettingsSubtitle.textContent =
        "Override print/export label behavior for " + packName + ".";
    }

    if (packDisableLabelsCheckbox) {
      packDisableLabelsCheckbox.checked = currentOverride === "0";
    }

    setPackLabelSettingsStatus("", false);

    packLabelSettingsModal.classList.remove("hidden");
    packLabelSettingsModal.setAttribute("aria-hidden", "false");
  }

  function closePackLabelSettingsModal() {
    if (!packLabelSettingsModal) {
      return;
    }

    packLabelSettingsModal.classList.add("hidden");
    packLabelSettingsModal.setAttribute("aria-hidden", "true");

    activePackLabelSettingsUrl = "";
    activePackLabelSettingsButton = null;
  }

  function updatePackRowLabelOverrideState(button, overrideValue) {
    if (!button) {
      return;
    }

    const row = button.closest(".campaign-pack-row");
    const normalizedValue =
      overrideValue === null || overrideValue === undefined
        ? "global"
        : String(overrideValue);

    button.dataset.printLabelsEnabledOverride = normalizedValue;

    if (row) {
      row.dataset.printLabelsEnabledOverride = normalizedValue;

      let badge = row.querySelector(".campaign-pack-labels-disabled-badge");
      const titleRow = row.querySelector(".campaign-pack-title-row");

      if (normalizedValue === "0") {
        if (!badge && titleRow) {
          badge = document.createElement("span");
          badge.className =
            "campaign-status-badge campaign-status-disabled campaign-pack-labels-disabled-badge";
          badge.textContent = "Labels Off";
          titleRow.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    }
  }

  async function savePackLabelSettings() {
    if (
      !activePackLabelSettingsUrl ||
      !packDisableLabelsCheckbox ||
      !packLabelSettingsSaveButton
    ) {
      return;
    }

    const requestedOverride = packDisableLabelsCheckbox.checked ? 0 : null;

    packLabelSettingsSaveButton.disabled = true;
    packLabelSettingsSaveButton.classList.add("action-button-loading");
    packLabelSettingsSaveButton.textContent = "Saving...";

    try {
      const response = await fetch(activePackLabelSettingsUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          print_labels_enabled_override: requestedOverride,
        }),
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Pack label settings failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Could not save pack label settings.",
        );
      }

      updatePackRowLabelOverrideState(
        activePackLabelSettingsButton,
        payload.print_labels_enabled_override,
      );

      closePackLabelSettingsModal();
      showUiMessage(payload.message || "Pack label settings saved.", false);
    } catch (error) {
      console.error(error);
      setPackLabelSettingsStatus(
        error.message || "Could not save pack label settings.",
        true,
      );
    } finally {
      packLabelSettingsSaveButton.disabled = false;
      packLabelSettingsSaveButton.classList.remove("action-button-loading");
      packLabelSettingsSaveButton.textContent = "Save";
    }
  }

  function openAddPackModal() {
    if (!addPackModal) {
      return;
    }

    addPackModalHasSavedChanges = false;

    if (addPackStatus) {
      addPackStatus.classList.add("hidden");
      addPackStatus.textContent = "";
    }

    setActiveAddPackMode("random");

    if (addPackPreview) {
      addPackPreview.classList.add("hidden");
    }

    if (addPackSearchPanel) {
      addPackSearchPanel.classList.add("hidden");
    }

    if (addPackSearchInput) {
      addPackSearchInput.value = "";
    }

    if (addPackSearchResults) {
      addPackSearchResults.classList.add("hidden");
      addPackSearchResults.innerHTML = "";
    }

    if (addPackCustomPanel) {
      addPackCustomPanel.classList.add("hidden");
    }

    resetImportCampaignPanel();

    if (customSetCodeInput) {
      customSetCodeInput.value = "";
    }

    resetCustomPopulateOptions();

    if (customPackNameInput) {
      customPackNameInput.value = "";
    }

    if (customDecklistInput) {
      customDecklistInput.value = "";
    }

    addPackModal.classList.remove("hidden");
    addPackModal.setAttribute("aria-hidden", "false");
  }

  function closeAddPackModal() {
    if (!addPackModal) {
      return;
    }

    addPackModal.classList.add("hidden");
    addPackModal.setAttribute("aria-hidden", "true");

    if (addPackModalHasSavedChanges) {
      window.location.href = managePacksUrl;
    }
  }

  function openCustomTitleSheetModal() {
    if (!customTitleSheetModal) {
      return;
    }

    customTitlePackNameWasEdited = false;

    if (customTitleSetCodeInput) {
      customTitleSetCodeInput.value = "";
    }

    if (customTitlePackNameInput) {
      customTitlePackNameInput.value = "";
    }

    if (customTitleDisablePackTypeCheckbox) {
      customTitleDisablePackTypeCheckbox.checked = false;
    }

    if (customTitleDisableSignatureCheckbox) {
      customTitleDisableSignatureCheckbox.checked = false;
    }

    if (customTitleDisableSetCodeCheckbox) {
      customTitleDisableSetCodeCheckbox.checked = false;
    }

    if (customTitleColorInput) {
      customTitleColorInput.value = "#b48a00";
    }

    if (customTitleBackgroundTopColorInput) {
      customTitleBackgroundTopColorInput.value = "#281f08";
    }

    if (customTitleBackgroundMidColorInput) {
      customTitleBackgroundMidColorInput.value = "#483708";
    }

    if (customTitleBackgroundBottomColorInput) {
      customTitleBackgroundBottomColorInput.value = "#120d03";
    }

    if (customTitleAccentColorInput) {
      customTitleAccentColorInput.value = "#b48a00";
    }

    if (customTitleBorderColorInput) {
      customTitleBorderColorInput.value = "#483700";
    }

    if (customTitleTextColorInput) {
      customTitleTextColorInput.value = "#ffffff";
    }

    if (customTitleSubtitleColorInput) {
      customTitleSubtitleColorInput.value = "#f2e4b0";
    }

    if (customTitleFooterColorInput) {
      customTitleFooterColorInput.value = "#2b2100";
    }

    customTitleSheetModal.classList.remove("hidden");
    customTitleSheetModal.setAttribute("aria-hidden", "false");

    if (customTitleSetCodeInput) {
      customTitleSetCodeInput.focus();
    }
  }

  function closeCustomTitleSheetModal() {
    if (!customTitleSheetModal) {
      return;
    }

    customTitleSheetModal.classList.add("hidden");
    customTitleSheetModal.setAttribute("aria-hidden", "true");
  }

  async function refreshCustomTitlePackNameFromSetCode() {
    if (!customTitleSetCodeInput || !customTitlePackNameInput) {
      return;
    }

    const setCode = (customTitleSetCodeInput.value || "").trim();

    if (!setCode || customTitlePackNameWasEdited) {
      return;
    }

    try {
      const response = await fetch(
        customTitleSetNameUrl + "?set_code=" + encodeURIComponent(setCode),
        encodeURIComponent(setCode),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        return;
      }

      if (payload.set_name && !customTitlePackNameWasEdited) {
        customTitlePackNameInput.value = payload.set_name;
      }
    } catch (error) {
      console.error(error);
    }
  }

  function setActiveAddPackMode(activeMode) {
    const modeCards = Array.from(
      document.querySelectorAll(".campaign-add-pack-mode-card"),
    );
    const modeButtons = Array.from(
      document.querySelectorAll(".campaign-add-pack-mode-button"),
    );

    modeCards.forEach(function (card) {
      const cardMode = card.dataset.addPackMode || "";
      card.classList.toggle(
        "campaign-add-pack-mode-card-active",
        cardMode === activeMode,
      );
    });

    modeButtons.forEach(function (button) {
      const buttonMode = button.dataset.addPackModeButton || "";
      const isActive = buttonMode === activeMode;

      button.classList.toggle("secondary-button", !isActive);
    });
  }

  function hideAddPackModePanels() {
    if (addPackSearchPanel) {
      addPackSearchPanel.classList.add("hidden");
    }

    if (addPackCustomPanel) {
      addPackCustomPanel.classList.add("hidden");
    }

    if (addPackImportCampaignPanel) {
      addPackImportCampaignPanel.classList.add("hidden");
    }

    if (addPackSearchResults) {
      addPackSearchResults.classList.add("hidden");
    }

    if (customPopulateMenu) {
      customPopulateMenu.classList.add("hidden");
    }

    if (customPopulateMenuButton) {
      customPopulateMenuButton.setAttribute("aria-expanded", "false");
    }
  }

  function setAddPackStatus(messageText, isError) {
    if (!addPackStatus) {
      return;
    }

    addPackStatus.textContent = messageText || "";
    addPackStatus.classList.toggle(
      "campaign-add-pack-status-error",
      Boolean(isError),
    );
    addPackStatus.classList.remove("hidden");
  }

  function mergeBatchCardNameCounts(batchCounts, deltaCounts) {
    Object.keys(deltaCounts || {}).forEach(function (cardNameKey) {
      const cleanKey = String(cardNameKey || "")
        .trim()
        .toLowerCase();

      if (!cleanKey) {
        return;
      }

      batchCounts[cleanKey] =
        Number(batchCounts[cleanKey] || 0) +
        Number(deltaCounts[cardNameKey] || 0);
    });

    return batchCounts;
  }

  function setBulkCreateStatus(currentIndex, totalCount, messageText) {
    const cleanMessage = messageText || "Creating packs...";
    setAddPackStatus(
      "Creating pack " +
        currentIndex +
        " of " +
        totalCount +
        ". " +
        cleanMessage,
      false,
    );
  }

  async function readJsonResponseOrThrow(response, fallbackMessage) {
    const contentType = response.headers.get("content-type") || "";
    const responseText = await response.text();

    if (contentType.indexOf("application/json") === -1) {
      console.error("Expected JSON response but received:", {
        status: response.status,
        statusText: response.statusText,
        contentType: contentType,
        bodyPreview: responseText.slice(0, 1000),
      });

      throw new Error(
        fallbackMessage ||
          "The server returned an unexpected error page instead of JSON. Check logs/logs.txt for details.",
      );
    }

    try {
      return JSON.parse(responseText);
    } catch (error) {
      console.error("Invalid JSON response:", {
        status: response.status,
        statusText: response.statusText,
        contentType: contentType,
        bodyPreview: responseText.slice(0, 1000),
      });

      throw new Error(
        fallbackMessage ||
          "The server returned invalid JSON. Check logs/logs.txt for details.",
      );
    }
  }

  function resetImportCampaignPanel() {
    if (addPackImportCampaignPanel) {
      addPackImportCampaignPanel.classList.add("hidden");
    }

    if (importSourceCampaignSelect) {
      importSourceCampaignSelect.value = "";
    }

    if (importPackTools) {
      importPackTools.classList.add("hidden");
    }

    if (importPackResults) {
      importPackResults.classList.add("hidden");
      importPackResults.innerHTML = "";
    }

    if (importSelectedPacksButton) {
      importSelectedPacksButton.disabled = true;
      importSelectedPacksButton.textContent = "Import Selected Packs";
    }
  }

  function getImportCampaignCheckboxes() {
    if (!importPackResults) {
      return [];
    }

    return Array.from(
      importPackResults.querySelectorAll(".campaign-import-pack-checkbox"),
    );
  }

  function updateImportSelectedButtonState() {
    if (!importSelectedPacksButton) {
      return;
    }

    const selectedCount = getImportCampaignCheckboxes().filter(
      function (checkbox) {
        return checkbox.checked && !checkbox.disabled;
      },
    ).length;

    importSelectedPacksButton.disabled = selectedCount <= 0;
    importSelectedPacksButton.textContent =
      selectedCount > 0
        ? "Import Selected Packs (" + selectedCount + ")"
        : "Import Selected Packs";
  }

  function renderImportCampaignPacks(packs) {
    if (!importPackResults) {
      return;
    }

    importPackResults.innerHTML = "";

    if (!packs || !packs.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "campaign-add-pack-search-empty";
      emptyRow.textContent = "No packs were found for that campaign.";
      importPackResults.appendChild(emptyRow);
      importPackResults.classList.remove("hidden");

      if (importPackTools) {
        importPackTools.classList.add("hidden");
      }

      updateImportSelectedButtonState();
      return;
    }

    packs.forEach(function (pack) {
      const row = document.createElement("label");
      row.className = "campaign-import-pack-row";

      if (pack.already_in_target) {
        row.classList.add("campaign-import-pack-row-disabled");
      }

      const checkboxWrap = document.createElement("div");
      checkboxWrap.className = "campaign-pack-select-wrap";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className =
        "campaign-pack-checkbox campaign-import-pack-checkbox";
      checkbox.value = pack.tracked_pack_id || "";
      checkbox.disabled = Boolean(pack.already_in_target);

      checkboxWrap.appendChild(checkbox);

      const imageWrap = document.createElement("div");
      imageWrap.className = "campaign-pack-image-wrap";

      const image = document.createElement("img");
      image.className = "campaign-pack-image";
      image.src = pack.image_src || "";
      image.alt = pack.pack_display_name || "Pack";

      imageWrap.appendChild(image);

      const main = document.createElement("div");
      main.className = "campaign-pack-main";

      const titleRow = document.createElement("div");
      titleRow.className = "campaign-pack-title-row";

      const title = document.createElement("div");
      title.className = "campaign-pack-title";
      title.textContent = pack.pack_display_name || "Pack";

      titleRow.appendChild(title);

      if (pack.already_in_target) {
        const badge = document.createElement("span");
        badge.className = "campaign-status-badge campaign-status-disabled";
        badge.textContent = "Already Linked";
        titleRow.appendChild(badge);
      }

      const meta = document.createElement("div");
      meta.className = "campaign-pack-meta";
      meta.textContent = [
        pack.pack_tracking_code || "",
        pack.set_code || "",
        pack.booster_name || "",
        (pack.total_cards || 0) + " cards",
      ]
        .filter(Boolean)
        .join(" • ");

      main.appendChild(titleRow);
      main.appendChild(meta);

      row.appendChild(checkboxWrap);
      row.appendChild(imageWrap);
      row.appendChild(main);

      importPackResults.appendChild(row);
    });

    importPackResults.classList.remove("hidden");

    if (importPackTools) {
      importPackTools.classList.remove("hidden");
    }

    getImportCampaignCheckboxes().forEach(function (checkbox) {
      checkbox.addEventListener("change", updateImportSelectedButtonState);
    });

    updateImportSelectedButtonState();
  }

  async function loadImportCampaignPacks() {
    if (!importSourceCampaignSelect || !loadImportCampaignPacksButton) {
      return;
    }

    const sourceCampaignId = importSourceCampaignSelect.value || "";

    if (!sourceCampaignId) {
      setAddPackStatus("Choose a source campaign first.", true);
      return;
    }

    loadImportCampaignPacksButton.disabled = true;
    loadImportCampaignPacksButton.classList.add("action-button-loading");
    loadImportCampaignPacksButton.textContent = "Loading...";

    try {
      const loadUrl =
        importCampaignPacksUrl +
        "?source_campaign_id=" +
        encodeURIComponent(sourceCampaignId);

      const response = await fetch(loadUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Campaign pack import lookup failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to load campaign packs.");
      }

      setAddPackStatus(
        "Loaded " + (payload.packs || []).length + " pack(s).",
        false,
      );
      renderImportCampaignPacks(payload.packs || []);
    } catch (error) {
      console.error(error);
      setAddPackStatus(error.message || "Failed to load campaign packs.", true);
    } finally {
      loadImportCampaignPacksButton.disabled = false;
      loadImportCampaignPacksButton.classList.remove("action-button-loading");
      loadImportCampaignPacksButton.textContent = "Load Packs";
    }
  }

  async function importSelectedCampaignPacks() {
    if (!importSelectedPacksButton) {
      return;
    }

    const selectedPackIds = getImportCampaignCheckboxes()
      .filter(function (checkbox) {
        return checkbox.checked && !checkbox.disabled;
      })
      .map(function (checkbox) {
        return checkbox.value;
      });

    if (!selectedPackIds.length) {
      setAddPackStatus("Select at least one pack to import.", true);
      return;
    }

    importSelectedPacksButton.disabled = true;
    importSelectedPacksButton.classList.add("action-button-loading");
    importSelectedPacksButton.textContent = "Importing...";

    try {
      const response = await fetch(importCampaignPacksPostUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pack_ids: selectedPackIds,
        }),
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Campaign pack import failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to import selected packs.");
      }

      setAddPackStatus(payload.message || "Packs imported.", false);
      importSelectedPacksButton.textContent = "Imported";

      window.setTimeout(function () {
        window.location.href = managePacksUrl;
      }, 800);
    } catch (error) {
      console.error(error);
      setAddPackStatus(
        error.message || "Failed to import selected packs.",
        true,
      );
      importSelectedPacksButton.disabled = false;
      importSelectedPacksButton.classList.remove("action-button-loading");
      updateImportSelectedButtonState();
    }
  }

  function clearGeneratedPackPreview() {
    if (addPackPreview) {
      addPackPreview.classList.add("hidden");
    }

    if (addPackPreviewTitle) {
      addPackPreviewTitle.textContent = "";
    }

    if (addPackPreviewMeta) {
      addPackPreviewMeta.textContent = "";
    }

    if (addPackPreviewViewLink) {
      addPackPreviewViewLink.href = "#";
    }

    if (addPackPreviewPrintExportButton) {
      addPackPreviewPrintExportButton.disabled = true;
    }

    if (addPackPreviewSaveButton) {
      addPackPreviewSaveButton.disabled = true;
      addPackPreviewSaveButton.classList.remove("action-button-loading");
      addPackPreviewSaveButton.textContent = "Save";
      addPackPreviewSaveButton.dataset.saveUrl = "";
    }
  }

  function showGeneratedPackPreview(payload) {
    if (!addPackPreview || !addPackPreviewTitle || !addPackPreviewMeta) {
      return;
    }

    addPackPreviewTitle.textContent =
      payload.pack_display_name || "Generated Pack";

    addPackPreviewMeta.textContent = [
      payload.pack_tracking_code || "",
      payload.set_code || "",
      payload.booster_name || "",
      (payload.total_cards || 0) + " cards",
    ]
      .filter(Boolean)
      .join(" • ");

    if (addPackPreviewViewLink) {
      addPackPreviewViewLink.href = payload.view_url || "#";
    }

    if (addPackPreviewPrintExportButton) {
      addPackPreviewPrintExportButton.disabled = false;
    }

    if (addPackPreviewSaveButton) {
      addPackPreviewSaveButton.disabled = false;
      addPackPreviewSaveButton.textContent = "Save";
      addPackPreviewSaveButton.dataset.saveUrl = payload.save_url || "";
    }

    addPackPreview.classList.remove("hidden");
  }

  async function bulkCreateSpecificPacks(pack, countInput, button) {
    const setCode =
      pack && pack.set_code ? String(pack.set_code).trim().toUpperCase() : "";
    const boosterName =
      pack && pack.booster_name
        ? String(pack.booster_name).trim().toLowerCase()
        : "";
    let packCount = parseInt(countInput ? countInput.value : "1", 10);

    if (!Number.isFinite(packCount)) {
      packCount = 1;
    }

    packCount = Math.max(1, Math.min(99, packCount));

    if (countInput) {
      countInput.value = String(packCount);
    }

    if (!setCode || !boosterName) {
      setAddPackStatus("Set code and booster name are required.", true);
      return;
    }

    const confirmed = await confirmUiAction({
      title: "Create Multiple Packs",
      message:
        "Create " +
        packCount +
        " saved pack(s) for " +
        (pack.display_name || setCode) +
        "?",
      confirmText: "Create Packs",
      cancelText: "Cancel",
    });

    if (!confirmed) {
      return;
    }

    const allBulkButtons = Array.from(
      document.querySelectorAll(".campaign-add-pack-bulk-create-button"),
    );
    const allRandomButtons = Array.from(
      document.querySelectorAll(".campaign-add-pack-search-random-button"),
    );

    allBulkButtons.forEach(function (bulkButton) {
      bulkButton.disabled = true;
    });

    allRandomButtons.forEach(function (randomButton) {
      randomButton.disabled = true;
    });

    if (button) {
      button.classList.add("action-button-loading");
      button.textContent = "Creating...";
    }

    addPackModalHasSavedChanges = true;

    const batchCardNameCounts = {};
    const createdPacks = [];

    try {
      for (let packIndex = 1; packIndex <= packCount; packIndex += 1) {
        setBulkCreateStatus(
          packIndex,
          packCount,
          "Generating cards and checking repeats...",
        );

        const response = await fetch(bulkCreateOnePackUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            set_code: setCode,
            booster_name: boosterName,
            batch_card_name_counts: batchCardNameCounts,
          }),
        });

        const payload = await readJsonResponseOrThrow(
          response,
          "Bulk pack creation failed because the server returned an unexpected response.",
        );

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.message || "Failed to create pack " + packIndex + ".",
          );
        }

        createdPacks.push(payload);
        mergeBatchCardNameCounts(
          batchCardNameCounts,
          payload.card_name_counts_delta || {},
        );

        setBulkCreateStatus(
          packIndex,
          packCount,
          "Created " + (payload.pack_tracking_code || "pack") + ".",
        );
      }

      setAddPackStatus(
        "Created " +
          createdPacks.length +
          " pack(s). Close this window to refresh the pack list.",
        false,
      );

      if (button) {
        button.textContent = "Created";
      }
    } catch (error) {
      console.error(error);
      setAddPackStatus(error.message || "Failed to create packs.", true);

      if (button) {
        button.textContent = "Create";
      }
    } finally {
      allBulkButtons.forEach(function (bulkButton) {
        bulkButton.disabled = false;
      });

      allRandomButtons.forEach(function (randomButton) {
        randomButton.disabled = false;
      });

      if (button) {
        button.classList.remove("action-button-loading");
      }
    }
  }

  function renderAddPackSearchResults(results) {
    if (!addPackSearchResults) {
      return;
    }

    addPackSearchResults.innerHTML = "";

    if (!results || !results.length) {
      const emptyRow = document.createElement("div");
      emptyRow.className = "campaign-add-pack-search-empty";
      emptyRow.textContent = "No matching packs found.";
      addPackSearchResults.appendChild(emptyRow);
      addPackSearchResults.classList.remove("hidden");
      return;
    }

    results.forEach(function (pack) {
      const row = document.createElement("div");
      row.className = "campaign-add-pack-search-result";

      const imageWrap = document.createElement("div");
      imageWrap.className = "campaign-add-pack-search-image-wrap";

      const image = document.createElement("img");
      image.className = "campaign-add-pack-search-image";
      image.src = pack.image_src || "";
      image.alt = pack.display_name || "Pack";

      imageWrap.appendChild(image);

      const info = document.createElement("div");
      info.className = "campaign-add-pack-search-info";

      const title = document.createElement("div");
      title.className = "campaign-add-pack-search-title";
      title.textContent = pack.display_name || "Pack";

      const meta = document.createElement("div");
      meta.className = "campaign-add-pack-search-meta";
      meta.textContent = [
        pack.set_code || "",
        pack.booster_name || "",
        (pack.variant_count || 0) + " variant(s)",
      ]
        .filter(Boolean)
        .join(" • ");

      info.appendChild(title);
      info.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "campaign-add-pack-search-actions";

      const randomButton = document.createElement("button");
      randomButton.type = "button";
      randomButton.className =
        "action-button secondary-button campaign-add-pack-search-action-button campaign-add-pack-search-random-button";
      randomButton.textContent = "Random Pack";
      randomButton.dataset.setCode = pack.set_code || "";
      randomButton.dataset.boosterName = pack.booster_name || "";

      const importButton = document.createElement("button");
      importButton.type = "button";
      importButton.className =
        "action-button secondary-button campaign-add-pack-search-action-button";
      importButton.textContent = "Import Pack";
      importButton.disabled = true;
      importButton.title = "Import Pack will be added next.";

      const bulkCreateWrap = document.createElement("div");
      bulkCreateWrap.className = "campaign-add-pack-bulk-create-wrap";

      const bulkCreateLabelLeft = document.createElement("span");
      bulkCreateLabelLeft.className = "campaign-add-pack-bulk-create-label";
      bulkCreateLabelLeft.textContent = "Create";

      const bulkCreateInput = document.createElement("input");
      bulkCreateInput.type = "number";
      bulkCreateInput.className = "campaign-add-pack-bulk-create-input";
      bulkCreateInput.min = "1";
      bulkCreateInput.max = "99";
      bulkCreateInput.step = "1";
      bulkCreateInput.value = "1";
      bulkCreateInput.setAttribute("aria-label", "Number of packs to create");

      const bulkCreateButton = document.createElement("button");
      bulkCreateButton.type = "button";
      bulkCreateButton.className =
        "action-button secondary-button campaign-add-pack-search-action-button campaign-add-pack-bulk-create-button";
      bulkCreateButton.textContent = "Packs";
      bulkCreateButton.title = "Create multiple saved packs";

      bulkCreateInput.addEventListener("input", function () {
        let value = parseInt(bulkCreateInput.value || "1", 10);

        if (!Number.isFinite(value)) {
          value = 1;
        }

        value = Math.max(1, Math.min(99, value));
        bulkCreateInput.value = String(value);
      });

      bulkCreateButton.addEventListener("click", function () {
        bulkCreateSpecificPacks(pack, bulkCreateInput, bulkCreateButton);
      });

      bulkCreateWrap.appendChild(bulkCreateLabelLeft);
      bulkCreateWrap.appendChild(bulkCreateInput);
      bulkCreateWrap.appendChild(bulkCreateButton);

      actions.appendChild(randomButton);
      actions.appendChild(importButton);
      actions.appendChild(bulkCreateWrap);

      row.appendChild(imageWrap);
      row.appendChild(info);
      row.appendChild(actions);

      addPackSearchResults.appendChild(row);
    });

    addPackSearchResults.classList.remove("hidden");
  }

  async function runAddPackSearch() {
    if (!addPackSearchInput || !addPackSearchButton) {
      return;
    }

    const query = (addPackSearchInput.value || "").trim();

    if (!query) {
      setAddPackStatus(
        "Enter a set code, set name, or pack name to search.",
        true,
      );
      return;
    }

    addPackSearchButton.disabled = true;
    addPackSearchButton.classList.add("action-button-loading");
    addPackSearchButton.textContent = "Searching...";

    try {
      const searchUrl = searchOptionsUrl + "?q=" + encodeURIComponent(query);

      const response = await fetch(searchUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Search failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Search failed.");
      }

      setAddPackStatus("Search complete.", false);
      renderAddPackSearchResults(payload.results || []);
    } catch (error) {
      console.error(error);
      setAddPackStatus(error.message || "Search failed.", true);
    } finally {
      addPackSearchButton.disabled = false;
      addPackSearchButton.classList.remove("action-button-loading");
      addPackSearchButton.textContent = "Search";
    }
  }

  async function generateSearchedRandomPack(
    setCode,
    boosterName,
    buttonElement,
  ) {
    if (!setCode || !boosterName) {
      setAddPackStatus(
        "Selected pack was missing set or booster information.",
        true,
      );
      return;
    }

    const originalText = buttonElement
      ? buttonElement.textContent
      : "Random Pack";

    if (buttonElement) {
      buttonElement.disabled = true;
      buttonElement.classList.add("action-button-loading");
      buttonElement.textContent = "Generating...";
    }

    setAddPackStatus("Generating selected pack...", false);

    try {
      const response = await fetch(addSpecificRandomUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          set_code: setCode,
          booster_name: boosterName,
        }),
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "This pack could not be generated because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to generate selected pack.");
      }

      setAddPackStatus(
        payload.message || "Pack generated. Review it before saving.",
        false,
      );
      showGeneratedPackPreview(payload);
    } catch (error) {
      console.error(error);
      setAddPackStatus(
        error.message ||
          "This pack could not be generated. Check that the custom set has a valid pack layout and enough cards matching each slot rule.",
        true,
      );
    } finally {
      if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.classList.remove("action-button-loading");
        buttonElement.textContent = originalText;
      }
    }
  }

  function resetCustomPopulateOptions() {
    if (customPopulateMainButton) {
      customPopulateMainButton.disabled = true;
      customPopulateMainButton.textContent = "Populate";
      customPopulateMainButton.dataset.boosterName = "";
    }

    if (customPopulateMenuButton) {
      customPopulateMenuButton.disabled = true;
      customPopulateMenuButton.setAttribute("aria-expanded", "false");
    }

    if (customPopulateMenu) {
      customPopulateMenu.classList.add("hidden");
      customPopulateMenu.innerHTML = "";
    }
  }

  function setCustomPopulateOptions(options) {
    resetCustomPopulateOptions();

    if (
      !options ||
      !options.length ||
      !customPopulateMainButton ||
      !customPopulateMenuButton ||
      !customPopulateMenu
    ) {
      return;
    }

    const firstOption = options[0];

    customPopulateMainButton.disabled = false;
    customPopulateMainButton.textContent =
      firstOption.label || firstOption.booster_name || "Booster";
    customPopulateMainButton.dataset.boosterName =
      firstOption.booster_name || "";

    customPopulateMenuButton.disabled = false;

    options.forEach(function (option) {
      const itemButton = document.createElement("button");
      itemButton.type = "button";
      itemButton.className = "campaign-custom-populate-menu-item";
      itemButton.textContent = option.label || option.booster_name || "Booster";
      itemButton.dataset.boosterName = option.booster_name || "";

      customPopulateMenu.appendChild(itemButton);
    });
  }

  async function refreshCustomPopulateOptions() {
    if (!customSetCodeInput) {
      return;
    }

    const setCode = (customSetCodeInput.value || "").trim();

    if (!setCode) {
      resetCustomPopulateOptions();
      return;
    }

    try {
      const response = await fetch(
        customPopulateOptionsUrl + "?set_code=" + encodeURIComponent(setCode),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        resetCustomPopulateOptions();
        return;
      }

      setCustomPopulateOptions(payload.options || []);
    } catch (error) {
      console.error(error);
      resetCustomPopulateOptions();
    }
  }

  async function populateCustomDecklist(boosterName) {
    if (!customSetCodeInput || !customDecklistInput || !boosterName) {
      return;
    }

    const setCode = (customSetCodeInput.value || "").trim();

    if (!setCode) {
      setAddPackStatus("Enter a Set Code before using Populate.", true);
      customSetCodeInput.focus();
      return;
    }

    if (customPopulateMainButton) {
      customPopulateMainButton.disabled = true;
      customPopulateMainButton.classList.add("action-button-loading");
    }

    if (customPopulateMenuButton) {
      customPopulateMenuButton.disabled = true;
    }

    setAddPackStatus("Populating custom pack decklist...", false);

    try {
      const response = await fetch(customPopulateUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          set_code: setCode,
          booster_name: boosterName,
          existing_decklist_text: customDecklistInput.value || "",
        }),
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Custom pack populate failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to populate custom pack.");
      }

      customDecklistInput.value = payload.decklist_text || "";
      setAddPackStatus(
        payload.message || "Custom pack decklist populated.",
        false,
      );
    } catch (error) {
      console.error(error);
      setAddPackStatus(
        error.message || "Failed to populate custom pack.",
        true,
      );
    } finally {
      if (customPopulateMainButton) {
        customPopulateMainButton.disabled = false;
        customPopulateMainButton.classList.remove("action-button-loading");
      }

      if (customPopulateMenuButton) {
        customPopulateMenuButton.disabled = false;
      }
    }
  }

  async function generateCustomPackPreview() {
    if (
      !customSetCodeInput ||
      !customPackNameInput ||
      !customDecklistInput ||
      !generateCustomPackButton
    ) {
      return;
    }

    const setCode = (customSetCodeInput.value || "").trim();
    const packName = (customPackNameInput.value || "").trim();
    const decklistText = customDecklistInput.value || "";

    if (!setCode) {
      setAddPackStatus("Set Code is required.", true);
      customSetCodeInput.focus();
      return;
    }

    if (!packName) {
      setAddPackStatus("Pack Name is required.", true);
      customPackNameInput.focus();
      return;
    }

    if (!decklistText.trim()) {
      setAddPackStatus("Decklist text is required.", true);
      customDecklistInput.focus();
      return;
    }

    generateCustomPackButton.disabled = true;
    generateCustomPackButton.classList.add("action-button-loading");
    generateCustomPackButton.textContent = "Generating...";

    setAddPackStatus("Generating custom pack preview...", false);

    try {
      const response = await fetch(addCustomPreviewUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          set_code: setCode,
          pack_name: packName,
          decklist_text: decklistText,
        }),
      });

      const payload = await readJsonResponseOrThrow(
        response,
        "Custom pack preview failed because the server returned an unexpected response.",
      );

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Failed to generate custom pack.");
      }

      setAddPackStatus(
        payload.message || "Custom pack generated. Review it before saving.",
        false,
      );
      showGeneratedPackPreview(payload);
    } catch (error) {
      console.error(error);
      setAddPackStatus(
        error.message || "Failed to generate custom pack.",
        true,
      );
    } finally {
      generateCustomPackButton.disabled = false;
      generateCustomPackButton.classList.remove("action-button-loading");
      generateCustomPackButton.textContent = "Generate Preview";
    }
  }

  if (packExportOpenButton) {
    packExportOpenButton.addEventListener("click", openPackExportModal);
  }

  [
    packExportBackdrop,
    packExportCloseButton,
    packExportCancelButton,
    packExportStatusCloseButton,
  ]
    .filter(Boolean)
    .forEach(function (element) {
      element.addEventListener("click", closePackExportModal);
    });

  if (openPrintExportButton) {
    openPrintExportButton.addEventListener(
      "click",
      openCampaignPrintExportModal,
    );
  }

  if (addPackPreviewPrintExportButton) {
    addPackPreviewPrintExportButton.addEventListener(
      "click",
      openCampaignPreviewPrintExportModal,
    );
  }

  if (summaryButton) {
    summaryButton.addEventListener("click", openSummaryModal);
  }

  if (summaryBackdrop) {
    summaryBackdrop.addEventListener("click", closeSummaryModal);
  }

  if (summaryCloseButton) {
    summaryCloseButton.addEventListener("click", closeSummaryModal);
  }

  if (summarySortSelect) {
    summarySortSelect.addEventListener("change", function () {
      sortSummaryRows(summarySortSelect.value || "quantity");
    });
  }

  if (summarySelectAllButton) {
    summarySelectAllButton.addEventListener("click", function () {
      getSummaryRows().forEach(function (row) {
        const checkbox = row.querySelector(".campaign-summary-checkbox");

        if (checkbox) {
          checkbox.checked = true;
        }
      });

      syncSummaryPackInputs();
    });
  }

  if (summaryClearSelectionButton) {
    summaryClearSelectionButton.addEventListener("click", function () {
      getSummaryRows().forEach(function (row) {
        const checkbox = row.querySelector(".campaign-summary-checkbox");

        if (checkbox) {
          checkbox.checked = false;
        }
      });

      syncSummaryPackInputs();
    });
  }

  if (summaryList) {
    summaryList.addEventListener("change", function (event) {
      if (
        event.target &&
        event.target.classList.contains("campaign-summary-checkbox")
      ) {
        syncSummaryPackInputs();
      }
    });

    sortSummaryRows("quantity");
  }

  if (summaryForm) {
    summaryForm.addEventListener("submit", async function (event) {
      syncSummaryPackInputs();

      const selectedRows = getSummaryCheckedRows();
      const submitter = event.submitter;
      const action = submitter ? submitter.value || "" : "";

      if (selectedRows.length <= 0) {
        event.preventDefault();
        showUiMessage("Select at least one pack summary row first.", true);
        return;
      }

      if (action === "delete") {
        event.preventDefault();

        const selectedPackInputCount = Array.from(
          summaryForm.querySelectorAll(
            ".campaign-summary-pack-id:not(:disabled)",
          ),
        ).length;

        const confirmed = await confirmUiAction({
          title: "Delete Selected Packs",
          message:
            "You are about to permanently delete " +
            selectedPackInputCount +
            " selected pack(s). This cannot be undone.",
          confirmText: "Delete Packs",
          cancelText: "Cancel",
          danger: true,
        });

        if (!confirmed) {
          if (summaryDeleteConfirmationInput) {
            summaryDeleteConfirmationInput.value = "";
          }

          return;
        }

        if (summaryDeleteConfirmationInput) {
          summaryDeleteConfirmationInput.value = "DELETE";
        }

        submitFormWithAction(summaryForm, submitter);
      }
    });
  }

  if (printCustomTitleSheetButton) {
    printCustomTitleSheetButton.addEventListener(
      "click",
      openCustomTitleSheetModal,
    );
  }

  if (testDraftButton) {
    testDraftButton.addEventListener("click", function () {
      const selectedCount = getSelectedCheckboxes().length;

      if (selectedCount <= 0) {
        showUiMessage("Select at least one saved pack first.", true);
        return;
      }

      openTestDraftModal();
    });
  }

  if (testDraftBackdrop) {
    testDraftBackdrop.addEventListener("click", closeTestDraftModal);
  }

  if (testDraftCloseButton) {
    testDraftCloseButton.addEventListener("click", closeTestDraftModal);
  }

  if (testDraftPodSizeSelect) {
    testDraftPodSizeSelect.addEventListener(
      "change",
      updateTestDraftValidationState,
    );
  }

  if (testDraftPacksPerPlayerSelect) {
    testDraftPacksPerPlayerSelect.addEventListener(
      "change",
      updateTestDraftValidationState,
    );
  }

  if (testDraftHumanPlayerSelect) {
    testDraftHumanPlayerSelect.addEventListener(
      "change",
      renderTestDraftSelectedPlayer,
    );
    renderTestDraftSelectedPlayer();
  }

  if (testDraftStartForm) {
    testDraftStartForm.addEventListener("submit", function (event) {
      updateTestDraftValidationState();

      if (testDraftStartButton && testDraftStartButton.disabled) {
        event.preventDefault();
      }
    });
  }

  if (customTitleSheetBackdrop) {
    customTitleSheetBackdrop.addEventListener(
      "click",
      closeCustomTitleSheetModal,
    );
  }

  if (customTitleSheetCloseButton) {
    customTitleSheetCloseButton.addEventListener(
      "click",
      closeCustomTitleSheetModal,
    );
  }

  if (customTitlePackNameInput) {
    customTitlePackNameInput.addEventListener("input", function () {
      customTitlePackNameWasEdited = true;
    });
  }

  if (customTitleSetCodeInput) {
    customTitleSetCodeInput.addEventListener("input", function () {
      customTitlePackNameWasEdited = false;
    });

    customTitleSetCodeInput.addEventListener(
      "change",
      refreshCustomTitlePackNameFromSetCode,
    );
    customTitleSetCodeInput.addEventListener(
      "blur",
      refreshCustomTitlePackNameFromSetCode,
    );
  }

  Array.from(
    document.querySelectorAll(".campaign-pack-label-settings-button"),
  ).forEach(function (button) {
    button.addEventListener("click", function () {
      openPackLabelSettingsModal(button);
    });
  });

  if (packLabelSettingsBackdrop) {
    packLabelSettingsBackdrop.addEventListener(
      "click",
      closePackLabelSettingsModal,
    );
  }

  if (packLabelSettingsCloseButton) {
    packLabelSettingsCloseButton.addEventListener(
      "click",
      closePackLabelSettingsModal,
    );
  }

  if (packLabelSettingsSaveButton) {
    packLabelSettingsSaveButton.addEventListener(
      "click",
      savePackLabelSettings,
    );
  }

  if (addPackButton) {
    addPackButton.addEventListener("click", openAddPackModal);
  }

  if (addPackBackdrop) {
    addPackBackdrop.addEventListener("click", closeAddPackModal);
  }

  if (addPackCloseButton) {
    addPackCloseButton.addEventListener("click", closeAddPackModal);
  }

  if (addRandomPackButton) {
    addRandomPackButton.addEventListener("click", async function () {
      setActiveAddPackMode("random");
      hideAddPackModePanels();

      addRandomPackButton.disabled = true;
      addRandomPackButton.classList.add("action-button-loading");
      addRandomPackButton.textContent = "Adding...";

      setAddPackStatus("Generating and saving a random pack...", false);

      try {
        const response = await fetch(addRandomUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        });

        const payload = await readJsonResponseOrThrow(
          response,
          "Random pack generation failed because the server returned an unexpected response.",
        );

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to add random pack.");
        }

        setAddPackStatus(
          payload.message || "Random pack generated. Review it before saving.",
          false,
        );
        showGeneratedPackPreview(payload);

        addRandomPackButton.disabled = false;
        addRandomPackButton.classList.remove("action-button-loading");
        addRandomPackButton.textContent = "Add Random Pack";
      } catch (error) {
        console.error(error);
        setAddPackStatus(error.message || "Failed to add random pack.", true);

        addRandomPackButton.disabled = false;
        addRandomPackButton.classList.remove("action-button-loading");
        addRandomPackButton.textContent = "Add Random Pack";
      }
    });
  }

  if (showSearchPanelButton) {
    showSearchPanelButton.addEventListener("click", function () {
      setActiveAddPackMode("search");
      hideAddPackModePanels();

      if (addPackSearchPanel) {
        addPackSearchPanel.classList.remove("hidden");
      }

      if (addPackSearchInput) {
        addPackSearchInput.focus();
      }

      if (addPackStatus) {
        addPackStatus.classList.add("hidden");
        addPackStatus.textContent = "";
      }
    });
  }

  if (showCustomPanelButton) {
    showCustomPanelButton.addEventListener("click", function () {
      setActiveAddPackMode("custom");
      hideAddPackModePanels();

      if (addPackCustomPanel) {
        addPackCustomPanel.classList.remove("hidden");
      }

      if (customSetCodeInput) {
        customSetCodeInput.focus();
      }

      if (addPackStatus) {
        addPackStatus.classList.add("hidden");
        addPackStatus.textContent = "";
      }
    });
  }

  if (showImportCampaignPanelButton) {
    showImportCampaignPanelButton.addEventListener("click", function () {
      setActiveAddPackMode("import-campaign");
      hideAddPackModePanels();

      if (addPackPreview) {
        addPackPreview.classList.add("hidden");
      }

      if (addPackImportCampaignPanel) {
        addPackImportCampaignPanel.classList.remove("hidden");
      }
    });
  }

  if (loadImportCampaignPacksButton) {
    loadImportCampaignPacksButton.addEventListener("click", function () {
      loadImportCampaignPacks();
    });
  }

  if (importSourceCampaignSelect) {
    importSourceCampaignSelect.addEventListener("change", function () {
      if (importPackResults) {
        importPackResults.classList.add("hidden");
        importPackResults.innerHTML = "";
      }

      if (importPackTools) {
        importPackTools.classList.add("hidden");
      }

      updateImportSelectedButtonState();
    });
  }

  if (importSelectAllButton) {
    importSelectAllButton.addEventListener("click", function () {
      getImportCampaignCheckboxes().forEach(function (checkbox) {
        if (!checkbox.disabled) {
          checkbox.checked = true;
        }
      });

      updateImportSelectedButtonState();
    });
  }

  if (importClearSelectionButton) {
    importClearSelectionButton.addEventListener("click", function () {
      getImportCampaignCheckboxes().forEach(function (checkbox) {
        checkbox.checked = false;
      });

      updateImportSelectedButtonState();
    });
  }

  if (importSelectedPacksButton) {
    importSelectedPacksButton.addEventListener("click", function () {
      importSelectedCampaignPacks();
    });
  }
  if (customSetCodeInput) {
    customSetCodeInput.addEventListener("input", function () {
      resetCustomPopulateOptions();
    });

    customSetCodeInput.addEventListener("change", function () {
      refreshCustomPopulateOptions();
    });

    customSetCodeInput.addEventListener("blur", function () {
      refreshCustomPopulateOptions();
    });
  }

  if (customPopulateMainButton) {
    customPopulateMainButton.addEventListener("click", function () {
      const boosterName = customPopulateMainButton.dataset.boosterName || "";
      populateCustomDecklist(boosterName);
    });
  }

  if (customPopulateMenuButton) {
    customPopulateMenuButton.addEventListener("click", function () {
      if (!customPopulateMenu) {
        return;
      }

      const isHidden = customPopulateMenu.classList.contains("hidden");
      customPopulateMenu.classList.toggle("hidden", !isHidden);
      customPopulateMenuButton.setAttribute(
        "aria-expanded",
        isHidden ? "true" : "false",
      );
    });
  }

  if (customPopulateMenu) {
    customPopulateMenu.addEventListener("click", function (event) {
      const itemButton = event.target.closest(
        ".campaign-custom-populate-menu-item",
      );

      if (!itemButton) {
        return;
      }

      customPopulateMenu.classList.add("hidden");

      if (customPopulateMenuButton) {
        customPopulateMenuButton.setAttribute("aria-expanded", "false");
      }

      populateCustomDecklist(itemButton.dataset.boosterName || "");
    });
  }

  if (generateCustomPackButton) {
    generateCustomPackButton.addEventListener("click", function () {
      generateCustomPackPreview();
    });
  }

  if (addPackSearchButton) {
    addPackSearchButton.addEventListener("click", function () {
      runAddPackSearch();
    });
  }

  if (addPackSearchInput) {
    addPackSearchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        runAddPackSearch();
      }
    });
  }

  if (addPackSearchResults) {
    addPackSearchResults.addEventListener("click", function (event) {
      const randomButton = event.target.closest(
        ".campaign-add-pack-search-action-button",
      );

      if (
        !randomButton ||
        randomButton.disabled ||
        randomButton.textContent !== "Random Pack"
      ) {
        return;
      }

      generateSearchedRandomPack(
        randomButton.dataset.setCode || "",
        randomButton.dataset.boosterName || "",
        randomButton,
      );
    });
  }

  if (addPackPreviewSaveButton) {
    addPackPreviewSaveButton.addEventListener("click", async function () {
      const saveUrl = addPackPreviewSaveButton.dataset.saveUrl || "";

      if (!saveUrl) {
        setAddPackStatus("No generated pack is available to save.", true);
        return;
      }

      addPackPreviewSaveButton.disabled = true;
      addPackPreviewSaveButton.classList.add("action-button-loading");
      addPackPreviewSaveButton.textContent = "Saving...";

      try {
        const response = await fetch(saveUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to save pack.");
        }

        addPackModalHasSavedChanges = true;
        setAddPackStatus(
          payload.message || "Pack saved. You can add another pack.",
          false,
        );
        clearGeneratedPackPreview();
      } catch (error) {
        console.error(error);
        setAddPackStatus(error.message || "Failed to save pack.", true);

        addPackPreviewSaveButton.disabled = false;
        addPackPreviewSaveButton.classList.remove("action-button-loading");
        addPackPreviewSaveButton.textContent = "Save";
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") {
      return;
    }

    if (packExportModal && !packExportModal.classList.contains("hidden")) {
      closePackExportModal();
      return;
    }

    if (campaignPrintExportModal && campaignPrintExportModal.isOpen()) {
      campaignPrintExportModal.close();
      return;
    }

    if (
      packLabelSettingsModal &&
      !packLabelSettingsModal.classList.contains("hidden")
    ) {
      closePackLabelSettingsModal();
      return;
    }

    if (summaryModal && !summaryModal.classList.contains("hidden")) {
      closeSummaryModal();
      return;
    }

    if (addPackModal && !addPackModal.classList.contains("hidden")) {
      closeAddPackModal();
      return;
    }

    if (
      customTitleSheetModal &&
      !customTitleSheetModal.classList.contains("hidden")
    ) {
      closeCustomTitleSheetModal();
      return;
    }

    if (testDraftModal && !testDraftModal.classList.contains("hidden")) {
      closeTestDraftModal();
      return;
    }
  });
})();
