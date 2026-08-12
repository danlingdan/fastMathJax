# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.1] - unreleased (dev cycle)

> Pre-release. Reading View (originally planned for `v0.0.2`) landed in this cycle; version labels
> stay provisional until the first tagged release. See [`docs/STATUS.md`](docs/STATUS.md).

### Added

- **Task 1 — Scaffold:** manifest, esbuild + `tsc` pipeline, LICENSE, `.gitignore`, `.gitattributes`.
- **Task 2 — Engine:** isolated MathJax 4 engine (`@mathjax/src` 4.1.3) with TeX input + CHTML
  output + New Computer Modern font. All TeX packages statically registered; LRU cache keyed by
  FNV-1a hash; container-independent metrics.
- **Task 3 — Test view:** `Latest MathJax: Open render test` command + ItemView with built-in
  side-by-side comparison.
- **Task 4 — Version inspector:** bundled-vs-built-in MathJax version report in settings + a
  `Show version info` command.
- **Task 5 — Reading View:** `$$…$$` display math in rendered notes is re-rendered by the bundled
  engine (`src/preview/MathPostProcessor.ts`), replacing only the formula's contents while keeping
  Obsidian's `.math-block` wrapper. Original TeX is recovered by re-parsing the section's raw
  markdown via `getSectionInfo`.
- **Task 6 — Reading View inline:** `$…$` inline math is now also re-rendered in Reading View.
  `mathSource.findMathInSection` recovers block + inline TeX in strict document order (code fences
  stripped, `\$` escapes and stray single `$` ignored), and `MathPostProcessor` pairs each
  `.math.math-inline` node back to its `$…$` source. Gated behind a new
  `enableInlineReadingView` setting (default **off** — inline prose math is riskier to take over
  than isolated display blocks).
- **Task 7 — Live Preview:** math in the editor is now re-rendered by the bundled engine via a
  CodeMirror 6 `ViewPlugin` (`src/editor/LivePreviewRenderer.ts`). It uses `Decoration.replace` at
  `Prec.highest` over the syntax-tree math ranges and reads TeX directly from `state.sliceDoc`, so it
  never reverse-engineers a rendered node. Ranges overlapping the selection are skipped (Obsidian
  shows raw source while editing). `enableLivePreview` is on by default; inline `$…$` is gated behind
  `enableInlineLivePreview` (default **off**).
- **Stage 5 — Performance:** Live Preview rebuilds are debounced by the `Render debounce` setting
  (default 0 = immediate); rapid typing no longer re-renders on every keystroke. The LRU formula
  cache (`MathCache` + `renderCacheKey`) and async `renderAsync` path were already in place from
  earlier stages.
- **Stage 6 — TeX packages / macros / preamble:** user-facing control of the bundled engine. TeX
  packages are toggled in settings and wired to `MathJaxConfig.tex.packages`; a **Global preamble**
  editor defines `\newcommand` / `\DeclareMathOperator` macros (requires the NewCommand package),
  applied at engine start via `applyPreamble`. Renderer (CHTML), scale, font URL and assistive-mml
  options are also user-facing. Changing any of these rebuilds the engine (`updateConfig` +
  `needsRebuild`) and clears the formula cache; Live Preview refreshes immediately on preamble save.
- **Stage 7 — Compatibility (Hover / Popout / Canvas):** a `CompatibilityManager`
  (`src/compatibility/CompatibilityManager.ts`) now owns the surface-agnostic glue. Key fix:
  `MathJaxEngine.ensureStyles(targetDoc)` copies the CHTML stylesheet into a non-host document, so
  **popout windows** render styled math (they reuse the same Reading View / Live Preview adapters).
  **Hover Preview and Canvas are intentionally out of scope for v0.1.0** — Obsidian does not expose
  the raw TeX for hover math and canvas cards bypass the markdown post-processor, so there is no
  reliable hook to recover the source; both remain as disabled, "planned" toggles.
- **v0.0.8 — SVG renderer + font configuration:** `MathJaxConfig.renderer` is now `"chtml" | "svg"`.
  Selecting SVG uses MathJax 4's `SVG` output, which embeds glyph path data inline (`DefaultFont`)
  and needs **no webfont download** — fully offline-capable. The Font-URL field is disabled in the UI
  when SVG is selected. CHTML keeps New Computer Modern + `fontURL`. Switching the renderer rebuilds
  the engine (`needsRebuild` keys on `renderer`); cache and font caches are cleared on teardown.
- Settings tab: engine info, TeX packages, performance, compatibility toggles.

### Changed

- `enableReadingView` now defaults to `true` and its settings toggle is enabled; the compatibility
  notice reflects that Reading View has shipped.
