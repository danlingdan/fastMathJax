# Project status

Latest MathJax `0.3.0` is released, desktop-accepted and runtime-verified. It remains
desktop-only until a separate mobile acceptance pass is completed.

## 0.2.0 — preamble workflow (released 2026-09-06)

The vault-based preamble workflow is desktop-accepted in a real Obsidian 1.13.7 vault. Automated
gates at release: typecheck, 80/80 tests across 13 files, lint, production build and release
metadata validation all pass. What shipped:

- Optional vault-relative **preamble file** setting; file TeX is evaluated before the inline
  settings preamble (deterministic, tested merge order) and re-read automatically after vault
  edits via a debounced watcher (create/modify/delete/rename).
- **Create preamble file**, **Open preamble file** and **Reload preamble** commands.
- Source-attributed preamble diagnostics: TeX parse failures name the file or the settings
  preamble they came from; missing files, folder targets and absolute paths fail visibly without
  breaking rendering.
- Explicit lifecycle cleanup of watchers, timers and listeners on unload.
- Reading View now waits, bounded, for Obsidian's asynchronous math finalization (`is-loaded`)
  before taking over a formula. This fixes a 0.1.x race where Obsidian's completion callback ran
  over the plugin's mounted output on cold starts and replaced formulas with error blocks.
- Currency-like dollar text is preserved in Reading View and PDF export on Obsidian 1.13: the
  paragraph-repair locator anchors its suffix outside code spans (the 0.1.x locator anchored at
  the block's literal last `$`, so a trailing code span made the match unsatisfiable and the
  repair silently never ran), and sections Obsidian may have mis-paired keep their inline math
  from being replaced wholesale.
- PDF export re-renders inline math per source block (blank-line separated, located by paragraph
  text, paired 1:1 inside a staging re-render). A currency paragraph can no longer suppress the
  bundled engine for every inline formula in the export: each block pairs independently, and a
  block that cannot be located or paired keeps Obsidian's output alone.
- Render errors carry the real MathJax message instead of `[object Object]`.

Desktop acceptance (2026-09-05, Obsidian 1.13.7, isolated vault, cold start with cold font
cache): settings path persists; Reload reports a visible missing-file failure without touching
rendering; Create builds the folder and a commented template file and opens it; editing the file
in an external editor reloads once per burst and re-renders the new macro (`\XX` → 𝒳) in both
Reading View and Live Preview; an invalid TeX line in the file reports the failing segment while
definitions parsed before it keep working; after a full restart the file macros render from the
first paint; PDF export from Reading View embeds the file-backed macro via the isolated SVG
print engine — including inline formulas (`2\XX` → 2𝒳) in a note that also mixes currency
paragraphs with a code span; and such a paragraph keeps every dollar literal with its math
rendered in both Reading View and the exported PDF.

Release: tag `0.2.0` built and published by GitHub Actions with provenance attestation.

## 0.3.0 — rendering resilience and performance (released 2026-09-07)

All roadmap items for 0.3.0 shipped, covered by the automated gates (112 tests across 17 files,
lint, typecheck, production build, release metadata validation) and desktop-accepted on Obsidian
1.13.7.

Rendering isolation (headline fix): formulas could render with broken layout (misplaced radical
bars, floating glyph fragments, double-drawn math) because the plugin's MathJax 4 and Obsidian's
built-in MathJax emit the same `mjx-*` tag vocabulary with different typesetting CSS, and the
host's stylesheet loads after the plugin's. The bundled engine now isolates its output —
rendered containers are rewritten into a private `latest-mjx-*` tag namespace
(`src/engine/outputIsolation.ts`) and the engine's stylesheet selectors are rewritten to key on
the plugin's own engine marker — so the two engines' CSS can never cross-apply, in either
direction. The release also fixes a 0.2.0 defect: switching the preamble file setting evaluated
the previous file's cached content until the next reload; `saveSettings` now re-reads the file
when the configured path changed before rebuilding the engine, and a preamble content change
invalidates the lazily created PDF export engine.

Benchmark baseline (PERF-01, PERF-02): `npm run bench:generate` deterministically writes 100-
and 500-formula notes covering unique and repeated inline/display formulas, preamble-file
macros, intentional invalid input and a math-free typing anchor, with fixture tests pinning
composition and determinism. The `benchmarks/tools/measure-console.js` DevTools harness recorded
cold/warm open, scroll-through, typing and view-switch latencies in a real Obsidian 1.13.7 vault
(warm n=10, cold n=3 restarts per note size). Key results: typing and view-switch latency are
document-size-independent; warm open cost scales with document length (668 ms at 100 formulas
vs 1725 ms at 500) even though both mount the same 35-formula viewport, making the per-open
pipeline the first optimization target; cold cache adds ~180 ms to the initial viewport but
~50% to whole-note scroll-through. Machine profile, full tables and analysis are in
[`docs/benchmarks.md`](benchmarks.md).

Resilience hardening (PERF-03, PERF-04): Reading View runs abort when their section is detached
mid-await, staging repairs stop on stale sections, detached wrappers are skipped and PDF export
aborts when the print document is discarded — pinned by new post-processor integration tests.
The Live Preview mutation filter is extracted to `src/editor/observerFilter.ts` with tests
pinning that the plugin's own mutations never reschedule a render pass, the settle wait only
observes `class`, and the settings refresh path has no recursion into settings or file writes.

Structural surfaces and diagnostics (PERF-05, SURF-01, SURF-02, TEST-01): cache statistics
(entries/hits/misses/hit rate/session renders) are exposed in settings and the render-test view
without debug logging; clearing the cache resets counters while size-only reconfiguration
preserves them. `benchmarks/fixtures/surface-contexts.md` exercises math in callouts, tables,
lists, blockquotes, footnotes and embeds — desktop-verified on Obsidian 1.13.7 in both views:
callout, table, list and footnote math render from unambiguous source, currency and code spans
stay literal, blockquote display math (where Obsidian shows its own quote-marker artifact) and
embeds are deliberately left to Obsidian, and no context shifted pairing. Count-mismatch
fail-closed behavior is pinned independently for inline and display math. The clean-vault
acceptance procedure is documented in [`docs/smoke-testing.md`](smoke-testing.md).

Release: tag `0.3.0` built and published by GitHub Actions with provenance attestation.

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
