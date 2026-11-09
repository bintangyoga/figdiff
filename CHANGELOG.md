# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/), and the project uses [Semantic Versioning](https://semver.org/). Before 1.0, anything may change between releases.

## [Unreleased]

### Added

- `--html <file>`: writes a self-contained HTML report of the changes, with filters by kind, color swatches, and light and dark mode.
- `--images` (with `--html`): renders every changed frame in both files through FigCraft's `figcraft-cli`, compares them pixel by pixel, and embeds a before/after swipe slider, a difference view and the share of changed pixels. Experimental: not yet verified against the real `figcraft-cli`. Use `--figcraft-cli <path>` or `FIGCRAFT_CLI` to point to it.
- Frames that exist in only one version are shown on their own. If `figcraft-cli` is missing, the report is still written without images.
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
