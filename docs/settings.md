# Settings reference (API-01, frozen for 1.0.0)

Persisted in `<vault>/.obsidian/plugins/latest-mathjax/data.json`. Every field is normalized by
`normalizeSettings` on load: unknown fields are dropped, wrong-typed fields fall back to the
default, numbers are clamped to their documented range, unknown package ids are removed while
required packages (`base`, `ams`, …) are always re-added. A corrupt or empty `data.json`
therefore normalizes to defaults instead of failing; it is never rewritten on load.

| Key | Type / Range | Default | Since | Notes |
| --- | --- | --- | --- | --- |
| `renderer` | `"chtml" \| "svg"` | `"chtml"` | 0.1.0 | SVG output embeds glyphs; no font downloads |
| `packages` | string[] (known ids) | base, ams, newcommand, configmacros, mhchem | 0.1.0 | Required packages are re-added automatically |
| `preamble` | string | `""` | 0.1.0 | Evaluated after `preambleFile` |
| `preambleFile` | vault-relative path | `""` | 0.2.0 | Evaluated first; empty = disabled; trimmed |
| `fontURL` | URL string | jsDelivr NewCM 4.1.3 | 0.1.0 | Used in `fontSource: "cdn"` mode |
| `fontSource` | `"cdn" \| "local"` | `"cdn"` | 0.5.0 | `local` serves woff2 from the on-disk cache (`docs/offline-fonts.md`); popout documents always mirror `@font-face` rules back to the CDN because they cannot fetch `app://` |
| `scale` | 0.5 – 2 | 1 | 0.1.0 | MathJax output scale |
| `fontSize` | 8 – 48 (px) | 16 | 0.1.0 | Base em size |
| `enableAssistiveMml` | boolean | `false` | 0.4.0 | Hidden MathML for screen readers |
| `cacheEnabled` | boolean | `true` | 0.1.0 | |
| `cacheSize` | 0 – 10 000 (int) | 1000 | 0.1.0 | LRU entries |
| `renderDebounce` | 0 – 2000 (ms, int) | 150 | 0.1.0 | Live Preview debounce |
| `enableReadingView` | boolean | `true` | 0.1.0 | Invasive mode supersedes (gate stays off) |
| `enableInlineReadingView` | boolean | `false` | 0.2.0 | |
| `enableLivePreview` | boolean | `false` | 0.1.0 | |
| `enableInlineLivePreview` | boolean | `false` | 0.2.0 | |
| `enableHoverPreview` | boolean | `false` | 0.4.0 | Reserved; hover takeover needs invasive mode (see `docs/compatibility.md`) |
| `enableCanvas` | boolean | `false` | 0.4.0 | Reserved; no render hook exists (COMP-02) |
| `enablePopout` | boolean | `true` | 0.1.0 | Style mirroring into popout documents |
| `invasiveMode` | boolean | `false` | 1.0.0 | **Experimental.** Enabling from a settings UI always shows the warning dialog first. While active, per-surface toggles are disabled ("managed by invasive mode") and engine tag renaming is disabled (`isolationEnabled: false`) |
| `fallbackMode` | `"obsidian" \| "raw" \| "error"` | `"obsidian"` | 0.1.0 | What an unrenderable formula degrades to |
| `debugMode` | boolean | `false` | 0.1.0 | Structured debug logging |

## Migration and rollback semantics

- **Upgrade (any 0.x → 1.0):** unknown persisted keys are ignored, missing keys fall back to
  defaults; `invasiveMode` therefore normalizes to `false` on first run after upgrading from
  ≤ 0.5.0 even if a corrupt value were present. No stored key was renamed or repurposed in
  1.0, so no destructive migration runs.
- **Downgrade (1.0 → 0.5.0):** 0.5.0 ignores the unknown `invasiveMode` key and keeps working;
  native MathJax members are untouched in default mode, so a downgrade never leaves a patch
  behind.
- **Corrupt `data.json`:** unparseable JSON surfaces as an empty settings object → all defaults;
  the file is left untouched until the user changes a setting.
- **Engine config mapping** (`toEngineConfig`): the only invasive-derived engine field is
  `isolationEnabled: !invasiveMode`; every other field behaves identically in both modes.

## Invasive mode lifecycle semantics

- Toggling on (either settings UI) → warning dialog → confirm → `saveSettings` → bridge
  installs at runtime (no restart). Cancel → nothing persists.
- Feature-guard failure (Obsidian update) → notice + automatic revert to `false` and complete
  bridge teardown; the setting on disk ends up `false`.
- Disable plugin / turn off → members restored byte-for-byte, trap removed, stamped containers
  re-rendered to native output, per-document mirrors removed.
