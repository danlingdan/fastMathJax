# Changelog

All notable changes to this project are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 1.0.0 - 2026-09-08

- Added an experimental **invasive mode** (off by default, INV-01…07): after a mandatory
  confirmation dialog listing benefits and risks, the plugin patches exactly two internal
  entry points of Obsidian's native MathJax (`tex2chtml`, `chtmlStylesheet`) so *every*
  rendering surface — including hover previews and embeds, which the default mode cannot
  reach — renders with the bundled MathJax 4.1.3 engine. The patch is feature-gated at
  runtime (an Obsidian update that removes either entry point triggers a notice and an
  automatic fail-closed revert to the default mode), the original members are restored
  byte-for-byte on disable/uninstall, and formulas the plugin rendered are handed back to
  Obsidian's own renderer with their stamped TeX. Nothing else on `window.MathJax` is
  touched, so plugins that depend on native MathJax keep working.
- Invasive-mode style delivery hardened for popouts: the engine's persistent stylesheet keeps
  its text in sync with the live CSSOM (adaptive glyph rules are inserted through the CSSOM
  after mount, and text-based cross-document copies previously missed them), popout layout
  changes and invasive renders re-mirror stylesheets into every open document, and local
  font URLs are rewritten to the CDN in popout documents — popouts live at a null origin and
  cannot fetch `app://` font resources, which previously left letters invisible there.
- Degrade hardening: a failed invasive activation now tears the bridge down completely
  (no setter trap left redirecting `window.MathJax`) and preserves any partial native
  MathJax object across trap arm/drop cycles.
- New **Rendering mode** settings group (both the 1.13 declarative tab and the 1.8–1.12
  classic tab), sharing one confirmation flow; per-surface toggles show "Managed by
  invasive mode" while it is active.
- Settings semantics frozen and documented in `docs/settings.md` (API-01); compatibility
  matrix rewritten for dual-mode operation (`docs/compatibility.md`, DOC-02); dual-mode
  benchmark evidence recorded in `docs/benchmarks.md` (open cost −16–18 % in invasive
  mode, typing and view-switch at parity).

## 0.5.0 - 2026-09-07

- Added an opt-in **local font cache** for CommonHTML output (FONT-01, designed in
  `docs/offline-fonts.md`): a new **Font source** setting downloads the woff2 set referenced by
  the engine's stylesheet (105 New Computer Modern files, ≈1.8 MB for font version 4.1.3) once
  into the plugin folder and serves it through Obsidian's resource protocol, so CHTML formulas
  keep full glyph shapes offline. Files are fetched only from the version-pinned CDN source
  (never from user input), integrity-checked by the `wOF2` magic bytes, recorded in a per-version
  manifest, and re-downloaded into a fresh version directory when the bundled font version
  changes — superseded versions are cleaned up. CDN remains the default; the custom font
  location setting keeps working in CDN mode. A **Download fonts for offline use** command
  primes or repairs the cache on demand. SVG output never downloads fonts, now pinned by a test
  that fails if the SVG stylesheet references anything but inline data-URI fonts (FONT-02).

## 0.4.0 - 2026-09-07

- Fixed Live Preview formulas going stale after any settings change that rebuilds the engine
  (Assistive MathML, renderer, packages, preamble): the render pass skipped wrappers by matching
  the bundled MathJax version string, which survives rebuilds, so output from the superseded
  engine stayed mounted under the new engine's stylesheet — flattened matrices, overlapping
  arrow labels, missing glyph spacing. Rendered output now carries the producing engine revision
  and the Live Preview skip predicate matches version + revision; the mutation-observer
  predicate deliberately keeps version-only matching, so the plugin's own replacements still
  suppress rescheduling (0.3.0 PERF-04 semantics unchanged).
- Fixed the engine stylesheet accumulating in the document head: MathJax regenerates its style
  element on every refresh and the engine appended the new one without removing the previous,
  so sheets piled up with every batched flush — and after an engine rebuild a stale thin sheet
  (written before any formula was rendered, missing glyph, table and spacing rules) could win
  the CSS cascade and break rebuilt formulas' layout. The newest sheet now replaces the
  previous one.
- Fixed stylesheet updates starving while the Obsidian window is occluded or unfocused:
  Electron pauses `requestAnimationFrame` for such windows, so formulas rendered after a
  rebuild kept the thin startup stylesheet until the window was focused again. A timer
  fallback now guarantees the flush lands within about 200 ms regardless of window state.
- Completed the 0.4.0 compatibility and accessibility scope. Assistive MathML is pinned by
  tests to appear only when enabled, exactly once per formula (including cache clones), with
  the visually-hidden clipping rules verified in both renderers (A11Y-01). The core rendering
  paths — render/cache cloning, TeX parse errors, preamble macros, popout adoption — are
  covered for CHTML and SVG alike, and the matrix passed desktop acceptance on Obsidian 1.13.7
  across Reading View, Live Preview, fallback and toggle behavior (COMP-01). Keyboard and
  screen-reader expectations, verified environments and known limitations are documented in
  `docs/accessibility.md` (A11Y-02). Hover Preview and Canvas were re-evaluated against the
  Obsidian 1.13.1 public API and remain unsupported: canvas exposes no public rendering API at
  all, and hover previews, while reachable through documented fields, would add a third
  whole-note rendering path whose transient popover lifecycle cannot yet be bounded as tightly
  as the PDF export path (COMP-02). `isDesktopOnly` is now guarded by a test to stay `true`
  until a real device pass records the mobile acceptance matrix, and the desktop-side mobile
  feasibility analysis plus the Android/iOS device protocol are documented in
  `docs/mobile-spike.md` (MOB-01 desktop side, MOB-02).

