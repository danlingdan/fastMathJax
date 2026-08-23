# Changelog

All notable changes to this project are documented here. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
