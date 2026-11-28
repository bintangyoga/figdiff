# GitLab CI guide

A ready-to-copy job comments on merge requests that change `.figcraft` files, and keeps one note up to date on every push, like the [GitHub Action](action.md) does on pull requests.

## Setup

1. Copy the job from [`examples/gitlab-ci/.gitlab-ci.yml`](../examples/gitlab-ci/.gitlab-ci.yml) into your `.gitlab-ci.yml`. If your pipeline has no `test` stage, change `stage:` to one it has.
2. Copy [`examples/gitlab-ci/figdiff-gitlab.mjs`](../examples/gitlab-ci/figdiff-gitlab.mjs) to `.gitlab/figdiff-gitlab.mjs` in your repository. The job runs it after installing figdiff from npm.
3. Make a token that may comment. In the project, open **Settings › Access tokens** and add a project access token with the **api** scope and the **Reporter** role. (A personal or group access token with the api scope works too.)
4. Add it as a CI/CD variable named `FIGDIFF_GITLAB_TOKEN` (**Settings › CI/CD › Variables**). Mark it **Masked**. Leave **Protected** off: merge request pipelines run on branches that are usually not protected, and a protected variable is not given to them.

Open a merge request that changes a `.figcraft` file. The job adds a note "Design changes" with the changes per file, and replaces it on every later push.

The job's own `CI_JOB_TOKEN` cannot be used instead of a token, because GitLab does not let it write notes on merge requests.

## Settings

Set these as `variables:` on the job (or as CI/CD variables).

| Variable | Default | Meaning |
| --- | --- | --- |
| `FIGDIFF_VERSION` | `0.1.0` in the template | Version of the `figdiff` npm package. Keep it pinned for repeatable runs, or use `latest`. |
| `FIGDIFF_FILES` | `**/*.figcraft` | Glob patterns (commas or new lines) of the files to look at. `*` stays inside a folder, `**` crosses folders. |
| `FIGDIFF_COMMENT` | `true` | Set to `false` to write the reports and print the changes in the job log, without a note. |
| `FIGDIFF_MAX_FILES` | `20` | Compare at most this many files per merge request. |
| `FIGDIFF_TOLERANCE` | empty | Ignore width, height and position changes up to this size, for example `0.5`. Empty means exact. |
| `FIGDIFF_REPORT_DIR` | `figdiff-reports` | Where the HTML reports are written. The template keeps this folder as the job artifact. |
| `FIGDIFF_IMAGES` | `false` | Experimental. Render before/after images and show them in the note (see below). |
| `FIGDIFF_SCALE` | `1` | Render scale for the images, 0.25 to 4. |
| `FIGCRAFT_VERSION` | empty | With images: the FigCraft release to render with, for example `0.18.1`. Empty means the newest. |
| `FIGDIFF_GITLAB_TOKEN` | none | The token that writes the note (see Setup). |

On self-managed GitLab nothing changes: the job uses `CI_API_V4_URL`, which points at your instance.

## HTML reports

Every compared file gets a self-contained HTML report in `figdiff-reports/`. The template keeps that folder as the job artifact for 30 days, and `expose_as` adds a **figdiff reports** link to the merge request page. The note also links to the job's artifacts.

## Pictures in the note

With `FIGDIFF_IMAGES: "true"`, the job downloads FigCraft's `figcraft-cli` from the official [FigCraft release](https://github.com/storytold/figcraft/releases) on GitHub, checks it against the release's `sha256sums.txt`, and renders the changed frames. The before, after and difference pictures are uploaded to the project (the same uploads GitLab uses for files attached to comments) and shown in a table in the note, and they are also in the HTML reports.

Things to know:

- The pictures are stored like files attached to a comment: GitLab keeps them after the merge request is closed, and every push adds a new set.
- The token needs to be allowed to upload files. If GitLab refuses, the note is still posted without pictures and the job log says why; try giving the token the **Developer** role.
- The runner needs to reach github.com to download `figcraft-cli`. If it cannot, or the checksum does not match, the job carries on without pictures.
- The release only has a Linux x86_64 build, so the job needs a Linux x86_64 runner (the template uses the `node:20` image).

## Behavior to know about

- New and deleted files are listed without a comparison. Renames are treated as a delete plus an add.
- A file that was saved again without any design change is mentioned briefly. If a later push removes every design change, the earlier note is replaced with a short message. The template's `rules: changes:` only runs the job when the merge request touches a `.figcraft` file; remove the `changes:` part if you want that message also when the last design file is taken out of a merge request.
- Merge requests from forks: GitLab runs the pipeline in the fork, where your CI/CD variables are not available, so no note is posted and the changes are printed in the job log. If you run fork pipelines in the parent project, the note is posted to the merge request as usual.
- If a file cannot be compared (for example it is not a valid `.figcraft` file), the note says so for that file and the others are still reported.
- Outside merge request pipelines the script does nothing.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "could not list the changed files" | The clone is shallow. Keep `GIT_DEPTH: "0"` on the job. |
| "FIGDIFF_GITLAB_TOKEN is not available" | The variable is missing, or it is protected and the branch is not. |
| "not allowed to comment (401)" or "(403)" | The token expired, lacks the api scope, or its role is below Reporter. |
| "could not load the figdiff package" | The `npm install` step did not run, or `FIGDIFF_HOME` differs between the two steps. |
| `npm error notarget` for the chosen version | The version does not exist, or was published a few minutes ago. Run the job again. |

## How it was tested

The script's logic is covered by figdiff's own tests against a stand-in for the GitLab API (creating and updating the note, forks, refused tokens, image uploads). The job itself has been run, without pictures, against a stand-in API, but not yet on gitlab.com or a self-managed instance. If something does not work on yours, please [open an issue](https://github.com/bintangyoga/figdiff/issues).
