# Portable user-content backups

Configuration → Backup → **Export User Content** creates a version 3 ZIP64
archive for restoring personal content or transferring it to an established
Deckadence installation. It contains selected records and assets, never a copy
of `cards.db` or the application installation.

## Included content

* Custom draft sets, membership, categories, pack slots, custom booster definitions,
  icons, backs, pack artwork, and isolation assignments.
* Saved packs, their cards, tracking codes, campaign membership, opening records,
  and source JSON.
* Active and archived decks, card quantities/printings, layouts, basic-land
  printings, external source metadata, artwork configuration, and isolation assignments.
* Alternate-art source records and uploaded images, generated bleed, isolated
  copies, and upscaled-image records with their output/bleed images.
* Chaos campaigns, players, portraits, draft games, pack/card history, and saved
  draft test sessions, players, pools, packs, cards and picks.
* Custom or modified print templates and their referenced custom artwork, including
  external artwork. Custom or modified cutting templates and registration metadata.
* Custom card backs and paired full-bleed images, custom pack art, saved deck-art
  source files and generated/exported deck covers, and custom set icons.
* Database configuration, selected sets, persistent Chaos selections and
  `settings.json` when present. Temporary pending pack/spin previews are omitted.

Only catalogue metadata for cards/sets referenced by this content is included.
Stable card UUIDs and Scryfall identities let a destination reuse its own catalogue;
missing referenced catalogue records can be supplied without importing the full
base dataset. Ordinary cached Scryfall images are not included.

Shipped template/back/pack-art hashes in `backup_defaults.json` identify unchanged
defaults. Uploaded files and changed shipped resources are included; unchanged
resources are supplied by the destination installation. The release build updates
this baseline using `tools/update_backup_defaults.py`. Development checkouts can
regenerate committed defaults with:

```powershell
python tools/update_backup_defaults.py --git-ref HEAD
```

## Excluded content

Plugins, AI models, application Python files/executables, CSS, JavaScript, the full
database, base card-image caches, downloaded base card/price datasets, export
outputs, old archives, logs, upscaling job queues, and unreferenced base catalogue
records are excluded. Browser storage and external operating-system settings are
outside this backup. Plugin/model preferences are saved as settings, but the
software/model files must be installed separately on a destination.

## Export

1. Exports can run while you use the application; changing or unavailable assets are skipped with warnings.
2. Open Configuration → Backup.
3. Click **Export** to open the modal. Open **Settings** to choose Categories to
   Export, Assets to Include and Settings. Everything starts selected. Group
   checkboxes select or clear their children and show a mixed state when needed.
4. Click **Export to Zip** to start. **Cancel Export** stops the running export
   and removes its unfinished ZIP and temporary job files.
5. When the archive is ready, a normal browser download starts with the ZIP filename.
   The browser uses its download folder or Save As dialog according to its settings.
   **Download Exported Archive** lets you download again. No browser filesystem API
   or localhost restriction is required. The application also retains its generated
   archive in `Export/`, named `Deckadence_Backup_YYYYMMDD_ID.zip` using the
   computer's local date and an eight-character unique ID.

Temporary export/import files, the operation lock and import recovery journal
live under `Export/backup-work/`. Export cleanup preserves that workspace to
protect recovery data; completed ZIPs use the ordinary Export cleanup policy.
The former root `.backup-work` is relocated on the next operation when the new
workspace does not yet exist.

`ExportSelection` defines the reusable content policy. The create endpoint accepts
`selection` boolean options and optional `entities` (`deck_ids`, `pack_ids`,
`set_codes`) for future individual-content sharing. Partial exports include
required card catalogue records without exporting the full database. Campaign
history also retains minimal pack records when its schema requires them. Modified
art is restricted to cards in the selected categories/entities. References to
omitted campaigns, packs, image scopes and custom backs are cleared. Import only
applies configuration settings if they are included in the archive.

