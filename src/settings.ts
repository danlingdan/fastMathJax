import {
    App,
    Notice,
    PluginSettingTab,
    Setting,
    setIcon,
    type SettingDefinition,
    type SettingDefinitionItem,
} from "obsidian";
import type LatestMathJaxPlugin from "./main";
import { TEX_PACKAGES } from "./engine/packages";
import { DEFAULT_FONT_URL } from "./engine/MathJaxConfig";
import {
    normalizeSettings,
    type FallbackMode,
    type LatestMathJaxSettings,
} from "./settingsModel";
import { logger } from "./utils/logger";

export { DEFAULT_SETTINGS, normalizeSettings, toEngineConfig } from "./settingsModel";
export type { FallbackMode, LatestMathJaxSettings } from "./settingsModel";

export class LatestMathJaxSettingTab extends PluginSettingTab {
    constructor(
        app: App,
        private plugin: LatestMathJaxPlugin,
    ) {
        super(app, plugin);
    }

    /**
     * Obsidian 1.13+ uses these definitions for rendering and settings search. The imperative
     * display() implementation below remains the compatibility path for Obsidian 1.8–1.12.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        const packageKey = (id: string) => `package:${id}`;
        return [
            {
                type: "group",
                heading: "Engine",
                items: [
                    {
                        name: "MathJax versions",
                        aliases: ["bundled version", "built-in version"],
                        render: (setting) => this.renderVersionInfo(setting.settingEl),
                    },
                    {
                        name: "Renderer",
                        desc: "CommonHTML uses webfonts; SVG embeds glyph paths (no font download needed).",
                        control: {
                            type: "dropdown",
                            key: "renderer",
                            options: { chtml: "CommonHTML", svg: "SVG" },
                        },
                    },
                    {
                        name: "Scale",
                        desc: "Multiplier applied to rendered math. 1.0 matches the surrounding text size.",
                        control: { type: "slider", key: "scale", min: 0.5, max: 2, step: 0.05 },
                    },
                    {
                        name: "Font file location",
                        desc: "Where CommonHTML fetches MathJax 4 woff2 files. Ignored for SVG output.",
                        control: {
                            type: "text",
                            key: "fontURL",
                            placeholder: DEFAULT_FONT_URL,
                            disabled: () => this.plugin.settings.renderer === "svg",
                        },
                    },
                    {
                        name: "Reset font file location",
                        desc: "Restore the bundled CommonHTML font CDN default.",
                        visible: () => this.plugin.settings.fontURL !== DEFAULT_FONT_URL,
                        action: () => {
                            void this.setControlValue("fontURL", DEFAULT_FONT_URL).then(() => {
                                this.update();
                            }).catch(() => undefined);
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: "TeX packages",
                items: TEX_PACKAGES.map((pkg) => ({
                    name: pkg.label,
                    desc: pkg.required ? `${pkg.description} (always on)` : pkg.description,
                    control: {
                        type: "toggle" as const,
                        key: packageKey(pkg.id),
                        disabled: pkg.required === true,
                    },
                })),
            },
            {
                type: "group",
                heading: "Macros",
                items: [{
                    name: "Global preamble",
                    desc: "LaTeX evaluated once when the engine starts. Applied when the field loses focus.",
                    aliases: ["macros", "newcommand"],
                    render: (setting) => this.renderPreambleControl(setting),
                }],
            },
            {
                type: "group",
                heading: "Performance",
                items: [
                    {
                        name: "Formula cache",
                        desc: "Reuse rendered output for identical formulas.",
                        control: { type: "toggle", key: "cacheEnabled" },
                    },
                    {
                        name: "Cache size",
                        desc: "Maximum number of cached formulas.",
                        control: {
                            type: "number",
                            key: "cacheSize",
                            min: 0,
                            max: 10_000,
                            step: 1,
                        },
                    },
                    {
                        name: "Render debounce",
                        desc: "Milliseconds to wait after typing stops before re-rendering in Live Preview.",
                        control: {
                            type: "slider",
                            key: "renderDebounce",
                            min: 0,
                            max: 500,
                            step: 10,
                        },
                    },
                    {
                        name: "Cache statistics",
                        aliases: ["cache hits", "cache misses"],
                        render: (setting) => this.renderCacheStatistics(setting),
                    },
                ],
            },
            {
                type: "group",
                heading: "Compatibility",
                items: [
                    {
                        name: "Supported surfaces",
                        aliases: ["Reading View", "Live Preview", "popout"],
                        render: (setting) => this.renderCompatibilityNotice(setting.settingEl),
                    },
                    ...this.compatibilityDefinitions(),
                    {
                        name: "When rendering fails",
                        desc: "What to show if the bundled engine cannot render a formula.",
                        control: {
                            type: "dropdown",
                            key: "fallbackMode",
                            options: {
                                obsidian: "Fall back to Obsidian's MathJax (recommended)",
                                raw: "Show the original LaTeX",
                                error: "Show the error message",
                            },
                        },
                    },
                ],
            },
            {
                type: "group",
                heading: "Developer",
                items: [
                    {
                        name: "Debug mode",
                        desc: "Log engine initialisation, cache hits and render errors to the console.",
                        control: { type: "toggle", key: "debugMode" },
                    },
                    {
                        name: "Assistive MathML",
                        desc: "Emit hidden MathML alongside visual output for screen readers.",
                        control: { type: "toggle", key: "enableAssistiveMml" },
                    },
                ],
            },
        ];
    }

    getControlValue(key: string): unknown {
        if (key.startsWith("package:")) {
            return this.plugin.settings.packages.includes(key.slice("package:".length));
        }
        return this.plugin.settings[key as keyof LatestMathJaxSettings];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const previous = this.plugin.settings;
        try {
            if (key.startsWith("package:")) {
                const id = key.slice("package:".length);
                const packages = new Set(previous.packages);
                if (value === true) packages.add(id);
                else packages.delete(id);
                this.plugin.settings = normalizeSettings({ ...previous, packages: [...packages] });
            } else {
                this.plugin.settings = normalizeSettings({ ...previous, [key]: value });
            }
            await this.plugin.saveSettings();
            if (this.settingAffectsRenderedSurfaces(key)) {
                this.plugin.refreshRenderedSurfaces();
            }
            this.refreshDomState();
        } catch (error) {
            this.plugin.settings = previous;
            logger.error(`failed to save setting ${key}:`, error);
            new Notice("Latest MathJax: failed to save setting; the previous value was restored.");
            throw error;
        }
    }

    private compatibilityDefinitions(): SettingDefinition[] {
        const surfaces: Array<[keyof LatestMathJaxSettings, string, string, boolean]> = [
            ["enableReadingView", "Reading View", "Re-renders display math with the bundled engine.", true],
            ["enableLivePreview", "Live Preview", "Takes over mounted math widgets in the editor.", true],
            ["enablePopout", "Popout windows", "Allows supported adapters to render in detached windows.", true],
            ["enableHoverPreview", "Hover Preview", "Not supported: raw TeX is not exposed reliably.", false],
            ["enableCanvas", "Canvas", "Not supported: canvas cards bypass the Markdown post-processor.", false],
        ];
        return [
            ...surfaces.map(([key, name, desc, available]) => ({
                name,
                desc,
                control: {
                    type: "toggle" as const,
                    key,
                    disabled: !available,
                },
            })),
            {
                name: "Inline math in Reading View",
                desc: "Also re-render inline prose math in Reading View.",
                control: {
                    type: "toggle",
                    key: "enableInlineReadingView",
                    disabled: () => !this.plugin.settings.enableReadingView,
                },
            },
            {
                name: "Inline math in Live Preview",
                desc: "Also re-render inline prose math in Live Preview.",
                control: {
                    type: "toggle",
                    key: "enableInlineLivePreview",
                    disabled: () => !this.plugin.settings.enableLivePreview,
                },
            },
        ];
    }

    private settingAffectsRenderedSurfaces(key: string): boolean {
        return key.startsWith("package:") || ![
            "cacheEnabled",
            "cacheSize",
            "renderDebounce",
            "debugMode",
        ].includes(key);
    }

    private renderVersionInfo(root: HTMLElement): void {
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
                text: "Obsidian's built-in MathJax is newer than the bundled version.",
            });
        }
    }

    private renderPreambleControl(setting: Setting): void {
        const wrapper = setting.controlEl.createDiv({ cls: "latest-mathjax-preamble" });
        const textarea = wrapper.createEl("textarea", {
            cls: "latest-mathjax-preamble-input",
            attr: {
                rows: "8",
                spellcheck: "false",
                placeholder: "\\newcommand{\\R}{\\mathbb{R}}",
            },
        });
        textarea.value = this.plugin.settings.preamble;
        const status = wrapper.createDiv({ cls: "latest-mathjax-preamble-status" });
        const showStatus = () => {
            const problem = this.plugin.engine.preambleProblem;
            status.toggleClass("is-error", Boolean(problem));
            status.setText(problem
                ? `Preamble error: ${problem}`
                : this.plugin.settings.preamble.trim() ? "Preamble applied." : "");
        };
        showStatus();
        textarea.addEventListener("blur", () => {
            if (textarea.value === this.plugin.settings.preamble) return;
            const previous = this.plugin.settings;
            this.plugin.settings = normalizeSettings({ ...previous, preamble: textarea.value });
            void this.plugin.saveSettings().then(() => {
                this.plugin.refreshRenderedSurfaces();
                showStatus();
            }).catch((error) => {
                this.plugin.settings = previous;
                logger.error("failed to save preamble:", error);
                textarea.value = previous.preamble;
                new Notice("Latest MathJax: failed to save preamble; the previous value was restored.");
            });
        });
    }

    private renderCacheStatistics(setting: Setting): void {
        const stats = this.plugin.engine.stats;
        setting.setDesc(
            `${stats.cache.size} / ${stats.cache.maxSize} entries · ` +
            `${stats.cache.hits} hits · ${stats.cache.misses} misses · ` +
            `${(stats.cache.hitRate * 100).toFixed(0)}% hit rate · ` +
            `${stats.renders} renders this session`,
        ).addButton((button) => button.setButtonText("Clear cache").onClick(() => {
            this.plugin.engine.clearCache();
            this.update();
        }));
    }

    private renderCompatibilityNotice(root: HTMLElement): void {
        const notice = root.createDiv({ cls: "latest-mathjax-notice" });
        setIcon(notice.createSpan(), "info");
        notice.createSpan({
            text: "Reading View, Live Preview and their popout-window variants are supported. " +
                "Hover Preview and Canvas remain fail-closed and unsupported.",
        });
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

        const isSvg = () => this.plugin.settings.renderer === "svg";
        let fontLocationSetting: Setting;

        new Setting(root)
            .setName("Renderer")
            .setDesc("CommonHTML uses webfonts; SVG embeds glyph paths (no font download needed).")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("chtml", "CommonHTML")
                    .addOption("svg", "SVG")
                    .setValue(this.plugin.settings.renderer)
                    .onChange(async (value) => {
                        this.plugin.settings.renderer = value as "chtml" | "svg";
                        await this.plugin.saveSettings();
                        this.plugin.refreshRenderedSurfaces();
                        fontLocationSetting.setDisabled(isSvg());
                    }),
            );

        new Setting(root)
            .setName("Scale")
            .setDesc("Multiplier applied to rendered math. 1.0 matches the surrounding text size.")
            .addSlider((slider) =>
                slider
                    .setLimits(0.5, 2, 0.05)
                    .setValue(this.plugin.settings.scale)
                    .onChange(async (value) => {
                        this.plugin.settings.scale = value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshRenderedSurfaces();
                    }),
            );

        fontLocationSetting = new Setting(root)
            .setName("Font file location")
            .setDesc(
                "Where the MathJax 4 woff2 files are fetched from. Font metrics are bundled, so " +
                    "layout stays correct even offline — only glyph shapes fall back to a system font. " +
                    "Ignored when the renderer is SVG.",
            )
            .setDisabled(isSvg())
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_FONT_URL)
                    .setValue(this.plugin.settings.fontURL)
                    .onChange(async (value) => {
                        this.plugin.settings.fontURL = value.trim() || DEFAULT_FONT_URL;
                        await this.plugin.saveSettings();
                        this.plugin.refreshRenderedSurfaces();
                    }),
            )
            .addExtraButton((button) =>
                button
                    .setIcon("rotate-ccw")
                    .setTooltip("Reset to default")
                    .onClick(async () => {
                        this.plugin.settings.fontURL = DEFAULT_FONT_URL;
                        await this.plugin.saveSettings();
                        this.plugin.refreshRenderedSurfaces();
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
                        this.plugin.refreshRenderedSurfaces();
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
        textarea.addEventListener("blur", () => {
            if (textarea.value === this.plugin.settings.preamble) return;
            this.plugin.settings.preamble = textarea.value;
            void this.plugin.saveSettings().then(() => {
                this.plugin.refreshRenderedSurfaces();
                showStatus();
            }).catch(() => {
                new Notice("Latest MathJax: failed to save preamble.");
            });
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

        this.renderCompatibilityNotice(root);

        const surfaces: Array<[keyof LatestMathJaxSettings, string, string, boolean]> = [
            ["enableReadingView", "Reading View", "Re-renders $$…$$ display math in Reading View with the bundled engine.", true],
            ["enableLivePreview", "Live Preview", "Takes over math in the editor with the bundled engine.", true],
            ["enablePopout", "Popout windows", "Math in detached windows. Reuses the Reading View / Live Preview adapters; CHTML styles are copied into the popout document automatically.", true],
            ["enableHoverPreview", "Hover Preview", "Math inside hover popovers. Not supported yet — Obsidian does not expose the TeX source there (planned).", false],
            ["enableCanvas", "Canvas", "Math inside canvas cards. Not supported yet — canvas cards bypass the markdown post-processor (planned).", false],
        ];

        for (const [key, name, desc, available] of surfaces) {
            new Setting(root)
                .setName(name)
                .setDesc(desc)
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings[key] as boolean)
                        .setDisabled(!available)
                        .onChange(async (value) => {
                            (this.plugin.settings[key] as boolean) = value;
                            await this.plugin.saveSettings();
                            this.plugin.refreshRenderedSurfaces();
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
                        this.plugin.refreshRenderedSurfaces();
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
                        this.plugin.refreshRenderedSurfaces();
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
                        this.plugin.refreshRenderedSurfaces();
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
                        this.plugin.refreshRenderedSurfaces();
                    }),
            );
    }

}
