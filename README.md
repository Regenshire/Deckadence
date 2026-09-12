# Deckadence

## Custom Set Management & Testing Tool | Design -> Proxy -> Test

Deckadence is a self-hosted web application for creating, managing, printing, and playing with Magic: The Gathering cards and proxies. It is designed for local use on a Windows PC and can be opened from other computers, phones, or tablets on the same network.

Deckadence combines Chaos Draft, custom draft sets and cubes, deck management, proxy printing, draft testing, card-image management, and optional AI image upscaling in one application.

## Features

- Create and manage custom draft sets, cubes, and custom Mystery Draft-style card pools.
- Open random Chaos Draft boosters using MTGJSON booster definitions and card data.
- Generate and manage pre-printed Chaos Draft packs.
- Create and manage decks with the Deck Builder.
- Run draft tests and manage draft/campaign data.
- Download and cache card images from Scryfall.
- Change card printings and alternate images without changing the underlying card identity.
- Generate printable card and pack PDFs.
- Use configurable print templates for different paper sizes, layouts, and workflows.
- Support Silhouette-compatible print layouts and registration-mark templates.
- Export Chaos Draft deck lists for services such as Archidekt and Moxfield.
- Open Deckadence from another device on the local network using the built-in QR code.
- Install optional upscaling plugins from the Deckadence Plugin Manager.

## Game Modes

Deckadence includes Chaos Draft and a collection of Momir-style and alternate game modes, including:

- Momir Basic
- Momir Select
- Momir Planeswalker
- Momir Legends
- Momir Battleship
- Momir Aggro
- Momir Odds
- Momir Evens
- Momir Prime
- Tower of Power
- Chaos Draft
- Pre-Print Chaos Draft
- Planechase
- Archenemy
- Custom modes

## Windows Release

The easiest way to use Deckadence is the packaged Windows release.

1. Download the latest `Deckadence_vX.X.X_Windows.zip` file from the GitHub Releases page.
2. Extract the entire ZIP file to a normal folder. Do not run Deckadence from inside the ZIP archive.
3. Open the extracted `Deckadence` folder.
4. Run `Deckadence.exe`.
5. Open the address shown by Deckadence in your browser if it does not open automatically.

Deckadence normally listens on port `5000`.

On the same computer, the application can normally be opened at:

```text
http://127.0.0.1:5000
```

From another device on the same network, open Deckadence using the host computer's local IP address, for example:

```text
http://192.168.1.50:5000
```

The QR code in Deckadence can also be used to open the application from a phone or tablet.

## First-Time Setup

After starting Deckadence for the first time:

1. Open **Settings**.
2. Open **Card Database**.
3. Select **Download Card Database**.
4. Allow the initial MTGJSON data import to complete.

Card images can be downloaded ahead of time or fetched later as needed.

## Navigation

The primary navigation is organized around the following areas:

- **Play** — Draft and Momir gameplay.
- **Cards** — Decks, custom Sets, and Packs.
- **Settings** — card database, plugins, reminders, Chaos Draft settings, Momir settings, printing, exports, backup, and advanced configuration.

## Chaos Draft

Chaos Draft can select and open random booster products from the sets and booster types enabled in Deckadence.

Deckadence uses booster information from MTGJSON to construct supported packs. Opened packs can be managed, printed, tracked, and used with Deckadence's draft and campaign tools.

Custom draft sets can also be created for cubes, custom environments, and custom Mystery Draft-style pools.

## Decks and Draft Testing

Deckadence includes deck management and a Deck Builder for organizing cards and printings. Draft testing tools can create draft pools and allow cards to be moved into decks, sideboards, and other draft zones.

## Printing

Deckadence includes a configurable print pipeline for cards, packs, decks, and custom sets.

Supported functionality includes:

- PDF card printing
- Multiple cards per page
- Configurable paper sizes and orientations
- Print bleed and cutting guides
- Card backs
- Pack labels
- Silhouette registration-mark layouts
- Template-driven print layouts

Print settings for Chaos Draft and Momir are maintained independently where appropriate.

## Optional AI Upscaling Plugins

Deckadence supports optional AI image-upscaling plugins. Upscalers are installed separately so the main Deckadence application does not require PyTorch or GPU libraries.

Open:

**Settings → Plugins → Plugin Manager**

and install the upscaler appropriate for the computer running Deckadence.

### NVIDIA RTX 50 Series Upscaler

Designed for supported NVIDIA RTX 50 Series graphics cards using CUDA-accelerated PyTorch inference.

Requirements:

- Windows
- NVIDIA RTX 50 Series GPU
- Python 3.12 64-bit
- Current compatible NVIDIA graphics driver

### AMD ROCm Upscaler

Designed for supported AMD Radeon GPUs using ROCm/HIP-accelerated PyTorch inference.

Current target requirements:

- Windows 11 25H2
- Supported AMD Radeon RX 7000 or RX 9000 Series GPU
- Python 3.12 64-bit
- Compatible AMD ROCm/Adrenalin environment

### CPU Upscaler

Provides the same Deckadence upscaling workflow without requiring a supported GPU. Processing is substantially slower than GPU acceleration but works on a much wider range of systems.

Requirements:

- Windows
- 64-bit CPU
- Python 3.12 64-bit

### Upscaling Features

The current production upscaling model is **Magic Card AI v3**, which provides:

- Whole-card AI upscaling
- Targeted processing for text- and symbol-sensitive card regions
- Single-faced card support
- Double-faced card support
- Batch upscaling
- Integration with Deckadence card, pack, set, and deck workflows

AI model files are downloaded by the plugin when required.

## Running From Source

Python 3.12 64-bit is recommended.

Create a virtual environment:

```powershell
py -3.12 -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install Deckadence's Python requirements:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Start Deckadence:

```powershell
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

## Building the Windows Application

Deckadence uses PyInstaller and the included `deckadence.spec` file.

From the repository root:

```powershell
python -m PyInstaller --clean deckadence.spec
```

The packaged application is created under:

```text
dist\Deckadence\
```

The complete `Deckadence` directory must be distributed together because the application uses a PyInstaller onedir build.

## Data Sources

Deckadence uses the following external data sources:

- **MTGJSON** — card, set, and booster data
- **Scryfall** — card images and image matching

## Local Data

Deckadence stores downloaded databases, cached images, generated files, plugin installations, and other runtime data locally. Back up important Deckadence data before replacing or moving an existing installation.

## License

MIT License. See `LICENSE.txt`.

## Disclaimer

Deckadence is an unofficial fan project and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast.

Magic: The Gathering and related properties are trademarks of Wizards of the Coast.

## Credits

Deckadence makes use of data and services provided by:

- MTGJSON
- Scryfall

The optional AI upscaling system uses open-source PyTorch-compatible image restoration models and supporting libraries distributed separately through Deckadence plugins.

Magic the Gathering is
