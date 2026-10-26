# Deckadence

<p align="center">
  <img src="docs/images/deckadence.svg" alt="Deckadence" width="600">
</p>

## Custom Set Management & Testing Tool | Design -> Proxy -> Test

Deckadence is a self-hosted local web application for creating, managing, printing, and playtesting with Magic: The Gathering cards from any set, deck, or pack. Deckadence support Chaos Drafts, custom draft sets and cubes, deck management, proxy printing, draft testing, card-image management, pack rip simulation, and optional AI image upscaling in one application.

Deckadence runs on your own PC and opens in a web browser. Your Deckadence database, settings, custom sets, decks, cached images, and generated files are stored locally with the application. No account or hosted Deckadence service is required. You can also open Deckadence from a phone, tablet, or another computer on the same local network.

## What Deckadence Can Do

- **Build custom sets, cubes, and drafts.** Create custom draft sets and chaos draft pools that use cards from any set.
- **Run Chaos Drafts and manage packs.** Open boosters in the Chaos draft mode, build pre-printed pack pools, track opened packs, and use campaign and draft-testing tools.
- **Build and manage decks.** Use the Deck Builder to organize cards, change printings, manage sideboards and basic lands, and prepare decks for playtesting or proxy printing.
- **Pack Openings.** Use the Pack Simulator to get a virtual fix on opening packs! You can use it to see what sort of cards could be open, and how much you are likely to lose if you open a bunch of them. The recommendation from everyone is to Buy Singles. Hopefully this help fullfill that itch!
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

### Windows

| Component        | Minimum                                        |
| ---------------- | ---------------------------------------------- |
| Operating System | Windows 10 or Windows 11, 64-bit               |
| Processor        | 64-bit dual-core processor                     |
| Memory           | 8 GB RAM                                       |
| Free Storage     | 20 GB; 50+ GB recommended                      |
| Browser          | Current modern web browser                     |
| Internet         | Required for initial setup and online features |
| Python           | Included with the packaged release             |

### Linux

| Component        | Minimum                                        |
| ---------------- | ---------------------------------------------- |
| Operating System | Ubuntu 22.04 or compatible Linux (glibc 2.35+) |
| Processor        | x86-64 dual-core processor                     |
| Memory           | 8 GB RAM                                       |
| Free Storage     | 20 GB; 50+ GB recommended                      |
| Browser          | Current modern web browser                     |
| Internet         | Required for initial setup and online features |
| Python           | Included with the packaged release             |

### macOS

| Component        | Minimum                                        |
| ---------------- | ---------------------------------------------- |
| Operating System | macOS, 64-bit                                  |
| Processor        | Apple Silicon (arm64)                          |
| Memory           | 8 GB RAM                                       |
| Free Storage     | 20 GB; 50+ GB recommended                      |
| Browser          | Current modern web browser                     |
| Internet         | Required for initial setup and online features |
| Python           | Included with the packaged release             |

### Storage Considerations

The **20 GB minimum** provides enough working space for Deckadence itself, its local databases, application data, and a collection of cached and uploaded images. It should not be considered sufficient for a very large long-term proxy library with a ton of high resolution image uploads.

Users who maintain large collections of high-resolution card images, alternate artwork, custom sets, generated proxies, backups, or upscaled images should consider **50 GB or more** of available storage.

Deckadence does not require every card image to be downloaded in advance. It downloads images as cards are viewed and used in the application. Images are downloaded and cached locally. Storage consumption depends heavily on how the application is used. Large image libraries can eventually consume tens of gigabytes.

### Additional Notes

- A dedicated graphics card is **not required** for normal Deckadence use.
- A separate Python installation is **not required** when using the packaged Windows, Linux, or macOS release.
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

### Optional: Desktop and Start menu shortcuts

If you want convenient shortcuts added to your Desktop or Start menu, there is a script to install them. After extracting Deckadence to the folder where you want to keep it, double-click **`Install_Shortcuts.bat`**. Choose **Desktop**, **Start menu**, or **Both**. No administrator access is required.

The shortcuts start Deckadence and open your browser to the Deckadence url.

### Windows Firewall

Windows may ask whether Deckadence is allowed to communicate on your network. If you want to open Deckadence from a phone, tablet, or another computer on your home network, allow access on **Private networks**.

## Linux Installation

