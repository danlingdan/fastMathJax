# Mobile feasibility spike

Roadmap items **MOB-01** (bounded mobile feasibility spike) and **MOB-02** (`isDesktopOnly`
truthfulness). This file records what has been measured so far, what only a real device can
answer, and the protocol for the device pass. `manifest.json` keeps `"isDesktopOnly": true` until
the device matrix below has passed on at least one Android and one iOS/iPadOS device or
simulator; `tests/manifest.test.ts` guards that rule.

## Desktop-side measurements (recorded 2026-09-07, plugin 0.3.0 line)

| Measurement | Value | Source |
| --- | --- | --- |
| Release bundle | `main.js` 11.63 MiB (≈ 12.2 MB), `styles.css` 7.3 KB | built output, 0.3.0 line |
| Bundle composition | dominated by MathJax 4 core, TeX packages, CHTML *and* SVG font data incl. dynamic glyph chunks | `docs/roadmap.md` SIZE-01 (audited breakdown planned for 0.5.0) |
| Engine construction | a few milliseconds at `onload`; the MathJax document itself is built lazily on first render | `src/main.ts`, `MathJaxEngine.initialise()` |
| Warm open, 100/500 formulas | 667.8 / 1725.4 ms median | `docs/benchmarks.md` |
| Cold open, 100/500 formulas | 846.2 / 2013.4 ms median | `docs/benchmarks.md` |
| Per-viewport render while scrolling | ≈ 48–62 ms warm, ≈ 181–204 ms cold (first-sight glyph chunk loads) | `docs/benchmarks.md` |
| Default CHTML font source | New Computer Modern woff2 from jsDelivr; bundled metrics keep layout correct when unreachable | `src/engine/MathJaxConfig.ts` |

### What this predicts for mobile

- **Parse/eval of an ≈ 12 MB bundle** is the dominant startup unknown. Mobile-class ARM cores
  typically parse JavaScript several times slower than the i9-14900HX benchmark machine, so the
  first-launch plugin load is expected to be the single largest cost. It is paid once per app
  start; rendering afterwards is lazy.
- **Memory** has not been measured yet, on any platform. The bundle plus font data and the render
  cache (up to 1000 cloned DOM trees) set a floor that must fit Obsidian mobile's WebView budget.
- **CHTML font access**: on mobile, the default jsDelivr woff2 fetch depends on network reachability.
  Missing font files degrade glyph *shapes* only (metrics are bundled), but the cold per-viewport
  penalty above shows glyph chunk loads already dominate on desktop. **SVG needs no font download**
  and is the safer mobile default (`docs/roadmap.md` FONT-02).
- **Touch editing** goes through the same CodeMirror 6 Live Preview path as desktop; the opt-in
  Live Preview settings default to off, matching desktop behavior. Nothing in the plugin's
  scheduling is pointer-specific, but virtualized scrolling + debounce behavior under touch needs
  direct observation.

## Questions only a device can answer

1. Cold app start to rendered note, with the plugin enabled vs disabled (per renderer).
2. Heap/JS memory before and after enabling the plugin, and while scrolling the 500-formula
   benchmark note.
3. Whether Obsidian mobile invokes the plugin's Markdown post-processor in Reading view at all,
   and whether the Live Preview takeover behaves under touch-driven virtualization.
4. CHTML glyph rendering with and without network access (jsDelivr reachability), compared with
   SVG offline.
5. Whether the two-finger zoom/print-style reflow of the mobile surface disturbs cached clones.

## Device pass protocol

Prerequisites: the release candidate plugin files (`main.js`, `manifest.json`, `styles.css`), the
benchmark notes from `npm run bench:generate`, and the structural fixtures from
`benchmarks/fixtures/surface-contexts.md`.

Android (any device with USB debugging; Chrome DevTools remote inspection of Obsidian's WebView):

1. Copy the plugin into the vault's `.obsidian/plugins/latest-mathjax/` (USB or cloud sync) and
   enable Community plugins → Latest MathJax.
2. `chrome://inspect` on a desktop Chrome lists the Obsidian WebView; open its console.
3. Record: cold start time (screen recording stopwatch), `performance.memory` deltas before/after
   enabling and during 500-formula scroll, Reading view + opt-in Live Preview sanity on
   `benchmarks/notes/benchmark-100.md`, then airplane mode: CHTML (fonts unreachable) vs SVG.
4. Repeat the scroll-through scenario from `docs/benchmarks.md` at a fixed slow pace for one
   comparable sample per note size.

iOS/iPadOS (requires macOS with Safari Web Inspector for the WKWebView):

1. Install Obsidian from the App Store; sync the vault (iCloud or Working Copy) with the plugin
   files in place; enable the plugin.
2. Safari → Develop → device → Obsidian Web View for the console probes from step 3 above.
3. Same measurements as the Android pass.

A device pass **passes** when: the plugin loads and renders both renderers' output correctly, no
formula content goes missing or loops under scroll, and every measurement above is recorded in
this file with device model, OS version and app version.

## Decision

- MOB-02 stays satisfied by keeping `"isDesktopOnly": true` — the device matrix has not run, so
  claiming mobile support would be untruthful. The guard test fails any accidental flip.
- MOB-01 remains open until an Android and an iOS pass are recorded here. The 0.4.0 release
  documents this status rather than shipping a mobile claim.
