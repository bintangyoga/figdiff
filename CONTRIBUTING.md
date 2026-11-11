# Contributing to figdiff

Thanks for your interest! figdiff is in alpha. Code, tests, documentation, ideas and sample files are all welcome.

## Ways to help today

- **Share your use case.** Open an issue describing how you use FigCraft and Git, and what you would want from a design diff.
- **Review the roadmap.** If a phase, deliverable, or risk looks wrong, open an issue or a pull request against `README.md`.
- **Provide sample files.** Before/after pairs of `.figcraft` files help us test. Only share files you have the right to share, and prefer small, simple designs.
- **Document the format.** Notes about the structure of `document.json` go in `docs/format-notes.md`.
- **Test with your own files.** Does a design saved twice keep the same node ids? Tell us in an issue.

## Reporting issues

Please include:

- What you expected and what you saw
- Your FigCraft version
- A minimal sample file, if you can share one

## Pull requests

1. Open an issue first for anything larger than a small fix, so we can agree on the approach.
2. Keep pull requests focused: one change per pull request.
3. Write clear commit messages in the imperative mood ("Add parser for fills").
4. Add or update tests when code changes.
5. Update the README or docs when behavior changes.

## Code style

TypeScript (ESM, Node 20 or later), strict mode. Keep functions small and pure where you can: `run()` in `src/run.ts` returns what to print and write instead of doing it, which keeps the tests simple.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

The layout: `src/parser` reads `.figcraft` files, `src/diff` compares trees, `src/report.ts` and `src/html.ts` format the result, `src/render` talks to `figcraft-cli`, and `src/action` is the GitHub Action. CI runs typecheck, tests and build on Node 20 and 22.

Run `npm run lint` before you open a pull request. `npm run format` applies Prettier to the code; it is not enforced in CI yet.

## Website

The site lives in `site/` and is built without a bundler. `npm run build:site` compiles the library, copies the browser build, generates the docs pages from `docs/*.md` and writes everything to `site/dist`. `npm run check:site` verifies links, anchors and the sample comparison. `npm run preview:site` serves it locally. To deploy on Cloudflare, use the build command `npm install && npm run build:site`. With Workers, the deploy command is `npx wrangler deploy` (configured by `wrangler.jsonc`, which serves `site/dist`); with Pages, set the output directory to `site/dist`. Set `SITE_URL` to the public address.

## Conduct

Be kind and respectful. Assume good intent, give constructive feedback, and welcome newcomers. Harassment and personal attacks are not tolerated.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
