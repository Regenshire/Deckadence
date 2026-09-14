document.addEventListener("DOMContentLoaded", function () {
  const screen = document.getElementById("deckRouletteScreen");

  if (!screen) {
    return;
  }

  const controller = new DeckRouletteController(screen);

  controller.initialize();
});

class DeckRouletteController {
  constructor(screen) {
    this.screen = screen;

    this.spinUrl = screen.dataset.spinUrl || "/deck-roulette/spin";

    this.openUrl = screen.dataset.openUrl || "/deck-roulette/open";

    this.fallbackImage = screen.dataset.fallbackImage || "";

    this.spinButton = document.getElementById("deckRouletteSpinButton");

    this.spinAgainButton = document.getElementById(
      "deckRouletteSpinAgainButton",
    );

    this.openButton = document.getElementById("deckRouletteOpenButton");

    this.pointer = document.getElementById("deckRoulettePointer");

    this.idleCta = document.getElementById("deckRouletteIdleCta");

    this.spinner = document.getElementById("deckRouletteSpinner");

    this.track = document.getElementById("deckRouletteSpinnerTrack");

    this.message = document.getElementById("deckRouletteMessage");

    this.winnerPanel = document.getElementById("deckRouletteWinnerPanel");

    this.winnerName = document.getElementById("deckRouletteWinnerName");

    this.winnerCommander = document.getElementById(
      "deckRouletteWinnerCommander",
    );

    this.winnerMeta = document.getElementById("deckRouletteWinnerMeta");

    this.moxfieldLink = document.getElementById("deckRouletteMoxfieldLink");

    this.formatInput = document.getElementById("deckRouletteFormat");

    this.titleSearchInput = document.getElementById("deckRouletteTitleSearch");

    this.commanderField = document.getElementById("deckRouletteCommanderField");

    this.commanderLabel = document.getElementById("deckRouletteCommanderLabel");

    this.commanderInput = document.getElementById("deckRouletteCommander");

    this.bracketField = document.getElementById("deckRouletteBracketField");

    this.bracketDropdown = document.getElementById(
      "deckRouletteBracketDropdown",
    );

    this.bracketSummary = document.getElementById("deckRouletteBracketSummary");

    this.bracketInputs = Array.from(
      document.querySelectorAll(".deck-roulette-bracket-input"),
    );

    this.colorInputs = Array.from(
      document.querySelectorAll(".deck-roulette-color-input"),
    );

    this.colorMatchInput = document.getElementById("deckRouletteColorMatch");

    this.sortInput = document.getElementById("deckRouletteSort");

    this.topLimitInput = document.getElementById("deckRouletteTopLimit");

    this.wheelSizeInput = document.getElementById("deckRouletteWheelSize");

    this.busyOverlay = document.getElementById("deckRouletteBusyOverlay");

    this.busyTitle = document.getElementById("deckRouletteBusyTitle");

    this.busyText = document.getElementById("deckRouletteBusyText");

    this.currentWinner = null;
    this.animationInProgress = false;
    this.openInProgress = false;
    this.filterControlsLocked = false;
    this.settingsStorageKey = "deckRouletteRetainedFiltersV1";
  }

  initialize() {
    this.loadRetainedSettings();

    if (this.spinButton) {
      this.spinButton.addEventListener("click", () => this.spin());
    }

    if (this.spinAgainButton) {
      this.spinAgainButton.addEventListener("click", () => this.spin());
    }

    if (this.openButton) {
      this.openButton.addEventListener("click", () => this.openWinner());
    }

    if (this.formatInput) {
      this.formatInput.addEventListener("change", () => {
        this.updateFormatControls();
        this.saveRetainedSettings();
      });
    }

    this.colorInputs.forEach((input) => {
      input.addEventListener("change", () => {
        this.handleColorSelection(input);
      });
    });

    this.bracketInputs.forEach((input) => {
      input.addEventListener("change", () => {
        this.updateBracketSummary();
        this.saveRetainedSettings();
      });
    });

    if (this.wheelSizeInput) {
      this.wheelSizeInput.addEventListener("change", () => {
        this.saveRetainedSettings();
      });
    }

    if (this.sortInput) {
      this.sortInput.addEventListener("change", () => {
        this.saveRetainedSettings();
      });
    }

    if (this.topLimitInput) {
      this.topLimitInput.addEventListener("change", () => {
        this.saveRetainedSettings();
      });
    }

    this.updateBracketSummary();
    this.updateFormatControls();
  }

