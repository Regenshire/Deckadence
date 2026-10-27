# MPCFill Browser

Install from Deckadence Settings → Plugins, then open **Browse MPCFill** in a
card's Alternate Image picker. Search the MPCFill catalogue, filter by creator,
resolution, language or tags, save a shortlist, and choose an image.

**Exclude AI art** filters artwork tagged by MPCFill as AI Art (including its
aliases), AI Remaster or AI Frame. Untagged AI artwork cannot be identified by
this filter. Star a creator in the browser or batch selector to save them as a
**Favorite Creator**; the browser also has a favorites-only filter.

**Auto Select MPCFill Best** is available beside the batch actions for selected
deck and custom-set cards, and for all cards in pack views. The modal uses the
application's fonts, theme and controls. Choose **Find best matches** to review
artwork, enlarge previews, deselect individual matches and see fallback reasons.
Only **Download & apply** downloads originals and adds alternate sources.

Batch criteria include:

- Target DPI (default **Highest**), language, and front/back/both faces.
- AI-art exclusion, favorite creator priority, one specific favorite, and
  multiple preferred tags.
- **Only download from specified creators**, with a separate creator list.
- **Only download matches meeting all criteria**, which requires every selected
  tag, enabled creator preferences, and at least a numeric target DPI. If the
  target is Highest, it selects the highest resolution within those constraints.
- An opt-in to update cards that already have alternate artwork. Existing
  artwork is skipped by default; prior alternate sources are retained.

Ranking order is specific favorite, other favorites, number of preferred tags,
then DPI. Numeric DPI targets prefer the nearest resolution at or above the
target, then the highest below it when fallback is allowed. AI exclusion,
language and allowed creators are always required. Strict matching skips cards
that do not meet all requirements. Review pages contain 24 matches and selection
applies across pages. A batch can be stopped after its current card; completed
changes remain saved. Failed downloads can be retried without duplicating a
successfully applied source. Changing a collection's image library or a card's
active artwork after review requires finding matches again. Review choices
expire after 24 hours or an application restart.

Choosing **Use this image** downloads the original and adds an enabled Alternate
Source with **3mm Full-Bleed File (MPCFill Bleed)** checked automatically. The
original bleed file is retained for printing. The current deck/set's image
isolation and the selected front/back face are respected.

Previews, originals, catalogue responses, favorites and saved selections persist under
`data/cache/mpcfill/` on the computer running Deckadence. Images are served from
that local cache, including after an application restart. Only images viewed or
selected are downloaded. Catalogue/search metadata refreshes after 24 hours;
**Refresh results** requests a fresh search, while unchanged images remain cached.
Cached search results remain usable if MPCFill is temporarily unavailable.
The cache survives plugin updates and uninstalling; applied images also live in
Deckadence's normal alternate-source library.

This plugin uses the public MPCFill API and public Google Drive downloads. It
does not require access to the user's Google Drive account. Large files can be
temporarily unavailable when Google Drive limits downloads.

The plugin runs inside Deckadence using its existing Python runtime, Requests,
and Pillow. Installation enables the bundled plugin without downloading Python
or installing additional libraries. No GPU is required. Updating an older
installation removes its redundant plugin environment and keeps the image cache.

## Building the distribution

From the repository root on Windows, run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .dev_prompts/build_Deckadence_mpcfill.ps1
```

This follows the Card Finishing Studio builder's workflow. Use `-CheckOnly` to
validate without creating files, `-OutputDirectory` for a different destination,
or `-Python` to choose Python 3.10+. PowerShell 7 also works on Linux and macOS;
`-Linux -Distribution Ubuntu-22.04` runs it through WSL from Windows. Python's
standard library is the only build dependency. Without PowerShell:

```sh
python3 -B plugin_src/build_mpcfill_plugin.py
```

The builder produces `dist/deckadence-mpcfill-browser.zip` and
`dist/deckadence-mpcfill-browser.zip.sha256`, and prints the GitHub release tag
and title derived from the manifest version. The ZIP has the manifest at its
root, plus this guide, the MIT license, and `BUILD_INFO.json`. Build information
records the plugin and companion app versions and file checksums. Validation
checks the companion app's required MPCFill modules and assets before packaging.
Local caches, downloaded artwork, favorites, environments, and user data are
never included. Temporary build files stay under `.dev_prompts/ai_work/`.

## Installation and release scope

Release the matching Deckadence application from the same saved source revision.
MPCFill's Python handler, browser, batch interface, and application integration
are bundled in Deckadence. This ZIP contains the plugin installation metadata
and documentation; it is not a standalone application or a separate code update.
Plugin Manager currently installs the files bundled with Deckadence rather than
downloading this ZIP, and does not provide manual ZIP import.

After updating Deckadence, new users choose **Install** and existing users choose
**Update / Reinstall** for MPCFill Browser in **Settings → Plugins**. No external
Python installation, libraries, or models are needed. Existing favorites,
cached images, and applied alternate sources are retained.

Before publishing, verify the packaged app on each supported target: install
and update the plugin, open the browser, search and select artwork, run a small
batch review/apply, and confirm artwork remains after restarting. Package
validation does not test live MPCFill/Google Drive availability. The package
contains no third-party card artwork.

If publishing a separate plugin release, upload the ZIP and its checksum under
the tag printed by the builder. Leave **Set as the latest release** off: the
main Deckadence application release must remain **Latest** for the app updater.
