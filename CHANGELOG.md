# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, anything may change between releases.

## [Unreleased]

### Added

- Instances are shown with the name of their component, and a swap within a component set is reported as a variant change.
- A change inside a component says how many instances use it.
- HTML reports with images list the changes next to the images and outline a change on the image when you click it. Images rendered with `--scale 2` are shown at their real size.

## [0.1.0-alpha.9] - 2026-11-11

### Added

- Node matching fallback: nodes whose id changed between versions are paired by type and path of names, when the pairing is unambiguous. `--strict-ids` turns it off.
- `--markdown` prints the report as Markdown (also `markdown` in the browser result and `formatMarkdown` in the library).
- A variable whose value points at another variable is shown as `alias of <name>`.

## [0.1.0-alpha.8] - 2026-11-10

### Fixed

- `--tolerance` no longer hides colour, opacity or radius changes. It applies only to width, height and position (the translation part of the transform).

### Added

- A browser entry point, `compareFigcraft(before, after)`, that works on bytes with no file system. It powers the in-browser diff on the website.
- A website with a landing page, an in-browser diff check and these docs. See `site/` and `npm run build:site`.

## [0.1.0-alpha.7] - 2026-11-10

### Fixed

- An empty `guides` list and `layout.content_align: "auto"` are ignored. FigCraft adds them when it saves a file again, so every re-saved file used to show many false changes.

### Added

- `--tolerance <number>` (and the Action input `tolerance`): changes of up to this size to a node's width, height and position are ignored, so sub-pixel shifts after FigCraft re-measures text are not reported. Off by default. Colors, opacity, radii, variables and styles are always compared exactly.
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
