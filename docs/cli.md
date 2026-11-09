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
| `--images` | Add rendered before/after images to the HTML report. Needs `--html` and FigCraft's `figcraft-cli`. Experimental. |
| `--scale <number>` | Render scale for the images, 0.25 to 4. Default 1. Needs `--images`. |
| `--figcraft-cli <path>` | Where to find `figcraft-cli`. Default: the `FIGCRAFT_CLI` environment variable, then `PATH`. |
| `--json` | Print the summary and every change as JSON. |
| `--exit-code` | Exit with 1 when the files differ. |
| `--help` | Show help. |

Exit codes: `0` success, `1` differences found (only with `--exit-code`), `2` error.

## What is compared

Nodes are matched by id. A node can be reported as:

- **added** or **removed**, with its type,
- **moved**, when it now lives under a different parent,
- **modified**, with each changed property (`from → to`),
- **reordered**, when its children are in a different layer order.

Renaming a layer counts as a property change (`name`). Numbers are rounded to four decimals, so floating point noise is ignored. Colors are printed as hex.

Not compared yet: variables, styles, comments, and the contents of `images/`.

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

`kind` is one of `added`, `removed`, `moved` (with `fromTrail`), `modified` (with `props`) or `reordered`. The format is not frozen until 1.0.

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
