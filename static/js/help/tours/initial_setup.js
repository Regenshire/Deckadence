// *** SETUP TOUR - Define the First-Time Setup Steps ***
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

    version: 2,

    title: "Initial Setup",

    steps: [
      {
        id: "welcome",

        route: "/",

        target: '[data-help-tour-start="initial_setup"]',

        title: "Initial Setup",

        body: "Deckadence needs to downoad a local card database before it can be used. This guide walks you through the process of having Deckadence download and install the required data files.  You must complete these steps before using Deckadence.",

        nextLabel: "Install Card Database",
      },

      {
        id: "card_database",

        route: "/config",

        target: "#section_card_database",

        title: "Card Database",

        body: "Use this section to manage the Card Database, view installed card data, and download and install any required data files.",
      },

      {
        id: "download_database",

        route: "/config",

        target: "#refreshCardsButton",

        title: "Download Card Database",

        body: "Use Download Card Database to download the current card database files. This button downloads data files from sources such as MTGJSON and Scryfall to create the local card database.  It installs the data Deckadence requires to function. To use Deckadence you must complete this step.",
      },

      {
        id: "download_progress",

        route: "/config",

        target: "#section_card_database .refresh-status-row",

        title: "Download Progress",

        body: "The current stage, progress, and any errors appear here. Keep Deckadence running until the stage says Complete.",
      },

      {
        id: "pack_images",

        route: "/config",

        target: "#openPackDownloader",

        title: "Pack Images (Optional)",

        body: "The Pack Image Downloader adds pack, box, and bundle artwork for opening packs in Deckadence. It downloads missing images and upgrades generated artwork while keeping images you added. Wait for the Card Database download to finish before downloading pack images. These images are optional: follow the walkthrough now, or select Skip to finish the setup guide.",

        nextLabel: "Open Pack Downloader",
        advanceOnEvent: "pack_downloader_opened",
        skipTo: "setup_complete",
      },

      {
        id: "pack_image_sets",
        route: "/config",
        dialog: "#packDownloaderModal",
        dialogOpener: "#openPackDownloader",
        target: "#packDownloaderSets",
        title: "Choose Sets",
        body: "Leave the 'Set codes' blank to download and create art for all booster packs. Choosing a few sets lets you download artwork just for the sets you want to open.",
        skipTo: "setup_complete",
      },

      {
        id: "pack_image_options",
        route: "/config",
        dialog: "#packDownloaderModal",
        dialogOpener: "#openPackDownloader",
        target: "#packDownloaderOptions",
        title: "Choose Pack Images",
        body: "Choose the booster pack, booster box, and bundle types you want. Booster pack types are selected by default.",
        skipTo: "setup_complete",
      },

      {
        id: "pack_image_download",
        route: "/config",
        dialog: "#packDownloaderModal",
        dialogOpener: "#openPackDownloader",
        target: "#startPackDownload",
        title: "Download Pack Images",
        body: "Select Download / upgrade images to start downloading artwork for your chosen sets.",
        skipTo: "setup_complete",
      },

      {
        id: "pack_image_progress",
        route: "/config",
        dialog: "#packDownloaderModal",
        dialogOpener: "#openPackDownloader",
        target: "#packDownloaderStatus",
        title: "Pack Image Progress",
        body: "Follow the progress in the Pack Image window.  It can take some time to download and build all pack image files.",
        skipTo: "setup_complete",

        nextLabel: "Finish Setup Guide",
      },

      {
        id: "setup_complete",

        route: "/",

        target: '[data-help-tour-start="initial_setup"]',

        title: "Setup Guide Finished",

        body: "Initial setup is complete after the Card Database finishes downloading successfully. Once this is completed, the main play and card tools will unlock, and you can refresh the database later whenever you want newer cards and sets to be available in Deckadence.",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
