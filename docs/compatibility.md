# Compatibility

| Surface | Status in 0.1.3 | Behavior |
| --- | --- | --- |
| Reading View | Supported | Re-renders inline and display math from exact section source |
| Live Preview | Supported (opt-in) | Re-renders mounted Obsidian math widgets; source remains editable at the cursor |
| Popout windows | Supported | Uses the same adapters and copies engine styles per document |
| PDF export | Supported | Uses the private engine with embedded SVG glyphs from either Live Preview or Reading View |
| Hover Preview | Not supported | Raw TeX is not reliably exposed by a public hook |
| Canvas | Not supported | Canvas cards can bypass the Markdown post-processor |

The plugin requires Obsidian 1.8.0 or newer and was acceptance-tested on Obsidian 1.13.7 for Windows.

CommonHTML uses New Computer Modern webfonts from jsDelivr by default; its metrics are bundled, but the configured font files must be reachable for the intended glyph shapes. SVG embeds glyph paths and needs no font download. Both output modes include the full dynamic glyph-chunk metadata in `main.js`.

PDF export always uses a separate isolated SVG engine regardless of the interactive renderer. This
keeps macros and package configuration consistent while avoiding print-time webfont races. It does
not replace or patch Obsidian's global MathJax renderer.

If the private engine cannot render an expression, `fallbackMode=obsidian` leaves Obsidian's existing result in place. The `raw` and `error` modes visibly replace it instead. Disabling the plugin removes its stylesheet and lets Obsidian resume its normal renderer without modifying global state.