1. Download `Deckadence_vX.X.X_Linux_x86_64.tar.gz` from the [Deckadence Releases page](https://github.com/Regenshire/Deckadence/releases).
2. Extract the entire archive into a folder where you want to keep Deckadance.
3. Open a terminal in the extracted `Deckadence` folder and run:

```bash
./Start_Deckadence.sh
```

4. Open the address shown in the terminal, normally **http://127.0.0.1:5000**.

Python is included in the package. Keep the terminal open while using Deckadence; press **Ctrl+C** to stop it. Run the same launcher to start it again.

## macOS Installation

1. Download `Deckadence_vX.X.X_macOS_arm64.zip` from the [Deckadence Releases page](https://github.com/Regenshire/Deckadence/releases). This build is for **Apple Silicon Macs** only.
2. Extract the ZIP into a folder where you want to save the application, such as Documents or Applications.
3. Open **`Deckadence.app`** inside that folder. This will start Deckadence and opens your browser. It might take several seconds to initially load.
4. If it does not automatically open, then open your preferred web browser such as Safari and open **http://127.0.0.1:5000** to go to Deckadence.

Python is included in this package. You can also run **`Start_Deckadence.command`** to start Deckadence in your Terminal; keep the terminal window open while using it and press **Ctrl+C** to stop it.

---

# First-Time Use

The startup instructions below are for the packaged Windows release. Linux and macOS users should start Deckadence using their installation instructions above, then follow steps 2 onward in the browser.

An Internet connection is required for the initial card database download and for features that download card data or images.

## 1. Start Deckadence (Windows)

Run `Start_Deckadence.bat`. Your browser should open Deckadence automatically.

If the browser does not open, use the local address shown in the Deckadence program window. The normal local address is:

```text
http://127.0.0.1:5000
```

## 2. Accept the Personal Use Agreement (All)

The first time Deckadence opens, you will be asked to accept the Personal Use Agreement. Deckadence is intended for personal, non-commercial set building and playtesting.

## 3. Download the Card Database (All)

Before most Deckadence features can be used, the local card database must be created. You will be prompted on the Home page to install the database. You can either do it from the Home page, or from the Settings page using these instructions:

1. Open **Settings**.
2. Open the **Card Database** section.
3. Select **Download Card Database**.
4. Allow the download and import process to finish.

The first database setup can take some time because Deckadence downloads and processes Magic card, set, and booster information for local use. This will take several minutes to complete.

## 4. Optional: Pack and product art downloader

Open **Settings â†’ Card Database â†’ Pack Image Downloader** to download pack art files for sets you want to simulate opening. This will download or create pack images for each set.

This downloader will try to download front facing pack images. If it fails to find one, it will instead try to download a tilted side view and straighten it, and if that fails it will create standing pack image to represent the pack.

This can take some time to run for all magic sets.

## 5. Start Using Deckadence (All)

After the card database is ready, the main areas of the application are available:

- **Play** contains Chaos Draft, campaigns, draft testing, and Momir-style game modes.
- **Cards** contains Decks, Custom Sets, Packs, and related card-management tools.
- **Settings** contains card database maintenance, printing options, image settings, plugins, backups, and other application preferences.

Card images do not need to be downloaded all at once. Deckadence can cache images as they are needed, and image-management tools are available if you prefer to prepare images ahead of time.

## 6. Optional: Use Deckadence From Another Device (All)

Deckadence can be opened from another computer, phone, or tablet connected to the same local network.

Use the **QR code button** in the Deckadence navigation bar, or enter the network address shown by Deckadence into the other device's browser.

For example:

```text
http://192.168.1.50:5000
```

The exact address depends on the computer running Deckadence.

## 7. Optional: Install an Image Upscaler

Deckadence provides optional AI image upscalers that run locally on your PC.

Compatible upscalers can be managed under:

**Settings â†’ Plugins â†’ Plugin Manager**

Choose an upscaler and select **Download & Install**. The bundled-runtime plugin packages include their own Python; Deckadence automatically downloads the selected upscaler's libraries and required models. No separate Python installation or terminal commands are needed. Keep an Internet connection available until installation finishes.

The upscaler will install required libraries and AI Image Models. This can take some time as the files are large.

These large libraries are downloaded only when you install an upscaler.

CPU upscaling does not require a dedicated GPU. NVIDIA and AMD upscalers require compatible graphics hardware and drivers.

---

## 8. Optional: Install MPCFill Browser

Install **MPCFill Browser** from **Settings → Plugins → Plugin Manager**. Then open a card's **Alternate Image Settings** and choose **Browse MPCFill** to search artwork, filter by creator, language, tags, or resolution, and save favorites.

MPCFill Browser uses Deckadence's existing runtime and libraries. Installing it requires no separate Python environment or dependency downloads; the plugin remains optional.

Choose **Use this image** to add the selected artwork to the current image library. The **3mm Full-Bleed File (MPCFill Bleed)** option is enabled automatically, and Deckadence retains the original full-bleed file. Double-faced cards let you select the face to update.

Deckadence caches previews and downloaded originals on disk in `data/cache/mpcfill`, so reopening or reusing artwork does not download it again. Catalogue results refresh after 24 hours or when you choose Refresh; unchanged artwork keeps its cached files. Previously cached results remain available when MPCFill is temporarily unreachable.

---

# Technical Information

Deckadence is written in Python and uses a local web interface. The packaged Windows, Linux, and macOS releases include the Python runtime and Deckadence's normal runtime libraries, so end users do not need to install Python separately.

The packaged application uses **Waitress** as its local HTTP server and **Flask** as the application framework. Application data is stored locally using **SQLite** and normal files inside the Deckadence installation.

For development from source, Python 3.12 64-bit is recommended. Exact package versions are maintained in `requirements.txt`.

Deckadence is intended for personal local network use only. It is not intended for use as an internet service. We recommending closing the application when not in use.

## Main Python Dependencies

- **Flask** - application and web-interface framework
- **Waitress** - local application server used by the packaged release
- **Jinja2** - HTML template rendering
- **Werkzeug** - Flask HTTP and utility support
- **Pillow** - card, artwork, and image processing
- **ReportLab** - PDF creation and print layouts
- **pypdf** - PDF processing and combination
- **Requests / urllib3** - downloads and communication with supported third-party data services
- **qrcode / Pillow** - QR-code support
- **CairoSVG** - SVG rendering used by artwork and set-icon workflows
- **PyInstaller** - creates the packaged Windows application

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

## Building a Windows Release

Run `.dev_prompts/build_Deckadence_release.ps1` to build the application and check all three addons. An addon is rebuilt when its manifest version differs from the existing ZIP in `dist`, or the ZIP is missing or unreadable. Bump the addon's `deckadence-plugin.json` version when changing it. To force a same-version rebuild, remove its ZIP from `dist` first.

Run this from your usual Deckadence PowerShell environment:

```powershell
.\.dev_prompts\build_Deckadence_release.ps1
```

The builder automatically downloads the small private Python copy needed for addon packages on the first build and reuses it afterwards. No extra setup or environment variables are needed. Use `-SkipAddons` to build only the application. Addon ZIPs remain separate from the application ZIP; this command builds packages but does not publish them.

## Building Linux Upscaler Packages

Inside x86-64 Linux or Ubuntu WSL, run `python3 -B plugin_src/build_linux_plugins.py`
from the repository. Use `--plugin cpu`, `--plugin nvidia-rtx50`, or
`--plugin amd-rocm` to build just one. Final ZIPs and checksums go in `dist/`,
alongside the Windows releases. Temporary build files stay under
`.dev_prompts/ai_work/linux-plugins/`.

The builder bundles standalone Python 3.12. Libraries and models download when
the user installs the plugin. Linux packages use CPU, CUDA 12.8, or ROCm 7.2
PyTorch wheels. GPU drivers and compatible hardware are still required; verify
health and an image upscale on the target machine before treating a release as
tested. Linux support currently targets x86-64 only.

Publish each `*-runtime-linux-x86_64.zip` alongside its Windows asset on the
plugin release tag printed by the builder. The updated plugin manager selects
the asset for the running operating system. Building packages does not publish
them or establish GPU compatibility.

# Privacy and Third-Party Services

## No Deckadence Telemetry

Deckadence does not include usage analytics, advertising tracking, or use any Deckadence-operated telemetry service.

Deckadence does not upload your saved decks, custom sets, campaigns, settings, locally cached card images, or generated proxy files to an online server. These items are stored locally on the computer hosting Deckadence.

Deckadence does make normal Internet requests when you use features that require external data, images, release information, or optional plugins. Those third-party services may receive normal network information associated with the request, such as your public IP address and browser/application request information. These requests may include downloading files from MTGJson, files from Scryfall, information from Moxfield, or downloads from Github.

## Services Used by Deckadence

- **MTGJSON** - provides Magic card data, set information, booster definitions, and supported pricing data used to build Deckadence's local databases.
- **Scryfall** - provides card images, bulk card information, set information, and set icons used by Deckadence image and card workflows.
- **GitHub** - hosts Deckadence releases and optional plugin packages. Deckadence can check GitHub for a newer release and can download selected plugins from GitHub when requested.
- **Moxfield** - used only when you choose Deckadence features that search for or import an external Moxfield deck.
- **Font Awesome** - provides the Font Awesome icon stylesheet used by the browser interface.

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

# License

Deckadence is released under the MIT License. See [`LICENSE.txt`](LICENSE.txt) for the full license text.

# Credits

Deckadence relies on data and services provided by projects including **MTGJSON** and **Scryfall**, and is built using a number of open-source Python libraries listed above and in `requirements.txt`.

Optional upscaling plugins use separately distributed open-source machine-learning libraries and models and are not required for normal Deckadence use.

# Screenshots

## Chaos Draft

<p align="center">
  <img src="docs/images/chaos-draft-spinner.jpg" alt="Randomly select pack in one of two Chaos Draft modes." width="1000">
  <br>
  <em>Randomly select pack in one of two Chaos Draft modes.</em>
</p>

<p align="center">
  <img src="docs/images/chaos-draft-opened-pack.jpg" alt="View the cards in an opened pack." width="1000">
</p>

<p align="center">
  <img src="docs/images/chaos-draft-card-preview.jpg" alt="Inspect individual cards." width="1000">
</p>

## Deck Roulette

<p align="center">
  <img src="docs/images/deck-roulette-spinner.jpg" alt="Take a spin on the Deck Roulette wheel for new deck ideas" width="1000">
  <br>
  <em>Take a spin on the Deck Roulette wheel for new deck ideas.</em>
</p>

## Momir

<p align="center">
  <img src="docs/images/momir-mode.jpg" alt="Play Momir with friends." width="1000">
  <br>
  <em>Play Momir with friends.</em>
</p>

## Custom Sets and Artwork

<p align="center">
  <img src="docs/images/custom-set-card-list.jpg" alt="Browse and manage cards in your own custom sets and cubes." width="1000">
  <br>
  <em>Browse and manage cards in your own custom sets and cubes.</em>
</p>

<p align="center">
  <img src="docs/images/alternate-image-settings.jpg" alt="Choose alternate card artwork." width="1000">
  <br>
  <em>Choose alternate card artwork.</em>
</p>

## Deck Builder

<p align="center">
  <img src="docs/images/deck-builder-stacked.jpg" alt="Use the Deckbuilder to create and manage decks." width="1000">
  <br>
  <em>Use the Deckbuilder to create and manage decks.</em>
</p>

<p align="center">
  <img src="docs/images/deck-builder-grid.jpg" alt="View a deck as a grid of cards." width="1000">
</p>

<p align="center">
  <img src="docs/images/deck-builder-deck-art.jpg" alt="Create a deck box with custom artwork." width="1000">
  <br>
  <em>Customize your deck box art.</em>
</p>

## Pack Simulator

<p align="center">
  <img src="docs/images/pack-simulator-opening.jpg" width="1000">
  <br>
  <em>Open some packs in your very own Pack Simulator!</em>
</p>

<p align="center">
  <img src="docs/images/pack-simulator-contents.jpg"  width="1000">
</p>

<p align="center">
  <img src="docs/images/pack-simulator-card-preview.jpg" width="1000">
</p>

## Printing

<p align="center">
  <img src="docs/images/print-export-settings.jpg" width="1000">
  <br>
  <em>Export to PDF or a ZIP files with support for cutters and custom paper sizes.</em>
</p>

<p align="center">
  <img src="docs/images/print-proxy-sheet.jpg" width="1000">
</p>

## Optional Image Upscaling

<p align="center">
  <img src="docs/images/upscaler-comparison.jpg" alt="Install an Upscaling addon to upscale low quality images." width="1000">
  <br>
  <em>Install an Upscaling addon to upscale low quality images.</em>
</p>

<p align="center">
  <img src="docs/images/upscaler-detail-comparison.jpg" width="1000">
</p>

<p align="center">
  <img src="docs/images/upscaler-batch-options.jpg" width="1000">
</p>

## AI Usage in Deckadence (optional)

Deckadence offers optional AI image-upscaling plugins to improve the resolution of card images. These plugins run locally on your computer. Images processed by the upscalers are not sent to a cloud AI service.

The upscalers are installed separately and are not required for Deckadence’s other features. An Internet connection is needed to download their libraries and models.

All three upscalers (CPU, NVIDIA, and AMD) use the same two models from [Xintao Wang's Real-ESRGAN project](https://github.com/xinntao/Real-ESRGAN):

| Model                 | Native scale | Download source                                                                     |
| --------------------- | ------------ | ----------------------------------------------------------------------------------- |
| **RealESRGAN_x2plus** | 2×           | [GitHub release v0.2.1](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.1) |
| **RealESRNet_x4plus** | 4×           | [GitHub release v0.1.1](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.1) |

Deckadence automatically downloads the model files from these GitHub releases and verifies their SHA-256 checksums. These are image-restoration and upscaling models, not large language models (LLMs).

AI upscaling features can alter fine details, lettering, and artwork.

## Development

Deckadence has been developed over the past six months and has been a passionate side project of mine, created for my own personal use. I am providing it to the greater Magic proxy community as a resource to those who are interested.

Disclaimer: AI tools have been used to assist with Deckadence’s development, including code generation, troubleshooting, documentation, and release tooling.

AI usage is a controversial and complex subject (rightly so for several reason), and I want to be clear about its usage as a coding assistant in the development of the application.
