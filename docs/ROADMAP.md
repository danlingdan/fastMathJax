# Future roadmap

This roadmap starts from the released `0.1.4` baseline. It describes intended work, not shipped
behavior. [`STATUS.md`](STATUS.md) remains the source of truth for completed features, and
[`CHANGELOG.md`](../CHANGELOG.md) records published changes.

The project uses release gates rather than fixed dates. A version moves forward only after its
acceptance criteria pass in both automated checks and a real Obsidian desktop vault.

## Priorities and estimates

| Label | Meaning |
| --- | --- |
| P0 | Required for correctness, safe upgrades, or community-directory review |
| P1 | Important user-facing capability or reliability improvement |
| P2 | Useful enhancement that may move to a later release |
| S / M / L | Relative implementation and verification effort; not a calendar estimate |

## Release overview

| Target | Theme | Primary outcome | Exit condition |
| --- | --- | --- | --- |
| `0.1.x` | Review and stabilization | Community-review findings and regressions are handled without expanding architecture | Review blockers closed; release automation and the current 32-test baseline stay green |
| `0.2.0` | Preamble workflow | Vault-based preamble files can be edited, reloaded and diagnosed without restarting Obsidian | File and inline preambles work across reloads and both supported surfaces |
| `0.3.0` | Rendering resilience | Large notes, embeds and rapid editor changes remain responsive and fail safely | Benchmark and stress-test thresholds pass with no missing note content or refresh loops |
| `0.4.0` | Compatibility and accessibility | Supported desktop contexts and assistive output have explicit, repeatable acceptance coverage | Compatibility matrix is verified in CHTML and SVG; unsupported surfaces remain fail-closed |
| `0.5.0` | Distribution efficiency | Bundle-size and offline-font options are evaluated and improved without weakening isolation | A measured packaging decision is implemented or documented with evidence |
| `1.0.0` | Stable contract | Configuration, rendering lifecycle and upgrade behavior are stable and documented | No open P0 defects; upgrade, rollback and clean-install gates pass |

## `0.1.x` — review and stabilization

Scope is deliberately narrow. Patch releases should correct defects, documentation, packaging or
review findings without introducing a new configuration model.

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| REL-01 | P0 | Process community-directory validation and human-review findings | M | Every actionable finding is reproduced or explained; fixes have focused regression coverage |
| REL-02 | P0 | Keep tag-driven GitHub Actions releases authoritative | S | A plain `x.y.z` tag builds and publishes only `main.js`, `manifest.json` and `styles.css`; provenance attestation succeeds |
| REG-01 | P0 | Preserve Reading View during repeated view switching and plugin reload | S | ✅ Delivered in 0.1.3: original Obsidian formula DOM is restored synchronously before teardown |
| REG-02 | P0 | Preserve correct radicals and extensible symbols | S | Regression fixtures cover roots, arrows, matrices and dynamic New Computer Modern glyph chunks |
| REG-03 | P0 | Prevent stale Live Preview teardown from overwriting a newer render | S | ✅ Implemented for 0.1.4 with revision/DOM ownership checks and focused regression tests |
| SET-01 | P1 | Adopt searchable settings on Obsidian 1.13+ without raising the minimum app version | M | ✅ Implemented for 0.1.4 with declarative definitions plus the 1.8–1.12 imperative fallback |
| LOG-01 | P2 | Keep opt-in diagnostics out of the normal console log channel | S | ✅ Implemented for 0.1.4 with `console.debug` regression coverage |
| DOC-01 | P1 | Keep README, status, compatibility and changelog synchronized | S | Version, defaults, supported surfaces and release instructions match source and release metadata |

## `0.2.0` — preamble workflow

