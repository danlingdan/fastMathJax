import { TEX_PACKAGES, defaultEnabledPackages } from "./engine/packages";
import {
    DEFAULT_FONT_URL,
    type EngineConfig,
    type RendererKind,
} from "./engine/MathJaxConfig";
import { buildPreambleSegments, mergePreambles } from "./preamble/preambleModel";

export type FallbackMode = "raw" | "obsidian" | "error";

/** Where CommonHTML woff2 glyph files come from. SVG output never fetches fonts. */
export type FontSource = "cdn" | "local";

export interface LatestMathJaxSettings {
    renderer: RendererKind;
    packages: string[];
    preamble: string;
    /**
     * Vault-relative path of an optional preamble file whose definitions are evaluated before
     * `preamble`. Empty string = disabled. Only the path is persisted; the content is loaded
     * into plugin state at runtime.
     */
    preambleFile: string;
    fontURL: string;
    /**
     * CDN fetches woff2 files from the configured `fontURL` on use; `local` serves them from the
     * on-disk cache in the plugin folder (`docs/offline-fonts.md`), ignoring `fontURL`.
     */
    fontSource: FontSource;
    scale: number;
    fontSize: number;
    enableAssistiveMml: boolean;
    cacheEnabled: boolean;
    cacheSize: number;
    renderDebounce: number;
    enableReadingView: boolean;
    enableInlineReadingView: boolean;
    enableLivePreview: boolean;
    enableInlineLivePreview: boolean;
    enableHoverPreview: boolean;
    enableCanvas: boolean;
    enablePopout: boolean;
    /**
     * Invasive mode (1.0, experimental, default off): patch Obsidian's native MathJax entry
     * points (`tex2chtml` / `chtmlStylesheet`) so every rendering surface — including hover
     * previews, embeds and PDF export, which the coexistence adapters cannot reach — renders
     * with the bundled engine. Toggling on is gated behind a confirmation dialog.
     */
    invasiveMode: boolean;
    fallbackMode: FallbackMode;
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: LatestMathJaxSettings = {
    renderer: "chtml",
    packages: defaultEnabledPackages(),
    preamble: "",
    preambleFile: "",
    fontURL: DEFAULT_FONT_URL,
    fontSource: "cdn",
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
    enablePopout: true,
    invasiveMode: false,
    fallbackMode: "obsidian",
    debugMode: false,
};

const BOOLEAN_KEYS = [
    "enableAssistiveMml",
    "cacheEnabled",
    "enableReadingView",
    "enableInlineReadingView",
    "enableLivePreview",
    "enableInlineLivePreview",
    "enableHoverPreview",
    "enableCanvas",
    "enablePopout",
    "invasiveMode",
    "debugMode",
] as const;

export function normalizeSettings(
    stored: Partial<LatestMathJaxSettings> | null | undefined,
): LatestMathJaxSettings {
    const settings: LatestMathJaxSettings = {
        ...DEFAULT_SETTINGS,
        packages: [...DEFAULT_SETTINGS.packages],
    };
    if (!stored || typeof stored !== "object") return settings;

    if (stored.renderer === "chtml" || stored.renderer === "svg") {
        settings.renderer = stored.renderer;
    }
    if (
        stored.fallbackMode === "obsidian" ||
        stored.fallbackMode === "raw" ||
        stored.fallbackMode === "error"
    ) settings.fallbackMode = stored.fallbackMode;
    if (stored.fontSource === "cdn" || stored.fontSource === "local") {
        settings.fontSource = stored.fontSource;
    }
    if (typeof stored.preamble === "string") settings.preamble = stored.preamble;
    if (typeof stored.preambleFile === "string") settings.preambleFile = stored.preambleFile.trim();
    if (typeof stored.fontURL === "string" && stored.fontURL.trim()) {
        settings.fontURL = stored.fontURL.trim();
    }

    const knownPackages = new Set(TEX_PACKAGES.map((pkg) => pkg.id));
    if (Array.isArray(stored.packages)) {
        settings.packages = [...new Set(stored.packages.filter(
            (pkg): pkg is string => typeof pkg === "string" && knownPackages.has(pkg),
        ))];
        for (const pkg of TEX_PACKAGES) {
            if (pkg.required && !settings.packages.includes(pkg.id)) settings.packages.push(pkg.id);
        }
    }

    const finite = (value: unknown, fallback: number, min: number, max: number): number =>
        typeof value === "number" && Number.isFinite(value)
            ? Math.min(max, Math.max(min, value))
            : fallback;
    settings.scale = finite(stored.scale, settings.scale, 0.5, 2);
    settings.fontSize = finite(stored.fontSize, settings.fontSize, 8, 48);
    settings.cacheSize = Math.round(finite(stored.cacheSize, settings.cacheSize, 0, 10_000));
    settings.renderDebounce = Math.round(
        finite(stored.renderDebounce, settings.renderDebounce, 0, 2_000),
    );

    for (const key of BOOLEAN_KEYS) {
        if (typeof stored[key] === "boolean") settings[key] = stored[key];
    }
    return settings;
}

/**
 * Maps settings (plus the runtime-loaded preamble file content) onto the engine config.
 *
 * The file text is evaluated first and the inline settings preamble second, so the merge order
 * in `EngineConfig.preamble` matches evaluation order. Callers that only have settings (no
 * preamble file) keep getting exactly the pre-0.2.0 config.
 */
export function toEngineConfig(
    settings: LatestMathJaxSettings,
    filePreamble = "",
): EngineConfig {
    const filePath = settings.preambleFile.trim();
    const preamble = mergePreambles(filePreamble, settings.preamble);
    return {
        renderer: settings.renderer,
        packages: settings.packages,
        preamble,
        // Only carry segments when a file actually contributes one; otherwise the engine keeps
        // evaluating the inline text as a single unlabeled unit.
        ...(filePath && filePreamble.trim()
            ? { preambleSegments: buildPreambleSegments(filePreamble, settings.preamble, filePath) }
            : {}),
        fontSize: settings.fontSize,
        scale: settings.scale,
        fontURL: settings.fontURL,
        enableAssistiveMml: settings.enableAssistiveMml,
        // Invasive mode is the only MathJax vocabulary on the page, so the coexistence tag
        // renaming is disabled and MathJax's own `mjx-*` output ships untouched.
        isolationEnabled: !settings.invasiveMode,
    };
}
