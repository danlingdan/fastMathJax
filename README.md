<div align="center">

# Latest MathJax for Obsidian

**An up-to-date MathJax 4 engine for Obsidian — bundled, fully isolated, PDF-safe.**

[![Latest release](https://img.shields.io/github/v/release/danlingdan/fastMathJax?logo=github&label=release)](https://github.com/danlingdan/fastMathJax/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/danlingdan/fastMathJax/ci.yml?branch=main&label=CI)](https://github.com/danlingdan/fastMathJax/actions/workflows/ci.yml)
![Obsidian](https://img.shields.io/badge/Obsidian-1.8.0%2B-7c3aed?logo=obsidian&logoColor=white)
[![License](https://img.shields.io/github/license/danlingdan/fastMathJax)](LICENSE)

Install like any community plugin — three files, no build steps, no other plugins required.

[Getting started](#getting-started) · [Preamble files](#preamble-files-in-your-vault) · [Compatibility](#compatibility) · [Docs](#documentation)

</div>

---

## Why

Obsidian ships its own MathJax build, and it lags behind upstream. New TeX packages, better font
handling and upstream bug fixes only arrive when Obsidian updates. This plugin bundles a current
**MathJax 4** engine and renders math through it. By default it works side by side with the
built-in one — **without ever touching `window.MathJax` or Obsidian's `renderMath()`**. An
explicit **invasive mode** (off by default, enabled only after a confirmation dialog) goes
further and takes over Obsidian's native rendering entry points, so *every* surface — including
hover previews and embeds — upgrades to the bundled engine.

## Highlights

- **Preamble files in your vault** — keep macros in a versioned `.tex` file; edits hot-reload and
  apply across every note.
- **Reading View & Live Preview** — display and inline math taken over through public APIs only.
- **Invasive mode (experimental, off by default)** — replaces the two internal entry points of
  Obsidian's own MathJax so hover previews, embeds and every other surface render with MathJax
  4.1.3 as well; enabled only after a warning dialog spelling out benefits and risks, with
  automatic fail-closed fallback to the default mode. *(new in 1.0.0)*
- **Deterministic PDF export** — an isolated SVG print engine embeds glyph paths, so exports are
  pixel-stable and offline-safe from either editor mode.
- **CHTML or SVG output** — New Computer Modern webfonts from a CDN, or fully offline SVG.
- **Popout windows** — styled automatically in both modes; popout sheets mirror the engine's
  live stylesheet, and local font URLs are rewritten to the CDN for popout documents.
- **Macro diagnostics** — parse failures name the file or settings text they came from; the
  previous valid renderer keeps working.
- **Accessibility option** — optional hidden MathML alongside every formula for screen readers,
  off by default.
- **Offline fonts** — optional one-time download of the CommonHTML glyph set into the plugin
  folder, so formulas keep full glyph shapes without network.
- **Performance** — LRU formula cache and configurable render debounce for Live Preview.

## Getting started

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/danlingdan/fastMathJax/releases/latest).
2. Put all three files under `<vault>/.obsidian/plugins/latest-mathjax/`.
3. Reload Obsidian and enable **Latest MathJax** under *Settings → Community plugins*.

Reading View takeover is on by default; Live Preview takeover and inline-math takeover are
opt-in switches under *Settings → Latest MathJax → Compatibility*.

## Preamble files in your vault

Macros can live in a versioned file instead of the settings text box:

| Source | Evaluated | Good for |
| --- | --- | --- |
| **Preamble file** (vault-relative path, e.g. `math/macros.tex`) | first | shared, versioned definitions — diffable and backed up with the vault |
| **Global preamble** (settings text) | second | quick personal overrides (`\renewcommand`) |

- The file is re-read automatically after vault edits (debounced per edit burst); a
  **Reload preamble** command forces it on demand.
- **Create preamble file** scaffolds the file (and missing folders) with a commented template;
  **Open preamble file** jumps to it.
- TeX parse failures are reported against their source — the file path or the settings preamble —
  and never break rendering of everything else.
- No absolute paths: a configured path is always vault-relative, and unsafe paths fail visibly.

Both surfaces plus PDF export use the merged definitions. Inline-only setups keep working
exactly as before 0.2.0.

## Compatibility

| Surface | Default mode | Invasive mode | Notes |
| --- | --- | --- | --- |
| Reading View | ✅ | ✅ | display + inline (inline opt-in in default mode) |
| Live Preview | ✅ | ✅ | public editor widgets (opt-in in default mode) |
| Popout windows | ✅ | ✅ | per-document stylesheet mirroring |
| PDF export | ✅ | ✅ | isolated SVG engine, deterministic output |
| Hover preview | ❌ | ✅ | invasive mode covers Obsidian's own popover path automatically |
| Embeds | ❌ | ✅ | same mechanism as hover preview |
| Canvas | ❌ | ❌ | no render hook in either mode |

Desktop only for now; a mobile acceptance pass is pending. See
[`docs/compatibility.md`](docs/compatibility.md) for details and
[`docs/accessibility.md`](docs/accessibility.md) for assistive-technology behavior.

## Settings

- **Rendering mode** — invasive mode (experimental, default off). Enabling it always opens a
  confirmation dialog listing benefits and risks; the per-surface toggles are managed by
  invasive mode while it is active.
- **Engine** — renderer (CHTML / SVG), scale, font file location, TeX packages, preamble file,
  global preamble, assistive MathML.
- **Performance** — formula cache on/off + size, render debounce.
- **Compatibility** — per-surface toggles with safe defaults; fallback mode when a formula
  cannot be rendered.
- **Developer** — debug logging, version inspector (bundled vs. built-in MathJax).

On Obsidian 1.13+ the settings tab is searchable; 1.8–1.12 get the classic tab.

## Isolation guarantees

In the **default (coexistence) mode**:

1. `window.MathJax` is never deleted, replaced or patched.
2. `renderMath()` / `finishRenderMath()` are never monkey-patched.
3. The bundled engine lives in its own module scope.
4. Disabling the plugin restores Obsidian's default math rendering with no leftovers.

**Invasive mode** deliberately overrides guarantee 1 and 2 for exactly two members
(`MathJax.tex2chtml`, `MathJax.chtmlStylesheet`), and only after you confirm the warning
dialog. Its contract:

- The patch is feature-gated at runtime — if an Obsidian update removes either entry point,
  the plugin shows a notice and falls back to the default mode automatically.
- Turning the mode off, disabling the plugin or uninstalling restores the original members
  byte-for-byte and re-renders every formula the plugin produced back to Obsidian's own output.
- The engine keeps living in its own module scope; no other global (`tex2svg`, `version`, …)
  is touched, so other plugins depending on native MathJax keep working.

When the bundled engine cannot render a formula, the configurable fallback shows Obsidian's own
output, the raw LaTeX, or a compact error — the note is never left blank.

## Documentation

- [`docs/STATUS.md`](docs/STATUS.md) — what's done, verification records
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what's next, acceptance gates
- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit
- [`docs/compatibility.md`](docs/compatibility.md) — surface-by-surface detail
- [`docs/dev-plan.zh.md`](docs/dev-plan.zh.md) — original Chinese development plan

## Development

```bash
npm install     # install dependencies
npm run dev     # watch build
npm run build   # type-check + production build
npm test        # automated unit/integration tests (vitest)
npm run check   # complete local release gate (lint + tests + build + metadata)
```

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/latest-mathjax/`.

<details>
<summary>Releasing</summary>

Releases are built by GitHub Actions from a plain SemVer tag (`0.2.0`, not `v0.2.0`) — never
upload generated assets manually. Prepare the version, update `CHANGELOG.md`, pass
`npm run check`, then:

```bash
npm version minor --no-git-tag-version   # or patch
git add package.json package-lock.json manifest.json versions.json CHANGELOG.md
git commit -m "release: publish $(node -p "require('./package.json').version")"
git push origin main
git tag -a "0.2.0" -m "Latest MathJax 0.2.0"
git push origin "0.2.0"
```

The tag workflow verifies version consistency, runs the complete check, attests build
provenance, and publishes `main.js`, `manifest.json` and `styles.css`.

</details>

## License

[MIT](LICENSE) — MathJax itself is Apache-2.0.
