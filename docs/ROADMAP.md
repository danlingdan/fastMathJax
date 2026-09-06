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
| REG-04 | P0 | Take over Reading View math only after Obsidian's async render finalizes | S | ✅ Delivered on `main` for 0.2.0: adapters wait (bounded) for `is-loaded`; cold-start acceptance reproduced the 0.1.x race and verified the fix |
| REG-05 | P0 | Keep currency-like dollar text intact on Obsidian 1.13 | M | ✅ Delivered on `main` for 0.2.0: repair locator anchors its suffix outside code spans and strips backticks before matching; currency-risky sections leave inline wrappers to whole-paragraph repair. Accepted on 1.13.7 in Reading View and PDF export |
| SET-01 | P1 | Adopt searchable settings on Obsidian 1.13+ without raising the minimum app version | M | ✅ Implemented for 0.1.4 with declarative definitions plus the 1.8–1.12 imperative fallback |
| LOG-01 | P2 | Keep opt-in diagnostics out of the normal console log channel | S | ✅ Implemented for 0.1.4 with `console.debug` regression coverage |
| DOC-01 | P1 | Keep README, status, compatibility and changelog synchronized | S | Version, defaults, supported surfaces and release instructions match source and release metadata |

## `0.2.0` — preamble workflow

The main goal is to make macro configuration editable and versionable inside a vault while keeping
the current settings preamble backward-compatible.

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| PRE-01 | P0 | Add an optional vault-relative preamble file setting | M | ✅ Implemented for 0.2.0: paths are normalized (`src/preamble/preambleModel.ts`); missing files, folder targets and absolute paths produce a visible diagnostic without breaking rendering |
| PRE-02 | P0 | Define deterministic file/inline merge behavior | S | ✅ Implemented for 0.2.0: file evaluated first, inline second (`mergePreambles`); merge order is unit-tested and inline-only settings keep the pre-0.2.0 engine config shape |
| PRE-03 | P0 | Reload the preamble on vault file modification | M | ✅ Implemented for 0.2.0: `PreambleFileService` debounces vault events (create/modify/delete/rename) into one reload per edit burst and refreshes surfaces only when the content changed |
| PRE-04 | P1 | Add create, open and reload preamble commands | M | ✅ Implemented for 0.2.0: Create (with missing ancestor folders), Open and Reload commands report success or a concise actionable failure via Notice |
| PRE-05 | P0 | Improve preamble diagnostics | M | ✅ Implemented for 0.2.0: the engine evaluates labeled preamble segments, so parse failures report their source (file path or settings preamble); the previous valid renderer remains usable |
| PRE-06 | P0 | Make lifecycle cleanup explicit | S | ✅ Implemented for 0.2.0: vault listeners use `registerEvent`, the debounced timer is cancelled on unload, and no stale reload outlives the engine |
| PRE-07 | P1 | Add settings migration and recovery tests | M | ✅ Implemented for 0.2.0: 63-test suite covers 0.1.x migration (no `preambleFile` key), missing files, invalid TeX and reverting to inline-only configuration |
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
| PERF-01 | P0 | Create reproducible 100- and 500-formula benchmark notes | M | ✅ Delivered on `main` for 0.3.0: `npm run bench:generate` deterministically emits `benchmarks/notes/benchmark-100.md` and `benchmark-500.md` covering unique/repeated inline and display formulas, preamble-file macros and intentional invalid input; composition and determinism are unit-tested and specified in `docs/benchmarks.md` |
| PERF-02 | P0 | Record cold render, warm render, editor typing and view-switch measurements | M | ✅ Delivered on `main` for 0.3.0: the `benchmarks/tools/measure-console.js` harness recorded open, scroll-through, typing and view-switch latencies on Obsidian 1.13.7 (warm n=10, cold n=3 restarts per note size); medians, p95s, machine profile and findings are checked into `docs/benchmarks.md` |
| PERF-03 | P1 | Bound and cancel stale asynchronous render work | L | ✅ Delivered on `main` for 0.3.0: Reading View runs abort when their section is detached mid-await (settle wait, vault read, staging repairs), staging loops stop instead of rendering into dead trees, detached wrappers are skipped, and PDF export aborts when the print document is discarded; Live Preview already converged via revision checks and debounce replacement (REG-03). New post-processor integration tests plus freshness-guard tests pin the convergence behavior |
| PERF-04 | P1 | Review observer and refresh scope | M | ✅ Delivered on `main` for 0.3.0: audited every plugin-driven mutation path. The Live Preview observer decision is extracted to `src/editor/observerFilter.ts` and pinned by tests — our own replacement mutations and Obsidian-recreated wrappers carrying preserved engine-tagged output never reschedule, while fresh math does; the settle wait observes only `class` so takeover attribute writes cannot extend or resolve it; scheduling stays a single replaced timer plus one animation frame, cancelled on destroy; `refreshRenderedSurfaces` is bounded by open markdown leaves and nothing in its render flow writes settings or files, so there is no recursion path |
| PERF-05 | P1 | Expose useful cache diagnostics | S | ✅ Delivered for 0.3.0: entries, hits, misses, hit rate and session renders are shown in the settings tab (both modern and fallback surfaces) and the render-test view without debug logging; clearing the cache and output-affecting reconfiguration reset the counters while size-only changes preserve them — pinned by cache and engine tests and verified live in settings |
| SURF-01 | P0 | Add fixtures for embeds, callouts, tables, lists, blockquotes and footnotes | L | ✅ Delivered for 0.3.0: `benchmarks/fixtures/surface-contexts.md` (+ embed target) covers all six contexts; desktop-verified on Obsidian 1.13.7 — callout, table, list and footnote math render from unambiguous source, currency and code spans stay literal, blockquote display math and embeds are deliberately left to Obsidian, and no context shifted pairing |
| SURF-02 | P0 | Harden partial and ambiguous section recovery | M | ✅ Delivered for 0.3.0: post-processor tests pin that display and inline count mismatches fail closed independently, a failing formula keeps Obsidian's output while siblings render, and staging wrapper mismatches keep whole blocks |
| TEST-01 | P1 | Add runtime smoke-test documentation and fixtures | M | ✅ Delivered for 0.3.0: `docs/smoke-testing.md` gives the full clean-vault procedure — setup, baseline checks, the structural-contexts matrix, PDF export spot check and unload/re-enable — referencing only checked-in fixtures |

