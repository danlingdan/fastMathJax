/*!
 * Latest MathJax benchmark console harness (docs/benchmarks.md, ROADMAP PERF-02).
 *
 * Paste this whole file into the DevTools console of the benchmark vault, then drive the
 * measurement scenarios through the `__bench` object. Every function returns plain JSON, so a
 * run is recorded with `copy(JSON.stringify(await __bench.reading({...})))`.
 *
 * Obsidian virtualizes Reading View and Live Preview: only sections near the viewport are in
 * the DOM. The open scenarios therefore measure the initially mounted viewport, and the
 * scroll-through scenarios walk the scroller to measure every section.
 */
(() => {
    "use strict";
    if (!window.app || !window.app.plugins) {
        console.error("__bench: window.app is unavailable — run this in the main window console");
        return;
    }
    const plugin = window.app.plugins.plugins["latest-mathjax"];
    if (!plugin) {
        console.error("__bench: plugin latest-mathjax is not enabled");
        return;
    }

    const PLUGIN_ATTR = "[data-latest-mathjax]";
    /**
     * Invasive mode (1.0) gates the coexistence wrapper attributes off; there the equivalent
     * unit is the engine-stamped mjx-container the patched native entry point emits.
     */
    const countPlugin = () => document.body.classList.contains("latest-mathjax-invasive")
        ? document.querySelectorAll("mjx-container[data-latest-mathjax-engine]").length
        : document.querySelectorAll(PLUGIN_ATTR).length;
    const countObsidianMath = () => document.querySelectorAll(".math.math-block, .math.math-inline").length;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const mdLeaves = () => window.app.workspace.getLeavesOfType("markdown").filter((leaf) => !leaf.isDetached && leaf.view && leaf.view.getMode);
    /** MarkdownView.getMode is a method on some builds and a property on others. */
    const modeOf = (leaf) => {
        const m = leaf.view.getMode;
        return typeof m === "function" ? m.call(leaf.view) : m;
    };

    /** The visible note tab: largest rendered area, so hidden split leaves never win. */
    function activeMdLeaf() {
        let best = null;
        let bestArea = -1;
        for (const leaf of mdLeaves()) {
            const el = leaf.view.contentEl;
            const area = el ? el.clientWidth * el.clientHeight : 0;
            if (area > bestArea) {
                best = leaf;
                bestArea = area;
            }
        }
        if (!best || bestArea <= 0) throw new Error("__bench: no visible markdown view");
        return best;
    }

    /**
     * Starts watching for DOM quiet. Resolves once no mutation happened for `quietMs` and the
     * plugin wrapper count reached `expected` (when given); resolves with `timedOut` on timeout.
     * `startStamp` (performance.now) is the measurement origin.
     */
    function startProbe({ expected = null, quietMs = 250, timeoutMs = 60000, startStamp = null }) {
        const t0 = startStamp === null ? performance.now() : startStamp;
        let lastMutation = t0;
        const observer = new MutationObserver(() => {
            lastMutation = performance.now();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        return new Promise((resolve) => {
            const done = (result) => {
                observer.disconnect();
                resolve({
                    ms: Math.round((performance.now() - t0) * 10) / 10,
                    pluginWrappers: result.count,
                    obsidianMath: countObsidianMath(),
                    quietMs,
                    timedOut: result.timedOut === true,
                    expectedMet: expected === null ? null : result.count >= expected,
                });
            };
            const poll = () => {
                const now = performance.now();
                const count = countPlugin();
                const quiet = now - lastMutation >= quietMs;
                if (quiet && (expected === null || count >= expected)) {
                    done({ count });
                    return;
                }
                if (now - t0 > timeoutMs) {
                    done({ count, timedOut: true });
                    return;
                }
                setTimeout(poll, 50);
            };
            setTimeout(poll, 50);
        });
    }

    async function detachAll() {
        for (const leaf of mdLeaves()) leaf.detach();
        await sleep(150);
    }

    /** The element that actually scrolls for the visible note view. */
    function scrollerEl() {
        const content = activeMdLeaf().view.contentEl;
        const explicit = [
            content.querySelector(".markdown-preview-view"),
            content.querySelector(".cm-scroller"),
            content,
        ].filter(Boolean);
        for (const el of explicit) {
            if (el.scrollHeight > el.clientHeight + 10) return el;
        }
        let best = content;
        let bestDelta = content.scrollHeight - content.clientHeight;
        for (const el of content.querySelectorAll("*")) {
            const delta = el.scrollHeight - el.clientHeight;
            if (delta > bestDelta) {
                best = el;
                bestDelta = delta;
            }
        }
        return best;
    }

    /** Walks the scroller to the bottom, one viewport per step, waiting for quiet after each. */
    async function walkToBottom({ quietMs = 250, stepTimeoutMs = 5000, collect = null }) {
        const scroller = scrollerEl();
        if (scroller.scrollHeight <= scroller.clientHeight + 10) {
            throw new Error("__bench: scroller has no overflow (wrong element or empty view)");
        }
        const stepMs = [];
        const samples = [];
        for (;;) {
            const stepStart = performance.now();
            const before = scroller.scrollTop;
            scroller.scrollTop = before + scroller.clientHeight;
            if (scroller.scrollTop === before) {
                throw new Error("__bench: scrollTop did not move (element is not the scroller)");
            }
            const probe = startProbe({ expected: null, quietMs, timeoutMs: stepTimeoutMs });
            await probe;
            stepMs.push(Math.round((performance.now() - stepStart) * 10) / 10);
            if (collect) samples.push(collect());
            const atBottom = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 2;
            if (atBottom) {
                return {
                    stepMs,
                    steps: stepMs.length,
                    totalMs: Math.round(stepMs.reduce((a, b) => a + b, 0) * 10) / 10,
                    samples,
                };
            }
            if (stepMs.length > 500) throw new Error("__bench: walkToBottom did not reach the bottom");
        }
    }

    /**
     * Replaces the workspace with exactly one tab showing `file` in `mode` ("preview" =
     * Reading View, "source" = Live Preview when the vault uses it). Earlier runs left several
     * stray leaves behind, which broke leaf picking; detaching everything first keeps the
     * workspace deterministic.
     */
    async function openNote(file, mode) {
        const vaultFile = window.app.vault.getFileByPath(file);
        if (!vaultFile) throw new Error(`__bench: file not found: ${file}`);
        for (const leaf of window.app.workspace.getLeavesOfType("markdown")) leaf.detach();
        await sleep(200);
        const leaf = window.app.workspace.getLeaf(true);
        await leaf.openFile(vaultFile);
        await sleep(200);
        for (let attempt = 0; attempt < 3 && modeOf(leaf) !== mode; attempt += 1) {
            window.app.commands.executeCommandById("markdown:toggle-preview");
            await sleep(500);
        }
        if (modeOf(leaf) !== mode) {
            throw new Error(`__bench: could not switch ${file} to mode ${mode} (got ${modeOf(leaf)})`);
        }
        return leaf;
    }

    function stats(times) {
        const sorted = [...times].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
        return {
            runs: times.length,
            median,
            p95,
            min: sorted[0],
            max: sorted[sorted.length - 1],
        };
    }

    const summary = (label, times, extra = {}) => ({ scenario: label, ...stats(times), samples: times, ...extra });

    window.__bench = {
        plugin,

        info() {
            return {
                obsidian: window.app.version,
                plugin: plugin.manifest.version,
                engine: plugin.engine && plugin.engine.version,
                settings: {
                    renderer: plugin.settings.renderer,
                    cacheEnabled: plugin.settings.cacheEnabled,
                    cacheSize: plugin.settings.cacheSize,
                    renderDebounce: plugin.settings.renderDebounce,
                    enableReadingView: plugin.settings.enableReadingView,
                    enableInlineReadingView: plugin.settings.enableInlineReadingView,
                    enableLivePreview: plugin.settings.enableLivePreview,
                    enableInlineLivePreview: plugin.settings.enableInlineLivePreview,
                    fallbackMode: plugin.settings.fallbackMode,
                    preambleFile: plugin.settings.preambleFile,
                },
                pluginWrappers: countPlugin(),
                obsidianMath: countObsidianMath(),
                mode: modeOf(activeMdLeaf()),
            };
        },

        /** One-time: benchmark settings profile = defaults plus the opt-in surfaces under test. */
        async applyProfile() {
            plugin.settings.enableInlineReadingView = true;
            plugin.settings.enableLivePreview = true;
            plugin.settings.enableInlineLivePreview = true;
            await plugin.saveSettings();
            // Typing needs the editor in Live Preview mode; that is an Obsidian vault setting.
            if (window.app.vault.setConfig) await window.app.vault.setConfig("livePreview", true);
            return this.info().settings;
        },

        async cacheClear() {
            plugin.engine.clearCache();
            return { cleared: true };
        },

        /**
         * Warm Reading View open: detach + reopen the note `runs` times and measure open → quiet
         * for the initially mounted viewport. Each run verifies the leaf actually opened in
         * Reading View (a fresh leaf can fall back to the vault's default editing mode; that
         * run is flagged in modeToggledRuns).
         */
        async reading({ file, runs = 10, quietMs = 250 }) {
            await openNote(file, "preview");
            const times = [];
            const counts = [];
            const modeToggledRuns = [];
            for (let i = 0; i < runs; i += 1) {
                await detachAll();
                const startStamp = performance.now();
                const probe = startProbe({ expected: null, quietMs, startStamp });
                const leaf = window.app.workspace.getLeaf(true);
                await leaf.openFile(window.app.vault.getFileByPath(file));
                if (modeOf(leaf) !== "preview") {
                    window.app.commands.executeCommandById("markdown:toggle-preview");
                    modeToggledRuns.push(i + 1);
                }
                const result = await probe;
                times.push(result.ms);
                counts.push(result.pluginWrappers);
            }
            return summary("open-reading", times, { file, wrapperCounts: counts, modeToggledRuns });
        },

        /** Cold Reading View open: call once per restart after `cacheClear()`. */
        async cold({ file, quietMs = 400 }) {
            await openNote(file, "preview");
            await detachAll();
            const startStamp = performance.now();
            const probe = startProbe({ expected: null, quietMs, startStamp });
            const leaf = window.app.workspace.getLeaf(true);
            await leaf.openFile(window.app.vault.getFileByPath(file));
            let modeToggled = false;
            if (modeOf(leaf) !== "preview") {
                window.app.commands.executeCommandById("markdown:toggle-preview");
                modeToggled = true;
            }
            const result = await probe;
            return { scenario: "cold-open", file, modeToggled, ...result };
        },

        /** Warm full-note traversal: open, then walk the scroller to the bottom. */
        async scroll({ file, quietMs = 250 }) {
            await openNote(file, "preview");
            await sleep(300);
            const startStamp = performance.now();
            const walk = await walkToBottom({ quietMs });
            return {
                scenario: "scroll-reading",
                file,
                totalMs: walk.totalMs,
                steps: walk.steps,
                stepMs: walk.stepMs,
                wallMs: Math.round((performance.now() - startStamp) * 10) / 10,
                pluginWrappers: countPlugin(),
            };
        },

        /** Cold full-note traversal: call once per restart after `cacheClear()`. */
        async coldScroll({ file, quietMs = 400 }) {
            await openNote(file, "preview");
            await sleep(300);
            const startStamp = performance.now();
            const walk = await walkToBottom({ quietMs });
            return {
                scenario: "cold-scroll",
                file,
                totalMs: walk.totalMs,
                steps: walk.steps,
                stepMs: walk.stepMs,
                wallMs: Math.round((performance.now() - startStamp) * 10) / 10,
                pluginWrappers: countPlugin(),
            };
        },

        /** Typing: append a probe paragraph after the math-free anchor, measure edit → quiet. */
        async typing({ file, runs = 10, quietMs = 300 }) {
            await openNote(file, "source");
            await sleep(600); // let Live Preview widgets mount before baselining counts
            const times = [];
            const drift = [];
            for (let i = 0; i < runs; i += 1) {
                const editor = window.app.workspace.activeEditor && window.app.workspace.activeEditor.editor;
                if (!editor) throw new Error("__bench: no active editor for typing scenario");
                const before = { plugin: countPlugin(), obsidian: countObsidianMath() };
                const probe = startProbe({ expected: null, quietMs, startStamp: performance.now() });
                editor.replaceRange(
                    `\n\nBenchmark typing probe ${i + 1} — no mathematics in this paragraph.\n`,
                    editor.offsetToPos(editor.getValue().length),
                );
                const result = await probe;
                times.push(result.ms);
                drift.push({
                    run: i + 1,
                    pluginBefore: before.plugin,
                    pluginAfter: result.pluginWrappers,
                    obsidianBefore: before.obsidian,
                    obsidianAfter: result.obsidianMath,
                    stable: before.plugin === result.pluginWrappers && before.obsidian === result.obsidianMath,
                });
            }
            return summary("typing", times, { file, drift });
        },

        /** Removes the paragraphs inserted by `typing()`, preserving all other blank lines. */
        async typingCleanup({ file }) {
            await openNote(file, "source");
            const editor = window.app.workspace.activeEditor && window.app.workspace.activeEditor.editor;
            if (!editor) throw new Error("__bench: no active editor for typing cleanup");
            const text = editor.getValue();
            const probe = /\n\nBenchmark typing probe \d+ — no mathematics in this paragraph\.\n/g;
            const removed = (text.match(probe) || []).length;
            editor.setValue(text.replace(probe, "\n"));
            await sleep(400);
            return { removedParagraphs: removed };
        },

        /** View switch: alternate Reading View ↔ editing, measuring each transition to quiet. */
        async viewSwitch({ file, toggles = 10, quietMs = 300 }) {
            await openNote(file, "preview");
            const times = [];
            const modes = [];
            const counts = [];
            for (let i = 0; i < toggles; i += 1) {
                const from = modeOf(activeMdLeaf());
                const probe = startProbe({ expected: null, quietMs, startStamp: performance.now() });
                window.app.commands.executeCommandById("markdown:toggle-preview");
                const result = await probe;
                const to = modeOf(activeMdLeaf());
                times.push(result.ms);
                modes.push(`${from}->${to}`);
                counts.push(result.pluginWrappers);
            }
            return summary("view-switch", times, { file, modes, wrapperCounts: counts });
        },

        /**
         * Sanity gate before recording: walks the whole note so virtualized sections mount,
         * then requires the macro section to have rendered and the invalid section to have
         * stayed with Obsidian.
         */
        async sanity({ file }) {
            await openNote(file, "preview");
            await sleep(300);
            let text = "";
            let maxWrappers = 0;
            let fallbackSeen = false;
            const walk = await walkToBottom({
                quietMs: 300,
                collect: () => {
                    text += document.body.textContent;
                    maxWrappers = Math.max(maxWrappers, countPlugin());
                    fallbackSeen = fallbackSeen || document.querySelector(`${PLUGIN_ATTR} .latest-mathjax-fallback`) !== null;
                },
            });
            return {
                scenario: "sanity",
                file,
                walk: { steps: walk.steps, totalMs: walk.totalMs },
                macrosRendered: text.includes("299") && text.includes("m/s"),
                invalidLeftToObsidian: !fallbackSeen,
                rawMacroLeak: text.includes("\\benchQuad"),
                maxPluginWrappers: maxWrappers,
            };
        },
    };
    console.log("__bench v3 installed. Try __bench.info() or __bench.sanity({file:\"benchmark-100.md\"}).");
})();
