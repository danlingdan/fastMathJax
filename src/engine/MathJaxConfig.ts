import { fnv1a } from "../utils/hash";
import { defaultEnabledPackages, resolvePackages } from "./packages";

export const MATHJAX_FONT_VERSION = "4.1.3";

/**
 * Where CHTML looks for the woff2 files referenced by its generated @font-face rules.
 *
 * Obsidian's plugin installer only distributes main.js / manifest.json / styles.css, so the font
 * files cannot ride along in a community release. Until v0.0.8 ships a local font cache, the
 * default points at jsDelivr. Font *metrics* are bundled, so layout is correct even when this URL
 * is unreachable — only the glyph shapes fall back to a system font.
 */
export const DEFAULT_FONT_URL =
    `https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@${MATHJAX_FONT_VERSION}/chtml/woff2`;

export type RendererKind = "chtml" | "svg";

/**
 * One labeled part of the merged preamble.
 *
 * The engine evaluates segments in order so a parse failure can be attributed to its source
 * (vault file vs. settings text) instead of pointing into an opaque merged string.
 */
export interface PreambleSegment {
    source: string;
    text: string;
}

/**
 * Everything the engine needs. Intentionally free of Obsidian types — the settings layer maps its
 * own shape onto this.
 */
export interface EngineConfig {
    renderer: RendererKind;
    /** MathJax package names, see packages.ts. */
    packages: string[];
    /** LaTeX evaluated once at engine start; \newcommand definitions persist for the session. */
    preamble: string;
    /**
     * Optional labeled split of `preamble`. When absent, the whole preamble is evaluated as a
     * single unlabeled segment — the pre-0.2.0 behavior.
     */
    preambleSegments?: PreambleSegment[];
    /** Root em size in px used for CHTML metrics; should track the Obsidian font size. */
    fontSize: number;
    /** Output scale multiplier. */
    scale: number;
    /** Where woff2 files live. */
    fontURL: string;
    /** Emit MathML `data-semantic` markup and assistive attributes. */
    enableAssistiveMml: boolean;
}

export function defaultEngineConfig(): EngineConfig {
    return {
        renderer: "chtml",
        packages: defaultEnabledPackages(),
        preamble: "",
        fontSize: 16,
        scale: 1,
        fontURL: DEFAULT_FONT_URL,
        enableAssistiveMml: false,
    };
}

/**
 * Identity of a configuration, for cache keys.
 *
 * Only fields that change render *output* belong here. `fontURL` is included because it lands in
 * the emitted stylesheet; `enableAssistiveMml` because it changes the DOM.
 */
export function configHash(config: EngineConfig): string {
    const parts = [
        MATHJAX_FONT_VERSION,
        config.renderer,
        resolvePackages(config.packages).join(","),
        config.preamble,
        config.fontSize.toString(),
        config.scale.toString(),
        config.fontURL,
        config.enableAssistiveMml ? "a11y" : "",
    ];
    return fnv1a(parts.join("\u0000"));
}

/**
 * True when the change requires tearing down and rebuilding the MathJax document rather than just
 * clearing the cache. Packages and the preamble are baked into the TeX input jax at construction,
 * and there is no supported way to mutate them afterwards.
 */
export function needsRebuild(a: EngineConfig, b: EngineConfig): boolean {
    return (
        a.renderer !== b.renderer ||
        a.preamble !== b.preamble ||
        a.enableAssistiveMml !== b.enableAssistiveMml ||
        resolvePackages(a.packages).join(",") !==
            resolvePackages(b.packages).join(",")
    );
}
