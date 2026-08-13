# Project status

Latest MathJax `0.1.1` is feature-complete for its declared first-release scope and has been tested in a real Obsidian desktop runtime. It is marked desktop-only until a separate mobile acceptance pass is completed.

## Completed

- Isolated MathJax `4.1.3` engine; Obsidian's global MathJax is never replaced or patched.
- CommonHTML and SVG output using bundled New Computer Modern glyph chunks.
- Reading View display and inline rendering.
- Live Preview display and inline rendering using Obsidian's mounted math widgets and CodeMirror document positions.
- Global TeX packages, preamble/macros, cache, debounce, scale, fallback modes and popout-document styling.
- Settings normalization and immediate refresh of affected surfaces.
- Version inspector, render test view and release metadata validation.

Hover Preview and Canvas remain explicitly unsupported because those surfaces do not expose a reliable public raw-TeX hook. Their settings are disabled and labelled as planned; they are not part of the `0.1.0` release scope.

## Verification (2026-08-13)

| Gate | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Unit/integration suite | 27/27 passed across 5 files |
| Production build | Passed |
| Release metadata validation | Passed (`manifest.json`, `package.json`, bundle banner) |
| Dependency audit | 0 known vulnerabilities |
| Obsidian desktop acceptance | Passed on Obsidian 1.13.6 in an isolated vault |

The runtime acceptance covered Reading View and Live Preview, inline/display formulas, a global `\\R` macro, New Computer Modern dynamic glyphs (`\\mathbb`, `\\mathcal`), matrices, extensible arrows, fenced/inline code exclusion, failure fallback, plugin reload and captured runtime errors. Five valid expressions were taken over in each surface; the intentionally invalid expression remained on Obsidian's renderer. No fresh runtime errors were captured.

## Release artifacts

Install these three generated files under `.obsidian/plugins/latest-mathjax/`:

- `main.js`
- `manifest.json`
- `styles.css`

`main.js` is intentionally large (about 12 MB) because all CommonHTML and SVG New Computer Modern glyph chunks are bundled for deterministic, offline-safe rendering. Run `npm run check` before distribution.
