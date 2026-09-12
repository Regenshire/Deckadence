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
        id: "draft_modes",

        route: "/config",

        target: "#section_draft_modes",

        title: "Draft Modes",

        body: "Choose how you want to play Chaos Draft.",
      },

      {
        id: "momir_modes",

        route: "/config",

        target: "#section_momir_modes",

        title: "Momir Modes",

        body: "Choose the Momir-style game mode you want to play.",
      },

      {
        id: "card_rules",

        route: "/config",

        target: "#section_card_repeats",

        title: "Card Rules and Filters",

        body: "Control card repeats and which types of cards can be drawn.",
      },

      {
        id: "print_settings",

        route: "/config",

        target: "#section_chaos_print_settings",

        title: "Print Settings",

        body: "Choose your print template, card backs, labels, cutting guides, and other print options.",
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
