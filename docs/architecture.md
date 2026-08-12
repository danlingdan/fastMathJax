# Architecture

## Layers

```text
main.ts  (plugin lifecycle, commands, settings registration)
   |
   +-- engine/          isolated MathJax 4 — knows nothing about Obsidian
   |     MathJaxEngine.ts   render(tex, {display}) -> HTMLElement
   |     MathJaxConfig.ts   config -> MathJax options + config hash
   |     MathCache.ts       LRU cache keyed by hash(tex+display+config+version)
   |     packages.ts        TeX package registry / metadata
   |
   +-- preview/         Reading View adapter (markdown post processor)
   +-- editor/          Live Preview adapter (CodeMirror 6 extension)
   +-- view/            test view (engine sandbox, no Obsidian math involved)
   +-- utils/           hash, version detection, logger
```

**Hard rule:** `engine/` must never import from `obsidian`. Everything Obsidian-specific lives in
the adapter layers. This is the mitigation for risk #1 in the plan (Obsidian internal DOM changes).

## Isolation strategy

MathJax 4 is consumed as an ES module graph (`@mathjax/src/js/...`) and bundled by esbuild into
`main.js`. We construct the document/handler objects ourselves:

```text
RegisterHTMLHandler(browserAdaptor())   <- once, module scope
new TeX({packages, macros})             <- input jax
new CHTML({fontData, ...})  OR  new SVG({fontCache})   <- output jax (selected by settings.renderer)
mathjax.document(document, {InputJax, OutputJax})
```

Nothing is written to `window.MathJax`. Obsidian's own MathJax instance keeps its own
`window.MathJax` and its own document object; the two never share state.

One caveat: `RegisterHTMLHandler` mutates a MathJax-internal handler list — but that list belongs to
*our* bundled copy of MathJax, not Obsidian's, so there is no cross-talk.

### Renderer choice (v0.0.8)

`EngineConfig.renderer` is `"chtml"` (default) or `"svg"`:

- **CHTML** carries `MathJaxNewcmFont` (New Computer Modern) metrics + a `fontURL` pointing at the
  woff2 files. Glyph *shapes* come from the webfont; *metrics* are bundled, so layout is correct even
  offline (only shapes fall back). Emits a `<style>` with `@font-face` / rule data.
- **SVG** embeds the glyph *path data* inline via `DefaultFont` — **no webfont download** — so it
  works fully offline. `fontCache: "local"` stores shared path definitions inside each equation's
  `<svg>`. The Font-URL setting is irrelevant for SVG and is disabled in the UI.

Both output jaxes expose a `styleSheet` (used by `flushStyles` / `ensureStyles`), so the
per-document style-copy for popouts works for either renderer.

## Render pipeline

```text
render(tex, {display})
   |
   +-- cache lookup (hash) --> hit: cloneNode(true)
   |
   +-- miss:
         adaptor-based convert()   TeX -> MathML -> CHTML|SVG DOM
         styles: inject/refresh <style> for metrics (CHTML @font-face / SVG font-cache defs)
         store clone in cache
```

Every consumer receives a **clone**, never the cached node itself — otherwise moving a node into the
DOM would empty the cache entry.

## Error handling

```text
convert() throws  ->  TeX error object
                  ->  fallback per settings:
                        1. show raw LaTeX  (default in test view)
                        2. hand back to Obsidian's built-in MathJax (default in adapters)
                        3. show error text
```

The adapters decide the fallback; the engine only reports a typed failure.

## Reading View adapter (preview/)

A `registerMarkdownPostProcessor` callback re-renders display math in Reading View:

```text
Obsidian markdown render  ->  .math.math-block wrapper with Obsidian's <mjx-container>
                        |
                        v
our post processor
   |
   +-- getSectionInfo(el) -> raw markdown of the section
   +-- extractDisplayMath(text) -> [tex0, tex1, ...]   (fenced code stripped)
   +-- pair .math-block nodes with sources by document order
   +-- engine.render(tex, {display:true}) -> replace wrapper's children
   +-- mark wrapper with data-latest-mathjax="true"   (skip on later passes)
```

Guarantees:

- The original LaTeX is **never** reverse-engineered from `<mjx-container>`; it is re-parsed from the
  source markdown, so a plugin update can never desync from Obsidian's output format.
- When `getSectionInfo` is unavailable (embeds, hover popovers, canvas) or a node has no matching
  source, we leave Obsidian's output untouched.
- A render error keeps the built-in output in place — the user's notes never break.

## Live Preview adapter (editor/)

A CodeMirror 6 `ViewPlugin` takes over math in the editor via `Decoration.replace` at `Prec.highest`,
so our widget wins over Obsidian's built-in math widget for the same range:

```text
Obsidian syntax tree (stream parser)
   |
   v
syntaxTree(state).iterate  ->  nodes whose token name contains "math"
   |
   +-- display math: token "math-block" present
   +-- inline math:  token "math" present (gated by enableInlineLivePreview)
   +-- state.sliceDoc(from,to)  ->  raw "$…$" / "$$…$$"
   +-- stripDelimiters(...)      ->  tex
   +-- if range overlaps the selection: SKIP  ->  Obsidian shows raw source (editing mode)
   +-- else Decoration.replace({ widget: MathWidget(tex,display) }).range(from,to)
        |
        v
   MathWidget.toDOM()  ->  engine.render(tex, {display})  (or raw source on error)
```

Guarantees:

- The TeX is read straight from the editor state, never from a rendered DOM node.
- Cursor-inside-formula is handled by skipping the decoration, so Live Preview's native
  "show source while editing" behaviour is preserved.
- `enableLivePreview` is read on every rebuild; the settings tab calls `workspace.updateOptions()`
  to force all open editors to rebuild the extension when the toggle flips.
- A render error falls back to showing the raw `$$…$$` / `$…$` text — the editor never breaks.

> **Unverified in-app:** whether `Prec.highest` reliably displaces Obsidian's own math decoration,
> and whether the math token names follow the underscore-joined convention assumed here, both need a
> vault drop-in to confirm (see `docs/obsidian-mathjax-research.md` §4).