  isCommanderFormat() {
    return ["commander", "commanderPrecons", "pauperEdh"].includes(
      this.formatInput?.value || "commander",
    );
  }

  loadRetainedSettings() {
    let savedSettings = null;

    try {
      const rawSettings = window.localStorage.getItem(this.settingsStorageKey);

      if (!rawSettings) {
        return;
      }

      savedSettings = JSON.parse(rawSettings);
    } catch (error) {
      return;
    }

    if (!savedSettings || typeof savedSettings !== "object") {
      return;
    }

    this.setSelectValueIfAvailable(this.formatInput, savedSettings.format);

    this.setSelectValueIfAvailable(
      this.wheelSizeInput,
      savedSettings.wheel_size,
    );

    this.setSelectValueIfAvailable(this.sortInput, savedSettings.sort);

    this.setSelectValueIfAvailable(this.topLimitInput, savedSettings.top_limit);

    let savedBrackets = [];

    if (Array.isArray(savedSettings.brackets)) {
      savedBrackets = savedSettings.brackets.map((value) => String(value));
    }

    for (const input of this.bracketInputs) {
      input.checked = savedBrackets.includes(input.value);
    }
  }

  saveRetainedSettings() {
    const settings = {
      format: this.formatInput ? this.formatInput.value : "commander",
      brackets: this.getSelectedBrackets(),
      wheel_size: this.wheelSizeInput ? this.wheelSizeInput.value : "12",
      sort: this.sortInput ? this.sortInput.value : "updated",
      top_limit: this.topLimitInput ? this.topLimitInput.value : "100",
    };

    try {
      window.localStorage.setItem(
        this.settingsStorageKey,
        JSON.stringify(settings),
      );
    } catch (error) {
      return;
    }
  }

  setSelectValueIfAvailable(selectElement, value) {
    if (!selectElement) {
      return;
    }

    if (value === undefined || value === null) {
      return;
    }

    const requestedValue = String(value);

    for (const option of selectElement.options) {
      if (option.value === requestedValue) {
        selectElement.value = requestedValue;
        return;
      }
    }
  }

  handleColorSelection(changedInput) {
    if (!changedInput?.checked) {
      return;
    }

    if (changedInput.value === "C") {
      this.colorInputs.forEach((input) => {
        if (input !== changedInput) {
          input.checked = false;
        }
      });

      return;
    }

    const colorlessInput = this.colorInputs.find(
      (input) => input.value === "C",
    );

    if (colorlessInput) {
      colorlessInput.checked = false;
    }
  }

