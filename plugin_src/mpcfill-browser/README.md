# MPCFill Browser

Install from Deckadence Settings → Plugins, then open **Browse MPCFill** in a
card's Alternate Image picker. Search the MPCFill catalogue, filter by creator,
resolution, language or tags, save a shortlist, and choose an image.

Choosing **Use this image** downloads the original and adds an enabled Alternate
Source with **3mm Full-Bleed File (MPCFill Bleed)** checked automatically. The
original bleed file is retained for printing. The current deck/set's image
isolation and the selected front/back face are respected.

Previews, originals, catalogue responses and saved selections persist under
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
