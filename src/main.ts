import {
    Notice,
    MarkdownView,
    Plugin,
    TFile,
    TFolder,
    WorkspaceLeaf,
    finishRenderMath,
    loadMathJax,
    renderMath,
} from "obsidian";

import { MathJaxEngine } from "./engine/MathJaxEngine";
import {
    DEFAULT_SETTINGS,
    LatestMathJaxSettingTab,
    normalizeSettings,
    type LatestMathJaxSettings,
    toEngineConfig,
} from "./settings";
import { MathJaxTestView, TEST_VIEW_TYPE } from "./view/TestView";
import { createReadingViewProcessor } from "./preview/MathPostProcessor";
import { ReadingViewSnapshotStore } from "./preview/ReadingViewSnapshotStore";
import { LivePreviewRenderer } from "./editor/LivePreviewRenderer";
import { CompatibilityManager } from "./compatibility/CompatibilityManager";
import { PreambleFileService } from "./preamble/PreambleFileService";
import {
    normalizePreamblePath,
    type PreambleProblem,
} from "./preamble/preambleModel";
import { LocalFontCache } from "./fonts/LocalFontCache";
import {
    DEFAULT_FONT_URL,
    MATHJAX_FONT_VERSION,
    type EngineConfig,
} from "./engine/MathJaxConfig";
import { logger } from "./utils/logger";
import { buildVersionReport, type VersionReport } from "./utils/version";
import {
    INVASIVE_SOURCE_ATTR,
    NativeMathBridge,
} from "./invasive/NativeMathBridge";
import { createInvasiveStyleSyncProcessor } from "./invasive/invasiveStyleSync";
import { createFallbackElement } from "./render/fallback";

const PREAMBLE_TEMPLATE = [
    "% Latest MathJax preamble file",
    "%",
    "% Definitions in this file are evaluated before the inline settings preamble and are",
    "% available in every formula across the vault. Example:",
    "%",
    "% \\newcommand{\\R}{\\mathbb{R}}",
    "% \\DeclareMathOperator{\\Var}{Var}",
    "",
].join("\n");

export default class LatestMathJaxPlugin extends Plugin {
    settings: LatestMathJaxSettings = { ...DEFAULT_SETTINGS };
    engine!: MathJaxEngine;
    private pdfEngine: MathJaxEngine | null = null;
    compatibility!: CompatibilityManager;
    readonly readingViewSnapshots = new ReadingViewSnapshotStore();
    versionReport: VersionReport | null = null;
    /** Loaded content of the configured preamble file; runtime state, never persisted. */
    private filePreamble = "";
    /** Why the configured preamble file is not applied, if it cannot be read. */
    private preambleFileProblem: PreambleProblem | null = null;
    private preambleFiles!: PreambleFileService;
    private fontCache: LocalFontCache | null = null;
    /** Vault-relative cache dir of the current font version, once a cache exists. */
    private localFontResourceDir: string | null = null;
    /** The font URL currently applied to the engine, to avoid redundant reconfigurations. */
    private appliedFontUrl: string | null = null;
    /** Set on unload; async font work checks it before touching state. */
    private disposed = false;
    /** The native-MathJax bridge while invasive mode is applied; null otherwise. */
    private bridge: NativeMathBridge | null = null;
    /** True while Obsidian's native render entry points are patched (invasive mode live). */
    invasiveActive = false;

