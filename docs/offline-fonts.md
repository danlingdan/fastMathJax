# Offline fonts for CommonHTML output

Design for roadmap **FONT-01** (0.5.0). Written before implementation, per the roadmap acceptance
rule. FONT-02 — SVG stays the guaranteed no-download path — is pinned by a test and unaffected by
this design.

## Problem

CommonHTML output references the selected family's `woff2` glyph files from a CDN. New Computer
Modern's metrics are bundled; optional STIX Two and Fira Math metrics arrive in a verified data
pack. Glyph *shapes* still need the webfonts: in airplane mode, CHTML formulas degrade to a system
fallback face. SVG embeds glyph paths and has no WOFF2 dependency.

## Goal

An opt-in **local font cache**: the user can choose to download the woff2 set once; afterwards
CHTML renders with full glyph shapes offline. The CDN remains the default so nothing changes for
existing users.

## Non-goals

- No bundling of woff2 data into `main.js` (would tax every install ≈2.4 MB of base64 for an
  opt-in feature and reopen size questions this release deliberately defers).
- No generic proxy/mirror configuration; the download source is pinned (below).
- No mobile support in this design; the plugin is desktop-only (`isDesktopOnly: true`).

## Design

### Settings surface

New setting **Font source** (dropdown, Engine group):

| Value | Behavior |
| --- | --- |
| `cdn` (default) | `@font-face` rules point at the selected family's configured `fontURL` (jsDelivr by default). The custom-URL setting changes hosting only; it does not choose a font family. |
| `local` | `@font-face` rules point at a family/version-isolated cache inside the plugin folder, served through Obsidian's `app://` resource path. Missing files are downloaded once from that family's pinned CDN source. The custom `fontURL` is ignored in this mode. |

Either renderer can be selected with either source, but the font source only affects CommonHTML;
SVG never fetches fonts (pinned by `tests/MathJaxEngine.test.ts`, FONT-02).

### Cache location and layout

```
<vault>/.obsidian/plugins/latest-mathjax/fonts/<family>/<font-version>/
    manifest.json                     # { "<file>.woff2": <byteLength>, ... }
    mjx-ncm-s.woff2
    ...                               # 105 files, ≈1.8 MB for font version 4.1.3
```

- The plugin folder is used because the community installer only replaces `main.js`,
  `manifest.json` and `styles.css` — the cache survives plugin updates and is removed with the
  plugin. A vault-visible folder was rejected: it pollutes the user's notes tree.
- `<family>/<font-version>` prevents a family switch or upgrade from mixing unrelated glyph files.

### Download set and source

- The set of files to have locally is derived from the engine's current stylesheet: every
  `url(...)` target's basename in the emitted `@font-face` rules. Deriving from the stylesheet
  (instead of a hardcoded list) keeps the cache definition in sync with the bundled font data for
  any font version.
- Files are fetched **only** from the selected family's pinned source root
  `https://cdn.jsdelivr.net/npm/@mathjax/mathjax-<family>-font@<font-version>/chtml/woff2`. A
  user-configured `fontURL` is never used as a download source — that is the trust boundary
  (sec-review SEC-01, deferred, must not be silently widened by this feature).
- The "Download fonts" command re-derives the set and fills gaps, so a cache from an interrupted
  run converges without a restart.

### Download integrity

A response is accepted only when: HTTP status is 2xx, the body is non-empty, and the first four
bytes are the `wOF2` magic. Accepted files are written with `adapter.writeBinary` and recorded in
`manifest.json` with their byte length. Anything else is discarded and reported; partial caches
are resumable (the manifest lists exactly which files completed).

### Serving

The cache directory is served with `adapter.getResourcePath(...)` (Obsidian's `app://` protocol),
and the engine's `fontURL` is pointed at that path. The existing engine pipeline already
re-emits `@font-face` rules when `fontURL` changes (same path as the custom-URL feature), so no
engine-internal changes are needed.

### Upgrades and cleanup

When the MathJax font version changes, the new version downloads into its own directory. Old
version directories under the same family are removed after the new cache is complete; caches for
other selected families remain independent.

## Optional font-data packs

NewCM's CHTML metrics, dynamic ranges and SVG paths remain in `main.js`. STIX Two and Fira Math are
build-time exports of the corresponding official MathJax 4.1.3 packages:

| Pack | Compressed | Expanded |
| --- | ---: | ---: |
| STIX Two | 19,301,788 bytes | 61,562,937 bytes |
| Fira Math | 12,105,665 bytes | 41,679,663 bytes |

The matching GitHub release hosts these `.json.gz` assets. Selecting a family downloads its pack
once into `font-packs/`. Before parsing, the plugin verifies the exact compressed byte count,
SHA-256, expanded byte count, schema version, family id and MathJax font version. The pack contains
only serialized tables; the plugin never imports or evaluates downloaded JavaScript. A missing or
invalid pack leaves NewCM active and shows a retryable notice.

### Offline and failure fallback

- Local mode with a complete cache: fully offline rendering with correct glyph shapes.
- Local mode while the cache is incomplete and the network is down: the engine keeps the CDN URL
  (or the last cache, if already applied) — formulas render with metrics-correct layout and
  system-fallback shapes, exactly today's offline behavior. A Notice reports the download failure
  once per attempt, and the **Download fonts** command retries on demand.
- CDN mode offline: unchanged current behavior.

### Lifecycle

Downloads are user-triggered (setting switch or command) or fired once at startup when local mode
is configured and the cache is incomplete. An unload flag stops further writes; a partially
written file simply resumes on the next attempt. Downloads are sequential (105 small files) to
keep the network footprint polite.

### Trust boundaries (summary)

- Download source: pinned constant, version-keyed — never user input.
- Served content: only files this plugin wrote, under its own plugin directory, through Obsidian's
  resource protocol.
- Custom `fontURL`: unchanged CDN-mode escape hatch for advanced users; ignored in local mode.

## Implementation map

| Piece | Location |
| --- | --- |
| Cache service (manifest, integrity, cleanup) | `src/fonts/LocalFontCache.ts` |
| Optional data-pack download and verification | `src/fonts/FontPackManager.ts` |
| Generic CHTML/SVG data hydration | `src/fonts/PackedFont.ts` |
| Build-time pack generation | `scripts/generate-font-packs.mjs` |
| Settings model (`fontSource`) | `src/settingsModel.ts` |
| Effective `fontURL` resolution + wiring | `src/main.ts` (`engineConfig()`, `applyFontSource()`) |
| Settings UI (both surfaces) | `src/settings.ts` |
| FONT-02 pin (SVG has no font URLs) | `tests/MathJaxEngine.test.ts` |
| Cache service tests (fake adapter + fetch) | `tests/LocalFontCache.test.ts` |

## Acceptance

- Automated: cache unit tests (skip-if-present, partial resume, integrity rejection, family/version
  cleanup, resource-path mapping), pack checksum/corruption tests, settings migration, and actual
  CHTML/SVG rendering from both STIX Two and Fira packs.
- Desktop (pending for the unreleased font-selection work): select each family in CHTML and SVG,
  verify PDF/popout consistency, then use local WOFF2 mode and repeat after a network-off restart.