## 0.3.0 - 2026-09-07

- Fixed formulas rendering with broken layout (misplaced radical bars, floating glyph fragments,
  double-drawn math) when Obsidian's built-in MathJax stylesheet loads after the plugin's: both
  engines emit the same `mjx-*` tag vocabulary with different typesetting CSS, so the host's
  rules could apply to the plugin's output. The bundled engine now isolates its output —
  rendered containers are rewritten into a private `latest-mjx-*` tag namespace and the engine's
  stylesheet selectors are rewritten to key on the plugin's own engine marker — so the two
  engines' CSS can never cross-apply, in either direction.
- Completed the 0.3.0 roadmap scope: cache statistics (entries, hits, misses, hit rate, session
  renders) are exposed in settings and the render-test view without debug logging, with correct
  reset semantics on clear and output-affecting reconfiguration (PERF-05); structural-context
  fixtures cover math in callouts, tables, lists, blockquotes, footnotes and embeds and were
  desktop-verified on Obsidian 1.13.7 with pairing intact everywhere (SURF-01); count-mismatch
  fail-closed behavior is pinned independently for inline and display math (SURF-02); and
  `docs/smoke-testing.md` documents the repeatable clean-vault acceptance procedure using
  checked-in fixtures only (TEST-01).
- Reviewed observer and refresh scope for recursive-refresh safety (ROADMAP PERF-04). The Live
  Preview mutation filter now lives in `src/editor/observerFilter.ts` with tests pinning that the
  plugin's own replacement mutations and wrappers Obsidian recreated around preserved engine
  output never reschedule a render pass, while fresh math still does; the math settle wait only
  observes the `class` attribute, so takeover attribute writes can neither resolve nor prolong
  it. Scheduling remains a single replaced timer plus one animation frame, cancelled on destroy,
  and the settings refresh path is bounded by open leaves with no recursion into settings or
  file writes.
- Bounded and cancelled stale asynchronous render work in Reading View and PDF export (ROADMAP
  PERF-03): a run whose section was replaced by Obsidian mid-await now aborts instead of
  rendering into a detached tree, per-paragraph staging repairs stop once the section goes
  stale, wrappers detached since collection are skipped, and a discarded print document ends the
  PDF block loop. Rapid edits therefore converge to the newest document state without burning
  the render pipeline on invisible output. Live Preview already had revision checks and
  debounce-based convergence from 0.1.4. New integration tests cover the post-processor's
  currency-repair flow end to end.
- Fixed a 0.2.0 defect in the preamble-file workflow: changing the **Preamble file** setting
  rebuilt the engine with the *previous* file's content under the new path's label, so the new
  file's macros were missing (and the stale content could even produce a parse failure attributed
  to the new path) until the next vault event, a manual **Reload preamble**, or a restart.
  `saveSettings` now re-reads the file whenever the configured path changed before rebuilding the
  engine, and a preamble content change also invalidates the lazily created PDF export engine so
  exports can never reuse stale macros.
- Added reproducible benchmark fixtures and the first measurement pass for 0.3.0 (ROADMAP
  PERF-01, PERF-02): `npm run bench:generate` deterministically generates 100- and 500-formula
  notes covering unique and repeated inline/display formulas, preamble-file macros and
  intentional invalid input, and the `benchmarks/tools/measure-console.js` DevTools harness
  records open, scroll-through, typing and view-switch latencies in a real Obsidian vault.
  `docs/benchmarks.md` documents the fixtures, procedure, machine profile, medians/p95s and the
  findings that gate further optimization work.

## 0.2.0 - 2026-09-06

- Added an optional vault-relative **preamble file** setting: its TeX definitions are evaluated
  before the inline settings preamble in every formula across the vault, and the file is re-read
  automatically after vault edits (debounced, once per edit burst).
- Defined the deterministic file/inline merge order (file first, inline second, so the inline
  preamble can override file macros with `\renewcommand`); inline-only setups render exactly as
  in 0.1.x.
- Added **Create preamble file**, **Open preamble file** and **Reload preamble** commands that
  report success or a concise actionable failure, including missing ancestor folder creation.
- Improved preamble diagnostics: TeX parse failures are attributed to their source (vault file
  path or settings preamble) while the previously valid renderer keeps working; missing folders,
  missing files, folder-typed paths and absolute paths produce visible, non-fatal errors.
- Made preamble lifecycle cleanup explicit: the debounced reload timer and vault listeners are
  removed on plugin unload and no stale reload can outlive the engine.
