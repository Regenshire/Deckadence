(function () {
  if (!window.DeckadenceTours) {
    return;
  }

  window.DeckadenceTours.register({
    id: "chaos_in_the_making",

    version: 3,

    title: "Chaos in the Making!",

    steps: [
      {
        id: "welcome",

        route: "/",

        target: '[data-help-tour-start="chaos_in_the_making"]',

        title: "Chaos in the Making!",

        body: "This guide will walk you through creating your first Chaos Draft Campaign: creating the campaign, adding players, building its pack pool, and learning how to run the draft.",

        nextLabel: "Create Campaign",
      },

      {
        id: "create_campaign",

        route: "/campaign-chaos/campaigns",

        target: "#campaignAddForm",

        title: "Create Your Campaign",

        body: "Campaigns keep players, saved packs, drafts, and opening history together. Give each campaign a recognizable name so it is easy to find later.",
      },

      {
        id: "campaign_created",

        route: "/campaign-chaos/campaigns",

        target: ".campaign-save-list",

        title: "Campaign Saves",

        body: "Your saved campaigns are managed here. You can rename, enable, disable, back up, or delete them. The shortcut icons open Players, Manage Packs, History, and Campaign Draft for a campaign.",

        nextLabel: "Players",
      },

      {
        id: "add_players",

        route: "/campaign-chaos/players",

        target: ".campaign-player-add-form",

        title: "Add Your Players",

        body: "Add the people who will participate in this campaign. Enter a Screen Name and, optionally, upload a portrait. Players are used to record who receives each pack during Campaign Draft.",

        nextLabel: "Player Options",
      },

      {
        id: "player_options",

        route: "/campaign-chaos/players",

        target: ".campaign-player-list",

        title: "Managing Players",

        body: "Players can be renamed, given a new portrait, made inactive, or deleted. You can also use Import Players above to copy a player roster from another campaign. Add as many players as you need before continuing.",

        nextLabel: "Build the Pack Pool",
      },

      {
        id: "manage_packs",

        route: "/campaign-chaos/packs",

        target: "#campaignAddPackButton",

        title: "Build the Campaign Pack Pool",

        body: "Manage Packs contains the saved boosters available to this campaign. Click Add Pack whenever you want to expand the pool. Packs remain saved until you disable or delete them, so a campaign can be prepared well before draft night.",

        nextLabel: "Pack Options",
      },

      {
        id: "add_pack_options",

        route: "/campaign-chaos/packs",

        target: "#campaignAddPackButton",

        title: "Four Ways to Add Packs",

        body: "Click Add Pack to open the pack builder. You can add a completely random eligible pack, search for a specific set or booster, build a custom pack from a decklist, or import saved packs from another campaign.",

        nextLabel: "Review the Options",
      },

      {
        id: "pack_builder",

        route: "/campaign-chaos/packs",

        target: "#campaignAddPackModal",

        title: "Choose How to Add the Pack",

        body: "Random is the quickest option. Search lets you choose a particular product. Custom Pack accepts a set code, pack name, and decklist. Import Packs from Campaign reuses existing tracked packs and preserves their tracking codes. Try one of these methods now if you want to build your first pool while following the guide.",

        nextLabel: "Saving Packs",
      },

      {
        id: "save_generated_pack",

        route: "/campaign-chaos/packs",

        target: "#campaignAddPackPreviewSaveButton",

        title: "Preview Before Saving",

        body: "Generated packs appear in a preview first. You can inspect the pack or Print / Export it before committing it. Click Save when you want the generated pack added to this campaign. You can then generate additional packs from the same Add Pack window.",

        nextLabel: "Manage Saved Packs",
      },

      {
        id: "saved_pack_management",

        route: "/campaign-chaos/packs",

        target: ".campaign-pack-list-panel",

        title: "Managing the Draft Pool",

        body: "Each saved pack has a tracking code and stays associated with this campaign. Select packs to Print / Export, Backup, Test Draft, enable, disable, or delete them. The Summary button gives you a compact count of the enabled pack pool. Individual rows also provide View, History, and label-setting controls.",

        nextLabel: "Go to Campaign Draft",
      },

      {
        id: "select_player",

        route: "/play/draft",

        target: "#campaignPlayerSelect",

        title: "Choose the Current Player",

        body: "Before spinning, choose the player who is receiving the next pack. Deckadence records the selected campaign, draft, player, and pack together so the opening can be found later in Campaign History.",

        nextLabel: "Campaign Tools",
      },

      {
        id: "campaign_tools",

        route: "/play/draft",

        target: ".campaign-icon-actions",

        title: "Campaign Shortcuts",

        body: "These shortcuts keep the campaign workflow close at hand. From the draft screen you can jump directly to Edit Players, Manage Packs, or History without leaving Campaign Mode permanently.",

        nextLabel: "Spin a Pack",
      },

      {
        id: "spin_pack",

        route: "/play/draft",

        target: "#chaosSpinButton",

        title: "Spin for the Next Pack",

        body: "Press the Deckadence spinner to randomly choose from the eligible packs in this campaign's enabled pool. Campaign Draft tracks packs that have already been used in the current draft so the pool advances as packs are assigned.",

        nextLabel: "After the Spin",
      },

      {
        id: "pack_result_actions",

        route: "/play/draft",

        target: "#chaosDraftOpenRow",

        title: "Review, Print, or Export",

        body: "After a pack is selected, View shows its cards without printing. Print / Export opens the proxy-printing workflow. The Copy dropdown can also copy or save the pack list for another deck-management service such as Archidekt or Moxfield.",

        nextLabel: "Next Pack",
      },

      {
        id: "next_pack",

        route: "/play/draft",

        target: "#chaosNextButton",

        title: "Pass to the Next Pack",

        body: "When the current pack is finished, use Next Pack to continue the draft. Change the Current Player whenever the next pack belongs to someone else, then spin again.",

        nextLabel: "Starting Another Draft",
      },

      {
        id: "new_draft",

        route: "/play/draft",

        target: "#campaignNewDraftButton",

        title: "New Draft",

        body: "New Draft begins another draft inside the same campaign. It resets pack availability for the new draft while preserving the campaign, its player roster, saved pack pool, and historical records.",

        nextLabel: "Campaign History",
      },

      {
        id: "history",

        route: "/play/draft",

        target: 'a[title="History"]',

        title: "Campaign History",

        body: "History records which player selected which tracked pack during each draft. From there you can filter by Campaign, Draft, Player, or Pack, revisit individual pack histories, and print selected historical packs.",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
