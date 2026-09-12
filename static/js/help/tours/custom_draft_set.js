(function () {
  if (!window.DeckadenceTours) {
    return;
  }

  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";

  const addPanel = document.getElementById("customDraftSetAddPanel");

  if (addPanel) {
    addPanel.classList.remove("hidden");
  }

  function pathFromLink(selector) {
    const link = document.querySelector(selector);

    if (!link || !link.href) {
      return "";
    }

    try {
      return new URL(link.href, window.location.origin).pathname;
    } catch (error) {
      return "";
    }
  }

  const isLayoutPage = currentPath.includes("/layouts/");
  const isManagePage =
    currentPath.startsWith("/custom-draft-sets/") && !isLayoutPage;

  const savedSetsRoute = isManagePage ? currentPath : "/sets";

  let manageRoute = "/sets";

  if (isManagePage) {
    manageRoute = currentPath;
  } else if (isLayoutPage) {
    manageRoute = currentPath.split("/layouts/", 1)[0] || "/sets";
  } else {
    manageRoute =
      pathFromLink('.custom-draft-set-list a[href*="/custom-draft-sets/"]') ||
      "/sets";
  }

  let layoutRoute = manageRoute;

  if (isLayoutPage) {
    layoutRoute = currentPath;
  } else if (manageRoute !== "/sets") {
    layoutRoute =
      pathFromLink('.custom-draft-pack-layout-actions a[href*="/layouts/"]') ||
      `${manageRoute}/layouts/mystery`;
  }

  window.DeckadenceTours.register({
    id: "design_custom_draft_set",

    version: 1,

    title: "Design a Custom Draft Set",

    steps: [
      {
        id: "welcome",

        route: "/",

        target: '[data-help-tour-start="design_custom_draft_set"]',

        title: "Design a Custom Draft Set",

        body: "Did you know you can design your own Custom Draft Sets in Deckadence? We let you build your own Sets made up of the cards and design that you want.  You can create new sets to be used as Cubes, for Chaos Drafting, or just for a fun way of managing themed proxies. Lets review how you can build your own custom sets in Deckadence!",

        nextLabel: "Open Sets",
      },

      {
        id: "custom_sets",

        route: "/sets",

        target: ".sets-panel-header",

        title: "Custom Draft Sets",

        body: "This creen allows you Create and Manage custom sets, as well as select which sets are currenlty active for purposes of Chaos Draft and Momir.\n\nClick on Add Custom Set to being the process of creating a new set.",
      },

      {
        id: "create_set",

        route: "/sets",

        target: "#customDraftSetAddPanel",

        title: "Create a Set",

        body: "This is where you specify what you want to call your set, upload an SVG file to use as an icon, and setup the special slots for you to assign cards to.\n\nWhat are special slots you ask?  If you have ever read about how modern Magic the Gathering packs are laid out, you will have seen terms such as 'Booster Fun', 'Special Guests', and other terms that are used to describe what cards you can get in certain slots within a pack.  Special Slots are designed to replicate that sort of capability. The Special Slots in Deckadence allow you to assign different sub set of cards to specific slots in packs.",
      },

      {
        id: "saved_sets",

        route: savedSetsRoute,

        target: function () {
          return document.querySelector("#customDraftSetManageForm")
            ? "#customDraftSetManageForm"
            : ".custom-draft-set-list";
        },

        title: "Open a Custom Set",

        body: "After you create a custom set, it will appear in a list to manage on this screen.",

        nextLabel: "Open Set Editor",
      },

      {
        id: "set_details",

        route: manageRoute,

        target: "#customDraftSetManageForm > .page-panel",

        title: "Custom Set - Set Details",

        body: "The Custom Set screen is where you can manage all the specific about your custom set.  At the top is the Set Details. here you can update  the set's name, set code, icon, ect.",
      },

      {
        id: "card_back",

        route: manageRoute,

        target: "#customDraftSetCardBackButton",

        title: "Card Back",

        body: "This button allow you to set the Card Back you use by default for this set.  When print or export cards from this set it will use the selected Card Back.",
      },

      {
        id: "alternate_image_iso",

        route: manageRoute,

        target: "#customDraftImageIsolationTitle",

        title: "Alternate Image Isolation",

        body: "Alternate Image Isolation is an important setting you need to know about. This option allows you to Isolate the custom artwork you assign to the set.  By default, when you upload a custom image that you have created or sourced from places such as MPCFill, it will replace the card image for that printing across the entire application.  This makes it so you can upload high resolution proxy images and use them throughout the entire application.\n\nBut sometimes you don't want that. This option allows you to Isolate this set from other sets and decks.  One this option is enabled any changes to the artwork are only made to this set and not to any other sets, packs, or decks in Deckadence.  It isolates it from those updates. ",
      },
      {
        id: "special_slots",

        route: manageRoute,

        target: 'input[name="special_category_1_name"]',

        title: "Special Slot Categories",

        body: "You can customize the category names for the special slots you want to use in boosters.  These categories can be assigned to specific slots in the pack, and when you add cards to the set you can assign them to specific Special Slot Categories.",
      },

      {
        id: "pack_types",

        route: manageRoute,

        target: ".custom-draft-pack-layout-list",

        title: "Pack Types",

        body: "Mystery, Play, and Collector Boosters each have their own layouts.\n\nBut this is your set and its going to play by your rules!\n\nThis is where you can customize how these types packs are laid out. Just click on the Edit Layout button to customize the layout.\n\nOnce you have added cards and you want to test pack generation, click on the Generate Pack button to generate a test pack.",

        nextLabel: "Edit a Layout",
      },

      {
        id: "slot_rules",

        route: layoutRoute,

        target: ".custom-draft-layout-table",

        title: "Pack Layout - Slot Assignment",

        body: "You can edit he pack layout on the screen specifcy how each slot in the pack has cards assigned.  You can assign cards by Color, Rarity, and Special Slot Category.  You can also specify if a slot should be a foil or not.\n\nYou can even change the size of packs from this screen.",
      },

      {
        id: "layout_controls",

        route: layoutRoute,

        target: ".custom-draft-layout-header-actions",

        title: "Add Slots and Save the Laout",

        body: "You can add additional card slots by clickin on Add Card Slot.  Always remember to click on Save Layout when you are done making changes.",

        nextLabel: "Return to Set",
      },

      {
        id: "card_list",

        route: manageRoute,

        target: "#customDraftCurrentCardTools",

        title: "Set Card List",

        body: "The Set Card List is where you can view and manage all the cards you have assinged ot the set.  Here you can add new cards and see existing ones. You can mange what printing each card is using, upload custom proxy art to use instead of the default art of the card, and if you have an Upscale addon installed, upscale cards in the set.\n\nThis is also where you assign cards to special categories if you want them to only appear in specific slots.  Use its filters, list or grid view, selection tools, and bulk actions to manage larger sets.",
      },

      {
        id: "add_cards",

        route: manageRoute,

        target: "#customDraftOpenAddCardsButton",

        title: "Add Cards",

        body: "And this is how you Add Cards to your set.   You click on the Add Cards button.\n\nThis one, right here.  The one that looks like a plus sign.  Yeah, that one.\n\nCLICK IT!\n\nYou know you want to.",
      },

      {
        id: "card_tools",

        route: manageRoute,

        target: "#customDraftCurrentCardTools",

        title: "Filter and Organize",

        body: "This is card filter.  You use it filter and search for cards in your set so you can manage them or look at them.  There are all sorts of filters such as Rarity, Color, Mana Values, if you have an alternage image applied, if it is assigned to a special slot, ect.  Lots of options  Use this to Filter the current set by card details, as well as switch between list and grid views.\n\nYou can also maximize this screen by clicking on the Maximize button. Several command are available in this section that you can use on selected cards, such as Assigning Special Slots, and, if installed, using an upscale plugin on selected cards.",
      },

      {
        id: "stats",

        route: manageRoute,

        target: "#customDraftStatsToggleButton",

        title: "Set Stats",

        body: "Stats gives you a quick view of the set's colors, rarities, mana values, card types, and other useful totals.",
      },

      {
        id: "print_export",

        route: manageRoute,

        target: "#customDraftOpenPrintExportButton",

        title: "Print and Export",

        body: "This button allows you to print or export the entire set!  Since you can make a set as big as you want, be aware that printing an exporting large set can and likely will take a while, so please be patient.",
      },

      {
        id: "complete",

        route: manageRoute,

        target: "#customDraftCurrentCardTools",

        title: "Custom Set Ready",

        body: "And that is the basic information about Custom Sets.  Once you have created a custom set, you can create custom packs in the Chaos Draft based on the set you created.",

        nextLabel: "Finish Tour",
      },
    ],
  });
})();
