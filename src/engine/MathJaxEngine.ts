import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { CHTML } from "@mathjax/src/js/output/chtml.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { browserAdaptor } from "@mathjax/src/js/adaptors/browserAdaptor.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/chtml.js";
import type { MathDocument } from "@mathjax/src/js/core/MathDocument.js";

import { MathCache, type CacheStats } from "./MathCache";
import {
    type EngineConfig,
    configHash,
    defaultEngineConfig,
    needsRebuild,
} from "./MathJaxConfig";
import { resolvePackages } from "./packages";
import { renderCacheKey } from "../utils/hash";
import { logger } from "../utils/logger";

export interface RenderOptions {
    display: boolean;
}

export interface EngineStats {
    initialised: boolean;
    version: string;
    renders: number;
    cache: CacheStats;
}

/** Thrown when MathJax could not turn the input into output. */
export class MathRenderError extends Error {
    constructor(
        message: string,
        readonly tex: string,
        readonly display: boolean,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = "MathRenderError";
    }
}

const STYLE_ELEMENT_ID = "latest-mathjax-chtml-styles";

/**
 * The HTML handler is global to *our* bundled copy of MathJax and may only be registered once.
 * Obsidian re-requires main.js when a plugin is re-enabled, but that is not guaranteed, so this
 * guards against a double registration leaving two handlers in the list.
 */
let handlerRegistered = false;

function ensureHandler(): void {
    if (handlerRegistered) return;
    RegisterHTMLHandler(browserAdaptor());
    handlerRegistered = true;
    logger.debug(`HTML handler registered, MathJax ${mathjax.version}`);
}

/**
 * A self-contained MathJax 4 renderer.
 *
 * Knows nothing about Obsidian: no imports from "obsidian", no vault access, no DOM assumptions
 * beyond a `document` with a `<head>`. That keeps the Obsidian-specific breakage confined to the
 * adapter layers (see docs/architecture.md).
 *
 * It never touches `window.MathJax`. Obsidian's own MathJax lives there and keeps working.
 */
export class MathJaxEngine {
    private config: EngineConfig = defaultEngineConfig();
    private hash = "";
    private doc: MathDocument<HTMLElement, Text, Document> | null = null;
    private outputJax: CHTML<HTMLElement, Text, Document> | null = null;
    private styleNode: HTMLStyleElement | null = null;
    private styleFlushHandle: number | null = null;
    private cache: MathCache;
    private renders = 0;
    private preambleError: string | null = null;

    constructor(
        config?: Partial<EngineConfig>,
        cacheSize = 1000,
    ) {
        this.cache = new MathCache(cacheSize);
        if (config) this.config = { ...this.config, ...config };
    }

    /** Bundled MathJax version, e.g. "4.1.3". */
    get version(): string {
        return mathjax.version;
    }

    get isInitialised(): boolean {
        return this.doc !== null;
    }

    /** Non-fatal problem found while evaluating the user's preamble, if any. */
    get preambleProblem(): string | null {
        return this.preambleError;
    }

    initialise(): void {
        if (this.doc) return;
        ensureHandler();
        this.build();
    }

    private build(): void {
        const config = this.config;
        const packages = resolvePackages(config.packages);

        const inputJax = new TeX<HTMLElement, Text, Document>({
            packages,
            // Surface parse failures to us instead of silently emitting a red <merror>. The adapter
            // layer decides what to show the user (raw LaTeX / Obsidian fallback / error text).
            formatError: (_jax: unknown, err: Error) => {
                throw err;
            },
        });

        const outputJax = new CHTML<HTMLElement, Text, Document>({
            fontData: MathJaxNewcmFont,
            // Font-specific options are separated out automatically by CommonOutputJax.
            fontURL: config.fontURL,
            scale: config.scale,
            displayAlign: "center",
            displayIndent: "0",
            // Only emit CSS for constructs actually used; keeps the injected stylesheet small.
            adaptiveCSS: true,
        });

        this.doc = mathjax.document(document, {
            InputJax: inputJax,
            OutputJax: outputJax,
            // Our adapters drive rendering explicitly; MathJax must never scan the page itself.
            // Obsidian's DOM is not ours to walk.
            enableEnrichment: config.enableAssistiveMml,
            enableAssistiveMml: config.enableAssistiveMml,
            enableMenu: false,
            enableExplorer: false,
        }) as MathDocument<HTMLElement, Text, Document>;

        this.outputJax = outputJax;
        this.hash = configHash(config);
        this.cache.clear();
        this.renders = 0;
        this.preambleError = null;

        this.applyPreamble();
        // Create and attach the stylesheet immediately: CHTML adds later rules through
        // `sheet.insertRule`, which silently no-ops unless the <style> is in the document.
        this.flushStyles();

        logger.debug(
            `engine built — MathJax ${mathjax.version}, packages [${packages.join(", ")}], hash ${this.hash}`,
        );
    }

    /**
     * Evaluates the global preamble once so its \newcommand / \DeclareMathOperator definitions land
     * in the TeX parser's persistent macro table. The output is thrown away.
     */
    private applyPreamble(): void {
        const preamble = this.config.preamble.trim();
        if (!preamble || !this.doc) return;
        try {
            this.doc.convert(preamble, { display: true, ...this.metrics() });
            logger.debug(`preamble applied (${preamble.length} chars)`);
        } catch (err) {
            this.preambleError = err instanceof Error ? err.message : String(err);
            logger.warn("preamble failed:", this.preambleError);
        }
    }

    /**
     * Metrics handed to every conversion.
     *
     * Deliberately container-independent. Measuring the real container per formula (via
     * `outputJax.getMetricsFor`) would make results container-specific and destroy cache reuse.
     * The visible cost is that automatic line breaking of very wide display math uses a nominal
     * width rather than the true one — revisit when Stage 5 introduces viewport-aware rendering.
     */
    private metrics(): { em: number; ex: number; containerWidth: number } {
        const em = this.config.fontSize;
        const ex = em * 0.5;
        return { em, ex, containerWidth: 80 * ex };
    }

