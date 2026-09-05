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
import { logger } from "./utils/logger";
import { buildVersionReport, type VersionReport } from "./utils/version";

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

    async onload(): Promise<void> {
        await this.loadSettings();
        logger.setEnabled(this.settings.debugMode);

        this.engine = new MathJaxEngine(
            toEngineConfig(this.settings),
            this.settings.cacheEnabled ? this.settings.cacheSize : 0,
        );
        this.compatibility = new CompatibilityManager(document);
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

        this.addSettingTab(new LatestMathJaxSettingTab(this.app, this));

        // Reading View: take over $$…$$ display math in rendered notes. The processor is a no-op
        // until the engine is ready (render() lazily initialises) and skips any note it cannot
        // safely re-render, so enabling it can never break a user's notes.
        this.registerMarkdownPostProcessor(createReadingViewProcessor(this));

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
        // Restore Obsidian's own formula DOM before removing the stylesheet used by our output.
        // This must be synchronous: an async preview rerender can finish after the engine is gone.
        this.readingViewSnapshots.restoreAll();
        this.preambleFiles?.dispose();
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
        const rebuilt = this.engine.updateConfig(
            toEngineConfig(this.settings, this.filePreamble),
        );
        // PDF uses a private SVG engine so export never depends on remote CHTML webfonts.
        this.pdfEngine?.dispose();
        this.pdfEngine = null;
        if (rebuilt) logger.debug("engine reconfigured");
    }

    renderInto(
        tex: string,
        display: boolean,
        targetDocument: Document,
        pdfExport = false,
    ): HTMLElement {
        if (!pdfExport) return this.engine.renderInto(tex, { display }, targetDocument);
        if (!this.pdfEngine) {
            const config = toEngineConfig(this.settings, this.filePreamble);
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
            this.engine.updateConfig(toEngineConfig(this.settings, content));
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
        void this.refreshVersionReport();
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
