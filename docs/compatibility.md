# Compatibility

## Surface matrix

| Surface | Priority | Status | Notes |
| --- | --- | --- | --- |
| Reading View | 1 | **done** (`$$…$$` + `$…$` inline, gated) | `preview/MathPostProcessor`; TeX recovered from section source |
| Live Preview | 2 | **done** (display + inline, gated) | `editor/LivePreviewRenderer`; syntax-tree ranges, cursor-overlap shows source |
| Popout Window | 4 | **auto-supported** | reuses the same post-processor / editor extension; CHTML styles are copied per-document via `MathJaxEngine.ensureStyles` |
| Hover Preview | 3 | **not supported (by design)** | Obsidian does not expose the raw TeX for hover-rendered math, so recovery is unreliable — kept on Obsidian's built-in renderer |
| Canvas | 5 | **not supported (by design)** | canvas card math does not flow through the markdown post-processor, so there is no hook to recover TeX |
| PDF Export | 6 | not started | out of scope for v0.1.0 |

Legend: "done" / "auto-supported" are *code-complete but runtime-unverified* until dropped into a vault.

## Popout windows

CHTML output injects a `<style>` element into the document that owns the rendered node. A popout
window is a **separate `Document`**, so styles injected into the main window do not apply there.

The fix is `MathJaxEngine.ensureStyles(targetDoc)`: after rendering into a node whose
`ownerDocument` differs from the host window, the engine clones its canonical stylesheet into that
document (idempotent — only the first time a given document needs it). Both adapters call it
(`MathPostProcessor` after re-rendering, `MathWidget.toDOM` after building the widget), so a popout
window's Reading View / Live Preview formulas are styled. The clone is a snapshot, which is fine for
the small, bounded set of formulas a popout usually shows.

## Markdown contexts to verify

- [ ] plain paragraph
- [ ] callout
- [ ] table cell
- [ ] list item
- [ ] blockquote
- [ ] footnote
- [ ] embedded note (`![[note]]`)
- [ ] source mode (must be untouched)

## Known plugin interactions to check

| Plugin | Concern |
| --- | --- |
| Extended MathJax | also configures math rendering; likely conflicts |
| Latex Suite | edits inside math ranges; our decorations must not block its keymaps |
| Templater | generates math via JS; should be transparent to us |
| Dataview | renders inline; post processor ordering matters |
| Excalidraw | own math handling; out of scope for v0.1.0 |

## Non-negotiable

Disabling the plugin must fully restore Obsidian's default behaviour. That means:

- no writes to `window.MathJax`
- no patching of `renderMath` / `finishRenderMath` / `loadMathJax`
- all DOM mutations happen inside nodes we created, or are reverted on unload
- all editor extensions and post processors are registered via the plugin API so Obsidian
  unregisters them automatically
