# .figcraft format notes

> Status: **in progress (Phase 0).** Findings below come from reading FigCraft's own example files (`examples/*.figcraft`, document `version: 1`). They are observations, not an official specification, and may change as FigCraft evolves.

## Archive

A `.figcraft` file is a zip archive containing:

| Entry | Notes |
| --- | --- |
| `document.json` | The whole design. Everything figdiff needs for a semantic diff. |
| `thumbnail.png` | Present in the examples. |
| `images/`, `versions/`, `branches/`, `library/` | Optional, according to FigCraft's documentation. Not present in the examples checked. |

## `document.json`: top level

| Key | Type | Meaning |
| --- | --- | --- |
| `format` | string | Always `"figcraft"`. figdiff rejects anything else. |
| `version` | number | Document format version. `1` in all examples. |
| `name` | string | Document name. |
| `pages` | number[] | Ids of the page nodes, in order. |
| `nodes` | object | **Flat** map from id (as a string key) to node. |
| `next_id` | number | Counter for the next new node id. |
| `current_page` | number | Page that was open when saved. |
| `variables` | object | Variable collections and modes (for example "Theme": Light/Dark). |
| `styles`, `document_colors`, `comments`, `imageIndex` | arrays | Not yet diffed. |

## Nodes

- Nodes are **not nested**. Hierarchy comes from each node's `children` (list of ids) and `parent` (id).
- Ids are integers, assigned from `next_id`. In all examples every node is reachable from a page.
- Common keys: `id`, `name`, `type`, `parent`, `children`, `width`, `height`, `transform`, `fills`, `strokes`, `corners`, `effects`, `layout`, `child_layout`, `constraints`, `bound`.
- Types seen: `page`, `frame`, `text`, `vector`, `instance`, `rectangle`, `ellipse`, `component`, `componentSet`, `star`, `section`.
- `transform` is a six-number affine matrix; the last two numbers are the x and y position.
- Colors are `{r, g, b, a}` with each channel from 0 to 1.
- `bound` links a property to a variable (for example `"fill": "VariableID:9"`).
- `instance` nodes point to their component with `component` and list changed properties in `overrides`.
- Numbers can carry float noise (for example `8.000000000000002`). figdiff rounds to 4 decimals before comparing.

## What figdiff does with this

1. Builds a tree: document → pages → nodes, following `children`.
2. Compares nodes by id; every key except `id`, `name`, `type`, `children` and `parent` is a compared property.
3. Reports added, removed, moved (different parent) and modified nodes.

## Still to find out

- [ ] **Are node ids stable when a file is saved again?** Needs FigCraft itself: open a file, save without changes, compare. Ids are sequential from `next_id`, so they are likely stable, but this is unverified.
- [ ] Do ids stay stable after rename, move, duplicate and undo?
- [ ] Is the order of `children` meaningful (layer order)? figdiff does not report reordering yet.
- [ ] How are variable values stored per mode, and how should variable changes be reported?
- [ ] What do `versions/` and `branches/` contain when present?
- [ ] How do overrides on instances interact with the component's own properties?

## How to contribute here

Unzip a small `.figcraft` file, look at `document.json`, and add what you find. Please only share files you have the right to share.
