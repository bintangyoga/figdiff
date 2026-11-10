# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, anything may change between releases.

## [Unreleased]

### Fixed

- An empty `guides` list and `layout.content_align: "auto"` are ignored. FigCraft adds them when it saves a file again, so every re-saved file used to show many false changes.

### Added

- A compatibility check (`scripts/compat-check.mjs`, workflow "Compatibility") that runs FigCraft's real `figcraft-cli` over its example files to check that node ids stay stable and re-saving adds no noise. Weekly and on demand.

## [0.1.0-alpha.6] - 2026-11-10

### Added

- Variables, variable collections and styles are compared (matched by id; variable values per mode name). They appear in a "Variables and styles" section in the text and HTML output, in a new `tokens` array in `--json`, and as "token changes" in the summary. `--exit-code` counts them.
- Performance test with a 10,000-node document; guides for the CLI and the Action; compatibility table.

## [0.1.0-alpha.5] - 2026-11-10

### Added

- Action inputs `host-images` and `assets-branch`: with `images`, the comment shows before, after and difference images per changed frame. They are committed to a branch (default `figdiff-assets`) through the GitHub API and need `contents: write`. If the token cannot write, the comment is posted without images.

## [0.1.0-alpha.4] - 2026-11-09

### Changed

- When `figcraft-cli` fails to render a frame, the warning now includes what it printed (first line of stderr).

## [0.1.0-alpha.3] - 2026-11-09

### Added

- `--scale <number>` (with `--images`): render scale for the images.
- Action inputs `images` (experimental: downloads `figcraft-cli` from the latest FigCraft release and puts before/after images in the HTML reports) and `scale`. Renderer warnings appear in the job log.

## [0.1.0-alpha.2] - 2026-11-09

### Added

- GitHub Action (`action.yml`): on pull requests, compares every changed `.figcraft` file with its base version and posts a single comment that is updated on each push. HTML reports are uploaded as the `figdiff-reports` artifact. Inputs: `files`, `comment`, `max-files`, `upload-reports`, `report-dir`, `version`, `token`. Example workflow in `examples/figdiff.yml`.
- `figdiff-action` binary used by the Action.
- Images in the comment are not included yet.

### Fixed

- `action.yml` was invalid YAML (an unquoted colon); GitHub could not load it.
- A clear error when the installed `figdiff` version does not include the Action.

## [0.1.0-alpha.1] - 2026-11-09

### Added

- `--html <file>`: writes a self-contained HTML report of the changes, with filters by kind, color swatches, and light and dark mode.
- `--images` (with `--html`): renders every changed frame in both files through FigCraft's `figcraft-cli`, compares them pixel by pixel, and embeds a before/after swipe slider, a difference view and the share of changed pixels. Experimental: not yet verified against the real `figcraft-cli`. Use `--figcraft-cli <path>` or `FIGCRAFT_CLI` to point to it.
- Frames that exist in only one version are shown on their own. If `figcraft-cli` is missing, the report is still written without images.
- `--against <revision>`: compare one file with its version at a git revision (branch, tag or commit).
- "Side by side" view in the HTML report, next to the swipe slider and the difference view.
- Dependency-free PNG decoder and encoder, checked pixel for pixel against real FigCraft thumbnails.

## [0.1.0-alpha.0] - 2026-11-09

First pre-alpha release.

### Added

- `figdiff <before.figcraft> <after.figcraft>`: compares two FigCraft files and prints what changed, grouped by page and top-level frame, with a summary line.
- Detection of added, removed, moved and modified nodes, and of changed layer order.
- Colors shown as hex, gradients in short form, floating point noise ignored.
- `--json` output and `--exit-code` for use in scripts and CI.
- Documentation of the `.figcraft` format in `docs/format-notes.md`.

### Known limitations

- Nodes are matched by id only. Whether ids stay stable across saves in FigCraft is not yet verified.
- No visual diff, HTML report or GitHub Action yet (see the roadmap in the README).
- Variables, styles and comments are not compared.
