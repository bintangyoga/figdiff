# GitHub Action guide

The action comments on pull requests that change `.figcraft` files, and keeps one comment up to date on every push.

## Minimal setup

```yaml
# .github/workflows/figdiff.yml
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
          fetch-depth: 0 # the base commit must be available
      - uses: bintangyoga/figdiff@main
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `files` | `**/*.figcraft` | Glob patterns (commas or new lines) of the files to look at. `*` stays inside a folder, `**` crosses folders. |
| `comment` | `true` | Set to `false` to write reports without commenting. |
| `max-files` | `20` | Compare at most this many files per pull request. |
| `upload-reports` | `true` | Upload the HTML reports as the artifact `figdiff-reports`. |
| `report-dir` | `figdiff-reports` | Where the reports are written in the workspace. |
| `images` | `false` | Experimental. Download `figcraft-cli` from the latest FigCraft release and add before/after images to the HTML reports. |
| `tolerance` | empty | Ignore width, height and position changes up to this size, for example `0.5`. Empty means exact. |
| `scale` | `1` | Render scale for the images, 0.25 to 4. |
| `host-images` | `false` | With `images`: show the images in the comment, by saving them on a branch. Needs `contents: write`. |
| `assets-branch` | `figdiff-assets` | The branch that holds those images. |
| `version` | `latest` | Version of the `figdiff` npm package. Pin it (for example `0.1.0-alpha.5`) for repeatable runs. |
| `token` | `github.token` | Token used to comment. |

## Pictures in the comment

```yaml
permissions:
  contents: write
  pull-requests: write
...
      - uses: bintangyoga/figdiff@main
        with:
          images: true
          host-images: true
```

The pictures are committed to the `figdiff-assets` branch, one folder per pull request and commit. Anyone who can read the repository can see them, and the repository keeps a copy of every rendered frame. Delete the branch to clean up.

## Behavior to know about

- New and deleted files are listed without a comparison. Renames are treated as a delete plus an add.
- A file that was saved again without any design change is mentioned briefly, and files with no changes at all are left out. If a later push removes every design change, the earlier comment is replaced with a short note.
- Pull requests from forks get a read-only token. No comment is posted and no images are saved; the changes are printed in the job log.
- If a file cannot be compared (for example it is not a valid `.figcraft` file), the comment says so for that file and the others are still reported.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "could not list the changed files" | The checkout is shallow. Use `fetch-depth: 0`. |
| `npm error notarget` for the chosen version | The release was published a few minutes ago; npm needs a little time. Run the job again. |
| "does not include the GitHub Action" | The `version` is older than 0.1.0-alpha.2. |
| No images, warning "Could not render frame" | `figcraft-cli` printed an error, which is shown after "figcraft-cli said". |
