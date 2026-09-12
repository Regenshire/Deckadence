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

        title: "System Settings - Reminders",

        body: "Deckadence will periodically remind you to update the Card Database files. While there is nothing wrong with using the files you downloaded during the setup phase for the rest of time, if you want newly released cards to appear in Deckadence you need to periodically update the Card Database.  We put a friendly reminder to do so in the Reminders section. You can configure the reminder interval by clicking on the Reminder Settings icon in the upper right.",
      },

      {
        id: "system_settings",

        route: "/config",

        target: "#section_reminders",

        title: "System Settings - Deckadence Release Status",

        body: "Deckadence check the git repository to see if there is a new version of the software available.  If you see a new version, feel free to update to it. But only if you want. Its your choice!",
      },

      {
        id: "draft_modes",

        route: "/config",

        target: "#section_draft_modes",

        title: "Draft Modes",

        body: "Choose how you want to play Chaos Draft.  You can choose between a courated Campaign mode, or a more classic and simple Basic Chaos Draft mode.  The Campaign Mode allows you to create a curated experience with you selecting the type of packs from any that exist in the history of magic the gathering, or if you want, you can create custom packs, or use packs from custom sets you have created.",
      },

      {
        id: "print_settings",

        route: "/config",

        target: "#section_chaos_print_settings",

        title: "Chaos Draft Print Settings",

        body: "Chose how you want to print or export proxies of the chaos packs you generate. These settings allow you to choose your print template, card backs, labels, cutting guides, and other print options.",
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

        title: "Advanced Tools",

        body: "Manage plugins, backups, exports, image tools, and other advanced options.",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