  getSelectedColors() {
    return this.colorInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  getSelectedBrackets() {
    return this.bracketInputs
      .filter((input) => input.checked)
      .map((input) => Number(input.value))
      .filter((value) => Number.isInteger(value));
  }

  updateBracketSummary() {
    if (!this.bracketSummary) {
      return;
    }

    const selectedBrackets = this.getSelectedBrackets();

    if (!selectedBrackets.length) {
      this.bracketSummary.textContent = "Any";

      return;
    }

    this.bracketSummary.textContent = selectedBrackets
      .map((value) => `Bracket ${value}`)
      .join(", ");
  }

  updateFormatControls() {
    const leaderFiltersEnabled = this.isCommanderFormat();
    const disableBracketFilters =
      this.filterControlsLocked || !leaderFiltersEnabled;

    if (this.commanderLabel) {
      if (leaderFiltersEnabled) {
        this.commanderLabel.textContent = "Commander";
      } else {
        this.commanderLabel.textContent = "Card Name";
      }
    }

    if (this.commanderInput) {
      this.commanderInput.disabled = this.filterControlsLocked;

      if (leaderFiltersEnabled) {
        this.commanderInput.placeholder = "Any Commander";
      } else {
        this.commanderInput.placeholder = "Any Card";
      }
    }

    for (const input of this.bracketInputs) {
      input.disabled = disableBracketFilters;
    }

    if (this.bracketField) {
      if (leaderFiltersEnabled) {
        this.bracketField.classList.remove("deck-roulette-field-disabled");
      } else {
        this.bracketField.classList.add("deck-roulette-field-disabled");
      }
    }

    if (this.bracketDropdown) {
      if (disableBracketFilters) {
        this.bracketDropdown.classList.add(
          "deck-roulette-multiselect-disabled",
        );
        this.bracketDropdown.removeAttribute("open");
      } else {
        this.bracketDropdown.classList.remove(
          "deck-roulette-multiselect-disabled",
        );
      }
    }
  }

  getFilters() {
    const leaderFiltersEnabled = this.isCommanderFormat();
    const cardSearchValue = this.commanderInput
      ? this.commanderInput.value.trim()
      : "";

    return {
      format: this.formatInput ? this.formatInput.value : "commander",
      title_search: this.titleSearchInput
        ? this.titleSearchInput.value.trim()
        : "",
      commander_name: leaderFiltersEnabled ? cardSearchValue : "",
      card_name: leaderFiltersEnabled ? "" : cardSearchValue,
      brackets: leaderFiltersEnabled ? this.getSelectedBrackets() : [],
      colors: this.getSelectedColors(),
      color_match: this.colorMatchInput ? this.colorMatchInput.value : "exact",
      sort: this.sortInput ? this.sortInput.value : "updated",
      top_limit: Number(this.topLimitInput ? this.topLimitInput.value : 100),
      wheel_size: Number(this.wheelSizeInput ? this.wheelSizeInput.value : 12),
    };
  }

  setFilterControlsDisabled(disabled) {
    this.filterControlsLocked = Boolean(disabled);

    if (this.formatInput) {
      this.formatInput.disabled = this.filterControlsLocked;
    }

    if (this.titleSearchInput) {
      this.titleSearchInput.disabled = this.filterControlsLocked;
    }

    if (this.colorMatchInput) {
      this.colorMatchInput.disabled = this.filterControlsLocked;
    }

    if (this.sortInput) {
      this.sortInput.disabled = this.filterControlsLocked;
    }

    if (this.topLimitInput) {
      this.topLimitInput.disabled = this.filterControlsLocked;
    }

    if (this.wheelSizeInput) {
      this.wheelSizeInput.disabled = this.filterControlsLocked;
    }

    for (const input of this.colorInputs) {
      input.disabled = this.filterControlsLocked;
    }

    this.updateFormatControls();
  }

  setBusy(isBusy, title, text) {
    if (!this.busyOverlay) {
      return;
    }

    if (title && this.busyTitle) {
      this.busyTitle.textContent = title;
    }

    if (text && this.busyText) {
      this.busyText.textContent = text;
    }

    this.busyOverlay.classList.toggle("hidden", !isBusy);

    this.busyOverlay.setAttribute("aria-hidden", isBusy ? "false" : "true");
  }

  showError(message) {
    if (this.message) {
      this.message.textContent = message || "Deck Roulette failed.";

      this.message.classList.remove("hidden");
    }
  }

  resetWinner() {
    this.currentWinner = null;

    this.winnerPanel?.classList.add("hidden");

    if (this.openButton) {
      this.openButton.disabled = true;
    }
  }

  async spin() {
    if (this.animationInProgress || this.openInProgress) {
      return;
    }

    this.resetWinner();

    this.message?.classList.add("hidden");

    this.setFilterControlsDisabled(true);

    if (this.spinButton) {
      this.spinButton.disabled = true;
    }

    if (this.spinAgainButton) {
      this.spinAgainButton.disabled = true;
    }

    this.setBusy(true, "Finding Decks", "Rummaging through decks...");

    try {
      const response = await fetch(this.spinUrl, {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body: JSON.stringify(this.getFilters()),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Deck Roulette search failed.");
      }

      const spinResult = payload.spin_result;

      if (
        !spinResult ||
        !Array.isArray(spinResult.display_decks) ||
        !spinResult.display_decks.length ||
        !spinResult.winning_deck
      ) {
        throw new Error("Deck Roulette returned an incomplete spin result.");
      }

      this.setBusy(
        true,
        "Building Deck Art",
        "Preparing the decks for the wheel...",
      );

      await this.preloadDeckArt(spinResult.display_decks);

      this.setBusy(false);

      this.runSpinAnimation(spinResult);
    } catch (error) {
      this.setBusy(false);

      this.animationInProgress = false;

      this.showError(error.message || "Deck Roulette failed.");

      this.setFilterControlsDisabled(false);

      if (this.spinButton) {
        this.spinButton.disabled = false;
      }

      if (this.spinAgainButton) {
        this.spinAgainButton.disabled = false;
      }
    }
  }

  buildRepeatedSequence(displayDecks, repeatCount) {
    const sequence = [];

    for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
      displayDecks.forEach(function (deck, deckIndex) {
        sequence.push({
          ...deck,
          base_index: deckIndex,
          repeat_index: repeatIndex,
        });
      });
    }

    return sequence;
  }

  async preloadDeckArt(displayDecks) {
    const imageUrls = Array.from(
      new Set(
        (displayDecks || [])
          .map((deck) => String(deck.image_src || "").trim())
          .filter(Boolean),
      ),
    );

    await Promise.allSettled(
      imageUrls.map(
        (imageUrl) =>
          new Promise((resolve) => {
            const image = new Image();

            let completed = false;

            const finish = () => {
              if (completed) {
                return;
              }

              completed = true;
              resolve();
            };

            image.onload = finish;

            image.onerror = finish;

            image.src = imageUrl;

            window.setTimeout(finish, 15000);
          }),
      ),
    );
  }

  renderSpinnerCards(displayDecks, repeatCount) {
    this.track.innerHTML = "";

    const sequence = this.buildRepeatedSequence(displayDecks, repeatCount);

    sequence.forEach((deck, absoluteIndex) => {
      const card = document.createElement("div");

      card.className = "chaos-pack-card " + "deck-roulette-card";

      card.dataset.rouletteIndex = String(absoluteIndex);

      const imageWrap = document.createElement("div");

      imageWrap.className = "chaos-pack-card-image-wrap";

      const image = document.createElement("img");

      image.className = "chaos-pack-card-image";

      image.src = deck.image_src || this.fallbackImage;

      image.alt =
        deck.display_card_name ||
        deck.commander_name ||
        deck.deck_name ||
        "Deck";

      image.addEventListener("error", () => {
        if (this.fallbackImage && image.src !== this.fallbackImage) {
          image.src = this.fallbackImage;
        }
      });

      imageWrap.appendChild(image);

      card.title = deck.deck_name || "Untitled Deck";

      card.appendChild(imageWrap);

      this.track.appendChild(card);
    });

    return sequence;
  }

  getCenteredTranslate(cardElement) {
    const spinnerWindow = this.spinner.querySelector(
      ".chaos-draft-spinner-window",
    );

    if (!spinnerWindow || !cardElement) {
      return 0;
    }

    const cardCenter = cardElement.offsetLeft + cardElement.offsetWidth / 2;

    const windowCenter = spinnerWindow.clientWidth / 2;

    return -(cardCenter - windowCenter);
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  animateToWinner(finalAbsoluteIndex, visibleDeckCount) {
    const finalCard = this.track.querySelector(
      `[data-roulette-index="${finalAbsoluteIndex}"]`,
    );

    if (!finalCard) {
      this.animationInProgress = false;

      this.showError("Deck Roulette could not resolve the winning deck.");

      return;
    }

    const finalTranslate = this.getCenteredTranslate(finalCard);

    const cards = this.track.querySelectorAll(".deck-roulette-card");

    const firstCard = cards[0];
    const secondCard = cards[1];

    const oneCardTravel = secondCard
      ? secondCard.offsetLeft - firstCard.offsetLeft
      : finalCard.offsetWidth + 14;

    const jostle = -0.18 + Math.random() * 0.36;

    const approachTranslate = finalTranslate + jostle * oneCardTravel;

    let durationMs = 5200;

    if (visibleDeckCount <= 6) {
      durationMs = 3200;
    } else if (visibleDeckCount <= 10) {
      durationMs = 4300;
    }

    durationMs += Math.round(Math.random() * 550);

    const startTranslate = 0;

    let animationStart = null;

    const snapToCenter = () => {
      this.track.style.transition = "transform 180ms ease-out";

      this.track.style.transform = `translateX(${finalTranslate}px)`;

      window.setTimeout(() => {
        finalCard.classList.add(
          "chaos-pack-card-winning",
          "chaos-pack-card-winning-normal",
        );

        this.animationInProgress = false;

        this.setFilterControlsDisabled(false);

        if (this.spinButton) {
          this.spinButton.disabled = false;
        }

        if (this.spinAgainButton) {
          this.spinAgainButton.disabled = false;
        }

        this.showWinner();
      }, 190);
    };

    const step = (timestamp) => {
      if (animationStart === null) {
        animationStart = timestamp;
      }

      const elapsed = timestamp - animationStart;

      const progress = Math.min(elapsed / durationMs, 1);

      const eased = this.easeOutCubic(progress);

      const currentTranslate =
        startTranslate + (approachTranslate - startTranslate) * eased;

      this.track.style.transform = `translateX(${currentTranslate}px)`;

      if (progress < 1) {
        window.requestAnimationFrame(step);

        return;
      }

      this.track.style.transform = `translateX(${approachTranslate}px)`;

      snapToCenter();
    };

    window.requestAnimationFrame(step);
  }

  runSpinAnimation(spinResult) {
    const displayDecks = spinResult.display_decks || [];

    const winningStopIndex = Number(spinResult.winning_stop_index || 0);

    this.currentWinner = spinResult.winning_deck;

    this.animationInProgress = true;

    this.message?.classList.add("hidden");

    this.winnerPanel?.classList.add("hidden");

    this.idleCta?.classList.add("hidden");

    this.pointer?.classList.remove("hidden");

    this.track.classList.remove("hidden");

    this.track.style.transition = "none";

    this.track.style.transform = "translateX(0px)";

    const repeatCount = 7;

    const sequence = this.renderSpinnerCards(displayDecks, repeatCount);

    const winningRepeatIndex = Math.floor(repeatCount / 2);

    const finalAbsoluteIndex =
      winningRepeatIndex * displayDecks.length + winningStopIndex;

    if (
      !sequence.length ||
      finalAbsoluteIndex < 0 ||
      finalAbsoluteIndex >= sequence.length
    ) {
      this.animationInProgress = false;

      this.showError("Deck Roulette produced an invalid stopping position.");

      return;
    }

    window.requestAnimationFrame(() => {
      this.animateToWinner(finalAbsoluteIndex, displayDecks.length);
    });
  }

  showWinner() {
    if (!this.currentWinner) {
      return;
    }

    const winner = this.currentWinner;

    this.winnerName.textContent = winner.deck_name || "Untitled Deck";

    if (winner.commander_name) {
      this.winnerCommander.textContent = `Commander: ${winner.commander_name}`;
    } else if (winner.display_card_name) {
      this.winnerCommander.textContent = `Featured card: ${winner.display_card_name}`;
    } else {
      this.winnerCommander.textContent = "";
    }

    const meta = [];

    if (winner.format_label) {
      meta.push(winner.format_label);
    }

    if (winner.author) {
      meta.push(`by ${winner.author}`);
    }

    if (winner.bracket && winner.commander_name) {
      meta.push(`Bracket ${winner.bracket}`);
    }

    meta.push(`${winner.playable_card_count} playable cards`);

    this.winnerMeta.textContent = meta.join(" • ");

    this.moxfieldLink.href = winner.external_url || "#";

    this.winnerPanel.classList.remove("hidden");

    this.openButton.disabled = false;
  }

  async openWinner() {
    if (
      !this.currentWinner ||
      this.openInProgress ||
      this.animationInProgress
    ) {
      return;
    }

    this.openInProgress = true;

    this.openButton.disabled = true;

    this.setBusy(
      true,
      "Opening Deck",
      "Importing the selected Moxfield deck into Deckadence...",
    );

    try {
      const response = await fetch(this.openUrl, {
        method: "POST",

        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          external_id: this.currentWinner.external_id,
          format: this.currentWinner.format_key || "commander",
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.message || "Could not import the selected deck.",
        );
      }

      if (!payload.open_url) {
        throw new Error(
          "Deck import completed but no Deck Builder URL was returned.",
        );
      }

      window.location.assign(payload.open_url);
    } catch (error) {
      this.openInProgress = false;

      this.openButton.disabled = false;

      this.setBusy(false);

      this.showError(error.message || "Could not open the selected deck.");
    }
  }
}
