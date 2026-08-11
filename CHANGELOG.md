# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project scaffold: manifest, esbuild build pipeline, TypeScript config.
- Isolated MathJax 4 engine (`@mathjax/src` 4.1.3) with TeX input and CHTML output.
- Render test view + command (`Latest MathJax: Open render test`).
- Version inspector comparing the bundled MathJax version with Obsidian's built-in one.
- Settings tab (engine info, TeX packages, performance, compatibility toggles).
- Reading View adapter: `$$…$$` display math in rendered notes is re-rendered by the bundled engine
  (`src/preview/MathPostProcessor.ts`), replacing only the formula's contents while keeping
  Obsidian's `.math-block` wrapper. Original TeX is recovered by re-parsing the section's raw
  markdown via `getSectionInfo`. Inline math is deferred to the next task.

### Changed

- `enableReadingView` now defaults to `true` and its settings toggle is enabled; the compatibility
  notice reflects that Reading View has shipped.
