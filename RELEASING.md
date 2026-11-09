# Releasing figdiff

Releases are published to npm by GitHub Actions when a version tag is pushed. This file is for maintainers.

## One-time setup

1. **Check the package name.** Run `npm view figdiff`. If it says `E404`, the name is free. If a package exists, either pick another name or use a scoped name such as `@your-username/figdiff` by changing `name` in `package.json` (scoped packages publish with `--access public`, which the workflow already sets).
2. **Create an npm account** at npmjs.com and enable two-factor authentication.
3. **Create an access token.** On npmjs.com: profile picture → Access Tokens → Generate New Token → *Granular Access Token*. Give it permission to publish packages (Read and write). For the very first publish, the token cannot be limited to one package because the package does not exist yet, so choose all packages, then restrict it to `figdiff` afterwards.
4. **Add the token to GitHub.** Repository → Settings → Secrets and variables → Actions → New repository secret. Name it `NPM_TOKEN`.

## Publishing a version

1. Update `version` in `package.json` and add notes to `CHANGELOG.md`.
2. Commit and push to `main`, and wait for CI to pass.
3. Create and push a tag that matches the version exactly, with a leading `v`:

   ```sh
   git tag v0.1.0-alpha.0
   git push origin v0.1.0-alpha.0
   ```

4. Watch the **Release** run in the Actions tab. It checks that the tag matches `package.json`, runs typecheck, tests and build, publishes to npm with provenance, and creates a GitHub release.

## Dist-tags

- A version with a hyphen (for example `0.1.0-alpha.0`) is published under the tag taken from its identifier (`alpha`), so `npx figdiff@alpha` installs it.
- A plain version (for example `0.1.0`) is published as `latest`, which is what `npx figdiff` installs.
- After the first alpha, `latest` may be unset. To make `npx figdiff` work before a stable release, run:

  ```sh
  npm dist-tag add figdiff@0.1.0-alpha.0 latest
  ```

## If something goes wrong

- **403 or "need auth":** the `NPM_TOKEN` secret is missing, expired, or lacks publish permission.
- **"Tag does not match package.json":** fix the version, delete the tag (`git tag -d v… && git push origin :refs/tags/v…`), and tag again.
- **A bad version was published:** within 72 hours you can `npm unpublish figdiff@<version>`. Otherwise publish a fixed version and run `npm deprecate figdiff@<version> "reason"`. Versions cannot be reused.
