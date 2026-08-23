# Project status

Latest MathJax `0.1.5` is released and runtime-verified. It remains desktop-only until a separate
mobile acceptance pass is completed.

## Completed

- Isolated MathJax `4.1.3` engine; Obsidian's global MathJax is never replaced or patched.
- CommonHTML and SVG output using bundled New Computer Modern glyph chunks.
- Reading View display and inline rendering.
- Live Preview display and inline rendering using Obsidian's mounted math widgets and CodeMirror document positions.
- Deterministic PDF export from either editor mode using an isolated SVG print renderer.
- Global TeX packages, preamble/macros, cache, debounce, scale, fallback modes and popout-document styling.
- Settings normalization and immediate refresh of affected surfaces.
- Searchable declarative settings on Obsidian 1.13+ with the imperative tab retained for 1.8–1.12.
- Revision-aware Live Preview teardown that cannot overwrite output mounted by a newer renderer.
- Version inspector, render test view and release metadata validation.

Hover Preview and Canvas remain explicitly unsupported because those surfaces do not expose a reliable public raw-TeX hook. Their settings are disabled and labelled as planned; they are not part of the initial release scope. Reading View is enabled by default; Live Preview is supported but opt-in on a fresh install.

## Verification (2026-08-24 release)

| Gate | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Unit/integration suite | 38/38 passed across 9 files for 0.1.5 |
| Production build | Passed |
| Release metadata validation | Passed (`manifest.json`, `package.json`, bundle banner) |
| Dependency audit | 0 known vulnerabilities |
| Obsidian desktop acceptance | Passed on Obsidian 1.13.7: settings API capability checks, live CommonHTML/SVG state refresh, cache refresh, and the full 0.1.4 rendering matrix |
| PDF export acceptance | Passed from Live Preview and Reading View; rendered pages were pixel-identical and visually complete |

The 0.1.3 runtime acceptance covered Reading View and Live Preview, inline/display formulas, a
global `\\R` macro, New Computer Modern dynamic glyphs (`\\mathbb`, `\\mathcal`), matrices,
extensible arrows, fenced/inline code exclusion, failure fallback, plugin reload and captured
runtime errors. Its PDF pass additionally verified both source modes after a cold plugin reload.
Those results remain historical evidence; the 0.1.4 runtime pass repeated the applicable surfaces.

The 0.1.4 pass additionally verified the declarative settings surface, live renderer
switching, reversible plugin disable/re-enable, and Reading View preservation of `$5`, `$6`, and a
later `$x^2$` formula. A full disable/re-enable cold-loaded the final CSS and confirmed readable
CommonHTML output for the global macro, integral, matrix, extensible arrow and dynamic New CM
glyphs. The runtime console contained only the fixture's intentional invalid-command fallback;
the earlier dynamic-font `getChar` recursion did not recur.

The 0.1.5 patch pass retained the Obsidian 1.8 compatibility floor while capability-checking the
settings refresh methods introduced in Obsidian 1.13. On Obsidian 1.13.7, switching from CommonHTML
to SVG disabled the font location control, switching back restored it, and clearing the formula
cache refreshed its statistics from five entries to zero without destabilizing the settings page.

PDF export was repeated from both Live Preview and Reading View after the final cold startup. Both
single-page outputs preserved macros, currency text, display math, matrices, extensible arrows,
code exclusion and readable raw fallback. Poppler-rendered page PNGs were pixel-identical.

## Release artifacts

Install these three generated files under `.obsidian/plugins/latest-mathjax/`:

- `main.js`
- `manifest.json`
- `styles.css`

`main.js` is intentionally large (about 12 MB) because all CommonHTML and SVG New Computer Modern glyph chunks are bundled. SVG is self-contained and offline-safe. CommonHTML bundles metrics and code but loads its configured New Computer Modern webfonts from jsDelivr by default. Run `npm run check` before distribution.
