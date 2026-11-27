# Releasing figdiff

Releases are published to npm by GitHub Actions when a version tag is pushed. This file is for maintainers.

## One-time setup

1. **Check the package name.** Run `npm view figdiff`. If it says `E404`, the name is free. If a package exists, either pick another name or use a scoped name such as `@your-username/figdiff` by changing `name` in `package.json` (scoped packages publish with `--access public`, which the workflow already sets).
2. **Create an npm account** at npmjs.com and enable two-factor authentication.
3. **Connect npm to this repository (trusted publishing).** On npmjs.com, open the `figdiff` package → *Settings* → *Trusted Publisher* → *GitHub Actions*, and fill in: organization or user `bintangyoga`, repository `figdiff`, workflow filename `release.yml`, environment left empty. Save. The Release workflow then signs in to npm with a short-lived GitHub identity on each run, so there is no npm token to create, store or renew.
4. **Optional clean-up.** Once a release has published this way, you can delete the old `NPM_TOKEN` repository secret and its token on npmjs.com, and under the package's *Settings* → *Publishing access* choose to disallow tokens.

A brand-new package name cannot have a trusted publisher until it exists on npm, so its very first version has to be published once by hand or with a token.

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

- **404 or 403 on publish** (`PUT https://registry.npmjs.org/figdiff - Not found`): npm did not accept the run's identity. Check that the trusted publisher on npmjs.com names `bintangyoga/figdiff` and `release.yml` exactly, and that the workflow still has `id-token: write`.
- **"Tag does not match package.json":** fix the version, delete the tag (`git tag -d v… && git push origin :refs/tags/v…`), and tag again.
- **A bad version was published:** within 72 hours you can `npm unpublish figdiff@<version>`. Otherwise publish a fixed version and run `npm deprecate figdiff@<version> "reason"`. Versions cannot be reused.
