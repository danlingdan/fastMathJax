# Runtime smoke testing

A maintainer can repeat the clean-vault acceptance for any release candidate using this page and
the checked-in fixtures — no undocumented sample notes required. The benchmark measurement
procedure lives in [`benchmarks.md`](benchmarks.md); this page covers functional acceptance.

## Vault setup

1. Create a clean vault (or reuse `tmp/obsidian-test-vault`, which is gitignored) and install the
   release build: copy `main.js`, `manifest.json`, `styles.css` into
   `.obsidian/plugins/latest-mathjax/`, then enable the plugin.
2. Copy the fixtures you need from `benchmarks/fixtures/` and, for preamble checks, place
   `benchmarks/preamble/benchmark-preamble.tex` in the vault root.
3. Keep settings at defaults unless a step says otherwise. Live Preview rendering and inline
   Reading View rendering are opt-in; enable them in settings when their steps run.

## Baseline checks

| Step | Action | Pass criteria |
| --- | --- | --- |
| Reading View | Open `benchmarks/fixtures/surface-contexts.md`, switch to Reading View | Formulas render with the bundled engine; no error blocks beyond the intentional ones |
| Live Preview | Enable **Live Preview rendering** (and inline), switch the note to editing mode | Mounted math widgets are replaced by bundled output; editing a formula shows raw TeX, leaving re-renders it |
| Renderer switch | Settings → switch renderer CHTML ↔ SVG | Open views refresh; fonts stay correct; no console errors |
| Cache statistics | Render a few formulas, open Settings → Latest MathJax | The statistics line shows entries, hits, misses, hit rate and session renders; **Clear cache** resets them to zero (PERF-05) |
| Preamble file | Set **Preamble file** to `benchmark-preamble.tex`; edit the file in an external editor | Macros render in both views after the debounced reload; parse failures are attributed to the file while earlier definitions keep working |
| Preamble switch | Change **Preamble file** to another path, then back | The newly configured file's macros render immediately after the settings change — no manual reload needed (0.2.0 regression) |
| Unload / disable | Disable the plugin, then re-enable | Obsidian's own rendering is restored while disabled; re-enabling rebuilds cleanly with no console errors |

## Structural contexts matrix (SURF-01)

Check each row of `benchmarks/fixtures/surface-contexts.md` in both views. Pass criteria for
every row: the formula renders from unambiguous source **or** is deliberately left to Obsidian;
sources never shift between formulas; currency text stays literal; code spans stay literal.

| Context | Expected behavior |
| --- | --- |
| Callout | Inline and display math inside the callout render with the bundled engine when the section source is unambiguous; otherwise the callout keeps Obsidian's output |
| Table | Cell math renders when pairing is unambiguous; a currency cell (`it costs $5 and $6`) must stay literal and must not suppress math in other cells |
| Lists | Inline math in plain and nested items renders; a display formula inside a list item renders or is left to Obsidian as a whole item — never half-swapped |
| Blockquote | Inline and display math inside the quote follow the same rules as callouts |
| Footnote | Footnote-body math renders or stays on Obsidian; the body text section must not shift |
| Embed | Embedded notes render through Obsidian's pipeline without section metadata; the plugin deliberately leaves them untouched and logs the skip at debug level |

## PDF export spot check

1. Export `benchmarks/fixtures/surface-contexts.md` (command palette → Export to PDF).
2. Open the PDF: display formulas embed via the isolated SVG print engine; a paragraph that
   cannot be located or paired keeps Obsidian's output for just that block; currency text stays
   literal.

## Recording results

Record the pass (date, Obsidian version, settings deviations, failures) in `STATUS.md` for the
release under verification. Performance numbers belong in [`benchmarks.md`](benchmarks.md) via
the console harness, not here.
