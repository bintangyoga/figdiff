# Command line guide

```sh
npx figdiff <before.figcraft> <after.figcraft> [options]
npx figdiff <file.figcraft> --against <git-revision> [options]
```

Requires Node.js 20 or later. Run `figdiff --help` for the same summary.

## Options

| Option | Meaning |
| --- | --- |
| `--against <revision>` | Compare one file with its version at a git revision (branch, tag or commit such as `main` or `HEAD~1`). Run it inside the repository. |
| `--html <file>` | Also write a self-contained HTML report. |
| `--images` | Add rendered before/after images to the HTML report. Needs `--html` and FigCraft's `figcraft-cli`. On wide screens the changes are listed next to the images; click a change marked ◎ to outline it on the image. Positions come from figcraft-cli (so auto layout is applied) or, when it cannot say, from the file. Experimental. |
| `--tolerance <number>` | Ignore changes to a node's `width`, `height` and position (`x`, `y` in `transform`) of up to this size. For example `0.5` hides the sub-pixel shifts that appear after FigCraft re-measures text. Default 0 (exact). Colors, opacity, radii, variables and styles are always compared exactly. |
| `--scale <number>` | Render scale for the images, 0.25 to 4. Default 1. Use 2 for sharp images on high-density screens; the report still shows each frame at its real size. Needs `--images`. |
| `--figcraft-cli <path>` | Where to find `figcraft-cli`. Default: the `FIGCRAFT_CLI` environment variable, then `PATH`. |
| `--json` | Print the summary and every change as JSON. |
| `--markdown` | Print the changes as Markdown, ready for a pull request or a CI summary. Layer names are put in code spans. Cannot be combined with `--json`. |
| `--strict-ids` | Match nodes by id only. By default, nodes that have no id match on either side are paired by type and path of names, so a file whose ids changed on save still gives a readable diff. |
| `--exit-code` | Exit with 1 when the files differ. |
| `--help` | Show help. |

Exit codes: `0` success, `1` differences found (only with `--exit-code`), `2` error.

## What is compared

Nodes are matched by id. Nodes that have no match on either side are then paired by type and path of names, but only when both versions have the same number of such nodes at that path (use `--strict-ids` to turn this off). A node can be reported as:

- **added** or **removed**, with its type,
- **moved**, when it now lives under a different parent,
- **modified**, with each changed property (`from → to`),
- **reordered**, when its children are in a different layer order.

Renaming a layer counts as a property change (`name`). Numbers are rounded to four decimals, so floating point noise is ignored. Colors are printed as hex.

Instances are shown with the name of their component: a swap within a component set reads as `variant Time=Day → Time=Dusk`, and a swap to another component as `component Landscape / Time=Day → Badge`. A change inside a component says how many instances use that component, because it shows up in all of them.

Variables, styles and variable collections are compared too, matched by id (see below). Not compared yet: comments and the contents of `images/`.

## Variables and styles

Variables (per mode, for example Light and Dark), variable collections and styles are listed in their own section after the node changes:

```text
Variables and styles
  ~ Variable "color/bg": value Light #F4F6F8 → #FFFFFF
  + Variable "space/s" (Theme, float)
  ~ Style "Pine/50": name Pine/50 → Pine/500
```

They count in the summary as "token changes". In `--json` they are in a separate `tokens` array, and `summary.tokenChanges` appears when there are any.

## Text output

Changes are grouped by page and top-level frame, followed by a summary line:

```text
Page "Onboarding"
  Frame "1 Welcome"
    ~ Panel › Get started: fills #0E7C66 → #ED731A
    - Panel › I already have an account (text)

2 changes in 1 frame (1 removed, 1 property change)
```

Symbols: `+` added, `-` removed, `~` modified, `>` moved, `↕` reordered.

## JSON output

`--json` prints one object:

```json
{
  "summary": { "changes": 2, "frames": 1, "added": 0, "removed": 1, "moved": 0, "reordered": 0, "modifiedNodes": 1, "propertyChanges": 1 },
  "changes": [
    { "kind": "modified", "id": "21", "trail": ["Onboarding", "1 Welcome", "Panel", "Get started"], "path": "Ridgeline › Onboarding › …", "props": [{ "prop": "fills", "from": [], "to": [] }] },
    { "kind": "removed", "id": "23", "type": "text", "trail": ["Onboarding", "1 Welcome", "Panel", "I already have an account"], "path": "…" }
  ]
}
```

Each entry of `tokens` has `kind` (`added`, `removed` or `modified`), `entity` (`variable`, `style` or `collection`), `id`, `name`, and `detail` or `props`.

`kind` of a node change is one of `added`, `removed`, `moved` (with `fromTrail`), `modified` (with `props`) or `reordered`. The format is not frozen until 1.0.

## Install figcraft-cli

The change list, JSON, Markdown and HTML report need nothing besides figdiff. Pictures of the frames need FigCraft's own renderer, `figcraft-cli`, which the website cannot run, so images only appear when you run figdiff on your computer or in the GitHub Action (which downloads it for you).

- **Linux:** the tarball attached to each [FigCraft release](https://github.com/storytold/figcraft/releases) contains `figcraft-cli`. Unpack it and put the file somewhere on your `PATH`.
- **macOS and Windows:** the app installers do not include it, as far as we know. Build it from source with [Rust](https://rustup.rs): `git clone https://github.com/storytold/figcraft`, then `cd figcraft` and `cargo build --release -p figcraft-cli`. The program ends up in `target/release/figcraft-cli`.

Then point figdiff at it, either with `--figcraft-cli /path/to/figcraft-cli` or by setting the `FIGCRAFT_CLI` environment variable. `figcraft-cli convert` can also turn a `.fig` file from Figma into a `.figcraft` file (best effort), which figdiff can then compare.

## Recipes

Compare against the main branch:

```sh
npx figdiff design/app.figcraft --against main
```

Use it as a `git difftool`:

```sh
git config difftool.figdiff.cmd 'figdiff "$LOCAL" "$REMOTE"'
git difftool -t figdiff HEAD~1 -- design/app.figcraft
```

Fail a script when the design changed:

```sh
npx figdiff before.figcraft after.figcraft --exit-code > /dev/null || echo "design changed"
```

Make a shareable report with images:

```sh
npx figdiff before.figcraft after.figcraft --html report.html --images --figcraft-cli /path/to/figcraft-cli
```
