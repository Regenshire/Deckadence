# Deckadence

<p align="center">
  <img src="docs/images/deckadence.svg" alt="Deckadence" width="600">
</p>

## Custom Set Management & Testing Tool | Design -> Proxy -> Test

Deckadence is a self-hosted local Windows web application for creating, managing, printing, and playtesting with Magic: The Gathering cards from any set, deck, or pack. Deckadence support Chaos Drafts, custom draft sets and cubes, deck management, proxy printing, draft testing, card-image management, and optional AI image upscaling in one application.

Deckadence runs on your own PC and opens in a web browser. Your Deckadence database, settings, custom sets, decks, cached images, and generated files are stored locally with the application. No account or hosted Deckadence service is required. You can also open Deckadence from a phone, tablet, or another computer on the same local network.

## What Deckadence Can Do

- **Build custom sets, cubes, and drafts.** Create custom draft sets and chaos draft pools that use cards from any set.
- **Run Chaos Drafts and manage packs.** Open boosters in the Chaos draft mode, build pre-printed pack pools, track opened packs, and use campaign and draft-testing tools.
- **Build and manage decks.** Use the Deck Builder to organize cards, change printings, manage sideboards and basic lands, and prepare decks for playtesting or proxy printing.
- **Create high-quality proxy print files.** Generate PDFs using configurable print templates, card backs, bleed, cutting guides, multi-card sheets, pack labels, and Silhouette-compatible layouts.
- **Control card artwork and printings.** Use existing artwork, select alternate printings, use alternate image sources, and optionally install AI upscaling plugins for higher-resolution proxy images.
- **Keep everything local.** Deckadence is designed to run from your own PC without a Deckadence account or cloud database. Local backup/export tools are included, and the application can be shared with devices on your home network using the built-in QR code.
- **Proxy PDF Generation.** Generate PDFs or export image files for playtest card printing.
- **Silhouette Support.** Deckadence supports Silhouette Cameo cutters.

Deckadence is intended for personal set building, proxy creation, playtesting, and casual play. It is not intended for commercial proxy production or sanctioned tournament play.

---

# Minimum Requirements

Deckadence is a local application and stores its database, downloaded card data, cached card images, custom artwork, decks, custom sets, generated files, and other user-created content on the computer running the application.

Because Deckadence is designed to work with large collections of card images and other media, **available storage space is an important consideration**. Storage usage will increase over time as additional images and content are downloaded, uploaded, or generated.

| Component            | Minimum                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| **Operating System** | Windows 10 or Windows 11, 64-bit                                        |
| **Processor**        | 64-bit dual-core processor                                              |
| **Memory**           | 8 GB RAM or more                                                        |
| **Free Storage**     | **20 GB** (50+ GB recommended)                                          |
| **Browser**          | Current version of a modern web browser                                 |
| **Internet**         | Required for initial card database setup and online data/image features |

### Storage Considerations

The **20 GB minimum** provides enough working space for Deckadence itself, its local databases, application data, and a collection of cached and uploaded images. It should not be considered sufficient for a very large long-term proxy library with a ton of high resolution image uploads.

Users who maintain large collections of high-resolution card images, alternate artwork, custom sets, generated proxies, backups, or upscaled images should consider **50 GB or more** of available storage.

Deckadence does not require every card image to be downloaded in advance. It downloads images as cards are viewed and used in the application. Images are downloaded and cached locally. Storage consumption depends heavily on how the application is used. Large image libraries can eventually consume tens of gigabytes.

### Additional Notes

- A dedicated graphics card is **not required** for normal Deckadence use.
- Python is **not required** when using the packaged Windows release.
- Optional AI image-upscaling plugins may have substantially higher CPU, GPU, memory, and storage requirements.

---

# Installation

## Windows Release

The packaged Windows release is the easiest way to use Deckadence. You do **not** need to install Python or any of Deckadence's programming dependencies.

