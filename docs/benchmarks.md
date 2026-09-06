# Benchmark fixtures and measurements (0.3.0)

This page specifies the reproducible benchmark fixtures required by ROADMAP **PERF-01** and the
measurement procedure that **PERF-02** records results into. The 0.3.0 release rule is that
optimization work must be driven by the numbers recorded here, not by intuition.

## Fixture files

| Path | Purpose |
| --- | --- |
| `scripts/benchmarkFixtures.mjs` | Pure recipe: category shares, formula pools, markdown assembly |
| `scripts/generate-benchmarks.mjs` | CLI that writes the notes (`npm run bench:generate`) |
| `benchmarks/notes/benchmark-100.md` | 100-formula note |
| `benchmarks/notes/benchmark-500.md` | 500-formula note |
| `benchmarks/preamble/benchmark-preamble.tex` | Macro definitions required by the macros section |
| `benchmarks/fixtures/surface-contexts.md` | Structural-contexts fixture (callouts, tables, lists, blockquotes, footnotes, embeds) |
| `benchmarks/fixtures/surface-embed-target.md` | Embed target used by the structural fixture |
| `benchmarks/tools/measure-console.js` | DevTools console harness that runs the measurement scenarios (`__bench` API) |
| `tests/benchmarkFixtures.test.ts` | Pins the composition, determinism and section invariants |

The generated notes are committed. Regenerate only after changing the recipe; the tests make
regeneration byte-for-byte deterministic, so a diff after `npm run bench:generate` means the
recipe and its documentation changed together.

## Composition

Each note's total formula count is split by fixed shares; both canonical sizes divide cleanly.

| Section | Share | 100-note | 500-note | Exercises |
| --- | --- | --- | --- | --- |
| Unique inline | 40% | 40 | 200 | Cache misses; first-sight New Computer Modern glyph chunks; inline repair path |
| Repeated inline | 20% | 20 | 100 | Formula-cache hits (4 fixed sources) |
| Unique display | 20% | 20 | 100 | Fresh single-line display typesets (matrices, integrals, `\mathbb`/`\mathcal`, extensible arrows) |
| Repeated display | 10% | 10 | 50 | Display cache hits (2 fixed sources) |
| Preamble macros | 5% | 5 | 25 | File-backed preamble evaluation path (0.2.0 `preambleFile`) |
| Invalid input | 5% | 5 | 25 | Failure-fallback path on undefined control sequences (inline and display) |

Every note ends with a **math-free anchor** paragraph: typing measurements happen there, where an
edit must not re-render any formula. The invalid section is intentional; the plugin must leave
those formulas to Obsidian's failure fallback without disturbing neighbors.

## Vault setup for a measurement run

1. Create a clean test vault and copy `benchmark-100.md`, `benchmark-500.md` and
   `benchmark-preamble.tex` into it.
2. Install the plugin build under `.obsidian/plugins/latest-mathjax/`, enable it, and set the
   **Preamble file** setting to the vault path of `benchmark-preamble.tex`. Keep every other
   setting at its default (enable opt-in Live Preview only when measuring it).
3. Sanity-check before recording: the macros section must render (e.g. `\benchQuad{x_{1}}`
   becomes a quadratic, `\benchSpeedOfLight` becomes `299 792 458 m/s`), and the invalid section
   must fall back without affecting neighbors. Raw TeX in the macros section means the preamble
   path is wrong — do not record numbers from that run.

## Measurement scenarios (recorded under PERF-02)

| Scenario | Definition |
| --- | --- |
| Cold open | `__bench.cacheClear()`, fully restart Obsidian, then detach and reopen the note in Reading View with a cold formula cache and a fresh process; measure open → quiet. Three restarts per note size. |
| Warm open | Same detach + reopen cycle with the formula cache warm; measures the open-to-quiet latency of the initially mounted viewport (Obsidian virtualizes Reading View, so opening mounts the first screens only) |
| Cold / warm scroll-through | Open the note, then walk the scroller to the bottom one viewport per step, waiting for render quiet after each step; records total, per-step and wall times. This is the whole-note render measurement; cold variants run after a restart, warm variants back-to-back |
| Typing | Insert a fixed probe paragraph after the math-free anchor in Live Preview; measure edit-to-quiet and assert the formula wrapper counts did not move |
| View switch | Toggle Reading View ↔ Live Preview; measure each transition to quiet |

