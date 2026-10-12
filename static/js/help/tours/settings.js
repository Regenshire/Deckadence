(function () {
  if (!window.DeckadenceTours) {
    return;
  }

  window.DeckadenceTours.register({
    id: "settings_and_tribulations",

    version: 2,

    title: "Settings and Tribulations",

    steps: [
      {
        id: "welcome",

        route: "/",

        target: '[data-help-tour-start="settings_and_tribulations"]',

        title: "Settings and Tribulations",

        body: "Take a quick look at the main Deckadence settings and what they control.",

        nextLabel: "Open Settings",
      },

      {
        id: "system_settings",

        route: "/config",

        target: "#section_reminders",

        title: "Reminders",

        body: "Deckadence will display reminders in System Settings, most importantly it will periodically remind you to update the Card Database files.\n\nWhile there is nothing wrong with using the files you downloaded during the setup phase for the rest of time, if you want newly released cards to appear in Deckadence you need to periodically update the Card Database.\n\nYou can configure the reminder interval by clicking on the Reminder Settings icon in the upper right.",
      },

      {
        id: "system_settings",

        route: "/config",

        target: "#section_reminders",

        title: "Deckadence Release Status",

        body: "Deckadence checks the git repository to see if there is a new version of the software available.  If you see a new version, feel free to update to it.\n\nBut only if you want. Its your choice!",
      },

      {
        id: "print_settings",

        route: "/config",

        target: ".settings-category-print",

        title: "Print Settings",

        body: "Choose how you want to print or export cards throughout Deckadence. These shared settings allow you to choose your print template, card backs, labels, cutting guides, and other print options used throughout the application outside of Momir.\n\nPlease expand Print Defaults so you can see more helpful instructions.",
      },

      {
        id: "print_settings_1",

        route: "/config",

        target: "#chaos_print_template",

        title: "Default Print Template",

        body: "Choose the type of print template you want to print to.  A print template are the settings for generating PDF files for your print jobs.  A template includes things like the size of paper you are using and the layout of cards.  Click on Browse Print Templates to select from available templates.",
      },

      {
        id: "print_settings_2",

        route: "/config",

        target: '[name="chaos_silhouette_registration_marks"]',

        title: "Silhouette Registration Marks",

        body: "This option enables or disables Silhouette Registration Marks when printing to PDF for the selected Print Template.  When enabled, this adds Silhouette Cameo compatible registration marks to the PDF image. A Silhouette Cameo is a type of cutting machine commonly used by the proxy community to cut out cards using templates.",
      },

      {
        id: "print_settings_4",

        route: "/config",

        target: '[name="chaos_pdf_cutting_guides"]',

        title: "PDF Cutting  Guides",

        body: "This option enables or disables Cutting Guides on the PDF.  If you manually cut your cards, guides are pretty essential.  This turns cutting guides on.",
      },

      {
        id: "print_settings_5",

        route: "/config",

        target: '[name="chaos_print_card_backs"]',

        title: "Print Card Backs",

        body: "This option enables or disables card backs for the PDFs you generate.  If this is turned off, then no default card back will be added to the PDF files.",
      },

      {
        id: "print_settings_6",

        route: "/config",

        target: '[name="chaos_default_card_back_button"]',

        title: "Choose Card Backs",

        body: "I bet you want to be able to set what your card back looks like, right?\n\nWell, your in luck, you can set it right here.  Select from the included card backs or upload your own.",
      },

      {
        id: "print_settings_3",

        route: "/config",

        target: '[name="chaos_no_wasted_space_enabled"]',

        title: "No Wasted Space!",

        body: "What exactly is this?  Glad you asked! This is a fun one!\n\nDon't you hate it when you generate a sheet of proxy cards but you have a couple extra blank spaces at the end of the PDF?  Its annoying right?  Vexing?  Wastefull?  Yes to all of that.\n\nYou don't want to waste your precious printer paper sourced from a specialty supplier, now do you?  Of course not!\n\nAnd that is why this setting exists. To save you from wasting printer paper.  With this option enabled, Deckadence will automatically add random cards to the end of your PDF so that you are using every precious card slot on that paper.\n\nNo more wasted space!",
      },

      {
        id: "print_settings_7",

        route: "/config",

        target: '[name="chaos_print_labels_enabled"]',

        title: "Pack Labels",

        body: "This option enables or disables card labels when printing or exporting cards.  A Card label replaces the text in the lower left with a label, such as a Pack Tracking Code. Turn this off if you do not want custom labels generated for each card.\n\nCustom Labels are a great feature for Chaos Draft, but they can occasionally result in visual odities at the bottom of the card.",
      },

      {
        id: "print_settings_8",

        route: "/config",

        target: '[name="chaos_print_label_tracking_code"]',

        title: "Tracking Code on Labels",

        body: "This option controls whether the pack tracking code is included on printed card labels. Tracking codes make it easier to identify and match printed cards with the rest of the cards in their pack.\n\nThis feature is great if you want to be able reseal a pack of cards for use in multiple drafts.",
      },

      {
        id: "chaos_settings",

        route: "/config",

        target: ".settings-category-chaos",

        title: "Chaos Draft Settings",

        body: "These settings control the Chaos Draft experience, including the active Draft mode and Chaos Draft-specific pack, export, tracking, pricing, and image options.",
      },

      {
        id: "draft_modes",

        route: "/config",

        target: "#section_draft_modes",

        title: "Draft Modes",

        body: "Choose how you want to play Chaos Draft.  You can choose between a curated Campaign mode, or a more classic and simple Basic Chaos Draft mode.\n\nThe Campaign Mode allows you to create a curated experience.  In this mode you configure and setup Campaigns where selecting the type of packs to add.  You can add packs from any that exist in the history of magic the gathering, or if you want, you can create custom packs, or use packs from custom sets you have created.\n\nBasic Chaos Draft mode on the other hand is simple and doesn't require any configuration or setup. It just randomly opens packs.  You can control what sets and pack types are available via the Sets page and the Chaos Draft Settings you can find here on the Settings page.",
      },

      {
        id: "chaos_settings_replace_basic_lands",

        route: "/config",

        target: '[name="chaos_replace_basic_lands"]',

        title: "Replace Basic Lands",

        body: "When enabled, Basic Lands in normal Chaos Draft packs are replaced with a random Common card from the same set. This gives the pack another draftable card instead of a Basic Land.\n\nThe basic land replacement occurs when the pack is generated, not when it is opened.",
      },

      {
        id: "momir_modes",

        route: "/config",

        target: "#section_momir_modes",

        title: "Momir Modes",

        body: "Choose the Momir-style game mode you want to play for many exciting options!  Each mode has a different rule set in regards to which cards can be randomly drawn.",
      },

      {
        id: "card_rules",

        route: "/config",

        target: "#section_card_repeats",

        title: "Momir Card Rules and Filters",

        body: "Control how the Momir play mode handles card repeats and which types of cards can be drawn.",
      },

      {
        id: "card_database",

        route: "/config",

        target: "#section_card_database",

        title: "Card Database",

        body: "Download or refresh the card, set, and pack data used by Deckadence.",
      },

      {
        id: "advanced",

        route: "/config",

        target: "#section_plugins",

        title: "Plugin Manager",

        body: "This is where you manage and install plugins.   We have plugins that let you Upscale images. This is where you download and install them!",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
