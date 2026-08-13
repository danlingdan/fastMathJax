# Project status

Latest MathJax `0.1.3` is feature-complete for its declared first-release scope and has been tested in a real Obsidian desktop runtime. It is marked desktop-only until a separate mobile acceptance pass is completed.

## Completed

- Isolated MathJax `4.1.3` engine; Obsidian's global MathJax is never replaced or patched.
- CommonHTML and SVG output using bundled New Computer Modern glyph chunks.
- Reading View display and inline rendering.
- Live Preview display and inline rendering using Obsidian's mounted math widgets and CodeMirror document positions.
- Deterministic PDF export from either editor mode using an isolated SVG print renderer.
- Global TeX packages, preamble/macros, cache, debounce, scale, fallback modes and popout-document styling.
- Settings normalization and immediate refresh of affected surfaces.
- Version inspector, render test view and release metadata validation.

Hover Preview and Canvas remain explicitly unsupported because those surfaces do not expose a reliable public raw-TeX hook. Their settings are disabled and labelled as planned; they are not part of the initial release scope. Reading View is enabled by default; Live Preview is supported but opt-in on a fresh install.

## Verification (2026-08-14)

| Gate | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Unit/integration suite | 32/32 passed across 6 files |
| Production build | Passed |
| Release metadata validation | Passed (`manifest.json`, `package.json`, bundle banner) |
| Dependency audit | 0 known vulnerabilities |
| Obsidian desktop acceptance | Passed on Obsidian 1.13.7 in an isolated vault |
| PDF export acceptance | Live Preview and Reading View produced visually identical one-page output |

The runtime acceptance covered Reading View and Live Preview, inline/display formulas, a global `\\R` macro, New Computer Modern dynamic glyphs (`\\mathbb`, `\\mathcal`), matrices, extensible arrows, fenced/inline code exclusion, failure fallback, plugin reload and captured runtime errors. PDF acceptance additionally verified both source modes after a cold plugin reload: `\\R` exported as `ℝ`, currency text remained literal, all valid formulas remained visible, and an invalid expression degraded to readable source. No fresh runtime errors were captured.

## Release artifacts

Install these three generated files under `.obsidian/plugins/latest-mathjax/`:

- `main.js`
- `manifest.json`
- `styles.css`

`main.js` is intentionally large (about 12 MB) because all CommonHTML and SVG New Computer Modern glyph chunks are bundled. SVG is self-contained and offline-safe. CommonHTML bundles metrics and code but loads its configured New Computer Modern webfonts from jsDelivr by default. Run `npm run check` before distribution.
