# Card Finishing Studio distribution

This plugin source package is shared by Windows and Linux. It includes text,
subject and frame detection, text repair, the generative worker and planner,
the shipped prompt dictionary, model/package definitions, and license notices.
It requires a matching Deckadence application; the Studio interface, effects,
and application integration are part of Deckadence, not a standalone program.

## Build

From the repository root on Windows (Windows PowerShell 5.1 or PowerShell 7):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .dev_prompts/build_Deckadence_card_finishing_studio.ps1
```

On Linux with PowerShell 7:

```sh
pwsh -NoProfile -File .dev_prompts/build_Deckadence_card_finishing_studio.ps1
```

From Windows using the existing Linux/WSL build environment:

```powershell
./.dev_prompts/build_Deckadence_card_finishing_studio.ps1 -Linux -Distribution Ubuntu-22.04
```

Python 3.10+ is the only build dependency. You can specify its executable with
`-Python`, choose a destination with `-OutputDirectory`, or validate without
creating a ZIP using `-CheckOnly`. Paths may contain spaces. The wrapper is in
the development scripts folder; the tracked release helper also runs directly
on Windows or Linux without PowerShell:

```sh
python3 -B plugin_src/build_card_finishing_plugin.py
```

The output is `dist/deckadence-card-finishing-studio.zip` and its `.zip.sha256`
checksum. Both platforms produce the same package format; there are no native
binaries to cross-compile. The manifest is at the archive root, with the
complete `prompter/` directory alongside it. `BUILD_INFO.json` records the
version, build environment, and SHA-256 of each packaged source file.

Builds use saved working-tree files, including uncommitted edits. Edit
`generation_prompts.json` here to change the prompt defaults in the distribution.
Per-user `ai_prompt_dictionary.json` overrides, model weights, virtual
environments, and caches are excluded. No dependency or model downloads happen
during a build. Python syntax, JSON, recipe placeholders, package/model
references, and archive contents are checked before replacing the output ZIP.
Intermediate files are kept under `.dev_prompts/ai_work/` and cleaned up afterward.

## Installation and release scope

Deckadence currently ships this source inside its application distribution and
installs it through Plugin Manager. This build does not switch the application
to downloading a separate GitHub asset or add a ZIP-import feature. To deliver
new Studio code to users with the current installer, rebuild the Deckadence
application from the same source revision. The ZIP is the separate plugin
source distribution, not an application installer or an offline AI bundle.

Detection libraries are installed into an isolated Python environment. Optional
generative packages download their models, artwork analyzer, adapters, and
associated libraries through Studio Settings. A successful source build does
not certify inference quality, GPU drivers, or runtime compatibility; those
still need testing on the target machines.

Studio setup automatically downloads a checksum-verified private Python 3.12
runtime on Windows/Linux x86-64 and macOS Intel/Apple Silicon. Detection and
generation use it to create their separate library environments; users do not
need to install Python or change PATH. The runtime is retained across Studio
reinstalls. Internet access is required for the first setup. Advanced users who
set `DECKADENCE_PLUGIN_PYTHON` must provide working 64-bit Python 3.12 with SSL,
ensurepip, and venv support.
