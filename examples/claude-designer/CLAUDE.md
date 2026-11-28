# Design repository: instructions for Claude

This repository holds FigCraft design files (`.figcraft`). People ask Claude for design changes, and Claude makes them on a branch and opens a pull request. The figdiff Action then comments on the pull request with what changed and before/after images, and people review it there or on the figdiff website.

## Tools

In a Claude Code cloud session, `.claude/hooks/session-start.sh` installs both tools at the start of the session and puts them on the `PATH`:

- `figcraft-cli`: FigCraft without a window. `figcraft-cli commands` lists every command and its parameters.
- `figdiff`: compares two versions of a `.figcraft` file.

If `figcraft-cli --version` fails, say so and stop. Never edit the bytes of a `.figcraft` file by hand or with another tool.

## How to make a design change

1. Start a branch for the request (one request per branch and pull request).
2. Look before you change anything:
   - `figcraft-cli info design/<file>.figcraft` lists pages and top-level frames.
   - Find layers with a script of `node.find` steps (by `name`, `type` or `text`), then read them with `node.get` (`fields` such as `name`, `characters`, `fills`, `width`).
3. Write the change as a script: a JSON array of `{"command": ..., "params": {...}}`. Keep scripts, renders and other scratch files outside the repository (for example in `$TMPDIR`). Run it on the file in place:

   ```sh
   figcraft-cli run --in design/app.figcraft --out design/app.figcraft "$TMPDIR/change.json"
   ```

   The whole script is one step: if any command fails, nothing is saved.
4. Check what you changed, against the base branch:

   ```sh
   figdiff design/app.figcraft --against origin/main
   ```

   Every line should be something the request asked for. If anything else changed, start again from the base version of the file (`git checkout origin/main -- design/app.figcraft`).
5. Look at the result before you open the pull request: `figcraft-cli export design/app.figcraft --node "<frame name>" --out "$TMPDIR/after.png"`, then open the PNG.
6. Commit only the `.figcraft` file(s), push the branch and open a pull request. Describe the change in plain words, frame by frame, and say anything you could not do.
7. Revisions go on the same branch. Every push updates the figdiff comment.

## Rules that keep the diff readable

figdiff matches layers by their ids, so:

- Change layers in place with `node.set` (fills, size, position, auto layout, text style) and `text.set` (words). Do not delete a layer and draw a new one to change it.
- Add new layers only when the request asks for something new, and give them clear names (`name`).
- Do not convert, reformat or re-save files the request does not touch.
- Use colours, styles and variables already in the file where they fit, rather than new raw values.
- Do not delete frames, pages or components unless the request asks for exactly that.

## Useful commands

| Goal | Command (inside a `run` script) |
| --- | --- |
| Find layers | `{"command": "node.find", "params": {"name": "Button", "type": "frame"}}` |
| Read a layer | `{"command": "node.get", "params": {"id": 12, "fields": ["name", "fills"]}}` |
| Change words | `{"command": "text.set", "params": {"id": 18, "characters": "Get started"}}` |
| Change a fill | `{"command": "node.set", "params": {"id": 12, "fill": "#1E6F5C"}}` |
| Change size or corners | `{"command": "node.set", "params": {"id": 12, "width": 240, "cornerRadius": 12}}` |
| Find and replace text | `{"command": "edit.findReplace", "params": {"find": "Sign up", "replace": "Join"}}` |

`figcraft-cli run` prints one JSON line per step with the result, including the ids that `node.find` returns.