Capture method and recording rules: paste `benchmarks/tools/measure-console.js` into the vault's
DevTools console; it installs a `__bench` API that runs each scenario and returns JSON samples.
Record at least 10 runs per warm scenario and note size (cold: 3 restarts), report median and p95
together with the machine profile (CPU, RAM, Obsidian version, OS). Before recording anything,
run `await __bench.sanity({ file: "benchmark-100.md" })`: the walk must reach the bottom, the
macros section must have rendered (`macrosRendered`), the invalid section must have stayed on
Obsidian's output (`invalidLeftToObsidian`), and no raw macro source may remain
(`rawMacroLeak: false`). Results are appended to this page as they are recorded.

## Results (recorded 2026-09-06, Obsidian 1.13.7, plugin 0.2.0)

Machine profile: Intel Core i9-14900HX (24 cores / 32 threads), 15.6 GB RAM, Windows 11 Pro
build 26200. Settings profile: plugin defaults (CHTML renderer, cache enabled with size 1000,
150 ms render debounce, `obsidian` fallback mode, debug logging off) plus the opt-in surfaces
under test — `enableInlineReadingView`, `enableLivePreview` and `enableInlineLivePreview` — and
`preambleFile: benchmark-preamble.tex`. Warm runs: n=10. Cold runs: n=3 restarts.

All timings are wall-clock milliseconds measured by the console harness, and each sample
includes a fixed DOM-quiet gate (250–400 ms, listed per scenario) that the harness waits before
declaring a render settled. "Render-attributable" below subtracts that instrumentation floor.

### Reading View, warm cache (n=10, median / p95)

| Scenario | 100 formulas | 500 formulas | Quiet gate |
| --- | --- | --- | --- |
| Open (fresh tab, switch to Reading, settle) | 667.8 / 696.1 | 1725.4 / 1815.7 | 250 |
| Scroll-through, total | 3571.9 / 3593.9 (12 steps) | 16516.6 / 17051.4 (53 steps) | 250 per step |
| Scroll-through, render-attributable | ≈ 572 (≈ 48 per viewport) | ≈ 3267 (≈ 62 per viewport) | — |
| Typing in math-free anchor | 560.7 / 854.6 | 573.5 / 868.8 | 300 |
| View switch (Reading ↔ Live Preview) | 377.2 / 418.1 | 359.6 / 1267.6¹ | 300 |

¹ One 1267.6 ms outlier in ten runs (the first source-mode mount of that pass); the other nine
samples sit between 338.8 and 387.6.

Typing produced zero formula churn in all 20 runs (plugin and Obsidian wrapper counts identical
before and after each edit), confirming that edits in the math-free anchor do not re-render math.

### Reading View, cold (cache cleared + full restart, n=3, median)

| Scenario | 100 formulas | 500 formulas |
| --- | --- | --- |
| Cold open (settle) | 846.2 (822.1 / 846.2 / 866.9) | 2013.4 (1896.6 / 2013.4 / 2075.1) |
| Cold scroll-through, total (steps) | 5604.9 (13 steps) | 24498.6 (54 steps) |
| Cold scroll-through, render-attributable | ≈ 2355 (≈ 181 per viewport) | ≈ 10999 (≈ 204 per viewport) |

### Findings that shape PERF-03…05

- **Open cost scales with document size, not with rendered math.** Warm open renders the same 35
  formulas in both notes, yet the 500-formula note takes ~2.6× longer (1725 vs 668 ms). The extra
  time is proportional to file length, so the per-open pipeline (markdown parse plus source
  pairing) is the first candidate for PERF-03/04 profiling.
- **Per-viewport render is flat across the document.** Scroll-through render-attributable cost is
  ≈ 48–62 ms per viewport warm regardless of note size; totals grow with step count, i.e. with
  document length, not with math density.
- **Typing latency is size-independent** (medians 560.7 vs 573.5 ms, of which 450 ms is the
  debounce-plus-quiet instrumentation floor) and never disturbs formulas.
- **Cold penalty concentrates in scroll-through** (+56% on 100 formulas, +48% on 500) rather than
  in the initial viewport (+~180 ms), consistent with first-sight glyph chunk loads dominating.

### Known issue found during the pass (0.2.0, fixed on `main`)

Switching the `Preamble file` setting from one vault path to another evaluated the *previous
file's cached content* under the new path's label; the new file's macros were only available after
the next vault file event or a manual **Reload preamble** (or a restart). Observed when moving
from `math/macros.tex` to `benchmark-preamble.tex`; `renderInto("\\benchSet")` failed with
`Undefined control sequence` until the manual reload. Measurements above are unaffected (the
profile was applied once, then verified via `__bench.sanity`, and every cold run loads the file
fresh at startup). Fixed on `main`: `saveSettings` now re-reads the file when the configured path
changed before rebuilding the engine, and a preamble content change invalidates the lazily
created PDF export engine. Desktop-verified by switching between the two files via
`saveSettings` alone — both files' macros render immediately, with no diagnostics.