    async onload(): Promise<void> {
        await this.loadSettings();
        logger.setEnabled(this.settings.debugMode);

        this.engine = new MathJaxEngine(
            this.engineConfig(),
            this.settings.cacheEnabled ? this.settings.cacheSize : 0,
        );
        this.compatibility = new CompatibilityManager(document);
        this.fontCache = new LocalFontCache({
            adapter: this.app.vault.adapter,
            pluginDir: this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`,
            fontVersion: MATHJAX_FONT_VERSION,
            sourceRoot: DEFAULT_FONT_URL,
        });
        this.preambleFiles = new PreambleFileService({
            getRawPath: () => this.settings.preambleFile,
            readFile: (path) => this.app.vault.adapter.read(path),
            statPath: (path) => {
                const abstract = this.app.vault.getAbstractFileByPath(path);
                if (abstract instanceof TFolder) return "folder";
                return abstract instanceof TFile ? "file" : "missing";
            },
            applyResult: (content, problem) =>
                this.applyPreambleFileState(content, problem),
            onContentApplied: () => this.refreshRenderedSurfaces(),
        });

        // Building the engine is a few milliseconds of work, but it also injects a stylesheet.
        // Deferring to layout-ready keeps startup clean and avoids touching a half-built workspace.
        this.app.workspace.onLayoutReady(() => {
            void this.startupEngine();
        });

        this.registerView(
            TEST_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new MathJaxTestView(leaf, this),
        );

        this.addCommand({
            id: "open-render-test",
            name: "Open render test",
            callback: () => void this.openTestView(),
        });

        this.addCommand({
            id: "show-version-info",
            name: "Show MathJax version info",
            callback: () => void this.showVersionInfo(),
        });

        this.addCommand({
            id: "clear-cache",
            name: "Clear formula cache",
            callback: () => {
                this.engine.clearCache();
                new Notice("Latest MathJax: formula cache cleared.");
            },
        });

        this.addCommand({
            id: "create-preamble-file",
            name: "Create preamble file",
            callback: () => void this.createPreambleFile(),
        });

        this.addCommand({
            id: "open-preamble-file",
            name: "Open preamble file",
            callback: () => void this.openPreambleFile(),
        });

        this.addCommand({
            id: "reload-preamble",
            name: "Reload preamble",
            callback: () => void this.reloadPreambleCommand(),
        });

        this.addCommand({
            id: "download-fonts",
            name: "Download fonts for offline use",
            callback: () => void this.downloadFontsCommand(),
        });

        this.addSettingTab(new LatestMathJaxSettingTab(this.app, this));

        // Reading View: take over $$…$$ display math in rendered notes. The processor is a no-op
        // until the engine is ready (render() lazily initialises) and skips any note it cannot
        // safely re-render, so enabling it can never break a user's notes.
        this.registerMarkdownPostProcessor(createReadingViewProcessor(this));

        // Invasive mode's style sync: never renders, only mirrors the engine stylesheet into
        // popout documents. A cheap no-op while invasive mode is off.
        this.registerMarkdownPostProcessor(createInvasiveStyleSyncProcessor(this));

        // Live Preview: cooperate with Obsidian's public editor widgets, replacing only their
        // rendered contents. Registered once; settings are read on every scheduled refresh.
        this.registerEditorExtension(new LivePreviewRenderer(this).getExtension());

        // Preamble file events. registerEvent removes these on unload; the service debounces the
        // actual reloads. Renames carry both the new path and the old one — either may be the
        // configured file moving in or out.
        this.registerEvent(
            this.app.vault.on("create", (file) =>
                this.preambleFiles.handleVaultEvent(file.path, "create")),
        );
        this.registerEvent(
            this.app.vault.on("modify", (file) =>
                this.preambleFiles.handleVaultEvent(file.path, "modify")),
        );
        this.registerEvent(
            this.app.vault.on("delete", (file) =>
                this.preambleFiles.handleVaultEvent(file.path, "delete")),
        );
        this.registerEvent(
            this.app.vault.on("rename", (file, oldPath) => {
                this.preambleFiles.handleVaultEvent(file.path, "rename");
                this.preambleFiles.handleVaultEvent(oldPath, "rename");
            }),
        );

        logger.debug(`plugin loaded, bundled MathJax ${this.engine.version}`);
    }

    onunload(): void {
        this.disposed = true;
        // Restore the native renderer first so restoreNativeRendering() calls the unpatched
        // original, then swap every formula we rendered back to built-in output (async, guarded).
        const bridge = this.bridge;
        bridge?.uninstall();
        this.bridge = null;
        this.invasiveActive = false;
        if (bridge) this.restoreNativeRendering();
        // Restore Obsidian's own formula DOM before removing the stylesheet used by our output.
        // This must be synchronous: an async preview rerender can finish after the engine is gone.
        this.readingViewSnapshots.restoreAll();
        this.preambleFiles?.dispose();
        this.fontCache?.dispose();
        this.fontCache = null;
        this.pdfEngine?.dispose();
        this.pdfEngine = null;
        this.engine?.dispose();
        logger.debug("plugin unloaded");
    }

    // ---------------------------------------------------------------- settings

    async loadSettings(): Promise<void> {
        const stored = (await this.loadData()) as Partial<LatestMathJaxSettings> | null;
        this.settings = normalizeSettings(stored);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        logger.setEnabled(this.settings.debugMode);
        this.engine.setCacheSize(
            this.settings.cacheEnabled ? this.settings.cacheSize : 0,
        );
        // The cached filePreamble belongs to the path it was loaded from. When the configured
        // path changed, re-read before rebuilding — otherwise the engine would evaluate the
        // previous file's content under the new path's label until the next reload.
        await this.preambleFiles.reloadIfPathChanged();
        // Font source changes are applied here too. In local mode with an incomplete cache this
        // kicks off the background download and re-applies the font URL when it completes;
        // meanwhile the engine stays on the CDN fallback (docs/offline-fonts.md).
        void this.applyFontSource();
        const rebuilt = this.engine.updateConfig(this.engineConfig());
        // PDF uses a private SVG engine so export never depends on remote CHTML webfonts.
        this.pdfEngine?.dispose();
        this.pdfEngine = null;
        // Invasive mode is applied in this single funnel (not only in the settings UI) so
        // console and programmatic callers get the same hot-switch behavior.
        await this.applyInvasiveMode();
        if (rebuilt) logger.debug("engine reconfigured");
    }

    /** The engine configuration for the current settings, with the effective font URL applied. */
    private engineConfig(): EngineConfig {
        const config = toEngineConfig(this.settings, this.filePreamble);
        config.fontURL = this.effectiveFontUrl();
        return config;
    }

    /**
     * The font URL the interactive engine should use right now.
     *
     * Local mode serves the downloaded cache through Obsidian's resource protocol once it exists;
     * until then (and in CDN mode) it is the configured `fontURL`, so an offline user keeps the
     * metrics-correct CDN behavior while the cache downloads.
     */
    private effectiveFontUrl(): string {
        if (this.settings.fontSource === "local" && this.localFontResourceDir) {
            return this.app.vault.adapter.getResourcePath(this.localFontResourceDir);
        }
        return this.settings.fontURL;
    }

    /**
     * Aligns the engine's font URL with the Font source setting (FONT-01, docs/offline-fonts.md).
     * Local mode with an incomplete cache downloads in the background and re-applies on success;
     * failures keep the CDN fallback and surface once per attempt via Notice.
     */
    private async applyFontSource(): Promise<void> {
        if (!this.fontCache) return;
        if (this.settings.fontSource !== "local") {
            this.applyEngineFontUrl();
            return;
        }
        if (!this.engine.isInitialised) this.engine.initialise();
        const fileNames = this.engine.getFontFaceUrls()
            .map((url) => url.split("/").pop() ?? url);
        const result = await this.fontCache.ensureFiles(fileNames);
        if (this.disposed || this.settings.fontSource !== "local") return;
        if (result.ok) {
            this.localFontResourceDir = this.fontCache.versionDir();
            void this.fontCache.cleanOtherVersions();
            this.applyEngineFontUrl();
            if (result.downloaded > 0) {
                new Notice(
                    `Latest MathJax: downloaded ${result.downloaded} font file(s) for offline use.`,
                );
            }
        } else {
            this.applyEngineFontUrl();
            new Notice(
                "Latest MathJax: font download failed; CHTML glyphs fall back to a system " +
                    "font offline. Use \"Download fonts for offline use\" to retry.",
            );
        }
    }

    /** Reconfigures the engine when the effective font URL changed, refreshing rendered surfaces. */
    private applyEngineFontUrl(): void {
        const url = this.effectiveFontUrl();
        if (this.appliedFontUrl === url) return;
        this.appliedFontUrl = url;
        if (this.engine.updateConfig(this.engineConfig())) {
            this.refreshRenderedSurfaces();
        }
    }

    private async downloadFontsCommand(): Promise<void> {
        if (!this.fontCache) return;
        if (!this.engine.isInitialised) this.engine.initialise();
        const names = this.engine.getFontFaceUrls().map((url) => url.split("/").pop() ?? url);
        const result = await this.fontCache.ensureFiles(names);
        if (result.ok) {
            this.localFontResourceDir = this.fontCache.versionDir();
            void this.fontCache.cleanOtherVersions();
            if (this.settings.fontSource === "local") this.applyEngineFontUrl();
            new Notice(
                `Latest MathJax: font cache ready (${result.downloaded} downloaded, ` +
                    `${names.length} total).`,
            );
        } else {
            new Notice(
                `Latest MathJax: font download failed — ${result.error ?? "unknown error"}.`,
            );
        }
    }

    renderInto(
        tex: string,
        display: boolean,
        targetDocument: Document,
        pdfExport = false,
    ): HTMLElement {
        if (!pdfExport) return this.engine.renderInto(tex, { display }, targetDocument);
        if (!this.pdfEngine) {
            const config = this.engineConfig();
            config.renderer = "svg";
            this.pdfEngine = new MathJaxEngine(
                config,
                this.settings.cacheEnabled ? this.settings.cacheSize : 0,
            );
        }
        return this.pdfEngine.renderInto(tex, { display }, targetDocument);
    }

    /** Rebuilds both editor decorations and rendered Markdown after a relevant setting changes. */
    refreshRenderedSurfaces(): void {
        // Do not leave the old engine's DOM mounted while its configuration and stylesheet change.
        this.readingViewSnapshots.restoreAll();
        document
            .querySelectorAll("[data-latest-mathjax]")
            .forEach((node) => node.removeAttribute("data-latest-mathjax"));

        this.app.workspace.iterateAllLeaves((leaf) => {
            if (leaf.view instanceof MarkdownView) leaf.view.previewMode.rerender(true);
        });
        this.app.workspace.updateOptions();
    }

    // ------------------------------------------------------------- invasive mode

    /**
     * Aligns the invasive-mode bridge with `settings.invasiveMode`. Called from the
     * `saveSettings` funnel and from startup; a no-op when the state already matches.
     *
     * On install failure the setting is reverted (and re-persisted) so the persisted state and
     * the runtime state never diverge — the plugin silently keeps coexistence mode with a
     * one-time Notice explaining why.
     */
    private async applyInvasiveMode(): Promise<void> {
        const desired = this.settings.invasiveMode;
        if (desired === this.invasiveActive) return;

        if (!desired) {
            this.bridge?.uninstall();
            this.bridge = null;
            this.invasiveActive = false;
            logger.debug("invasive mode: off");
            this.refreshRenderedSurfaces();
            return;
        }

        this.engine.initialise();
        const bridge = new NativeMathBridge({
            render: (tex, display) => this.invasiveRender(tex, display),
            stylesheet: () => this.engine.stylesheet,
        });
        const result = await bridge.install();
        if (!result.ok) {
            new Notice(
                "Latest MathJax: invasive mode is unavailable on this Obsidian build " +
                    `(${result.reason}). Keeping the default coexistence mode.`,
                8000,
            );
            this.settings.invasiveMode = false;
            await this.saveData(this.settings);
            return;
        }
        this.bridge = bridge;
        this.invasiveActive = true;
        logger.debug("invasive mode: on");
        this.refreshRenderedSurfaces();
    }

    /**
     * The render callback handed to the bridge — the stand-in for Obsidian's native
     * `tex2chtml`. Returns null to let the bridge fall through to the native renderer
     * (the "fall back to Obsidian" failure mode); never throws.
     */
    private invasiveRender(tex: string, display: boolean): HTMLElement | null {
        // Obsidian's PDF export re-renders the whole note into a `.print` container; route it
        // to the private SVG engine exactly like the coexistence adapters do (0.1.3 decision).
        const pdfExport = document.querySelector(".print") !== null;
        try {
            const node = this.renderInto(tex, display, document, pdfExport);
            // Lets unload hand the TeX back to the native renderer (the wrapper is the only
            // place the source still exists — Obsidian never stores it in invasive mode).
            node.setAttribute(INVASIVE_SOURCE_ATTR, tex);
            return node;
        } catch (err) {
            logger.warn(`invasive mode: render failed for "${tex.slice(0, 60)}":`, err);
            if (this.settings.fallbackMode === "obsidian") return null;
            return createFallbackElement(
                document,
                this.settings.fallbackMode,
                tex,
                display,
                err,
            );
        }
    }

    /**
     * Copies the bundled engine's stylesheet into a popout document; called by the invasive
     * style-sync post-processor after each render pass there. Honors the popout setting.
     */
    syncInvasiveStyles(targetDoc: Document): void {
        if (!this.invasiveActive) return;
        if (!this.compatibility.canRender(targetDoc, this.settings.enablePopout)) return;
        this.engine.ensureStyles(targetDoc);
    }

    /**
     * Unload-time restore for invasive mode. Obsidian never stored the TeX of formulas we
     * rendered through the patched entry point, so the facade stamps it onto every container;
     * here it is handed back to the now-unpatched native renderer. Fire-and-forget with
     * connectivity guards: only wrappers that still hold *their* container are replaced.
     */
    private restoreNativeRendering(): void {
        for (const targetDoc of this.renderedDocuments()) {
            for (const container of Array.from(
                targetDoc.querySelectorAll<HTMLElement>(`[${INVASIVE_SOURCE_ATTR}]`),
            )) {
                const tex = container.getAttribute(INVASIVE_SOURCE_ATTR);
                const wrapper = container.closest(".math");
                if (!tex || !wrapper) continue;
                const display = wrapper.classList.contains("math-block");
                void this.renderWithBuiltIn(tex, display)
                    .then((node) => {
                        if (!wrapper.isConnected || !wrapper.contains(container)) return;
                        wrapper.replaceChildren(node);
                    })
                    .catch(() => undefined);
            }
        }
    }

    /** Host document plus the documents of every open leaf (popouts render markdown too). */
    private renderedDocuments(): Document[] {
        const docs = new Set<Document>([document]);
        this.app.workspace.iterateAllLeaves((leaf) => {
            const containerEl = (leaf.view as { containerEl?: HTMLElement }).containerEl;
            if (containerEl) docs.add(containerEl.ownerDocument);
        });
        return [...docs];
    }

    // ---------------------------------------------------------------- preamble

    /**
     * Applies a fresh preamble-file load to plugin state and the engine config.
     * Returns true only when the applied *content* changed; a problem-only update (same content,
     * different reason) must not re-render every surface.
     */
    private applyPreambleFileState(content: string, problem: PreambleProblem | null): boolean {
        const contentChanged = this.filePreamble !== content;
        this.filePreamble = content;
        this.preambleFileProblem = problem;
        if (contentChanged) {
            this.engine.updateConfig(this.engineConfig());
            // A lazily created PDF engine would otherwise keep exporting with the old macros.
            this.pdfEngine?.dispose();
            this.pdfEngine = null;
        }
        return contentChanged;
    }

    /** Diagnostics shown in the settings tab: file-read problems plus TeX parse problems. */
    get preambleDiagnostics(): PreambleProblem[] {
        const problems: PreambleProblem[] = [];
        if (this.preambleFileProblem) problems.push(this.preambleFileProblem);
        problems.push(...this.engine.preambleProblems);
        return problems;
    }

    private async startupEngine(): Promise<void> {
        // Load the preamble file before the first build so startup renders once, already with
        // the file's macros applied.
        try {
            await this.preambleFiles.reload();
        } catch (err) {
            logger.warn("preamble file preload failed:", err);
        }
        try {
            this.engine.initialise();
        } catch (err) {
            logger.error("engine initialisation failed:", err);
            new Notice("Latest MathJax: engine failed to start, see console for details.");
        }
        // The stylesheet (and its @font-face download set) exists after initialisation; local
        // mode downloads in the background and re-applies the font URL on completion.
        void this.applyFontSource();
        void this.refreshVersionReport();
        // Persisted invasive mode is applied after the engine exists; a failing install
        // reverts the setting and stays in coexistence mode for this session.
        if (this.settings.invasiveMode) await this.applyInvasiveMode();
    }

    /** Reloads the preamble file now; rendered surfaces refresh only if the content changed. */
    async reloadPreambleFile(): Promise<boolean> {
        return (await this.preambleFiles.reload()).changed;
    }

    private async reloadPreambleCommand(): Promise<void> {
        const raw = this.settings.preambleFile.trim();
        if (!raw) {
            new Notice("Latest MathJax: no preamble file is configured.");
            return;
        }
        const outcome = await this.preambleFiles.reload();
        if (outcome.problem) {
            new Notice(
                `Latest MathJax: ${outcome.problem.source}: ${outcome.problem.message}`,
            );
            return;
        }
        new Notice(
            outcome.changed
                ? `Latest MathJax: preamble reloaded (${outcome.content.length} chars) and rendered surfaces refreshed.`
                : "Latest MathJax: preamble file is unchanged.",
        );
    }

    private async createPreambleFile(): Promise<void> {
        const raw = this.settings.preambleFile.trim();
        if (!raw) {
            new Notice(
                "Latest MathJax: set the 'Preamble file' setting to a vault-relative path first.",
            );
            return;
        }
        const normalized = normalizePreamblePath(raw);
        if (normalized === null) {
            new Notice(`Latest MathJax: "${raw}" is absolute; use a vault-relative path.`);
            return;
        }
        const existing = this.app.vault.getAbstractFileByPath(normalized);
        if (existing instanceof TFolder) {
            new Notice(`Latest MathJax: "${normalized}" is a folder.`);
            return;
        }
        if (existing) {
            new Notice(`Latest MathJax: "${normalized}" already exists.`);
            await this.openPreamblePath(normalized);
            return;
        }
        try {
            await this.ensurePreambleFolder(normalized);
            await this.app.vault.create(normalized, PREAMBLE_TEMPLATE);
            new Notice(`Latest MathJax: created "${normalized}".`);
            await this.preambleFiles.reload();
            await this.openPreamblePath(normalized);
        } catch (err) {
            logger.error("failed to create preamble file:", err);
            new Notice(
                `Latest MathJax: could not create "${normalized}": ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    /** Creates every missing ancestor folder of `path` before the file itself is created. */
    private async ensurePreambleFolder(path: string): Promise<void> {
        const parts = path.split("/");
        parts.pop(); // the file name itself
        let prefix = "";
        for (const part of parts) {
            prefix = prefix ? `${prefix}/${part}` : part;
            const existing = this.app.vault.getAbstractFileByPath(prefix);
            if (existing instanceof TFolder) continue;
            if (existing) throw new Error(`"${prefix}" exists but is not a folder`);
            await this.app.vault.createFolder(prefix);
        }
    }

    private async openPreambleFile(): Promise<void> {
        const raw = this.settings.preambleFile.trim();
        if (!raw) {
            new Notice("Latest MathJax: no preamble file is configured.");
            return;
        }
        const normalized = normalizePreamblePath(raw);
        if (normalized === null) {
            new Notice(`Latest MathJax: "${raw}" is absolute; use a vault-relative path.`);
            return;
        }
        const abstract = this.app.vault.getAbstractFileByPath(normalized);
        if (!abstract || abstract instanceof TFolder) {
            new Notice(
                `Latest MathJax: "${normalized}" not found — run "Create preamble file" first.`,
            );
            return;
        }
        await this.openPreamblePath(normalized);
    }

    private async openPreamblePath(path: string): Promise<void> {
        try {
            const abstract = this.app.vault.getAbstractFileByPath(path);
            if (!(abstract instanceof TFile)) return;
            const leaf = this.app.workspace.getLeaf("tab");
            await leaf.openFile(abstract);
        } catch (err) {
            logger.error("failed to open preamble file:", err);
            new Notice(
                `Latest MathJax: could not open "${path}": ` +
                    `${err instanceof Error ? err.message : String(err)}`,
            );
        }
    }

    // ----------------------------------------------------------------- version

    async refreshVersionReport(): Promise<VersionReport> {
        this.versionReport = await buildVersionReport(this.engine.version);
        logger.debug(
            `versions — plugin ${this.versionReport.plugin}, built-in ${this.versionReport.builtIn ?? "unknown"}`,
        );
        return this.versionReport;
    }

    private async showVersionInfo(): Promise<void> {
        const report = this.versionReport ?? (await this.refreshVersionReport());
        const lines = [
            `Plugin MathJax: ${report.plugin}`,
            `Built-in MathJax: ${report.builtIn ?? "not detected"}`,
            report.builtInIsNewer
                ? "Obsidian's built-in MathJax is newer than the bundled version."
                : "Bundled engine is at least as new as the built-in one.",
        ];
        new Notice(lines.join("\n"), 8000);
    }

    // -------------------------------------------------------------------- view

    private async openTestView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(TEST_VIEW_TYPE);
        if (existing.length > 0) {
            await this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: TEST_VIEW_TYPE, active: true });
        await this.app.workspace.revealLeaf(leaf);
    }

    // ---------------------------------------------------------------- fallback

    /**
     * Renders with Obsidian's own MathJax, using only public API.
     *
     * This is the recommended failure path: a formula the bundled engine cannot handle still shows
     * up for the user. It is also how the test view produces its side-by-side comparison.
     */
    async renderWithBuiltIn(tex: string, display: boolean): Promise<HTMLElement> {
        await loadMathJax();
        const node = renderMath(tex, display);
        // Without this the CSS for glyphs Obsidian has not used before is missing.
        await finishRenderMath();
        return node;
    }
}
