# Build and release

## Development

Install dependencies, build the cheat bundle, then start the injector:

```sh
npm install
npm run build:cheats
npm run start
```

After changing injected code, rebuild and restart. For repeated edits, run `npm run watch:cheats` in another
terminal; restart the injector to use the rebuilt bundle. Edit the source, not generated `cheats.js`.

## Before submitting

Follow the checks in [CONTRIBUTING.md](../CONTRIBUTING.md).
Inspect [package.json](../package.json) for the current scripts and
[rollup.config.mjs](../rollup.config.mjs) for bundling details.

## Packaging

`npm ci` installs the packager ([`@yao-pkg/pkg`](https://github.com/yao-pkg/pkg), pinned in `package.json`).
The binaries run on the Node major in `.nvmrc`; a test fails if the build targets and `.nvmrc` disagree.

| Platform            | Command                     | Archive                             |
| ------------------- | --------------------------- | ----------------------------------- |
| Windows             | `npm run build`             | `InjectCheatsUI-Windows.zip`        |
| Linux               | `npm run build-unix`        | `InjectCheatsUI-Linux.tar.gz`       |
| macOS Intel         | `npm run build-macos-x64`   | `InjectCheatsUI-macOS-x64.tar.gz`   |
| macOS Apple Silicon | `npm run build-macos-arm64` | `InjectCheatsUI-macOS-arm64.tar.gz` |

`node scripts/release.mjs pack <archive>` puts the built binary, `cheats.js` and `config.js` into `release/` and
fails if the archive holds anything else. Those three files are the allowlist, and the updater installs exactly
them. A file users need beside the binary goes on the allowlist in [scripts/release.mjs](../scripts/release.mjs).

If startup reports a missing `cheats.js`, rebuild the bundle. For packaging failures, check the terminal
error against the packaging configuration in `package.json`.

## Releasing

1. In a pull request, set the new version with `npm version <version> --no-git-tag-version` (it updates
   `package.json` and `package-lock.json`), and merge it once the check is green.
2. Run **Build and Release** from `master` in the Actions tab. It runs the check, builds all four platforms,
   packs them, writes `SHA256SUMS`, and publishes the release, tagged with the version without a "v" (`3.0.0`).
   Tick **draft** to edit the notes first; publishing the draft then posts it.
3. The release is posted to #injector-updates through the `DISCORD_RELEASE_WEBHOOK` repository secret. Without
   the secret, the run notes that it skipped the post.

If one platform's build fails (GitHub sometimes has no Apple Silicon runner free), nothing is released; use
**Re-run failed jobs** on that run.

**Build Cross-Platform Binaries** builds the same files without releasing. Before a release, try its packaged
application on the target platform: check attachment, UI loading, and a command whose effect you understand.