Exports run in the background without blocking application requests or image jobs.
Imports pause other requests while merging records and settings. Browser navigation
during an import shows its progress controls rather than a JSON error. Large assets are
streamed in 4 MiB chunks with SHA-256 verification, ZIP64 and no image recompression.
Record inventories are streamed to disk; import stages them in a temporary SQLite
workspace. Memory scales with file metadata and user identity maps, not image bytes
or the full catalogue. The output ZIP is published only after completion.

Missing, unreadable, changing or linked custom assets are skipped. The completed
modal reports the skipped files; the archive manifest contains the full warning
list. Available assets and records are still exported, with unavailable file
references cleared for import. Each asset is staged separately before ZIP writing,
so a failed source read cannot leave a truncated archive entry. Allow free space
for the archive, the largest individual asset and temporary record processing;
no full database snapshot is created.

## Import and conflict behavior

1. Open Configuration → Backup → **Import user content** on the destination.
2. Use **Import ZIP file** to choose your backup archive. The file is uploaded
   with progress before validation; allow disk space for this temporary copy as
   well as the extracted assets.
3. Type **IMPORT**, then click **Validate and Import**.
4. Wait for completion in the status modal. The import runs against the existing
   database and does not require a restart to merge content.

* Integer entity IDs are allocated under a database write transaction above both
  existing IDs and SQLite's autoincrement sequence. Relationships are remapped,
  including polymorphic deck source IDs, JSON references and selected-entity settings.
* Isolation scopes receive fresh UUIDs. Scoped art and upscale references stay
  attached to their imported owners. Deleted original-art provenance is left empty.
* Conflicting custom set codes receive `_IMP2^`, `_IMP3^`, etc. Campaign/player
  names and pack tracking codes receive unique suffixes when necessary.
* Imported assets use new names/directories. Print templates receive new template
  IDs, and saved template/back/cutting selections and artwork paths follow those names.
  Cutting registrations are merged; destination files are preserved.
* Existing catalogue records are reused by stable identity. Existing decks, packs,
  campaigns and players are not replaced. Re-importing adds another independent copy.
* Imported configuration values override matching destination settings. Selected
  sets follow the source selection; destination-only settings remain. Pending previews
  are cleared. Imported custom pack-art overrides replace the matching art selection.
* Global alternate/upscaled artwork is added to the destination's image library;
  it can affect global image choices for cards shared by existing collections.

The destination need not have the exact same application version, but must support
the archive's tables and fields. An incompatible schema fails with an update
instruction before assets/records are installed. SHA-256, archive paths and inventory
counts are verified before merging. Database writes are transactional. A durable
asset/settings journal and a database import receipt recover interrupted imports
on restart or the next backup operation: uncommitted changes roll back; committed
imports keep their content. No full database/root replacement occurs.

Import requires free space for extracted content and temporary record processing.
Uploads additionally require space for the uploaded ZIP. Existing data is retained.

## Older formats

Version 2 full-database backups and version 1 full XML backups are not accepted by
the portable importer. They cannot safely be merged by reusing their IDs. Export
user content from the source installation with this version instead. The individual
pack/campaign export/import features retain their existing portable behavior.
An old full restore that was staged but not applied can be cancelled in the UI;
it is never automatically applied by this version.

## Validation

```powershell
python -m unittest discover -s tests -p test_application_backups.py -v
python tests/check_portable_backup_integration.py
python tests/check_portable_backup_browser.py
python -m py_compile backup_system.py user_backup_system.py portable_content.py ui/backups.py app.py db/exports.py silhouette_templates.py
node --check static/js/application_backups.js
git diff --check
```

Tests use temporary databases and files. They cover collision remapping, isolation,
upscales, custom sets, draft/deck relationships, settings, templates, exclusions,
repeat imports, recovery/rollback, checksum failures, disk space, ZIP64, HTTP uploads,
download ranges and the desktop/mobile status modal. No 100 GB performance benchmark
has been performed.
