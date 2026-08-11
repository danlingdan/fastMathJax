# Stage 0 — Obsidian MathJax behaviour research

Status legend:

- **[V]** verified from source (npm packages, `obsidian.d.ts`, community plugin source)
- **[C]** community-documented, consistent across multiple plugins, but not yet re-verified in-app
- **[?]** must be confirmed inside a running Obsidian instance

---

## 1. Which MathJax does Obsidian ship?

**[C]** Obsidian bundles MathJax **3.x** (3.2.2 lineage) and loads it lazily. As of mid-2026 it is
still 3.x — user reports about `\oiint` / `\oiiint` failing in Obsidian while working in MathJax 4
confirm this (MathJax 4 added those symbols).

**[?]** Exact version at runtime. Run in the developer console (`Ctrl+Shift+I`) after any note with
math has been rendered:

```js
window.MathJax?.version
```

Notes:

- `window.MathJax` only exists **after** MathJax has been loaded. Before the first math render or an
  explicit `loadMathJax()`, it is `undefined`. Version detection must therefore be lazy and
  `await loadMathJax()` first.

---

## 2. Public API surface

From `obsidian.d.ts` **[V]**:

| Function | Signature | Notes |
| --- | --- | --- |
| `loadMathJax()` | `() => Promise<void>` | Loads Obsidian's bundled MathJax if not yet loaded. |
| `renderMath(source, display)` | `(string, boolean) => HTMLElement` | Synchronous. Returns an `<mjx-container>`. Requires MathJax to be loaded already. |
| `finishRenderMath()` | `() => Promise<void>` | Flushes the MathJax stylesheet. Must be called once after a batch of `renderMath` calls, otherwise the CSS for newly used glyphs is missing. |

There is **no** documented API to swap the engine, register a custom math renderer, or disable the
built-in math handling. This is the whole reason the plugin has to render alongside rather than
replace.

Consequence for our fallback path: option "fall back to Obsidian MathJax" is implemented as
`await loadMathJax(); renderMath(tex, display); await finishRenderMath();` — fully public API, no
patching.

---

## 3. Reading View DOM

**[C]** Obsidian's markdown renderer converts math before post processors run, producing:

```html
<!-- $$ ... $$ -->
<div class="math math-block is-loaded">
  <mjx-container class="MathJax" jax="CHTML" display="true">…</mjx-container>
</div>

<!-- $ ... $ -->
<span class="math math-inline is-loaded">
  <mjx-container class="MathJax" jax="CHTML">…</mjx-container>
</span>
```

Key points:

- The `is-loaded` class is added once rendering completes.
- `display="true"` on the container distinguishes block from inline.
- **The original LaTeX is not stored in the DOM.** There is no `data-tex` attribute.

### 3.1 Recovering the original TeX

This is the central Stage 3 problem the plan flags. Ranked options:

1. **`MarkdownPostProcessorContext.getSectionInfo(el)`** → `{ text, lineStart, lineEnd }`, giving
   the raw markdown source of the section. Slice it and re-parse the `$…$` / `$$…$$` ranges.
   Best option: no reliance on rendered output. **[C]**
   Caveat: returns `null` in contexts without section info — embeds, hover popovers, canvas cards,
   Dataview-generated content. **[?]** exact set of null cases.
2. **`app.vault.cachedRead(file)` via `ctx.sourcePath`** — fallback when `getSectionInfo` is null.
   Requires matching the element back to a source range, which is unreliable for embeds.
3. **Reverse-engineering MathML from `<mjx-container>`** — the plan explicitly wants to avoid this.
   Agreed: lossy, and breaks on any Obsidian output change.