## `0.4.0` — compatibility and accessibility

| ID | Priority | Work item | Estimate | Acceptance criteria |
| --- | --- | --- | --- | --- |
| COMP-01 | P0 | Run the complete compatibility matrix in CHTML and SVG | M | ✅ Delivered for 0.4.0: the core engine paths — render/cache cloning, TeX parse errors, preamble macros, popout adoption and style copy — are automated for both renderers in `tests/MathJaxEngine.test.ts`; desktop acceptance on Obsidian 1.13.7 covered Reading View, opt-in Live Preview, fallback and toggle behavior in CHTML and SVG, plus popouts in CHTML. The pass surfaced and fixed two real defects (stylesheet accumulation with a stale-cascade win after rebuilds; style flushes starving under Electron's rAF throttling for occluded windows) and a deterministic Live Preview defect: the skip predicate matched output by bundled version string, which survives engine rebuilds, leaving superseded widgets mounted; output now carries `data-latest-mathjax-revision` and the render-loop predicate matches version + revision |
| A11Y-01 | P0 | Validate Assistive MathML semantics and duplication behavior | M | ✅ Delivered for 0.4.0: tests pin that assistive output appears only when enabled, exactly one MathML tree per formula including cache-hit clones, semantic `mi/mo/mn` structure with no duplicated speech nodes (SRE is not bundled), and the visually-hidden clipping rules present under the renamed `latest-mjx-assistive-mml` selector in both renderers. Desktop-verified: every rendered container carries exactly one hidden tree with no on-screen duplication |
| A11Y-02 | P1 | Document keyboard and screen-reader expectations | M | ✅ Delivered for 0.4.0: [`docs/accessibility.md`](accessibility.md) documents the assistive MathML behavior, keyboard interaction (none added), verified environments and explicit limitations — no screen-reader pass has been run, so specific-reader compatibility is marked unverified |
| MOB-01 | P1 | Perform a bounded mobile feasibility spike | L | ◐ Desktop-side analysis complete for 0.4.0: bundle, startup path, rendering and font findings recorded with a full Android/iOS device protocol in [`docs/mobile-spike.md`](mobile-spike.md); the device pass itself remains open pending hardware |
| MOB-02 | P0 | Keep `isDesktopOnly` truthful | S | ✅ Delivered for 0.4.0: `manifest.json` keeps `isDesktopOnly: true` and `tests/manifest.test.ts` fails any flip that is not accompanied by a recorded passing device matrix; the decision rule lives in `docs/mobile-spike.md` |
| COMP-02 | P2 | Re-evaluate Hover Preview and Canvas public hooks | M | ✅ Evaluated for 0.4.0, both stay unsupported: the Obsidian 1.13.1 public typings expose no canvas rendering API at all, and hover previews — while reached by the post-processor with null section info — would require a third whole-note `sourcePath` fallback whose transient popover lifecycle cannot yet be bounded as tightly as PDF export. Decision and evidence recorded in [`docs/compatibility.md`](compatibility.md); revisit on a public canvas API or a designed hover lifecycle guard |
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
