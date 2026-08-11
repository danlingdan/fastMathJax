# Latest MathJax for Obsidian

Use a bundled, up-to-date **MathJax 4** engine for math rendering in Obsidian — without touching
`window.MathJax` or Obsidian's built-in renderer.

> Status: **early development** (`v0.0.1`, Stage 1–2)

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

## Roadmap

| Version | Goal |
| --- | --- |
| v0.0.1 | MathJax 4 engine + test view + version inspector |
| v0.0.2 | Reading View (post processor) |
| v0.0.3 | Live Preview prototype (display math) |
| v0.0.4 | Full Live Preview (inline math, cursor editing) |
| v0.0.5 | Cache, debounce, async render queue |
| v0.0.6 | Global macros / preamble / packages |
| v0.0.7 | Hover preview, popout, canvas |
| v0.0.8 | SVG renderer + font configuration |
| v0.1.0 | First public release |

## Development

```bash
npm install     # install dependencies
npm run dev     # watch build
npm run build   # type-check + production build
```

To test inside a vault, symlink or copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/latest-mathjax/`.

## Docs

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/obsidian-mathjax-research.md`](docs/obsidian-mathjax-research.md)
- [`docs/compatibility.md`](docs/compatibility.md)

## License

MIT — see [LICENSE](LICENSE).
MathJax itself is Apache-2.0 licensed.
