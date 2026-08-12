# Compatibility

## Surface matrix

| Surface | Priority | Status |
| --- | --- | --- |
| Reading View | 1 | **done (display `$$`)**; inline `$…$` pending (Task 6) |
| Live Preview | 2 | not started (Task 7 / Stage 4) |
| Hover Preview | 3 | not started |
| Popout Window | 4 | not started — needs per-document style manager |
| Canvas | 5 | not started |
| PDF Export | 6 | not started |

## Popout windows

CHTML output injects a `<style>` element into the document that owns the rendered node. A popout
window is a **separate `Document`**, so styles injected into the main window do not apply there.
Any popout support will need a per-document style manager. Tracked for v0.0.7.

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
