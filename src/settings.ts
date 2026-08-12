import { App, PluginSettingTab, Setting, setIcon } from "obsidian";
import type LatestMathJaxPlugin from "./main";
import { TEX_PACKAGES, defaultEnabledPackages } from "./engine/packages";
import { DEFAULT_FONT_URL, type EngineConfig } from "./engine/MathJaxConfig";

export type FallbackMode = "raw" | "obsidian" | "error";

export interface LatestMathJaxSettings {
    // Engine
    renderer: "chtml";
    packages: string[];
    preamble: string;
    fontURL: string;
    scale: number;
    fontSize: number;
    enableAssistiveMml: boolean;

    // Performance
    cacheEnabled: boolean;
    cacheSize: number;
    renderDebounce: number;

    // Compatibility (surfaces land progressively — see README roadmap)
    enableReadingView: boolean;
    enableInlineReadingView: boolean;
    enableLivePreview: boolean;
    enableInlineLivePreview: boolean;
    enableHoverPreview: boolean;
    enableCanvas: boolean;
    enablePopout: boolean;

    // Behaviour
    fallbackMode: FallbackMode;
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: LatestMathJaxSettings = {
    renderer: "chtml",
    packages: defaultEnabledPackages(),
    preamble: "",
    fontURL: DEFAULT_FONT_URL,
    scale: 1,
    fontSize: 16,
    enableAssistiveMml: false,

    cacheEnabled: true,
    cacheSize: 1000,
    renderDebounce: 150,

    enableReadingView: true,
    enableInlineReadingView: false,
    enableLivePreview: false,
    enableInlineLivePreview: false,
    enableHoverPreview: false,
    enableCanvas: false,
    enablePopout: false,

    fallbackMode: "obsidian",
    debugMode: false,
};

/** Projects user settings onto the engine's own config shape. */
export function toEngineConfig(settings: LatestMathJaxSettings): EngineConfig {
    return {
        renderer: settings.renderer,
        packages: settings.packages,
        preamble: settings.preamble,
        fontSize: settings.fontSize,
        scale: settings.scale,
        fontURL: settings.fontURL,
        enableAssistiveMml: settings.enableAssistiveMml,
    };
}

export class LatestMathJaxSettingTab extends PluginSettingTab {
    constructor(
        app: App,
        private plugin: LatestMathJaxPlugin,
    ) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.renderEngineSection(containerEl);
        this.renderPackagesSection(containerEl);
        this.renderMacrosSection(containerEl);
        this.renderPerformanceSection(containerEl);
        this.renderCompatibilitySection(containerEl);
        this.renderDeveloperSection(containerEl);
    }

    // ------------------------------------------------------------------ engine

