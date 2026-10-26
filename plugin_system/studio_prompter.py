"""Load Studio's bundled planning package without adding global import paths."""
import importlib.util
import sys
from pathlib import Path
from paths import BUNDLE_BASE_DIR

PACKAGE = Path(BUNDLE_BASE_DIR, 'plugin_src', 'card-finishing-studio', 'prompter')
NAME = 'deckadence_studio_prompter'
if NAME not in sys.modules:
    spec = importlib.util.spec_from_file_location(NAME, PACKAGE / '__init__.py', submodule_search_locations=[str(PACKAGE)])
    module = importlib.util.module_from_spec(spec)
    sys.modules[NAME] = module
    spec.loader.exec_module(module)
from deckadence_studio_prompter import compiler, contracts, dictionary, preparation, diagnostics, mirror, targets
