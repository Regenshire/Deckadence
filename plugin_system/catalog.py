# *** PLUGIN CATALOG - List Available Plugins ***
PLUGIN_CATALOG = {
    "subject-detection-ai": {
        "plugin_id": "subject-detection-ai",
        "name": "Card Finishing Studio",
        "plugin_type": "card_finishing",
        "type_label": "Card finishing",
        "description": "Foil masks, gloss, printable effects, and local AI selection. Generative Art AI is an optional download below.",
        "requirements": "Detection: 64-bit Python 3.10–3.13; CPU; internet for setup and first-use model downloads",
        "bundled_source": True,
        "required_capabilities": ["text", "subject", "frame"],
        "preserve_models": True,
    },
    "spot-foil-ai": {
        "plugin_id": "spot-foil-ai",
        "name": "AI Text Detection",
        "plugin_type": "text_detection",
        "type_label": "Text detection",
        "description": "Reusable local AI text detection for card artwork and image tools. Spot foiling can use the detected lettering; its other tools work without this plugin.",
        "requirements": "64-bit Python 3.10–3.13; CPU; internet for initial library installation",
        "bundled_source": True,
        # Retain the legacy runtime for existing installs until Studio is updated.
        "hidden": True,
    },
    "upscaler-nvidia-rtx50": {
        "plugin_id": (
            "upscaler-nvidia-rtx50"
        ),
        "name": (
            "NVIDIA RTX 50 Series "
            "Upscaler"
        ),
        "plugin_type": "upscaler",
        "type_label": "Upscaler",
        "description": (
            "AI image upscaling for systems "
            "with an NVIDIA RTX 50 Series "
            "graphics card."
        ),
        "requirements": (
            "Windows or Linux x86-64; NVIDIA RTX 50 Series GPU; "
            "Python included"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-nvidia-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-nvidia-runtime.zip"
        ),
    },

    "upscaler-cpu": {
        "plugin_id": (
            "upscaler-cpu"
        ),
        "name": (
            "CPU Upscaler"
        ),
        "plugin_type": "upscaler",
        "type_label": "Upscaler",
        "description": (
            "AI image upscaling using "
            "CPU-based PyTorch inference. "
            "No NVIDIA GPU is required."
        ),
        "requirements": (
            "Windows or Linux x86-64; 64-bit CPU; "
            "Python included"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-cpu-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-cpu-runtime.zip"
        ),
    },

    "upscaler-amd-rocm": {
        "plugin_id": (
            "upscaler-amd-rocm"
        ),
        "name": (
            "AMD ROCm Upscaler"
        ),
        "plugin_type": "upscaler",
        "type_label": "Upscaler",
        "description": (
            "AI image upscaling for supported "
            "AMD Radeon GPUs using ROCm/HIP."
        ),
        "requirements": (
            "Windows 11 25H2 or supported Linux x86-64; AMD "
            "Radeon RX 7000 or RX 9000 GPU; "
            "Python included"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-amd-rocm-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-amd-rocm-runtime.zip"
        ),
    },
}
