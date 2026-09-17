(function () {
  const workspace = document.getElementById("deckbuilderWorkspace");
  const deckbuilderMain = workspace
    ? workspace.querySelector(".deckbuilder-main")
    : null;

  const deckList = document.getElementById("deckbuilderDeckList");
  const sideboardList = document.getElementById("deckbuilderSideboardList");
  const zoneResizeHandle = document.getElementById(
    "deckbuilderZoneResizeHandle",
  );
  const sortSelect = document.getElementById("deckbuilderSortSelect");
  const cardSizeSelect = document.getElementById("deckbuilderCardSizeSelect");
  const basicLandPaletteTemplate = document.getElementById(
    "deckbuilderBasicLandPaletteTemplate",
  );
  const openAddCardsButton = document.getElementById(
    "deckbuilderOpenAddCardsButton",
  );
  const sideboardFilterButton = document.getElementById(
    "deckbuilderSideboardFilterButton",
  );
  const sideboardCollapseButton = document.getElementById(
    "deckbuilderSideboardCollapseButton",
  );
  const sideboardCollapsedButton = document.getElementById(
    "deckbuilderSideboardCollapsedButton",
  );
  const sideboardFilterPanel = document.getElementById(
    "deckbuilderSideboardFilterPanel",
  );
  const sideboardFilterText = document.getElementById(
    "deckbuilderSideboardFilterText",
  );
  const sideboardFilterRarity = document.getElementById(
    "deckbuilderSideboardFilterRarity",
  );
  const sideboardFilterColor = document.getElementById(
    "deckbuilderSideboardFilterColor",
  );
  const sideboardFilterManaOperator = document.getElementById(
    "deckbuilderSideboardFilterManaOperator",
  );
  const sideboardFilterManaValue = document.getElementById(
    "deckbuilderSideboardFilterManaValue",
  );
  const sideboardFilterType = document.getElementById(
    "deckbuilderSideboardFilterType",
  );
  const sideboardFilterAlternateImage = document.getElementById(
    "deckbuilderSideboardFilterAlternateImage",
  );
  const sideboardClearFiltersButton = document.getElementById(
    "deckbuilderSideboardClearFiltersButton",
  );
  const sideboardFilterStatus = document.getElementById(
    "deckbuilderSideboardFilterStatus",
  );

  const deckSelectAllButton = document.getElementById(
    "deckbuilderDeckSelectAllButton",
  );
  const deckClearSelectionButton = document.getElementById(
    "deckbuilderDeckClearSelectionButton",
  );
  const deckFilterButton = document.getElementById(
    "deckbuilderDeckFilterButton",
  );
  const deckFilterPanel = document.getElementById("deckbuilderDeckFilterPanel");
  const deckFilterText = document.getElementById("deckbuilderDeckFilterText");
  const deckFilterRarity = document.getElementById(
    "deckbuilderDeckFilterRarity",
  );
  const deckFilterColor = document.getElementById("deckbuilderDeckFilterColor");
  const deckFilterManaOperator = document.getElementById(
    "deckbuilderDeckFilterManaOperator",
  );
  const deckFilterManaValue = document.getElementById(
    "deckbuilderDeckFilterManaValue",
  );
  const deckFilterType = document.getElementById("deckbuilderDeckFilterType");
  const deckFilterAlternateImage = document.getElementById(
    "deckbuilderDeckFilterAlternateImage",
  );
  const deckClearFiltersButton = document.getElementById(
    "deckbuilderDeckClearFiltersButton",
  );
  const deckFilterStatus = document.getElementById(
    "deckbuilderDeckFilterStatus",
  );

  const listViewButton = document.getElementById("deckbuilderListViewButton");
  const gridViewButton = document.getElementById("deckbuilderGridViewButton");
  const stackViewButton = document.getElementById("deckbuilderStackViewButton");
  const selectAllButton = document.getElementById("deckbuilderSelectAllButton");
  const clearSelectionButton = document.getElementById(
    "deckbuilderClearSelectionButton",
  );
  const batchUpscaleButton = document.getElementById(
    "deckbuilderBatchUpscaleButton",
  );
  const statsButton = document.getElementById("deckbuilderStatsButton");
  const deckNameInput = document.getElementById("deckbuilderDeckNameInput");
  const deckTypeSelect = document.getElementById("deckbuilderDeckTypeSelect");
  const saveDeckButton = document.getElementById("deckbuilderSaveDeckButton");
  const loadDeckButton = document.getElementById("deckbuilderLoadDeckButton");
  const deleteDeckButton = document.getElementById(
    "deckbuilderDeleteDeckButton",
  );
  const deleteDeckModal = document.getElementById("deckbuilderDeleteDeckModal");
  const deleteDeckBackdrop = document.getElementById(
    "deckbuilderDeleteDeckBackdrop",
  );
  const deleteDeckCloseButton = document.getElementById(
    "deckbuilderDeleteDeckCloseButton",
  );
  const deleteDeckName = document.getElementById("deckbuilderDeleteDeckName");
  const deleteDeckConfirmInput = document.getElementById(
    "deckbuilderDeleteDeckConfirmInput",
  );
  const deleteDeckCancelButton = document.getElementById(
    "deckbuilderDeleteDeckCancelButton",
  );
  const deleteDeckConfirmButton = document.getElementById(
    "deckbuilderDeleteDeckConfirmButton",
  );
  const openPrintExportButton = document.getElementById(
    "deckbuilderOpenPrintExportButton",
  );
  const copyDecklistButton = document.getElementById(
    "deckbuilderCopyDecklistButton",
  );
  const copyDecklistMenuButton = document.getElementById(
    "deckbuilderCopyDecklistMenuButton",
  );
  const copyDecklistMenu = document.getElementById(
    "deckbuilderCopyDecklistMenu",
  );
  const cardContextMenu = document.getElementById("deckbuilderCardContextMenu");
  const contextMoveButton = document.getElementById(
    "deckbuilderContextMoveButton",
  );
  const landPaletteContextMenu = document.getElementById(
    "deckbuilderLandPaletteContextMenu",
  );
  const landPaletteAddMenuLabel = document.getElementById(
    "deckbuilderLandPaletteAddMenuLabel",
  );
  const landPaletteQuantityMenu = document.getElementById(
    "deckbuilderLandPaletteQuantityMenu",
  );
  const loadDeckModal = document.getElementById("deckbuilderLoadDeckModal");
  const loadDeckBackdrop = document.getElementById(
    "deckbuilderLoadDeckBackdrop",
  );
  const loadDeckCloseButton = document.getElementById(
    "deckbuilderLoadDeckCloseButton",
  );
  const loadDeckSearchInput = document.getElementById(
    "deckbuilderLoadDeckSearchInput",
  );
  const loadDeckSearchButton = document.getElementById(
    "deckbuilderLoadDeckSearchButton",
  );
  const loadDeckStatus = document.getElementById("deckbuilderLoadDeckStatus");
  const loadDeckList = document.getElementById("deckbuilderLoadDeckList");
  const deckCount = document.getElementById("deckbuilderDeckCount");
  const sideboardCount = document.getElementById("deckbuilderSideboardCount");
  const deckTypeSummary = document.getElementById("deckbuilderDeckTypeSummary");
  const hoverPreview = document.getElementById("deckbuilderHoverPreview");
  const hoverPreviewImage = document.getElementById(
    "deckbuilderHoverPreviewImage",
  );
  const bulkActionStatus = document.getElementById(
    "deckbuilderBulkActionStatus",
  );
  const bulkActionStatusTitle = document.getElementById(
    "deckbuilderBulkActionStatusTitle",
  );
  const bulkActionStatusMessage = document.getElementById(
    "deckbuilderBulkActionStatusMessage",
  );

  if (!workspace) {
    return;
  }

  const DECKBUILDER_PREFERENCE_KEYS = Object.freeze({
    viewMode: "imomir.deckbuilder.viewMode",
    cardSize: "imomir.deckbuilder.cardSize",
  });

  const DECKBUILDER_CARD_SIZES = Object.freeze([
    70, 85, 100, 115, 130, 150, 175, 200,
  ]);

  const deckbuilderPreferences = {
    get: function (key, fallbackValue) {
      try {
        const storedValue = window.localStorage.getItem(key);

        return storedValue === null ? fallbackValue : storedValue;
      } catch (error) {
        return fallbackValue;
      }
    },

    set: function (key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (error) {
        // Browser storage may be unavailable or blocked.
      }
    },
  };

  function normalizeDeckbuilderViewMode(value) {
    const cleanValue = String(value || "")
      .trim()
      .toLowerCase();

    return ["grid", "list", "stack"].indexOf(cleanValue) !== -1
      ? cleanValue
      : "grid";
  }

  function normalizeDeckbuilderCardSize(value) {
    const parsedValue = parseInt(value, 10);

    return DECKBUILDER_CARD_SIZES.indexOf(parsedValue) !== -1
      ? parsedValue
      : 100;
  }

  const STACK_HOVER_EXPAND_DELAY_MS = 300;

  const defaultDeckbuilderViewMode = normalizeDeckbuilderViewMode(
    workspace.dataset.defaultViewMode || "grid",
  );

  const defaultDeckbuilderCardSize = normalizeDeckbuilderCardSize(
    workspace.dataset.defaultCardSize || "100",
  );

  let draggedDeckbuilderItem = null;
  let pickedSortMode = workspace.dataset.defaultSortMode || "rarity-desc";
  let deckbuilderViewMode = normalizeDeckbuilderViewMode(
    deckbuilderPreferences.get(
      DECKBUILDER_PREFERENCE_KEYS.viewMode,
      defaultDeckbuilderViewMode,
    ),
  );
  let deckbuilderCardSize = normalizeDeckbuilderCardSize(
    deckbuilderPreferences.get(
      DECKBUILDER_PREFERENCE_KEYS.cardSize,
      defaultDeckbuilderCardSize,
    ),
  );
  let isResizingZones = false;
  let deckbuilderCopyFormat = "simple";
  let activeContextCard = null;
  let activeLandPaletteCard = null;
  let activeChangePrintingTarget = null;
  let stackHoverTimer = null;
  let stackHoverCard = null;
  let deckbuilderCardSearchModal = null;
  let deckbuilderBasicLandCounts = {};
  let selectedDeckbuilderZone = "";

  workspace.style.setProperty(
    "--deckbuilder-sideboard-flex",
    workspace.dataset.sideboardFlex || "0.40",
  );
  workspace.style.setProperty(
    "--deckbuilder-deck-flex",
    workspace.dataset.deckFlex || "0.60",
  );
  let sideboardFiltersVisible = false;
  let deckFiltersVisible = false;

  const moveZoneUrl = workspace.dataset.moveZoneUrl || "";
  const basicLandUrl = workspace.dataset.basicLandUrl || "";
  const saveDeckUrl = workspace.dataset.saveUrl || "";
  const deleteDeckUrl = workspace.dataset.deleteUrl || "";
  const cardActionUrl = workspace.dataset.cardActionUrl || "";
  const bulkCardActionUrl = workspace.dataset.bulkCardActionUrl || "";
  const stackLayoutUrl = workspace.dataset.stackLayoutUrl || "";
  const changePrintingOptionsUrl =
    workspace.dataset.changePrintingOptionsUrl || "";
  const changePrintingUrl = workspace.dataset.changePrintingUrl || "";
  const addCardSearchUrl = workspace.dataset.addCardSearchUrl || "";
  const addCardUrl = workspace.dataset.addCardUrl || "";
  const bulkImportUrl = workspace.dataset.bulkImportUrl || "";
  const bulkImportAddMostRecentUrl =
    workspace.dataset.bulkImportAddMostRecentUrl || "";
  const loadDecksUrl = workspace.dataset.loadDecksUrl || "";
  const printUrl = workspace.dataset.printUrl || "";
  const exportZipUrl = workspace.dataset.exportZipUrl || "";
  const upscaleControlUrlTemplate =
    workspace.dataset.upscaleControlUrlTemplate || "";
  const deckbuilderDragMimeType = "application/x-imomir-deckbuilder";

  function writeDeckbuilderClientDebug(label, data) {
    // Temporary client debug disabled after Basic Land drag/drop was stabilized.
    // Leave this function in place so existing diagnostic calls remain harmless.
  }

  function setDeckbuilderDragTransfer(event, dragPayload, fallbackText) {
    if (!event || !event.dataTransfer) {
      return;
    }

    try {
      event.dataTransfer.effectAllowed =
        dragPayload.type === "basic-land" ? "copy" : "move";
      event.dataTransfer.setData(
        deckbuilderDragMimeType,
        JSON.stringify(dragPayload),
      );
      event.dataTransfer.setData(
        "text/plain",
        fallbackText ||
          dragPayload.cardName ||
          dragPayload.landName ||
          "Deck Builder Card",
      );
    } catch (error) {
      writeDeckbuilderClientDebug("DRAG TRANSFER SET FAILED", {
        error: String(error),
        dragPayload: dragPayload,
      });
    }
  }

  function getDeckbuilderDragTransfer(event) {
    if (draggedDeckbuilderItem) {
      return draggedDeckbuilderItem;
    }

    if (!event || !event.dataTransfer) {
      return null;
    }

    try {
      const rawPayload = event.dataTransfer.getData(deckbuilderDragMimeType);

      if (!rawPayload) {
        return null;
      }

      return JSON.parse(rawPayload);
    } catch (error) {
      writeDeckbuilderClientDebug("DRAG TRANSFER READ FAILED", {
        error: String(error),
      });

      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getDeckbuilderDeckTypeLabel(deckFormat) {
    const cleanDeckFormat = String(deckFormat || "")
      .trim()
      .toLowerCase();

    if (cleanDeckFormat === "limited") {
      return "Limited";
    }

    if (cleanDeckFormat === "commander") {
      return "Commander";
    }

    if (cleanDeckFormat === "modern") {
      return "Modern";
    }

    if (cleanDeckFormat === "pioneer") {
      return "Pioneer";
    }

    if (cleanDeckFormat === "eternal") {
      return "Eternal";
    }

    if (cleanDeckFormat === "pauper") {
      return "Pauper";
    }

    return "Standard";
  }

  function updateDeckbuilderDeckTypeSummary(deckFormat) {
    if (!deckTypeSummary) {
      return;
    }

    deckTypeSummary.textContent = getDeckbuilderDeckTypeLabel(deckFormat);
  }

  function setDeckbuilderBulkActionStatus(
    isVisible,
    titleText,
    messageText,
    isComplete,
  ) {
    if (!bulkActionStatus) {
      return;
    }

    bulkActionStatus.classList.toggle("hidden", !isVisible);
    bulkActionStatus.classList.toggle(
      "deckbuilder-bulk-action-status-complete",
      Boolean(isComplete),
    );
    bulkActionStatus.setAttribute("aria-hidden", isVisible ? "false" : "true");

    if (bulkActionStatusTitle) {
      bulkActionStatusTitle.textContent = titleText || "Updating Deck";
    }

    if (bulkActionStatusMessage) {
      bulkActionStatusMessage.textContent = messageText || "";
    }
  }

  function showDeckbuilderBulkActionStatus(titleText, messageText) {
    setDeckbuilderBulkActionStatus(true, titleText, messageText, false);
  }

  function completeDeckbuilderBulkActionStatus(messageText) {
    setDeckbuilderBulkActionStatus(
      true,
      "Deck Updated",
      messageText || "Done.",
      true,
    );

    window.setTimeout(function () {
      setDeckbuilderBulkActionStatus(false, "", "", false);
    }, 1400);
  }

  function hideDeckbuilderBulkActionStatus() {
    setDeckbuilderBulkActionStatus(false, "", "", false);
  }

  function getDeckbuilderCards(listElement) {
    if (!listElement) {
      return [];
    }

    return Array.from(
      listElement.querySelectorAll(
        ".deckbuilder-card:not([data-is-land-palette='1'])",
      ),
    );
  }

  function getAllVisibleDeckbuilderCards(listElement) {
    if (!listElement) {
      return [];
    }

    return Array.from(listElement.querySelectorAll(".deckbuilder-card"));
  }

  function getRarityValue(rarity) {
    const cleanRarity = String(rarity || "")
      .trim()
      .toLowerCase();

    if (cleanRarity === "common") {
      return 1;
    }

    if (cleanRarity === "uncommon") {
      return 2;
    }

    if (cleanRarity === "rare") {
      return 3;
    }

    if (cleanRarity === "mythic") {
      return 4;
    }

    return 0;
  }

  function getCardNameValue(cardElement) {
    return String(cardElement?.dataset?.cardName || "").toLowerCase();
  }

  function getCardManaValue(cardElement) {
    const parsedManaValue = parseFloat(cardElement?.dataset?.cardManaValue);

    return Number.isFinite(parsedManaValue) ? parsedManaValue : 999;
  }

  function getCardRarityValue(cardElement) {
    return getRarityValue(cardElement?.dataset?.cardRarity || "");
  }

  function getDeckbuilderCardSizePixels(sizePercent) {
    const cleanSizePercent = parseInt(sizePercent || 100, 10);
    const safeSizePercent = Number.isFinite(cleanSizePercent)
      ? Math.max(70, Math.min(200, cleanSizePercent))
      : 100;

    return Math.round(176 * (safeSizePercent / 100));
  }

  function updateDeckbuilderCardSize(sizePercent) {
    const normalizedSizePercent = normalizeDeckbuilderCardSize(sizePercent);
    const cardWidth = getDeckbuilderCardSizePixels(normalizedSizePercent);
    const stackColumnWidth = Math.max(96, cardWidth);
    const stackCardWidth = Math.max(80, stackColumnWidth - 16);
    //const visibleStackStrip = Math.max(30, Math.round(stackCardWidth * 0.22));
    const visibleStackStrip = Math.max(30, Math.round(stackCardWidth * 0.16));
    const cardHeight = Math.round(stackCardWidth * 1.4);
    const overlap = Math.max(0, cardHeight - visibleStackStrip);

    deckbuilderCardSize = normalizedSizePercent;

    deckbuilderPreferences.set(
      DECKBUILDER_PREFERENCE_KEYS.cardSize,
      deckbuilderCardSize,
    );

    workspace.style.setProperty("--deckbuilder-card-width", cardWidth + "px");
    workspace.style.setProperty(
      "--deckbuilder-stack-column-width",
      stackColumnWidth + "px",
    );
    workspace.style.setProperty(
      "--deckbuilder-stack-overlap",
      "-" + overlap + "px",
    );

    if (cardSizeSelect) {
      cardSizeSelect.value = String(deckbuilderCardSize);
    }

    if (deckbuilderViewMode === "stack") {
      buildStackColumnsForZone(deckList);
      if (deckList) {
        deckList.scrollLeft = Math.max(0, deckList.scrollLeft || 0);
      }
    }
  }

  function getDeckbuilderRoleSortValue(cardElement) {
    const deckRole = String(cardElement?.dataset?.deckRole || "main")
      .trim()
      .toLowerCase();

    if (deckRole === "commander") {
      return 0;
    }

    if (deckRole === "partner") {
      return 1;
    }

    return 2;
  }

  function compareDeckbuilderCards(a, b) {
    const roleCompare =
      getDeckbuilderRoleSortValue(a) - getDeckbuilderRoleSortValue(b);

    if (roleCompare !== 0) {
      return roleCompare;
    }

    if (pickedSortMode === "name-asc") {
      return getCardNameValue(a).localeCompare(getCardNameValue(b));
    }

    if (pickedSortMode === "name-desc") {
      return getCardNameValue(b).localeCompare(getCardNameValue(a));
    }

    if (pickedSortMode === "rarity-asc") {
      return (
        getCardRarityValue(a) - getCardRarityValue(b) ||
        getCardNameValue(a).localeCompare(getCardNameValue(b))
      );
    }

    if (pickedSortMode === "mv-asc") {
      return (
        getCardManaValue(a) - getCardManaValue(b) ||
        getCardNameValue(a).localeCompare(getCardNameValue(b))
      );
    }

    if (pickedSortMode === "mv-desc") {
      return (
        getCardManaValue(b) - getCardManaValue(a) ||
        getCardNameValue(a).localeCompare(getCardNameValue(b))
      );
    }

    return (
      getCardRarityValue(b) - getCardRarityValue(a) ||
      getCardNameValue(a).localeCompare(getCardNameValue(b))
    );
  }

  function moveSideboardPaletteCardsToEnd() {
    if (!sideboardList) {
      return;
    }

    const paletteCards = Array.from(
      sideboardList.querySelectorAll(
        ".deckbuilder-card[data-is-land-palette='1']",
      ),
    );

    paletteCards.forEach(function (cardElement) {
      sideboardList.appendChild(cardElement);
    });
  }

  function sortDeckbuilderZone(listElement) {
    if (
      !listElement ||
      (deckbuilderViewMode === "stack" && listElement === deckList)
    ) {
      return;
    }

    const paletteCards = Array.from(
      listElement.querySelectorAll(
        ".deckbuilder-card[data-is-land-palette='1']",
      ),
    );
    const normalCards = getDeckbuilderCards(listElement).sort(
      compareDeckbuilderCards,
    );

    listElement.innerHTML = "";

    normalCards.forEach(function (cardElement) {
      listElement.appendChild(cardElement);
    });

    paletteCards.forEach(function (cardElement) {
      listElement.appendChild(cardElement);
    });
  }

  function sortDeckbuilderZones() {
    sortDeckbuilderZone(deckList);
    sortDeckbuilderZone(sideboardList);
    applySideboardFilters();
    applyDeckFilters();
    moveSideboardPaletteCardsToEnd();
  }

  function getSideboardFilterValues() {
    return {
      searchText: String(sideboardFilterText ? sideboardFilterText.value : "")
        .trim()
        .toLowerCase(),
      rarity: String(sideboardFilterRarity ? sideboardFilterRarity.value : "")
        .trim()
        .toLowerCase(),
      color: String(
        sideboardFilterColor ? sideboardFilterColor.value : "",
      ).trim(),
      manaOperator: String(
        sideboardFilterManaOperator ? sideboardFilterManaOperator.value : "",
      ).trim(),
      manaValue:
        sideboardFilterManaValue && sideboardFilterManaValue.value !== ""
          ? parseFloat(sideboardFilterManaValue.value)
          : null,
      type: String(sideboardFilterType ? sideboardFilterType.value : "")
        .trim()
        .toLowerCase(),
      alternateImage: String(
        sideboardFilterAlternateImage
          ? sideboardFilterAlternateImage.value
          : "",
      )
        .trim()
        .toLowerCase(),
    };
  }

  function hasActiveSideboardFilters() {
    const filters = getSideboardFilterValues();

    return Boolean(
      filters.searchText ||
      filters.rarity ||
      filters.color ||
      filters.manaOperator ||
      Number.isFinite(filters.manaValue) ||
      filters.type ||
      filters.alternateImage,
    );
  }

  function parseDeckbuilderColorIdentity(rawValue) {
    try {
      const parsedValue = JSON.parse(rawValue || "[]");

      if (!Array.isArray(parsedValue)) {
        return [];
      }

      return parsedValue
        .map(function (colorValue) {
          return String(colorValue || "")
            .trim()
            .toUpperCase();
        })
        .filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  function getDeckbuilderFilterSearchBlob(cardElement) {
    return [
      cardElement.dataset.cardName || "",
      cardElement.dataset.cardTypeLine || "",
      cardElement.dataset.cardSetCode || "",
      cardElement.dataset.cardCollectorNumber || "",
      cardElement.dataset.cardRarity || "",
    ]
      .join(" ")
      .toLowerCase();
  }

  function deckbuilderCardMatchesColorFilter(cardElement, colorFilter) {
    if (!colorFilter) {
      return true;
    }

    const colorIdentity = parseDeckbuilderColorIdentity(
      cardElement.dataset.cardColorIdentity || "[]",
    );

    if (colorFilter === "colorless") {
      return colorIdentity.length === 0;
    }

    if (colorFilter === "multi") {
      return colorIdentity.length >= 2;
    }

    return colorIdentity.indexOf(colorFilter) !== -1;
  }

  function deckbuilderCardMatchesAlternateImageFilter(
    cardElement,
    alternateImageFilter,
  ) {
    if (!alternateImageFilter) {
      return true;
    }

    const hasAlternateImage = cardElement.dataset.hasAlternateImage === "1";
    const removeBleed = cardElement.dataset.alternateImageRemoveBleed === "1";

    if (alternateImageFilter === "yes") {
      return hasAlternateImage;
    }

    if (alternateImageFilter === "no") {
      return !hasAlternateImage;
    }

    if (alternateImageFilter === "remove_bleed") {
      return hasAlternateImage && removeBleed;
    }

    if (alternateImageFilter === "no_remove_bleed") {
      return hasAlternateImage && !removeBleed;
    }

    return true;
  }

  function deckbuilderCardMatchesManaFilter(
    cardElement,
    manaOperator,
    manaValue,
  ) {
    if (!manaOperator && !Number.isFinite(manaValue)) {
      return true;
    }

    if (!manaOperator || !Number.isFinite(manaValue)) {
      return true;
    }

    const cardManaValue = parseFloat(cardElement.dataset.cardManaValue || "");

    if (!Number.isFinite(cardManaValue)) {
      return false;
    }

    if (manaOperator === "eq") {
      return cardManaValue === manaValue;
    }

    if (manaOperator === "lte") {
      return cardManaValue <= manaValue;
    }

    if (manaOperator === "gte") {
      return cardManaValue >= manaValue;
    }

    return true;
  }

  function deckbuilderCardMatchesSideboardFilters(cardElement) {
    const filters = getSideboardFilterValues();

    if (cardElement.dataset.isLandPalette === "1") {
      return !hasActiveSideboardFilters();
    }

    if (
      filters.searchText &&
      getDeckbuilderFilterSearchBlob(cardElement).indexOf(
        filters.searchText,
      ) === -1
    ) {
      return false;
    }

    if (
      filters.rarity &&
      String(cardElement.dataset.cardRarity || "").toLowerCase() !==
        filters.rarity
    ) {
      return false;
    }

    if (!deckbuilderCardMatchesColorFilter(cardElement, filters.color)) {
      return false;
    }

    if (
      !deckbuilderCardMatchesManaFilter(
        cardElement,
        filters.manaOperator,
        filters.manaValue,
      )
    ) {
      return false;
    }

    if (
      filters.type &&
      String(cardElement.dataset.cardTypeLine || "")
        .toLowerCase()
        .indexOf(filters.type) === -1
    ) {
      return false;
    }

    if (
      !deckbuilderCardMatchesAlternateImageFilter(
        cardElement,
        filters.alternateImage,
      )
    ) {
      return false;
    }

    return true;
  }

  function applySideboardFilters() {
    if (!sideboardList) {
      return;
    }

    const sideboardCards = getAllVisibleDeckbuilderCards(sideboardList);
    let visibleCount = 0;
    let normalCardCount = 0;

    sideboardCards.forEach(function (cardElement) {
      const isPaletteCard = cardElement.dataset.isLandPalette === "1";
      const matchesFilter = deckbuilderCardMatchesSideboardFilters(cardElement);

      if (!isPaletteCard) {
        normalCardCount += 1;
      }

      cardElement.classList.toggle("hidden", !matchesFilter);

      if (matchesFilter && !isPaletteCard) {
        visibleCount += 1;
      }
    });

    if (sideboardFilterStatus) {
      if (hasActiveSideboardFilters()) {
        sideboardFilterStatus.textContent =
          "Showing " +
          visibleCount +
          " of " +
          normalCardCount +
          " sideboard card(s).";
      } else {
        sideboardFilterStatus.textContent = "Showing all sideboard cards.";
      }
    }
  }

  function setSideboardFilterPanelVisible(isVisible) {
    sideboardFiltersVisible = Boolean(isVisible);

    if (sideboardFilterPanel) {
      sideboardFilterPanel.classList.toggle("hidden", !sideboardFiltersVisible);
      sideboardFilterPanel.setAttribute(
        "aria-hidden",
        sideboardFiltersVisible ? "false" : "true",
      );
    }

    if (sideboardFilterButton) {
      sideboardFilterButton.classList.toggle(
        "campaign-test-draft-zone-view-button-active",
        sideboardFiltersVisible,
      );
      sideboardFilterButton.setAttribute(
        "aria-expanded",
        sideboardFiltersVisible ? "true" : "false",
      );
    }
  }

  function setDeckbuilderSideboardCollapsed(isCollapsed) {
    const collapsed = Boolean(isCollapsed);

    if (!deckbuilderMain) {
      return;
    }

    deckbuilderMain.classList.toggle(
      "deckbuilder-sideboard-collapsed",
      collapsed,
    );

    if (sideboardCollapseButton) {
      sideboardCollapseButton.setAttribute(
        "aria-expanded",
        collapsed ? "false" : "true",
      );

      sideboardCollapseButton.setAttribute(
        "aria-label",
        collapsed ? "Expand Sideboard" : "Collapse Sideboard",
      );

      sideboardCollapseButton.title = collapsed
        ? "Expand Sideboard"
        : "Collapse Sideboard";
    }

    if (sideboardCollapsedButton) {
      sideboardCollapsedButton.classList.toggle("hidden", !collapsed);
    }

    if (collapsed) {
      setSideboardFilterPanelVisible(false);
    }
  }

  function clearSideboardFilters() {
    if (sideboardFilterText) {
      sideboardFilterText.value = "";
    }

    if (sideboardFilterRarity) {
      sideboardFilterRarity.value = "";
    }

    if (sideboardFilterColor) {
      sideboardFilterColor.value = "";
    }

    if (sideboardFilterManaOperator) {
      sideboardFilterManaOperator.value = "";
    }

    if (sideboardFilterManaValue) {
      sideboardFilterManaValue.value = "";
    }

    if (sideboardFilterType) {
      sideboardFilterType.value = "";
    }

    if (sideboardFilterAlternateImage) {
      sideboardFilterAlternateImage.value = "";
    }

    applySideboardFilters();
    applyDeckFilters();
  }

  function getDeckFilterValues() {
    return {
      searchText: String(deckFilterText ? deckFilterText.value : "")
        .trim()
        .toLowerCase(),
      rarity: String(deckFilterRarity ? deckFilterRarity.value : "")
        .trim()
        .toLowerCase(),
      color: String(deckFilterColor ? deckFilterColor.value : "").trim(),
      manaOperator: String(
        deckFilterManaOperator ? deckFilterManaOperator.value : "",
      ).trim(),
      manaValue:
        deckFilterManaValue && deckFilterManaValue.value !== ""
          ? parseFloat(deckFilterManaValue.value)
          : null,
      type: String(deckFilterType ? deckFilterType.value : "")
        .trim()
        .toLowerCase(),
      alternateImage: String(
        deckFilterAlternateImage ? deckFilterAlternateImage.value : "",
      )
        .trim()
        .toLowerCase(),
    };
  }

  function hasActiveDeckFilters() {
    const filters = getDeckFilterValues();

    return Boolean(
      filters.searchText ||
      filters.rarity ||
      filters.color ||
      filters.manaOperator ||
      Number.isFinite(filters.manaValue) ||
      filters.type ||
      filters.alternateImage,
    );
  }

  function deckbuilderCardMatchesDeckFilters(cardElement) {
    const filters = getDeckFilterValues();

    if (
      filters.searchText &&
      getDeckbuilderFilterSearchBlob(cardElement).indexOf(
        filters.searchText,
      ) === -1
    ) {
      return false;
    }

    if (
      filters.rarity &&
      String(cardElement.dataset.cardRarity || "").toLowerCase() !==
        filters.rarity
    ) {
      return false;
    }

    if (!deckbuilderCardMatchesColorFilter(cardElement, filters.color)) {
      return false;
    }

    if (
      !deckbuilderCardMatchesManaFilter(
        cardElement,
        filters.manaOperator,
        filters.manaValue,
      )
    ) {
      return false;
    }

    if (
      filters.type &&
      String(cardElement.dataset.cardTypeLine || "")
        .toLowerCase()
        .indexOf(filters.type) === -1
    ) {
      return false;
    }

    if (
      !deckbuilderCardMatchesAlternateImageFilter(
        cardElement,
        filters.alternateImage,
      )
    ) {
      return false;
    }

    return true;
  }

  function applyDeckFilters() {
    if (!deckList) {
      return;
    }

    const deckCards = getDeckbuilderCards(deckList);
    let visibleCount = 0;
    let normalCardCount = 0;

    deckCards.forEach(function (cardElement) {
      const matchesFilter = deckbuilderCardMatchesDeckFilters(cardElement);

      normalCardCount += 1;
      cardElement.classList.toggle("hidden", !matchesFilter);

      if (matchesFilter) {
        visibleCount += 1;
      }
    });

    if (deckFilterStatus) {
      if (hasActiveDeckFilters()) {
        deckFilterStatus.textContent =
          "Showing " +
          visibleCount +
          " of " +
          normalCardCount +
          " deck card(s).";
      } else {
        deckFilterStatus.textContent = "Showing all deck cards.";
      }
    }
  }

  function setDeckFilterPanelVisible(isVisible) {
    deckFiltersVisible = Boolean(isVisible);

    if (deckFilterPanel) {
      deckFilterPanel.classList.toggle("hidden", !deckFiltersVisible);
      deckFilterPanel.setAttribute(
        "aria-hidden",
        deckFiltersVisible ? "false" : "true",
      );
    }

    if (deckFilterButton) {
      deckFilterButton.classList.toggle(
        "campaign-test-draft-zone-view-button-active",
        deckFiltersVisible,
      );
      deckFilterButton.setAttribute(
        "aria-expanded",
        deckFiltersVisible ? "true" : "false",
      );
    }
  }

  function clearDeckFilters() {
    if (deckFilterText) {
      deckFilterText.value = "";
    }

    if (deckFilterRarity) {
      deckFilterRarity.value = "";
    }

    if (deckFilterColor) {
      deckFilterColor.value = "";
    }

    if (deckFilterManaOperator) {
      deckFilterManaOperator.value = "";
    }

    if (deckFilterManaValue) {
      deckFilterManaValue.value = "";
    }

    if (deckFilterType) {
      deckFilterType.value = "";
    }

    if (deckFilterAlternateImage) {
      deckFilterAlternateImage.value = "";
    }

    applyDeckFilters();
  }

  function updateCounts() {
    if (deckCount) {
      deckCount.textContent = String(getDeckbuilderCards(deckList).length);
    }

    if (sideboardCount) {
      sideboardCount.textContent = String(
        getDeckbuilderCards(sideboardList).length,
      );
    }
  }

  function setDeckbuilderStatsModalVisible(isVisible) {
    if (!statsModal) {
      return;
    }

    statsModal.classList.toggle("hidden", !isVisible);
    statsModal.setAttribute("aria-hidden", isVisible ? "false" : "true");

    if (isVisible) {
      updateDeckbuilderStatsModal();
    }
  }

  function openDeckbuilderStatsModal() {
    hideHoverPreview();
    setDeckbuilderCopyMenuOpen(false);
    setDeckbuilderContextMenuOpen(false);
    setLandPaletteContextMenuOpen(false);
    setDeckbuilderStatsModalVisible(true);
  }

  function closeDeckbuilderStatsModal() {
    setDeckbuilderStatsModalVisible(false);
  }

  function getDeckbuilderStatsCards() {
    return getDeckbuilderCards(deckList).map(function (cardElement) {
      const colorIdentity = parseDeckbuilderColorIdentity(
        cardElement.dataset.cardColorIdentity || "[]",
      );
      const typeLine = String(cardElement.dataset.cardTypeLine || "").trim();
      const cardName = String(cardElement.dataset.cardName || "").trim();
      const manaValue = parseFloat(cardElement.dataset.cardManaValue || "");
      const rarity = String(cardElement.dataset.cardRarity || "")
        .trim()
        .toLowerCase();
      const isBasicLand = cardElement.dataset.isBasicLand === "1";

      return {
        cardName: cardName,
        colorIdentity: colorIdentity,
        typeLine: typeLine,
        manaValue: Number.isFinite(manaValue) ? manaValue : 0,
        rarity: rarity,
        isBasicLand: isBasicLand,
      };
    });
  }

  function getDeckbuilderPrimaryType(typeLine) {
    const cleanTypeLine = String(typeLine || "").toLowerCase();

    if (cleanTypeLine.indexOf("land") !== -1) {
      return "Land";
    }

    if (cleanTypeLine.indexOf("creature") !== -1) {
      return "Creature";
    }

    if (cleanTypeLine.indexOf("instant") !== -1) {
      return "Instant";
    }

    if (cleanTypeLine.indexOf("sorcery") !== -1) {
      return "Sorcery";
    }

    if (cleanTypeLine.indexOf("artifact") !== -1) {
      return "Artifact";
    }

    if (cleanTypeLine.indexOf("enchantment") !== -1) {
      return "Enchantment";
    }

    if (cleanTypeLine.indexOf("planeswalker") !== -1) {
      return "Planeswalker";
    }

    if (cleanTypeLine.indexOf("battle") !== -1) {
      return "Battle";
    }

    return "Other";
  }

  function getDeckbuilderStatsColorLabel(cardInfo) {
    const colors = cardInfo.colorIdentity || [];

    if (!colors.length) {
      return "Colorless";
    }

    if (colors.length >= 2) {
      return "Multicolor";
    }

    const colorSymbol = colors[0];

    if (colorSymbol === "W") {
      return "White";
    }

    if (colorSymbol === "U") {
      return "Blue";
    }

    if (colorSymbol === "B") {
      return "Black";
    }

    if (colorSymbol === "R") {
      return "Red";
    }

    if (colorSymbol === "G") {
      return "Green";
    }

    return "Colorless";
  }

  function incrementDeckbuilderStatsCount(counts, keyName) {
    const cleanKeyName = String(keyName || "").trim();

    if (!cleanKeyName) {
      return;
    }

    counts[cleanKeyName] = (counts[cleanKeyName] || 0) + 1;
  }

  function renderDeckbuilderStatsRows(containerElement, rows) {
    if (!containerElement) {
      return;
    }

    containerElement.innerHTML = "";

    rows.forEach(function (rowData) {
      const row = document.createElement("div");
      row.className = "custom-draft-stat-row";

      const label = document.createElement("span");
      label.textContent = rowData.label;

      const value = document.createElement("strong");
      value.textContent = String(rowData.value || 0);

      row.appendChild(label);
      row.appendChild(value);
      containerElement.appendChild(row);
    });
  }

  function getDeckbuilderStatsCardsForSharedModal() {
    return getDeckbuilderCards(deckList).map(function (cardElement) {
      return {
        cardName: String(cardElement.dataset.cardName || "").trim(),
        colorIdentity: parseDeckbuilderColorIdentity(
          cardElement.dataset.cardColorIdentity || "[]",
        ),
        typeLine: String(cardElement.dataset.cardTypeLine || "").trim(),
        manaValue: cardElement.dataset.cardManaValue || "",
        rarity: String(cardElement.dataset.cardRarity || "")
          .trim()
          .toLowerCase(),
        isBasicLand: cardElement.dataset.isBasicLand === "1",
      };
    });
  }

  async function submitDeckbuilderAjax(actionUrl, formData) {
    const formEntries = {};

    try {
      formData.forEach(function (value, key) {
        formEntries[key] = value;
      });
    } catch (error) {
      formEntries._error = String(error);
    }

    writeDeckbuilderClientDebug("AJAX START", {
      actionUrl: actionUrl,
      formEntries: formEntries,
    });

    const response = await fetch(actionUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: formData,
    });

    const rawText = await response.text();
    let payload = null;

    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      writeDeckbuilderClientDebug("AJAX NON JSON RESPONSE", {
        actionUrl: actionUrl,
        status: response.status,
        ok: response.ok,
        rawText: rawText.slice(0, 1200),
      });

      console.error("DECKBUILDER AJAX NON-JSON RESPONSE", {
        actionUrl: actionUrl,
        status: response.status,
        ok: response.ok,
        rawText: rawText.slice(0, 1200),
      });

      throw new Error(
        "Deck update failed because the server did not return JSON.",
      );
    }

    writeDeckbuilderClientDebug("AJAX RESPONSE", {
      actionUrl: actionUrl,
      status: response.status,
      ok: response.ok,
      payloadOk: payload ? payload.ok : null,
      debug: payload ? payload.debug : null,
      basicLandCounts: payload ? payload.basic_land_counts : null,
      humanDeckCardCount:
        payload && payload.human_deck_cards
          ? payload.human_deck_cards.length
          : null,
    });

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Deck update failed.");
    }

    return payload;
  }

  async function movePickedCardToZone(pickId, targetZone) {
    if (!moveZoneUrl) {
      throw new Error("Draft move URL was not configured for this deck.");
    }

    const formData = new FormData();
    formData.append("draft_test_pick_id", pickId || "");
    formData.append("deck_zone", targetZone || "deck");

    return submitDeckbuilderAjax(moveZoneUrl, formData);
  }

  async function updateBasicLand(landName, action) {
    const formData = new FormData();
    formData.append("land_name", landName || "");
    formData.append("action", action || "add");

    return submitDeckbuilderAjax(basicLandUrl, formData);
  }

  function getDeckbuilderCssNumber(variableName, fallbackValue) {
    const rawValue = getComputedStyle(workspace)
      .getPropertyValue(variableName)
      .trim();
    const parsedValue = parseFloat(rawValue);

    return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
  }

  function setLoadDeckModalVisible(isVisible) {
    if (!loadDeckModal) {
      return;
    }

    loadDeckModal.classList.toggle("hidden", !isVisible);
    loadDeckModal.setAttribute("aria-hidden", isVisible ? "false" : "true");
  }

  function renderLoadDeckRows(decks) {
    if (!loadDeckList) {
      return;
    }

    if (!decks || !decks.length) {
      loadDeckList.innerHTML =
        '<div class="deckbuilder-load-deck-empty">No saved decks found.</div>';
      return;
    }

    loadDeckList.innerHTML = decks
      .map(function (deck) {
        const deckName = deck.deck_name || "Untitled Deck";
        const deckFormat = deck.deck_format || "Deck";
        const sourceText =
          deck.source_label ||
          (deck.source_type === "draft_test"
            ? "Draft Test #" + escapeHtml(deck.source_id || "")
            : escapeHtml(deck.source_type || "Deck"));
        const updatedText = deck.updated_at_utc || "";

        return (
          '<a class="deckbuilder-load-deck-row" href="' +
          escapeHtml(deck.load_url || "#") +
          '">' +
          '<div class="deckbuilder-load-deck-main">' +
          '<div class="deckbuilder-load-deck-name">' +
          escapeHtml(deckName) +
          "</div>" +
          '<div class="deckbuilder-load-deck-meta">' +
          escapeHtml(deckFormat) +
          " • " +
          sourceText +
          (updatedText ? " • Updated " + escapeHtml(updatedText) : "") +
          "</div>" +
          "</div>" +
          '<div class="deckbuilder-load-deck-action">Open</div>' +
          "</a>"
        );
      })
      .join("");
  }

  async function loadSavedDeckRows() {
    if (!loadDecksUrl) {
      throw new Error("Load Deck URL was not configured.");
    }

    const searchText = String(
      loadDeckSearchInput ? loadDeckSearchInput.value : "",
    ).trim();
    const requestUrl =
      loadDecksUrl + "?search_text=" + encodeURIComponent(searchText);

    if (loadDeckStatus) {
      loadDeckStatus.textContent = "Loading saved decks...";
      loadDeckStatus.classList.remove("deckbuilder-load-deck-status-error");
    }

    const response = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    const payload = await response.json();

    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Could not load saved decks.");
    }

    renderLoadDeckRows(payload.decks || []);

    if (loadDeckStatus) {
      loadDeckStatus.textContent =
        "Showing " + String(payload.count || 0) + " saved deck(s).";
    }
  }

  function openLoadDeckModal() {
    setLoadDeckModalVisible(true);

    loadSavedDeckRows().catch(function (error) {
      if (loadDeckStatus) {
        loadDeckStatus.textContent =
          error.message || "Could not load saved decks.";
        loadDeckStatus.classList.add("deckbuilder-load-deck-status-error");
      }

      showDeckbuilderError(error);
    });
  }

  function closeLoadDeckModal() {
    setLoadDeckModalVisible(false);
  }

  function setDeleteDeckModalVisible(isVisible) {
    if (!deleteDeckModal) {
      return;
    }

    deleteDeckModal.classList.toggle("hidden", !isVisible);
    deleteDeckModal.setAttribute("aria-hidden", isVisible ? "false" : "true");

    if (isVisible) {
      const cleanDeckName =
        String(deckNameInput ? deckNameInput.value : "").trim() ||
        "Untitled Deck";

      if (deleteDeckName) {
        deleteDeckName.textContent = cleanDeckName;
      }

      if (deleteDeckConfirmInput) {
        deleteDeckConfirmInput.value = "";
        window.setTimeout(function () {
          deleteDeckConfirmInput.focus();
        }, 60);
      }

      updateDeleteDeckConfirmState();
    }
  }

  function openDeleteDeckModal() {
    setDeleteDeckModalVisible(true);
  }

  function closeDeleteDeckModal() {
    setDeleteDeckModalVisible(false);
  }

  function updateDeleteDeckConfirmState() {
    const confirmText = String(
      deleteDeckConfirmInput ? deleteDeckConfirmInput.value : "",
    ).trim();

    if (deleteDeckConfirmButton) {
      deleteDeckConfirmButton.disabled = confirmText !== "DELETE";
    }
  }

  function refreshDeckbuilderDeckArt() {
    const deckArtImage = document.getElementById("deckbuilderDeckArtImage");

    if (!deckArtImage) {
      return;
    }

    const artUrl = new URL(deckArtImage.src, window.location.origin);

    artUrl.searchParams.set("_art", String(Date.now()));

    deckArtImage.src = artUrl.toString();
  }

  async function saveDeckSettings() {
    if (!saveDeckUrl) {
      showDeckbuilderError(new Error("Save Deck URL was not configured."));
      return;
    }

    const cleanDeckName = String(
      deckNameInput ? deckNameInput.value : "",
    ).trim();
    const cleanDeckFormat = deckTypeSelect ? deckTypeSelect.value : "Standard";

    if (!cleanDeckName) {
      showDeckbuilderError(new Error("Deck Name is required."));
      return;
    }

    const formData = new FormData();

    formData.append("deck_name", cleanDeckName);
    formData.append("deck_format", cleanDeckFormat);
    formData.append("view_mode", deckbuilderViewMode || "grid");
    formData.append("sort_mode", pickedSortMode || "rarity-desc");
    formData.append("card_size", String(deckbuilderCardSize || 100));
    formData.append(
      "sideboard_flex",
      String(getDeckbuilderCssNumber("--deckbuilder-sideboard-flex", 0.4)),
    );
    formData.append(
      "deck_flex",
      String(getDeckbuilderCssNumber("--deckbuilder-deck-flex", 0.6)),
    );

    if (saveDeckButton) {
      saveDeckButton.disabled = true;
      saveDeckButton.classList.add("deckbuilder-header-icon-button-working");
    }

    try {
      const payload = await submitDeckbuilderAjax(saveDeckUrl, formData);

      if (deckNameInput && payload.deck_name) {
        deckNameInput.value = payload.deck_name;
      }

      if (deckTypeSelect && payload.deck_format) {
        deckTypeSelect.value = payload.deck_format;

        updateDeckbuilderDeckTypeSummary(payload.deck_format);
      } else {
        updateDeckbuilderDeckTypeSummary(cleanDeckFormat);
      }

      refreshDeckbuilderDeckArt();

      if (window.iMomirToast) {
        window.iMomirToast.success(payload.message || "Deck saved.");
      } else {
        window.alert(payload.message || "Deck saved.");
      }
    } catch (error) {
      showDeckbuilderError(error);
    } finally {
      if (saveDeckButton) {
        saveDeckButton.disabled = false;
        saveDeckButton.classList.remove(
          "deckbuilder-header-icon-button-working",
        );
      }
    }
  }

  async function deleteCurrentDeck() {
    if (!deleteDeckUrl) {
      showDeckbuilderError(new Error("Delete Deck URL was not configured."));
      return;
    }

    const confirmText = String(
      deleteDeckConfirmInput ? deleteDeckConfirmInput.value : "",
    ).trim();

    if (confirmText !== "DELETE") {
      showDeckbuilderError(
        new Error("Type DELETE to confirm deleting this deck."),
      );
      updateDeleteDeckConfirmState();
      return;
    }

    const formData = new FormData();

    if (deleteDeckButton) {
      deleteDeckButton.disabled = true;
      deleteDeckButton.classList.add("deckbuilder-header-icon-button-working");
    }

    if (deleteDeckConfirmButton) {
      deleteDeckConfirmButton.disabled = true;
      deleteDeckConfirmButton.textContent = "Deleting...";
    }

    try {
      const payload = await submitDeckbuilderAjax(deleteDeckUrl, formData);

      if (window.iMomirToast) {
        window.iMomirToast.success(payload.message || "Deck deleted.");
      }

      window.location.href = payload.redirect_url || "/";
    } catch (error) {
      showDeckbuilderError(error);
    } finally {
      if (deleteDeckButton) {
        deleteDeckButton.disabled = false;
        deleteDeckButton.classList.remove(
          "deckbuilder-header-icon-button-working",
        );
      }

      if (deleteDeckConfirmButton) {
        deleteDeckConfirmButton.textContent = "Delete Deck";
        updateDeleteDeckConfirmState();
      }
    }
  }

  function normalizeBasicLandCounts(rawCounts) {
    const counts = {};

    Object.keys(rawCounts || {}).forEach(function (landName) {
      const cleanLandName = String(landName || "").trim();

      if (!cleanLandName) {
        return;
      }

      const parsedCount = parseInt(rawCounts[landName] || 0, 10);

      counts[cleanLandName] = Number.isFinite(parsedCount)
        ? Math.max(0, parsedCount)
        : 0;
    });

    return counts;
  }

  function getBasicLandCountTotal(counts) {
    return Object.keys(counts || {}).reduce(function (total, landName) {
      const parsedCount = parseInt(counts[landName] || 0, 10);

      return (
        total + (Number.isFinite(parsedCount) ? Math.max(0, parsedCount) : 0)
      );
    }, 0);
  }

  function getCurrentDeckBasicLandCounts() {
    const counts = {};

    if (!deckList) {
      return counts;
    }

    Array.from(
      deckList.querySelectorAll(".deckbuilder-card[data-is-basic-land='1']"),
    ).forEach(function (landElement) {
      const landName = String(landElement.dataset.cardName || "").trim();

      if (!landName) {
        return;
      }

      counts[landName] = (counts[landName] || 0) + 1;
    });

    return counts;
  }

  function setDeckbuilderBasicLandCounts(rawCounts) {
    deckbuilderBasicLandCounts = normalizeBasicLandCounts(rawCounts);
  }

  function getDeckbuilderBasicLandCounts() {
    return normalizeBasicLandCounts(deckbuilderBasicLandCounts);
  }

  function updateBasicLandCountsFromPayload(payload) {
    const counts =
      payload && payload.basic_land_counts
        ? normalizeBasicLandCounts(payload.basic_land_counts)
        : {};

    Array.from(document.querySelectorAll("[data-basic-land-count]")).forEach(
      function (countElement) {
        const landName = countElement.dataset.basicLandCount || "";
        countElement.textContent = String(counts[landName] || 0);
      },
    );
  }

  function getSafeDeckbuilderPayload(payload) {
    const safePayload = Object.assign({}, payload || {});
    const incomingCounts = normalizeBasicLandCounts(
      safePayload.basic_land_counts || {},
    );
    const cachedCounts = getDeckbuilderBasicLandCounts();
    const existingDomCounts = normalizeBasicLandCounts(
      getCurrentDeckBasicLandCounts(),
    );

    if (safePayload._basicLandCountsAuthoritative === true) {
      setDeckbuilderBasicLandCounts(incomingCounts);
      safePayload.basic_land_counts = getDeckbuilderBasicLandCounts();
      return safePayload;
    }

    if (getBasicLandCountTotal(cachedCounts) > 0) {
      safePayload.basic_land_counts = cachedCounts;
      return safePayload;
    }

    if (getBasicLandCountTotal(existingDomCounts) > 0) {
      setDeckbuilderBasicLandCounts(existingDomCounts);
      safePayload.basic_land_counts = getDeckbuilderBasicLandCounts();
      return safePayload;
    }

    safePayload.basic_land_counts = incomingCounts;
    return safePayload;
  }

  function getBasicLandPaletteElement(landName) {
    const cleanLandName = String(landName || "").toLowerCase();

    return (
      Array.from(
        document.querySelectorAll(
          ".deckbuilder-basic-land-card[data-is-land-palette='1']",
        ),
      ).find(function (landElement) {
        return (
          String(
            landElement.dataset.basicLandName ||
              landElement.dataset.cardName ||
              "",
          ).toLowerCase() === cleanLandName
        );
      }) || null
    );
  }

  function getBasicLandPaletteCardsFromDataset() {
    if (!sideboardList || !sideboardList.dataset.basicLandCards) {
      return [];
    }

    try {
      const parsedCards = JSON.parse(sideboardList.dataset.basicLandCards);

      return Array.isArray(parsedCards) ? parsedCards : [];
    } catch (error) {
      return [];
    }
  }

  function setBasicLandPaletteCardsToDataset(basicLandCards) {
    if (!sideboardList) {
      return;
    }

    sideboardList.dataset.basicLandCards = JSON.stringify(
      Array.isArray(basicLandCards) ? basicLandCards : [],
    );
  }

  function getBasicLandPaletteCardData(landName) {
    const cleanLandName = String(landName || "")
      .trim()
      .toLowerCase();

    if (!cleanLandName) {
      return null;
    }

    const datasetCards = getBasicLandPaletteCardsFromDataset();

    const datasetMatch = datasetCards.find(function (landCard) {
      return (
        String(landCard.card_name || "")
          .trim()
          .toLowerCase() === cleanLandName
      );
    });

    if (datasetMatch) {
      return datasetMatch;
    }

    const paletteElement = getBasicLandPaletteElement(landName);

    if (!paletteElement) {
      return null;
    }

    return {
      card_uuid: paletteElement.dataset.cardUuid || "",
      card_name: paletteElement.dataset.cardName || landName,
      image_src: paletteElement.dataset.cardImageSrc || "",
      rarity: paletteElement.dataset.cardRarity || "common",
      mana_value: paletteElement.dataset.cardManaValue || "0",
      type_line: paletteElement.dataset.cardTypeLine || "Basic Land",
      set_code: paletteElement.dataset.cardSetCode || "",
      collector_number: paletteElement.dataset.cardCollectorNumber || "",
    };
  }

  function forceBasicLandPrintingIntoPayload(payload, landName, cardUuid) {
    if (!payload || !landName || !cardUuid) {
      return payload;
    }

    const cleanLandName = String(landName || "").trim();
    const cleanLandKey = cleanLandName.toLowerCase();
    const imageSrc = window.iMomirImageUrl(
      "/chaos-card-image/" + encodeURIComponent(cardUuid),
    );

    const paletteCards = Array.isArray(payload.basic_land_cards)
      ? payload.basic_land_cards.slice()
      : getBasicLandPaletteCardsFromDataset().slice();

    let foundLand = false;

    const updatedPaletteCards = paletteCards.map(function (landCard) {
      const cardName = String(landCard.card_name || "").trim();

      if (cardName.toLowerCase() !== cleanLandKey) {
        return landCard;
      }

      foundLand = true;

      return Object.assign({}, landCard, {
        card_uuid: cardUuid,
        card_name: cardName || cleanLandName,
        image_src: imageSrc,
      });
    });

    if (!foundLand) {
      updatedPaletteCards.push({
        card_uuid: cardUuid,
        card_name: cleanLandName,
        image_src: imageSrc,
        rarity: "common",
        mana_value: 0,
        type_line: "Basic Land",
        set_code: "",
        collector_number: "",
      });
    }

    payload.basic_land_cards = updatedPaletteCards;
    payload._basicLandPaletteAuthoritative = true;

    setBasicLandPaletteCardsToDataset(updatedPaletteCards);

    return payload;
  }

  function getDeckbuilderVersionedImageUrl(imageUrl) {
    const cleanImageUrl = String(imageUrl || "").trim();

    if (!cleanImageUrl) {
      return "";
    }

    const separator = cleanImageUrl.indexOf("?") === -1 ? "?" : "&";

    return cleanImageUrl + separator + "v=" + Date.now();
  }

  function buildDeckBasicLandCardHtml(landName, landIndex) {
    const paletteCardData = getBasicLandPaletteCardData(landName);

    const cardName = paletteCardData
      ? paletteCardData.card_name || landName
      : landName;

    const cardUuid = paletteCardData ? paletteCardData.card_uuid || "" : "";

    const imageSrc = paletteCardData
      ? window.iMomirImageUrl(
          paletteCardData.image_src ||
            (cardUuid
              ? "/chaos-card-image/" + encodeURIComponent(cardUuid)
              : ""),
        )
      : "";

    const versionedImageSrc = getDeckbuilderVersionedImageUrl(imageSrc);

    const rarity = paletteCardData
      ? paletteCardData.rarity || "common"
      : "common";

    const manaValue = paletteCardData ? paletteCardData.mana_value || "0" : "0";

    const typeLine = paletteCardData
      ? paletteCardData.type_line || "Basic Land"
      : "Basic Land";

    const safeSyntheticId =
      "basic-land-" +
      String(cardName || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-") +
      "-" +
      String(landIndex || 0);

    return (
      '<div class="deckbuilder-card campaign-test-draft-picked-row" draggable="true" data-drag-type="picked-card" data-source-kind="basic_land" data-deck-card-id="" data-draft-test-pick-id="' +
      escapeHtml(safeSyntheticId) +
      '" data-current-zone="deck" data-card-name="' +
      escapeHtml(cardName) +
      '" data-card-uuid="' +
      escapeHtml(cardUuid) +
      '" data-card-rarity="' +
      escapeHtml(rarity) +
      '" data-card-mana-value="' +
      escapeHtml(manaValue) +
      '" data-card-type-line="' +
      escapeHtml(typeLine) +
      '" data-is-basic-land="1" data-is-foil="0" data-has-alternate-image="0" data-alternate-image-remove-bleed="0">' +
      (versionedImageSrc
        ? '<img src="' +
          escapeHtml(versionedImageSrc) +
          '" alt="' +
          escapeHtml(cardName) +
          '" class="campaign-test-draft-picked-thumb" loading="lazy" decoding="async">'
        : '<div class="deckbuilder-basic-land-missing-image">' +
          escapeHtml(cardName) +
          "</div>") +
      '<div class="campaign-test-draft-picked-main">' +
      '<div class="campaign-test-draft-picked-name">' +
      escapeHtml(cardName) +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function reconcileDeckBasicLandsFromPayload(payload) {
    writeDeckbuilderClientDebug("RECONCILE BASIC LANDS ENTER", {
      hasDeckList: Boolean(deckList),
      hasPayload: Boolean(payload),
      basicLandCounts: payload ? payload.basic_land_counts : null,
      deckCardCountBefore: getDeckbuilderCards(deckList).length,
    });

    if (!deckList || !payload || !payload.basic_land_counts) {
      writeDeckbuilderClientDebug("RECONCILE BASIC LANDS EXIT EARLY", {
        hasDeckList: Boolean(deckList),
        hasPayload: Boolean(payload),
        hasBasicLandCounts: Boolean(payload && payload.basic_land_counts),
      });

      return;
    }

    Array.from(
      deckList.querySelectorAll(".deckbuilder-card[data-is-basic-land='1']"),
    ).forEach(function (landElement) {
      landElement.remove();
    });

    Array.from(
      deckList.querySelectorAll(".campaign-test-draft-zone-empty"),
    ).forEach(function (emptyElement) {
      emptyElement.remove();
    });

    const landNames = Object.keys(payload.basic_land_counts || {});

    landNames.forEach(function (landName) {
      const landCount = parseInt(payload.basic_land_counts[landName] || 0, 10);

      if (!Number.isFinite(landCount) || landCount <= 0) {
        return;
      }

      for (let landIndex = 0; landIndex < landCount; landIndex += 1) {
        deckList.insertAdjacentHTML(
          "beforeend",
          buildDeckBasicLandCardHtml(landName, landIndex),
        );
      }
    });

    bindDragSources();
    bindHoverPreviews();

    if (deckbuilderViewMode === "stack") {
      buildStackColumnsForZone(deckList);
    }

    writeDeckbuilderClientDebug("RECONCILE BASIC LANDS EXIT", {
      deckCardCountAfter: getDeckbuilderCards(deckList).length,
      deckHtmlAfter: deckList ? deckList.innerHTML.slice(0, 1200) : "",
    });
  }

  function isDeckbuilderTruthyFlag(value) {
    return (
      value === true ||
      value === 1 ||
      value === "1" ||
      String(value || "").toLowerCase() === "true"
    );
  }

  function isDeckbuilderMissingFilterValue(value) {
    return (
      value === undefined ||
      value === null ||
      value === "" ||
      String(value).toLowerCase() === "null" ||
      String(value).toLowerCase() === "undefined"
    );
  }

  function getDeckbuilderExistingFilterMetadata() {
    const lookup = {
      byDeckCardId: {},
      byCardUuid: {},
    };

    Array.from(
      document.querySelectorAll(
        ".deckbuilder-card:not([data-is-land-palette='1'])",
      ),
    ).forEach(function (cardElement) {
      const deckCardId = String(cardElement.dataset.deckCardId || "").trim();
      const cardUuid = String(cardElement.dataset.cardUuid || "").trim();

      const metadata = {
        rarity: cardElement.dataset.cardRarity || "",
        manaValue: cardElement.dataset.cardManaValue || "",
        typeLine: cardElement.dataset.cardTypeLine || "",
        colorIdentityJson: cardElement.dataset.cardColorIdentity || "[]",
        setCode: cardElement.dataset.cardSetCode || "",
        collectorNumber: cardElement.dataset.cardCollectorNumber || "",
        hasAlternateImage: cardElement.dataset.hasAlternateImage || "0",
        alternateImageRemoveBleed:
          cardElement.dataset.alternateImageRemoveBleed || "0",
      };

      if (deckCardId) {
        lookup.byDeckCardId[deckCardId] = metadata;
      }

      if (cardUuid) {
        lookup.byCardUuid[cardUuid] = metadata;
      }
    });

    return lookup;
  }

  function normalizeDeckbuilderPayloadCardFilterData(
    card,
    existingFilterMetadata,
  ) {
    const normalizedCard = Object.assign({}, card || {});
    const deckCardId = String(normalizedCard.deck_card_id || "").trim();
    const cardUuid = String(normalizedCard.card_uuid || "").trim();

    const existingMetadata =
      deckCardId && existingFilterMetadata.byDeckCardId[deckCardId]
        ? existingFilterMetadata.byDeckCardId[deckCardId]
        : cardUuid && existingFilterMetadata.byCardUuid[cardUuid]
          ? existingFilterMetadata.byCardUuid[cardUuid]
          : null;

    if (!existingMetadata) {
      return normalizedCard;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.rarity)) {
      normalizedCard.rarity = existingMetadata.rarity;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.mana_value)) {
      normalizedCard.mana_value = existingMetadata.manaValue;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.type_line)) {
      normalizedCard.type_line = existingMetadata.typeLine;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.color_identity_json)) {
      normalizedCard.color_identity_json = existingMetadata.colorIdentityJson;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.set_code)) {
      normalizedCard.set_code = existingMetadata.setCode;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.collector_number)) {
      normalizedCard.collector_number = existingMetadata.collectorNumber;
    }

    if (isDeckbuilderMissingFilterValue(normalizedCard.has_alternate_image)) {
      normalizedCard.has_alternate_image = existingMetadata.hasAlternateImage;
    }

    if (
      isDeckbuilderMissingFilterValue(
        normalizedCard.alternate_image_remove_bleed,
      )
    ) {
      normalizedCard.alternate_image_remove_bleed =
        existingMetadata.alternateImageRemoveBleed;
    }

    return normalizedCard;
  }

  function normalizeDeckbuilderPayloadCardsForFilters(
    cards,
    existingFilterMetadata,
  ) {
    return (cards || []).map(function (card) {
      return normalizeDeckbuilderPayloadCardFilterData(
        card,
        existingFilterMetadata,
      );
    });
  }

  function renderDeckbuilderCard(card, targetZone) {
    const safeCard = card || {};
    const isBasicLand = isDeckbuilderTruthyFlag(safeCard.is_basic_land);
    const isFoil = isDeckbuilderTruthyFlag(safeCard.sheet_is_foil);
    const hasAlternateImage = isDeckbuilderTruthyFlag(
      safeCard.has_alternate_image,
    );
    const alternateImageRemoveBleed = isDeckbuilderTruthyFlag(
      safeCard.alternate_image_remove_bleed,
    );
    const sourceKind =
      safeCard.source_kind || (isBasicLand ? "basic_land" : "deck_card");
    const deckRole = String(safeCard.deck_role || "main")
      .trim()
      .toLowerCase();

    return (
      '<div class="deckbuilder-card campaign-test-draft-picked-row" draggable="true" data-drag-type="picked-card" data-source-kind="' +
      escapeHtml(sourceKind) +
      '" data-deck-card-id="' +
      escapeHtml(safeCard.deck_card_id || "") +
      '" data-draft-test-pick-id="' +
      escapeHtml(safeCard.draft_test_pick_id || "") +
      '" data-current-zone="' +
      escapeHtml(targetZone) +
      '" data-card-name="' +
      escapeHtml(safeCard.card_name || "") +
      '" data-card-uuid="' +
      escapeHtml(safeCard.card_uuid || "") +
      '" data-card-rarity="' +
      escapeHtml(safeCard.rarity || "") +
      '" data-card-mana-value="' +
      escapeHtml(safeCard.mana_value ?? "") +
      '" data-card-type-line="' +
      escapeHtml(safeCard.type_line || "") +
      '" data-card-color-identity="' +
      escapeHtml(safeCard.color_identity_json || "[]") +
      '" data-card-set-code="' +
      escapeHtml(safeCard.set_code || "") +
      '" data-card-collector-number="' +
      escapeHtml(safeCard.collector_number || "") +
      '" data-is-basic-land="' +
      escapeHtml(isBasicLand ? "1" : "0") +
      '" data-is-foil="' +
      escapeHtml(isFoil ? "1" : "0") +
      '" data-deck-role="' +
      escapeHtml(deckRole || "main") +
      '" data-has-alternate-image="' +
      escapeHtml(hasAlternateImage ? "1" : "0") +
      '" data-alternate-image-remove-bleed="' +
      escapeHtml(alternateImageRemoveBleed ? "1" : "0") +
      '" data-stack-column="' +
      escapeHtml(safeCard.stack_column || "") +
      '" data-stack-order="' +
      escapeHtml(safeCard.stack_order ?? "") +
      '">' +
      '<div class="deckbuilder-card-image-wrap">' +
      '<img src="' +
      escapeHtml(safeCard.image_src || "") +
      '" alt="' +
      escapeHtml(safeCard.card_name || "") +
      '" class="campaign-test-draft-picked-thumb" loading="lazy" decoding="async">' +
      "</div>" +
      '<div class="campaign-test-draft-picked-main">' +
      '<div class="campaign-test-draft-picked-name">' +
      escapeHtml(safeCard.card_name || "") +
      "</div>" +
      (deckRole === "commander"
        ? '<div class="deckbuilder-card-meta-badge deckbuilder-card-role-badge">Commander</div>'
        : "") +
      (deckRole === "partner"
        ? '<div class="deckbuilder-card-meta-badge deckbuilder-card-role-badge">Partner</div>'
        : "") +
      (isFoil
        ? '<div class="deckbuilder-card-meta-badge deckbuilder-card-foil-badge">Foil</div>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  function buildBasicLandPaletteCardHtml(landCard) {
    const cardUuid = landCard.card_uuid || "";
    const cardName = landCard.card_name || "";

    const imageSrc = window.iMomirImageUrl(
      landCard.image_src ||
        (cardUuid ? "/chaos-card-image/" + encodeURIComponent(cardUuid) : ""),
    );

    const versionedImageSrc = getDeckbuilderVersionedImageUrl(imageSrc);

    return (
      '<div class="deckbuilder-card deckbuilder-basic-land-card" draggable="true" data-drag-type="basic-land" data-is-land-palette="1" data-basic-land-name="' +
      escapeHtml(cardName) +
      '" data-current-zone="sideboard" data-card-name="' +
      escapeHtml(cardName) +
      '" data-card-uuid="' +
      escapeHtml(cardUuid) +
      '" data-card-image-src="' +
      escapeHtml(imageSrc) +
      '" data-card-rarity="' +
      escapeHtml(landCard.rarity || "common") +
      '" data-card-mana-value="' +
      escapeHtml(landCard.mana_value ?? 0) +
      '" data-card-type-line="' +
      escapeHtml(landCard.type_line || "Basic Land") +
      '" data-card-set-code="' +
      escapeHtml(landCard.set_code || "") +
      '" data-card-collector-number="' +
      escapeHtml(landCard.collector_number || "") +
      '">' +
      (versionedImageSrc
        ? '<img src="' +
          escapeHtml(versionedImageSrc) +
          '" alt="' +
          escapeHtml(cardName) +
          '" class="campaign-test-draft-picked-thumb" loading="lazy" decoding="async">'
        : '<div class="deckbuilder-basic-land-missing-image">' +
          escapeHtml(cardName) +
          "</div>") +
      '<div class="deckbuilder-basic-land-infinite">∞</div>' +
      "</div>"
    );
  }

  function getBasicLandPaletteHtml(basicLandCards) {
    if (basicLandCards && basicLandCards.length) {
      return basicLandCards.map(buildBasicLandPaletteCardHtml).join("");
    }

    if (!basicLandPaletteTemplate) {
      return "";
    }

    return basicLandPaletteTemplate.innerHTML || "";
  }

  function renderDeckbuilderZone(listElement, cards, emptyText, targetZone) {
    if (!listElement) {
      return;
    }

    const hasCards = cards && cards.length;

    const cardHtml = hasCards
      ? cards
          .map(function (card) {
            return renderDeckbuilderCard(card, targetZone);
          })
          .join("")
      : "";

    if (targetZone === "sideboard") {
      const basicLandCards = listElement.dataset.basicLandCards
        ? JSON.parse(listElement.dataset.basicLandCards)
        : null;

      listElement.innerHTML =
        cardHtml + getBasicLandPaletteHtml(basicLandCards);
      return;
    }

    listElement.innerHTML = hasCards
      ? cardHtml
      : '<div class="campaign-test-draft-zone-empty">' +
        escapeHtml(emptyText) +
        "</div>";
  }

  function applyDeckbuilderPayload(payload) {
    if (!payload || !payload.ok) {
      throw new Error((payload && payload.message) || "Deck update failed.");
    }

    const safePayload = getSafeDeckbuilderPayload(payload);
    const existingFilterMetadata = getDeckbuilderExistingFilterMetadata();

    const normalizedDeckCards = normalizeDeckbuilderPayloadCardsForFilters(
      safePayload.human_deck_cards || [],
      existingFilterMetadata,
    );

    const normalizedSideboardCards = normalizeDeckbuilderPayloadCardsForFilters(
      safePayload.human_sideboard_cards || [],
      existingFilterMetadata,
    );

    if (
      safePayload._basicLandPaletteAuthoritative === true &&
      Array.isArray(safePayload.basic_land_cards) &&
      sideboardList
    ) {
      sideboardList.dataset.basicLandCards = JSON.stringify(
        safePayload.basic_land_cards,
      );
    }

    renderDeckbuilderZone(
      deckList,
      normalizedDeckCards,
      "Drag cards here to build your deck.",
      "deck",
    );

    renderDeckbuilderZone(
      sideboardList,
      normalizedSideboardCards,
      "Sideboard cards will appear here.",
      "sideboard",
    );

    updateBasicLandCountsFromPayload(safePayload);
    reconcileDeckBasicLandsFromPayload(safePayload);
    moveSideboardPaletteCardsToEnd();
    updateCounts();
    clearDeckbuilderSelection();
    bindDragSources();
    bindHoverPreviews();
    bindCardContextMenus();
    bindDeckbuilderSelectionHandlers();
    updateDeckbuilderCardSize(deckbuilderCardSize);
    setViewMode(deckbuilderViewMode);
    applySideboardFilters();
    applyDeckFilters();
  }

  function applyDeckbuilderCardActionDelta(
    payload,
    cardPayloads,
    actionName,
    targetZoneOverride,
  ) {
    if (!payload || payload.response_mode !== "delta" || !workspace) {
      return false;
    }

    const deckCardIds = new Set(
      (cardPayloads || [])
        .map(function (cardPayload) {
          return String(cardPayload ? cardPayload.deckCardId : "").trim();
        })
        .filter(Boolean),
    );

    const cardElements = Array.from(
      workspace.querySelectorAll(".deckbuilder-card[data-deck-card-id]"),
    ).filter(function (cardElement) {
      return deckCardIds.has(String(cardElement.dataset.deckCardId || ""));
    });

    if (!cardElements.length) {
      return false;
    }

    if (actionName === "set_foil" || actionName === "remove_foil") {
      const isFoil = actionName === "set_foil";

      cardElements.forEach(function (cardElement) {
        cardElement.dataset.isFoil = isFoil ? "1" : "0";

        const cardMain = cardElement.querySelector(
          ".campaign-test-draft-picked-main",
        );

        let foilBadge = cardMain
          ? cardMain.querySelector(".deckbuilder-card-foil-badge")
          : null;

        if (isFoil && cardMain && !foilBadge) {
          foilBadge = document.createElement("div");

          foilBadge.className =
            "deckbuilder-card-meta-badge deckbuilder-card-foil-badge";

          foilBadge.textContent = "Foil";

          cardMain.appendChild(foilBadge);
        } else if (!isFoil && foilBadge) {
          foilBadge.remove();
        }
      });
    } else if (actionName === "duplicate") {
      const result = payload.card_action_result || {};
      const newDeckCardId = String(result.deck_card_id || "").trim();
      const sourceCard = cardElements[0] || null;

      if (!sourceCard || !newDeckCardId) {
        return false;
      }

      const clonedCard = sourceCard.cloneNode(true);

      clonedCard.dataset.deckCardId = newDeckCardId;
      clonedCard.dataset.draftTestPickId = "deckcard_" + newDeckCardId + "_1";
      clonedCard.dataset.sourceKind = "deck_card";
      clonedCard.dataset.deckRole = "main";

      clonedCard.classList.remove(
        "deckbuilder-card-selected",
        "deckbuilder-card-dragging",
        "deckbuilder-stack-hover-expanded",
      );

      clonedCard.setAttribute("aria-selected", "false");

      delete clonedCard.dataset.selectionBound;
      delete clonedCard.dataset.dragBound;
      delete clonedCard.dataset.contextMenuBound;
      delete clonedCard.dataset.hoverPreviewBound;

      const roleBadge = clonedCard.querySelector(
        ".deckbuilder-card-role-badge",
      );

      if (roleBadge) {
        roleBadge.remove();
      }

      sourceCard.insertAdjacentElement("afterend", clonedCard);

      bindDragSources();
      bindHoverPreviews();
      bindCardContextMenus();
      bindDeckbuilderSelectionHandlers();
      updateDeckbuilderCardSize(deckbuilderCardSize);
    } else if (actionName === "remove") {
      cardElements.forEach(function (cardElement) {
        cardElement.remove();
      });
    } else if (actionName === "move") {
      const result =
        payload.card_action_result || payload.bulk_card_action_result || {};

      const targetZone = String(targetZoneOverride || result.deck_zone || "")
        .trim()
        .toLowerCase();

      const targetList = targetZone === "deck" ? deckList : sideboardList;

      if (!targetList || !["deck", "sideboard"].includes(targetZone)) {
        return false;
      }

      cardElements.forEach(function (cardElement) {
        cardElement.dataset.currentZone = targetZone;

        if (targetZone === "sideboard") {
          cardElement.dataset.deckRole = "main";
          cardElement.dataset.stackColumn = "";
          cardElement.dataset.stackOrder = "";

          const roleBadge = cardElement.querySelector(
            ".deckbuilder-card-role-badge",
          );

          if (roleBadge) {
            roleBadge.remove();
          }
        }

        targetList.appendChild(cardElement);
      });
    } else {
      return false;
    }

    clearDeckbuilderSelection();

    if (
      actionName === "move" ||
      actionName === "remove" ||
      actionName === "duplicate"
    ) {
      if (deckbuilderViewMode === "stack") {
        setViewMode("stack");
      } else {
        sortDeckbuilderZones();
        updateCounts();

        if (deckList && getDeckbuilderCards(deckList).length === 0) {
          deckList.innerHTML =
            '<div class="campaign-test-draft-zone-empty">' +
            "Drag cards here to build your deck." +
            "</div>";
        }
      }
    }

    return true;
  }

  function applyDeckbuilderAddCardDelta(payload, context) {
    if (
      !payload ||
      payload.response_mode !== "delta" ||
      !sideboardList ||
      !context ||
      !context.resultRow
    ) {
      return false;
    }

    const result = payload.add_card_result || {};
    const resultRow = context.resultRow;
    const deckCardId = String(result.deck_card_id || "").trim();
    const cardUuid = String(result.card_uuid || context.cardUuid || "").trim();

    if (!deckCardId || !cardUuid) {
      return false;
    }

    const card = {
      source_kind: "deck_card",
      deck_card_id: deckCardId,
      draft_test_pick_id: "deckcard_" + deckCardId + "_1",
      card_uuid: cardUuid,
      card_name: result.card_name || resultRow.dataset.displayCardName || "",
      deck_zone: "sideboard",
      is_basic_land: 0,
      sheet_is_foil: 0,
      deck_role: "main",
      stack_column: "",
      stack_order: "",
      rarity: resultRow.dataset.rarityDisplay || "",
      mana_value: resultRow.dataset.manaValue || "",
      type_line: resultRow.dataset.typeLine || "",
      color_identity_json: resultRow.dataset.colorIdentity || "[]",
      set_code: resultRow.dataset.setCode || "",
      collector_number: resultRow.dataset.collectorNumber || "",
      has_alternate_image: resultRow.dataset.hasAlternateSource || "0",
      alternate_image_remove_bleed:
        resultRow.dataset.alternateRemoveBleed || "0",
      image_src: resultRow.dataset.imageSrc || "",
    };

    const cardTemplate = document.createElement("template");

    cardTemplate.innerHTML = renderDeckbuilderCard(card, "sideboard").trim();

    const cardElement = cardTemplate.content.firstElementChild;

    if (!cardElement) {
      return false;
    }

    const firstPaletteCard = sideboardList.querySelector(
      ".deckbuilder-basic-land-card[data-is-land-palette='1']",
    );

    if (firstPaletteCard) {
      sideboardList.insertBefore(cardElement, firstPaletteCard);
    } else {
      sideboardList.appendChild(cardElement);
    }

    bindDragSources();
    bindHoverPreviews();
    bindCardContextMenus();
    bindDeckbuilderSelectionHandlers();
    updateDeckbuilderCardSize(deckbuilderCardSize);

    sortDeckbuilderZones();
    updateCounts();
    applySideboardFilters();

    return true;
  }

  function getDeckbuilderSelectionKey(cardElement) {
    if (!cardElement) {
      return "";
    }

    if (!cardElement.dataset.selectionKey) {
      const deckCardId = String(cardElement.dataset.deckCardId || "").trim();
      const pickId = String(cardElement.dataset.draftTestPickId || "").trim();
      const cardUuid = String(cardElement.dataset.cardUuid || "").trim();
      const cardName = String(cardElement.dataset.cardName || "").trim();
      const zone = String(cardElement.dataset.currentZone || "").trim();

      if (deckCardId) {
        cardElement.dataset.selectionKey = "deck_card:" + deckCardId;
      } else if (pickId) {
        cardElement.dataset.selectionKey = "pick:" + pickId;
      } else {
        cardElement.dataset.selectionKey =
          "card:" + zone + ":" + cardUuid + ":" + cardName;
      }
    }

    return cardElement.dataset.selectionKey || "";
  }

  function isDeckbuilderSelectableCard(cardElement) {
    return Boolean(
      cardElement &&
      cardElement.classList &&
      cardElement.classList.contains("deckbuilder-card") &&
      cardElement.dataset.isLandPalette !== "1",
    );
  }

  function getDeckbuilderSelectedCards(zone) {
    return Array.from(
      document.querySelectorAll(".deckbuilder-card.deckbuilder-card-selected"),
    ).filter(function (cardElement) {
      if (!isDeckbuilderSelectableCard(cardElement)) {
        return false;
      }

      if (!zone) {
        return true;
      }

      return String(cardElement.dataset.currentZone || "") === zone;
    });
  }

  function getDeckbuilderPrintSelectionToken(cardElement) {
    if (!cardElement) {
      return "";
    }

    const deckCardId = String(cardElement.dataset.deckCardId || "").trim();

    if (deckCardId) {
      return "deck_card:" + deckCardId;
    }

    if (cardElement.dataset.isBasicLand === "1") {
      const cardName = String(cardElement.dataset.cardName || "").trim();

      if (cardName) {
        return "basic_land:" + cardName.toLowerCase();
      }
    }

    return "";
  }

  function openDeckbuilderPrintSelection(selectedCards, selectedZone) {
    const cards = Array.isArray(selectedCards) ? selectedCards : [];

    if (!cards.length) {
      showDeckbuilderError(new Error("Select at least one card to print."));

      return;
    }

    if (
      !deckbuilderPrintExportModal ||
      typeof deckbuilderPrintExportModal.open !== "function"
    ) {
      showDeckbuilderError(
        new Error("Print / Export controls are not available."),
      );

      return;
    }

    const cleanSelectedZone = String(selectedZone || "")
      .trim()
      .toLowerCase();

    if (cleanSelectedZone !== "deck" && cleanSelectedZone !== "sideboard") {
      showDeckbuilderError(
        new Error("The selected card zone could not be determined."),
      );

      return;
    }

    const selectionTokens = cards
      .map(getDeckbuilderPrintSelectionToken)
      .filter(Boolean);

    if (selectionTokens.length !== cards.length) {
      showDeckbuilderError(
        new Error(
          "One or more selected cards could not be prepared for printing.",
        ),
      );

      return;
    }

    deckbuilderPrintExportModal.open({
      subtitle:
        "Print the selected cards to PDF or export card images " +
        "and XML for proxy printing.",

      extraFormFields: {
        print_selection_only: "1",
        print_selection_zone: cleanSelectedZone,
        selected_card_tokens: selectionTokens,
      },

      beforeOpen: function () {
        setDeckbuilderCopyMenuOpen(false);
        setDeckbuilderContextMenuOpen(false);
        setLandPaletteContextMenuOpen(false);
        hideHoverPreview();
      },
    });
  }

  function getDeckbuilderBatchUpscaleCardUuids() {
    const seen = new Set();
    const cardUuids = [];

    getDeckbuilderSelectedCards().forEach(function (cardElement) {
      const cardUuid = String(cardElement.dataset.cardUuid || "").trim();

      if (!cardUuid || seen.has(cardUuid)) {
        return;
      }

      seen.add(cardUuid);
      cardUuids.push(cardUuid);
    });

    return cardUuids;
  }

  function openDeckbuilderBatchUpscale() {
    const cardUuids = getDeckbuilderBatchUpscaleCardUuids();

    if (!cardUuids.length) {
      showDeckbuilderError(
        new Error("Select at least one card to Batch Upscale."),
      );

      return;
    }

    if (!window.iMomirUpscaleBatch || !window.iMomirUpscaleBatch.requestCards) {
      showDeckbuilderError(
        new Error("Batch Upscale controls are not available."),
      );

      return;
    }

    const deckLabel =
      String(deckNameInput ? deckNameInput.value : "").trim() ||
      "Deck Builder Selection";

    window.iMomirUpscaleBatch.requestCards(cardUuids, {
      title: "Batch Upscale Selected Cards",
      sourceLabel: deckLabel,
      message: "Upscale all " + cardUuids.length + " selected card(s)?",
    });
  }

  function buildDeckbuilderUpscaleControlUrl(cardUuid) {
    const cleanCardUuid = String(cardUuid || "").trim();

    if (!cleanCardUuid || !upscaleControlUrlTemplate) {
      return "";
    }

    return upscaleControlUrlTemplate.replace(
      "__CARD_UUID__",
      encodeURIComponent(cleanCardUuid),
    );
  }

  function clearDeckbuilderSelection() {
    Array.from(document.querySelectorAll(".deckbuilder-card-selected")).forEach(
      function (cardElement) {
        cardElement.classList.remove("deckbuilder-card-selected");
        cardElement.setAttribute("aria-selected", "false");
      },
    );

    selectedDeckbuilderZone = "";
  }

  function setDeckbuilderCardSelected(cardElement, isSelected) {
    if (!isDeckbuilderSelectableCard(cardElement)) {
      return;
    }

    getDeckbuilderSelectionKey(cardElement);

    cardElement.classList.toggle(
      "deckbuilder-card-selected",
      Boolean(isSelected),
    );
    cardElement.setAttribute("aria-selected", isSelected ? "true" : "false");

    if (isSelected) {
      selectedDeckbuilderZone = cardElement.dataset.currentZone || "";
    }
  }

  function toggleDeckbuilderCardSelection(cardElement) {
    if (!isDeckbuilderSelectableCard(cardElement)) {
      return;
    }

    const cardZone = cardElement.dataset.currentZone || "";

    if (selectedDeckbuilderZone && selectedDeckbuilderZone !== cardZone) {
      clearDeckbuilderSelection();
    }

    const isAlreadySelected = cardElement.classList.contains(
      "deckbuilder-card-selected",
    );
    setDeckbuilderCardSelected(cardElement, !isAlreadySelected);

    if (!getDeckbuilderSelectedCards(cardZone).length) {
      selectedDeckbuilderZone = "";
    }
  }

  function getDefaultDeckbuilderSelectionZone() {
    if (selectedDeckbuilderZone) {
      return selectedDeckbuilderZone;
    }

    const visibleSideboardCards =
      getSelectableDeckbuilderCardsInZone("sideboard");

    if (visibleSideboardCards.length) {
      return "sideboard";
    }

    return "deck";
  }

  function getSelectableDeckbuilderCardsInZone(zone) {
    return Array.from(
      document.querySelectorAll(
        ".deckbuilder-card:not([data-is-land-palette='1'])",
      ),
    ).filter(function (cardElement) {
      if (!isDeckbuilderSelectableCard(cardElement)) {
        return false;
      }

      if (String(cardElement.dataset.currentZone || "") !== zone) {
        return false;
      }

      if (cardElement.classList.contains("hidden")) {
        return false;
      }

      return true;
    });
  }

  function selectAllDeckbuilderCardsInCurrentZone() {
    const targetZone = getDefaultDeckbuilderSelectionZone();
    const cards = getSelectableDeckbuilderCardsInZone(targetZone);

    clearDeckbuilderSelection();

    cards.forEach(function (cardElement) {
      setDeckbuilderCardSelected(cardElement, true);
    });
  }

  function bindDeckbuilderSelectionHandlers() {
    Array.from(
      document.querySelectorAll(
        ".deckbuilder-card:not([data-is-land-palette='1'])",
      ),
    ).forEach(function (cardElement) {
      if (cardElement.dataset.selectionBound === "1") {
        return;
      }

      cardElement.dataset.selectionBound = "1";
      cardElement.setAttribute(
        "aria-selected",
        cardElement.classList.contains("deckbuilder-card-selected")
          ? "true"
          : "false",
      );

      cardElement.addEventListener("click", function (event) {
        if (
          event.target &&
          event.target.closest &&
          event.target.closest(
            "button, a, input, select, textarea, .deckbuilder-card-context-menu",
          )
        ) {
          return;
        }

        toggleDeckbuilderCardSelection(cardElement);
      });
    });
  }

  function clearDropZoneState() {
    Array.from(
      document.querySelectorAll(".campaign-test-draft-drop-zone"),
    ).forEach(function (dropZone) {
      dropZone.classList.remove("deckbuilder-drop-zone-active");
      dropZone.classList.remove("deckbuilder-drop-zone-over");
      dropZone.classList.remove("deckbuilder-drop-zone-working");
    });

    Array.from(document.querySelectorAll(".deckbuilder-card-dragging")).forEach(
      function (draggedElement) {
        draggedElement.classList.remove("deckbuilder-card-dragging");
      },
    );

    Array.from(
      document.querySelectorAll(".deckbuilder-stack-column-over"),
    ).forEach(function (columnElement) {
      columnElement.classList.remove("deckbuilder-stack-column-over");
    });

    Array.from(
      document.querySelectorAll(".deckbuilder-stack-insertion-marker"),
    ).forEach(function (markerElement) {
      markerElement.remove();
    });

    if (workspace) {
      workspace.classList.remove("deckbuilder-stack-drag-active");
    }
  }

  function setDropZonesActive(isActive) {
    Array.from(
      document.querySelectorAll(".campaign-test-draft-drop-zone"),
    ).forEach(function (dropZone) {
      dropZone.classList.toggle(
        "deckbuilder-drop-zone-active",
        Boolean(isActive),
      );
    });
  }

  function bindDragSources() {
    Array.from(
      document.querySelectorAll(
        ".deckbuilder-card[draggable='true']:not([data-is-land-palette='1'])",
      ),
    ).forEach(function (cardElement) {
      if (cardElement.dataset.dragBound === "1") {
        return;
      }

      cardElement.dataset.dragBound = "1";

      cardElement.addEventListener("dragstart", function (event) {
        const currentZone = cardElement.dataset.currentZone || "";
        const selectedCards = getDeckbuilderSelectedCards(currentZone);
        const shouldDragSelection =
          selectedCards.length > 1 &&
          cardElement.classList.contains("deckbuilder-card-selected") &&
          cardElement.dataset.sourceKind !== "basic_land" &&
          cardElement.dataset.isBasicLand !== "1";

        const selectedDeckCardIds = shouldDragSelection
          ? selectedCards
              .map(function (selectedCard) {
                return selectedCard.dataset.deckCardId || "";
              })
              .filter(Boolean)
          : [];

        draggedDeckbuilderItem = {
          type: "picked-card",
          sourceKind:
            cardElement.dataset.sourceKind ||
            (cardElement.dataset.isBasicLand === "1"
              ? "basic_land"
              : "deck_card"),
          pickId: cardElement.dataset.draftTestPickId || "",
          deckCardId: cardElement.dataset.deckCardId || "",
          selectedDeckCardIds: selectedDeckCardIds,
          isMultiCardDrag: selectedDeckCardIds.length > 1 ? "1" : "0",
          cardUuid: cardElement.dataset.cardUuid || "",
          currentZone: currentZone,
          cardName: cardElement.dataset.cardName || "",
          isBasicLand: cardElement.dataset.isBasicLand || "0",
        };

        writeDeckbuilderClientDebug("PICKED CARD DRAGSTART", {
          draggedDeckbuilderItem: draggedDeckbuilderItem,
        });

        cardElement.classList.add("deckbuilder-card-dragging");
        setDropZonesActive(true);

        if (workspace && deckbuilderViewMode === "stack") {
          workspace.classList.add("deckbuilder-stack-drag-active");
        }

        hideHoverPreview();

        setDeckbuilderDragTransfer(
          event,
          draggedDeckbuilderItem,
          cardElement.dataset.cardName || "Deck card",
        );
      });

      cardElement.addEventListener("dragend", function () {
        draggedDeckbuilderItem = null;
        clearDropZoneState();
      });
    });

    Array.from(
      document.querySelectorAll(
        ".deckbuilder-basic-land-card[draggable='true']",
      ),
    ).forEach(function (landElement) {
      if (landElement.dataset.dragBound === "1") {
        return;
      }

      landElement.dataset.dragBound = "1";

      landElement.addEventListener("dragstart", function (event) {
        draggedDeckbuilderItem = {
          type: "basic-land",
          landName:
            landElement.dataset.basicLandName ||
            landElement.dataset.cardName ||
            "",
        };

        writeDeckbuilderClientDebug("BASIC LAND DRAGSTART", {
          draggedDeckbuilderItem: draggedDeckbuilderItem,
          cardName: landElement.dataset.cardName || "",
          basicLandName: landElement.dataset.basicLandName || "",
          isLandPalette: landElement.dataset.isLandPalette || "",
          currentZone: landElement.dataset.currentZone || "",
        });

        landElement.classList.add("deckbuilder-card-dragging");
        setDropZonesActive(true);

        if (workspace && deckbuilderViewMode === "stack") {
          workspace.classList.add("deckbuilder-stack-drag-active");
        }

        hideHoverPreview();

        setDeckbuilderDragTransfer(
          event,
          draggedDeckbuilderItem,
          draggedDeckbuilderItem.landName || "Basic Land",
        );
      });

      landElement.addEventListener("dragend", function () {
        draggedDeckbuilderItem = null;
        clearDropZoneState();
      });
    });
  }

  function bindDropZones() {
    Array.from(
      document.querySelectorAll(".campaign-test-draft-drop-zone"),
    ).forEach(function (dropZone) {
      if (dropZone.dataset.dropBound === "1") {
        return;
      }

      dropZone.dataset.dropBound = "1";

      dropZone.addEventListener("dragover", function (event) {
        if (deckbuilderViewMode === "stack" && dropZone === deckList) {
          return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            draggedDeckbuilderItem &&
            draggedDeckbuilderItem.type === "basic-land"
              ? "copy"
              : "move";
        }

        dropZone.classList.add("deckbuilder-drop-zone-over");
      });

      dropZone.addEventListener("dragleave", function (event) {
        if (!dropZone.contains(event.relatedTarget)) {
          dropZone.classList.remove("deckbuilder-drop-zone-over");
        }
      });

      dropZone.addEventListener("drop", async function (event) {
        if (deckbuilderViewMode === "stack" && dropZone === deckList) {
          return;
        }

        event.preventDefault();

        const targetZone = dropZone.dataset.dropZone || "deck";
        const droppedItem = getDeckbuilderDragTransfer(event);

        writeDeckbuilderClientDebug("DROP RECEIVED", {
          targetZone: targetZone,
          droppedItem: droppedItem,
          globalDraggedItem: draggedDeckbuilderItem,
          basicLandUrl: basicLandUrl,
          moveZoneUrl: moveZoneUrl,
          deckCardCountBefore: getDeckbuilderCards(deckList).length,
          sideboardCardCountBefore: getDeckbuilderCards(sideboardList).length,
        });

        if (!droppedItem) {
          draggedDeckbuilderItem = null;
          clearDropZoneState();

          writeDeckbuilderClientDebug("DROP EXIT NO ITEM", {
            targetZone: targetZone,
          });

          return;
        }

        draggedDeckbuilderItem = null;
        clearDropZoneState();

        try {
          dropZone.classList.add("deckbuilder-drop-zone-working");

          let payload = null;

          if (droppedItem.type === "basic-land") {
            writeDeckbuilderClientDebug("BASIC LAND DROP BRANCH", {
              targetZone: targetZone,
              landName: droppedItem.landName || "",
              basicLandUrl: basicLandUrl,
            });

            if (targetZone !== "deck") {
              writeDeckbuilderClientDebug("BASIC LAND DROP IGNORED NON-DECK", {
                targetZone: targetZone,
                landName: droppedItem.landName || "",
              });

              return;
            }

            payload = await updateBasicLand(droppedItem.landName, "add");

            if (payload && payload.ok) {
              payload._basicLandCountsAuthoritative = true;
            }

            if (payload && payload.ok && payload.basic_land_counts) {
              const cleanLandName = droppedItem.landName || "";
              const currentCount = parseInt(
                payload.basic_land_counts[cleanLandName] || 0,
                10,
              );

              if (!Number.isFinite(currentCount) || currentCount < 1) {
                payload.basic_land_counts[cleanLandName] = 1;
              }
            }
          } else if (droppedItem.type === "picked-card") {
            if (droppedItem.currentZone === targetZone) {
              return;
            }

            if (
              droppedItem.currentZone === "deck" &&
              targetZone === "sideboard" &&
              droppedItem.isBasicLand === "1"
            ) {
              payload = await updateBasicLand(droppedItem.cardName, "remove");

              if (payload && payload.ok) {
                payload._basicLandCountsAuthoritative = true;
              }

              if (payload && payload.ok && payload.basic_land_counts) {
                const cleanLandName = droppedItem.cardName || "";
                const currentCount = parseInt(
                  payload.basic_land_counts[cleanLandName] || 0,
                  10,
                );

                payload.basic_land_counts[cleanLandName] = Number.isFinite(
                  currentCount,
                )
                  ? Math.max(0, currentCount)
                  : 0;
              }
            } else if (droppedItem.sourceKind === "deck_card") {
              if (
                droppedItem.isMultiCardDrag === "1" &&
                droppedItem.selectedDeckCardIds &&
                droppedItem.selectedDeckCardIds.length > 1
              ) {
                const bulkPayloads = droppedItem.selectedDeckCardIds.map(
                  function (deckCardId) {
                    return {
                      sourceKind: "deck_card",
                      deckCardId: deckCardId,
                      currentZone: droppedItem.currentZone || "deck",
                    };
                  },
                );

                showDeckbuilderBulkActionStatus(
                  targetZone === "deck"
                    ? "Moving to Deck"
                    : "Moving to Sideboard",
                  "Updating " +
                    String(bulkPayloads.length) +
                    " selected card(s)...",
                );

                payload = await submitDeckbuilderBulkCardAction(
                  "move",
                  bulkPayloads,
                  targetZone,
                );

                completeDeckbuilderBulkActionStatus(
                  payload.message || "Moved selected card(s).",
                );
              } else {
                payload = await submitDeckbuilderCardAction(
                  "move",
                  {
                    sourceKind: droppedItem.sourceKind || "deck_card",
                    deckCardId: droppedItem.deckCardId || "",
                    cardUuid: droppedItem.cardUuid || "",
                    cardName: droppedItem.cardName || "",
                    currentZone: droppedItem.currentZone || "deck",
                  },
                  targetZone,
                );
              }
            } else if (
              String(droppedItem.pickId || "").indexOf("basic-land-") === 0 ||
              String(droppedItem.pickId || "").indexOf("deckcard_") === 0
            ) {
              return;
            } else {
              payload = await submitDeckbuilderCardAction(
                "move",
                {
                  sourceKind: "deck_card",
                  deckCardId: droppedItem.deckCardId || "",
                  cardUuid: droppedItem.cardUuid || "",
                  cardName: droppedItem.cardName || "",
                  currentZone: droppedItem.currentZone || "deck",
                },
                targetZone,
              );
            }
          }

          if (payload) {
            writeDeckbuilderClientDebug("DROP PAYLOAD BEFORE APPLY", {
              payloadOk: payload.ok,
              debug: payload.debug || null,
              basicLandCounts: payload.basic_land_counts || null,
              humanDeckCardCount: payload.human_deck_cards
                ? payload.human_deck_cards.length
                : null,
              humanSideboardCardCount: payload.human_sideboard_cards
                ? payload.human_sideboard_cards.length
                : null,
            });

            const droppedCardPayloads =
              droppedItem.selectedDeckCardIds &&
              droppedItem.selectedDeckCardIds.length > 1
                ? droppedItem.selectedDeckCardIds.map(function (deckCardId) {
                    return { deckCardId: deckCardId };
                  })
                : [{ deckCardId: droppedItem.deckCardId || "" }];

            if (
              !applyDeckbuilderCardActionDelta(
                payload,
                droppedCardPayloads,
                "move",
                targetZone,
              )
            ) {
              applyDeckbuilderPayload(payload);
            }

            writeDeckbuilderClientDebug("DROP AFTER APPLY", {
              deckCardCountAfter: getDeckbuilderCards(deckList).length,
              sideboardCardCountAfter:
                getDeckbuilderCards(sideboardList).length,
              deckHtmlAfter: deckList ? deckList.innerHTML.slice(0, 1200) : "",
            });
          }
        } catch (error) {
          showDeckbuilderError(error);
        } finally {
          dropZone.classList.remove("deckbuilder-drop-zone-working");
        }
      });
    });
  }

  function positionHoverPreview(event) {
    if (!hoverPreview) {
      return;
    }

    const previewWidth = hoverPreview.offsetWidth || 340;
    const previewHeight = hoverPreview.offsetHeight || 420;
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const offset = 18;

    let left = event.clientX + offset;
    let top = event.clientY + offset;

    if (left + previewWidth > viewportWidth - 10) {
      left = event.clientX - previewWidth - offset;
    }

    if (top + previewHeight > viewportHeight - 10) {
      top = viewportHeight - previewHeight - 10;
    }

    hoverPreview.style.left = Math.max(10, left) + "px";
    hoverPreview.style.top = Math.max(10, top) + "px";
  }

  function hideHoverPreview() {
    if (!hoverPreview || !hoverPreviewImage) {
      return;
    }

    hoverPreview.classList.add("hidden");
    hoverPreview.classList.remove("campaign-test-draft-hover-preview-foil");
    hoverPreview.setAttribute("aria-hidden", "true");
    hoverPreviewImage.src = "";
    hoverPreviewImage.alt = "";
  }

  function isDeckbuilderStackHoverCard(cardElement) {
    return Boolean(
      cardElement &&
      deckbuilderViewMode === "stack" &&
      cardElement.closest(".deckbuilder-stack-column-body"),
    );
  }

  function clearDeckbuilderStackHoverExpansion(cardElement) {
    if (cardElement && stackHoverCard && stackHoverCard !== cardElement) {
      return;
    }

    if (stackHoverTimer !== null) {
      window.clearTimeout(stackHoverTimer);
      stackHoverTimer = null;
    }

    if (stackHoverCard) {
      stackHoverCard.classList.remove("deckbuilder-stack-hover-expanded");
    }

    stackHoverCard = null;
  }

  function scheduleDeckbuilderStackHoverExpansion(cardElement) {
    clearDeckbuilderStackHoverExpansion();

    stackHoverCard = cardElement;

    stackHoverTimer = window.setTimeout(function () {
      stackHoverTimer = null;

      if (
        stackHoverCard !== cardElement ||
        !isDeckbuilderStackHoverCard(cardElement) ||
        !cardElement.matches(":hover")
      ) {
        clearDeckbuilderStackHoverExpansion(cardElement);
        return;
      }

      cardElement.classList.add("deckbuilder-stack-hover-expanded");
    }, STACK_HOVER_EXPAND_DELAY_MS);
  }

  function bindCardContextMenus() {
    Array.from(
      document.querySelectorAll(
        ".deckbuilder-card:not([data-is-land-palette='1'])",
      ),
    ).forEach(function (cardElement) {
      if (cardElement.dataset.contextMenuBound === "1") {
        return;
      }

      cardElement.dataset.contextMenuBound = "1";

      cardElement.addEventListener("contextmenu", function (event) {
        openCardContextMenu(event, cardElement);
      });
    });

    Array.from(
      document.querySelectorAll(
        ".deckbuilder-basic-land-card[data-is-land-palette='1']",
      ),
    ).forEach(function (landElement) {
      if (landElement.dataset.landPaletteContextMenuBound === "1") {
        return;
      }

      landElement.dataset.landPaletteContextMenuBound = "1";

      landElement.addEventListener("contextmenu", function (event) {
        openLandPaletteContextMenu(event, landElement);
      });
    });
  }

  function bindHoverPreviews() {
    const deckArtImage = document.getElementById("deckbuilderDeckArtImage");

    if (deckArtImage && deckArtImage.dataset.hoverPreviewBound !== "1") {
      deckArtImage.dataset.hoverPreviewBound = "1";

      deckArtImage.addEventListener("mouseenter", function (event) {
        if (!hoverPreview || !hoverPreviewImage) {
          return;
        }

        hoverPreviewImage.src = deckArtImage.src;
        hoverPreviewImage.alt = "Deck Art";

        hoverPreview.classList.remove("campaign-test-draft-hover-preview-foil");

        hoverPreview.classList.remove("hidden");
        hoverPreview.setAttribute("aria-hidden", "false");

        positionHoverPreview(event);
      });

      deckArtImage.addEventListener("mousemove", function (event) {
        positionHoverPreview(event);
      });

      deckArtImage.addEventListener("mouseleave", function () {
        hideHoverPreview();
      });
    }

    Array.from(
      document.querySelectorAll(
        ".deckbuilder-card, .deckbuilder-basic-land-card",
      ),
    ).forEach(function (cardElement) {
      if (cardElement.dataset.hoverPreviewBound === "1") {
        return;
      }

      cardElement.dataset.hoverPreviewBound = "1";

      cardElement.addEventListener("mouseenter", function (event) {
        if (isDeckbuilderStackHoverCard(cardElement)) {
          hideHoverPreview();
          scheduleDeckbuilderStackHoverExpansion(cardElement);
          return;
        }

        clearDeckbuilderStackHoverExpansion();

        const imageElement = cardElement.querySelector(
          ".campaign-test-draft-picked-thumb",
        );

        if (!imageElement || !hoverPreview || !hoverPreviewImage) {
          return;
        }

        hoverPreviewImage.src = imageElement.src;
        hoverPreviewImage.alt =
          imageElement.alt || cardElement.dataset.cardName || "Card";

        hoverPreview.classList.toggle(
          "campaign-test-draft-hover-preview-foil",
          cardElement.dataset.isFoil === "1",
        );

        hoverPreview.classList.remove("hidden");
        hoverPreview.setAttribute("aria-hidden", "false");
        positionHoverPreview(event);
      });

      cardElement.addEventListener("mousemove", function (event) {
        if (isDeckbuilderStackHoverCard(cardElement)) {
          return;
        }

        positionHoverPreview(event);
      });

      cardElement.addEventListener("mouseleave", function () {
        clearDeckbuilderStackHoverExpansion(cardElement);
        hideHoverPreview();
      });

      cardElement.addEventListener("dragstart", function () {
        clearDeckbuilderStackHoverExpansion(cardElement);
        hideHoverPreview();
      });
    });
  }

  function getDeckbuilderStackColumnDefs() {
    return [
      { key: "commander", label: "Commander" },
      { key: "partner", label: "Partner" },
      { key: "0", label: "0" },
      { key: "1", label: "1" },
      { key: "2", label: "2" },
      { key: "3", label: "3" },
      { key: "4", label: "4" },
      { key: "5", label: "5" },
      { key: "6", label: "6+" },
      { key: "land", label: "Lands" },
    ];
  }

  function normalizeDeckbuilderStackColumnKey(rawValue) {
    const cleanValue = String(rawValue || "")
      .trim()
      .toLowerCase();

    if (
      [
        "commander",
        "partner",
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "land",
      ].indexOf(cleanValue) !== -1
    ) {
      return cleanValue;
    }

    return "";
  }

  function inferDeckbuilderStackColumnKey(cardElement) {
    const cardName = String(cardElement?.dataset?.cardName || "").trim();
    const typeLine = String(
      cardElement?.dataset?.cardTypeLine || "",
    ).toLowerCase();

    if (
      typeLine.indexOf("land") !== -1 ||
      cardName.match(/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i)
    ) {
      return "land";
    }

    const manaValue = getCardManaValue(cardElement);

    if (!Number.isFinite(manaValue) || manaValue === 999) {
      return "0";
    }

    if (manaValue >= 6) {
      return "6";
    }

    return String(Math.max(0, Math.floor(manaValue)));
  }

  function getDeckbuilderStackColumnKey(cardElement) {
    const deckRole = String(cardElement?.dataset?.deckRole || "main")
      .trim()
      .toLowerCase();

    if (deckRole === "commander") {
      return "commander";
    }

    if (deckRole === "partner") {
      return "partner";
    }

    const inferredColumn = inferDeckbuilderStackColumnKey(cardElement);

    if (inferredColumn === "land") {
      return "land";
    }

    return (
      normalizeDeckbuilderStackColumnKey(
        cardElement?.dataset?.stackColumn || "",
      ) || inferredColumn
    );
  }

  function clearStackInsertionMarkers() {
    Array.from(
      document.querySelectorAll(".deckbuilder-stack-insertion-marker"),
    ).forEach(function (markerElement) {
      markerElement.remove();
    });
  }

  function getStackInsertBeforeDeckCardId(stackBody, clientY) {
    if (!stackBody) {
      return "";
    }

    const cards = Array.from(
      stackBody.querySelectorAll(
        ".deckbuilder-card:not(.deckbuilder-card-dragging)",
      ),
    );

    for (const cardElement of cards) {
      const rect = cardElement.getBoundingClientRect();
      const midpoint = rect.top + Math.min(rect.height, 54) / 2;

      if (clientY < midpoint) {
        return cardElement.dataset.deckCardId || "";
      }
    }

    return "";
  }

  function showStackInsertionMarker(stackBody, beforeDeckCardId) {
    if (!stackBody) {
      return;
    }

    clearStackInsertionMarkers();

    const marker = document.createElement("div");
    marker.className = "deckbuilder-stack-insertion-marker";

    if (beforeDeckCardId) {
      const beforeCard = stackBody.querySelector(
        '.deckbuilder-card[data-deck-card-id="' +
          CSS.escape(beforeDeckCardId) +
          '"]',
      );

      if (beforeCard) {
        stackBody.insertBefore(marker, beforeCard);
        return;
      }
    }

    stackBody.appendChild(marker);
  }

  function getStackOrderedDeckCardIdsWithInsertion(
    targetColumnKey,
    movingDeckCardId,
    insertBeforeDeckCardId,
  ) {
    const orderedIds = [];
    let insertedMovingCard = false;
    const cleanMovingDeckCardId = String(movingDeckCardId || "").trim();
    const cleanInsertBeforeDeckCardId = String(
      insertBeforeDeckCardId || "",
    ).trim();
    const cleanTargetColumnKey =
      normalizeDeckbuilderStackColumnKey(targetColumnKey) || "0";

    getDeckbuilderStackColumnDefs().forEach(function (columnDef) {
      const column = deckList.querySelector(
        '.deckbuilder-stack-column[data-stack-column="' +
          CSS.escape(columnDef.key) +
          '"]',
      );

      if (!column) {
        return;
      }

      const body = column.querySelector(".deckbuilder-stack-column-body");

      if (!body) {
        return;
      }

      const cards = Array.from(body.querySelectorAll(".deckbuilder-card"));

      cards.forEach(function (cardElement) {
        const deckCardId = String(cardElement.dataset.deckCardId || "").trim();

        if (!deckCardId || deckCardId === cleanMovingDeckCardId) {
          return;
        }

        if (
          columnDef.key === cleanTargetColumnKey &&
          cleanInsertBeforeDeckCardId &&
          deckCardId === cleanInsertBeforeDeckCardId &&
          cleanMovingDeckCardId &&
          !insertedMovingCard
        ) {
          orderedIds.push(cleanMovingDeckCardId);
          insertedMovingCard = true;
        }

        orderedIds.push(deckCardId);
      });

      if (
        columnDef.key === cleanTargetColumnKey &&
        cleanMovingDeckCardId &&
        !insertedMovingCard &&
        !cleanInsertBeforeDeckCardId
      ) {
        orderedIds.push(cleanMovingDeckCardId);
        insertedMovingCard = true;
      }
    });

    if (cleanMovingDeckCardId && !insertedMovingCard) {
      orderedIds.push(cleanMovingDeckCardId);
    }

    return orderedIds;
  }

  async function submitDeckbuilderStackLayout(
    droppedItem,
    targetColumnKey,
    insertBeforeDeckCardId,
  ) {
    if (!stackLayoutUrl) {
      throw new Error("Stack Layout URL was not configured.");
    }

    const deckCardId = String(droppedItem.deckCardId || "").trim();

    if (!deckCardId) {
      throw new Error(
        "Only saved Deck Builder cards can be positioned in Stack Mode.",
      );
    }

    const cleanTargetColumnKey =
      normalizeDeckbuilderStackColumnKey(targetColumnKey) || "0";
    const orderedDeckCardIds = getStackOrderedDeckCardIdsWithInsertion(
      cleanTargetColumnKey,
      deckCardId,
      insertBeforeDeckCardId,
    );

    const formData = new FormData();

    formData.append("deck_card_id", deckCardId);
    formData.append("target_zone", "deck");
    formData.append("stack_column", cleanTargetColumnKey);

    orderedDeckCardIds.forEach(function (orderedDeckCardId) {
      formData.append("ordered_deck_card_ids", orderedDeckCardId);
    });

    return submitDeckbuilderAjax(stackLayoutUrl, formData);
  }

  function bindStackColumnDropTargets() {
    Array.from(
      document.querySelectorAll(".deckbuilder-stack-column-body"),
    ).forEach(function (stackBody) {
      if (stackBody.dataset.stackDropBound === "1") {
        return;
      }

      stackBody.dataset.stackDropBound = "1";

      stackBody.addEventListener("dragover", function (event) {
        const columnElement = stackBody.closest(".deckbuilder-stack-column");
        const columnKey = columnElement
          ? columnElement.dataset.stackColumn || "0"
          : "0";
        const droppedItem = getDeckbuilderDragTransfer(event);

        if (!droppedItem) {
          return;
        }

        if (columnKey === "commander" || columnKey === "partner") {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
          event.dataTransfer.dropEffect =
            droppedItem.type === "basic-land" ? "copy" : "move";
        }

        Array.from(
          document.querySelectorAll(".deckbuilder-stack-column-over"),
        ).forEach(function (otherColumn) {
          if (otherColumn !== columnElement) {
            otherColumn.classList.remove("deckbuilder-stack-column-over");
          }
        });

        if (columnElement) {
          columnElement.classList.add("deckbuilder-stack-column-over");
        }

        if (droppedItem.type !== "basic-land" && columnKey !== "land") {
          showStackInsertionMarker(
            stackBody,
            getStackInsertBeforeDeckCardId(stackBody, event.clientY),
          );
        } else {
          clearStackInsertionMarkers();
        }
      });

      stackBody.addEventListener("dragleave", function (event) {
        const columnElement = stackBody.closest(".deckbuilder-stack-column");

        if (columnElement && !columnElement.contains(event.relatedTarget)) {
          columnElement.classList.remove("deckbuilder-stack-column-over");
          clearStackInsertionMarkers();
        }
      });

      stackBody.addEventListener("drop", async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const columnElement = stackBody.closest(".deckbuilder-stack-column");
        const rawColumnKey = columnElement
          ? columnElement.dataset.stackColumn || "0"
          : "0";
        const droppedItem = getDeckbuilderDragTransfer(event);

        if (rawColumnKey === "commander" || rawColumnKey === "partner") {
          return;
        }

        draggedDeckbuilderItem = null;
        clearDropZoneState();

        if (!droppedItem) {
          return;
        }

        try {
          if (columnElement) {
            columnElement.classList.add("deckbuilder-drop-zone-working");
          }

          let payload = null;

          if (droppedItem.type === "basic-land") {
            payload = await updateBasicLand(droppedItem.landName, "add");

            if (payload && payload.ok) {
              payload._basicLandCountsAuthoritative = true;
            }
          } else if (droppedItem.type === "picked-card") {
            if (droppedItem.isBasicLand === "1") {
              return;
            }

            const targetColumnKey =
              normalizeDeckbuilderStackColumnKey(rawColumnKey) ||
              inferDeckbuilderStackColumnKey({
                dataset: {
                  cardName: droppedItem.cardName || "",
                  cardTypeLine: "",
                  cardManaValue: "0",
                },
              });

            const insertBeforeDeckCardId = getStackInsertBeforeDeckCardId(
              stackBody,
              event.clientY,
            );

            payload = await submitDeckbuilderStackLayout(
              droppedItem,
              targetColumnKey,
              insertBeforeDeckCardId,
            );
          }

          if (payload) {
            applyDeckbuilderPayload(payload);
          }
        } catch (error) {
          showDeckbuilderError(error);
        } finally {
          if (columnElement) {
            columnElement.classList.remove("deckbuilder-drop-zone-working");
          }
        }
      });
    });
  }

  function buildStackColumnsForZone(listElement) {
    if (!listElement) {
      return;
    }

    const existingCards = getDeckbuilderCards(listElement).sort(
      compareDeckbuilderCards,
    );

    const columns = {};

    listElement.innerHTML = "";

    getDeckbuilderStackColumnDefs().forEach(function (columnDef) {
      const column = document.createElement("div");
      column.className = "deckbuilder-stack-column";
      column.dataset.stackColumn = columnDef.key;

      const title = document.createElement("div");
      title.className = "deckbuilder-stack-column-title";
      title.textContent = columnDef.label;

      const body = document.createElement("div");
      body.className = "deckbuilder-stack-column-body";
      body.dataset.stackColumn = columnDef.key;

      column.appendChild(title);
      column.appendChild(body);
      listElement.appendChild(column);
      columns[columnDef.key] = body;
    });

    existingCards.forEach(function (cardElement) {
      const columnKey = getDeckbuilderStackColumnKey(cardElement);
      const targetColumn = columns[columnKey] || columns["0"];

      targetColumn.appendChild(cardElement);
    });

    Array.from(
      listElement.querySelectorAll(".deckbuilder-stack-column"),
    ).forEach(function (columnElement) {
      const hasCards = Boolean(
        columnElement.querySelector(".deckbuilder-card"),
      );
      columnElement.classList.toggle("hidden", !hasCards);
    });

    bindStackColumnDropTargets();
    bindDragSources();
    bindHoverPreviews();
    bindCardContextMenus();
    bindDeckbuilderSelectionHandlers();
  }

  function restoreFlatZoneFromStack(listElement) {
    if (!listElement) {
      return;
    }

    const cards = getDeckbuilderCards(listElement);

    listElement.innerHTML = "";

    cards.forEach(function (cardElement) {
      listElement.appendChild(cardElement);
    });
  }

  function setViewMode(viewMode) {
    const nextViewMode =
      viewMode === "stack" ? "stack" : viewMode === "list" ? "list" : "grid";

    clearDeckbuilderStackHoverExpansion();
    hideHoverPreview();

    if (deckbuilderViewMode === "stack" && nextViewMode !== "stack") {
      restoreFlatZoneFromStack(deckList);
    }

    deckbuilderViewMode = nextViewMode;

    deckbuilderPreferences.set(
      DECKBUILDER_PREFERENCE_KEYS.viewMode,
      deckbuilderViewMode,
    );

    workspace.classList.toggle(
      "deckbuilder-list-active",
      deckbuilderViewMode === "list",
    );
    workspace.classList.toggle(
      "deckbuilder-grid-active",
      deckbuilderViewMode === "grid",
    );
    workspace.classList.toggle(
      "deckbuilder-stack-active",
      deckbuilderViewMode === "stack",
    );

    if (listViewButton) {
      listViewButton.classList.toggle(
        "campaign-test-draft-zone-view-button-active",
        deckbuilderViewMode === "list",
      );
    }

    if (gridViewButton) {
      gridViewButton.classList.toggle(
        "campaign-test-draft-zone-view-button-active",
        deckbuilderViewMode === "grid",
      );
    }

    if (stackViewButton) {
      stackViewButton.classList.toggle(
        "campaign-test-draft-zone-view-button-active",
        deckbuilderViewMode === "stack",
      );
    }

    if (deckbuilderViewMode === "stack") {
      sortDeckbuilderZone(sideboardList);
      buildStackColumnsForZone(deckList);
      bindDragSources();
      bindHoverPreviews();
    } else {
      sortDeckbuilderZones();
      bindDragSources();
      bindHoverPreviews();
    }

    updateCounts();
  }

  function setZoneSplitFromPointer(clientY) {
    const mainElement = document.querySelector(".deckbuilder-main");

    if (!mainElement) {
      return;
    }

    const mainRect = mainElement.getBoundingClientRect();
    let sideboardRatio =
      (clientY - mainRect.top) / Math.max(1, mainRect.height);

    sideboardRatio = Math.max(0.18, Math.min(0.72, sideboardRatio));

    workspace.style.setProperty(
      "--deckbuilder-sideboard-flex",
      String(sideboardRatio),
    );
    workspace.style.setProperty(
      "--deckbuilder-deck-flex",
      String(1 - sideboardRatio),
    );
  }

  function bindBasicLandButtons() {
    Array.from(
      document.querySelectorAll(".campaign-test-draft-basic-land-button"),
    ).forEach(function (button) {
      if (button.dataset.basicLandBound === "1") {
        return;
      }

      button.dataset.basicLandBound = "1";

      button.addEventListener("click", async function () {
        const landName = button.dataset.landName || "";
        const action = button.dataset.basicLandAction || "add";

        if (!landName) {
          return;
        }

        button.disabled = true;

        try {
          const payload = await updateBasicLand(landName, action);

          if (payload && payload.ok) {
            payload._basicLandCountsAuthoritative = true;
          }

          applyDeckbuilderPayload(payload);
        } catch (error) {
          showDeckbuilderError(error);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function getDeckbuilderCopyCards(listElement) {
    if (!listElement) {
      return [];
    }

    return getDeckbuilderCards(listElement)
      .map(function (cardElement) {
        return {
          cardName: String(cardElement.dataset.cardName || "").trim(),
          setCode: String(cardElement.dataset.cardSetCode || "")
            .trim()
            .toUpperCase(),
          collectorNumber: String(
            cardElement.dataset.cardCollectorNumber || "",
          ).trim(),
          currentZone: String(cardElement.dataset.currentZone || "").trim(),
        };
      })
      .filter(function (card) {
        return Boolean(card.cardName);
      });
  }

  function buildDecklistTextFromCards(cards, copyFormat) {
    const counts = {};

    (cards || []).forEach(function (card) {
      const cleanCardName = String(card.cardName || "").trim();

      if (!cleanCardName) {
        return;
      }

      const detailKey = [
        cleanCardName,
        String(card.setCode || "")
          .trim()
          .toUpperCase(),
        String(card.collectorNumber || "").trim(),
      ].join("||");

      const key = copyFormat === "detailed" ? detailKey : cleanCardName;

      if (!counts[key]) {
        counts[key] = {
          quantity: 0,
          cardName: cleanCardName,
          setCode: String(card.setCode || "")
            .trim()
            .toUpperCase(),
          collectorNumber: String(card.collectorNumber || "").trim(),
        };
      }

      counts[key].quantity += 1;
    });

    return Object.keys(counts)
      .sort(function (a, b) {
        return counts[a].cardName.localeCompare(counts[b].cardName);
      })
      .map(function (key) {
        const item = counts[key];

        if (copyFormat === "detailed") {
          const printParts = [];

          if (item.setCode) {
            printParts.push(item.setCode);
          }

          if (item.collectorNumber) {
            printParts.push("#" + item.collectorNumber);
          }

          if (printParts.length) {
            return (
              item.quantity +
              " " +
              item.cardName +
              " (" +
              printParts.join(" ") +
              ")"
            );
          }
        }

        return item.quantity + " " + item.cardName;
      })
      .join("\n");
  }

  function buildDecklistText(copyFormat) {
    const deckText = buildDecklistTextFromCards(
      getDeckbuilderCopyCards(deckList),
      copyFormat,
    );

    const sideboardText = buildDecklistTextFromCards(
      getDeckbuilderCopyCards(sideboardList),
      copyFormat,
    );

    if (deckText && sideboardText) {
      return deckText + "\n\nSideboard\n" + sideboardText;
    }

    return deckText || sideboardText || "";
  }

  async function copyDecklist(copyFormat) {
    const cleanCopyFormat = copyFormat === "detailed" ? "detailed" : "simple";
    const decklistText = buildDecklistText(cleanCopyFormat);

    if (!decklistText) {
      showDeckbuilderError(new Error("No decklist cards were found."));
      return;
    }

    function showCopiedState() {
      if (copyDecklistButton) {
        const originalText = copyDecklistButton.textContent;
        copyDecklistButton.textContent = "Copied";

        window.setTimeout(function () {
          copyDecklistButton.textContent = originalText || "Copy";
        }, 1200);
      }

      if (window.iMomirToast) {
        window.iMomirToast.success(
          cleanCopyFormat === "detailed"
            ? "Detailed decklist copied."
            : "Decklist copied.",
        );
      }
    }

    try {
      if (
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        throw new Error("Clipboard API is not available.");
      }

      await navigator.clipboard.writeText(decklistText);
      showCopiedState();
    } catch (error) {
      console.error(error);

      const fallbackTextArea = document.createElement("textarea");
      fallbackTextArea.value = decklistText;
      fallbackTextArea.setAttribute("readonly", "readonly");
      fallbackTextArea.style.position = "fixed";
      fallbackTextArea.style.left = "-9999px";
      fallbackTextArea.style.top = "0";
      document.body.appendChild(fallbackTextArea);
      fallbackTextArea.focus();
      fallbackTextArea.select();

      try {
        const copied = document.execCommand("copy");

        if (!copied) {
          throw new Error("Fallback copy command failed.");
        }

        showCopiedState();
      } catch (fallbackError) {
        console.error(fallbackError);
        showDeckbuilderError(
          new Error("Could not copy decklist to clipboard."),
        );
      } finally {
        document.body.removeChild(fallbackTextArea);
      }
    }
  }

  function setDeckbuilderCopyFormat(copyFormat) {
    deckbuilderCopyFormat = copyFormat === "detailed" ? "detailed" : "simple";

    if (copyDecklistButton) {
      copyDecklistButton.dataset.copyFormat = deckbuilderCopyFormat;
    }

    Array.from(
      document.querySelectorAll(".deckbuilder-copy-menu-item"),
    ).forEach(function (menuItem) {
      menuItem.classList.toggle(
        "deckbuilder-copy-menu-item-active",
        menuItem.dataset.copyFormat === deckbuilderCopyFormat,
      );
    });
  }

  function openDeckbuilderAlternateImageModal(cardUuid, cardName) {
    const cleanCardUuid = String(cardUuid || "").trim();
    const cleanCardName = String(cardName || "").trim();

    if (!cleanCardUuid) {
      showDeckbuilderError(
        new Error("Card UUID was not found for Alternate Image Settings."),
      );
      return;
    }

    if (
      !window.iMomirAlternateImage ||
      typeof window.iMomirAlternateImage.open !== "function"
    ) {
      showDeckbuilderError(
        new Error("Alternate Image modal is not available on this page."),
      );
      return;
    }

    window.iMomirAlternateImage.open(
      cleanCardUuid,
      cleanCardName || cleanCardUuid,
      {
        foilUpdateUrl: "",
        isFoil: "0",
      },
    );
  }

  function openChangePrintingModal(changeTarget) {
    activeChangePrintingTarget = changeTarget || null;

    if (!activeChangePrintingTarget || !deckbuilderCardSearchModal) {
      return;
    }

    let updateUrl = changePrintingUrl;

    if (activeChangePrintingTarget.landName) {
      updateUrl +=
        "?land_name=" +
        encodeURIComponent(activeChangePrintingTarget.landName || "");
    } else if (activeChangePrintingTarget.deckCardId) {
      updateUrl +=
        "?deck_card_id=" +
        encodeURIComponent(activeChangePrintingTarget.deckCardId || "");
    }

    deckbuilderCardSearchModal.openChangePrinting({
      cardName:
        activeChangePrintingTarget.cardName ||
        activeChangePrintingTarget.landName ||
        "",
      currentCardUuid: activeChangePrintingTarget.currentCardUuid || "",
      updateUrl: updateUrl,
    });
  }

  function setLandPaletteQuantityLabels(landName) {
    const cleanLandName = String(landName || "Land").trim() || "Land";

    if (landPaletteAddMenuLabel) {
      landPaletteAddMenuLabel.textContent = "Add " + cleanLandName;
    }

    Array.from(
      document.querySelectorAll(".deckbuilder-land-palette-quantity-item"),
    ).forEach(function (quantityItem) {
      const quantity = parseInt(quantityItem.dataset.landQuantity || "1", 10);
      const safeQuantity = Number.isFinite(quantity) ? quantity : 1;

      quantityItem.textContent = String(safeQuantity) + " " + cleanLandName;
    });
  }

  function setLandPaletteContextMenuOpen(isOpen, x, y) {
    if (!landPaletteContextMenu) {
      return;
    }

    landPaletteContextMenu.classList.toggle("hidden", !isOpen);
    landPaletteContextMenu.setAttribute(
      "aria-hidden",
      isOpen ? "false" : "true",
    );

    if (landPaletteQuantityMenu) {
      landPaletteQuantityMenu.classList.add("hidden");
    }

    if (!isOpen) {
      activeLandPaletteCard = null;
      return;
    }

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const menuWidth = landPaletteContextMenu.offsetWidth || 230;
    const menuHeight = landPaletteContextMenu.offsetHeight || 320;

    const left = Math.max(10, Math.min(x, viewportWidth - menuWidth - 10));
    const top = Math.max(10, Math.min(y, viewportHeight - menuHeight - 10));

    landPaletteContextMenu.style.left = left + "px";
    landPaletteContextMenu.style.top = top + "px";
  }

  function openLandPaletteContextMenu(event, landElement) {
    event.preventDefault();
    event.stopPropagation();

    if (!landElement || landElement.dataset.isLandPalette !== "1") {
      return;
    }

    activeLandPaletteCard = landElement;

    const landName =
      landElement.dataset.basicLandName ||
      landElement.dataset.cardName ||
      "Land";

    setLandPaletteQuantityLabels(landName);
    hideHoverPreview();
    setDeckbuilderCopyMenuOpen(false);
    setDeckbuilderContextMenuOpen(false);
    setLandPaletteContextMenuOpen(true, event.clientX, event.clientY);
  }

  async function addSideboardPaletteLandQuantity(quantity) {
    if (!activeLandPaletteCard) {
      return;
    }

    const landName =
      activeLandPaletteCard.dataset.basicLandName ||
      activeLandPaletteCard.dataset.cardName ||
      "";
    const safeQuantity = Math.max(
      1,
      Math.min(30, parseInt(quantity || "1", 10) || 1),
    );

    if (!landName) {
      showDeckbuilderError(new Error("Basic Land name was not found."));
      return;
    }

    setLandPaletteContextMenuOpen(false);

    try {
      let latestPayload = null;

      for (let landIndex = 0; landIndex < safeQuantity; landIndex += 1) {
        latestPayload = await updateBasicLand(landName, "add");
      }

      if (latestPayload) {
        latestPayload._basicLandCountsAuthoritative = true;
        applyDeckbuilderPayload(latestPayload);
      }
    } catch (error) {
      showDeckbuilderError(error);
    }
  }

  function setDeckbuilderContextMenuOpen(isOpen, x, y) {
    if (!cardContextMenu) {
      return;
    }

    cardContextMenu.classList.toggle("hidden", !isOpen);
    cardContextMenu.setAttribute("aria-hidden", isOpen ? "false" : "true");

    if (!isOpen) {
      activeContextCard = null;
      return;
    }

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const menuWidth = cardContextMenu.offsetWidth || 230;
    const menuHeight = cardContextMenu.offsetHeight || 260;

    const left = Math.max(10, Math.min(x, viewportWidth - menuWidth - 10));
    const top = Math.max(10, Math.min(y, viewportHeight - menuHeight - 10));

    cardContextMenu.style.left = left + "px";
    cardContextMenu.style.top = top + "px";
  }

  function getCardContextPayload(cardElement) {
    if (!cardElement) {
      return null;
    }

    return {
      sourceKind:
        cardElement.dataset.sourceKind ||
        (cardElement.dataset.isBasicLand === "1" ? "basic_land" : "deck_card"),
      deckCardId: cardElement.dataset.deckCardId || "",
      cardUuid: cardElement.dataset.cardUuid || "",
      cardName: cardElement.dataset.cardName || "",
      currentZone: cardElement.dataset.currentZone || "deck",
      deckRole: cardElement.dataset.deckRole || "main",
      isBasicLand: cardElement.dataset.isBasicLand || "0",
      isFoil: cardElement.dataset.isFoil || "0",
    };
  }

  function setDeckbuilderContextActionVisible(actionName, isVisible) {
    if (!cardContextMenu) {
      return;
    }

    const menuItem = cardContextMenu.querySelector(
      '[data-context-action="' + actionName + '"]',
    );

    if (menuItem) {
      menuItem.classList.toggle("hidden", !isVisible);
    }
  }

  function setDeckbuilderContextActionText(actionName, textValue) {
    if (!cardContextMenu) {
      return;
    }

    const menuItem = cardContextMenu.querySelector(
      '[data-context-action="' + actionName + '"]',
    );

    if (menuItem) {
      menuItem.textContent = textValue;
    }
  }

  function updateCardContextMenuLabels(cardElement) {
    const payload = getCardContextPayload(cardElement);

    if (!payload) {
      return;
    }

    const selectedCards = getDeckbuilderSelectedCards(payload.currentZone);
    const isMultiSelection =
      selectedCards.length > 1 &&
      cardElement.classList.contains("deckbuilder-card-selected");
    const targetZone = payload.currentZone === "deck" ? "sideboard" : "deck";

    const isSpecialDeckRole =
      payload.deckRole === "commander" || payload.deckRole === "partner";
    const isBasicLand = payload.isBasicLand === "1";

    setDeckbuilderContextActionVisible("duplicate", !isMultiSelection);
    setDeckbuilderContextActionVisible("change-printing", !isMultiSelection);
    setDeckbuilderContextActionVisible("alternate-image", !isMultiSelection);

    setDeckbuilderContextActionVisible(
      "upscale-image",
      !isMultiSelection && Boolean(String(payload.cardUuid || "").trim()),
    );

    setDeckbuilderContextActionVisible(
      "set_commander",
      !isMultiSelection && !isBasicLand && payload.deckRole !== "commander",
    );
    setDeckbuilderContextActionVisible(
      "set_partner",
      !isMultiSelection && !isBasicLand && payload.deckRole !== "partner",
    );
    setDeckbuilderContextActionVisible(
      "clear_deck_role",
      !isMultiSelection && isSpecialDeckRole,
    );

    setDeckbuilderContextActionText(
      "remove",
      isMultiSelection ? "Remove Cards" : "Remove card",
    );

    if (contextMoveButton) {
      contextMoveButton.textContent =
        targetZone === "deck" ? "Move to Deck" : "Move to Sideboard";
    }

    const foilAction = payload.isFoil === "1" ? "remove_foil" : "set_foil";
    const foilText = payload.isFoil === "1" ? "Remove Foil" : "Set Foil";

    setDeckbuilderContextActionText(
      "foil",
      isMultiSelection ? foilText + " on Cards" : foilText,
    );

    if (payload.deckRole === "commander") {
      setDeckbuilderContextActionText(
        "clear_deck_role",
        "Clear Commander Slot",
      );
    } else if (payload.deckRole === "partner") {
      setDeckbuilderContextActionText("clear_deck_role", "Clear Partner Slot");
    }

    const foilMenuItem = cardContextMenu
      ? cardContextMenu.querySelector('[data-context-action="foil"]')
      : null;

    if (foilMenuItem) {
      foilMenuItem.dataset.resolvedContextAction = foilAction;
    }
  }

  function openCardContextMenu(event, cardElement) {
    event.preventDefault();
    event.stopPropagation();

    if (!cardElement || cardElement.dataset.isLandPalette === "1") {
      return;
    }

    const cardZone = cardElement.dataset.currentZone || "";

    if (
      !cardElement.classList.contains("deckbuilder-card-selected") ||
      (selectedDeckbuilderZone && selectedDeckbuilderZone !== cardZone)
    ) {
      clearDeckbuilderSelection();
      setDeckbuilderCardSelected(cardElement, true);
    }

    activeContextCard = cardElement;
    updateCardContextMenuLabels(cardElement);
    hideHoverPreview();
    setDeckbuilderCopyMenuOpen(false);
    setLandPaletteContextMenuOpen(false);
    setDeckbuilderContextMenuOpen(true, event.clientX, event.clientY);
  }

  async function submitDeckbuilderBulkCardAction(
    actionName,
    cardPayloads,
    targetZoneOverride,
  ) {
    if (!bulkCardActionUrl) {
      throw new Error("Deck Builder bulk card action URL was not configured.");
    }

    const cleanPayloads = (cardPayloads || []).filter(function (cardPayload) {
      return Boolean(cardPayload && cardPayload.deckCardId);
    });

    if (!cleanPayloads.length) {
      throw new Error("No saved Deck Builder cards were selected.");
    }

    const sourceZone = cleanPayloads[0].currentZone || "deck";
    const targetZone =
      targetZoneOverride || (sourceZone === "deck" ? "sideboard" : "deck");
    const formData = new FormData();

    formData.append("action", actionName || "");
    formData.append("target_zone", targetZone);

    if (["move", "remove", "set_foil", "remove_foil"].includes(actionName)) {
      formData.append("response_mode", "delta");
    }

    cleanPayloads.forEach(function (cardPayload) {
      formData.append("deck_card_ids", cardPayload.deckCardId || "");
    });

    return submitDeckbuilderAjax(bulkCardActionUrl, formData);
  }

  async function submitDeckbuilderCardAction(
    actionName,
    cardPayload,
    targetZoneOverride,
  ) {
    if (!cardActionUrl) {
      throw new Error("Deck Builder card action URL was not configured.");
    }

    const targetZone =
      targetZoneOverride ||
      (cardPayload.currentZone === "deck" ? "sideboard" : "deck");
    const formData = new FormData();

    formData.append("action", actionName || "");
    formData.append("deck_card_id", cardPayload.deckCardId || "");
    formData.append("card_name", cardPayload.cardName || "");
    formData.append("target_zone", targetZone);

    if (
      cardPayload.isBasicLand !== "1" &&
      ["move", "remove", "duplicate", "set_foil", "remove_foil"].includes(
        actionName,
      )
    ) {
      formData.append("response_mode", "delta");
    }

    return submitDeckbuilderAjax(cardActionUrl, formData);
  }

  async function handleDeckbuilderMultiCardAction(
    actionName,
    selectedCards,
    sourceZone,
  ) {
    if (!selectedCards || !selectedCards.length) {
      return;
    }

    if (
      actionName !== "move" &&
      actionName !== "remove" &&
      actionName !== "set_foil" &&
      actionName !== "remove_foil"
    ) {
      return;
    }

    const targetZone = sourceZone === "deck" ? "sideboard" : "deck";
    const cardPayloads = selectedCards
      .map(getCardContextPayload)
      .filter(Boolean);

    let actionLabel = "Updating Cards";

    if (actionName === "move") {
      actionLabel =
        targetZone === "deck" ? "Moving to Deck" : "Moving to Sideboard";
    } else if (actionName === "remove") {
      actionLabel = "Removing Cards";
    } else if (actionName === "set_foil") {
      actionLabel = "Setting Foil";
    } else if (actionName === "remove_foil") {
      actionLabel = "Removing Foil";
    }

    showDeckbuilderBulkActionStatus(
      actionLabel,
      "Updating " + String(cardPayloads.length) + " selected card(s)...",
    );

    try {
      const payload = await submitDeckbuilderBulkCardAction(
        actionName,
        cardPayloads,
        targetZone,
      );

      if (
        !applyDeckbuilderCardActionDelta(
          payload,
          cardPayloads,
          actionName,
          targetZone,
        )
      ) {
        applyDeckbuilderPayload(payload);
      }

      completeDeckbuilderBulkActionStatus(
        payload.message ||
          "Updated " + String(cardPayloads.length) + " selected card(s).",
      );
    } catch (error) {
      hideDeckbuilderBulkActionStatus();
      throw error;
    }
  }

  async function handleDeckbuilderContextAction(actionName) {
    const contextCard = activeContextCard;
    const cardPayload = getCardContextPayload(contextCard);

    if (!cardPayload) {
      setDeckbuilderContextMenuOpen(false);
      return;
    }

    const selectedCards = getDeckbuilderSelectedCards(cardPayload.currentZone);
    const isMultiSelection =
      selectedCards.length > 1 &&
      contextCard &&
      contextCard.classList.contains("deckbuilder-card-selected");

    setDeckbuilderContextMenuOpen(false);

    if (actionName === "print-selected") {
      openDeckbuilderPrintSelection(selectedCards, cardPayload.currentZone);

      return;
    }

    if (
      isMultiSelection &&
      (actionName === "move" ||
        actionName === "remove" ||
        actionName === "set_foil" ||
        actionName === "remove_foil")
    ) {
      try {
        await handleDeckbuilderMultiCardAction(
          actionName,
          selectedCards,
          cardPayload.currentZone,
        );
      } catch (error) {
        showDeckbuilderError(error);
      }

      return;
    }

    if (actionName === "change-printing") {
      if (
        cardPayload.sourceKind === "basic_land" ||
        cardPayload.isBasicLand === "1"
      ) {
        openChangePrintingModal({
          landName: cardPayload.cardName || "",
          cardName: cardPayload.cardName || "",
          currentCardUuid: cardPayload.cardUuid || "",
        });
      } else {
        openChangePrintingModal({
          deckCardId: cardPayload.deckCardId || "",
          cardName: cardPayload.cardName || "",
          currentCardUuid: cardPayload.cardUuid || "",
        });
      }

      return;
    }

    if (actionName === "alternate-image") {
      openDeckbuilderAlternateImageModal(
        cardPayload.cardUuid || "",
        cardPayload.cardName || "",
      );
      return;
    }

    if (actionName === "upscale-image") {
      const controlUrl = buildDeckbuilderUpscaleControlUrl(
        cardPayload.cardUuid,
      );

      if (!controlUrl) {
        showDeckbuilderError(
          new Error("Upscale controls are not available for this card."),
        );

        return;
      }

      if (
        !window.iMomirUpscaleControl ||
        !window.iMomirUpscaleControl.openUrl
      ) {
        showDeckbuilderError(new Error("Upscale controls are not available."));

        return;
      }

      try {
        await window.iMomirUpscaleControl.openUrl(controlUrl);
      } catch (error) {
        showDeckbuilderError(error);
      }

      return;
    }

    try {
      let payload = null;

      if (
        cardPayload.sourceKind === "basic_land" &&
        actionName === "duplicate"
      ) {
        payload = await updateBasicLand(cardPayload.cardName, "add");
        payload._basicLandCountsAuthoritative = true;
      } else if (
        cardPayload.sourceKind === "basic_land" &&
        (actionName === "remove" || actionName === "move")
      ) {
        payload = await updateBasicLand(cardPayload.cardName, "remove");
        payload._basicLandCountsAuthoritative = true;
      } else {
        payload = await submitDeckbuilderCardAction(actionName, cardPayload);
      }

      if (
        !applyDeckbuilderCardActionDelta(payload, [cardPayload], actionName)
      ) {
        applyDeckbuilderPayload(payload);
      }
    } catch (error) {
      showDeckbuilderError(error);
    }
  }

  function setDeckbuilderCopyMenuOpen(isOpen) {
    if (!copyDecklistMenu || !copyDecklistMenuButton) {
      return;
    }

    copyDecklistMenu.classList.toggle("hidden", !isOpen);
    copyDecklistMenuButton.setAttribute(
      "aria-expanded",
      isOpen ? "true" : "false",
    );
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      pickedSortMode = sortSelect.value || "rarity-desc";

      if (deckbuilderViewMode === "stack") {
        sortDeckbuilderZone(sideboardList);
        buildStackColumnsForZone(deckList);
      } else {
        sortDeckbuilderZones();
      }
    });
  }

  if (sideboardFilterButton) {
    sideboardFilterButton.addEventListener("click", function () {
      setSideboardFilterPanelVisible(!sideboardFiltersVisible);
    });
  }

  if (sideboardCollapseButton) {
    sideboardCollapseButton.addEventListener("click", function () {
      const isCurrentlyCollapsed = Boolean(
        deckbuilderMain &&
        deckbuilderMain.classList.contains("deckbuilder-sideboard-collapsed"),
      );

      setDeckbuilderSideboardCollapsed(!isCurrentlyCollapsed);
    });
  }

  if (sideboardCollapsedButton) {
    sideboardCollapsedButton.addEventListener("click", function () {
      setDeckbuilderSideboardCollapsed(false);
    });
  }

  if (deckFilterButton) {
    deckFilterButton.addEventListener("click", function () {
      setDeckFilterPanelVisible(!deckFiltersVisible);
    });
  }

  [
    sideboardFilterText,
    sideboardFilterRarity,
    sideboardFilterColor,
    sideboardFilterManaOperator,
    sideboardFilterManaValue,
    sideboardFilterType,
    sideboardFilterAlternateImage,
  ].forEach(function (filterElement) {
    if (!filterElement) {
      return;
    }

    filterElement.addEventListener("input", applySideboardFilters);
    filterElement.addEventListener("change", applySideboardFilters);
  });

  [
    deckFilterText,
    deckFilterRarity,
    deckFilterColor,
    deckFilterManaOperator,
    deckFilterManaValue,
    deckFilterType,
    deckFilterAlternateImage,
  ].forEach(function (filterElement) {
    if (!filterElement) {
      return;
    }

    filterElement.addEventListener("input", applyDeckFilters);
    filterElement.addEventListener("change", applyDeckFilters);
  });

  if (sideboardClearFiltersButton) {
    sideboardClearFiltersButton.addEventListener(
      "click",
      clearSideboardFilters,
    );
  }

  if (deckClearFiltersButton) {
    deckClearFiltersButton.addEventListener("click", clearDeckFilters);
  }

  if (cardSizeSelect) {
    cardSizeSelect.addEventListener("change", function () {
      updateDeckbuilderCardSize(cardSizeSelect.value || "100");
    });
  }

  if (listViewButton) {
    listViewButton.addEventListener("click", function () {
      setViewMode("list");
    });
  }

  if (gridViewButton) {
    gridViewButton.addEventListener("click", function () {
      setViewMode("grid");
    });
  }

  if (stackViewButton) {
    stackViewButton.addEventListener("click", function () {
      setViewMode("stack");
    });
  }

  if (selectAllButton) {
    selectAllButton.addEventListener("click", function () {
      selectAllDeckbuilderCardsInCurrentZone();
    });
  }

  if (clearSelectionButton) {
    clearSelectionButton.addEventListener("click", function () {
      clearDeckbuilderSelection();
    });
  }

  if (batchUpscaleButton) {
    batchUpscaleButton.addEventListener("click", openDeckbuilderBatchUpscale);
  }

  if (deckSelectAllButton) {
    deckSelectAllButton.addEventListener("click", function () {
      clearDeckbuilderSelection();

      getSelectableDeckbuilderCardsInZone("deck").forEach(
        function (cardElement) {
          setDeckbuilderCardSelected(cardElement, true);
        },
      );
    });
  }

  if (deckClearSelectionButton) {
    deckClearSelectionButton.addEventListener("click", function () {
      getDeckbuilderSelectedCards("deck").forEach(function (cardElement) {
        setDeckbuilderCardSelected(cardElement, false);
      });

      if (!getDeckbuilderSelectedCards().length) {
        selectedDeckbuilderZone = "";
      }
    });
  }

  const deckbuilderStatsModal = window.iMomirStatsModal.init({
    openButtonId: "deckbuilderStatsButton",
    title: "Deck Stats",
    subtitle: "Stats for the current main deck only.",
    totalLabel: "Deck Cards",
    averageManaValueExcludesLands: true,

    beforeOpen: function () {
      hideHoverPreview();
      setDeckbuilderCopyMenuOpen(false);
      setDeckbuilderContextMenuOpen(false);
      setLandPaletteContextMenuOpen(false);
    },

    getCards: getDeckbuilderStatsCardsForSharedModal,

    getSummaryItems: function (stats) {
      return [
        {
          label: "Deck Cards",
          value: stats.totalCards,
        },
        {
          label: "Lands",
          value: stats.landCount,
        },
        {
          label: "Creatures",
          value: stats.creatureCount,
        },
        {
          label: "Average MV",
          value: stats.averageManaValue.toFixed(1),
        },
      ];
    },
  });

  const deckbuilderPrintExportModal = window.iMomirPrintExportModal.init({
    openButtonId: "deckbuilderOpenPrintExportButton",
    printUrl: printUrl,
    exportZipUrl: exportZipUrl,

    beforeOpen: function () {
      setDeckbuilderCopyMenuOpen(false);
      setDeckbuilderContextMenuOpen(false);
      setLandPaletteContextMenuOpen(false);
      hideHoverPreview();
    },

    showMessage: function (messageText, isError) {
      if (!messageText) {
        return;
      }

      if (window.iMomirToast) {
        if (isError) {
          window.iMomirToast.error(messageText);
        } else {
          window.iMomirToast.success(messageText);
        }
      } else if (isError) {
        window.alert(messageText);
      }
    },
  });

  deckbuilderCardSearchModal = window.iMomirCardSearchModal.init({
    searchUrl: addCardSearchUrl || changePrintingOptionsUrl,
    addUrl: addCardUrl,
    bulkImportUrl: bulkImportUrl,
    bulkImportAddMostRecentUrl: bulkImportAddMostRecentUrl,
    bulkImportAddMostRecentText: "Add Most Recent to Deck",
    bulkImportAddMostRecentConfirmMessage:
      "This will add the most recent matching printing for each parsed card name directly to this deck's sideboard.",

    showMessage: function (messageText, isError) {
      if (!messageText) {
        return;
      }

      if (window.iMomirToast) {
        if (isError) {
          window.iMomirToast.error(messageText);
        } else {
          window.iMomirToast.success(messageText);
        }
      } else if (isError) {
        window.alert(messageText);
      }
    },

    bindZoomableImages: function () {
      bindHoverPreviews();
    },

    getExistingCardLookup: function () {
      const lookup = {
        cardUuids: new Set(),
        printingKeys: new Set(),
      };

      Array.from(
        document.querySelectorAll(".deckbuilder-card[data-card-uuid]"),
      ).forEach(function (cardElement) {
        const cardUuid = String(cardElement.dataset.cardUuid || "").trim();

        if (cardUuid) {
          lookup.cardUuids.add(cardUuid);
        }
      });

      return lookup;
    },

    onAddSuccess: function (payload, context) {
      if (payload.response_mode === "delta") {
        if (!applyDeckbuilderAddCardDelta(payload, context)) {
          window.location.reload();
          return;
        }
      } else {
        applyDeckbuilderPayload(payload);
      }

      if (context && typeof context.setStatus === "function") {
        context.setStatus(payload.message || "Card added to sideboard.", false);
      }
    },

    onChangePrintingSuccess: function (payload, context) {
      const changedLandName = activeChangePrintingTarget
        ? activeChangePrintingTarget.landName || ""
        : "";

      if (changedLandName) {
        payload._basicLandCountsAuthoritative = true;
        payload._basicLandPaletteAuthoritative = true;
        payload = forceBasicLandPrintingIntoPayload(
          payload,
          changedLandName,
          context.cardUuid || "",
        );
      }

      applyDeckbuilderPayload(payload);

      if (context && typeof context.close === "function") {
        context.close();
      }

      if (window.iMomirToast) {
        window.iMomirToast.success(payload.message || "Printing changed.");
      }

      activeChangePrintingTarget = null;
    },
  });

  if (openAddCardsButton) {
    openAddCardsButton.addEventListener("click", function () {
      if (deckbuilderCardSearchModal) {
        deckbuilderCardSearchModal.openAddCards();
      }
    });
  }

  if (saveDeckButton) {
    saveDeckButton.addEventListener("click", saveDeckSettings);
  }

  if (deckNameInput) {
    deckNameInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        saveDeckSettings();
      }
    });
  }

  if (deckTypeSelect) {
    deckTypeSelect.addEventListener("change", function () {
      updateDeckbuilderDeckTypeSummary(deckTypeSelect.value);
    });
  }

  if (loadDeckButton) {
    loadDeckButton.addEventListener("click", openLoadDeckModal);
  }

  if (loadDeckBackdrop) {
    loadDeckBackdrop.addEventListener("click", closeLoadDeckModal);
  }

  if (loadDeckCloseButton) {
    loadDeckCloseButton.addEventListener("click", closeLoadDeckModal);
  }

  if (loadDeckSearchButton) {
    loadDeckSearchButton.addEventListener("click", function () {
      loadSavedDeckRows().catch(showDeckbuilderError);
    });
  }

  if (loadDeckSearchInput) {
    loadDeckSearchInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        loadSavedDeckRows().catch(showDeckbuilderError);
      }
    });
  }

  if (deleteDeckButton) {
    deleteDeckButton.addEventListener("click", openDeleteDeckModal);
  }

  if (deleteDeckBackdrop) {
    deleteDeckBackdrop.addEventListener("click", closeDeleteDeckModal);
  }

  if (deleteDeckCloseButton) {
    deleteDeckCloseButton.addEventListener("click", closeDeleteDeckModal);
  }

  if (deleteDeckCancelButton) {
    deleteDeckCancelButton.addEventListener("click", closeDeleteDeckModal);
  }

  if (deleteDeckConfirmInput) {
    deleteDeckConfirmInput.addEventListener(
      "input",
      updateDeleteDeckConfirmState,
    );

    deleteDeckConfirmInput.addEventListener("keydown", function (event) {
      if (
        event.key === "Enter" &&
        String(deleteDeckConfirmInput.value || "").trim() === "DELETE"
      ) {
        event.preventDefault();
        deleteCurrentDeck();
      }
    });
  }

  if (deleteDeckConfirmButton) {
    deleteDeckConfirmButton.addEventListener("click", deleteCurrentDeck);
  }

  if (copyDecklistButton) {
    copyDecklistButton.addEventListener("click", function () {
      copyDecklist(deckbuilderCopyFormat);
    });
  }

  if (copyDecklistMenuButton) {
    copyDecklistMenuButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      setDeckbuilderCopyMenuOpen(
        copyDecklistMenu ? copyDecklistMenu.classList.contains("hidden") : true,
      );
    });
  }

  Array.from(document.querySelectorAll(".deckbuilder-copy-menu-item")).forEach(
    function (menuItem) {
      menuItem.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        setDeckbuilderCopyFormat(menuItem.dataset.copyFormat || "simple");
        setDeckbuilderCopyMenuOpen(false);
        copyDecklist(deckbuilderCopyFormat);
      });
    },
  );

  Array.from(
    document.querySelectorAll(".deckbuilder-card-context-menu-item"),
  ).forEach(function (menuItem) {
    menuItem.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (
        menuItem.classList.contains(
          "deckbuilder-card-context-menu-item-disabled",
        )
      ) {
        showDeckbuilderError(
          new Error("This option will be wired in the next pass."),
        );
        setDeckbuilderContextMenuOpen(false);
        return;
      }

      handleDeckbuilderContextAction(
        menuItem.dataset.resolvedContextAction ||
          menuItem.dataset.contextAction ||
          "",
      );

      menuItem.dataset.resolvedContextAction = "";
    });
  });

  Array.from(
    document.querySelectorAll(".deckbuilder-land-palette-quantity-item"),
  ).forEach(function (quantityItem) {
    quantityItem.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      addSideboardPaletteLandQuantity(quantityItem.dataset.landQuantity || "1");
    });
  });

  Array.from(document.querySelectorAll("[data-land-context-action]")).forEach(
    function (menuItem) {
      menuItem.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const actionName = menuItem.dataset.landContextAction || "";

        if (actionName === "change-printing") {
          const landName = activeLandPaletteCard
            ? activeLandPaletteCard.dataset.basicLandName ||
              activeLandPaletteCard.dataset.cardName ||
              ""
            : "";
          const currentCardUuid = activeLandPaletteCard
            ? activeLandPaletteCard.dataset.cardUuid || ""
            : "";

          setLandPaletteContextMenuOpen(false);

          openChangePrintingModal({
            landName: landName,
            cardName: landName,
            currentCardUuid: currentCardUuid,
          });
          return;
        }

        if (actionName === "alternate-image") {
          const cardUuid = activeLandPaletteCard
            ? activeLandPaletteCard.dataset.cardUuid || ""
            : "";
          const cardName = activeLandPaletteCard
            ? activeLandPaletteCard.dataset.basicLandName ||
              activeLandPaletteCard.dataset.cardName ||
              ""
            : "";

          setLandPaletteContextMenuOpen(false);

          openDeckbuilderAlternateImageModal(cardUuid, cardName);
          return;
        }

        showDeckbuilderError(
          new Error("This option will be wired in the next pass."),
        );
        setLandPaletteContextMenuOpen(false);
      });
    },
  );

  document.addEventListener("click", function (event) {
    if (
      copyDecklistMenu &&
      copyDecklistMenuButton &&
      !copyDecklistMenu.contains(event.target) &&
      !copyDecklistMenuButton.contains(event.target)
    ) {
      setDeckbuilderCopyMenuOpen(false);
    }

    if (cardContextMenu && !cardContextMenu.contains(event.target)) {
      setDeckbuilderContextMenuOpen(false);
    }

    if (
      landPaletteContextMenu &&
      !landPaletteContextMenu.contains(event.target)
    ) {
      setLandPaletteContextMenuOpen(false);
    }
  });

  if (zoneResizeHandle) {
    zoneResizeHandle.addEventListener("pointerdown", function (event) {
      isResizingZones = true;
      zoneResizeHandle.setPointerCapture(event.pointerId);
      document.body.classList.add("campaign-test-draft-zone-resizing");
      event.preventDefault();
    });

    zoneResizeHandle.addEventListener("pointermove", function (event) {
      if (!isResizingZones) {
        return;
      }

      setZoneSplitFromPointer(event.clientY);
    });

    zoneResizeHandle.addEventListener("pointerup", function (event) {
      isResizingZones = false;
      zoneResizeHandle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("campaign-test-draft-zone-resizing");
    });

    zoneResizeHandle.addEventListener("pointercancel", function (event) {
      isResizingZones = false;
      zoneResizeHandle.releasePointerCapture(event.pointerId);
      document.body.classList.remove("campaign-test-draft-zone-resizing");
    });
  }

  function updateDeckbuilderCardAlternateImageState(
    cardUuid,
    hasAlternateSource,
    removeBleed,
  ) {
    if (!cardUuid) {
      return;
    }

    const hasAlternateValue =
      hasAlternateSource === null || hasAlternateSource === undefined
        ? null
        : hasAlternateSource
          ? "1"
          : "0";

    const removeBleedValue =
      removeBleed === null || removeBleed === undefined
        ? null
        : removeBleed
          ? "1"
          : "0";

    document
      .querySelectorAll(
        '.deckbuilder-card[data-card-uuid="' + CSS.escape(cardUuid) + '"]',
      )
      .forEach(function (cardElement) {
        if (hasAlternateValue !== null) {
          cardElement.dataset.hasAlternateImage = hasAlternateValue;
        }

        if (removeBleedValue !== null) {
          cardElement.dataset.alternateImageRemoveBleed = removeBleedValue;
        }
      });
  }

  document.addEventListener("imomir:card-image-refreshed", function (event) {
    const detail = event.detail || {};
    const cardUuid = detail.cardUuid || "";
    const imageUrl = detail.imageUrl || "";

    if (!cardUuid) {
      return;
    }

    updateDeckbuilderCardAlternateImageState(
      cardUuid,
      detail.hasAlternateSource,
      detail.removeBleed,
    );

    if (imageUrl) {
      document
        .querySelectorAll(
          '.deckbuilder-card[data-card-uuid="' +
            CSS.escape(cardUuid) +
            '"] img',
        )
        .forEach(function (imageElement) {
          imageElement.src = imageUrl;
        });

      document
        .querySelectorAll(
          '.deckbuilder-basic-land-card[data-card-uuid="' +
            CSS.escape(cardUuid) +
            '"]',
        )
        .forEach(function (landElement) {
          landElement.dataset.cardImageSrc = imageUrl;
        });
    }

    hideHoverPreview();
    bindHoverPreviews();
    applySideboardFilters();
    applyDeckFilters();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      let handledEscape = false;

      hideHoverPreview();

      if (deleteDeckModal && !deleteDeckModal.classList.contains("hidden")) {
        closeDeleteDeckModal();
        handledEscape = true;
      }

      if (loadDeckModal && !loadDeckModal.classList.contains("hidden")) {
        closeLoadDeckModal();
        handledEscape = true;
      }

      if (deckbuilderStatsModal && deckbuilderStatsModal.isOpen()) {
        deckbuilderStatsModal.close();
        handledEscape = true;
      }

      if (copyDecklistMenu && !copyDecklistMenu.classList.contains("hidden")) {
        setDeckbuilderCopyMenuOpen(false);
        handledEscape = true;
      }

      if (deckbuilderPrintExportModal && deckbuilderPrintExportModal.isOpen()) {
        deckbuilderPrintExportModal.close();
        handledEscape = true;
      }

      if (cardContextMenu && !cardContextMenu.classList.contains("hidden")) {
        setDeckbuilderContextMenuOpen(false);
        handledEscape = true;
      }

      if (
        landPaletteContextMenu &&
        !landPaletteContextMenu.classList.contains("hidden")
      ) {
        setLandPaletteContextMenuOpen(false);
        handledEscape = true;
      }

      if (deckbuilderCardSearchModal && deckbuilderCardSearchModal.isOpen()) {
        deckbuilderCardSearchModal.close();
        handledEscape = true;
      }

      if (!handledEscape && getDeckbuilderSelectedCards().length) {
        clearDeckbuilderSelection();
        handledEscape = true;
      }

      if (handledEscape) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  });

  setDeckbuilderBasicLandCounts(getCurrentDeckBasicLandCounts());
  updateDeckbuilderCardSize(deckbuilderCardSize);
  setViewMode(deckbuilderViewMode);
  //sortDeckbuilderZones();
  setSideboardFilterPanelVisible(false);
  setDeckFilterPanelVisible(false);
  setDeckbuilderCopyFormat("simple");
  moveSideboardPaletteCardsToEnd();
  applySideboardFilters();
  applyDeckFilters();
  bindDragSources();
  bindDropZones();
  bindHoverPreviews();
  bindCardContextMenus();
  bindDeckbuilderSelectionHandlers();
  updateCounts();
})();
