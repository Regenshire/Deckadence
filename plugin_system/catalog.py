PLUGIN_CATALOG = {
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
            "Windows; NVIDIA RTX 50 Series GPU; "
            "Python 3.12 (64-bit)"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-nvidia-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-nvidia.zip"
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
            "Windows; 64-bit CPU; "
            "Python 3.12 (64-bit)"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-cpu-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-cpu.zip"
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
            "Windows 11 25H2; supported AMD "
            "Radeon RX 7000 or RX 9000 GPU; "
            "Python 3.12 (64-bit)"
        ),

        "github_owner": "Regenshire",
        "github_repo": "Deckadence",

        "release_tag_prefix": (
            "plugin-upscaler-amd-rocm-v"
        ),

        "release_asset_name": (
            "deckadence-upscaler-amd-rocm.zip"
        ),
    },
}