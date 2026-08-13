# Compatibility

| Surface | Status in 0.1.0 | Behavior |
| --- | --- | --- |
| Reading View | Supported | Re-renders inline and display math from exact section source |
| Live Preview | Supported | Re-renders mounted Obsidian math widgets; source remains editable at the cursor |
| Popout windows | Supported | Uses the same adapters and copies engine styles per document |
| Hover Preview | Not supported | Raw TeX is not reliably exposed by a public hook |
| Canvas | Not supported | Canvas cards can bypass the Markdown post-processor |

The plugin requires Obsidian 1.8.0 or newer and was acceptance-tested on Obsidian 1.13.6 for Windows.

CommonHTML uses New Computer Modern webfonts. SVG embeds glyph paths and needs no font download. Both output modes include the full dynamic glyph-chunk set in `main.js`.

If the private engine cannot render an expression, `fallbackMode=obsidian` leaves Obsidian's existing result in place. The `raw` and `error` modes visibly replace it instead. Disabling the plugin removes its stylesheet and lets Obsidian resume its normal renderer without modifying global state.
