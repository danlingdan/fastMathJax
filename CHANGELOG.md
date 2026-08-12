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
- Settings tab: engine info, TeX packages, performance, compatibility toggles.

### Changed

- `enableReadingView` now defaults to `true` and its settings toggle is enabled; the compatibility
  notice reflects that Reading View has shipped.
