// *** DECK BUILDER - Arrange and Edit Deck Cards ***
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
  let deckGroupBy = "mana";
  let deckbuilderUX = null;
  let deckbuilderAddDestination = "deck";
  let deckbuilderOrganization = JSON.parse(workspace?.dataset.organization || '{"revision":0,"groups":[],"assignments":{},"orders":{}}');
  const groupBySelect = document.getElementById("deckbuilderGroupBySelect");
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
  const deckCollapseButton = document.getElementById(
    "deckbuilderDeckCollapseButton",
  );
  const mobileToolbarToggle = document.getElementById(
    "deckbuilderMobileToolbarToggle",
  );
  const deckbuilderHeader = workspace
    ? workspace.querySelector(".deckbuilder-header")
    : null;
  const deckbuilderMobileMedia = window.matchMedia(
    "(max-width: 760px), (max-height: 600px) and (pointer: coarse)",
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
    return window.DeckadenceCardSizes.normalize(value);
  }

  const STACK_HOVER_EXPAND_DELAY_MS = 300;
  const MOBILE_CONTEXT_LONG_PRESS_MS = 550;
  const MOBILE_CONTEXT_MOVE_TOLERANCE_PX = 12;

  const defaultDeckbuilderViewMode = normalizeDeckbuilderViewMode(
    workspace.dataset.defaultViewMode || "grid",
  );

  const defaultDeckbuilderCardSize = normalizeDeckbuilderCardSize(
    workspace.dataset.defaultCardSize || "auto",
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
    const normalizedSizePercent = normalizeDeckbuilderCardSize(sizePercent);
    if (normalizedSizePercent !== "auto") {
      // The Deck Builder has a smaller baseline: 100% equals the shared scale's 80%.
      const baseCardWidth = 336 * 0.8;
      return Math.round(baseCardWidth * normalizedSizePercent / 100);
    }
    const style = getComputedStyle(deckList);
    const width = deckList.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.columnGap) || 12;
    let columns = Math.max(1, Math.ceil((width + gap) / (180 + gap)));
    if (deckbuilderViewMode === "stack") {
      // Size the groups that are actually displayed, not empty grid slots.
      // Custom groups remain visible as drop targets even when they are empty.
      const occupiedGroups = new Set(getDeckbuilderCards(deckList).map(getDeckbuilderStackColumnKey));
      const groupCount = getDeckbuilderStackColumnDefs().filter(group =>
        occupiedGroups.has(group.key) ||
        (deckGroupBy === "custom" && !["commander", "partner"].includes(group.key)),
      ).length;
      columns = Math.min(columns, Math.max(1, groupCount));
    }
    const fittedWidth = Math.max(96, Math.floor((width - gap * (columns - 1)) / columns));
    // Auto is independent of the percentage scale. Avoid oversized cards when
    // a deck has only one or two groups on a very wide screen.
    return deckbuilderViewMode === "stack" ? Math.min(320, fittedWidth) : fittedWidth;
  }

  function applyDeckbuilderCardSizeStyles() {
    const cardWidth = getDeckbuilderCardSizePixels(deckbuilderCardSize);
    const stackColumnWidth = Math.max(96, cardWidth);
    const stackCardWidth = Math.max(80, stackColumnWidth);
    const visibleStackStrip = Math.max(30, Math.round(stackCardWidth * 0.16));
    const cardHeight = Math.round(stackCardWidth * 1.4);
    const overlap = Math.max(0, cardHeight - visibleStackStrip);

    workspace.style.setProperty("--deckbuilder-card-width", cardWidth + "px");
    workspace.style.setProperty(
      "--deckbuilder-stack-column-width",
      stackColumnWidth + "px",
    );
    workspace.style.setProperty(
      "--deckbuilder-stack-overlap",
      "-" + overlap + "px",
    );
  }

  function updateDeckbuilderCardSize(sizePercent) {
    deckbuilderCardSize = normalizeDeckbuilderCardSize(sizePercent);
    workspace.classList.toggle("card-size-auto", deckbuilderCardSize === "auto");
    deckbuilderPreferences.set(DECKBUILDER_PREFERENCE_KEYS.cardSize, deckbuilderCardSize);
    applyDeckbuilderCardSizeStyles();

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
    const side = a.dataset.currentZone === "sideboard" && b.dataset.currentZone === "sideboard";
    const key = side ? "sideboard" : deckGroupBy + ":" + getDeckbuilderStackColumnKey(a);
    const order = deckbuilderOrganization.orders[key];
    if (order && (side || getDeckbuilderStackColumnKey(a) === getDeckbuilderStackColumnKey(b))) {
      const ai = order.indexOf(String(a.dataset.deckCardId)), bi = order.indexOf(String(b.dataset.deckCardId));
      const rank = (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      if (rank) return rank;
    }
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
    buildStackColumnsForZone(deckList);
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
    if (window.DeckadenceCardTags?.active("sideboard")) return true;
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
    if (window.DeckadenceCardTags && !window.DeckadenceCardTags.matches(cardElement, "sideboard")) return false;
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
    queueMicrotask(() => deckbuilderUX?.filtersChanged());
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

  function isDeckbuilderMobileLayout() {
    return deckbuilderMobileMedia.matches;
  }

  function setDeckbuilderMobileToolbarOpen(isOpen) {
    if (!deckbuilderHeader || !mobileToolbarToggle) {
      return;
    }

    const shouldOpen = isDeckbuilderMobileLayout() && Boolean(isOpen);

    deckbuilderHeader.classList.toggle(
      "deckbuilder-mobile-tools-open",
      shouldOpen,
    );

    mobileToolbarToggle.setAttribute(
      "aria-expanded",
      shouldOpen ? "true" : "false",
    );
    mobileToolbarToggle.title = shouldOpen
      ? "Hide Deck Controls"
      : "Show Deck Controls";
  }

  function setDeckbuilderMobileActiveZone(zoneName) {
    if (!deckbuilderMain) {
      return;
    }

    const activeZone = zoneName === "sideboard" ? "sideboard" : "deck";
    const sideboardIsActive = activeZone === "sideboard";

    if (isDeckbuilderMobileLayout()) {
      setDeckbuilderMobileToolbarOpen(false);
    }

    deckbuilderMain.classList.toggle(
      "deckbuilder-mobile-sideboard-active",
      sideboardIsActive,
    );
    deckbuilderMain.classList.toggle(
      "deckbuilder-mobile-deck-active",
      !sideboardIsActive,
    );

    if (sideboardCollapseButton) {
      sideboardCollapseButton.setAttribute(
        "aria-expanded",
        sideboardIsActive ? "true" : "false",
      );
      sideboardCollapseButton.setAttribute(
        "aria-label",
        sideboardIsActive ? "Collapse Sideboard" : "Expand Sideboard",
      );
      sideboardCollapseButton.title = sideboardIsActive
        ? "Collapse Sideboard"
        : "Expand Sideboard";
    }

    if (deckCollapseButton) {
      deckCollapseButton.setAttribute(
        "aria-expanded",
        sideboardIsActive ? "false" : "true",
      );
      deckCollapseButton.setAttribute(
        "aria-label",
        sideboardIsActive ? "Expand Deck" : "Collapse Deck",
      );
      deckCollapseButton.title = sideboardIsActive
        ? "Expand Deck"
        : "Collapse Deck";
    }

    hideHoverPreview();
    setDeckbuilderContextMenuOpen(false);
    setLandPaletteContextMenuOpen(false);
  }

  function applyDeckbuilderResponsiveLayout() {
    if (!deckbuilderMain) {
      return;
    }

    if (isDeckbuilderMobileLayout()) {
      setDeckbuilderMobileToolbarOpen(false);

      if (
        !deckbuilderMain.classList.contains(
          "deckbuilder-mobile-sideboard-active",
        ) &&
        !deckbuilderMain.classList.contains("deckbuilder-mobile-deck-active")
      ) {
        setDeckbuilderMobileActiveZone("deck");
      }

      return;
    }

    deckbuilderMain.classList.remove(
      "deckbuilder-mobile-sideboard-active",
      "deckbuilder-mobile-deck-active",
    );

    if (deckbuilderHeader) {
      deckbuilderHeader.classList.remove("deckbuilder-mobile-tools-open");
    }

    if (mobileToolbarToggle) {
      mobileToolbarToggle.setAttribute("aria-expanded", "false");
      mobileToolbarToggle.title = "Show Deck Controls";
    }

    setDeckbuilderSideboardCollapsed(
      deckbuilderMain.classList.contains("deckbuilder-sideboard-collapsed"),
    );

    if (deckCollapseButton) {
      deckCollapseButton.setAttribute("aria-expanded", "true");
      deckCollapseButton.setAttribute("aria-label", "Collapse Deck");
      deckCollapseButton.title = "Collapse Deck";
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
    window.DeckadenceCardTags?.reset("sideboard");
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
    if (window.DeckadenceCardTags?.active("deck")) return true;
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
    if (window.DeckadenceCardTags && !window.DeckadenceCardTags.matches(cardElement, "deck")) return false;
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

  document.addEventListener("deckadence:card-tags-changed", () => {applyDeckFilters(); applySideboardFilters();});
  document.addEventListener("deckadence:tag-filters-changed", event => {
    if (event.detail.scope === "deck") applyDeckFilters();
    if (event.detail.scope === "sideboard") applySideboardFilters();
  });

  function applyDeckFilters() {
    queueMicrotask(() => deckbuilderUX?.decorateGroups());
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
    window.DeckadenceCardTags?.reset("deck");
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
    queueMicrotask(() => deckbuilderUX?.refresh());
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
    )
      .trim()
      .toUpperCase();

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

  const initialDeckArt = document.getElementById("deckbuilderDeckArtImage");
  if (initialDeckArt) {
    const syncArtPlaceholder = () => initialDeckArt.parentElement.classList.toggle(
      "has-no-art", !initialDeckArt.naturalWidth,
    );
    initialDeckArt.addEventListener("load", syncArtPlaceholder);
    initialDeckArt.addEventListener("error", syncArtPlaceholder);
    syncArtPlaceholder();
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
    )
      .trim()
      .toUpperCase();

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
        const savedLand = (payload.human_deck_cards || []).filter(card =>
          Number(card.is_basic_land) === 1 && card.card_name === landName
        )[landIndex];
        deckList.insertAdjacentHTML(
          "beforeend",
          savedLand ? renderDeckbuilderCard(savedLand, "deck") : buildDeckBasicLandCardHtml(landName, landIndex),
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
      '" data-card-mana-cost="' + escapeHtml(safeCard.mana_cost || '') +
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
      '" data-foil-type="' + escapeHtml(safeCard.foil_type || "") +
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
    if (payload.organization?.groups) deckbuilderOrganization = payload.organization;
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
        cardElement.dataset.foilType = (payload.bulk_card_action_result || payload.card_action_result || {}).foil_type || "";

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
    if (result.inserted === false || (result.deck_card_id && workspace.querySelector('[data-deck-card-id="' + CSS.escape(String(result.deck_card_id)) + '"]'))) return true;
    const destination = result.deck_zone === "sideboard" ? "sideboard" : "deck";
    const targetList = destination === "deck" ? deckList : sideboardList;
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
      deck_zone: destination,
      is_basic_land: 0,
      sheet_is_foil: Number(result.sheet_is_foil || 0),
      deck_role: "main",
      stack_column: "",
      stack_order: "",
      rarity: resultRow.dataset.rarityDisplay || "",
      mana_value: resultRow.dataset.manaValue || "",
      mana_cost: resultRow.dataset.manaCost || "",
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

    cardTemplate.innerHTML = renderDeckbuilderCard(card, destination).trim();

    const cardElement = cardTemplate.content.firstElementChild;

    if (!cardElement) {
      return false;
    }

    const firstPaletteCard = targetList.querySelector(
      ".deckbuilder-basic-land-card[data-is-land-palette='1']",
    );

    if (firstPaletteCard) {
      firstPaletteCard.before(cardElement);
    } else {
      targetList.appendChild(cardElement);
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

  // *** CARD SELECTION - Select Cards for Group Actions ***
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
    queueMicrotask(() => deckbuilderUX?.refreshSelection());
    Array.from(document.querySelectorAll(".deckbuilder-card-selected")).forEach(
      function (cardElement) {
        cardElement.classList.remove("deckbuilder-card-selected");
        cardElement.setAttribute("aria-selected", "false");
      },
    );

    selectedDeckbuilderZone = "";
  }

  function setDeckbuilderCardSelected(cardElement, isSelected) {
    queueMicrotask(() => deckbuilderUX?.refreshSelection());
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

  // *** DRAG AND DROP - Move Cards Between Areas ***
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

  // *** CARD PREVIEWS - Show Hover Images and Touch Menus ***
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

  function bindMobileContextLongPress(element, openMenuCallback) {
    if (!element || element.dataset.mobileContextLongPressBound === "1") {
      return;
    }

    element.dataset.mobileContextLongPressBound = "1";

    let pressTimer = null;
    let activePointerId = null;
    let startX = 0;
    let startY = 0;

    function cancelLongPress() {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer);
        pressTimer = null;
      }

      activePointerId = null;
    }

    element.addEventListener("pointerdown", function (event) {
      if (
        !isDeckbuilderMobileLayout() ||
        event.pointerType === "mouse" ||
        event.button !== 0
      ) {
        return;
      }

      if (
        event.target &&
        event.target.closest &&
        event.target.closest("button, a, input, select, textarea")
      ) {
        return;
      }

      cancelLongPress();

      activePointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;

      pressTimer = window.setTimeout(function () {
        pressTimer = null;
        element.dataset.suppressNextClick = "1";

        window.setTimeout(function () {
          if (element.dataset.suppressNextClick === "1") {
            delete element.dataset.suppressNextClick;
          }
        }, 800);

        openMenuCallback(startX, startY, element);
      }, MOBILE_CONTEXT_LONG_PRESS_MS);
    });

    element.addEventListener("pointermove", function (event) {
      if (event.pointerId !== activePointerId || pressTimer === null) {
        return;
      }

      const movedX = event.clientX - startX;
      const movedY = event.clientY - startY;

      if (Math.hypot(movedX, movedY) > MOBILE_CONTEXT_MOVE_TOLERANCE_PX) {
        cancelLongPress();
      }
    });

    element.addEventListener("pointerup", cancelLongPress);
    element.addEventListener("pointercancel", cancelLongPress);
    element.addEventListener("dragstart", cancelLongPress);

    element.addEventListener(
      "click",
      function (event) {
        if (element.dataset.suppressNextClick !== "1") {
          return;
        }

        delete element.dataset.suppressNextClick;
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    );
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

      bindMobileContextLongPress(cardElement, function (x, y, targetElement) {
        openCardContextMenu(
          {
            preventDefault: function () {},
            stopPropagation: function () {},
            clientX: x,
            clientY: y,
          },
          targetElement,
        );
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

      bindMobileContextLongPress(landElement, function (x, y, targetElement) {
        openLandPaletteContextMenu(
          {
            preventDefault: function () {},
            stopPropagation: function () {},
            clientX: x,
            clientY: y,
          },
          targetElement,
        );
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
        window.DeckadenceCardEffects?.copyToZoom(deckArtImage, hoverPreviewImage);

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

        window.DeckadenceCardEffects?.copyToZoom(imageElement, hoverPreviewImage);

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

  // *** CARD STACKS - Arrange Cards in Columns ***
  function getDeckbuilderStackColumnDefs() {
    const special = [{ key: "commander", label: "Commander" }, { key: "partner", label: "Partner" }];
    if (deckGroupBy === "custom") return special.concat(deckbuilderOrganization.groups.map(g => ({key:g.id,label:g.name})), [{key:"ungrouped",label:"Ungrouped"}]);
    const groups = {
      rarity: [["mythic", "Mythic"], ["rare", "Rare"], ["uncommon", "Uncommon"], ["common", "Common"], ["other", "Other"]],
      color: [["W", "White"], ["U", "Blue"], ["B", "Black"], ["R", "Red"], ["G", "Green"], ["multi", "Multicolor"], ["colorless", "Colorless"]],
      type: [["creature", "Creatures"], ["instant", "Instants"], ["sorcery", "Sorceries"], ["artifact", "Artifacts"], ["enchantment", "Enchantments"], ["planeswalker", "Planeswalkers"], ["battle", "Battles"], ["land", "Lands"], ["other", "Other"]]
    };
    if (groups[deckGroupBy]) return special.concat(groups[deckGroupBy].map(([key, label]) => ({ key, label })));

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

    if (deckGroupBy === "custom") return deckbuilderOrganization.assignments[String(cardElement.dataset.deckCardId)] || "ungrouped";
    if (deckGroupBy === "rarity") {
      const rarity = String(cardElement.dataset.cardRarity || "").toLowerCase();
      return ["mythic", "rare", "uncommon", "common"].includes(rarity) ? rarity : "other";
    }
    if (deckGroupBy === "color") {
      let colors = [];
      try { colors = JSON.parse(cardElement.dataset.cardColorIdentity || "[]"); } catch (_) {}
      colors = Array.isArray(colors) ? [...new Set(colors.filter(c => ["W", "U", "B", "R", "G"].includes(c)))] : [];
      return colors.length > 1 ? "multi" : colors[0] || "colorless";
    }
    if (deckGroupBy === "type") {
      const types = String(cardElement.dataset.cardTypeLine || "").toLowerCase().split(/[—–]/)[0];
      return ["land", "creature", "planeswalker", "instant", "sorcery", "artifact", "enchantment", "battle"].find(type => new RegExp("\\b" + type + "\\b").test(types)) || "other";
    }
    const inferredColumn = inferDeckbuilderStackColumnKey(cardElement);

    if (inferredColumn === "land") {
      return "land";
    }

    return inferredColumn;
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
      const targetColumn = columns[columnKey] || columns["ungrouped"] || columns["other"] || columns["0"];

      targetColumn.appendChild(cardElement);
    });

    Array.from(
      listElement.querySelectorAll(".deckbuilder-stack-column"),
    ).forEach(function (columnElement) {
      const hasCards = Boolean(
        columnElement.querySelector(".deckbuilder-card"),
      );
      columnElement.classList.toggle("hidden", !hasCards && (deckGroupBy !== "custom" || ["commander", "partner"].includes(columnElement.dataset.stackColumn)));
    });

    deckbuilderUX?.decorateGroups();
    if (listElement === deckList && deckbuilderCardSize === "auto") {
      applyDeckbuilderCardSizeStyles();
    }
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

    if (deckbuilderViewMode !== nextViewMode) {
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

  // *** BASIC LANDS - Handle Land Buttons ***
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

  // *** COPY DECK - Build and Copy Deck Lists ***
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

  // *** CARD EDITING - Change Artwork and Printings ***
  async function openDeckbuilderCardFinishing(cardElement) {
    const studio = window.DeckadenceCardFinishing;
    if (!studio?.canOpen(cardElement)) {
      showDeckbuilderError(
        new Error("Card Finishing Studio is not available for this card."),
      );
      return;
    }

    try {
      await studio.open(cardElement);
    } catch (error) {
      showDeckbuilderError(error);
    }
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
    const destination = document.querySelector('.deckbuilder-ux-destination');
    if (destination) destination.hidden = true;
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
    window.DeckadenceCardTags?.attachMenu(landPaletteContextMenu, landElement);
    landPaletteContextMenu
      ?.querySelector('[data-land-context-action="card-finishing"]')
      ?.classList.toggle("hidden", !window.DeckadenceCardFinishing?.canOpen(landElement));
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

  // *** CARD MENUS - Show and Run Card Actions ***
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
      "card-finishing",
      !isMultiSelection && Boolean(window.DeckadenceCardFinishing?.canOpen(cardElement)),
    );

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

    if (payload.deckRole === "commander") {
      setDeckbuilderContextActionText(
        "clear_deck_role",
        "Clear Commander Slot",
      );
    } else if (payload.deckRole === "partner") {
      setDeckbuilderContextActionText("clear_deck_role", "Clear Partner Slot");
    }


  }

  function openCardContextMenu(event, cardElement) {
    queueMicrotask(() => deckbuilderUX?.refreshContext());
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
    window.DeckadenceCardTags?.attachMenu(cardContextMenu, cardElement, getDeckbuilderSelectedCards(cardZone));
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
    if (actionName === "set_foil") formData.append("foil_type", selectedFoilType);
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
    if (actionName === "set_foil") formData.append("foil_type", selectedFoilType);
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

  const foilMenuWrap = document.querySelector("[data-foil-menu-toggle]")?.parentElement;
  foilMenuWrap?.addEventListener("pointerenter", () => {
    const menu = foilMenuWrap.querySelector("[data-foil-menu]");
    menu.classList.remove("foil-menu-left");
    if (menu.getBoundingClientRect().right > window.innerWidth - 8) menu.classList.add("foil-menu-left");
  });
  document.querySelector("[data-foil-menu-toggle]")?.addEventListener("click", event => {
    event.stopPropagation();
    const menu = document.querySelector("[data-foil-menu]");
    const open = menu.classList.toggle("hidden") === false;
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  let selectedFoilType = "foil";
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

    if (actionName === "card-finishing") {
      if (!isMultiSelection) await openDeckbuilderCardFinishing(contextCard);
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

  // Deck presentation controls share the builder’s native card actions.
  deckbuilderUX = (() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const pref='imomir.deckbuilder.sideboard.';
  const read=(key,fallback)=>{try{return localStorage.getItem(pref+key) ?? fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(pref+key,String(value));}catch{}};
  let mounted=false, sideMode=read('view','list'), desiredWidth=Number(read('width','330'))||330;
  let activeResize=null, resizeFrame=0;
  const menuBound=new WeakSet(), focusBound=new WeakSet();
  const filterDefs=[['Type','deckbuilderSideboardFilterType'],['Color','deckbuilderSideboardFilterColor'],['Rarity','deckbuilderSideboardFilterRarity'],['Artwork','deckbuilderSideboardFilterAlternateImage']];
  function button(text,label,fn,className='deckbuilder-ux-add') {
    const b=document.createElement('button');b.type='button';b.className=className;b.textContent=text;b.setAttribute('aria-label',label);b.addEventListener('click',fn);return b;
  }
  function textMode(card) {
    return card.dataset.currentZone==='sideboard' ? sideMode==='list' || card.dataset.isLandPalette==='1' : deckbuilderViewMode==='list';
  }
  function showMenu(card,button,event) {
    event.preventDefault();event.stopPropagation();
    const rect=button.getBoundingClientRect();
    // Use the builder's own menu and the same event path as right-click.
    card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:rect.right-3,clientY:rect.bottom+3}));
    hideHoverPreview();
    button.setAttribute('aria-expanded','true');
  }
  function addRowControls(card) {
    let grip=$('.deckbuilder-ux-text-grip',card), qty=$('.deckbuilder-ux-text-qty',card), mana=$('.deckbuilder-ux-text-mana',card), menu=$('.deckbuilder-ux-card-menu',card);
    if(!grip){grip=document.createElement('span');grip.className='deckbuilder-ux-text-grip';grip.textContent='≡';grip.setAttribute('aria-hidden','true');card.prepend(grip);}
    if(!qty){qty=document.createElement('span');qty.className='deckbuilder-ux-text-qty';qty.textContent=card.dataset.isLandPalette==='1'?'∞':'1';qty.title=card.dataset.isLandPalette==='1'?'Unlimited basic lands':'1 copy';card.append(qty);}
    if(!mana){mana=document.createElement('span');mana.className='deckbuilder-ux-text-mana';card.append(mana);}
    const cost=card.dataset.cardManaCost || '';
    if(cost!==undefined && mana.dataset.cost!==String(cost||'')) {
      mana.dataset.cost=cost||'';mana.replaceChildren();mana.setAttribute('aria-label',cost?'Mana cost '+cost:'No mana cost');
      (String(cost||'').match(/\{[^}]+\}|\/\//g)||[]).forEach(part=>{
        const symbol=part.replace(/[{}]/g,'');
        if(/^[WUBRGC]$/.test(symbol)){const img=document.createElement('img');img.src='/static/img/symbols/'+symbol+'.svg';img.alt=symbol;img.width=14;img.height=14;mana.append(img);}
        else {const s=document.createElement('span');s.className='deckbuilder-ux-mana-pip'+(symbol==='//'?' deckbuilder-ux-mana-divider':'');s.textContent=symbol;mana.append(s);}
      });
    }
    if(!menu){menu=button('⋮','Actions for '+card.dataset.cardName,()=>{},'deckbuilder-ux-card-menu');menu.setAttribute('aria-haspopup','menu');menu.setAttribute('aria-expanded','false');card.append(menu);}
    if(!menuBound.has(menu)){menuBound.add(menu);menu.addEventListener('pointerdown',e=>e.stopPropagation());menu.addEventListener('click',e=>showMenu(card,menu,e));}
    if(!focusBound.has(card)) {
      focusBound.add(card);
      card.addEventListener('focusin',e=>{
        if(!textMode(card) || e.target.closest('.deckbuilder-ux-card-menu[aria-expanded="true"]'))return;
        const rect=card.getBoundingClientRect();card.dispatchEvent(new MouseEvent('mouseenter',{clientX:rect.left+rect.width/2,clientY:rect.top}));
      });
      card.addEventListener('focusout',()=>card.dispatchEvent(new MouseEvent('mouseleave')));
    }
    card.classList.toggle('deckbuilder-ux-text-card',textMode(card));
    const name=$('.campaign-test-draft-picked-name',card);if(name)name.title=card.dataset.cardName;
    if(!name && card.dataset.isLandPalette==='1' && !$('.deckbuilder-ux-basic-label',card)) {
      const label=document.createElement('span');label.className='deckbuilder-ux-basic-label';label.textContent=card.dataset.cardName;card.append(label);
    }
  }
  function refresh() {
    if(!mounted)return;
    const workspace=$('#deckbuilderWorkspace'), side=$('.deckbuilder-zone-sideboard'), list=$('#deckbuilderSideboardList'), deck=$('#deckbuilderDeckList');
    side.classList.toggle('deckbuilder-ux-side-list',sideMode==='list');side.classList.toggle('deckbuilder-ux-side-stack',sideMode==='stack');
    $('#deckbuilderUxSideList').setAttribute('aria-pressed',String(sideMode==='list'));$('#deckbuilderUxSideStack').setAttribute('aria-pressed',String(sideMode==='stack'));
    $$('.deckbuilder-card',workspace).forEach(addRowControls);
    let stack=$('.deckbuilder-ux-side-stack-body',list), lands=$('.deckbuilder-ux-side-basics',list);
    if(!stack){stack=document.createElement('div');stack.className='deckbuilder-ux-side-stack-body';list.prepend(stack);}
    if(!lands){lands=document.createElement('details');lands.className='deckbuilder-ux-side-basics';lands.innerHTML='<summary>Basic lands <span>6</span></summary><div class="deckbuilder-ux-side-basic-cards"></div>';list.append(lands);}
    const ordinary=$$('.deckbuilder-card:not([data-is-land-palette="1"])',list), palette=$$('.deckbuilder-card[data-is-land-palette="1"]',list);
    ordinary.forEach(c=>{if(c.parentElement!==stack)stack.append(c);});
    const order=(deckbuilderOrganization.orders.sideboard || []);
    if(order.length)ordinary.sort((a,b)=>{const ai=order.indexOf(a.dataset.deckCardId),bi=order.indexOf(b.dataset.deckCardId);return (ai<0?10000:ai)-(bi<0?10000:bi);}).forEach(c=>stack.append(c));
    palette.forEach(c=>{const target=$('.deckbuilder-ux-side-basic-cards',lands);if(c.parentElement!==target)target.append(c);});
    if(deckbuilderViewMode==='list') {
      let cols=$('.deckbuilder-ux-text-columns',deck);if(!cols){cols=document.createElement('div');cols.className='deckbuilder-ux-text-columns';deck.append(cols);}
      $$('.deckbuilder-stack-column',deck).forEach(col=>{if(col.parentElement!==cols)cols.append(col);});
    }
    workspace.classList.toggle('deckbuilder-ux-list-active',deckbuilderViewMode==='list');
    deck.classList.toggle('deckbuilder-ux-grouped-flat',deckbuilderViewMode!=='stack');
    // Measure only after the previous view's layout classes and gaps are gone.
    applyDeckbuilderCardSizeStyles();
    $('#deckbuilderUxDeckCount').textContent=getDeckbuilderCards(deckList).length;
    $('#deckbuilderUxSideCount').textContent=getDeckbuilderCards(sideboardList).length;
    $('#deckbuilderUxShowSide').textContent='Sideboard · '+getDeckbuilderCards(sideboardList).length;
    decorateGroups();refreshSelection();syncStackSize();filtersChanged();
  }
  function syncStackSize() {
    const list=$('#deckbuilderSideboardList');if(!list)return;
    if(list.clientWidth<32)return;
    // clientWidth excludes the scrollbar; subtract the actual list padding as well.
    const style=getComputedStyle(list);
    const availableWidth=Math.max(1,list.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0));
    const auto=$('#deckbuilderCardSizeSelect').value==='auto';
    const sharedWidth=parseFloat(getComputedStyle($('#deckbuilderWorkspace')).getPropertyValue('--deckbuilder-stack-column-width'));
    const width=auto?availableWidth:Math.max(1,Math.min(Number.isFinite(sharedWidth)?sharedWidth:230,availableWidth));
    list.style.setProperty('--deckbuilder-ux-side-card-width',width+'px');
    list.style.setProperty('--deckbuilder-ux-side-card-overlap',(-Math.round(width*1.4-Math.max(34,width*.17)))+'px');
  }
  function applyWidth(value,save=false) {
    const main=$('.deckbuilder-main'),max=Math.max(260,Math.min(680,main.clientWidth-440));
    const width=Math.round(Math.max(250,Math.min(max,value)));
    main.style.setProperty('--deckbuilder-ux-rail-width',width+'px');
    const handle=$('#deckbuilderUxSideResizer');handle.setAttribute('aria-valuenow',String(width));handle.setAttribute('aria-valuemin','250');handle.setAttribute('aria-valuemax',String(Math.round(max)));handle.setAttribute('aria-valuetext',width+' pixels');
    if(save){desiredWidth=width;write('width',width);}
    syncStackSize();
  }
  function resizeEnd(event) {
    if(!activeResize)return;
    if(event?.type==='pointercancel')applyWidth(activeResize.startWidth);
    else applyWidth(Number($('#deckbuilderUxSideResizer').getAttribute('aria-valuenow')),true);
    activeResize=null;document.body.classList.remove('deckbuilder-ux-resizing');updateDeckbuilderCardSize(deckbuilderCardSize);refresh();
  }
  function mountResize(main,side) {
    const handle=document.createElement('div');handle.id='deckbuilderUxSideResizer';handle.className='deckbuilder-ux-side-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Resize Sideboard');handle.setAttribute('aria-controls','deckbuilderSideboardList');handle.title='Drag to resize Sideboard. Arrow keys adjust width. Double-click to reset.';
    handle.innerHTML='<span aria-hidden="true"></span>';side.before(handle);
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();activeResize={pointer:e.pointerId,startX:e.clientX,startWidth:side.getBoundingClientRect().width};handle.setPointerCapture(e.pointerId);document.body.classList.add('deckbuilder-ux-resizing');setDeckbuilderContextMenuOpen(false); hideHoverPreview();});
    handle.addEventListener('pointermove',e=>{if(!activeResize || e.pointerId!==activeResize.pointer)return;applyWidth(activeResize.startWidth+activeResize.startX-e.clientX);});
    handle.addEventListener('pointerup',resizeEnd);handle.addEventListener('pointercancel',resizeEnd);
    handle.addEventListener('dblclick',()=>{applyWidth(330,true);updateDeckbuilderCardSize(deckbuilderCardSize);});
    handle.addEventListener('keydown',e=>{
      let width=Number(handle.getAttribute('aria-valuenow')),delta=e.shiftKey?40:10;
      if(e.key==='ArrowLeft')width+=delta;else if(e.key==='ArrowRight')width-=delta;else if(e.key==='Home')width=250;else if(e.key==='End')width=Number(handle.getAttribute('aria-valuemax'));else return;
      e.preventDefault();applyWidth(width,true);updateDeckbuilderCardSize(deckbuilderCardSize);
    });
    applyWidth(desiredWidth);
    new ResizeObserver(()=>{if(resizeFrame)cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!activeResize)applyWidth(desiredWidth);syncStackSize();});}).observe(main);
  }
  function clearSearch() {$('#deckbuilderSideboardFilterText').value='';applySideboardFilters();}
  function filtersChanged() {
    if(!mounted || !$('#deckbuilderUxSideFilterChips'))return;
    const list=$('#deckbuilderSideboardList'), all=$$('.deckbuilder-card:not([data-is-land-palette="1"])',list), visible=all.filter(c=>!c.classList.contains('hidden'));
    const chips=$('#deckbuilderUxSideFilterChips');chips.replaceChildren();
    let active=0;
    const chip=(text,fn)=>{active++;chips.append(button(text+' ×','Remove '+text+' filter',fn,'deckbuilder-ux-filter-chip'));};
    const query=$('#deckbuilderSideboardFilterText').value.trim();
    if(query)chip('Search: '+query,clearSearch);
    filterDefs.forEach(([label,id])=>{const input=$('#'+id);if(input.value)chip(label+': '+input.selectedOptions[0].textContent,()=>{input.value='';applySideboardFilters();});});
    const op=$('#deckbuilderSideboardFilterManaOperator'),mv=$('#deckbuilderSideboardFilterManaValue');
    if(op.value && mv.value!=='')chip('MV '+op.selectedOptions[0].textContent+' '+mv.value,()=>{op.value='';mv.value='';applySideboardFilters();});
    const selectedTags=$$('[data-tag-filter="sideboard"] input:checked');
    selectedTags.forEach(input=>{const text=input.closest('label')?.textContent.trim()||'Tag';chip('Tag: '+text,()=>input.click());});
    $('#deckbuilderUxSideClearSearch').hidden=!query;$('#deckbuilderUxSideClearAll').hidden=!active;
    $('#deckbuilderUxSideFilterBadge').textContent=active?String(active):'';$('#deckbuilderUxSideFilterBadge').hidden=!active;
    if($('#deckbuilderUxSideMenuFilterCount'))$('#deckbuilderUxSideMenuFilterCount').textContent=active?String(active):'';
    $('#deckbuilderSideboardFilterButton').setAttribute('aria-label',active?'Filter Sideboard, '+active+' active':'Filter Sideboard');
    $('#deckbuilderUxSideResultCount').textContent=active?visible.length+' of '+all.length+' cards':all.length+' cards';
    const status=$('#deckbuilderSideboardFilterStatus');status.textContent=active?visible.length+' of '+all.length+' cards match':'All '+all.length+' sideboard cards';
    $('#deckbuilderUxSideEmpty').hidden=Boolean(visible.length);
    $('#deckbuilderUxSideEmpty strong').textContent=all.length?'No matching cards':'Sideboard is empty';
    $('#deckbuilderUxSideEmpty p').textContent=all.length?'Try a different search or clear your filters.':'Drag a card here, or use Add.';
    $('#deckbuilderUxSideEmpty button').hidden=!active;
    all.forEach(c=>c.classList.remove('deckbuilder-ux-last-stack-card'));visible.at(-1)?.classList.add('deckbuilder-ux-last-stack-card');
    const lands=$('.deckbuilder-ux-side-basics',list);if(lands)lands.hidden=Boolean(active);
  }
  function mountFilters(side) {
    const filter=$('#deckbuilderSideboardFilterPanel'),search=$('#deckbuilderSideboardFilterText');
    const searchRow=document.createElement('div');searchRow.className='deckbuilder-ux-side-search';
    searchRow.innerHTML='<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>';
    search.closest('label').remove();search.type='search';search.placeholder='Search Sideboard…';search.setAttribute('aria-label','Search Sideboard');searchRow.append(search);
    const clear=button('×','Clear Sideboard search',clearSearch,'deckbuilder-ux-search-clear');clear.id='deckbuilderUxSideClearSearch';clear.hidden=true;searchRow.append(clear);
    $('.deckbuilder-ux-side-views',side).after(searchRow);
    const active=document.createElement('div');active.className='deckbuilder-ux-side-filter-state';active.innerHTML='<div id="deckbuilderUxSideFilterChips"></div><div class="deckbuilder-ux-side-resultline"><span id="deckbuilderUxSideResultCount" role="status" aria-live="polite"></span><button id="deckbuilderUxSideClearAll" type="button" hidden>Clear all</button></div>';
    searchRow.after(active);$('#deckbuilderUxSideClearAll').onclick=()=>clearSideboardFilters();
    filter.setAttribute('role','dialog');filter.setAttribute('aria-label','Filter Sideboard');
    const heading=document.createElement('div');heading.className='deckbuilder-ux-side-filter-heading';heading.innerHTML='<strong>Filter Sideboard</strong>';
    heading.append(button('×','Close Sideboard filters',()=>setSideboardFilterPanelVisible(false),'deckbuilder-ux-search-clear'));filter.prepend(heading);
    const grid=$('.deckbuilder-sideboard-filter-grid',filter);
    $('#deckbuilderSideboardFilterType').add(new Option('Token','token'));
    $('#deckbuilderSideboardFilterType').add(new Option('Battle','battle'));
    // Reorder the existing controls, keeping their bound filtering behavior.
    ['deckbuilderSideboardFilterType','deckbuilderSideboardFilterColor','deckbuilderSideboardFilterRarity','deckbuilderSideboardFilterManaOperator','deckbuilderSideboardFilterAlternateImage'].forEach(id=>grid.append($('#'+id).closest('label')));
    const artwork=$('#deckbuilderSideboardFilterAlternateImage').closest('label');artwork.querySelector('span').textContent='Alternate artwork';
    artwork.classList.add('deckbuilder-ux-filter-wide');
    grid.append($('[data-tag-filter="sideboard"]'));grid.append($('.deckbuilder-sideboard-filter-actions',filter));
    $('#deckbuilderSideboardFilterManaOperator').setAttribute('aria-label','Mana value comparison');$('#deckbuilderSideboardFilterManaValue').setAttribute('aria-label','Mana value');
    $('#deckbuilderSideboardFilterManaValue').addEventListener('input',()=>{if($('#deckbuilderSideboardFilterManaValue').value!=='' && !$('#deckbuilderSideboardFilterManaOperator').value){$('#deckbuilderSideboardFilterManaOperator').value='eq';applySideboardFilters();}});
    $('#deckbuilderSideboardFilterButton').insertAdjacentHTML('beforeend','<span id="deckbuilderUxSideFilterBadge" hidden></span>');
    const empty=document.createElement('div');empty.id='deckbuilderUxSideEmpty';empty.hidden=true;empty.innerHTML='<strong>No matching cards</strong><p>Try a different search or clear your filters.</p>';empty.append(button('Clear filters','Clear Sideboard filters',()=>clearSideboardFilters()));$('#deckbuilderSideboardList').before(empty);
    document.addEventListener('pointerdown',e=>{if(!filter.contains(e.target) && !e.target.closest('#deckbuilderSideboardFilterButton'))setSideboardFilterPanelVisible(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && !filter.classList.contains('hidden')){setSideboardFilterPanelVisible(false);$('#deckbuilderUxSideCommands').focus();}});
  }
  function mountCommands(side) {
    const originalCollapse=$('#deckbuilderSideboardCollapseButton'),originalFilter=$('#deckbuilderSideboardFilterButton');
    originalCollapse.classList.add('deckbuilder-ux-hidden-control');originalFilter.classList.add('deckbuilder-ux-hidden-control');
    const menu=document.createElement('div');menu.id='deckbuilderUxSideCommandsMenu';menu.className='deckbuilder-ux-side-commands-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Other Sideboard commands');
    const toggle=button('⋯','Other Sideboard commands',()=>setOpen(menu.hidden),'campaign-test-draft-zone-view-button');toggle.id='deckbuilderUxSideCommands';toggle.title='Other commands';toggle.setAttribute('aria-haspopup','menu');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',menu.id);
    const setOpen=open=>{menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));};
    const filters=button('Filters','Sideboard filters',()=>{setOpen(false);setSideboardFilterPanelVisible(true);$('#deckbuilderSideboardFilterType').focus();},'deckbuilder-ux-side-command');filters.setAttribute('role','menuitem');filters.innerHTML='<i class="fa-solid fa-filter" aria-hidden="true"></i><span>Filters</span><span id="deckbuilderUxSideMenuFilterCount"></span>';
    const collapse=button('Collapse Sideboard','Collapse Sideboard',()=>{setOpen(false);originalCollapse.click();},'deckbuilder-ux-side-command');collapse.setAttribute('role','menuitem');collapse.innerHTML='<i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span>Collapse Sideboard</span>';
    menu.append(filters,collapse);originalCollapse.after(toggle);side.append(menu);
    document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target) && !toggle.contains(e.target))setOpen(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && !menu.hidden){setOpen(false);toggle.focus();}});
  }
  function mount() {
    if(mounted)return;mounted=true;if(!['list','stack'].includes(sideMode))sideMode='list';
    mountBuilderControls();
    const side=$('.deckbuilder-zone-sideboard'),main=$('.deckbuilder-main');
    const bar=document.createElement('div');bar.className='deckbuilder-ux-side-views';bar.setAttribute('role','group');bar.setAttribute('aria-label','Sideboard presentation');
    const choose=mode=>{sideMode=mode;write('view',mode);setDeckbuilderContextMenuOpen(false); hideHoverPreview();refresh();};
    const list=button('☷ List','Sideboard List View',()=>choose('list'));
    const stack=button('','Sideboard Stack View',()=>choose('stack'));
    stack.innerHTML='<i class="fa-solid fa-layer-group" aria-hidden="true"></i> Stack';
    list.id='deckbuilderUxSideList';stack.id='deckbuilderUxSideStack';bar.append(list,stack);$('.deckbuilder-zone-header',side).after(bar);
    mountResize(main,side);mountFilters(side);
    mountCommands(side);
    updateDeckbuilderCardSize(deckbuilderCardSize);
    $('#deckbuilderCardSizeSelect').addEventListener('change',()=>requestAnimationFrame(syncStackSize));
    new MutationObserver(syncStackSize).observe($('#deckbuilderWorkspace'),{attributes:true,attributeFilter:['style']});
    new ResizeObserver(syncStackSize).observe($('#deckbuilderSideboardList'));
    $('.deckbuilder-ux-rail-bottom',side).innerHTML='<span>Drag cards between Deck and Sideboard · Right-click for actions</span>';
    document.addEventListener('click',e=>{if(!e.target.closest('.deckbuilder-ux-card-menu'))$$('.deckbuilder-ux-card-menu[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.deckbuilder-ux-card-menu[aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));});
    refresh();
  }
  let organizationBusy = false, dragCards = [], insertBefore = null;
  const collapsedGroups = new Set();
  const cardId = card => String(card.dataset.deckCardId || '');
  function cleanOrganization() {
    const next = structuredClone(deckbuilderOrganization);
    const ids = new Set(getDeckbuilderCards(deckList).concat(getDeckbuilderCards(sideboardList)).map(cardId).filter(Boolean));
    next.assignments = Object.fromEntries(Object.entries(next.assignments).filter(([id]) => ids.has(id)));
    next.orders = Object.fromEntries(Object.entries(next.orders).map(([key, idsInOrder]) => [key, idsInOrder.filter(id => ids.has(id))]));
    return next;
  }
  async function saveOrganization(next, moving = [], zone = null) {
    if (organizationBusy) return false;
    organizationBusy = true;
    workspace.setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(workspace.dataset.organizationUrl, {
        method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify({organization:next, move_card_ids:moving, target_zone:zone})
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'The change could not be saved.');
      applyDeckbuilderPayload(payload);
      return true;
    } catch (error) { showDeckbuilderError(error); return false; }
    finally { organizationBusy = false; workspace.removeAttribute('aria-busy'); }
  }
  function decorateGroups() {
    if (!mounted) return;
    const definitions = getDeckbuilderStackColumnDefs();
    $$('.deckbuilder-stack-column',deckList).forEach(column => {
      const key=column.dataset.stackColumn, head=$('.deckbuilder-stack-column-title',column), body=$('.deckbuilder-stack-column-body',column);
      const label=definitions.find(group=>group.key===key)?.label || key;
      const count=$$('.deckbuilder-card:not(.hidden)',body).length;
      const closed=collapsedGroups.has(deckGroupBy+':'+key);
      head.replaceChildren();
      const toggle=button('',(closed?'Expand ':'Collapse ')+label,()=>{
        const collapseKey=deckGroupBy+':'+key;
        collapsedGroups.has(collapseKey)?collapsedGroups.delete(collapseKey):collapsedGroups.add(collapseKey);
        decorateGroups();
      },'deckbuilder-ux-group-title');
      toggle.setAttribute('aria-expanded',String(!closed));
      const chevron=document.createElement('span');chevron.textContent=closed?'▸':'▾';chevron.setAttribute('aria-hidden','true');toggle.append(chevron);
      const name=document.createElement('span');name.textContent=deckGroupBy==='mana' && /^[0-6]$/.test(key)?key:label;
      if(deckGroupBy==='mana' && /^[0-6]$/.test(key))name.className='deckbuilder-ux-group-mana';
      toggle.append(name);
      if(deckGroupBy==='mana' && key==='6')toggle.append(document.createTextNode(' +'));
      const quantity=document.createElement('span');quantity.className='deckbuilder-ux-group-count';quantity.textContent='Qtty: '+count;
      head.append(toggle,quantity);column.classList.toggle('deckbuilder-ux-group-collapsed',closed);
      $('.deckbuilder-ux-drop-empty',body)?.remove();
      if(!body.querySelector('.deckbuilder-card')){
        const empty=document.createElement('div');empty.className='deckbuilder-ux-drop-empty';empty.textContent='Drop cards here';body.append(empty);
      }
    });
  }
  function refreshSelection() {
    if(!mounted)return;
    const selected=getDeckbuilderSelectedCards(), bar=$('.deckbuilder-ux-selection',workspace);
    bar.hidden=!selected.length;$('strong',bar).textContent=selected.length+' selected';
    $('#deckbuilderUxMoveDeck').disabled=!selected.some(c=>c.dataset.currentZone!=='deck');
    $('#deckbuilderUxMoveSide').disabled=!selected.some(c=>c.dataset.currentZone!=='sideboard');
    const select=$('#deckbuilderUxGroupSelection');
    select.replaceChildren(new Option('Move to group…',''),...deckbuilderOrganization.groups.map(g=>new Option(g.name,g.id)),new Option('Ungrouped','ungrouped'));
    $('#deckbuilderUxManageGroups').hidden=deckGroupBy!=='custom';
  }
  async function moveSelection(zone) {
    const selected=getDeckbuilderSelectedCards().filter(c=>c.dataset.currentZone!==zone);
    if(!selected.length)return;
    if(zone==='sideboard' && selected.some(c=>c.dataset.isBasicLand==='1')) {
      await handleDeckbuilderMultiCardAction('move',selected,'deck');
      return;
    }
    await saveOrganization(cleanOrganization(),selected.map(cardId).filter(Boolean),zone);
  }
  async function assignGroup(cards, group) {
    const next=cleanOrganization(), moving=[];
    cards.forEach(card=>{
      const id=cardId(card);if(!id || ['commander','partner'].includes(card.dataset.deckRole))return;
      if(group==='ungrouped')delete next.assignments[id];else next.assignments[id]=group;
      if(card.dataset.currentZone!=='deck')moving.push(id);
    });
    if(await saveOrganization(next,moving,'deck')) {
      deckGroupBy='custom';groupBySelect.value='custom';deckbuilderPreferences.set('imomir.deckbuilder.groupBy',deckGroupBy);setViewMode(deckbuilderViewMode);
    }
  }
  async function clearOrders() {
    const next=cleanOrganization();
    if(!Object.keys(next.orders).length){setViewMode(deckbuilderViewMode);return;}
    next.orders={};await saveOrganization(next);
  }
  function drawGroupEditor() {
    const list=$('#deckbuilderUxGroupRows');list.replaceChildren();
    deckbuilderOrganization.groups.forEach(group=>{
      const row=document.createElement('form');row.className='deckbuilder-ux-group-edit-row';
      const input=document.createElement('input');input.value=group.name;input.maxLength=60;input.required=true;input.setAttribute('aria-label','Rename '+group.name);
      const save=button('Save','Save '+group.name,()=>row.requestSubmit());
      row.onsubmit=async event=>{
        event.preventDefault();if(organizationBusy)return;
        const next=cleanOrganization(), target=next.groups.find(g=>g.id===group.id);target.name=input.value.trim();
        if(await saveOrganization(next))drawGroupEditor();
      };
      const remove=button('×','Remove group '+group.name,async()=>{
        const next=cleanOrganization();next.groups=next.groups.filter(g=>g.id!==group.id);
        Object.keys(next.assignments).forEach(id=>{if(next.assignments[id]===group.id)delete next.assignments[id];});
        delete next.orders['custom:'+group.id];
        if(await saveOrganization(next))drawGroupEditor();
      });row.append(input,save,remove);list.append(row);
    });
  }
  function closeGroups() { const panel=$('.deckbuilder-ux-groups');panel.hidden=true;$('#deckbuilderUxManageGroups').focus(); }
  function refreshContext() {
    const groupAction=$('.deckbuilder-ux-group-context',cardContextMenu),select=groupAction?.querySelector('select');if(!select)return;
    select.replaceChildren(new Option('Choose…',''),...deckbuilderOrganization.groups.map(g=>new Option(g.name,g.id)),new Option('Ungrouped','ungrouped'));
    groupAction.hidden=!activeContextCard || ['commander','partner'].includes(activeContextCard.dataset.deckRole);
  }
  function openAdd(zone) {
    $('.deckbuilder-ux-destination').hidden=false;
    deckbuilderAddDestination=zone;$('#deckbuilderUxDestination').value=zone;
    deckbuilderCardSearchModal.openAddCards();
  }
  function clearDrag() {
    dragCards=[];insertBefore=null;
    $$('.deckbuilder-ux-drop-over,.deckbuilder-ux-insert-before').forEach(el=>el.classList.remove('deckbuilder-ux-drop-over','deckbuilder-ux-insert-before'));
    $('#deckbuilderUxDragStatus').hidden=true;clearDropZoneState();
  }
  function dragTarget(event) {
    const zoneElement=event.target.closest('.deckbuilder-zone');
    if(!zoneElement || !workspace.contains(zoneElement))return null;
    const zone=zoneElement.classList.contains('deckbuilder-zone-deck')?'deck':'sideboard';
    const column=event.target.closest('.deckbuilder-stack-column');
    const group=column?.dataset.stackColumn;
    const palette=dragCards.some(c=>c.dataset.isLandPalette==='1');
    if(palette && zone!=='deck')return null;
    if(group && ['commander','partner'].includes(group) && dragCards.some(c=>c.dataset.deckRole!==group))return null;
    if(group && deckGroupBy!=='custom' && dragCards.some(c=>getDeckbuilderStackColumnKey(c)!==group)) {
      // Moving in from Sideboard uses the card's actual attributes; it never changes its mana/type group.
      if(dragCards.some(c=>c.dataset.currentZone!=='deck'))return {zone,group:null,element:zoneElement};
      return null;
    }
    return {zone,group,element:column || zoneElement};
  }
  function bindInteractions() {
    workspace.addEventListener('dragstart',event=>{
      const card=event.target.closest('.deckbuilder-card');if(!card || organizationBusy)return;
      const selected=getDeckbuilderSelectedCards(card.dataset.currentZone);
      dragCards=card.classList.contains('deckbuilder-card-selected') && selected.length>1?selected:[card];
      $('#deckbuilderUxDragStatus').textContent='Moving '+dragCards.length+' card'+(dragCards.length===1?'':'s');$('#deckbuilderUxDragStatus').hidden=false;
    },true);
    workspace.addEventListener('dragover',event=>{
      if(!dragCards.length)return;
      const target=dragTarget(event);event.preventDefault();event.stopPropagation();
      $$('.deckbuilder-ux-drop-over,.deckbuilder-ux-insert-before').forEach(el=>el.classList.remove('deckbuilder-ux-drop-over','deckbuilder-ux-insert-before'));
      insertBefore=null;
      if(!target){event.dataTransfer.dropEffect='none';return;}
      event.dataTransfer.dropEffect=dragCards.some(c=>c.dataset.isLandPalette==='1')?'copy':'move';target.element.classList.add('deckbuilder-ux-drop-over');
      const card=event.target.closest('.deckbuilder-card:not([data-is-land-palette="1"])');
      if(card && !dragCards.includes(card)){
        const rect=card.getBoundingClientRect();insertBefore=event.clientY<rect.top+Math.min(rect.height,42)/2?card:card.nextElementSibling;
        if(insertBefore?.classList.contains('deckbuilder-card') && !dragCards.includes(insertBefore))insertBefore.classList.add('deckbuilder-ux-insert-before');else insertBefore=null;
      }
      $('#deckbuilderUxDragStatus').textContent='Move '+dragCards.length+' to '+(target.zone==='deck'?'Deck':'Sideboard')+(target.group && deckGroupBy==='custom'?' · '+(deckbuilderOrganization.groups.find(g=>g.id===target.group)?.name || target.group):'');
      // Keep both scrolling areas usable while dragging a long deck.
      const list=target.zone==='deck'?deckList:sideboardList,r=list.getBoundingClientRect();
      if(event.clientY<r.top+40)list.scrollTop-=14;else if(event.clientY>r.bottom-40)list.scrollTop+=14;
    },true);
    workspace.addEventListener('drop',async event=>{
      if(!dragCards.length)return;
      event.preventDefault();event.stopPropagation();
      const target=dragTarget(event), cards=[...dragCards], before=insertBefore;
      clearDrag();draggedDeckbuilderItem=null;if(!target)return;
      try {
        if(cards.length===1 && cards[0].dataset.isLandPalette==='1'){
          const name=cards[0].dataset.basicLandName || cards[0].dataset.cardName;
          const previousIds=new Set(getDeckbuilderCards(deckList).map(cardId));
          const payload=await updateBasicLand(name,'add');
          payload._basicLandCountsAuthoritative=true;applyDeckbuilderPayload(payload);
          if(target.group && deckGroupBy==='custom') {
            const matching=getDeckbuilderCards(deckList).filter(card=>card.dataset.isBasicLand==='1' && card.dataset.cardName===name);
            const added=matching.find(card=>!previousIds.has(cardId(card))) || matching.at(-1);
            if(added)await assignGroup([added],target.group);
          }
          return;
        }
        if(target.zone==='sideboard' && cards.some(c=>c.dataset.isBasicLand==='1')){
          await handleDeckbuilderMultiCardAction('move',cards,'deck');return;
        }
        const next=cleanOrganization(), moving=[...new Set(cards.map(cardId).filter(Boolean))], movingSet=new Set(moving);
        if(!moving.length)return;
        if(target.zone==='deck' && target.group && deckGroupBy==='custom')cards.forEach(c=>{
          if(['commander','partner'].includes(c.dataset.deckRole))return;
          if(target.group==='ungrouped')delete next.assignments[cardId(c)];else next.assignments[cardId(c)]=target.group;
        });
        if(target.zone==='sideboard' || target.group){
          const list=target.zone==='sideboard'?sideboardList:target.element;
          const order=[...new Set(getDeckbuilderCards(list).map(cardId).filter(id=>id && !movingSet.has(id)))];
          const index=before?order.indexOf(cardId(before)):-1;
          order.splice(index<0?order.length:index,0,...moving);
          next.orders[target.zone==='sideboard'?'sideboard':deckGroupBy+':'+target.group]=order;
        }
        await saveOrganization(next,moving,target.zone);
      }catch(error){showDeckbuilderError(error);}
    },true);
    workspace.addEventListener('dragend',clearDrag,true);
  }
  function mountBuilderControls() {
    const main=$('.deckbuilder-main'),deck=$('.deckbuilder-zone-deck'),side=$('.deckbuilder-zone-sideboard');main.prepend(deck);
    const deckTitle=$('h2',deck),sideTitle=$('h2',side);
    deckTitle.parentElement.classList.add('deckbuilder-ux-zone-title');sideTitle.parentElement.classList.add('deckbuilder-ux-zone-title');
    deckTitle.insertAdjacentHTML('afterend','<span id="deckbuilderUxDeckCount" class="deckbuilder-ux-count"></span>');
    sideTitle.insertAdjacentHTML('afterend','<span id="deckbuilderUxSideCount" class="deckbuilder-ux-count"></span>');
    deckTitle.parentElement.append(openAddCardsButton);
    openAddCardsButton.className='deckbuilder-ux-add primary';openAddCardsButton.textContent='+ Add Cards';openAddCardsButton.setAttribute('aria-label','Add Cards to Deck');openAddCardsButton.title='Add Cards to Deck';
    const add=button('+','Add cards to Sideboard',()=>openAdd('sideboard'),'campaign-test-draft-zone-view-button');add.title='Add cards to Sideboard';$('.deckbuilder-zone-header-actions',side).prepend(add);
    const show=button('Sideboard','Show Sideboard',()=>{setDeckbuilderSideboardCollapsed(false);setDeckbuilderMobileActiveZone('sideboard');refresh();},'deckbuilder-ux-add deckbuilder-ux-show-sideboard');show.id='deckbuilderUxShowSide';$('.deckbuilder-zone-header-actions',deck).append(show);
    const bottom=document.createElement('div');bottom.className='deckbuilder-ux-rail-bottom';side.append(bottom);
    groupBySelect.add(new Option('Custom groups','custom'));
    const manage=button('Edit groups','Edit custom groups',()=>{$('.deckbuilder-ux-groups').hidden=false;drawGroupEditor();$('#deckbuilderUxNewGroup').focus();});manage.id='deckbuilderUxManageGroups';groupBySelect.parentElement.after(manage);
    const selection=document.createElement('div');selection.className='deckbuilder-ux-selection';selection.hidden=true;
    selection.innerHTML='<strong>0 selected</strong><button type="button" class="deckbuilder-ux-add" id="deckbuilderUxMoveDeck">Move to Deck</button><button type="button" class="deckbuilder-ux-add" id="deckbuilderUxMoveSide">Move to Sideboard</button><select class="deckbuilder-ux-add" id="deckbuilderUxGroupSelection" aria-label="Move selected cards to group"></select><button type="button" class="deckbuilder-ux-add" id="deckbuilderUxClear">Clear</button>';
    main.after(selection);$('#deckbuilderUxMoveDeck').onclick=()=>moveSelection('deck').catch(showDeckbuilderError);$('#deckbuilderUxMoveSide').onclick=()=>moveSelection('sideboard').catch(showDeckbuilderError);$('#deckbuilderUxClear').onclick=clearDeckbuilderSelection;
    $('#deckbuilderUxGroupSelection').onchange=event=>{if(event.target.value)assignGroup(getDeckbuilderSelectedCards(),event.target.value);};
    const destination=document.createElement('label');destination.className='deckbuilder-ux-destination';destination.innerHTML='Add to <select id="deckbuilderUxDestination" aria-label="Add cards destination"><option value="deck">Deck</option><option value="sideboard">Sideboard</option></select>';
    $('.card-search-header-actions').prepend(destination);$('#deckbuilderUxDestination').onchange=event=>{deckbuilderAddDestination=event.target.value;$('.card-search-heading-copy .page-subtitle').textContent='Choose cards and printings to add to your '+deckbuilderAddDestination+'.';};
    const panel=document.createElement('div');panel.className='deckbuilder-ux-groups';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Edit custom groups');
    panel.innerHTML='<div class="deckbuilder-ux-groups-header"><strong>Custom groups</strong><button class="deckbuilder-ux-add" id="deckbuilderUxCloseGroups" type="button" aria-label="Close group editor">×</button></div><div id="deckbuilderUxGroupRows"></div><label for="deckbuilderUxNewGroup">New group</label><form class="deckbuilder-ux-group-edit-row" id="deckbuilderUxGroupForm"><input id="deckbuilderUxNewGroup" placeholder="e.g. Protection" maxlength="60" required><button class="deckbuilder-ux-add" type="submit">Create</button></form><p>Drag cards into a group, or select several and use Move to group. Removing a group keeps its cards.</p>';
    document.body.append(panel);$('#deckbuilderUxCloseGroups').onclick=closeGroups;
    $('#deckbuilderUxGroupForm').onsubmit=async event=>{
      event.preventDefault();if(organizationBusy)return;
      const input=$('#deckbuilderUxNewGroup'),next=cleanOrganization();next.groups.push({id:crypto.randomUUID(),name:input.value.trim()});
      if(await saveOrganization(next)){input.value='';drawGroupEditor();}
    };
    const drag=document.createElement('div');drag.id='deckbuilderUxDragStatus';drag.className='deckbuilder-ux-drag-status';drag.hidden=true;document.body.append(drag);
    const groupAction=document.createElement('label');groupAction.className='deckbuilder-ux-group-context';groupAction.append(document.createTextNode('Move to group'));
    const groupSelect=document.createElement('select');groupSelect.setAttribute('aria-label','Move card to custom group');groupAction.append(groupSelect);cardContextMenu.append(groupAction);
    groupSelect.onchange=()=>{if(groupSelect.value && activeContextCard){const cards=getDeckbuilderSelectedCards();assignGroup(cards.includes(activeContextCard)?cards:[activeContextCard],groupSelect.value);setDeckbuilderContextMenuOpen(false);}};
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && !panel.hidden){closeGroups();event.preventDefault();}});
    bindInteractions();
  }

  return {mount,refresh,filtersChanged,decorateGroups,refreshSelection,refreshContext,clearOrders,openAdd};
  })();

  if (groupBySelect) {
    groupBySelect.addEventListener("change", () => {
      deckGroupBy = groupBySelect.value;
      deckbuilderPreferences.set("imomir.deckbuilder.groupBy", deckGroupBy);
      setViewMode(deckbuilderViewMode);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      pickedSortMode = sortSelect.value || "rarity-desc";
      deckbuilderUX.clearOrders();
    });
  }

  if (sideboardFilterButton) {
    sideboardFilterButton.addEventListener("click", function () {
      setSideboardFilterPanelVisible(!sideboardFiltersVisible);
    });
  }

  if (mobileToolbarToggle) {
    mobileToolbarToggle.addEventListener("click", function () {
      const isCurrentlyOpen =
        deckbuilderHeader &&
        deckbuilderHeader.classList.contains("deckbuilder-mobile-tools-open");

      setDeckbuilderMobileToolbarOpen(!isCurrentlyOpen);
    });
  }

  if (sideboardCollapseButton) {
    sideboardCollapseButton.addEventListener("click", function () {
      if (isDeckbuilderMobileLayout()) {
        const sideboardIsActive =
          deckbuilderMain &&
          deckbuilderMain.classList.contains(
            "deckbuilder-mobile-sideboard-active",
          );

        setDeckbuilderMobileActiveZone(
          sideboardIsActive ? "deck" : "sideboard",
        );
        return;
      }

      const isCurrentlyCollapsed = Boolean(
        deckbuilderMain &&
        deckbuilderMain.classList.contains("deckbuilder-sideboard-collapsed"),
      );

      setDeckbuilderSideboardCollapsed(!isCurrentlyCollapsed);
    });
  }

  if (deckCollapseButton) {
    deckCollapseButton.addEventListener("click", function () {
      if (!isDeckbuilderMobileLayout()) {
        return;
      }

      const deckIsActive =
        deckbuilderMain &&
        deckbuilderMain.classList.contains("deckbuilder-mobile-deck-active");

      setDeckbuilderMobileActiveZone(deckIsActive ? "sideboard" : "deck");
    });
  }

  if (typeof deckbuilderMobileMedia.addEventListener === "function") {
    deckbuilderMobileMedia.addEventListener(
      "change",
      applyDeckbuilderResponsiveLayout,
    );
  } else if (typeof deckbuilderMobileMedia.addListener === "function") {
    deckbuilderMobileMedia.addListener(applyDeckbuilderResponsiveLayout);
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
      updateDeckbuilderCardSize(cardSizeSelect.value || "auto");
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

  document.getElementById("deckbuilderMpcFillBestButton")?.addEventListener("click",()=>{
    window.DeckadenceMpcFillBatch?.open(getDeckbuilderBatchUpscaleCardUuids(), {sourceLabel:"Deck selection"});
  });

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
    getAddPayload: () => ({target_zone: deckbuilderAddDestination}),
    getAddSubtitle: () => "Choose cards and printings to add to your " + deckbuilderAddDestination + ".",
    bulkImportUrl: bulkImportUrl,
    bulkImportAddMostRecentUrl: bulkImportAddMostRecentUrl,
    bulkImportAddMostRecentText: "Add Most Recent",
    bulkImportAddMostRecentConfirmMessage:
      () => "Add the most recent matching printing for each parsed card to " + (deckbuilderAddDestination === "deck" ? "Deck" : "Sideboard") + "?",

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
        context.setStatus(payload.message || "Card added.", false);
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
        deckbuilderUX.openAdd("deck");
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
        String(deleteDeckConfirmInput.value || "")
          .trim()
          .toUpperCase() === "DELETE"
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

      if (menuItem.hasAttribute("data-foil-menu-toggle")) return;

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

      selectedFoilType = menuItem.dataset.foilType || "foil";
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

        if (actionName === "card-finishing") {
          const contextCard = activeLandPaletteCard;
          setLandPaletteContextMenuOpen(false);
          openDeckbuilderCardFinishing(contextCard);
          return;
        }

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

  document.addEventListener("deckadence:custom-card-deleted", function (event) {
    const uuid = event.detail?.cardUuid;
    if (!uuid || !workspace) return;
    const cards = Array.from(workspace.querySelectorAll('.deckbuilder-card[data-card-uuid="' + CSS.escape(uuid) + '"]'));
    if (!cards.length) return;
    const payloads = cards.map(getCardContextPayload).filter(Boolean);
    hideHoverPreview();
    setDeckbuilderContextMenuOpen(false);
    applyDeckbuilderCardActionDelta({ response_mode: "delta" }, payloads, "remove");
    applySideboardFilters();
    applyDeckFilters();
  });

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

  deckbuilderUX.mount();
  deckGroupBy = deckbuilderPreferences.get("imomir.deckbuilder.groupBy", "mana");
  if (!["mana","rarity","color","type","custom"].includes(deckGroupBy)) deckGroupBy = "mana";
  groupBySelect.value = deckGroupBy;
  applyDeckbuilderResponsiveLayout();
  setDeckbuilderBasicLandCounts(getCurrentDeckBasicLandCounts());
  window.DeckadenceCardSizes.observe(deckList, () => {
    // Resizing only changes dimensions; keep card nodes, selection and drag
    // interactions intact while the Sideboard divider or window is moving.
    if (deckbuilderCardSize === "auto") applyDeckbuilderCardSizeStyles();
  });
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
