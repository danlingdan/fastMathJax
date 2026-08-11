import {
    Notice,
    Plugin,
    WorkspaceLeaf,
    finishRenderMath,
    loadMathJax,
    renderMath,
} from "obsidian";

import { MathJaxEngine } from "./engine/MathJaxEngine";
import {
    DEFAULT_SETTINGS,
    LatestMathJaxSettingTab,
    type LatestMathJaxSettings,
    toEngineConfig,
} from "./settings";
import { MathJaxTestView, TEST_VIEW_TYPE } from "./view/TestView";
import { createReadingViewProcessor } from "./preview/MathPostProcessor";
import { logger } from "./utils/logger";
import { buildVersionReport, type VersionReport } from "./utils/version";

export default class LatestMathJaxPlugin extends Plugin {
    settings: LatestMathJaxSettings = { ...DEFAULT_SETTINGS };
    engine!: MathJaxEngine;
    versionReport: VersionReport | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();
        logger.setEnabled(this.settings.debugMode);

        this.engine = new MathJaxEngine(
            toEngineConfig(this.settings),
            this.settings.cacheEnabled ? this.settings.cacheSize : 0,
        );

        // Building the engine is a few milliseconds of work, but it also injects a stylesheet.
        // Deferring to layout-ready keeps startup clean and avoids touching a half-built workspace.
        this.app.workspace.onLayoutReady(() => {
            try {
                this.engine.initialise();
            } catch (err) {
                logger.error("engine initialisation failed:", err);
                new Notice("Latest MathJax: engine failed to start, see console for details.");
            }
            void this.refreshVersionReport();
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

        this.addSettingTab(new LatestMathJaxSettingTab(this.app, this));

        // Reading View: take over $$…$$ display math in rendered notes. The processor is a no-op
        // until the engine is ready (render() lazily initialises) and skips any note it cannot
        // safely re-render, so enabling it can never break a user's notes.
        this.registerMarkdownPostProcessor(createReadingViewProcessor(this));

        logger.debug(`plugin loaded, bundled MathJax ${this.engine.version}`);
    }

    onunload(): void {
        // Views are closed by Obsidian; the engine owns the injected stylesheet and must clean it up
        // so that disabling the plugin leaves no trace.
        this.engine?.dispose();
        logger.debug("plugin unloaded");
    }

    // ---------------------------------------------------------------- settings

    async loadSettings(): Promise<void> {
        const stored = (await this.loadData()) as Partial<LatestMathJaxSettings> | null;
        this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        logger.setEnabled(this.settings.debugMode);
        this.engine.setCacheSize(
            this.settings.cacheEnabled ? this.settings.cacheSize : 0,
        );
        const rebuilt = this.engine.updateConfig(toEngineConfig(this.settings));
        if (rebuilt) logger.debug("engine reconfigured");
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
