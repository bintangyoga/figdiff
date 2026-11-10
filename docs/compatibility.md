# Compatibility

figdiff reads FigCraft's `.figcraft` format, which is still evolving. This table records what has actually been tested. Please report anything else that works or breaks.

| FigCraft | Document `version` | Parsing and diff | Image rendering (`figcraft-cli`) | Notes |
| --- | --- | --- | --- | --- |
| 0.17.0 | 1 | Passes the weekly [compatibility check](../.github/workflows/compat.yml) on all 5 FigCraft examples (ids stable, no noise on re-save) | Tested in CI on the Ridgeline onboarding example | Images checked by eye on one file |
| older / newer | | Not tested | Not tested | |

## What "tested" means

- **Parsing and diff**: the example files from FigCraft's repository parse, and pairs of them (with edits) produce the expected changes. The automated tests also use generated documents, including a 10,000-node file.
- **Image rendering**: the Action downloaded `figcraft-cli` from the FigCraft release and rendered the changed frames of a modified example.

## Node ids across saves

figdiff matches nodes by id, so this was the biggest open question. `scripts/compat-check.mjs` (run by the Compatibility workflow weekly, on demand, and when the parser changes) takes FigCraft's own examples and, using the real `figcraft-cli`:

1. re-saves each file with `figcraft-cli convert` and checks that figdiff reports nothing, and
2. renames one node with `figcraft-cli run` and checks that the rename is reported and nothing is added, removed or moved.

Result with FigCraft 0.17.0: ids are kept in all 5 example files. Re-saving does add defaults, which figdiff ignores (see "Values FigCraft adds on save" in [format-notes.md](format-notes.md)). Applying an edit headlessly re-measures text and auto layout, which can move sizes by a fraction of a pixel; those show up as extra property changes (see the open issue about a size tolerance).

This tests FigCraft's engine through its CLI. Saving from the desktop app has not been checked.

## Not verified yet

- Saving from the FigCraft desktop app (as opposed to `figcraft-cli`). If you can save one design twice with a small change and run `figdiff` on the two files, please share what you see in an issue.
- Files with `images/`, `versions/`, `branches/` or `library/` entries.
