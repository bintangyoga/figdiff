# Design changes from Claude

Ask Claude for a design change and get a pull request back, with figdiff's list of changes and before/after images. Claude works in a [Claude Code](https://claude.com/claude-code) cloud session, so nothing runs on your computer and nothing needs hosting.

## How it works

1. You ask Claude for a change in a cloud session on your design repository (for example "make the Get started button green and rename it Start hiking").
2. When the session starts, a hook in the repository installs FigCraft's `figcraft-cli` from the official [FigCraft release](https://github.com/storytold/figcraft/releases), checked against the release's `sha256sums.txt`, and installs `figdiff`.
3. Claude finds the layers, changes them with `figcraft-cli run`, checks its own change with `figdiff --against`, and opens a pull request.
4. The [figdiff Action](action.md) comments on the pull request with the changes and the images. You review there, or on the [figdiff website](github.md) for public repositories.
5. Ask for revisions in the same session. Claude pushes to the same branch and the comment updates.

## Set up a design repository

In the root of your repository, run:

```sh
npx figdiff init
```

It writes four files:

| File | What it does |
| --- | --- |
| `.claude/settings.json` and `.claude/hooks/session-start.sh` | Install `figcraft-cli` and `figdiff` when a Claude Code cloud session starts (only in cloud sessions) |
| `CLAUDE.md` | Tells Claude how to edit `.figcraft` files so the diff stays readable, and how to open the pull request |
| `.github/workflows/figdiff.yml` | The figdiff Action with images in the comment, pinned to the figdiff version that wrote it |

Your own files are kept:

- An existing `CLAUDE.md` gets the figdiff section added at the end, between `<!-- figdiff:start … -->` and `<!-- figdiff:end -->` markers. Running `init` again does not add it twice.
- An existing `.claude/settings.json` gets the session hook added; your other settings stay as they are. If the file is not valid JSON, `init` stops and writes nothing.
- An existing hook script or workflow is skipped. `npx figdiff init --force` replaces them, and the figdiff section of `CLAUDE.md`, with the template of the figdiff version you run. It never removes your other settings or `CLAUDE.md` text.

Then commit the files and push them to your default branch. Sessions started after that use them.

The same files are in [`examples/claude-designer`](../examples/claude-designer) if you would rather copy them by hand.

The hook installs the newest FigCraft release by default, the same one the Action renders with. To pin a version, set `FIGCRAFT_VERSION` (for example `0.18.1`) in the cloud environment's variables.

## What Claude follows

The `CLAUDE.md` in the template asks Claude to:

- work on its own branch, one request per pull request;
- change layers in place (`node.set`, `text.set`) instead of deleting and redrawing them, because figdiff matches layers by their ids;
- check with `figdiff <file> --against origin/main` that every change was asked for, and look at an exported PNG before opening the pull request;
- commit only the `.figcraft` files it changed, and describe the change in plain words.

Edit it to add your own rules, such as which colours or components to use.

## Limits

- The cloud session must be able to reach `github.com` (for the FigCraft download) and the npm registry (for figdiff).
- Claude edits through FigCraft's command list (`figcraft-cli commands`). It cannot see the canvas while it works, only exported images.
- Repositories must be readable by the Action. For private repositories the figdiff website does not work yet; the comment in the pull request does.