Chosen approach: (1) with (2) as fallback, and skip (leave Obsidian's output in place) when neither
works. Never (3).

### 3.2 Replacement mechanics

Because Obsidian already rendered the math, our post processor **replaces** an existing node rather
than creating one. To keep it reversible and cheap:

- Replace children of `.math` wrapper, keep the wrapper (Obsidian's CSS targets it).
- Mark handled nodes with a `data-latest-mathjax` attribute to avoid double processing (post
  processors can run more than once on the same element). **[?]**

---

## 4. Live Preview (CodeMirror 6)

**[V]** Obsidian is on CM6 v6.x, and plugins must mark `@codemirror/*` as external — Obsidian
supplies those modules at runtime. Bundling our own copy would create a second, incompatible
`EditorState` implementation.

**[C]** Obsidian's markdown mode is a stream parser, so syntax tree node names are underscore-joined
token class lists rather than clean Lezer names. Math tokens appear roughly as:

```text
formatting_formatting-math_formatting-math-begin_keyword_math   ← opening $ or $$
math                                                            ← body
formatting_formatting-math_formatting-math-end_keyword_math      ← closing $ or $$
math-block                                                      ← present for $$ blocks
```

Practical detection rule: `nodeName.split("_")` and test for the presence of `math`,
`formatting-math-begin`, `formatting-math-end`, and `math-block` tokens. Do **not** string-match the
full concatenated name — the order and extra tokens vary with context (lists, callouts, tables).
**[?]** must be confirmed by dumping the tree in-app.

Verification snippet to run in-app (with a math note open in Live Preview):

```js
// paste in devtools console
const view = app.workspace.getActiveViewOfType(
  app.workspace.activeLeaf.view.constructor
);
const cm = app.workspace.activeEditor.editor.cm;
const { syntaxTree } = require("@codemirror/language");
syntaxTree(cm.state).iterate({
  enter(n) { if (n.name.includes("math")) console.log(n.from, n.to, n.name); }
});
```

### 4.1 Conflict with Obsidian's own math widget

Obsidian renders math in Live Preview with its own `Decoration.replace` + `WidgetType`. Two
decorations replacing the same range is a conflict.

**[C]** `RyotaUshio/obsidian-math-in-callout` solves adjacent problems and contains an
`isObsidianBuiltinMathWidget()` check, i.e. it identifies Obsidian's widget instances by
constructor/prototype shape. Worth reading as prior art before Stage 4.

Options, in order of preference:

1. **Higher precedence, replace the same range.** Provide our decoration via a facet with
   `Prec.high` so ours wins. Needs testing whether Obsidian's widget still mounts underneath.
2. **Post-process the built-in widget's DOM.** Let Obsidian create the widget, then swap its inner
   node for ours. Less invasive on the decoration layer but depends on widget internals.
3. **Only decorate ranges Obsidian skipped** (e.g. inside callouts) — this is what math-in-callout
   does; not enough for full takeover.

**[?]** Which one actually works — must be determined empirically in Stage 4. Do not commit to an
approach before then.

### 4.2 Cursor interaction

Requirement from the plan: cursor inside the math range → show source; cursor outside → show
rendered. Standard technique: on every `selectionSet`, recompute decorations and skip ranges that
overlap the selection. Obsidian's own behaviour also expands to the whole `$$` block.

---

## 5. Other surfaces

| Surface | Finding |
| --- | --- |
| Source mode | No math rendering at all. We must not touch it. **[C]** |
| Hover preview | Uses the markdown renderer; post processors run, but `getSectionInfo` likely returns `null`. **[?]** |
| Popout window | Separate `Document` object → CHTML `<style>` injected in the main window does not apply. Needs per-document style handling. **[V]** (follows from DOM semantics) |
| Canvas | Cards render through the markdown renderer; section info unreliable. **[?]** |
| PDF export | Uses a print-time render pass; our async renders may not complete before capture. **[?]** |
| Mobile | Same renderer, much tighter CPU budget. Bundle size and font loading matter more. **[?]** |

---

## 6. Bundled-engine findings (relevant to Stage 1)

Verified by inspecting the installed packages **[V]**:

- `@mathjax/src` 4.1.3 exposes ES modules through the `./js/*` export map
  (`@mathjax/src/js/...` → `mjs/...`), with `.d.ts` files alongside, so TypeScript resolves types
  with `moduleResolution: "bundler"`.
- All TeX extensions are present locally, including `ams`, `mhchem`, `newcommand`, `configmacros`,
  `physics`, `mathtools`, `cancel`, `color`, `unicode`, `braket`, `boldsymbol`, `noerrors`,
  `noundefined`. Each has a self-registering `*Configuration.js` module.
- Fonts moved out of core in MathJax 4. `@mathjax/mathjax-newcm-font` 4.1.3 provides
  `MathJaxNewcmFont` via `/js/chtml.js`. Font **metrics** are plain JS (~130 KB across all variants)
  and safe to bundle. The **woff2 files** ship in `chtml/woff2/` in the npm package and are fetched
  at runtime from `fontURL`.

### 6.1 Two runtime-loading traps

1. **`fontURL`** — CHTML emits `@font-face` rules pointing at `fontURL`. Obsidian plugin releases
   only distribute `main.js`, `manifest.json`, `styles.css`, so we cannot ship woff2 files through
   the community store. v0.0.1 defaults `fontURL` to jsDelivr and exposes it as a setting.
   Planned for v0.0.8: download the font pack once into the plugin folder and serve it via the
   vault adapter's resource path, giving fully offline rendering.
2. **`asyncLoad` / dynamic fonts and `\require`** — MathJax 4 lazily `import()`s extra glyph chunks
   (`dynamicPrefix`) and `autoload`/`require` packages. Dynamic `import()` of a URL does not work
   inside a bundled Obsidian plugin. Therefore v0.0.1 statically registers every package it offers
   and does **not** enable `autoload`/`require`. Later we can point `mathjax.asyncLoad` at a static
   map of bundled modules to make `\require{...}` work offline.

This is a deviation from the plan's Stage 1 checklist (which lists autoload/require as v1 items) and
is recorded deliberately.

---

## 7. Open questions to resolve in-app

- [ ] `window.MathJax.version` exact value
- [ ] `getSectionInfo` null cases (embed / hover / canvas / dataview)
- [ ] Does a post processor run more than once per element?
- [ ] Real syntax tree node names for inline vs block math, incl. inside callouts and tables
- [ ] Whether `Prec.high` lets us outrank Obsidian's math widget
- [ ] Whether Obsidian's widget still does work when ours replaces the range (perf cost)
- [ ] PDF export timing behaviour