The main goal is to make macro configuration editable and versionable inside a vault while keeping
the current settings preamble backward-compatible.

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| PRE-01 | P0 | Add an optional vault-relative preamble file setting | M | Paths are normalized; missing folders and non-file targets produce a visible error without breaking rendering |
| PRE-02 | P0 | Define deterministic file/inline merge behavior | S | Merge order is documented and tested; existing inline-only settings render exactly as before |
| PRE-03 | P0 | Reload the preamble on vault file modification | M | A debounced watcher rebuilds the private engine once per edit burst and refreshes supported surfaces safely |
| PRE-04 | P1 | Add create, open and reload preamble commands | M | Commands work from the command palette and report success or a concise actionable failure |
| PRE-05 | P0 | Improve preamble diagnostics | M | Parse failures show the source, file path when applicable and MathJax error while the previous valid renderer remains usable |
| PRE-06 | P0 | Make lifecycle cleanup explicit | S | File listeners, pending timers and stale engine revisions are removed on unload and configuration changes |
| PRE-07 | P1 | Add settings migration and recovery tests | M | Upgrading from `0.1.x`, missing files, invalid TeX and reverting to inline-only configuration are covered |
| PKG-01 | P2 | Evaluate requested packages such as `bussproofs` | M | Compatibility, bundle impact and representative formulas are measured before any package is exposed in settings |

### `0.2.0` non-goals

- No mutation of Obsidian's global `MathJax` object.
- No unrestricted TeX `\require` or runtime JavaScript loading.
- No recursive arbitrary `\input` implementation until path containment and cycle handling are designed.

## `0.3.0` — rendering resilience and performance

Work in this release must be driven by recorded measurements. Optimizations that only make small
synthetic formulas faster but destabilize Obsidian's virtual rendering are rejected.

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| PERF-01 | P0 | Create reproducible 100- and 500-formula benchmark notes | M | Fixtures cover inline/display math, repeated/cacheable formulas, unique formulas, macros and invalid input |
| PERF-02 | P0 | Record cold render, warm render, editor typing and view-switch measurements | M | Test procedure, machine profile and median/tail results are checked into documentation |
| PERF-03 | P1 | Bound and cancel stale asynchronous render work | L | Old revisions cannot overwrite new settings or detached DOM; rapid edits converge to the latest document state |
| PERF-04 | P1 | Review observer and refresh scope | M | Mutations caused by the plugin do not recursively schedule unbounded refreshes |
| PERF-05 | P1 | Expose useful cache diagnostics | S | Hit/miss/size data can be inspected without enabling noisy logging and resets correctly after reconfiguration |
| SURF-01 | P0 | Add fixtures for embeds, callouts, tables, lists, blockquotes and footnotes | L | Each context is either rendered from unambiguous source or deliberately left to Obsidian; source pairing never shifts |
| SURF-02 | P0 | Harden partial and ambiguous section recovery | M | Count/range mismatches fail closed independently for inline and display formulas |
| TEST-01 | P1 | Add runtime smoke-test documentation and fixtures | M | A maintainer can repeat clean-vault acceptance without relying on undocumented sample notes |

## `0.4.0` — compatibility and accessibility

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| COMP-01 | P0 | Run the complete compatibility matrix in CHTML and SVG | M | Reading View, opt-in Live Preview, popouts, fallback modes and enable/disable behavior pass in both renderers |
| A11Y-01 | P0 | Validate Assistive MathML semantics and duplication behavior | M | Assistive output is present only when enabled, has no duplicate speech nodes and survives cache cloning |
| A11Y-02 | P1 | Document keyboard and screen-reader expectations | M | Test environments and known limitations are recorded; unsupported claims are avoided |
| MOB-01 | P1 | Perform a bounded mobile feasibility spike | L | Startup, memory, touch editing, both renderers and font access are measured on at least one Android and one iOS/iPadOS device or simulator |
| MOB-02 | P0 | Keep `isDesktopOnly` truthful | S | It changes to `false` only after the mobile acceptance matrix passes; otherwise findings are documented and desktop-only remains |
| COMP-02 | P2 | Re-evaluate Hover Preview and Canvas public hooks | M | Support is added only if raw TeX and lifecycle can be obtained reliably through supported APIs |
| COMP-03 | P2 | Investigate PDF export behavior | M | ✅ Delivered early in 0.1.3: both source modes use an isolated SVG print engine without patching Obsidian internals |

