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

    this.commanderInput = document.getElementById("deckRouletteCommander");

    this.minBracketInput = document.getElementById("deckRouletteMinBracket");

    this.maxBracketInput = document.getElementById("deckRouletteMaxBracket");

    this.wheelSizeInput = document.getElementById("deckRouletteWheelSize");

    this.busyOverlay = document.getElementById("deckRouletteBusyOverlay");

    this.busyTitle = document.getElementById("deckRouletteBusyTitle");

    this.busyText = document.getElementById("deckRouletteBusyText");

    this.currentWinner = null;
    this.animationInProgress = false;
    this.openInProgress = false;
  }

  initialize() {
    if (this.spinButton) {
      this.spinButton.addEventListener("click", () => this.spin());
    }

    if (this.spinAgainButton) {
      this.spinAgainButton.addEventListener("click", () => this.spin());
    }

    if (this.openButton) {
      this.openButton.addEventListener("click", () => this.openWinner());
    }
  }

  getFilters() {
    return {
      commander_name: (this.commanderInput?.value || "").trim(),

      min_bracket: this.minBracketInput?.value || "",

      max_bracket: this.maxBracketInput?.value || "",

      wheel_size: Number(this.wheelSizeInput?.value || 8),
    };
  }

  setFilterControlsDisabled(disabled) {
    [
      this.commanderInput,
      this.minBracketInput,
      this.maxBracketInput,
      this.wheelSizeInput,
    ].forEach(function (control) {
      if (control) {
        control.disabled = Boolean(disabled);
      }
    });
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

    this.setFilterControlsDisabled(true);

    if (this.spinButton) {
      this.spinButton.disabled = true;
    }

    if (this.spinAgainButton) {
      this.spinAgainButton.disabled = true;
    }

    this.setBusy(
      true,
      "Finding Decks",
      "Searching Moxfield for complete Commander decks...",
    );

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

      image.alt = deck.commander_name || deck.deck_name || "Commander";

      image.addEventListener("error", () => {
        if (this.fallbackImage && image.src !== this.fallbackImage) {
          image.src = this.fallbackImage;
        }
      });

      imageWrap.appendChild(image);

      const title = document.createElement("div");

      title.className = "chaos-pack-card-title";

      title.textContent = deck.deck_name || "Untitled Deck";

      const commander = document.createElement("div");

      commander.className = "deck-roulette-card-commander";

      commander.textContent = deck.commander_name || "";

      card.appendChild(imageWrap);

      card.appendChild(title);

      card.appendChild(commander);

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

    this.winnerCommander.textContent = winner.commander_name || "";

    const meta = [];

    if (winner.author) {
      meta.push(`by ${winner.author}`);
    }

    if (winner.bracket) {
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