    /**
     * Renders one formula. Synchronous — MathJax 4's `convert` is synchronous unless a dynamic font
     * chunk or a lazily loaded package is needed, which our static bundle avoids.
     *
     * @throws MathRenderError
     */
    render(tex: string, options: RenderOptions): HTMLElement {
        if (!this.doc) this.initialise();
        if (!this.doc) throw new MathRenderError("engine not initialised", tex, options.display);

        const key = renderCacheKey(tex, options.display, this.hash);
        const cached = this.cache.get(key);
        if (cached) {
            logger.debug(`cache hit ${key}`);
            return cached;
        }

        try {
            const node = this.doc.convert(tex, {
                display: options.display,
                ...this.metrics(),
            }) as HTMLElement;
            this.renders++;
            this.cache.set(key, node);
            this.scheduleStyleFlush();
            logger.debug(`cache miss ${key} — rendered`);
            return node;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.debug(`render error for "${tex.slice(0, 60)}": ${message}`);
            throw new MathRenderError(message, tex, options.display, err);
        }
    }

    /**
     * Async render. Goes through MathJax's retry machinery, so it survives the cases the sync path
     * cannot: dynamically loaded font chunks and future `\require{...}` support.
     */
    async renderAsync(tex: string, options: RenderOptions): Promise<HTMLElement> {
        if (!this.doc) this.initialise();
        if (!this.doc) throw new MathRenderError("engine not initialised", tex, options.display);

        const key = renderCacheKey(tex, options.display, this.hash);
        const cached = this.cache.get(key);
        if (cached) return cached;

        try {
            const node = (await this.doc.convertPromise(tex, {
                display: options.display,
                ...this.metrics(),
            })) as HTMLElement;
            this.renders++;
            this.cache.set(key, node);
            this.scheduleStyleFlush();
            return node;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new MathRenderError(message, tex, options.display, err);
        }
    }

    /**
     * Applies new settings, rebuilding only when necessary.
     * @returns true if the engine was rebuilt (callers should re-render open views).
     */
    updateConfig(next: EngineConfig): boolean {
        const previous = this.config;
        this.config = next;

        if (!this.doc) return false;

        if (needsRebuild(previous, next)) {
            logger.debug("config change requires rebuild");
            this.teardownDocument();
            this.build();
            return true;
        }

        const nextHash = configHash(next);
        if (nextHash !== this.hash) {
            // Output-affecting but cheap: reconfigure in place and drop the cache.
            this.hash = nextHash;
            if (this.outputJax) {
                this.outputJax.options.scale = next.scale;
                this.outputJax.font.setOptions({ fontURL: next.fontURL });
            }
            this.cache.clear();
            this.flushStyles();
            return true;
        }
        return false;
    }

    setCacheSize(size: number): void {
        this.cache.resize(size);
    }

    clearCache(): void {
        this.cache.clear();
    }

    get stats(): EngineStats {
        return {
            initialised: this.isInitialised,
            version: this.version,
            renders: this.renders,
            cache: this.cache.stats,
        };
    }

    /**
     * Batches stylesheet updates: CHTML's adaptive CSS grows as new glyphs appear, and pulling the
     * sheet after every single formula would be O(used glyphs) per formula.
     */
    private scheduleStyleFlush(): void {
        if (this.styleFlushHandle !== null) return;
        this.styleFlushHandle = window.requestAnimationFrame(() => {
            this.styleFlushHandle = null;
            this.flushStyles();
        });
    }

    private flushStyles(): void {
        if (!this.outputJax || !this.doc) return;
        const sheet = this.outputJax.styleSheet(this.doc) as unknown as HTMLStyleElement;
        if (this.styleNode === sheet) return; // subsequent calls mutate the same node in place

        this.styleNode = sheet;
        sheet.id = STYLE_ELEMENT_ID;
        document.head.appendChild(sheet);
        // Now that it is connected, `sheet.sheet` exists — ask again so the rules collected during
        // the first pass actually get inserted.
        this.outputJax.styleSheet(this.doc);
    }

    /**
     * Ensures the engine's CHTML stylesheet is present in `targetDoc`.
     *
     * The canonical stylesheet lives in the host window's `document`. A popout window is a *separate*
     * Document, so formulas rendered there would be unstyled without a local copy. Adapters call this
     * after rendering into a non-host document (e.g. a popout window's Reading View).
     *
     * Cheap and idempotent: it only clones the canonical sheet the first time a given document needs
     * it. The clone is a snapshot — fine for the small, bounded set of formulas a popout usually
     * shows (see docs/compatibility.md).
     */
    ensureStyles(targetDoc: Document): void {
        if (targetDoc === document) return;
        if (targetDoc.getElementById(STYLE_ELEMENT_ID)) return;
        if (!this.styleNode) return;
        const clone = this.styleNode.cloneNode(true) as HTMLStyleElement;
        clone.id = STYLE_ELEMENT_ID;
        targetDoc.head.appendChild(clone);
    }

    private teardownDocument(): void {
        if (this.styleFlushHandle !== null) {
            window.cancelAnimationFrame(this.styleFlushHandle);
            this.styleFlushHandle = null;
        }
        this.styleNode?.remove();
        this.styleNode = null;
        this.outputJax?.clearCache();
        this.doc = null;
        this.outputJax = null;
    }

    /** Removes every trace of the engine from the document. Called on plugin unload. */
    dispose(): void {
        this.teardownDocument();
        this.cache.clear();
        logger.debug("engine disposed");
    }
}
