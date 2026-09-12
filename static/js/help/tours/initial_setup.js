(function () {
  if (!window.DeckadenceTours) {
    return;
  }

  const cardDatabaseSection = document.getElementById("section_card_database");

  if (cardDatabaseSection) {
    cardDatabaseSection.classList.add("is-open");
  }

  window.DeckadenceTours.register({
    id: "initial_setup",

    version: 1,

    title: "Initial Setup",

    steps: [
      {
        id: "welcome",

        route: "/",

        target: '[data-help-tour-start="initial_setup"]',

        title: "Initial Setup",

        body: "Deckadence needs a local card database before its main play and card tools can be used. This guide walks you through the process of having Deckadence download and install the required data files.  You must complete these steps before using Deckadence.",

        nextLabel: "Install Card Database",
      },

      {
        id: "card_database",

        route: "/config",

        target: "#section_card_database",

        title: "Card Database",

        body: "This section is used to manage the Card Database. It shows what card data is already installed and it contains the controls to download and install all needed data files.",
      },

      {
        id: "download_database",

        route: "/config",

        target: "#refreshCardsButton",

        title: "Download Card Database",

        body: "Use Download Card Database to download the current card database files. This button downloads data files from sources such as MTGJSON and Scryfall to create the local card database.  It installs the card, set, token, Chaos Draft pack, and price data Deckadence requires to function. You can run it now or continue the guide without starting it.  To use Deckadence you must complete this step.",
      },

      {
        id: "download_progress",

        route: "/config",

        target: "#section_card_database .refresh-status-row",

        title: "Download Progress",

        body: "The current stage, progress, and any errors appear here. Keep Deckadence running until the stage says Complete.",
      },

      {
        id: "forced_refresh",

        route: "/config",

        target: "#forcedRefreshCardsButton",

        title: "Forced Refresh",

        body: "Forced Refresh is mainly for troubleshooting. It re-downloads the main card source even when Deckadence thinks the local copy is current.",

        nextLabel: "Finish Setup Guide",
      },

      {
        id: "setup_complete",

        route: "/",

        target: '[data-help-tour-start="initial_setup"]',

        title: "Setup Guide Finished",

        body: "Initial setup is complete after the Card Database finishes downloading successfully. Once this id completed, the main play and card tools will unlock, and you can refresh the database later whenever you want newer cards and sets to be available in Deckadence.",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
