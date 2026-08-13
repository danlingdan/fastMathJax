# Architecture

## Isolation boundary

The plugin owns a module-scoped MathJax 4.1.3 engine. It never deletes or overwrites `window.MathJax`, and it never patches Obsidian's `renderMath` or `finishRenderMath` APIs. Obsidian's renderer therefore remains available as the default fallback and is restored when the plugin is disabled.

## Engine

`MathJaxEngine` builds a private MathJax document for CommonHTML or SVG output. TeX packages and the global preamble are applied at construction time. Rendered nodes are cloned from an LRU cache, adopted into the target document and marked with the engine version. Output-configuration changes advance an engine revision so mounted surfaces refresh safely.

All New Computer Modern dynamic chunks for both output modes are statically imported. This makes the single-file Obsidian bundle self-contained and prevents runtime module-loading failures for less common glyphs. CommonHTML still uses the configured webfont URL; SVG embeds glyph paths and is fully offline.

## Reading View

The public Markdown post-processor receives rendered wrappers plus section metadata. A conservative Markdown scanner recovers TeX from the exact inclusive line range, excluding fenced code, inline code, escaped delimiters, invalid whitespace delimiters and unsafe currency-like matches. Inline and display sources are paired independently so one mismatch cannot shift the other kind. Only wrapper contents are replaced.

## Live Preview

Obsidian continues to own parsing, selection behavior, virtual scrolling and source display while editing. A CodeMirror view plugin observes mounted `.math` widgets, maps each widget back to a document position with `EditorView.posAtDOM`, selects the corresponding range from the same conservative scanner, then replaces only the widget contents. This avoids private syntax-node names and avoids competing block decorations, which CodeMirror forbids in view plugins.

## PDF export

Obsidian renders exports into a temporary `.print` document and does not provide section metadata.
The Reading View adapter detects this public DOM surface, reads the note from `context.sourcePath`,
and reuses the same conservative source pairing. Currency-like dollars rejected by the scanner are
escaped only in a temporary re-rendered paragraph; the vault file is never modified.

PDF formulas use a second isolated SVG engine with the active packages, preamble, scale and
accessibility settings. Embedding glyph paths avoids CommonHTML webfont races in Chromium's print
window. The print engine is disposed whenever settings change or the plugin unloads.

## Compatibility and fallback

The compatibility manager identifies popouts by document identity. The engine adopts nodes and copies its stylesheet into permitted popout documents. On a render failure, the configured policy either keeps Obsidian's existing output, shows raw TeX, or shows a compact error element. Unsupported or ambiguous surfaces are left untouched.

## Configuration lifecycle

Persisted settings are normalized before use. Numeric values are clamped, enum values are validated, required TeX packages are retained, and malformed persisted data cannot reach the engine. Relevant setting changes rebuild the engine when necessary, advance its revision, clear handled markers and refresh public Reading View/editor surfaces.
