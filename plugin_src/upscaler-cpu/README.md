# Deckadence CPU Upscaler

Optional AI image upscaling plugin for Deckadence.

## Requirements

- Windows
- 64-bit CPU
- No separate Python installation is required for the bundled-runtime release.
- Internet connection during initial installation

## Installation

Install the plugin directly from Deckadence:

Settings Ã¢â€ â€™ Plugins Ã¢â€ â€™ Plugin Manager Ã¢â€ â€™ Available Ã¢â€ â€™ Download & Install

Deckadence will automatically:

1. Download the plugin.
2. Set up the included private Python runtime.
3. Download and install the libraries for this upscaler.
4. Download and verify the required AI models before completing installation.

The plugin is optional. Deckadence does not require the plugin or Python for normal use.

## Plugin ID

`upscaler-cpu`

## Current Production Model

Magic Card AI v3

## Supported Features

- AI card image upscaling
- Single-faced cards
- Double-faced cards
- Batch upscaling
- Persistent CPU worker for faster repeated processing

## Building the release

The main release builder checks and builds changed addons automatically:

```powershell
.\.dev_prompts\build_Deckadence_release.ps1
```

To build this addon individually, run `plugin_src/build_cpu_plugin.ps1`.
The private Python copy is downloaded automatically on the first build and
reused afterwards. No manual Python runtime setup is needed.
Publish the generated `*-runtime.zip` asset under the release tag printed by
the builder before shipping the updated application.
