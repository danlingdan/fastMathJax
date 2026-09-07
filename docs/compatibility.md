# Compatibility

| Surface | Default mode (0.x behavior) | Invasive mode (1.0, opt-in) | Behavior |
| --- | --- | --- | --- |
| Reading View | Supported | Supported | Default: re-renders inline and display math from exact section source. Invasive: Obsidian's native pipeline renders through the patched entry point, no per-section takeover needed |
| Live Preview | Supported (opt-in) | Supported | Default: re-renders mounted Obsidian math widgets. Invasive: the native widget path renders through the patched entry point |
| Popout windows | Supported | Supported | Both modes mirror the engine's live stylesheet (CSSOM kept in sync with the element text) into each popout document; local font URLs are rewritten to the CDN there because popout documents live at a null origin and cannot fetch `app://` resources |
| PDF export | Supported | Supported | Private SVG engine with embedded glyphs, routed from either editor mode; invasive `.print` detection sends export re-renders to the same engine |
| Hover preview | Not supported | **Supported** | Default-mode analysis (COMP-02, 0.4.0) still holds for the public API. Invasive mode covers the popover automatically because it renders through the same patched native entry points |
| Embeds | Not supported | **Supported** | Same mechanism as hover preview |
| Canvas | Not supported | Not supported | The public Obsidian API (typings 1.13.1) exposes no canvas rendering classes; every community approach patches internals beyond the two members invasive mode touches (COMP-02) |

## Invasive mode contract

Off by default; enabling requires confirming a dialog that lists benefits (every surface on
MathJax 4.1.3, single engine, macro coverage for hover/embeds) and risks (depends on two
internal functions that an Obsidian update may change, behavioral differences vs. plugins that
render with native MathJax 3, experimental status). While active:

- `MathJax.tex2chtml` and `MathJax.chtmlStylesheet` are replaced; nothing else on the global is
  touched (`tex2svg`, `version`, other plugins' entry points stay native).
- A runtime feature guard verifies both entry points exist and are functions. If the guard fails
  (Obsidian update), the plugin shows a notice, reverts the setting and stays in default mode —
  rendering never breaks.
- Disabling the mode, disabling or uninstalling the plugin restores the original members
  byte-for-byte, removes the trap and every marker, and re-renders each formula the plugin
  produced back to Obsidian's own output (the TeX is stamped on every invasive container).
- Behavioral note: Obsidian's own `$…$` span detection applies unchanged in invasive mode, so
  currency-like sequences (`$5 and $6`) pair the same way they do without the plugin (verified
  against native output); the default mode's stricter scanner no longer applies there.

Both output renderers, CommonHTML and SVG, are first-class: the core engine paths —
rendering and cache cloning, TeX parse errors, preamble macros, popout adoption and style
copy, assistive MathML emission — are covered by automated tests in both modes, and the
matrix passed desktop acceptance on Obsidian 1.13.7 (Windows) across Reading View, opt-in
Live Preview, hover preview, popouts, PDF export, fallback behavior and settings toggles,
including renderer switching and invasive-mode on/off cycles.

The plugin requires Obsidian 1.8.0 or newer and was acceptance-tested on Obsidian 1.13.7 for
Windows. Version 1.0.0 keeps `minAppVersion` at 1.8.0.

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
