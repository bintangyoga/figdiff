# Compatibility

figdiff reads FigCraft's `.figcraft` format, which is still evolving. This table records what has actually been tested. Please report anything else that works or breaks.

| FigCraft | Document `version` | Parsing and diff | Image rendering (`figcraft-cli`) | Notes |
| --- | --- | --- | --- | --- |
| 0.17.0 | 1 | Tested on the example files shipped with FigCraft | Tested in CI on the Ridgeline onboarding example | Images checked by eye on one file |
| older / newer | | Not tested | Not tested | |

## What "tested" means

- **Parsing and diff**: the example files from FigCraft's repository parse, and pairs of them (with edits) produce the expected changes. The automated tests also use generated documents, including a 10,000-node file.
- **Image rendering**: the Action downloaded `figcraft-cli` from the FigCraft release and rendered the changed frames of a modified example.

## Not verified yet

- Whether node ids stay the same when a file is saved again in the FigCraft app. figdiff matches nodes by id, so this matters a lot. If you can save one design twice with a single small change and run `figdiff` on the two files, please share what you see in an issue.
- Files with `images/`, `versions/`, `branches/` or `library/` entries.
