import { loadMathJax } from "obsidian";
import { logger } from "./logger";

export interface VersionReport {
    /** Version bundled with this plugin. */
    plugin: string;
    /** Obsidian's built-in MathJax version, or null if it could not be determined. */
    builtIn: string | null;
    /** True when Obsidian's build is newer than ours — the plugin then has little to offer. */
    builtInIsNewer: boolean;
}

/**
 * Reads `window.MathJax.version`.
 *
 * `window.MathJax` does not exist until Obsidian has loaded its MathJax, which happens lazily on
 * the first math render. `loadMathJax()` is the public API for forcing that, so detection has to be
 * async. Read-only: nothing is written to `window.MathJax`.
 */
export async function detectBuiltInVersion(): Promise<string | null> {
    try {
        await loadMathJax();
    } catch (err) {
        logger.warn("loadMathJax() failed:", err);
    }
    const mj = (window as unknown as { MathJax?: { version?: string } }).MathJax;
    const version = mj?.version;
    return typeof version === "string" && version.length > 0 ? version : null;
}

/**
 * Compares dotted numeric versions. Non-numeric suffixes (e.g. "4.0.0-beta.3") are compared
 * lexically after the numeric parts, which is good enough for a "is theirs newer than ours" check.
 */
export function compareVersions(a: string, b: string): number {
    const split = (v: string) => v.split(/[.\-+]/);
    const pa = split(a);
    const pb = split(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const sa = pa[i] ?? "0";
        const sb = pb[i] ?? "0";
        const na = Number(sa);
        const nb = Number(sb);
        if (Number.isFinite(na) && Number.isFinite(nb)) {
            if (na !== nb) return na < nb ? -1 : 1;
        } else if (sa !== sb) {
            return sa < sb ? -1 : 1;
        }
    }
    return 0;
}

export async function buildVersionReport(pluginVersion: string): Promise<VersionReport> {
    const builtIn = await detectBuiltInVersion();
    return {
        plugin: pluginVersion,
        builtIn,
        builtInIsNewer: builtIn !== null && compareVersions(builtIn, pluginVersion) > 0,
    };
}