1. Download the latest `Deckadence_vX.X.X_Windows.zip` from the [Deckadence GitHub Releases page](https://github.com/Regenshire/Deckadence/releases).
2. Right-click the ZIP file and choose **Extract All**. Do not run Deckadence from inside the ZIP archive.
3. Move or keep the extracted `Deckadence` folder in a normal location where your Windows account can save files, such as Documents or another folder you control. Avoid placing it inside `Program Files`.
4. Open the extracted `Deckadence` folder.
5. Run **`Start_Deckadence.bat`**. This starts Deckadence and opens it in your default browser.

You can also run **`Deckadence.exe`** directly. The Deckadence window will display the local and network addresses you can open in a browser.

Deckadence normally uses:

```text
http://127.0.0.1:5000
```

Keep the Deckadence program window open while using the application. Closing that window stops Deckadence.

### Windows Firewall

Windows may ask whether Deckadence is allowed to communicate on your network. If you want to open Deckadence from a phone, tablet, or another computer on your home network, allow access on **Private networks**.

Deckadence does not need to be exposed to the public Internet.

---

# First-Time Use

An Internet connection is required for the initial card database download and for features that download card data or images.

## 1. Start Deckadence

Run `Start_Deckadence.bat`. Your browser should open Deckadence automatically.

If the browser does not open, use the local address shown in the Deckadence program window. The normal local address is:

```text
http://127.0.0.1:5000
```

## 2. Accept the Personal Use Agreement

The first time Deckadence opens, you will be asked to accept the Personal Use Agreement. Deckadence is intended for personal, non-commercial set building and playtesting.

## 3. Download the Card Database

Before most Deckadence features can be used, the local card database must be created.

1. Open **Settings**.
2. Open the **Card Database** section.
3. Select **Download Card Database**.
4. Allow the download and import process to finish.

The first database setup can take some time because Deckadence downloads and processes Magic card, set, and booster information for local use.

## 4. Start Using Deckadence

After the card database is ready, the main areas of the application are available:

- **Play** contains Chaos Draft, campaigns, draft testing, and Momir-style game modes.
- **Cards** contains Decks, Custom Sets, Packs, and related card-management tools.
- **Settings** contains card database maintenance, printing options, image settings, plugins, backups, and other application preferences.

Card images do not need to be downloaded all at once. Deckadence can cache images as they are needed, and image-management tools are available if you prefer to prepare images ahead of time.

## 5. Optional: Use Deckadence From Another Device

Deckadence can be opened from another computer, phone, or tablet connected to the same local network.

Use the **QR code button** in the Deckadence navigation bar, or enter the network address shown by Deckadence into the other device's browser.

For example:

```text
http://192.168.1.50:5000
```

The exact address depends on the computer running Deckadence.

## 6. Optional: Install an Image Upscaler

Deckadence provides seperate image upscaling addons. These optional addons all Deckadence to use local language models hosted on your PC to upscale images.

Compatible upscalers can be managed under:

**Settings → Plugins → Plugin Manager**

Upscaling plugins are installed separately from the main Deckadence application because the LLM libraries and hardware requirements are significantly larger than the core application.

---

# Technical Information

Deckadence is written in Python and uses a local web interface. The packaged Windows release includes the Python runtime and Deckadence's normal runtime libraries, so end users do not need to install Python separately.

The packaged application uses **Waitress** as its local HTTP server and **Flask** as the application framework. Application data is stored locally using **SQLite** and normal files inside the Deckadence installation.

For development from source, Python 3.12 64-bit is recommended. Exact package versions are maintained in `requirements.txt`.

Deckadence is intended for personal local network use only. It is not intended for use as an internet service. We recommending closing the application when not in use.

## Main Python Dependencies

- **Flask** — application and web-interface framework
- **Waitress** — local application server used by the packaged release
- **Jinja2** — HTML template rendering
- **Werkzeug** — Flask HTTP and utility support
- **Pillow** — card, artwork, and image processing
- **ReportLab** — PDF creation and print layouts
- **pypdf** — PDF processing and combination
- **Requests / urllib3** — downloads and communication with supported third-party data services
- **qrcode / Pillow** — QR-code support
- **CairoSVG** — SVG rendering used by artwork and set-icon workflows
- **PyInstaller** — creates the packaged Windows application

Deckadence also uses supporting Python packages including `blinker`, `certifi`, `charset-normalizer`, `click`, `colorama`, `idna`, `itsdangerous`, `MarkupSafe`, and `setuptools`. These are bundled or installed as part of the normal application/build requirements.

Optional Deckadence plugins can have their own dependencies. For example, AI upscaling plugins may install PyTorch and hardware-specific libraries in their own isolated plugin environment.

## Running From Source

For developers or advanced users:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

---

# Privacy and Third-Party Services

## No Deckadence Telemetry

Deckadence does not include usage analytics, advertising tracking, or Deckadence-operated telemetry service.

Deckadence does not upload your saved decks, custom sets, campaigns, settings, locally cached card images, or generated proxy files to an online server. These items are stored locally on the computer hosting Deckadence.

Deckadence does make normal Internet requests when you use features that require external data, images, release information, or optional plugins. Those third-party services may receive normal network information associated with the request, such as your public IP address and browser/application request information. These requests may include downloading files from MTGJson, files from Scryfall, and information from Moxfield.

## Services Used by Deckadence

- **MTGJSON** — provides Magic card data, set information, booster definitions, and supported pricing data used to build Deckadence's local databases.
- **Scryfall** — provides card images, bulk card information, set information, and set icons used by Deckadence image and card workflows.
- **GitHub** — hosts Deckadence releases and optional plugin packages. Deckadence can check GitHub for a newer release and can download selected plugins from GitHub when requested.
- **Moxfield** — used only when you choose Deckadence features that search for or import an external Moxfield deck.
- **cdnjs / Font Awesome** — provides the Font Awesome icon stylesheet used by the browser interface.

Third-party services are independent of Deckadence and are governed by their own availability, terms, and privacy practices.

---

# Responsible Use and Legal Information

Deckadence is an unofficial fan-made application intended for **personal, non-commercial set building, proxy creation, casual play, and playtesting purposes only**.

By using Deckadence, you are responsible for how you use the application and any material you create, download, upload, print, or share with it.

Please use Deckadence responsibly:

- Proxies and playtest cards created with Deckadence are not intended for resale or commercial distribution.
- Proxies created with Deckadence are not represented as genuine Magic: The Gathering cards and are not intended for sanctioned tournament play.
- Follow the rules of your local game store, tournament organizer, play group, or venue when using proxies or playtest cards.
- You are responsible for ensuring that your use of Deckadence complies with applicable laws and the terms of any third-party service you choose to use.
- Deckadence does not grant any license or ownership rights to Magic: The Gathering card artwork, names, symbols, rules text, trademarks, or other third-party intellectual property.

Deckadence is not affiliated with, endorsed by, sponsored by, or approved by Wizards of the Coast.

**Magic: The Gathering**, Magic card names, card artwork, symbols, rules text, and related trademarks and intellectual property are the property of Wizards of the Coast and/or their respective rights holders.

Deckadence is provided without warranty under the terms of its software license. Users are responsible for maintaining backups of any Deckadence data they consider important.

Please support your local game stores and the creators whose games and artwork make projects like this possible.

---

# Pack and product art downloader

Open **Settings → Card Database → Pack Downloader** to download missing art and
check generated fallbacks for upgrades.
The modal shows progress, transfer size, image previews, and any unavailable
products. Booster packs are selected by default; optionally select Play,
Collector, Set, and Draft booster boxes, plus Bundles, Gift Bundles, and Holiday
Bundles. Enter set codes to limit the run, or leave them blank to check imported
booster sets from newest to oldest.

Downloads run in one background worker. Closing the modal lets the job continue
while Deckadence remains open. **Cancel download** stops further work and keeps
completed images; start again to fill the remaining gaps. Cancellation is checked
between transfer chunks, so a stalled connection may take until the current
request times out. Handmade images and original downloaded photos are checked
locally and skipped. Generated fallbacks are checked for better sources on each
manual run. No downloads are triggered by Roulette, Pack Simulator,
or card database refreshes. Database refresh and pack downloads run separately.

The downloader uses official product images from
[Wizards Play Network](https://wpn.wizards.com/en/products). It reads set names
from the imported database and discovers product-shot ZIP archives from each
product page. It uses HTTP byte ranges to read the archive directory and selected
pack images without downloading the entire marketing kit. No API key or
additional Python dependency is required.

```powershell
# List available image sources without writing images.
python -m modes.pack_art FIN TMT

# Download and format previews for review.
python -m modes.pack_art FIN TMT --output .dev_prompts/pack_art_preview

# Fill missing art in data/img/pack_art, which Roulette already reads.
python -m modes.pack_art FIN TMT --install
```

Installation preserves bundled images, handmade runtime images, and original
downloaded photos. Each new pack is a
400 x 694 transparent PNG. Original photos retain their proportions; reconstructed
photos are corrected to a front-facing wrapper. A `.source.json` sidecar records
the method, source archive, selected filename, and any construction assets.
Boxes and bundles use a 640 x 480 transparent
canvas, retaining the official product view. Pack Simulator uses downloaded box
art automatically when that box is selected, with the existing generic box as a
fallback. Bundle images are available for product views; downloading them does
not add new bundle-opening recipes to the simulator.

Existing generated previews follow the same upgrade rules; use a new output
folder to compare a revised selection with an earlier download.
Downloads run only when requested, not while loading the wheel or refreshing cards.

For a set absent from the database, pass `--set-name "Final Fantasy"` with its
single set code. If WPN uses an unusual page slug, pass the full English product
page URL using `--page-url`. Packs follow this priority order:

1. **Front-facing original:** check all available official views, including older
   archive naming conventions. View numbers alone do not determine the front.
2. **Reconstructed pack:** flatten a mildly angled transparent wrapper using its
   measured edges and a perspective transform. No artwork or text is invented.
   Severe angles, curved edges, and missing areas are rejected.
3. **Created pack face:** use the reusable era-based wrapper builder with
   matching official set artwork and a transparent set logo. These are unofficial
   approximations, identified in the modal and source record. Artwork is cropped
   to the wrapper and may differ from the actual retail pack illustration.
4. **Era-based pack:** if online sources fail or have no matching assets, build
   a face with the set name, cached set symbol when available, and correct booster
   type. This requires no network request and carries no Deckadence branding.

The modal's **Generated pack design** defaults to release-year selection: paper
oval through 1994, framed foil for 1995–2002, dark foil for 2003–2014, and full-art
wrappers from 2015 onward. These are approximate design families, not exact
historical replicas. Choose an explicit style or hex wrapper color to override
the automatic choice. MBC and SLZ use verified official specialty-product images;
MBC retains its real horizontal wrapper, and SLZ uses its Zeta envelope. Only
verified specialty boosters are included; ordinary Secret Lair drops are not
treated as standard draft packs.

The artwork fallback downloads only the selected images from the English art-and-logo
archive, and reuses them for the set's other missing pack types. All processing is
local, with no AI service, API key, or additional dependency. Silhouette checks
cannot establish camera pose perfectly; inspect unfamiliar source families.

WPN is a website rather than a stable image API. Alternate source URLs and known
filename conventions are supported, including Jumpstart 2022 and both collector
sample filename orders. Historical sets and special variants without suitable
photos or set assets receive era-based faces. Only imported booster types are
created; boxes and bundles are never synthesized and may remain unavailable.

On each run, generated labels, artwork composites, and reconstructed photos can
be replaced by a higher-priority method. Owned generated faces also refresh when
the builder version or selected design/color changes, without downgrading their
source method. Missing artwork needed to rebuild an existing composite leaves it
intact. A failed lookup or cancellation keeps the existing file. Replacements use
an atomic file swap; the modal marks
them **Upgraded**. Source records identify generated files, and new records also
include an image checksum so user edits are preserved. Older generated fallbacks
without a checksum are identified by their matching source records. Handmade
files without generated provenance and all bundled images are kept.

New sets are included automatically after importing their booster definitions
and running the downloader. There is no background polling for new artwork.

The reusable `WpnPackArtSource`, `PackArtFormatter`, `PackArtDownloader`, and
`PackArtJobs` classes live in `modes/pack_art.py`. New images and their source
records are stored in `data/img/pack_art/<SET>/<product_type>.png` and
`.source.json`; handmade images in `static/img/pack_art` are preserved.
`PackFaceComposer` and `PackPerspectiveCorrector` in `modes/pack_art_rendering.py`
can also be used independently. Custom-set title cards use the same composer,
preserving their existing appearance. `from_assets()` and `from_label()` accept
`release_date`, `style`, and `base_color`; the app's custom-pack builder exposes
these as optional `pack_style`, `release_date`, and `base_color` arguments while
retaining its original default. CLI callers can use `--pack-style`, `--base-color`,
and `--release-date`. Generated provenance records the resolved design/version.

# License

Deckadence is released under the MIT License. See [`LICENSE.txt`](LICENSE.txt) for the full license text.

# Credits

Deckadence relies on data and services provided by projects including **MTGJSON** and **Scryfall**, and is built using a number of open-source Python libraries listed above and in `requirements.txt`.

Optional upscaling plugins use separately distributed open-source machine-learning libraries and models and are not required for normal Deckadence use.

# Screenshots

<p align="center">
  <img
    src="docs/images/example_chaos_draft.jpg"
    alt="Chaos Draft"
  >
  <br>
  <em>Roll on a Chaos Draft spinner for curated or random packs</em>
</p>
<p align="center">
  <img
    src="docs/images/example_deck_roulette.jpg"
    alt="Deck Roulette"
  >
  <br>
  <em>Spin on the Deck Roulette for deck ideas</em>
</p>

<p align="center">
  <img
    src="docs/images/example_momir_mode.jpg"
    alt="Chaos Draft"
  >
  <br>
  <em>Play Momir with friends</em>
</p>

<p align="center">
  <img
    src="docs/images/example_setcardlist.jpg"
    alt="Deckadence Set Card List"
  >
  <br>
  <em>Custom Set — Manage the cards in custom sets</em>
</p>

<p align="center">
  <img
    src="docs/images/example_AlternateImage.jpg"
    alt="Set Alternate Images"
  >
  <br>
  <em>Set Alternate Images</em>
</p>

<p align="center">
  <img
    src="docs/images/example_deckbuilder_stacked.jpg"
    alt="Deckbuilder Stack View"
  >
  <br>
  <em>Use the Deckbuilder to create and manage deckss</em>
</p>
