# Latest MathJax for Obsidian

Use a bundled, up-to-date **MathJax 4** engine for math rendering in Obsidian — without touching
`window.MathJax` or Obsidian's built-in renderer.

> Status: **development complete, runtime-unverified.** Every planned feature is implemented
> (Reading View, Live Preview, inline + display math, TeX packages / macros / preamble, performance
> tuning, a SVG renderer, and a compatibility layer). What has **not** been done is dropping the
> built `main.js` into a real vault and confirming it renders — that requires an Obsidian runtime.
> See [`docs/STATUS.md`](docs/STATUS.md) for the precise verification gap.

## Why

Obsidian ships its own MathJax build, and it tends to lag behind upstream. That means new TeX
packages, new font handling, and upstream bug fixes are not available until Obsidian updates.
This plugin bundles its own MathJax 4 engine and renders math through it, side by side with the
built-in one.

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
- **Live Preview** — display and inline math taken over in the editor via a CodeMirror 6 decoration;
  the raw source shows while your cursor is inside a formula (inline gated by
  `Inline math in Live Preview`, default off).
- **TeX packages / macros / preamble** — toggle TeX packages and define a global preamble
  (`\newcommand`, `\DeclareMathOperator`, …) in settings; macros apply across every note.
- **Performance** — LRU formula cache + configurable render debounce for Live Preview.
- **Renderer choice** — CommonHTML (New Computer Modern webfont) or SVG (glyph paths embedded
  inline, no font download required — fully offline).
- **Popout windows** — styled automatically (the engine copies its stylesheet into the popout
  document).
- **Version inspector** — compare the bundled MathJax against Obsidian's built-in one.

## Compatibility

| Surface | Supported | Notes |
| --- | --- | --- |
| Reading View | ✅ | TeX recovered from the section's source markdown |
| Live Preview | ✅ | syntax-tree ranges; cursor-overlap shows raw source |
| Popout windows | ✅ | reuses the same adapters + per-document style copy |
| Hover Preview | ❌ (planned) | Obsidian does not expose the raw TeX for hover math |
| Canvas | ❌ (planned) | canvas cards bypass the markdown post-processor |

See [`docs/compatibility.md`](docs/compatibility.md) for the detail.

## Settings

- **Engine**: renderer (CHTML / SVG), scale, font file location (CHTML only), TeX packages,
  global preamble, assistive MathML.
- **Performance**: cache on/off + size, render debounce.
- **Compatibility**: toggles for Reading View, Live Preview, Popout (on by default), and the planned
  Hover / Canvas surfaces.

## Roadmap

> Version labels are provisional until the first tagged release. See
> [`docs/STATUS.md`](docs/STATUS.md) for the authoritative task/stage progress.

| Version | Goal | Status |
| --- | --- | --- |
| v0.0.1 | MathJax 4 engine + test view + version inspector + Reading View `$$…$$` | ✅ |
| v0.0.2 | Reading View inline `$…$` (Task 6) | ✅ |
| v0.0.3 | Live Preview prototype (display math, Task 7) | ✅ |
| v0.0.4 | Full Live Preview (inline math, cursor editing) | ✅ |
| v0.0.5 | Cache, debounce, async render queue | ✅ |
| v0.0.6 | Global macros / preamble / packages | ✅ |
| v0.0.7 | Hover preview, popout, canvas | ⚠️ popout only (hover/canvas out of scope) |
| v0.0.8 | SVG renderer + font configuration | ✅ |
| v0.1.0 | First release (pending in-app verification) | 🚧 |

## Development

```bash
npm install     # install dependencies
npm run dev     # watch build
npm run build   # type-check + production build
```

To test inside a vault, symlink or copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/latest-mathjax/`.

## Docs

- [`docs/STATUS.md`](docs/STATUS.md) — **what's done** (task/stage progress, verification, risks)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/obsidian-mathjax-research.md`](docs/obsidian-mathjax-research.md)
- [`docs/compatibility.md`](docs/compatibility.md)

## License

MIT — see [LICENSE](LICENSE).
MathJax itself is Apache-2.0 licensed.
