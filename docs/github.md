# Designs on GitHub

Open a design, or the changes in a pull request, from any public GitHub repository on the figdiff website. Your browser reads the files straight from GitHub. figdiff does not upload, store or log them.

## Addresses

Put `figdiff.bintangyoga.dev/gh/` in front of the path of a GitHub address, or paste the GitHub address on the [start page](https://figdiff.bintangyoga.dev/gh/).

| Address | What you see |
| --- | --- |
| `/gh/<owner>/<repo>` | The `.figcraft` files at the default branch |
| `/gh/<owner>/<repo>/tree/<ref>` | The same at a branch, tag or commit |
| `/gh/<owner>/<repo>/blob/<ref>/<path>` | One design, as wireframes. Use `?ref=` when the branch name contains a slash |
| `/gh/<owner>/<repo>/compare/<base>...<head>` | What changed in every `.figcraft` file between two versions |
| `/gh/<owner>/<repo>/pull/<number>` | What changed in the designs of a pull request |

## What it shows

For each changed design: the list of changes, the same one `figdiff` prints, and wireframes of the frames that changed, with the changed layers outlined in orange.

The wireframes are drawn from the file alone: boxes, outlines and text, without fonts, images or effects. They show where things are, not what the design looks like. For real pictures, use the [GitHub Action](/docs/action/), which renders the frames with FigCraft's own renderer.

## Limits

- **Public repositories only.** Private repositories need a login, which is planned.
- **60 requests an hour.** GitHub allows that many without logging in, per address. A pull request with one changed design uses about four.
- **File size.** Files over 25 MB are not read in the browser.
- **Only `.figcraft` files.** Other files in a pull request are ignored.

## Privacy

The page loads from figdiff's website and then talks to `api.github.com` only. figdiff sets no cookies and keeps no accounts. The address you open is not sent to figdiff's server, except as the page you asked for.
