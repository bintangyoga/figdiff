# .figcraft format notes

> Status: **to do (Phase 0).** This file will record what we learn about the `.figcraft` archive and its `document.json`.

Known so far, from FigCraft's public documentation:

- A `.figcraft` file is a zip archive.
- It contains `document.json`, an `images/` folder, and optionally `thumbnail.png`, `versions/`, `branches/` and `library/`.
- Files are written atomically (staging file plus one rename).

## To find out

- [ ] Top-level structure of `document.json` (pages, nodes, styles, variables)
- [ ] Node schema: id, type, name, parent, position, size, fills, strokes, text, auto layout, components
- [ ] Are node ids stable when a file is saved again without changes?
- [ ] Are ids stable after an edit (rename, move, duplicate)?
- [ ] How are components, instances and variants stored?
- [ ] What do `versions/` and `branches/` contain, and are they useful to reuse?
- [ ] Does the format carry a version number we can check?

## How to contribute here

Unzip a small `.figcraft` file, look at `document.json`, and add what you find. Please only share files you have the right to share.
