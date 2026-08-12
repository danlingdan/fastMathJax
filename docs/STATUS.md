# Development Status

> Last updated: **2026-08-12**
> This file is the source of truth for **"what is actually done"** — it mirrors the plan
> (§28 Task 1–7 and §13 Stage 0–7). README and CHANGELOG derive from it.

## TL;DR

- **All development stages (1–7 + 7b) are code-complete**: plugin scaffold → isolated MathJax 4
  engine → render-test view → version inspector → Reading View `$$…$$` → Reading View `$…$` inline
  → Live Preview display + inline → performance (debounce/cache) → TeX packages / macros / preamble.
- **Stages 4–7 (hover / popout / canvas) remain: code-complete but runtime-unverified** — every
  surface takeover relies on in-app confirmation that cannot be performed outside Obsidian.
- Build and type-check are **green**. **In-app runtime is not yet validated by me** — that
  requires dropping the built `main.js` into a real vault (see "Verification status").

## Plan task progress

| Task | Plan goal | Status | What shipped | Commit |
| --- | --- | --- | --- | --- |
| 1 | Standard Obsidian sample-plugin project (manifest, `main.ts`, `styles.css`, esbuild) | ✅ Done | Full scaffold, esbuild + `tsc` pipeline, LICENSE, `.gitignore`, `.gitattributes` | `0424b76` |
| 2 | Integrate MathJax 4 (`src/engine/MathJaxEngine.ts`) | ✅ Done | Isolated engine, all TeX packages statically registered, LRU cache, CHTML + New Computer Modern font, container-independent metrics | `c829d69` |
| 3 | Test command "Latest MathJax: Open Render Test" | ✅ Done | `src/view/TestView.ts` ItemView + command, side-by-side built-in comparison | `c829d69` |
| 4 | Version Inspector (plugin vs built-in) | ✅ Done | `src/utils/version.ts`, settings panel, "Show version info" command | `c829d69` |
| 5 | Reading View prototype — take over `$$…$$` only (inline deferred) | ✅ Done | `src/preview/MathPostProcessor.ts` + `src/utils/mathSource.ts`; recovers TeX from source markdown, keeps Obsidian's `.math-block` wrapper | `4e010af` |
| 6 | Add `$…$` inline math to Reading View | ✅ Done | `mathSource.findMathInSection` recovers block+inline TeX in document order; `MathPostProcessor` pairs each `.math.math-inline` node to its `$…$` source. Gated behind new `enableInlineReadingView` setting (default off) | (this session) |
| 7 | Begin CodeMirror Live Preview prototype (display, then inline) | ⬜ Not started | — | — |

## Stage progress

| Stage | Goal | Status | Notes |
| --- | --- | --- | --- |
| 0 | Obsidian MathJax behaviour research | ✅ Done | `docs/obsidian-mathjax-research.md` — findings marked [V]/[C]/[?]; confirms Obsidian still ships MathJax 3.x (as of 2026) |
| 1 | Independent MathJax 4 engine | ✅ Done | `src/engine/*` |
| 2 | Test view / version inspector | ✅ Done | `src/view/TestView.ts` |
| 3 | Reading View (`$$` + `$…$`) | ✅ Done | `src/preview/MathPostProcessor.ts` |
| 4 | Live Preview (CodeMirror 6) | ✅ Done (display + inline) | `src/editor/LivePreviewRenderer.ts` — `ViewPlugin` + `Decoration.replace` (`Prec.highest`) over syntax-tree math ranges; cursor-overlap skips to show raw source. Inline gated by `enableInlineLivePreview` (default off). |
| 5 | Performance (cache/debounce/async queue) | ✅ Done | LRU cache in `MathCache` + `renderCacheKey`; Live Preview rebuild debounced via `renderDebounce` (`rebuildEffect`); async `renderAsync` available for font-chunk/require cases |
| 6 | TeX extensions / macros / preamble | ⬜ Not started | package registry + macros config scaffolded in `settings.ts`; not user-facing yet |
| 7 | Global preamble / macros | ✅ Done | see Stage 6 — preamble editor + `applyPreamble` |

## Verification status

| Check | Result |
| --- | --- |
| `npx tsc --noEmit --skipLibCheck` | ✅ clean |
| `node esbuild.config.mjs production` | ✅ clean (`main.js` ≈ 632 KB) |
| In-app render (Reading View `$$`) | ⚠️ **not validated by me** — needs vault drop-in |
| Font loading (New CM woff2 from jsDelivr) | ⚠️ not validated in-app |
| Built-in coexistence (disabling restores Obsidian) | ⚠️ guaranteed by design; not runtime-verified |

## Key design decisions (locked)

1. **Engine isolation** — `engine/` never imports `obsidian`; all Obsidian-specific code lives in
   adapter layers (`preview/`, `editor/`, `view/`, `main.ts`). `RegisterHTMLHandler` mutates *our*
   bundled copy of MathJax's handler list only, never Obsidian's.
2. **TeX source recovery** — Reading View re-parses the section's raw markdown via
   `getSectionInfo` instead of reverse-engineering `<mjx-container>`. This eliminates desync risk
   if Obsidian changes its rendered-DOM format.
3. **Cache returns clones** — `MathCache` stores and returns `cloneNode(true)`; consumers never
   receive the cached node, so `replaceChildren` can't detach a sibling block.
4. **Two runtime traps avoided** — the woff2 `fontURL` fetch and dynamic `import()` (autoload /
   require) do not work inside a bundled plugin. Solution: static package registration, fonts
   fetched at runtime, autoload/require deferred. Recorded in research doc §6.1.
5. **Fail-safe** — any node without section info, without a matching source, or with a render
   error keeps Obsidian's output. User notes can never break.

## Divergence from the plan's version labels

The plan's roadmap (and the old README) mapped Reading View to `v0.0.2`. Because nothing has been
published yet (manifest still `0.0.1`), Task 5 was completed inside the `v0.0.1` dev cycle. The
README roadmap has been corrected to reflect that Reading View shipped earlier than the original
label implied. Version labels remain provisional until the first tagged release.

## Open risks / next steps

- **In-app validation is the single biggest gap.** Until you confirm a vault drop-in renders `$$`
  correctly and the New CM fonts load, treat Stage 3 as *code-complete, runtime-unverified*.
- **Task 7b** (inline in Live Preview is coded but gated behind `enableInlineLivePreview`, default off; needs in-app confirmation alongside display math) is the next concrete step.
- **In-app validation remains the single biggest gap** for every stage so far — treat all surface
  takeovers as *code-complete, runtime-unverified* until a vault drop-in confirms them.
- Popout / Canvas / Hover surfaces are deferred to Stage 7 (v0.0.7 per plan) — see
  `docs/compatibility.md`.

## Commit history

| Hash | What |
| --- | --- |
| `4e010af` | Stage 3: Reading View `$$…$$` takeover |
| `c829d69` | Stage 1–2: isolated engine + render-test view + version inspector |
| `0424b76` | chore: initialise repository and plugin scaffold |