## `0.5.0` — distribution efficiency and offline behavior

The current bundle is about 12 MB because both renderers and their dynamic glyph data are included.
Size work must preserve the isolated MathJax 4 engine and rare-glyph correctness.

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| SIZE-01 | P0 | Produce an auditable bundle composition report | M | MathJax core, packages, CHTML data, SVG data and plugin code are measured separately |
| SIZE-02 | P1 | Evaluate renderer-specific builds or distributions | L | Installation, settings migration, community-directory rules and maintenance cost are compared with measured sizes |
| SIZE-03 | P1 | Evaluate safe deduplication and minification options | M | Root/extensible and uncommon glyph regression suites pass byte-for-byte functional checks |
| FONT-01 | P1 | Design optional CommonHTML offline-font handling | L | Cache location, download integrity, upgrades, cleanup and offline fallback are specified before implementation |
| FONT-02 | P0 | Keep SVG as the guaranteed no-font-download path | S | Offline acceptance verifies representative and rare glyphs without network access |
| SEC-01 | P0 | Review externally configured font and preamble paths | M | URL schemes and vault paths have documented trust boundaries; unsafe or ambiguous input fails visibly |

### Packaging decision rule

A smaller bundle is not accepted if it requires replacing `window.MathJax`, silently drops package
support, depends on unavailable runtime modules, or reintroduces missing glyph chunks. If no safe
option materially improves size, the release documents that result instead of forcing a rewrite.

## `1.0.0` — stable contract

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| API-01 | P0 | Freeze and document persisted settings semantics | M | Defaults, ranges, migrations and rollback behavior are documented and covered by tests |
| LIFE-01 | P0 | Verify complete enable/disable/uninstall cleanup | M | No plugin stylesheet, listener, timer, observer or global mutation remains after unload |
| UPG-01 | P0 | Exercise clean install and every supported upgrade path | L | Settings and rendering survive upgrades from each supported minor release; corrupt data normalizes safely |
| QA-01 | P0 | Complete two consecutive release-candidate acceptance passes | L | No open P0 defect and no unexplained runtime console error remains |
| DOC-02 | P0 | Publish stable user, troubleshooting and maintainer documentation | M | Installation, settings, macros, offline use, compatibility, diagnostics and release operation are covered |
| REL-03 | P0 | Verify final automated release and rollback procedure | M | CI, release assets, provenance and previous-version rollback are repeatable from documented commands |

## Release gates

Every feature or minor release must pass all applicable gates below.

| Gate | Required evidence |
| --- | --- |
| Scope | Planned IDs are complete or explicitly moved; non-goals remain unchanged unless the roadmap is reviewed |
| Static checks | TypeScript typecheck and `git diff --check` pass |
| Automated tests | All existing tests plus focused new regression tests pass |
| Production build | `npm run build` succeeds from lockfile-installed dependencies |
| Release metadata | Manifest, package version, `versions.json`, bundle banner and tag agree |
| Desktop acceptance | Clean vault and upgrade vault pass Reading View, Live Preview, CHTML, SVG, macros, fallback and unload checks |
| Performance | Relevant benchmark results are recorded and show no unexplained regression |
| Documentation | README, changelog, status, compatibility and this roadmap match the candidate |
| Distribution | GitHub Actions publishes the three expected assets and provenance attestation succeeds |

## Roadmap maintenance

- Completed behavior moves to [`STATUS.md`](STATUS.md) and the release section of
  [`CHANGELOG.md`](../CHANGELOG.md); it is not left as an ambiguous future item here.
- New work receives an ID, priority, target release and observable acceptance criteria.
- Unsupported surfaces stay labelled unsupported until their full acceptance gate passes.
- Version targets may change after investigation, but isolation, safe fallback and cleanup rules
  are architectural constraints rather than negotiable roadmap items.
