// *** CARD SEARCH - Find and Select Cards ***
(function () {
  function getElement(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    return String(value || "").trim();
  }

  function parseJsonArray(rawValue) {
    try {
      const parsed = JSON.parse(rawValue || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function normalizeColorArray(rawValue) {
    return parseJsonArray(rawValue)
      .map(function (item) {
        return String(item || "")
          .trim()
          .toUpperCase();
      })
      .filter(Boolean);
  }

  const colorNameMap = {
    W: "White",
    U: "Blue",
    B: "Black",
    R: "Red",
    G: "Green",
  };

  const digitalSetCodeLookup = new Set([
    "AKR",
    "ANA",
    "ANB",
    "EA1",
    "HBG",
    "J21",
    "KLR",
    "MED",
    "ME2",
    "ME3",
    "ME4",
    "PRM",
    "PZ1",
    "PZ2",
    "SIR",
    "SIS",
    "TPR",
    "VMA",
  ]);

  function isDigitalSetCode(setCode) {
    const cleanSetCode = String(setCode || "")
      .trim()
      .toUpperCase();

    if (!cleanSetCode) {
      return false;
    }

    if (cleanSetCode.charAt(0) === "Y") {
      return true;
    }

    return digitalSetCodeLookup.has(cleanSetCode);
  }

  function getColorIdentityLabel(rawValue, typeLine) {
    const colors = normalizeColorArray(rawValue);
    const cleanTypeLine = String(typeLine || "").toLowerCase();

    if (cleanTypeLine.indexOf("land") !== -1 && colors.length === 0) {
      return "Colorless Land";
    }

    if (!colors.length) {
      return "Colorless";
    }

    return colors
      .map(function (symbol) {
        return colorNameMap[symbol] || symbol;
      })
      .join("/");
  }

  function getNumericSortValue(rawValue, nullValue) {
    const cleanValue = String(rawValue ?? "").trim();

    if (!cleanValue) {
      return nullValue;
    }

    const parsedValue = Number(cleanValue);

    if (!Number.isFinite(parsedValue)) {
      return nullValue;
    }

    return parsedValue;
  }

  function compareText(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  function getRarityRank(rarityValue, highToLow) {
    const cleanRarity = String(rarityValue || "").toLowerCase();

    const lowHighRanks = {
      common: 1,
      uncommon: 2,
      rare: 3,
      mythic: 4,
    };

    const highLowRanks = {
      mythic: 1,
      rare: 2,
      uncommon: 3,
      common: 4,
    };

    const rankMap = highToLow ? highLowRanks : lowHighRanks;
    return rankMap[cleanRarity] || 99;
  }

  function compareCardRows(rowA, rowB, sortValue) {
    const sortOption = sortValue || "name_asc";

    if (sortOption === "name_desc") {
      return compareText(rowB.dataset.cardName, rowA.dataset.cardName);
    }

    if (sortOption === "set_asc") {
      return (
        compareText(rowA.dataset.setCode, rowB.dataset.setCode) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "set_desc") {
      return (
        compareText(rowB.dataset.setCode, rowA.dataset.setCode) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "year_newest") {
      return (
        getNumericSortValue(rowB.dataset.releaseDateSort, 0) -
          getNumericSortValue(rowA.dataset.releaseDateSort, 0) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "year_oldest") {
      return (
        getNumericSortValue(rowA.dataset.releaseDateSort, 99999999) -
          getNumericSortValue(rowB.dataset.releaseDateSort, 99999999) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "rarity_low_high") {
      return (
        getRarityRank(rowA.dataset.rarity, false) -
          getRarityRank(rowB.dataset.rarity, false) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "rarity_high_low") {
      return (
        getRarityRank(rowA.dataset.rarity, true) -
          getRarityRank(rowB.dataset.rarity, true) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "mv_low_high") {
      return (
        getNumericSortValue(rowA.dataset.manaValue, 999) -
          getNumericSortValue(rowB.dataset.manaValue, 999) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "mv_high_low") {
      return (
        getNumericSortValue(rowB.dataset.manaValue, -1) -
          getNumericSortValue(rowA.dataset.manaValue, -1) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "edhrec_rank_best") {
      return (
        getNumericSortValue(rowA.dataset.edhrecRank, 999999999) -
          getNumericSortValue(rowB.dataset.edhrecRank, 999999999) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "edhrec_rank_worst") {
      return (
        getNumericSortValue(rowB.dataset.edhrecRank, -1) -
          getNumericSortValue(rowA.dataset.edhrecRank, -1) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "edhrec_salt_high") {
      return (
        getNumericSortValue(rowB.dataset.edhrecSaltiness, -1) -
          getNumericSortValue(rowA.dataset.edhrecSaltiness, -1) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "edhrec_salt_low") {
      return (
        getNumericSortValue(rowA.dataset.edhrecSaltiness, 999999999) -
          getNumericSortValue(rowB.dataset.edhrecSaltiness, 999999999) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "price_high") {
      return (
        getNumericSortValue(rowB.dataset.sortPrice, -1) -
          getNumericSortValue(rowA.dataset.sortPrice, -1) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    if (sortOption === "price_low") {
      return (
        getNumericSortValue(rowA.dataset.sortPrice, 999999999) -
          getNumericSortValue(rowB.dataset.sortPrice, 999999999) ||
        compareText(rowA.dataset.cardName, rowB.dataset.cardName)
      );
    }

    return compareText(rowA.dataset.cardName, rowB.dataset.cardName);
  }

  function getCardReleaseYear(card) {
    const rawYear =
      card && card.release_year ? String(card.release_year).trim() : "";

    if (!rawYear) {
      return 0;
    }

    const parsedYear = Number(rawYear);

    if (!Number.isFinite(parsedYear)) {
      return 0;
    }

    return parsedYear;
  }

  function getCardReleaseDateSortValue(card) {
    const rawDate =
      card && card.release_date ? String(card.release_date).trim() : "";

    if (!rawDate) {
      return getCardReleaseYear(card) * 10000;
    }

    const cleanDate = rawDate.replace(/[^0-9]/g, "");

    if (!cleanDate) {
      return getCardReleaseYear(card) * 10000;
    }

    const parsedDate = Number(cleanDate);

    if (!Number.isFinite(parsedDate)) {
      return getCardReleaseYear(card) * 10000;
    }

    return parsedDate;
  }

  function normalizeLookupText(rawValue) {
    return String(rawValue || "")
      .trim()
      .toLowerCase()
      .replace(/[’'`´‘ʼ]/g, "")
      .replace(/[.,]/g, "")
      .replace(/\s+/g, " ");
  }

  function buildPrintingKey(cardName, setCode, collectorNumber) {
    const cleanCardName = normalizeLookupText(cardName);
    const cleanSetCode = String(setCode || "")
      .trim()
      .toUpperCase();
    const cleanCollectorNumber = normalizeLookupText(collectorNumber);

    if (!cleanCardName || !cleanSetCode || !cleanCollectorNumber) {
      return "";
    }

    return cleanCardName + "|" + cleanSetCode + "|" + cleanCollectorNumber;
  }

  function buildVirtualSearchCardRow(card, cardNameOverride) {
    const cardName =
      cardNameOverride !== undefined ? cardNameOverride : card.card_name;

    return {
      dataset: {
        cardName: String(cardName || "").toLowerCase(),
        setCode: String(card.set_code || "").toUpperCase(),
        rarity: String(card.rarity || "").toLowerCase(),
        manaValue:
          card.mana_value === null || card.mana_value === undefined
            ? ""
            : String(card.mana_value),
        edhrecRank:
          card.edhrec_rank === null || card.edhrec_rank === undefined
            ? ""
            : String(card.edhrec_rank),
        edhrecSaltiness:
          card.edhrec_saltiness === null || card.edhrec_saltiness === undefined
            ? ""
            : String(card.edhrec_saltiness),
        sortPrice:
          card.sort_price === null || card.sort_price === undefined
            ? ""
            : String(card.sort_price),
        releaseDateSort: String(getCardReleaseDateSortValue(card)),
      },
    };
  }

  function getMostRecentCardPrinting(cards) {
    const cardList = Array.isArray(cards) ? cards.slice() : [];

    cardList.sort(function (cardA, cardB) {
      return (
        getCardReleaseDateSortValue(cardB) - getCardReleaseDateSortValue(cardA)
      );
    });

    return cardList[0] || null;
  }

  function initCardSearchModal(config) {
    config = config || {};

    const searchInput = getElement("customDraftCardSearchInput");
    const searchButton = getElement("customDraftCardSearchButton");
    const searchStatus = getElement("customDraftCardSearchStatus");
    const searchResults = getElement("customDraftCardSearchResults");
    const searchOverlay = getElement("customDraftCardSearchOverlay");
    const closeButton = getElement("customDraftCardSearchCloseButton");
    const maximizeButton = getElement("customDraftCardSearchMaximizeButton");
    const doneButton = getElement("customDraftCardSearchDoneButton");
    const moreOptionsButton = getElement("customDraftMoreOptionsButton");
    const moreOptionsMenu = getElement("customDraftMoreOptionsMenu");
    const moreFiltersButton = getElement("customDraftMoreFiltersButton");
    const advancedFilters = getElement("customDraftAdvancedFilters");
    const emptyState = getElement("customDraftSearchEmpty");
    const resultsSummary = getElement("customDraftSearchSummary");
    const addedCountLabel = getElement("customDraftSearchAddedCount");
    const seeAnyPrinting = getElement("customDraftSeeAnyPrinting");
    let addedThisSession = 0;
    let searchOpener = null;
    let zoomOpener = null;
    let importedSearchCards = null;
    let searchMaximized = false;
    const windowSizeSetting = "deckadence.cardSearch.maximized";

    function setSearchMaximized(maximized, remember = true) {
      searchMaximized = Boolean(maximized);
      searchOverlay?.classList.toggle("card-search-is-maximized", searchMaximized);
      const action = searchMaximized ? "Restore" : "Maximize";
      maximizeButton?.setAttribute("aria-label", action + " card search");
      maximizeButton?.setAttribute("title", action);
      maximizeButton?.setAttribute("aria-pressed", String(searchMaximized));
      maximizeButton?.querySelector(".card-search-maximize-icon")?.classList.toggle("hidden", searchMaximized);
      maximizeButton?.querySelector(".card-search-restore-icon")?.classList.toggle("hidden", !searchMaximized);
      if (remember) {
        try {
          window.localStorage.setItem(windowSizeSetting, searchMaximized ? "1" : "0");
        } catch (_) {
          // Keep the choice for this page when browser storage is unavailable.
        }
      }
    }

    function restoreSearchWindowSize() {
      try {
        const saved = window.localStorage.getItem(windowSizeSetting);
        if (saved !== null) searchMaximized = saved === "1";
      } catch (_) {
        // The current in-memory choice still works without browser storage.
      }
      setSearchMaximized(searchMaximized, false);
    }

    function setMoreOptionsOpen(open, restoreFocus = false) {
      moreOptionsMenu?.classList.toggle("hidden", !open);
      moreOptionsButton?.setAttribute("aria-expanded", String(open));
      if (restoreFocus) moreOptionsButton?.focus();
    }

    function updateAdvancedFilterCount() {
      const tags = window.DeckadenceCardTags?.values("search");
      const count = [searchManaOperatorFilter, searchManaValueFilter,
        searchYearStartFilter, searchYearEndFilter, searchExcludeAddedFilter]
        .filter(field => field?.value).length + (searchDigitalFilter?.value !== "exclude" ? 1 : 0)
        + (tags?.include.length || 0) + (tags?.exclude.length || 0);
      const label = getElement("customDraftAdvancedFilterCount");
      if (label) label.textContent = count ? " (" + count + ")" : "";
    }

    function recordAdded(count = 1) {
      addedThisSession += count;
      if (addedCountLabel) addedCountLabel.textContent = addedThisSession + " card" + (addedThisSession === 1 ? "" : "s") + " added";
    }

    function searchArtworkUrl(raw, fullSize = false) {
      const source = window.iMomirImageUrl ? window.iMomirImageUrl(raw) : raw;
      if (!source || !fullSize) return source || "";
      const url = new URL(source, location.href);
      url.pathname = url.pathname.replace("/chaos-card-image-preview/", "/chaos-card-image/");
      return url.href;
    }

    const searchRarityFilter = getElement("customDraftSearchRarityFilter");
    const searchColorFilter = getElement("customDraftSearchColorFilter");
    const searchManaOperatorFilter = getElement(
      "customDraftSearchManaOperatorFilter",
    );
    const searchManaValueFilter = getElement(
      "customDraftSearchManaValueFilter",
    );
    const searchTypeFilter = getElement("customDraftSearchTypeFilter");
    const searchSetCodeFilter = getElement("customDraftSearchSetCodeFilter");
    const searchSortSelect = getElement("customDraftSearchSortSelect");
    const searchYearStartFilter = getElement(
      "customDraftSearchYearStartFilter",
    );
    const searchYearEndFilter = getElement("customDraftSearchYearEndFilter");
    const searchDigitalFilter = getElement("customDraftSearchDigitalFilter");
    const searchExcludeAddedFilter = getElement(
      "customDraftSearchExcludeAddedFilter",
    );
    const searchPageSizeSelect = getElement("customDraftSearchPageSizeSelect");
    const searchPaginationBar = getElement("customDraftCardSearchPagination");
    const searchPrevButton = getElement("customDraftSearchPrevButton");
    const searchNextButton = getElement("customDraftSearchNextButton");
    const searchPageInput = getElement("customDraftSearchPageInput");
    const searchPageTotal = getElement("customDraftSearchPageTotal");
    const searchClearFiltersButton = getElement(
      "customDraftSearchClearFiltersButton",
    );
    const addAllResultsButton = getElement("customDraftAddAllResultsButton");
    const customCardButton = getElement("customDraftCreateCardButton");
    customCardButton?.addEventListener("click", function () {
      setMoreOptionsOpen(false, true);
      window.iMomirCustomCardModal?.open(async function (card, isFoil) {
        const row = createSearchResultPrintingRow(card);
        return await addCard(card.card_uuid, row.querySelector(".custom-draft-card-add-button"), true, isFoil);
      });
    });

    const bulkImportToggleButton = getElement(
      "customDraftBulkImportToggleButton",
    );
    const bulkImportPanel = getElement("customDraftBulkImportPanel");
    const bulkImportText = getElement("customDraftBulkImportText");
    const bulkImportFile = getElement("customDraftBulkImportFile");
    const bulkImportButton = getElement("customDraftBulkImportButton");
    const bulkImportAddMostRecentButton = getElement(
      "customDraftBulkImportAddMostRecentButton",
    );

    let activeChangePrintingState = null;
    let currentSearchPage = 1;
    let currentSearchTotalPages = 1;
    let currentSearchTotalCount = 0;
    let modalZoomOverlay = null;
    let modalZoomImage = null;

    const clientAddedCardUuidLookup = new Set();
    const clientAddedPrintingKeyLookup = new Set();

    function updateAddAllResultsButtonState() {
      moreOptionsButton?.classList.toggle("hidden", Boolean(activeChangePrintingState));
      if (customCardButton) {
        customCardButton.classList.toggle("hidden", Boolean(activeChangePrintingState) || !config.addUrl);
      }
      if (!addAllResultsButton) {
        return;
      }

      const shouldShow =
        Boolean(config.addAllResultsUrl) && !activeChangePrintingState;

      addAllResultsButton.classList.toggle("hidden", !shouldShow);
      addAllResultsButton.disabled =
        !shouldShow || currentSearchTotalCount <= 0;
      addAllResultsButton.textContent =
        config.addAllResultsText || "Add All Results to Set";
    }

    function ensureModalZoomOverlay() {
      if (modalZoomOverlay && modalZoomImage) {
        return;
      }

      modalZoomOverlay = document.createElement("div");
      modalZoomOverlay.className =
        "custom-draft-card-search-zoom-overlay hidden";
      modalZoomOverlay.setAttribute("aria-hidden", "true");
      modalZoomOverlay.setAttribute("role", "dialog");
      modalZoomOverlay.setAttribute("aria-modal", "true");
      modalZoomOverlay.setAttribute("aria-label", "Card image preview");
      modalZoomOverlay.dataset.cardFinishing = "off";

      modalZoomImage = document.createElement("img");
      modalZoomImage.className = "custom-draft-card-search-zoom-image";
      modalZoomImage.alt = "Card preview";

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "card-search-zoom-close";
      dismiss.textContent = "×";
      dismiss.setAttribute("aria-label", "Close card preview");
      modalZoomOverlay.appendChild(dismiss);
      modalZoomOverlay.appendChild(modalZoomImage);
      document.body.appendChild(modalZoomOverlay);

      modalZoomOverlay.addEventListener("click", function () {
        closeModalImageZoom();
      });
    }

    function openModalImageZoom(imageSrc, imageAlt) {
      const cleanImageSrc = String(imageSrc || "").trim();

      if (!cleanImageSrc) {
        return;
      }

      ensureModalZoomOverlay();
      zoomOpener = document.activeElement;
      if (searchOverlay) searchOverlay.inert = true;
      modalZoomImage.src = cleanImageSrc;
      modalZoomImage.alt = imageAlt || "Card preview";
      modalZoomOverlay.classList.remove("hidden");
      modalZoomOverlay.setAttribute("aria-hidden", "false");
      modalZoomOverlay.querySelector("button").focus();
    }

    function closeModalImageZoom() {
      if (!modalZoomOverlay || !modalZoomImage) {
        return;
      }

      modalZoomOverlay.classList.add("hidden");
      modalZoomOverlay.setAttribute("aria-hidden", "true");
      if (searchOverlay) searchOverlay.inert = false;
      modalZoomImage.src = "";
      modalZoomImage.alt = "Card preview";
      if (zoomOpener?.isConnected) zoomOpener.focus({preventScroll: true});
    }

    function bindModalZoomableImages() {
      document
        .querySelectorAll(
          "#customDraftCardSearchOverlay .custom-draft-card-zoomable",
        )
        .forEach(function (imageElement) {
          if (imageElement.dataset.sharedCardSearchZoomBound === "1") {
            return;
          }

          imageElement.dataset.sharedCardSearchZoomBound = "1";

          imageElement.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            openModalImageZoom(
              imageElement.dataset.zoomSrc || imageElement.src || "",
              imageElement.dataset.zoomAlt ||
                imageElement.alt ||
                "Card preview",
            );
          });

          imageElement.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();

              openModalImageZoom(
                imageElement.dataset.zoomSrc || imageElement.src || "",
                imageElement.dataset.zoomAlt ||
                  imageElement.alt ||
                  "Card preview",
              );
            }
          });
        });
    }

    function showMessage(messageText, isError) {
      if (typeof config.showMessage === "function") {
        config.showMessage(messageText, isError);
        return;
      }

      if (window.iMomirToast) {
        if (isError) {
          window.iMomirToast.error(messageText || "");
        } else {
          window.iMomirToast.success(messageText || "");
        }
        return;
      }

      console.log(messageText || "");
    }

    async function confirmAction(options) {
      if (typeof config.confirmAction === "function") {
        return await config.confirmAction(options || {});
      }

      if (
        window.iMomirConfirm &&
        typeof window.iMomirConfirm.show === "function"
      ) {
        return await window.iMomirConfirm.show(options || {});
      }

      return window.confirm((options && options.message) || "Continue?");
    }

    function getExistingCardLookup() {
      const lookup = {
        cardUuids: new Set(clientAddedCardUuidLookup),
        printingKeys: new Set(clientAddedPrintingKeyLookup),
      };

      if (typeof config.getExistingCardLookup === "function") {
        const pageLookup = config.getExistingCardLookup() || {};

        Array.from(pageLookup.cardUuids || []).forEach(function (cardUuid) {
          lookup.cardUuids.add(cardUuid);
        });

        Array.from(pageLookup.printingKeys || []).forEach(
          function (printingKey) {
            lookup.printingKeys.add(printingKey);
          },
        );
      }

      return lookup;
    }

    function getSearchCardPrintingKey(card) {
      if (!card) {
        return "";
      }

      return buildPrintingKey(
        card.card_name || "",
        card.set_code || "",
        card.collector_number || "",
      );
    }

    function isSearchCardAlreadyAdded(card) {
      if (activeChangePrintingState) {
        return false;
      }

      if (card && card.already_in_set) {
        return true;
      }

      const lookup = getExistingCardLookup();
      const cardUuid = String(
        card && card.card_uuid ? card.card_uuid : "",
      ).trim();
      const printingKey = getSearchCardPrintingKey(card);

      if (cardUuid && lookup.cardUuids.has(cardUuid)) {
        return true;
      }

      if (printingKey && lookup.printingKeys.has(printingKey)) {
        return true;
      }

      return false;
    }

    function getSelectedMultiSelectValues(containerElement) {
      if (!containerElement) {
        return [];
      }

      return Array.from(
        containerElement.querySelectorAll('input[type="checkbox"]:checked'),
      )
        .map(function (checkbox) {
          return String(checkbox.value || "")
            .trim()
            .toLowerCase();
        })
        .filter(Boolean);
    }

    function getMultiSelectLabelForValue(containerElement, rawValue) {
      const cleanValue = String(rawValue || "")
        .trim()
        .toLowerCase();

      const matchingInput = containerElement
        ? containerElement.querySelector(
            'input[type="checkbox"][value="' + CSS.escape(cleanValue) + '"]',
          )
        : null;

      if (matchingInput) {
        const matchingLabel = matchingInput.closest("label");

        if (matchingLabel) {
          const labelSpan = matchingLabel.querySelector("span");

          if (labelSpan && labelSpan.textContent) {
            return labelSpan.textContent.trim();
          }
        }
      }

      return rawValue;
    }

    function updateMultiSelectLabel(containerElement) {
      if (!containerElement) {
        return;
      }

      const labelElement = containerElement.querySelector(
        ".custom-draft-multi-select-label",
      );
      const selectedValues = getSelectedMultiSelectValues(containerElement);
      const totalValues = containerElement.querySelectorAll(
        'input[type="checkbox"]',
      ).length;
      const placeholderText = containerElement.dataset.placeholder || "Any";
      const allLabelText = containerElement.dataset.allLabel || "All";

      if (!labelElement) {
        return;
      }

      if (!selectedValues.length) {
        labelElement.textContent = placeholderText;
        return;
      }

      if (totalValues > 0 && selectedValues.length === totalValues) {
        labelElement.textContent = allLabelText;
        return;
      }

      labelElement.textContent = selectedValues
        .map(function (selectedValue) {
          return getMultiSelectLabelForValue(containerElement, selectedValue);
        })
        .join(", ");
    }

    function clearMultiSelectValues(containerElement) {
      if (!containerElement) {
        return;
      }

      Array.from(
        containerElement.querySelectorAll('input[type="checkbox"]'),
      ).forEach(function (checkbox) {
        checkbox.checked = false;
      });

      updateMultiSelectLabel(containerElement);
    }

    function closeMultiSelect(containerElement) {
      if (!containerElement) {
        return;
      }

      const button = containerElement.querySelector(
        ".custom-draft-multi-select-button",
      );
      const menu = containerElement.querySelector(
        ".custom-draft-multi-select-menu",
      );

      if (button) {
        button.setAttribute("aria-expanded", "false");
      }

      if (menu) {
        menu.classList.add("hidden");
      }
    }

    function bindMultiSelect(containerElement, callback) {
      if (!containerElement || typeof callback !== "function") {
        return;
      }

      const button = containerElement.querySelector(
        ".custom-draft-multi-select-button",
      );
      const menu = containerElement.querySelector(
        ".custom-draft-multi-select-menu",
      );

      if (button && menu) {
        button.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();

          const shouldOpen = menu.classList.contains("hidden");

          document
            .querySelectorAll(".custom-draft-multi-select")
            .forEach(function (otherContainer) {
              if (otherContainer !== containerElement) {
                closeMultiSelect(otherContainer);
              }
            });

          menu.classList.toggle("hidden", !shouldOpen);
          button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
        });
      }

      Array.from(
        containerElement.querySelectorAll('input[type="checkbox"]'),
      ).forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
          updateMultiSelectLabel(containerElement);
          callback();
        });
      });

      updateMultiSelectLabel(containerElement);
    }

    function rowMatchesRarityFilter(rowRarity, selectedRarities) {
      if (!selectedRarities || !selectedRarities.length) {
        return true;
      }

      return (
        selectedRarities.indexOf(
          String(rowRarity || "")
            .trim()
            .toLowerCase(),
        ) !== -1
      );
    }

    function rowMatchesColorFilter(row, selectedColorValues) {
      if (!selectedColorValues || !selectedColorValues.length) {
        return true;
      }

      const colors = normalizeColorArray(row.dataset.colorIdentity || "[]");
      const lowerColors = colors.map(function (colorSymbol) {
        return String(colorSymbol || "").toLowerCase();
      });

      const typeLine = String(row.dataset.typeLine || "").toLowerCase();
      const isLand = typeLine.indexOf("land") !== -1;
      const isColorless = colors.length === 0;
      const isMulti = colors.length >= 2;
      const isMonoColor = colors.length === 1;

      const selectedValues = selectedColorValues.map(function (selectedValue) {
        return String(selectedValue || "")
          .trim()
          .toLowerCase();
      });

      const selectedColorSymbols = selectedValues.filter(
        function (selectedValue) {
          return ["w", "u", "b", "r", "g"].indexOf(selectedValue) !== -1;
        },
      );

      if (
        selectedValues.indexOf("colorless") !== -1 &&
        isColorless &&
        !isLand
      ) {
        return true;
      }

      if (selectedValues.indexOf("land") !== -1 && isLand) {
        return true;
      }

      if (selectedValues.indexOf("multi_any") !== -1 && isMulti) {
        return true;
      }

      if (selectedValues.indexOf("multi_has_selected") !== -1 && isMulti) {
        if (!selectedColorSymbols.length) {
          return true;
        }

        return lowerColors.some(function (cardColor) {
          return selectedColorSymbols.indexOf(cardColor) !== -1;
        });
      }

      if (selectedValues.indexOf("multi_selected") !== -1 && isMulti) {
        if (!selectedColorSymbols.length) {
          return true;
        }

        const hasOnlySelectedColors = lowerColors.every(function (cardColor) {
          return selectedColorSymbols.indexOf(cardColor) !== -1;
        });

        const hasAtLeastOneSelectedColor = lowerColors.some(
          function (cardColor) {
            return selectedColorSymbols.indexOf(cardColor) !== -1;
          },
        );

        return hasOnlySelectedColors && hasAtLeastOneSelectedColor;
      }

      if (selectedColorSymbols.length && isMonoColor) {
        return selectedColorSymbols.indexOf(lowerColors[0]) !== -1;
      }

      return false;
    }

    function rowMatchesManaFilter(row, operatorValue, targetValueRaw) {
      if (!operatorValue) {
        return true;
      }

      const targetValue = Number(targetValueRaw);

      if (!Number.isFinite(targetValue)) {
        return true;
      }

      const rowManaValue = Number(row.dataset.manaValue);

      if (!Number.isFinite(rowManaValue)) {
        return false;
      }

      if (operatorValue === "=") {
        return rowManaValue === targetValue;
      }

      if (operatorValue === "<=") {
        return rowManaValue <= targetValue;
      }

      if (operatorValue === ">=") {
        return rowManaValue >= targetValue;
      }

      if (operatorValue === "<") {
        return rowManaValue < targetValue;
      }

      if (operatorValue === ">") {
        return rowManaValue > targetValue;
      }

      return true;
    }

    function rowMatchesDigitalFilter(row, digitalFilterValue) {
      const cleanDigitalFilter = String(digitalFilterValue || "")
        .trim()
        .toLowerCase();

      if (!cleanDigitalFilter) {
        return true;
      }

      const isDigital = isDigitalSetCode(row.dataset.setCode || "");

      if (cleanDigitalFilter === "exclude") {
        return !isDigital;
      }

      if (cleanDigitalFilter === "only") {
        return isDigital;
      }

      return true;
    }

    function setModalTitle(titleText, subtitleText) {
      const modalTitle = document.querySelector(
        ".custom-draft-card-search-window-header h2",
      );
      const modalSubtitle = document.querySelector(
        ".custom-draft-card-search-window-header .page-subtitle",
      );

      if (modalTitle) {
        modalTitle.textContent = titleText || "Add Cards";
      }

      if (modalSubtitle) {
        modalSubtitle.textContent =
          subtitleText ||
          "Search by card name, set, color identity, rarity, mana value, year, spell type, EDHREC rank, or saltiness.";
      }
    }

    function setSearchStatus(messageText, isError) {
      if (!searchStatus) {
        return;
      }

      const cleanMessage = String(messageText || "").trim();

      searchStatus.textContent = cleanMessage;
      searchStatus.classList.toggle(
        "custom-draft-card-search-status-error",
        Boolean(isError),
      );
      searchStatus.classList.toggle("hidden", !cleanMessage);
      const importStatus = getElement("customDraftBulkImportStatus");
      if (importStatus && bulkImportPanel?.classList.contains("custom-draft-bulk-import-panel-open")) {
        importStatus.textContent = cleanMessage;
        importStatus.classList.toggle("hidden", !cleanMessage);
        importStatus.classList.toggle("custom-draft-card-search-status-error", Boolean(isError));
      }
    }

    function clearSearchResults() {
      importedSearchCards = null;
      abortPrintingRequests();
      if (!searchResults) {
        return;
      }

      searchResults.innerHTML = "";
      searchResults.classList.add("hidden");
      emptyState?.classList.remove("hidden");
      if (resultsSummary) resultsSummary.textContent = "Your card library";
    }

    function hidePagination() {
      if (searchPaginationBar) {
        searchPaginationBar.classList.add(
          "custom-draft-search-pagination-hidden",
        );
      }

      if (searchPageInput) {
        searchPageInput.value = 1;
        searchPageInput.max = 1;
      }

      if (searchPageTotal) {
        searchPageTotal.textContent = "of —";
      }

      if (searchPrevButton) {
        searchPrevButton.disabled = true;
      }

      if (searchNextButton) {
        searchNextButton.disabled = true;
      }
    }

    function updatePaginationBar(page, totalPages) {
      if (!searchPaginationBar) {
        return;
      }

      searchPaginationBar.classList.remove(
        "custom-draft-search-pagination-hidden",
      );

      if (searchPageInput) {
        searchPageInput.value = page;
        searchPageInput.max = totalPages;
      }

      if (searchPageTotal) {
        searchPageTotal.textContent = "of " + totalPages;
      }

      if (searchPrevButton) {
        searchPrevButton.disabled = page <= 1;
      }

      if (searchNextButton) {
        searchNextButton.disabled = page >= totalPages;
      }
    }

    function setPaginationLoadingState(page) {
      if (!searchPaginationBar) {
        return;
      }

      searchPaginationBar.classList.remove(
        "custom-draft-search-pagination-hidden",
      );

      if (searchPageInput) {
        searchPageInput.value = page || currentSearchPage || 1;
        searchPageInput.max = currentSearchTotalPages || 1;
      }

      if (searchPageTotal) {
        searchPageTotal.textContent = "of " + (currentSearchTotalPages || "—");
      }

      if (searchPrevButton) {
        searchPrevButton.disabled = true;
      }

      if (searchNextButton) {
        searchNextButton.disabled = true;
      }
    }

    function getSearchLoadingPhrase() {
      if (
        window.iMomirCustomDraftSearchPhrases &&
        typeof window.iMomirCustomDraftSearchPhrases.getLoadingPhrase ===
          "function"
      ) {
        return window.iMomirCustomDraftSearchPhrases.getLoadingPhrase({
          colorValues: getSelectedMultiSelectValues(searchColorFilter),
          typeValue: searchTypeFilter ? searchTypeFilter.value : "",
        });
      }

      return "Searching the library...";
    }

    function getAdvancedSearchHasAnyValue() {
      if (window.DeckadenceCardTags?.active("search")) return true;
      return Boolean(
        (searchInput && (searchInput.value || "").trim()) ||
        getSelectedMultiSelectValues(searchRarityFilter).length > 0 ||
        getSelectedMultiSelectValues(searchColorFilter).length > 0 ||
        (searchManaOperatorFilter &&
          (searchManaOperatorFilter.value || "").trim()) ||
        (searchManaValueFilter && (searchManaValueFilter.value || "").trim()) ||
        (searchTypeFilter && (searchTypeFilter.value || "").trim()) ||
        (searchSetCodeFilter && (searchSetCodeFilter.value || "").trim()) ||
        (searchYearStartFilter && (searchYearStartFilter.value || "").trim()) ||
        (searchYearEndFilter && (searchYearEndFilter.value || "").trim()) ||
        (searchExcludeAddedFilter &&
          (searchExcludeAddedFilter.value || "").trim() === "exclude"),
      );
    }

    function buildAdvancedCardSearchUrl(page, baseUrl) {
      const params = new URLSearchParams();
      const tags = window.DeckadenceCardTags?.values("search");
      tags?.include.forEach(id => params.append("include_tag", id));
      tags?.exclude.forEach(id => params.append("exclude_tag", id));
      const requestedPage = page || 1;

      if (searchInput && (searchInput.value || "").trim()) {
        params.set("q", (searchInput.value || "").trim());
      }

      getSelectedMultiSelectValues(searchRarityFilter).forEach(
        function (rarityValue) {
          params.append("rarity", rarityValue);
        },
      );

      getSelectedMultiSelectValues(searchColorFilter).forEach(
        function (colorValue) {
          params.append("color_identity", colorValue);
        },
      );

      if (searchManaOperatorFilter && searchManaOperatorFilter.value) {
        params.set("mana_operator", searchManaOperatorFilter.value);
      }

      if (searchManaValueFilter && (searchManaValueFilter.value || "").trim()) {
        params.set("mana_value", (searchManaValueFilter.value || "").trim());
      }

      if (searchTypeFilter && searchTypeFilter.value) {
        params.set("type", searchTypeFilter.value);
      }

      if (searchSetCodeFilter && (searchSetCodeFilter.value || "").trim()) {
        params.set(
          "set_code",
          (searchSetCodeFilter.value || "").trim().toUpperCase(),
        );
      }

      if (searchYearStartFilter && (searchYearStartFilter.value || "").trim()) {
        params.set("year_start", (searchYearStartFilter.value || "").trim());
      }

      if (searchYearEndFilter && (searchYearEndFilter.value || "").trim()) {
        params.set("year_end", (searchYearEndFilter.value || "").trim());
      }

      if (searchDigitalFilter && searchDigitalFilter.value) {
        params.set("digital", searchDigitalFilter.value);
      }

      if (searchExcludeAddedFilter && searchExcludeAddedFilter.value) {
        params.set("exclude_added", searchExcludeAddedFilter.value);
      }

      if (searchPageSizeSelect && searchPageSizeSelect.value) {
        params.set("page_size", searchPageSizeSelect.value);
      }

      params.set("page", String(requestedPage));

      if (searchSortSelect && searchSortSelect.value) {
        params.set("sort", searchSortSelect.value);
      }

      return (baseUrl || config.searchUrl) + "?" + params.toString();
    }

    function getSearchResultsForActiveMode(results) {
      if (!activeChangePrintingState) {
        return results || [];
      }

      const targetCardName = String(activeChangePrintingState.cardName || "")
        .trim()
        .toLowerCase();

      return (results || []).filter(function (card) {
        return (
          String(card.card_name || "")
            .trim()
            .toLowerCase() === targetCardName
        );
      });
    }

    function getGroupedSearchCards(cards) {
      const groupLookup = new Map();

      (cards || []).forEach(function (card) {
        const cardName =
          String(card.card_name || "Unknown Card").trim() || "Unknown Card";
        const groupKey = cardName.toLowerCase();

        if (!groupLookup.has(groupKey)) {
          groupLookup.set(groupKey, {
            key: groupKey,
            card_name: cardName,
            cards: [],
          });
        }

        groupLookup.get(groupKey).cards.push(card);
      });

      const groups = Array.from(groupLookup.values());

      groups.forEach(function (group) {
        const selectedSortValue = searchSortSelect
          ? searchSortSelect.value
          : "name_asc";

        group.representative_card = getMostRecentCardPrinting(group.cards);

        group.cards.sort(function (cardA, cardB) {
          const cardAAlreadyAdded = isSearchCardAlreadyAdded(cardA);
          const cardBAlreadyAdded = isSearchCardAlreadyAdded(cardB);

          if (cardAAlreadyAdded !== cardBAlreadyAdded) {
            return cardAAlreadyAdded ? -1 : 1;
          }

          const rowA = buildVirtualSearchCardRow(cardA);
          const rowB = buildVirtualSearchCardRow(cardB);

          const sortCompare = compareCardRows(rowA, rowB, selectedSortValue);

          if (sortCompare !== 0) {
            return sortCompare;
          }

          return (
            getCardReleaseDateSortValue(cardB) -
            getCardReleaseDateSortValue(cardA)
          );
        });

        group.already_in_set_count = group.cards.filter(function (card) {
          return isSearchCardAlreadyAdded(card);
        }).length;
      });

      groups.sort(function (groupA, groupB) {
        const firstA = groupA.cards[0] || {};
        const firstB = groupB.cards[0] || {};

        const virtualRowA = buildVirtualSearchCardRow(firstA, groupA.card_name);
        const virtualRowB = buildVirtualSearchCardRow(firstB, groupB.card_name);

        return compareCardRows(
          virtualRowA,
          virtualRowB,
          searchSortSelect ? searchSortSelect.value : "name_asc",
        );
      });

      return groups;
    }

    function createSearchResultPrintingRow(card) {
      const row = document.createElement("div");
      row.className =
        "custom-draft-card-search-row custom-draft-card-search-printing-row";

      const manaValue =
        card.mana_value === null ||
        card.mana_value === undefined ||
        card.mana_value === ""
          ? ""
          : String(card.mana_value);

      row.dataset.cardSearch = [
        card.card_name || "",
        card.set_code || "",
        card.collector_number || "",
        card.rarity || "",
        card.type_line || "",
        card.color_identity_json || "[]",
        manaValue,
      ]
        .join(" ")
        .toLowerCase();

      row.dataset.cardUuid = String(card.card_uuid || "");
      row.dataset.printingKey = getSearchCardPrintingKey(card);
      row.dataset.rarity = String(card.rarity || "").toLowerCase();
      row.dataset.colorIdentity = String(
        card.color_identity_json || "[]",
      ).toLowerCase();
      row.dataset.manaValue = manaValue;
      row.dataset.typeLine = String(card.type_line || "").toLowerCase();
      row.dataset.cardName = String(card.card_name || "").toLowerCase();
      row.dataset.displayCardName = String(card.card_name || "");
      row.dataset.setCode = String(card.set_code || "").toUpperCase();
      row.dataset.releaseYear = String(card.release_year || "");
      row.dataset.collectorNumber = String(card.collector_number || "");
      row.dataset.rarityDisplay = String(card.rarity || "");
      row.dataset.imageSrc = String(card.image_src || "");
      row.dataset.edhrecRank =
        card.edhrec_rank === null || card.edhrec_rank === undefined
          ? ""
          : String(card.edhrec_rank);
      row.dataset.edhrecSaltiness =
        card.edhrec_saltiness === null || card.edhrec_saltiness === undefined
          ? ""
          : String(card.edhrec_saltiness);
      row.dataset.sortPrice =
        card.sort_price === null || card.sort_price === undefined
          ? ""
          : String(card.sort_price);

      const hasAlternateSource =
        card.has_alternate_source === true ||
        card.has_alternate_source === 1 ||
        card.has_alternate_source === "1";

      const alternateRemoveBleed =
        card.alternate_remove_bleed === true ||
        card.alternate_remove_bleed === 1 ||
        card.alternate_remove_bleed === "1";

      const hasUpscaledImage =
        card.has_upscaled_image === true ||
        card.has_upscaled_image === 1 ||
        card.has_upscaled_image === "1";

      row.dataset.hasAlternateSource = hasAlternateSource ? "1" : "0";
      row.dataset.alternateRemoveBleed = alternateRemoveBleed ? "1" : "0";
      row.dataset.hasUpscaledImage = hasUpscaledImage ? "1" : "0";

      const alreadyAdded = isSearchCardAlreadyAdded(card);

      if (alreadyAdded) {
        row.classList.add("custom-draft-card-search-row-disabled");
      }

      const imageWrap = document.createElement("div");
      imageWrap.className = "custom-draft-card-search-image-wrap";

      const image = document.createElement("img");
      image.className =
        "custom-draft-card-search-image custom-draft-card-zoomable";
      image.loading = "lazy";
      image.decoding = "async";
      image.src = searchArtworkUrl(card.image_src);
      image.alt = card.card_name || "Card";
      image.setAttribute("role", "button");
      image.setAttribute("tabindex", "0");
      image.dataset.zoomSrc = searchArtworkUrl(card.image_src, true);
      image.dataset.zoomAlt = card.card_name || "Card";

      imageWrap.appendChild(image);

      const main = document.createElement("div");
      main.className = "custom-draft-card-search-main";

      const title = document.createElement("div");
      title.className = "custom-draft-card-search-title";
      title.textContent = card.set_name || card.set_code || "Custom printing";

      if (hasAlternateSource) {
        const alternateBadge = document.createElement("span");
        alternateBadge.className = "custom-draft-card-search-alt-image-badge";
        alternateBadge.title = alternateRemoveBleed
          ? "Alternate image available - Remove Bleed"
          : "Alternate image available - No Bleed";
        alternateBadge.setAttribute(
          "aria-label",
          alternateRemoveBleed
            ? "Alternate image available - Remove Bleed"
            : "Alternate image available - No Bleed",
        );
        alternateBadge.textContent = "ALT IMG";

        title.appendChild(alternateBadge);
      }

      if (hasUpscaledImage) {
        const upscaledBadge = document.createElement("span");

        upscaledBadge.className =
          "custom-draft-card-search-alt-image-badge " +
          "image-source-upscaled-badge";

        upscaledBadge.title = "Upscaled Scryfall image available";

        upscaledBadge.setAttribute(
          "aria-label",
          "Upscaled Scryfall image available",
        );

        upscaledBadge.textContent = "UPSCALED";

        title.appendChild(upscaledBadge);
      }

      const meta = document.createElement("div");
      meta.className = "custom-draft-card-search-meta";

      const metaLineOne = document.createElement("div");
      metaLineOne.className = "custom-draft-card-search-meta-line";
      metaLineOne.textContent = [
        card.set_code || "",
        card.release_year ? card.release_year : "",
        card.collector_number ? "#" + card.collector_number : "",
        card.rarity || "",
      ]
        .filter(Boolean)
        .join(" • ");

      const metaLineTwo = document.createElement("div");
      metaLineTwo.className = "custom-draft-card-search-type-line";
      metaLineTwo.textContent = card.type_line || "";
      meta.title = [
        "Color identity: " + getColorIdentityLabel(card.color_identity_json || "[]", card.type_line || ""),
        card.edhrec_rank != null ? "EDHREC " + card.edhrec_rank : "",
        card.edhrec_saltiness != null ? "Salt " + Number(card.edhrec_saltiness).toFixed(2) : "",
      ].filter(Boolean).join(" • ");

      meta.appendChild(metaLineOne);
      meta.appendChild(metaLineTwo);

      main.appendChild(title);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "custom-draft-card-search-actions";

      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className =
        "action-button secondary-button custom-draft-card-add-button";

      if (activeChangePrintingState) {
        const isCurrentPrinting =
          card.card_uuid === activeChangePrintingState.currentCardUuid;

        actionButton.textContent = isCurrentPrinting ? "Current" : "Switch";
        actionButton.disabled = Boolean(isCurrentPrinting);

        actionButton.addEventListener("click", async function () {
          await changeCardPrinting(card.card_uuid, actionButton);
        });
      } else {
        actionButton.textContent = alreadyAdded ? "Added" : "Add";
        actionButton.disabled = alreadyAdded;

        actionButton.addEventListener("click", async function () {
          await addCard(card.card_uuid, actionButton);
        });
      }

      actions.appendChild(actionButton);

      row.appendChild(imageWrap);
      row.appendChild(main);
      row.appendChild(actions);

      return row;
    }

    function refreshSearchResultAddedStates() {
      if (!searchResults) {
        return;
      }

      if (activeChangePrintingState) {
        Array.from(
          searchResults.querySelectorAll(
            ".custom-draft-card-search-row-disabled",
          ),
        ).forEach(function (row) {
          row.classList.remove("custom-draft-card-search-row-disabled");
        });

        Array.from(
          searchResults.querySelectorAll(
            ".custom-draft-card-search-group-added-pill",
          ),
        ).forEach(function (addedPill) {
          addedPill.classList.add("hidden");
          addedPill.textContent = "Added";
        });

        Array.from(
          searchResults.querySelectorAll(
            ".custom-draft-card-search-group-meta",
          ),
        ).forEach(function (groupMeta) {
          groupMeta.textContent = String(groupMeta.textContent || "").replace(
            /\s•\s\d+\s+already added/g,
            "",
          );
        });

        return;
      }

      Array.from(
        searchResults.querySelectorAll(".custom-draft-card-search-row"),
      ).forEach(function (row) {
        const cardUuid = String(row.dataset.cardUuid || "").trim();
        const printingKey = String(row.dataset.printingKey || "").trim();
        const lookup = getExistingCardLookup();

        const isAlreadyAdded =
          (cardUuid && lookup.cardUuids.has(cardUuid)) ||
          (printingKey && lookup.printingKeys.has(printingKey));

        if (!isAlreadyAdded) {
          return;
        }

        row.classList.add("custom-draft-card-search-row-disabled");

        const addButton = row.querySelector(".custom-draft-card-add-button");
        if (addButton && !activeChangePrintingState) {
          addButton.textContent = "Added";
          addButton.disabled = true;
        }
      });

      Array.from(
        searchResults.querySelectorAll(".custom-draft-card-search-group"),
      ).forEach(function (groupElement) {
        const disabledRows = Array.from(
          groupElement.querySelectorAll(
            ".custom-draft-card-search-row-disabled",
          ),
        );
        const addedPill = groupElement.querySelector(
          ".custom-draft-card-search-group-added-pill",
        );
        const groupMeta = groupElement.querySelector(
          ".custom-draft-card-search-group-meta",
        );

        if (addedPill) {
          addedPill.classList.toggle("hidden", disabledRows.length === 0);
          addedPill.textContent =
            disabledRows.length > 1 ? disabledRows.length + " Added" : "Added";
        }

        if (
          groupMeta &&
          disabledRows.length > 0 &&
          groupMeta.textContent.indexOf("already added") === -1
        ) {
          groupMeta.textContent = groupMeta.textContent
            ? groupMeta.textContent +
              " • " +
              disabledRows.length +
              " already added"
            : disabledRows.length + " already added";
        }
      });
    }

    function collapseSearchResultGroup(groupElement) {
      if (!groupElement) {
        return;
      }

      const headerButton = groupElement.querySelector(
        ".card-search-printings-toggle",
      );
      groupElement.classList.remove("custom-draft-card-search-group-expanded");

      if (headerButton) {
        headerButton.setAttribute("aria-expanded", "false");
      }

    }

    function updateSearchResultGroupFromAddedRow(resultRow) {
      const group = resultRow?.closest(".custom-draft-card-search-group");
      if (!group) return;
      const restoreFocus = resultRow.contains(document.activeElement);
      // Keep the representative artwork aligned with the header's Add action.
      collapseSearchResultGroup(group);
      if (restoreFocus) group.querySelector(".card-search-printings-toggle")?.focus();
    }

    function abortPrintingRequests() {
      searchResults?.querySelectorAll(".custom-draft-card-search-group").forEach(group => group.printingsAbortController?.abort());
    }

    function renderGroupPrintings(groupElement, cards, allPrintings) {
      const printings = groupElement.querySelector(".custom-draft-card-search-group-printings");
      printings.querySelectorAll(".custom-draft-card-search-row").forEach(row => row.remove());
      const fragment = document.createDocumentFragment();
      const grouped = getGroupedSearchCards(cards);
      grouped.forEach(group => group.cards.forEach(card => fragment.appendChild(createSearchResultPrintingRow(card))));
      printings.appendChild(fragment);
      groupElement.dataset.allPrintings = allPrintings ? "1" : "0";
      refreshSearchResultAddedStates();
      bindModalZoomableImages();
      filterSearchResults();
    }

    async function loadAllPrintings(groupElement) {
      if (groupElement.allPrintingCards) {
        if (seeAnyPrinting?.checked) renderGroupPrintings(groupElement, groupElement.allPrintingCards, true);
        return;
      }
      if (groupElement.printingsAbortController) return;
      const controller = new AbortController();
      groupElement.printingsAbortController = controller;
      const feedback = groupElement.querySelector(".card-search-printings-feedback");
      feedback.textContent = "Loading all printings…";
      feedback.classList.remove("hidden");
      groupElement.querySelector(".card-search-printings-toggle").setAttribute("aria-busy", "true");
      try {
        const cardsByUuid = new Map(groupElement.matchingCards.map(card => [card.card_uuid, card]));
        let page = 1;
        let totalPages = 1;
        do {
          const url = new URL(config.searchUrl, location.href);
          url.searchParams.set("printing_card_uuid", groupElement.dataset.primaryCardUuid);
          url.searchParams.set("page_size", "1000");
          url.searchParams.set("page", String(page));
          const response = await fetch(url, {headers: {Accept: "application/json"}, signal: controller.signal});
          const payload = await response.json();
          if (!response.ok || !payload.ok) throw new Error(payload.message || "Could not load printings.");
          (payload.results || []).forEach(card => cardsByUuid.set(card.card_uuid, card));
          totalPages = Math.max(1, Number(payload.total_pages) || 1);
          page += 1;
          if (!groupElement.isConnected || controller.signal.aborted) return;
        } while (page <= totalPages);
        groupElement.allPrintingCards = [...cardsByUuid.values()];
        if (seeAnyPrinting?.checked) renderGroupPrintings(groupElement, groupElement.allPrintingCards, true);
        feedback.classList.add("hidden");
      } catch (error) {
        if (error.name !== "AbortError" && groupElement.isConnected && seeAnyPrinting?.checked) {
          feedback.textContent = "Could not load all printings. ";
          const retry = document.createElement("button");
          retry.type = "button";
          retry.className = "card-search-quiet-button";
          retry.textContent = "Retry";
          retry.addEventListener("click", () => loadAllPrintings(groupElement));
          feedback.appendChild(retry);
        }
      } finally {
        groupElement.printingsAbortController = null;
        groupElement.querySelector(".card-search-printings-toggle").removeAttribute("aria-busy");
      }
    }

    function createSearchResultGroup(group) {
      const representative = group.representative_card || group.cards[0] || {};
      const groupElement = document.createElement("div");
      groupElement.className = "custom-draft-card-search-group";
      groupElement.dataset.primaryCardUuid = representative.card_uuid || "";
      groupElement.dataset.trackingCard = "1";
      groupElement.dataset.cardUuid = representative.card_uuid || "";
      groupElement.dataset.cardName = group.card_name || "";
      groupElement.matchingCards = group.cards;
      groupElement.matchingCardUuids = new Set(group.cards.map(card => card.card_uuid));
      const header = document.createElement("div");
      header.className = "custom-draft-card-search-group-header";
      const imageWrap = document.createElement("div");
      imageWrap.className = "custom-draft-card-search-group-image-wrap";
      const image = document.createElement("img");
      image.className = "custom-draft-card-search-group-image custom-draft-card-zoomable";
      image.src = searchArtworkUrl(representative.image_src);
      image.loading = "lazy";
      image.decoding = "async";
      image.alt = group.card_name || "Card";
      image.setAttribute("role", "button");
      image.tabIndex = 0;
      image.dataset.zoomSrc = searchArtworkUrl(representative.image_src, true);
      image.dataset.zoomAlt = image.alt;
      imageWrap.appendChild(image);
      const main = document.createElement("div");
      main.className = "custom-draft-card-search-group-main";
      const title = document.createElement("div");
      title.className = "custom-draft-card-search-group-title";
      title.textContent = group.card_name || "Unknown Card";
      const meta = document.createElement("div");
      meta.className = "custom-draft-card-search-group-meta";
      const manaLabel = representative.mana_value == null || representative.mana_value === "" ? "" : "MV " + representative.mana_value;
      meta.textContent = [representative.type_line, representative.set_name || representative.set_code, representative.release_year, manaLabel].filter(Boolean).join(" • ");
      main.append(title, meta);
      const addedPill = document.createElement("span");
      addedPill.className = "custom-draft-card-search-group-added-pill hidden";
      addedPill.textContent = "Added";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "card-search-printings-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Show printings of " + group.card_name);
      const count = document.createElement("span");
      count.className = "custom-draft-card-search-group-count";
      const expandIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      expandIcon.classList.add("custom-draft-card-search-group-expand-icon");
      expandIcon.setAttribute("viewBox", "0 0 24 24");
      expandIcon.setAttribute("aria-hidden", "true");
      expandIcon.setAttribute("focusable", "false");
      const chevron = document.createElementNS("http://www.w3.org/2000/svg", "path");
      chevron.setAttribute("d", "m6 9 6 6 6-6");
      expandIcon.appendChild(chevron);
      toggle.append(count, expandIcon);
      const printings = document.createElement("div");
      printings.className = "custom-draft-card-search-group-printings";
      printings.id = "search-printings-" + String(representative.card_uuid || "");
      toggle.setAttribute("aria-controls", printings.id);
      const feedback = document.createElement("div");
      feedback.className = "card-search-printings-feedback hidden";
      feedback.setAttribute("role", "status");
      printings.appendChild(feedback);
      group.cards.forEach(card => printings.appendChild(createSearchResultPrintingRow(card)));
      toggle.addEventListener("click", () => {
        const expanded = groupElement.classList.toggle("custom-draft-card-search-group-expanded");
        toggle.setAttribute("aria-expanded", String(expanded));
        if (expanded && seeAnyPrinting?.checked) loadAllPrintings(groupElement);
      });
      header.append(imageWrap, main, addedPill, toggle);
      if (!activeChangePrintingState) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "action-button secondary-button card-search-group-add";
        add.textContent = "Add";
        add.addEventListener("click", async () => {
          const row = groupElement.primarySearchRow;
          const rowButton = row?.querySelector(".custom-draft-card-add-button");
          if (!rowButton || rowButton.disabled) return;
          add.disabled = true;
          add.textContent = "Adding…";
          await addCard(row.dataset.cardUuid, rowButton);
          filterSearchResults();
        });
        header.appendChild(add);
      }
      groupElement.append(header, printings);
      return groupElement;
    }

    function renderSearchResults(cards) {
      if (!searchResults) {
        return;
      }

      abortPrintingRequests();
      searchResults.innerHTML = "";
      emptyState?.classList.add("hidden");
      if (resultsSummary) resultsSummary.textContent = "0 results";

      if (!cards || !cards.length) {
        const emptyRow = document.createElement("div");
        emptyRow.className = "custom-draft-card-search-empty";
        emptyRow.textContent = "No matching cards found.";
        searchResults.appendChild(emptyRow);
        searchResults.classList.remove("hidden");
        return;
      }

      const groups = getGroupedSearchCards(cards);
      const resultFragment = document.createDocumentFragment();

      groups.forEach(function (group) {
        resultFragment.appendChild(createSearchResultGroup(group));
      });

      searchResults.appendChild(resultFragment);
      refreshSearchResultAddedStates();

      bindModalZoomableImages();


      searchResults.classList.remove("hidden");
      filterSearchResults();
    }

    function filterSearchResults() {
      if (!searchResults) {
        return;
      }

      const selectedRarities = getSelectedMultiSelectValues(searchRarityFilter);
      const selectedColors = getSelectedMultiSelectValues(searchColorFilter);
      const manaOperator = searchManaOperatorFilter
        ? (searchManaOperatorFilter.value || "").trim()
        : "";
      const manaValue = searchManaValueFilter
        ? (searchManaValueFilter.value || "").trim()
        : "";
      const typeValue = searchTypeFilter
        ? (searchTypeFilter.value || "").trim().toLowerCase()
        : "";
      const digitalValue = searchDigitalFilter
        ? (searchDigitalFilter.value || "").trim().toLowerCase()
        : "";
      const excludeAddedValue = searchExcludeAddedFilter
        ? (searchExcludeAddedFilter.value || "").trim().toLowerCase()
        : "";

      const groups = Array.from(
        searchResults.querySelectorAll(".custom-draft-card-search-group"),
      );
      let visibleGroups = 0;
      let visiblePrintings = 0;

      groups.forEach(function (groupElement) {
        const rows = Array.from(
          groupElement.querySelectorAll(".custom-draft-card-search-row"),
        );
        let visibleCount = 0;
        let matchingVisibleCount = 0;
        const showAllPrintings = seeAnyPrinting?.checked && groupElement.dataset.allPrintings === "1";
        const matchingVisibleRows = [];

        rows.forEach(function (row) {
          const rowRarity = row.dataset.rarity || "";
          const rowTypeLine = row.dataset.typeLine || "";

          const rarityMatches = rowMatchesRarityFilter(
            rowRarity,
            selectedRarities,
          );
          const colorMatches = rowMatchesColorFilter(row, selectedColors);
          const manaMatches = rowMatchesManaFilter(
            row,
            manaOperator,
            manaValue,
          );
          const typeMatches =
            !typeValue || rowTypeLine.indexOf(typeValue) !== -1;
          const digitalMatches = rowMatchesDigitalFilter(row, digitalValue);
          const excludeAddedMatches =
            excludeAddedValue !== "exclude" ||
            !row.classList.contains("custom-draft-card-search-row-disabled");

          const matchesFilters =
            (!window.DeckadenceCardTags || window.DeckadenceCardTags.matches(row, "search")) &&
            rarityMatches &&
            colorMatches &&
            manaMatches &&
            typeMatches &&
            digitalMatches &&
            excludeAddedMatches;

          if (matchesFilters && groupElement.matchingCardUuids.has(row.dataset.cardUuid)) {
            matchingVisibleCount += 1;
            matchingVisibleRows.push(row);
          }
          const isVisible = (showAllPrintings || matchesFilters) && (!window.DeckadenceCardTags || window.DeckadenceCardTags.matches(row, "search"));

          row.classList.toggle("hidden", !isVisible);

          if (isVisible) {
            visibleCount += 1;
          }
        });

        groupElement.classList.toggle("hidden", matchingVisibleCount === 0);
        if (matchingVisibleCount) visibleGroups++;
        visiblePrintings += matchingVisibleCount;
        const primaryRow = matchingVisibleRows.find(row => row.dataset.cardUuid === groupElement.dataset.primaryCardUuid) || matchingVisibleRows[0];
        groupElement.primarySearchRow = primaryRow;
        const quickAdd = groupElement.querySelector(".card-search-group-add");
        const primaryButton = primaryRow?.querySelector(".custom-draft-card-add-button");
        if (quickAdd) {
          quickAdd.disabled = !primaryButton || primaryButton.disabled;
          quickAdd.textContent = primaryButton?.textContent || "Add";
          quickAdd.title = primaryRow ? "Add " + primaryRow.dataset.displayCardName + " (" + primaryRow.dataset.setCode + ")" : "Add";
        }

        const countBadge = groupElement.querySelector(
          ".custom-draft-card-search-group-count",
        );
        if (countBadge) {
          const totalCount = rows.length;
          countBadge.textContent = seeAnyPrinting?.checked && !showAllPrintings ? "All printings" :
            visibleCount === totalCount
              ? totalCount + " printing" + (totalCount === 1 ? "" : "s")
              : visibleCount + " of " + totalCount + " printings";
        }
      });
      if (groups.length && resultsSummary) resultsSummary.textContent = visibleGroups + " card" + (visibleGroups === 1 ? "" : "s") + " · " + visiblePrintings + (seeAnyPrinting?.checked ? " matching printing" : " printing") + (visiblePrintings === 1 ? "" : "s") + " on this page";
      updateAdvancedFilterCount();
    }

    document.addEventListener("deckadence:tag-filters-changed", event => {
      if (event.detail.scope !== "search") return;
      updateAdvancedFilterCount();
      if (importedSearchCards) filterSearchResults();
      else runCardSearch(1);
    });
    document.addEventListener("deckadence:card-tags-changed", () => {
      if (!importedSearchCards && window.DeckadenceCardTags?.active("search") &&
          searchOverlay && !searchOverlay.classList.contains("hidden")) runCardSearch(1);
      else filterSearchResults();
    });

    let cardSearchRevision = 0;
    let cardSearchController = null;
    async function runCardSearch(page) {
      const revision = ++cardSearchRevision;
      cardSearchController?.abort();
      importedSearchCards = null;
      if (!searchButton) {
        return;
      }

      if (!config.searchUrl) {
        setSearchStatus("Card search URL was not configured.", true);
        return;
      }

      if (!getAdvancedSearchHasAnyValue()) {
        searchButton.disabled = false;
        searchButton.classList.remove("action-button-loading");
        searchButton.textContent = "Search";
        setSearchStatus(
          "Enter a text search or choose at least one search option.",
          true,
        );
        clearSearchResults();
        hidePagination();
        return;
      }

      const requestedPage = page || 1;
      cardSearchController = new AbortController();

      searchButton.disabled = true;
      searchButton.classList.add("action-button-loading");
      searchButton.textContent = "Searching...";
      setSearchStatus(getSearchLoadingPhrase(), false);
      setPaginationLoadingState(requestedPage);

      try {
        const response = await fetch(
          buildAdvancedCardSearchUrl(requestedPage),
          {
            method: "GET",
            signal: cardSearchController.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Card search failed.");
        }

        if (revision !== cardSearchRevision) return;
        currentSearchPage = payload.page || 1;
        currentSearchTotalPages = payload.total_pages || 1;

        const totalCount = payload.total_count || 0;
        const pageSize = payload.page_size || 50;

        currentSearchTotalCount = totalCount;
        updateAddAllResultsButtonState();

        const modeResults = getSearchResultsForActiveMode(
          payload.results || [],
        );
        renderSearchResults(modeResults);

        if (activeChangePrintingState) {
          setSearchStatus(
            "Loaded " +
              modeResults.length +
              " printing(s) for " +
              activeChangePrintingState.cardName +
              ".",
            false,
          );
        } else {
          const start = (currentSearchPage - 1) * pageSize + 1;
          const end = Math.min(currentSearchPage * pageSize, totalCount);
          setSearchStatus(
            "Showing " +
              (totalCount ? start : 0) +
              "–" +
              end +
              " of " +
              totalCount +
              " result(s).",
            false,
          );
        }

        updatePaginationBar(currentSearchPage, currentSearchTotalPages);
      } catch (error) {
        if (revision !== cardSearchRevision || error.name === "AbortError") return;
        console.error(error);
        currentSearchTotalCount = 0;
        updateAddAllResultsButtonState();
        clearSearchResults();
        hidePagination();
        setSearchStatus(error.message || "Card search failed.", true);
      } finally {
        if (revision === cardSearchRevision) {
          searchButton.disabled = false;
          searchButton.classList.remove("action-button-loading");
          searchButton.textContent = "Search";
        }
      }
    }

    async function runAddAllResults() {
      if (
        !addAllResultsButton ||
        !config.addAllResultsUrl ||
        activeChangePrintingState
      ) {
        return;
      }

      if (!getAdvancedSearchHasAnyValue()) {
        setSearchStatus(
          "Enter a text search or choose at least one search option.",
          true,
        );
        return;
      }

      const confirmed = await confirmAction({
        title: "Add All Search Results",
        message:
          config.addAllResultsConfirmMessage ||
          "This will add only the most recent printing of each unique matching card.",
        confirmText: "Add All",
        cancelText: "Cancel",
      });

      if (!confirmed) {
        return;
      }

      const defaultButtonText =
        config.addAllResultsText || "Add All Results to Set";

      addAllResultsButton.disabled = true;
      addAllResultsButton.classList.add("action-button-loading");
      addAllResultsButton.textContent = "Adding...";
      setSearchStatus(
        "Adding the most recent printing of each matching card...",
        false,
      );

      try {
        const response = await fetch(
          buildAdvancedCardSearchUrl(1, config.addAllResultsUrl),
          {
            method: "POST",
            headers: {
              Accept: "application/json",
            },
          },
        );

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.message || "Failed to add all search results.",
          );
        }

        setSearchStatus(
          (payload.message || "Matching cards added.") +
            " Reloading card list...",
          false,
        );

        window.setTimeout(function () {
          window.location.reload();
        }, 700);
      } catch (error) {
        console.error(error);
        setSearchStatus(
          error.message || "Failed to add all search results.",
          true,
        );
      } finally {
        addAllResultsButton.classList.remove("action-button-loading");
        addAllResultsButton.textContent = defaultButtonText;
        updateAddAllResultsButtonState();
      }
    }

    function buildBulkImportFormDataOrShowError() {
      const importTextValue = bulkImportText
        ? (bulkImportText.value || "").trim()
        : "";
      const hasFile =
        bulkImportFile &&
        bulkImportFile.files &&
        bulkImportFile.files.length > 0;

      if (!importTextValue && !hasFile) {
        setSearchStatus("Paste a list or upload a list file.", true);
        clearSearchResults();
        return null;
      }

      const formData = new FormData();

      if (importTextValue) {
        formData.append("import_text", importTextValue);
      }

      if (hasFile) {
        formData.append("import_file", bulkImportFile.files[0]);
      }

      return formData;
    }

    async function runBulkImportSearch() {
      if (!bulkImportButton || !config.bulkImportUrl) {
        return;
      }

      const formData = buildBulkImportFormDataOrShowError();

      if (!formData) {
        return;
      }

      currentSearchTotalCount = 0;
      updateAddAllResultsButtonState();

      bulkImportButton.disabled = true;
      bulkImportButton.classList.add("action-button-loading");
      bulkImportButton.textContent = "Loading List...";
      setSearchStatus("", false);

      try {
        const response = await fetch(config.bulkImportUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          body: formData,
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Bulk import search failed.");
        }

        const modeResults = getSearchResultsForActiveMode(
          payload.results || [],
        );
        renderSearchResults(modeResults);

        let statusText =
          "Loaded " +
          modeResults.length +
          " result(s) from " +
          (payload.parsed_count || 0) +
          " parsed card line(s).";

        if (payload.unmatched_count) {
          statusText +=
            " " + payload.unmatched_count + " card name(s) were not matched.";
        }

        setSearchStatus(statusText, false);
        importedSearchCards = modeResults;
        hidePagination();
        setBulkImportPanelOpen(false);
        searchResults.querySelector(".card-search-printings-toggle")?.focus();
      } catch (error) {
        console.error(error);
        clearSearchResults();
        setSearchStatus(error.message || "Bulk import search failed.", true);
      } finally {
        bulkImportButton.disabled = false;
        bulkImportButton.classList.remove("action-button-loading");
        bulkImportButton.textContent = "Load List into Search Results";
      }
    }

    async function runBulkImportAddMostRecent() {
      if (
        !bulkImportAddMostRecentButton ||
        !config.bulkImportAddMostRecentUrl
      ) {
        return;
      }

      const formData = buildBulkImportFormDataOrShowError();

      if (!formData) {
        return;
      }

      const confirmed = await confirmAction({
        title: "Add Most Recent Printings",
        message:
          config.bulkImportAddMostRecentConfirmMessage ||
          "This will add the most recent matching printing for each parsed card name directly.",
        confirmText: "Add Cards",
        cancelText: "Cancel",
      });

      if (!confirmed) {
        return;
      }

      bulkImportAddMostRecentButton.disabled = true;
      bulkImportAddMostRecentButton.classList.add("action-button-loading");
      const bulkImportAddMostRecentDefaultText =
        config.bulkImportAddMostRecentText || "Add Most Recent to Set";
      bulkImportAddMostRecentButton.textContent = "Adding...";
      setSearchStatus("", false);

      try {
        const response = await fetch(config.bulkImportAddMostRecentUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          body: formData,
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Direct import failed.");
        }

        const statusText =
          payload.message ||
          "Imported " + (payload.added_count || 0) + " card(s).";

        setSearchStatus(statusText + " Reloading card list...", false);

        window.setTimeout(function () {
          window.location.reload();
        }, 700);
      } catch (error) {
        console.error(error);
        setSearchStatus(error.message || "Direct import failed.", true);
      } finally {
        bulkImportAddMostRecentButton.disabled = false;
        bulkImportAddMostRecentButton.classList.remove("action-button-loading");
        bulkImportAddMostRecentButton.textContent =
          bulkImportAddMostRecentDefaultText;
      }
    }

    async function addCard(cardUuid, button, customCardCreation = false, isFoil = false) {
      if (!cardUuid || !button || !config.addUrl) {
        return;
      }

      button.disabled = true;
      button.classList.add("action-button-loading");
      button.textContent = "Adding...";

      try {
        const response = await fetch(config.addUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            card_uuid: cardUuid,
            custom_card_creation: customCardCreation,
            is_foil: isFoil,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to add card.");
        }

        // Sets allow one printing per name. A rejected alternative must not
        // appear as an added printing or enter the client-side added cache.
        if (payload.inserted === false && !payload.card && config.addAllResultsUrl) {
          button.classList.remove("action-button-loading");
          button.disabled = false;
          button.textContent = "Add";
          setSearchStatus((payload.message || "This card is already in the set.") + " Use Change Printing in the set card list to replace it.", false);
          return false;
        }

        button.classList.remove("action-button-loading");
        button.textContent = payload.inserted ? "Added" : "Already Added";
        button.disabled = true;

        const resultRow = button.closest(".custom-draft-card-search-row");
        if (resultRow) {
          const resultCardUuid = String(
            resultRow.dataset.cardUuid || cardUuid || "",
          ).trim();
          const resultPrintingKey = String(
            resultRow.dataset.printingKey || "",
          ).trim();

          if (resultCardUuid) {
            clientAddedCardUuidLookup.add(resultCardUuid);
          }

          if (resultPrintingKey) {
            clientAddedPrintingKeyLookup.add(resultPrintingKey);
          }

          resultRow.classList.add("custom-draft-card-search-row-disabled");
          updateSearchResultGroupFromAddedRow(resultRow);
        }

        if (typeof config.onAddSuccess === "function") {
          config.onAddSuccess(payload, {
            cardUuid: cardUuid,
            button: button,
            resultRow: resultRow,
            setStatus: setSearchStatus,
          });
        }

        setSearchStatus(
          payload.message || "Card added. Search results remain open.",
          false,
        );
        clientAddedCardUuidLookup.add(cardUuid);
        if (payload.inserted !== false) recordAdded();
        refreshSearchResultAddedStates();
        filterSearchResults();
        return true;
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.classList.remove("action-button-loading");
        button.textContent = "Add";
        showMessage(error.message || "Failed to add card.", true);
        return false;
      }
    }

    async function changeCardPrinting(cardUuid, button) {
      if (!activeChangePrintingState || !cardUuid || !button) {
        return;
      }

      button.disabled = true;
      button.classList.add("action-button-loading");
      button.textContent = "Switching...";

      try {
        const response = await fetch(activeChangePrintingState.updateUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            card_uuid: cardUuid,
          }),
        });

        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Failed to change printing.");
        }

        const previousCardUuid =
          activeChangePrintingState.currentCardUuid || "";

        if (previousCardUuid && previousCardUuid !== cardUuid) {
          clientAddedCardUuidLookup.delete(previousCardUuid);
        }

        button.classList.remove("action-button-loading");
        button.textContent = "Switched";

        const resultRow = button.closest(".custom-draft-card-search-row");

        if (typeof config.onChangePrintingSuccess === "function") {
          config.onChangePrintingSuccess(payload, {
            cardUuid: cardUuid,
            button: button,
            resultRow: resultRow,
            activeChangePrintingState: activeChangePrintingState,
            setStatus: setSearchStatus,
            close: close,
            updateSearchResultGroupFromAddedRow:
              updateSearchResultGroupFromAddedRow,
          });
        } else {
          setSearchStatus(payload.message || "Printing updated.", false);
          close();
        }
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.classList.remove("action-button-loading");
        button.textContent = "Switch";
        showMessage(error.message || "Failed to change printing.", true);
      }
    }

    function setBulkImportPanelOpen(isOpen) {
      if (!bulkImportPanel || !bulkImportToggleButton) {
        return;
      }

      bulkImportPanel.classList.toggle(
        "custom-draft-bulk-import-panel-open",
        Boolean(isOpen),
      );
      bulkImportPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
      bulkImportToggleButton.classList.toggle(
        "custom-draft-bulk-import-toggle-active",
        Boolean(isOpen),
      );
      bulkImportToggleButton.setAttribute(
        "aria-expanded",
        isOpen ? "true" : "false",
      );
      setMoreOptionsOpen(false);
      const mainWindow = searchOverlay?.querySelector(".custom-draft-card-search-window");
      if (mainWindow) mainWindow.inert = Boolean(isOpen);
      if (isOpen) {
        getElement("customDraftBulkImportStatus")?.classList.add("hidden");
        bulkImportText?.focus();
      }
      else if (bulkImportPanel.contains(document.activeElement)) moreOptionsButton?.focus();
    }

    function resetModalResultsForModeChange() {
      currentSearchTotalCount = 0;
      updateAddAllResultsButtonState();
      clearSearchResults();
      hidePagination();
      setSearchStatus("", false);

      if (searchButton) {
        searchButton.disabled = false;
        searchButton.classList.remove("action-button-loading");
        searchButton.textContent = "Search";
      }

      if (bulkImportButton) {
        bulkImportButton.disabled = false;
        bulkImportButton.classList.remove("action-button-loading");
        bulkImportButton.textContent = "Load List into Search Results";
      }

      if (bulkImportAddMostRecentButton) {
        bulkImportAddMostRecentButton.disabled = false;
        bulkImportAddMostRecentButton.classList.remove("action-button-loading");
        bulkImportAddMostRecentButton.textContent =
          config.bulkImportAddMostRecentText || "Add Most Recent to Set";
      }
    }

    function open() {
      if (!searchOverlay) {
        return;
      }

      searchOpener = document.activeElement;
      restoreSearchWindowSize();
      searchOverlay.classList.remove("hidden");
      searchOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("custom-draft-search-maximized-active");
      updateAdvancedFilterCount();

      if (searchInput) {
        window.setTimeout(function () {
          searchInput.focus();
        }, 50);
      }
    }

    function close() {
      if (!searchOverlay) {
        return;
      }

      abortPrintingRequests();
      setBulkImportPanelOpen(false);
      setMoreOptionsOpen(false);
      searchOverlay.classList.add("hidden");
      searchOverlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("custom-draft-search-maximized-active");
      if (searchOpener?.isConnected) searchOpener.focus({preventScroll: true});

      activeChangePrintingState = null;

      setModalTitle(
        "Add Cards",
        "Search by card name, set, color identity, rarity, mana value, year, spell type, EDHREC rank, or saltiness.",
      );
    }

    function openAddCards() {
      activeChangePrintingState = null;
      addedThisSession = 0;
      recordAdded(0);
      addedCountLabel?.classList.remove("hidden");

      /*
       * Important:
       * Change Printing and Add Cards share the same DOM.
       * If the modal previously rendered Change Printing rows, those rows have
       * Switch buttons wired to changeCardPrinting(). They must not remain visible
       * when reopening the modal in Add Cards mode.
       */
      resetModalResultsForModeChange();

      /*
       * These caches are only a client-side convenience. The authoritative
       * "already added" state comes from getExistingCardLookup(), which reads
       * the current page/deck/set state.
       *
       * Clearing them here prevents an old printing from staying marked as
       * Added after that card was changed to a different printing.
       */
      clientAddedCardUuidLookup.clear();
      clientAddedPrintingKeyLookup.clear();

      setModalTitle(
        "Add Cards",
        config.addAllResultsUrl ? "Choose cards for your custom set" : "Add cards to your deck’s sideboard",
      );

      open();
    }

    async function openChangePrinting(changeState) {
      activeChangePrintingState = changeState || null;

      if (!activeChangePrintingState) {
        return;
      }

      currentSearchTotalCount = 0;
      updateAddAllResultsButtonState();
      addedCountLabel?.classList.add("hidden");

      setModalTitle(
        "Change Printing",
        "Choose a replacement printing for " +
          activeChangePrintingState.cardName +
          ". The special slot category will be preserved.",
      );

      clearSearchResults();
      setSearchStatus("", false);

      if (searchInput) {
        searchInput.value = activeChangePrintingState.cardName || "";
      }

      clearMultiSelectValues(searchRarityFilter);
      clearMultiSelectValues(searchColorFilter);

      if (searchManaOperatorFilter) {
        searchManaOperatorFilter.value = "";
      }

      if (searchManaValueFilter) {
        searchManaValueFilter.value = "";
      }

      if (searchTypeFilter) {
        searchTypeFilter.value = "";
      }

      if (searchSetCodeFilter) {
        searchSetCodeFilter.value = "";
      }

      if (searchYearStartFilter) {
        searchYearStartFilter.value = "";
      }

      if (searchYearEndFilter) {
        searchYearEndFilter.value = "";
      }

      if (searchExcludeAddedFilter) {
        searchExcludeAddedFilter.value = "";
      }

      if (searchSortSelect) {
        searchSortSelect.value = "year_newest";
      }

      open();
      await runCardSearch(1);
    }

    function clearSearchFilters() {
      ++cardSearchRevision;
      cardSearchController?.abort();
      if (searchButton) {
        searchButton.disabled = false;
        searchButton.classList.remove("action-button-loading");
        searchButton.textContent = "Search";
      }
      window.DeckadenceCardTags?.reset("search");
      if (seeAnyPrinting) seeAnyPrinting.checked = false;
      currentSearchTotalCount = 0;
      updateAddAllResultsButtonState();

      if (searchInput) {
        searchInput.value = "";
      }

      clearMultiSelectValues(searchRarityFilter);
      clearMultiSelectValues(searchColorFilter);

      if (searchManaOperatorFilter) {
        searchManaOperatorFilter.value = "";
      }

      if (searchManaValueFilter) {
        searchManaValueFilter.value = "";
      }

      if (searchTypeFilter) {
        searchTypeFilter.value = "";
      }

      if (searchSetCodeFilter) {
        searchSetCodeFilter.value = "";
      }

      if (searchYearStartFilter) {
        searchYearStartFilter.value = "";
      }

      if (searchYearEndFilter) {
        searchYearEndFilter.value = "";
      }

      if (searchDigitalFilter) {
        searchDigitalFilter.value = "exclude";
      }

      if (searchExcludeAddedFilter) {
        searchExcludeAddedFilter.value = "";
      }

      if (searchSortSelect) {
        searchSortSelect.value = "name_asc";
      }

      if (bulkImportText) {
        bulkImportText.value = "";
      }

      if (bulkImportFile) {
        bulkImportFile.value = "";
      }

      clearSearchResults();
      hidePagination();
      setSearchStatus("", false);
      updateAdvancedFilterCount();
    }

    function bindEvents() {
      document.addEventListener("deckadence:custom-card-deleted", function (event) {
        const uuid = event.detail?.cardUuid;
        if (!uuid) return;
        clientAddedCardUuidLookup.delete(uuid);
        if (importedSearchCards) {
          importedSearchCards = importedSearchCards.filter(card => card.card_uuid !== uuid);
          renderSearchResults(importedSearchCards);
        } else if (searchResults?.querySelector('[data-card-uuid="' + CSS.escape(uuid) + '"]')) {
          clearSearchResults();
          hidePagination();
        }
      });
      seeAnyPrinting?.addEventListener("change", () => {
        searchResults.querySelectorAll(".custom-draft-card-search-group").forEach(group => {
          if (!seeAnyPrinting.checked) {
            if (group.dataset.allPrintings === "1") renderGroupPrintings(group, group.matchingCards, false);
            group.querySelector(".card-search-printings-feedback").classList.add("hidden");
          } else if (group.classList.contains("custom-draft-card-search-group-expanded")) {
            loadAllPrintings(group);
          }
        });
        filterSearchResults();
      });
      maximizeButton?.addEventListener("click", () => setSearchMaximized(!searchMaximized));
      moreOptionsButton?.addEventListener("click", () => setMoreOptionsOpen(moreOptionsMenu.classList.contains("hidden")));
      moreOptionsButton?.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        setMoreOptionsOpen(true);
        moreOptionsMenu.querySelector("button:not(.hidden)")?.focus();
      });
      moreOptionsMenu?.addEventListener("keydown", event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const items = [...moreOptionsMenu.querySelectorAll("button:not(.hidden)")];
        const index = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
      });
      moreFiltersButton?.addEventListener("click", () => {
        const expanded = advancedFilters.classList.contains("hidden");
        advancedFilters.classList.toggle("hidden", !expanded);
        moreFiltersButton.setAttribute("aria-expanded", String(expanded));
      });
      advancedFilters?.addEventListener("input", updateAdvancedFilterCount);
      advancedFilters?.addEventListener("change", updateAdvancedFilterCount);
      doneButton?.addEventListener("click", close);
      getElement("customDraftBulkImportCloseButton")?.addEventListener("click", () => setBulkImportPanelOpen(false));
      if (bulkImportToggleButton) {
        bulkImportToggleButton.addEventListener("click", function () {
          const isOpen = bulkImportPanel
            ? bulkImportPanel.classList.contains(
                "custom-draft-bulk-import-panel-open",
              )
            : false;

          setBulkImportPanelOpen(!isOpen);
        });
      }

      if (closeButton) {
        closeButton.addEventListener("click", close);
      }

      if (searchButton) {
        searchButton.addEventListener("click", function () {
          runCardSearch(1);
        });
      }

      if (addAllResultsButton) {
        addAllResultsButton.addEventListener("click", runAddAllResults);
      }

      if (bulkImportButton) {
        bulkImportButton.addEventListener("click", runBulkImportSearch);
      }

      if (bulkImportAddMostRecentButton) {
        bulkImportAddMostRecentButton.addEventListener(
          "click",
          runBulkImportAddMostRecent,
        );
      }

      if (searchInput) {
        searchInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            runCardSearch(1);
          }
        });
      }

      [
        searchManaOperatorFilter,
        searchManaValueFilter,
        searchTypeFilter,
        searchSetCodeFilter,
        searchSortSelect,
        searchYearStartFilter,
        searchYearEndFilter,
        searchDigitalFilter,
        searchExcludeAddedFilter,
        searchPageSizeSelect,
      ].forEach(function (searchFilterElement) {
        if (!searchFilterElement) {
          return;
        }

        searchFilterElement.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            runCardSearch(1);
          }
        });
      });

      if (searchPageSizeSelect) {
        searchPageSizeSelect.addEventListener("change", function () {
          if (typeof config.onPageSizeChange === "function") {
            config.onPageSizeChange(searchPageSizeSelect.value || "500");
          }

          if (
            searchResults &&
            !searchResults.classList.contains("hidden") &&
            getAdvancedSearchHasAnyValue()
          ) {
            runCardSearch(1);
          }
        });
      }

      searchSortSelect?.addEventListener("change", () => {
        if (importedSearchCards) renderSearchResults(importedSearchCards);
        else if (!searchResults?.classList.contains("hidden") && getAdvancedSearchHasAnyValue()) runCardSearch(1);
      });

      if (searchPrevButton) {
        searchPrevButton.addEventListener("click", function () {
          if (currentSearchPage > 1) {
            runCardSearch(currentSearchPage - 1);
          }
        });
      }

      if (searchNextButton) {
        searchNextButton.addEventListener("click", function () {
          if (currentSearchPage < currentSearchTotalPages) {
            runCardSearch(currentSearchPage + 1);
          }
        });
      }

      if (searchPageInput) {
        searchPageInput.addEventListener("change", function () {
          const requestedPage = parseInt(searchPageInput.value, 10);

          if (!Number.isFinite(requestedPage)) {
            return;
          }

          const clampedPage = Math.max(
            1,
            Math.min(requestedPage, currentSearchTotalPages),
          );
          runCardSearch(clampedPage);
        });

        searchPageInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            searchPageInput.blur();
          }
        });
      }

      bindMultiSelect(searchRarityFilter, filterSearchResults);
      bindMultiSelect(searchColorFilter, filterSearchResults);

      [
        searchManaOperatorFilter,
        searchManaValueFilter,
        searchTypeFilter,
        searchDigitalFilter,
        searchExcludeAddedFilter,
      ].forEach(function (filterElement) {
        if (filterElement) {
          filterElement.addEventListener("input", filterSearchResults);
          filterElement.addEventListener("change", filterSearchResults);
        }
      });

      if (searchClearFiltersButton) {
        searchClearFiltersButton.addEventListener("click", clearSearchFilters);
      }

      document.addEventListener("click", function (event) {
        if (!event.target.closest(".card-search-more-wrap")) setMoreOptionsOpen(false);
        if (!event.target.closest(".custom-draft-multi-select")) {
          document
            .querySelectorAll(".custom-draft-multi-select")
            .forEach(function (containerElement) {
              closeMultiSelect(containerElement);
            });
        }
      });

      document.addEventListener("keydown", function (event) {
        const customCardOverlay = getElement("customCardOverlay");
        if (event.key !== "Escape" || searchOverlay?.classList.contains("hidden") || (customCardOverlay && !customCardOverlay.classList.contains("hidden"))) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (modalZoomOverlay && !modalZoomOverlay.classList.contains("hidden")) closeModalImageZoom();
        else if (bulkImportPanel?.classList.contains("custom-draft-bulk-import-panel-open")) setBulkImportPanelOpen(false);
        else if (!moreOptionsMenu?.classList.contains("hidden")) setMoreOptionsOpen(false, true);
        else {
          const openFilter = searchOverlay.querySelector('.custom-draft-multi-select:has(.custom-draft-multi-select-menu:not(.hidden))');
          if (openFilter) {
            closeMultiSelect(openFilter);
            openFilter.querySelector("button")?.focus();
          } else close();
        }
      }, true);
    }

    updateAddAllResultsButtonState();
    bindEvents();

    return {
      open: open,
      close: close,
      openAddCards: openAddCards,
      openChangePrinting: openChangePrinting,
      runSearch: runCardSearch,
      clearSearchFilters: clearSearchFilters,
      isOpen: function () {
        return Boolean(
          searchOverlay && !searchOverlay.classList.contains("hidden"),
        );
      },
    };
  }

  window.iMomirCardSearchModal = {
    init: initCardSearchModal,
  };
})();
