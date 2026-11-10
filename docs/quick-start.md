# Quick start

figdiff compares two versions of a `.figcraft` design file and tells you what changed: which layers were added, removed or moved, which properties changed, and which variables and styles were edited.

## Compare two files

```sh
npx figdiff@alpha before.figcraft after.figcraft
```

The output is grouped by page and frame, with a summary line at the end. It needs Node.js 20 or later.

## Compare with an earlier version in git

Run this inside your design repository:

```sh
npx figdiff@alpha design/app.figcraft --against main
```

`--against` takes any branch, tag or commit, for example `HEAD~1`.

## Share a report

```sh
npx figdiff@alpha design/app.figcraft --against main --html report.html
```

The report is a single HTML file with filters by kind of change. Add `--images` to include before and after pictures of every changed frame. Images are drawn by FigCraft's own `figcraft-cli`; see the [command line guide](/docs/cli/).

## Review in pull requests

Add this workflow to your design repository and figdiff comments on every pull request that touches a `.figcraft` file:

```yaml
name: Design changes
on:
  pull_request:
    paths: ["**/*.figcraft"]

permissions:
  contents: read
  pull-requests: write

jobs:
  figdiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: bintangyoga/figdiff@main
```

See the [GitHub Action guide](/docs/action/) for the inputs, including how to show images in the comment.

## Try it without installing anything

The [home page](/#try) compares two files in your browser. Your files are not uploaded: the comparison runs on your own computer. The browser version shows the list of changes; images need the command line or the Action, because they use FigCraft's renderer.

## Things to know

- figdiff is in alpha. Option names and the JSON format may still change before 1.0, so pin a version in CI.
- Layers are matched by id. See [compatibility](/docs/compatibility/) for what has been checked.
- figdiff is an independent project and is not affiliated with FigCraft.
