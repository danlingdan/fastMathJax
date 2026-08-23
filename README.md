# Latest MathJax for Obsidian

Use a bundled, up-to-date **MathJax 4** engine for math rendering in Obsidian — without touching
`window.MathJax` or Obsidian's built-in renderer.

> Status: **0.1.4 is the current released and runtime-verified build.** Typecheck, 36 automated
> tests, production build, isolated-vault desktop acceptance and PDF export from both editor modes
> pass.
> See [`docs/STATUS.md`](docs/STATUS.md) for the verification record and remaining surface limits.

## Why

Obsidian ships its own MathJax build, and it tends to lag behind upstream. That means new TeX
packages, new font handling, and upstream bug fixes are not available until Obsidian updates.
This plugin bundles its own MathJax 4 engine and renders math through it, side by side with the
built-in one.

## Installation

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the
[latest GitHub release](https://github.com/danlingdan/fastMathJax/releases/latest). Put all three
files in `<vault>/.obsidian/plugins/latest-mathjax/`, reload Obsidian, then enable **Latest
MathJax** under **Settings → Community plugins**.

## Design rules

1. **Never** `delete window.MathJax` or overwrite it.
2. **Never** monkey-patch `renderMath()` / `finishRenderMath()`.
3. The plugin's engine lives in its own module scope, fully isolated from Obsidian's.
4. Disabling the plugin restores Obsidian's default math rendering with no leftovers.

```text
                    Obsidian
                       |
             Markdown / CodeMirror
                       |
             +---------+---------+
             |                   |
      Obsidian MathJax    Latest MathJax Plugin
                                 |
                          MathJax 4 Renderer
                                 |
                    +------------+------------+
                    |                         |
              Live Preview              Reading View
```

## Features

- **Reading View** — `$$…$$` display math and `$…$` inline math re-rendered by the bundled engine
  (inline gated by `Inline math in Reading View`, default off).
- **Live Preview** — display and inline math taken over through Obsidian's mounted editor widgets;
  the raw source shows while your cursor is inside a formula (inline gated by
  `Inline math in Live Preview`, default off). Live Preview takeover itself is also opt-in on a
  fresh install.
- **TeX packages / macros / preamble** — toggle TeX packages and define a global preamble
  (`\newcommand`, `\DeclareMathOperator`, …) in settings; macros apply across every note.
- **Performance** — LRU formula cache + configurable render debounce for Live Preview.
- **Renderer choice** — CommonHTML (New Computer Modern webfont, loaded from jsDelivr by default)
  or SVG (glyph paths embedded inline, no font download required — fully offline).
- **Popout windows** — styled automatically (the engine copies its stylesheet into the popout
  document).
- **Version inspector** — compare the bundled MathJax against Obsidian's built-in one.

## Compatibility

| Surface | Supported | Notes |
| --- | --- | --- |
| Reading View | ✅ | TeX recovered from the section's source markdown |
| Live Preview | ✅ | public editor widgets + document-position mapping |
| Popout windows | ✅ | reuses the same adapters + per-document style copy |
| Hover Preview | ❌ (planned) | Obsidian does not expose the raw TeX for hover math |
| Canvas | ❌ (planned) | canvas cards bypass the markdown post-processor |

See [`docs/compatibility.md`](docs/compatibility.md) for the detail.

## Settings

- **Engine**: renderer (CHTML / SVG), scale, font file location (CHTML only), TeX packages,
  global preamble, assistive MathML.
- **Performance**: cache on/off + size, render debounce.
- **Compatibility**: toggles for Reading View (on by default), Live Preview (off by default),
  Popout support (on by default), and the disabled planned Hover / Canvas surfaces.

## Roadmap

The early `0.0.x` entries below are development milestones; `0.1.0` and later are published
releases. See [`CHANGELOG.md`](CHANGELOG.md) for release notes and
[`docs/STATUS.md`](docs/STATUS.md) for current verification details. Planned work from `0.1.x`
stabilization through `1.0.0` is tracked in the detailed [`future roadmap`](docs/ROADMAP.md).

| Version | Goal | Status |
| --- | --- | --- |
| 0.0.1 | MathJax 4 engine + test view + version inspector + Reading View `$$…$$` | ✅ development milestone |
| 0.0.2 | Reading View inline `$…$` (Task 6) | ✅ development milestone |
| 0.0.3 | Live Preview prototype (display math, Task 7) | ✅ development milestone |
| 0.0.4 | Full Live Preview (inline math, cursor editing) | ✅ development milestone |
| 0.0.5 | Cache, debounce, async render queue | ✅ development milestone |
| 0.0.6 | Global macros / preamble / packages | ✅ development milestone |
| 0.0.7 | Compatibility investigation | ✅ popout; hover/canvas remain unsupported |
| 0.0.8 | SVG renderer + font configuration | ✅ development milestone |
| 0.1.0 | First public release and in-app verification | ✅ released |
| 0.1.1 | Automated CI and tag-driven releases | ✅ released |
| 0.1.2 | Community-review fixes and provenance attestations | ✅ released |
| 0.1.3 | Reading View lifecycle and deterministic PDF export fixes | ✅ released |
| 0.1.4 | Settings compatibility and lifecycle stabilization | ✅ current release |

## Development

```bash
npm install     # install dependencies
npm run dev     # watch build
npm run build   # type-check + production build
npm test        # automated unit/integration tests
npm run check   # complete local release gate
```

To test inside a vault, symlink or copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/latest-mathjax/`.

## Releasing

Releases are built by GitHub Actions; do not upload generated assets manually. Prepare the next
version, update `CHANGELOG.md`, and run the complete gate. Then commit and push the resulting
version files. The release tag must be plain SemVer (for example, `0.1.3`, not `v0.1.3`):

```bash
npm version patch --no-git-tag-version
npm run check
git add package.json package-lock.json manifest.json versions.json CHANGELOG.md
VERSION=$(node -p "require('./package.json').version")
git commit -m "release: prepare ${VERSION}"
git push origin main
git tag -a "${VERSION}" -m "Latest MathJax ${VERSION}"
git push origin "${VERSION}"
```

The tag workflow verifies version consistency, installs from the lockfile, runs the complete check,
attests their build provenance, and publishes the three assets supported by the community directory:
`main.js`, `manifest.json`, and `styles.css`.

## Docs

- [`docs/STATUS.md`](docs/STATUS.md) — **what's done** (task/stage progress, verification, risks)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — **what's next** (priorities, releases, acceptance gates)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/obsidian-mathjax-research.md`](docs/obsidian-mathjax-research.md)
- [`docs/compatibility.md`](docs/compatibility.md)

## License

MIT — see [LICENSE](LICENSE).
MathJax itself is Apache-2.0 licensed.