- Fixed a Reading View race (present since 0.1.x, exposed by cold font caches): taking over a
  formula before Obsidian finished its own asynchronous math render let Obsidian's completion
  callback re-typeset the plugin's markup and replace the formula with an error block. The
  Reading View adapter now waits, bounded, for Obsidian's `is-loaded` finalization and skips
  wrappers that never settle.
- Fixed currency-like dollar text being lost in Reading View and PDF export (present since
  0.1.x): the paragraph-repair locator anchored its suffix at the last `$` of the block —
  including dollars inside inline code — so a trailing code span made the match unsatisfiable
  and the repair silently never ran. The locator now anchors outside code spans and compares
  against backtick-stripped text; sections Obsidian may have mis-paired no longer have their
  inline math replaced wholesale, which could previously swallow the paired-away text.
- PDF export now re-renders inline math per source block instead of pairing against the whole
  note at once. Previously, one currency paragraph could make the note-level wrapper count
  disagree with the scanner and silently drop every inline formula in the export back to
  Obsidian's built-in renderer; blocks now pair independently, so the bundled engine (and its
  preamble macros) applies to all of them.
- Render errors now report the real MathJax message (for example `Undefined control sequence
  \XX`) instead of `[object Object]` when MathJax signals retry-need via plain objects.
- Expanded the automated suite to 80 tests covering path normalization, merge determinism,
  watcher debouncing, engine segment diagnostics, math finalization waits, paragraph-locator
  anchoring, per-block PDF export planning and 0.1.x settings migration.

## 0.1.5 - 2026-08-24

- Kept the declared Obsidian 1.8 compatibility floor while capability-checking the settings-tab
  refresh APIs introduced in Obsidian 1.13, and added the official unsupported-API lint rule to
  the default verification gate.

## 0.1.4 - 2026-08-23

- Added Obsidian 1.13+ declarative, searchable settings while retaining the imperative settings
  tab for the declared Obsidian 1.8–1.12 compatibility range.
- Prevented a delayed Live Preview teardown from overwriting math already mounted by a newer
  renderer revision, and bound popout scheduling to the popout window lifecycle.
- Repaired currency-like dollar paragraphs in Reading View as well as PDF export, so literal
  amounts cannot be swallowed while a later inline formula is re-rendered.
- Made bundled dynamic font setup replayable across CommonHTML/SVG engine rebuilds and eagerly
  populated each output instance, preventing shared load markers from breaking overlapping
  CommonHTML engines during plugin hot reload. Regression coverage now includes both a
  CommonHTML -> SVG -> CommonHTML cycle and concurrent CommonHTML instances.
- Removed an obsolete Obsidian MathJax 3 pseudo-glyph reset that hid MathJax 4 CommonHTML glyphs
  after a cold CSS reload.
- Moved opt-in diagnostics to the console debug channel and added focused lifecycle and logging
  regression coverage.

## 0.1.3 - 2026-08-14

- Made Reading View takeover reversible across settings refresh, plugin disable and reload, so
  mounted formulas never become blank when the private engine stylesheet is removed.
- Fixed PDF export from both Live Preview and Reading View: global preamble macros such as `\R`,
  inline/display formulas, and currency-like dollar text now export consistently.
- Added a dedicated isolated SVG renderer for PDF output, embedding glyph paths so cold exports do
  not depend on CommonHTML webfont timing or network availability.
- Export invalid expressions as readable source when Obsidian fallback styling would conflict in
  the print document.
- Added the maintained future roadmap and expanded the automated regression suite to 32 tests.

## 0.1.2 - 2026-08-13

- Fixed the community-directory manifest description error.
- Added GitHub build-provenance attestations and limited releases to the three supported assets.
- Removed the obsolete `builtin-modules` dependency and addressed safe automated-review findings
  for promises, DOM helpers, deprecated slider tooltips and CSS scoping.

## 0.1.1 - 2026-08-13

- Added GitHub Actions CI and tag-driven release automation with tests, production builds and
  release publication.
- Corrected the GitHub author URL and marked the plugin desktop-only until mobile acceptance
  testing is completed.
- Switched official release tags to the Obsidian-required plain `x.y.z` format.

## 0.1.0 - 2026-08-13

- Introduced an isolated, revisioned MathJax 4.1.3 engine with CommonHTML and SVG output.
- Added Reading View and opt-in Live Preview takeover, including source recovery, code exclusion,
  popout-document support and graceful fallback.
- Added TeX package controls, a global preamble, normalized settings, LRU caching, render debounce,
  a version inspector and a side-by-side render test view.
- Added complete New Computer Modern dynamic glyph chunks and scoped away Obsidian MathJax 3
  pseudo-glyphs inside plugin output, fixing detached square-root bars and double-drawn symbols.
- Prevented view-switching refresh loops and made Reading View source pairing fail closed when
  wrapper counts do not match conservative TeX recovery.
- Added release metadata validation and a 27-test unit/integration suite.
- Verified the production plugin in an isolated Obsidian 1.13.6 desktop vault with no captured
  runtime errors.
