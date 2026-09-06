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
    type FontSource,
    type LatestMathJaxSettings,
} from "./settingsModel";
import { logger } from "./utils/logger";
import { invokeModernSettingTabMethod } from "./settingsCompatibility";
import { confirmInvasiveEnable } from "./invasive/InvasiveConfirmModal";

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
                heading: "Rendering mode",
                items: [
                    {
                        name: "Invasive mode (experimental)",
                        aliases: [
                            "take over",
                            "replace native MathJax",
                            "full functionality",
                            "hover preview",
                            "embeds",
                        ],
                        desc: "Patch Obsidian's built-in MathJax so every rendering surface — " +
                            "including hover previews, embeds and PDF export — renders with the " +
                            "bundled MathJax 4. Off by default; enabling asks for confirmation.",
                        render: (setting) => this.attachInvasiveToggle(setting),
                    },
                ],
            },
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
                        name: "Font source",
                        desc: "CDN fetches woff2 files from the network on use. Local cache " +
                            "downloads them once into the plugin folder so CommonHTML renders " +
                            "offline, and ignores the custom font location above. CommonHTML " +
                            "only — SVG never needs fonts.",
                        control: {
                            type: "dropdown",
                            key: "fontSource",
                            options: { cdn: "CDN (default)", local: "Local cache (offline)" },
                        },
                    },
                    {
                        name: "Reset font file location",
                        desc: "Restore the bundled CommonHTML font CDN default.",
                        visible: () => this.plugin.settings.fontURL !== DEFAULT_FONT_URL,
                        action: () => {
                            void this.setControlValue("fontURL", DEFAULT_FONT_URL).then(() => {
                                invokeModernSettingTabMethod(this, "update");
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
                items: [
                    {
                        name: "Preamble file",
                        desc: "Optional vault-relative path whose TeX is evaluated before the " +
                            "inline preamble, e.g. math/macros.tex. Re-read automatically when " +
                            "the file changes.",
                        aliases: ["preamble file", "macros file", "tex file"],
                        control: {
                            type: "text",
                            key: "preambleFile",
                            placeholder: "mathjax-preamble.tex",
                        },
                    },
                    {
                        name: "Global preamble",
                        desc: "LaTeX evaluated once when the engine starts. Applied when the field loses focus.",
                        aliases: ["macros", "newcommand"],
                        render: (setting) => this.renderPreambleControl(setting),
                    },
                ],
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
            // A preambleFile path change re-reads the file inside saveSettings before the engine
            // is rebuilt, so no per-key handling is needed here.
            if (this.settingAffectsRenderedSurfaces(key)) {
                this.plugin.refreshRenderedSurfaces();
            }
            invokeModernSettingTabMethod(this, "refreshDomState");
        } catch (error) {
            this.plugin.settings = previous;
            logger.error(`failed to save setting ${key}:`, error);
            new Notice("Latest MathJax: failed to save setting; the previous value was restored.");
            throw error;
        }
    }

    /**
     * The invasive-mode toggle is intentionally NOT wired through the declarative
     * key/value plumbing: turning it on must pass the confirmation modal first, and turning
     * it off must not. Both settings surfaces (1.13+ declarative and 1.8–1.12 imperative)
     * attach it through this method so the behavior is identical.
     */
    private attachInvasiveToggle(setting: Setting): void {
        setting.addToggle((toggle) => {
            toggle.setValue(this.plugin.settings.invasiveMode).onChange((value) => {
                void this.requestInvasiveMode(value).then(() => {
                    // Sync the switch with the actual outcome: a cancelled confirmation or a
                    // failed install leaves it off even if Obsidian flipped it on visually.
                    toggle.setValue(this.plugin.settings.invasiveMode);
                    // Re-render so the gated per-surface switches reflect the new mode at once.
                    if (!invokeModernSettingTabMethod(this, "update")) this.display();
                });
            });
        });
    }

    /** Applies an invasive-mode change: confirm before enabling, save, hot-switch. */
    private async requestInvasiveMode(value: boolean): Promise<void> {
        if (value === this.plugin.settings.invasiveMode) return;
        if (value) {
            const confirmed = await confirmInvasiveEnable(this.app);
            if (!confirmed) return;
        }
        this.plugin.settings.invasiveMode = value;
        await this.plugin.saveSettings();
    }

    private compatibilityDefinitions(): SettingDefinition[] {
        const invasive = this.plugin.invasiveActive;
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
                desc: invasive ? `${desc} Managed by invasive mode.` : desc,
                control: {
                    type: "toggle" as const,
                    key,
                    disabled: !available || invasive,
                },
            })),
            {
                name: "Inline math in Reading View",
                desc: "Also re-render inline prose math in Reading View.",
                control: {
                    type: "toggle",
                    key: "enableInlineReadingView",
                    disabled: () => invasive || !this.plugin.settings.enableReadingView,
                },
            },
            {
                name: "Inline math in Live Preview",
                desc: "Also re-render inline prose math in Live Preview.",
                control: {
                    type: "toggle",
                    key: "enableInlineLivePreview",
                    disabled: () => invasive || !this.plugin.settings.enableLivePreview,
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
            // saveSettings re-reads the file when the preamble path changed and refreshes
            // surfaces only on a content change; a same-path edit never re-renders.
            "preambleFile",
            // applyInvasiveMode (inside saveSettings) refreshes surfaces on an actual switch.
            "invasiveMode",
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
            status.empty();
            const problems = this.plugin.preambleDiagnostics;
            if (problems.length > 0) {
                status.addClass("is-error");
                for (const problem of problems) {
                    status.createDiv({
                        text: `${problem.source}: ${problem.message}`,
                    });
                }
            } else {
                status.removeClass("is-error");
                const hasPreamble = this.plugin.settings.preamble.trim().length > 0;
                const hasFile = this.plugin.settings.preambleFile.trim().length > 0;
                status.setText(hasPreamble || hasFile ? "Preamble applied." : "");
            }
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
            invokeModernSettingTabMethod(this, "update");
        }));
    }

    private renderCompatibilityNotice(root: HTMLElement): void {
        const notice = root.createDiv({ cls: "latest-mathjax-notice" });
        setIcon(notice.createSpan(), "info");
        notice.createSpan({
            text: this.plugin.invasiveActive
                ? "Invasive mode is active: every rendering surface (including hover previews " +
                  "and embeds) renders with the bundled engine, and the per-surface switches " +
                  "below are idle."
                : "Reading View, Live Preview and their popout-window variants are supported. " +
                    "Hover Preview and Canvas remain fail-closed and unsupported — invasive " +
                    "mode is the experimental path to full coverage.",
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.renderRenderingModeSection(containerEl);
        this.renderEngineSection(containerEl);
        this.renderPackagesSection(containerEl);
        this.renderMacrosSection(containerEl);
        this.renderPerformanceSection(containerEl);
        this.renderCompatibilitySection(containerEl);
        this.renderDeveloperSection(containerEl);
    }

    // ----------------------------------------------------------- rendering mode

    private renderRenderingModeSection(root: HTMLElement): void {
        new Setting(root).setName("Rendering mode").setHeading();

        new Setting(root)
            .setName("Invasive mode (experimental)")
            .setDesc(
                "Patch Obsidian's built-in MathJax so every rendering surface — including " +
                    "hover previews, embeds and PDF export — renders with the bundled " +
                    "MathJax 4. Off by default; enabling asks for confirmation.",
            )
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.invasiveMode).onChange((value) => {
                    void this.requestInvasiveMode(value).then(() => {
                        toggle.setValue(this.plugin.settings.invasiveMode);
                    });
                });
            });
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

        new Setting(root)
            .setName("Font source")
            .setDesc(
                "CDN fetches woff2 files from the network on use. Local cache downloads them " +
                    "once into the plugin folder so CommonHTML renders offline, and ignores the " +
                    "custom font location above. CommonHTML only — SVG never needs fonts.",
            )
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("cdn", "CDN (default)")
                    .addOption("local", "Local cache (offline)")
                    .setValue(this.plugin.settings.fontSource)
                    .onChange(async (value) => {
                        this.plugin.settings.fontSource = value as FontSource;
                        await this.plugin.saveSettings();
                        this.plugin.refreshRenderedSurfaces();
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
            .setName("Preamble file")
            .setDesc(
                "Optional vault-relative path whose TeX is evaluated before the inline preamble " +
                    "below, e.g. macros/mathjax.tex. Re-read automatically when the file changes.",
            )
            .addText((text) => {
                text
                    .setPlaceholder("mathjax-preamble.tex")
                    .setValue(this.plugin.settings.preambleFile);
                // Applied on blur, like the inline preamble: a path change can rebuild the
                // engine, which is too heavy per keystroke.
                text.inputEl.addEventListener("blur", () => {
                    const value = text.inputEl.value;
                    if (value === this.plugin.settings.preambleFile) return;
                    void (async () => {
                        this.plugin.settings.preambleFile = value;
                        // saveSettings re-reads a changed path before rebuilding the engine.
                        await this.plugin.saveSettings();
                        showStatus();
                    })();
                });
            });

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
            const problems = this.plugin.preambleDiagnostics;
            if (problems.length > 0) {
                status.addClass("is-error");
                for (const problem of problems) {
                    status.createDiv({
                        text: `${problem.source}: ${problem.message}`,
                    });
                }
            } else {
                status.removeClass("is-error");
                const hasPreamble = this.plugin.settings.preamble.trim().length > 0;
                const hasFile = this.plugin.settings.preambleFile.trim().length > 0;
                status.setText(hasPreamble || hasFile ? "Preamble applied." : "");
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

        const invasive = this.plugin.invasiveActive;
        const surfaces: Array<[keyof LatestMathJaxSettings, string, string, boolean]> = [
            ["enableReadingView", "Reading View", invasive
                ? "Managed by invasive mode (every surface renders with the bundled engine)."
                : "Re-renders $$…$$ display math in Reading View with the bundled engine.", true],
            ["enableLivePreview", "Live Preview", invasive
                ? "Managed by invasive mode (every surface renders with the bundled engine)."
                : "Takes over math in the editor with the bundled engine.", true],
            ["enablePopout", "Popout windows", invasive
                ? "Math in detached windows. Invasive mode copies the engine stylesheet into the popout document automatically."
                : "Math in detached windows. Reuses the Reading View / Live Preview adapters; CHTML styles are copied into the popout document automatically.", true],
            ["enableHoverPreview", "Hover Preview", invasive
                ? "Rendered through the patched native pipeline while invasive mode is on."
                : "Math inside hover popovers. Not supported yet — Obsidian does not expose the TeX source there (planned).", false],
            ["enableCanvas", "Canvas", "Math inside canvas cards. Not supported yet — canvas cards bypass the markdown post-processor (planned).", false],
        ];

        for (const [key, name, desc, available] of surfaces) {
            new Setting(root)
                .setName(name)
                .setDesc(desc)
                .addToggle((toggle) =>
                    toggle
                        .setValue(this.plugin.settings[key] as boolean)
                        .setDisabled(!available || invasive)
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
                    .setDisabled(invasive || !this.plugin.settings.enableReadingView)
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
                    .setDisabled(invasive || !this.plugin.settings.enableLivePreview)
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
