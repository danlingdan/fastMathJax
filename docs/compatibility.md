# Compatibility

| Surface | Status in 0.4.0 | Behavior |
| --- | --- | --- |
| Reading View | Supported | Re-renders inline and display math from exact section source |
| Live Preview | Supported (opt-in) | Re-renders mounted Obsidian math widgets; source remains editable at the cursor |
| Popout windows | Supported | Uses the same adapters and copies engine styles per document |
| PDF export | Supported | Uses the private engine with embedded SVG glyphs from either Live Preview or Reading View |
| Hover Preview | Not supported | Post-processors run there, but section info is always null; a `sourcePath` fallback would add a third whole-note path whose transient popover lifecycle cannot be bounded as tightly as PDF export (evaluated 0.4.0, COMP-02) |
| Canvas | Not supported | The public Obsidian API (typings 1.13.1) exposes no canvas rendering classes; every community approach patches internals, which this plugin does not do (evaluated 0.4.0, COMP-02) |

Both output renderers, CommonHTML and SVG, are first-class: the core engine paths —
rendering and cache cloning, TeX parse errors, preamble macros, popout adoption and style
copy, assistive MathML emission — are covered by automated tests in both modes, and the
matrix passed desktop acceptance on Obsidian 1.13.7 (Windows) across Reading View, opt-in
Live Preview, fallback behavior and settings toggles, including renderer switching.

The plugin requires Obsidian 1.8.0 or newer and was acceptance-tested on Obsidian 1.13.7 for
Windows. Version 0.4.0 keeps `minAppVersion` at 1.8.0.

Version 0.1.4 introduced searchable declarative settings on Obsidian 1.13 and newer.
Obsidian 1.8–1.12 continues to use the equivalent imperative settings tab, so this
modernization does not raise `minAppVersion`.

CommonHTML uses New Computer Modern webfonts from jsDelivr by default; its metrics are bundled, but the configured font files must be reachable for the intended glyph shapes. SVG embeds glyph paths and needs no font download. Both output modes include the full dynamic glyph-chunk metadata in `main.js`.

PDF export always uses a separate isolated SVG engine regardless of the interactive renderer. This
keeps macros and package configuration consistent while avoiding print-time webfont races. It does
not replace or patch Obsidian's global MathJax renderer.

If the private engine cannot render an expression, `fallbackMode=obsidian` leaves Obsidian's existing result in place. The `raw` and `error` modes visibly replace it instead. Disabling the plugin removes its stylesheet and lets Obsidian resume its normal renderer without modifying global state.

## Related

- [`docs/accessibility.md`](accessibility.md) — assistive MathML behavior, keyboard/screen-reader
  expectations and known limitations.
- [`docs/mobile-spike.md`](mobile-spike.md) — mobile feasibility analysis, the device acceptance
  protocol, and the rule that keeps `isDesktopOnly` truthful.
