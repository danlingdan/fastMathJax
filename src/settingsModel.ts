import { TEX_PACKAGES, defaultEnabledPackages } from "./engine/packages";
import {
    DEFAULT_FONT_URL,
    type EngineConfig,
    type RendererKind,
} from "./engine/MathJaxConfig";

export type FallbackMode = "raw" | "obsidian" | "error";

export interface LatestMathJaxSettings {
    renderer: RendererKind;
    packages: string[];
    preamble: string;
    fontURL: string;
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
    enablePopout: true,
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
    if (typeof stored.preamble === "string") settings.preamble = stored.preamble;
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