    private renderEngineSection(root: HTMLElement): void {
        new Setting(root).setName("Engine").setHeading();

        const report = this.plugin.versionReport;
        const info = root.createDiv({ cls: "latest-mathjax-version-info" });

        const row = (label: string, value: string) => {
            const line = info.createDiv({ cls: "latest-mathjax-version-row" });
            line.createSpan({ text: label, cls: "latest-mathjax-version-label" });
            line.createSpan({ text: value, cls: "latest-mathjax-version-value" });
        };

        row("Plugin MathJax", this.plugin.engine.version);
        row("Built-in MathJax", report?.builtIn ?? "not detected yet");

        if (report?.builtInIsNewer) {
            const warn = info.createDiv({ cls: "latest-mathjax-warning" });
            setIcon(warn.createSpan(), "alert-triangle");
            warn.createSpan({
                text:
                    "Obsidian's built-in MathJax is newer than the version bundled with this plugin. " +
                    "You may want to keep the built-in renderer.",
            });
        }

        new Setting(root)
            .setName("Renderer")
            .setDesc("CommonHTML is the only output in this version; SVG arrives in v0.0.8.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("chtml", "CommonHTML")
                    .setValue(this.plugin.settings.renderer)
                    .setDisabled(true),
            );

        new Setting(root)
            .setName("Scale")
            .setDesc("Multiplier applied to rendered math. 1.0 matches the surrounding text size.")
            .addSlider((slider) =>
                slider
                    .setLimits(0.5, 2, 0.05)
                    .setValue(this.plugin.settings.scale)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.scale = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(root)
            .setName("Font file location")
            .setDesc(
                "Where the MathJax 4 woff2 files are fetched from. Font metrics are bundled, so " +
                    "layout stays correct even offline — only glyph shapes fall back to a system font.",
            )
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_FONT_URL)
                    .setValue(this.plugin.settings.fontURL)
                    .onChange(async (value) => {
                        this.plugin.settings.fontURL = value.trim() || DEFAULT_FONT_URL;
                        await this.plugin.saveSettings();
                    }),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("rotate-ccw")
                    .setTooltip("Reset to default")
                    .onClick(async () => {
                        this.plugin.settings.fontURL = DEFAULT_FONT_URL;
                        await this.plugin.saveSettings();
                        this.display();
                    }),
            );
    }

    // ---------------------------------------------------------------- packages

    private renderPackagesSection(root: HTMLElement): void {
        new Setting(root)
            .setName("TeX packages")
            .setDesc(
                "All packages are bundled; these switches only decide which are active. " +
                    "autoload and require are unavailable because a bundled plugin cannot fetch " +
                    "extensions at runtime.",
            )
            .setHeading();

        const enabled = new Set(this.plugin.settings.packages);

        for (const pkg of TEX_PACKAGES) {
            const setting = new Setting(root).setName(pkg.label).setDesc(pkg.description);

            setting.addToggle((toggle) =>
                toggle
                    .setValue(pkg.required || enabled.has(pkg.id))
                    .setDisabled(pkg.required === true)
                    .onChange(async (value) => {
                        const next = new Set(this.plugin.settings.packages);
                        if (value) next.add(pkg.id);
                        else next.delete(pkg.id);
                        this.plugin.settings.packages = [...next];
                        await this.plugin.saveSettings();
                    }),
            );

            if (pkg.required) setting.setDesc(`${pkg.description} (always on)`);
        }
    }

    // ------------------------------------------------------------------ macros

    private renderMacrosSection(root: HTMLElement): void {
        new Setting(root).setName("Macros").setHeading();

        new Setting(root)
            .setName("Global preamble")
            .setDesc(
                "LaTeX evaluated once when the engine starts. Definitions stay available in every " +
                    "formula. Requires the NewCommand package.",
            );

        const wrapper = root.createDiv({ cls: "latest-mathjax-preamble" });
        const textarea = wrapper.createEl("textarea", {
            cls: "latest-mathjax-preamble-input",
            attr: {
                rows: "8",
                spellcheck: "false",
                placeholder: [
                    "\\newcommand{\\R}{\\mathbb{R}}",
                    "\\newcommand{\\E}{\\mathbb{E}}",
                    "\\DeclareMathOperator{\\Var}{Var}",
                ].join("\n"),
            },
        });
        textarea.value = this.plugin.settings.preamble;

        const status = wrapper.createDiv({ cls: "latest-mathjax-preamble-status" });
        const showStatus = () => {
            status.empty();
            const problem = this.plugin.engine.preambleProblem;
            if (problem) {
                status.addClass("is-error");
                status.setText(`Preamble error: ${problem}`);
            } else {
                status.removeClass("is-error");
                status.setText(
                    this.plugin.settings.preamble.trim() ? "Preamble applied." : "",
                );
            }
        };
        showStatus();

        // Applied on blur rather than on every keystroke: changing the preamble rebuilds the engine
        // and clears the cache, which is far too heavy to do per character.
        textarea.addEventListener("blur", async () => {
            if (textarea.value === this.plugin.settings.preamble) return;
            this.plugin.settings.preamble = textarea.value;
            await this.plugin.saveSettings();
            this.refreshEditors(); // Live Preview picks up the new macros immediately
            showStatus();
        });
    }

    // ------------------------------------------------------------- performance

    private renderPerformanceSection(root: HTMLElement): void {
        new Setting(root).setName("Performance").setHeading();

        new Setting(root)
            .setName("Formula cache")
            .setDesc("Reuse rendered output for identical formulas.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.cacheEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.cacheEnabled = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(root)
            .setName("Cache size")
            .setDesc("Maximum number of cached formulas.")
            .addText((text) =>
                text
                    .setValue(String(this.plugin.settings.cacheSize))
                    .onChange(async (value) => {
                        const parsed = Number.parseInt(value, 10);
                        if (!Number.isFinite(parsed) || parsed < 0) return;
                        this.plugin.settings.cacheSize = parsed;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(root)
            .setName("Render debounce")
            .setDesc("Milliseconds to wait after typing stops before re-rendering in Live Preview.")
            .addSlider((slider) =>
                slider
                    .setLimits(0, 500, 10)
                    .setValue(this.plugin.settings.renderDebounce)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.renderDebounce = value;
                        await this.plugin.saveSettings();
                    }),
            );

        const stats = this.plugin.engine.stats;
        new Setting(root)
            .setName("Cache statistics")
            .setDesc(
                `${stats.cache.size} / ${stats.cache.maxSize} entries · ` +
                    `${stats.cache.hits} hits · ${stats.cache.misses} misses · ` +
                    `${(stats.cache.hitRate * 100).toFixed(0)}% hit rate · ` +
                    `${stats.renders} renders this session`,
            )
            .addButton((button) =>
                button.setButtonText("Clear cache").onClick(() => {
                    this.plugin.engine.clearCache();
                    this.display();
                }),
            );
    }

    // ----------------------------------------------------------- compatibility

    private renderCompatibilitySection(root: HTMLElement): void {
        new Setting(root)
            .setName("Compatibility")
            .setDesc("Which parts of Obsidian this plugin renders math in.")
            .setHeading();

        const notice = root.createDiv({ cls: "latest-mathjax-notice" });
        setIcon(notice.createSpan(), "info");
        notice.createSpan({
            text:
                "Reading View and Live Preview use the bundled engine. The remaining surfaces " +
                "(hover, canvas, popout) are planned for later releases.",
        });

        const surfaces: Array<[keyof LatestMathJaxSettings, string, string]> = [
            ["enableReadingView", "Reading View", "Re-renders $$…$$ display math in Reading View with the bundled engine."],
            ["enableLivePreview", "Live Preview", "Takes over math in the editor with the bundled engine."],
            ["enableHoverPreview", "Hover Preview", "Math inside hover popovers (planned)."],
            ["enableCanvas", "Canvas", "Math inside canvas cards (planned)."],
            ["enablePopout", "Popout windows", "Math in detached windows (planned)."],
        ];

        for (const [key, name, desc] of surfaces) {
            const isAvailable = key === "enableReadingView" || key === "enableLivePreview";
            new Setting(root)
                .setName(name)
                .setDesc(desc)
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings[key] as boolean)
                        .setDisabled(!isAvailable)
                        .onChange(async (value) => {
                            (this.plugin.settings[key] as boolean) = value;
                            await this.plugin.saveSettings();
                            this.refreshEditors();
                        }),
                );
        }

        new Setting(root)
            .setName("Inline math in Reading View")
            .setDesc(
                "Also re-render $…$ inline math in Reading View. Off by default: inline prose math " +
                    "is riskier to take over than isolated display blocks.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableInlineReadingView)
                    .setDisabled(!this.plugin.settings.enableReadingView)
                    .onChange(async (value) => {
                        this.plugin.settings.enableInlineReadingView = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(root)
            .setName("Inline math in Live Preview")
            .setDesc(
                "Also re-render $…$ inline math in Live Preview. Off by default: inline prose math " +
                    "is riskier to take over than isolated display blocks.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableInlineLivePreview)
                    .setDisabled(!this.plugin.settings.enableLivePreview)
                    .onChange(async (value) => {
                        this.plugin.settings.enableInlineLivePreview = value;
                        await this.plugin.saveSettings();
                        this.refreshEditors();
                    }),
            );

        new Setting(root)
            .setName("When rendering fails")
            .setDesc("What to show if the bundled engine cannot render a formula.")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("obsidian", "Fall back to Obsidian's MathJax (recommended)")
                    .addOption("raw", "Show the original LaTeX")
                    .addOption("error", "Show the error message")
                    .setValue(this.plugin.settings.fallbackMode)
                    .onChange(async (value) => {
                        this.plugin.settings.fallbackMode = value as FallbackMode;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    // --------------------------------------------------------------- developer

    private renderDeveloperSection(root: HTMLElement): void {
        new Setting(root).setName("Developer").setHeading();

        new Setting(root)
            .setName("Debug mode")
            .setDesc("Log engine initialisation, cache hits and render errors to the console.")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.debugMode)
                    .onChange(async (value) => {
                        this.plugin.settings.debugMode = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(root)
            .setName("Assistive MathML")
            .setDesc(
                "Emit hidden MathML alongside the visual output for screen readers. Increases DOM size.",
            )
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableAssistiveMml)
                    .onChange(async (value) => {
                        this.plugin.settings.enableAssistiveMml = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }

    /**
     * Rebuilds every open editor view so the registered Live Preview extension re-reads its toggle.
     * `workspace.updateOptions()` reloads the workspace's editor extensions (which include ours).
     */
    private refreshEditors(): void {
        const ws = this.plugin.app.workspace as unknown as { updateOptions?: () => void };
        ws.updateOptions?.();
    }
}
