(function () {
  if (!window.DeckadenceTours) {
    return;
  }

  window.DeckadenceTours.register({
    id: "settings_and_tribulations",

    version: 1,

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

        body: "Deckadence check the git repository to see if there is a new version of the software available.  If you see a new version, feel free to update to it. But only if you want. Its your choice!",
      },

      {
        id: "draft_modes",

        route: "/config",

        target: "#section_draft_modes",

        title: "Draft Modes",

        body: "Choose how you want to play Chaos Draft.  You can choose between a curated Campaign mode, or a more classic and simple Basic Chaos Draft mode.\n\nThe Campaign Mode allows you to create a curated experience.  In this mode you configure and setup Campaigns where selecting the type of packs to add.  You can add packs from any that exist in the history of magic the gathering, or if you want, you can create custom packs, or use packs from custom sets you have created.\n\nBasic Chaos Draft mode on the other hand is simple and doesn't require any configuration or setup. It just randomly opens packs.  You can control what sets and pack types are available via the Sets page and the Momir Settings you can find here on the Settings page.",
      },

      {
        id: "print_settings",

        route: "/config",

        target: "#section_chaos_print_settings",

        title: "Chaos Draft Print Settings",

        body: "Chose how you want to print or export proxies of the chaos packs you generate. These settings allow you to choose your print template, card backs, labels, cutting guides, and other print options.\n\nPlease expand this section so you can see more helpful instructions.",
      },

      {
        id: "print_settings_1",

        route: "/config",

        target: "#chaos_print_template",

        title: "Chaos Draft - Default Print Template",

        body: "Choose the type of print template you want to print to.  A print template are the settings for generating PDF files for your proxy print jobs.  A template includes things like the size of paper you are using and the layout of cards.  Click on Browse Print Templates to select from available templates.",
      },

      {
        id: "print_settings_2",

        route: "/config",

        target: '[name="chaos_silhouette_registration_marks"]',

        title: "Chaos Draft - Silhouette Registration Marks",

        body: "This option enables or disables Silhouette Registration Marks when printing to PDF for the selected Print Template.  When enabled, this adds Silhouette Cameo compatible registration marks to the PDF image. A Silhouette Cameo is a type of cutting machine commonly used by the proxy community to cut out cards using templates.",
      },

      {
        id: "print_settings_3",

        route: "/config",

        target: '[name="chaos_no_wasted_space_enabled"]',

        title: "No Wasted Space!",

        body: "What exactly is this?  Glad you asked! This is a fun one!\n\nDon't you hate it when you generate a sheet of proxy cards but you have a couple extra blank spaces at the end of the PDF?  Its annoying right?  Vexing?  Wastefull?  Yes to all of that.\n\nYou don't want to waste your precious printer paper sourced from a specialty supplier, now do you?  Of course not!\n\nAnd that is why this setting exists. To save you from waisting printer paper.  With this option enabled, Deckadence will automatically add random cards to the end of your PDF so that you are using every precious card slot on that paper.\n\nNo more wasted space!",
      },

      {
        id: "print_settings_4",

        route: "/config",

        target: '[name="chaos_silhouette_registration_marks"]',

        title: "Chaos Draft - Silhouette Registration Marks",

        body: "This option enables or disables Silhouette Registration Marks when printing to PDF for the selected Print Template.  When enabled, this adds Silhouette Cameo compatible registration marks to the PDF image. A Silhouette Cameo is a type of cutting machine commonly used by the proxy community to cut out cards using templates.",
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
