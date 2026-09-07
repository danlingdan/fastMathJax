import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { CHTML } from "@mathjax/src/js/output/chtml.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { browserAdaptor } from "@mathjax/src/js/adaptors/browserAdaptor.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/chtml.js";
import { MathJaxNewcmFont as MathJaxNewcmSvgFont } from "@mathjax/mathjax-newcm-font/js/svg.js";
import { AssistiveMmlHandler } from "@mathjax/src/js/a11y/assistive-mml.js";
import type { MathDocument } from "@mathjax/src/js/core/MathDocument.js";

import { MathCache, type CacheStats } from "./MathCache";
import { isolateOutput, isolateStyles } from "./outputIsolation";
import {
    type EngineConfig,
    configHash,
    defaultEngineConfig,
    mirrorFontUrls,
    needsRebuild,
    type PreambleSegment,
} from "./MathJaxConfig";
import { resolvePackages } from "./packages";
import { renderCacheKey } from "../utils/hash";
import { logger } from "../utils/logger";
import {
    configureBundledFontLoading,
    resetBundledFontState,
} from "./bundledFontChunks";

export interface RenderOptions {
    display: boolean;
}

/** A parse failure in one labeled part of the preamble; rendering continues regardless. */
export interface PreambleProblem {
    source: string;
    message: string;
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

/**
 * Human-readable message for anything MathJax throws.
 *
 * MathJax signals "needs async work" (dynamic font chunks, lazy packages) by throwing plain
 * objects rather than Errors, so `String(err)` would log "[object Object]" and hide the cause.
 */
export function describeMathError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "object" && err !== null) {
        const message = (err as { message?: unknown }).message;
        if (typeof message === "string" && message !== "") return message;
        try {
            return JSON.stringify(err);
        } catch {
            // Circular structure — fall through to String().
        }
    }
    return String(err);
}

const STYLE_ELEMENT_ID = "latest-mathjax-chtml-styles";
/**
 * Dedicated element holding ONLY the engine's `@font-face` rules.
 *
 * The adaptive glyph stylesheet is regenerated and replaced on every flush, and a flush that
 * lands at the wrong moment (rebuild, engine swap, another window's engine build in a popout)
 * can present a sheet whose font faces do not cover glyphs that are already mounted — the
 * affected letters then fall back to fonts without the Mathematical Alphanumeric Symbols
 * block and vanish. Copying the faces into this element, which is created once per build and
 * never replaced by the flush machinery, makes them independent of that churn. Exported id
 * for tests.
 */
export const FONT_FACE_ELEMENT_ID = "latest-mathjax-font-faces";
/**
 * All engines in this JS context (the main window's instance and the private PDF engine) can be
 * alive at once and must not evict each other's stylesheets: an adaptive sheet only covers the
 * glyphs its own engine has rendered, so sharing one element id would randomly replace a mounted
 * sheet with one missing the other engine's faces. Obsidian popout windows are separate JS
 * realms that render through this main-window engine (the app object is injected into them), so
 * uniqueness comes from a module-level counter.
 */
let engineSequence = 0;

/**
 * Tags rendered output with the engine revision that produced it.
 *
 * The bundled version string alone cannot tell two engine builds apart (it survives rebuilds), but
 * adapters must be able to recognize output from a superseded revision — after a rebuild the old
 * markup no longer matches the active stylesheet or configuration. Cache clones carry the stamp
 * too: `cloneNode(true)` copies attributes, and cache entries never outlive the revision that
 * rendered them (`build()` clears the cache).
 */
function stampRevision(node: HTMLElement, engine: MathJaxEngine): void {
    node.setAttribute("data-latest-mathjax-engine", mathjax.version);
    node.setAttribute("data-latest-mathjax-revision", String(engine.revision));
}

/**
 * The HTML handler is global to *our* bundled copy of MathJax and may only be registered once.
 * Obsidian re-requires main.js when a plugin is re-enabled, but that is not guaranteed, so this
 * guards against a double registration leaving two handlers in the list.
 */
let handlerRegistered = false;

function ensureHandler(): void {
    if (handlerRegistered) return;
    configureBundledFontLoading();
    const handler = RegisterHTMLHandler(browserAdaptor());
    AssistiveMmlHandler(handler);
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
    private outputJax:
        | CHTML<HTMLElement, Text, Document>
        | SVG<HTMLElement, Text, Document>
        | null = null;
    private styleNode: HTMLStyleElement | null = null;
    private fontFaceNode: HTMLStyleElement | null = null;
    /** Accumulated `@font-face` rules by family; grows monotonically, never shrinks. */
    private readonly fontFaceRules = new Map<string, string>();
    private fontFaceCss = "";
    private readonly styleElementId = `${STYLE_ELEMENT_ID}-${++engineSequence}`;
    private readonly fontFaceElementId = `${FONT_FACE_ELEMENT_ID}-${engineSequence}`;
    /** Element id carrying this instance's adaptive glyph rules (exposed for tests). */
    get styleId(): string {
        return this.styleElementId;
    }
    private styleFlushHandle: number | null = null;
    private styleFlushFallback: number | null = null;
    /** Rule count captured the last time the live sheet was serialized into the element text. */
    private serializedRuleCount = -1;
    private cache: MathCache;
    private renders = 0;
    private configRevision = 0;
    private preambleProblemList: PreambleProblem[] = [];

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

    /** Changes whenever output-affecting configuration changes. */
    get revision(): number {
        return this.configRevision;
    }

    /** Non-fatal problems found while evaluating the user's preamble, in evaluation order. */
    get preambleProblems(): PreambleProblem[] {
        return [...this.preambleProblemList];
    }

    /** First preamble problem, if any — kept for callers that show a single message. */
    get preambleProblem(): string | null {
        return this.preambleProblemList[0]?.message ?? null;
    }

    initialise(): void {
        if (this.doc) return;
        ensureHandler();
        this.build();
    }

    private build(): void {
        const config = this.config;
        const packages = resolvePackages(config.packages);

        resetBundledFontState(
            config.renderer === "svg" ? MathJaxNewcmSvgFont : MathJaxNewcmFont,
        );

        const inputJax = new TeX<HTMLElement, Text, Document>({
            packages,
            // Surface parse failures to us instead of silently emitting a red <merror>. The adapter
            // layer decides what to show the user (raw LaTeX / Obsidian fallback / error text).
            formatError: (_jax: unknown, err: Error) => {
                throw err;
            },
        });

        const outputJax =
            config.renderer === "svg"
                ? new SVG<HTMLElement, Text, Document>({
                      fontData: MathJaxNewcmSvgFont,
                      // SVG embeds glyph path data inline (DefaultFont), so it needs no external
                      // webfont. `fontCache: "local"` puts the shared glyph definitions inside each
                      // equation's <svg>; "global" would share one cache across the document.
                      fontCache: "local",
                      scale: config.scale,
                      displayAlign: "center",
                      displayIndent: "0",
                  })
                : new CHTML<HTMLElement, Text, Document>({
                      fontData: MathJaxNewcmFont,
                      // Font-specific options are separated out automatically by CommonOutputJax.
                      fontURL: config.fontURL,
                      scale: config.scale,
                      displayAlign: "center",
                      displayIndent: "0",
                      // Only emit CSS for constructs actually used; keeps the injected stylesheet small.
                      // The @font-face rules are additionally mirrored into a dedicated, never-replaced
                      // element — see FONT_FACE_ELEMENT_ID.
                      adaptiveCSS: true,
                  });

        // Dynamic file load markers live on MathJax's shared font class, while the glyph tables
        // they populate live on each output-jax font instance.  Eagerly replay every statically
        // bundled setup callback now, during this synchronous build, so a second engine (including
        // an overlapping Obsidian hot-reload instance) cannot make this instance skip its setup and
        // recurse forever in FontData.getChar().
        outputJax.font.loadDynamicFilesSync();

        this.doc = mathjax.document(document, {
            InputJax: inputJax,
            OutputJax: outputJax,
            // Our adapters drive rendering explicitly; MathJax must never scan the page itself.
            // Obsidian's DOM is not ours to walk.
            enableAssistiveMml: config.enableAssistiveMml,
        }) as MathDocument<HTMLElement, Text, Document>;

        this.outputJax = outputJax;
        this.hash = configHash(config);
        this.configRevision++;
        this.cache.clear();
        this.renders = 0;
        this.applyPreamble();
        // Create and attach the stylesheet immediately: CHTML adds later rules through
        // `sheet.insertRule`, which silently no-ops unless the <style> is in the document.
        this.flushStyles();

        logger.debug(
            `engine built — MathJax ${mathjax.version}, packages [${packages.join(", ")}], hash ${this.hash}`,
        );
    }

    /**
     * Evaluates the preamble once so its \newcommand / \DeclareMathOperator definitions land in
     * the TeX parser's persistent macro table. The output is thrown away.
     *
     * With segments, each labeled part is evaluated separately and in order, so a failure in one
     * part is reported for that part and later parts still apply. Without segments the whole
     * preamble is evaluated as one unit, exactly as before 0.2.0.
     */
    private applyPreamble(): void {
        const preamble = this.config.preamble.trim();
        if (!preamble || !this.doc) return;
        const segments: PreambleSegment[] = this.config.preambleSegments?.length
            ? this.config.preambleSegments
            : [{ source: "preamble", text: preamble }];
        this.preambleProblemList = [];

        for (const segment of segments) {
            const text = segment.text.trim();
            if (!text) continue;
            try {
                this.doc.convert(text, { display: true, ...this.metrics() });
                logger.debug(`preamble segment applied: ${segment.source}`);
            } catch (err) {
                this.preambleProblemList.push({
                    source: segment.source,
                    message: describeMathError(err),
                });
                logger.warn(`preamble segment failed (${segment.source}):`, err);
            }
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
            stampRevision(node, this);
            if (this.config.isolationEnabled) isolateOutput(node);
            this.renders++;
            this.cache.set(key, node);
            this.scheduleStyleFlush();
            logger.debug(`cache miss ${key} — rendered`);
            return node;
        } catch (err) {
            const message = describeMathError(err);
            logger.debug(`render error for "${tex.slice(0, 60)}": ${message}`);
            throw new MathRenderError(message, tex, options.display, err);
        }
    }

    /**
     * Renders and moves the result into the document that will display it.
     * MathJax creates nodes in the host document; popout windows need both an adopted node and a
     * local copy of the generated stylesheet.
     */
    renderInto(tex: string, options: RenderOptions, targetDoc: Document): HTMLElement {
        const node = this.render(tex, options);
        this.ensureStyles(targetDoc);
        return node.ownerDocument === targetDoc ? node : targetDoc.adoptNode(node);
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
            stampRevision(node, this);
            if (this.config.isolationEnabled) isolateOutput(node);
            this.renders++;
            this.cache.set(key, node);
            this.scheduleStyleFlush();
            return node;
        } catch (err) {
            throw new MathRenderError(describeMathError(err), tex, options.display, err);
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
            this.configRevision++;
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
     *
     * requestAnimationFrame alone is not enough: Electron pauses it for backgrounded/occluded
     * windows, which would leave formulas rendered after a rebuild stuck with the thin build-time
     * stylesheet until the window is focused again. A timer fallback guarantees the flush lands.
     */
    private scheduleStyleFlush(): void {
        if (this.styleFlushHandle !== null) return;
        this.styleFlushHandle = window.requestAnimationFrame(() => this.runStyleFlush());
        this.styleFlushFallback = window.setTimeout(() => this.runStyleFlush(), 200);
    }

    private runStyleFlush(): void {
        if (this.styleFlushHandle !== null) {
            window.cancelAnimationFrame(this.styleFlushHandle);
            this.styleFlushHandle = null;
        }
        if (this.styleFlushFallback !== null) {
            window.clearTimeout(this.styleFlushFallback);
            this.styleFlushFallback = null;
        }
        this.flushStyles();
    }

    private flushStyles(): void {
        if (!this.outputJax || !this.doc) return;
        try {
            const sheet = this.outputJax.styleSheet(this.doc) as unknown as HTMLStyleElement;
            if (this.styleNode !== sheet) {
                // Replace the previous sheet: MathJax regenerates the element on every call, and
                // the newest one is the most complete (adaptive glyph rules accumulate between
                // flushes). Appending without removing let superseded sheets pile up in <head>,
                // and after an engine rebuild a partially-stale sheet could win the cascade and
                // leave freshly rendered glyphs without their rules.
                this.styleNode?.remove();
                this.styleNode = sheet;
                sheet.id = this.styleElementId;
                document.head.appendChild(sheet);
                // Now that it is connected, insert any pending adaptive rules.
                this.outputJax.styleSheet(this.doc);
                this.serializedRuleCount = -1;
            }
            if (sheet.sheet && this.config.isolationEnabled) {
                isolateStyles(sheet.sheet.cssRules);
                this.serializedRuleCount = -1;
            }
            this.syncSerializedStyles(sheet);
            this.syncFontFaces(sheet);
        } catch (err) {
            // A stylesheet problem must never take rendering down; the next flush retries.
            logger.debug("stylesheet flush failed:", err);
        }
    }

    /**
     * Folds the live CSSOM rule set back into the element's text after every change.
     *
     * MathJax inserts adaptive glyph rules through `sheet.insertRule` once the element is
     * connected, which leaves `textContent` permanently stale. Every cross-document consumer —
     * Obsidian clones this element into popout windows and the PDF print window, and `cloneNode`
     * copies only the text — would then mount formulas whose glyph rules are missing: letters
     * render as nothing while BMP operators survive via system fallback fonts. Re-serializing
     * whenever the rule count changes keeps the text a complete snapshot of the sheet.
     */
    private syncSerializedStyles(sheet: HTMLStyleElement): void {
        const live = sheet.sheet;
        if (!live) return;
        const count = live.cssRules.length;
        if (count === 0 || count === this.serializedRuleCount) return;
        const serialized = Array.from(live.cssRules, (rule) => rule.cssText).join("\n");
        // Guard against lossy CSSOM implementations — jsdom's cssstyle drops the `src`
        // declaration inside @font-face — so a serialization that would strip font sources
        // from every cross-document copy never lands. Real browsers round-trip losslessly.
        const liveUrls = serialized.match(/url\(/g)?.length ?? 0;
        const textUrls = sheet.textContent.match(/url\(/g)?.length ?? 0;
        if (liveUrls < textUrls) return;
        sheet.textContent = serialized;
        this.serializedRuleCount = count;
    }

    /**
     * Starts fetching every registered-but-unfetched font face in `doc`.
     *
     * Font faces load lazily when the browser decides text needs them, and that trigger is
     * not reliable in every document an Obsidian popout renders into — faces were observed
     * stuck at "unloaded" while mounted formulas referenced them, leaving letter glyphs
     * invisible (operators survive via system fonts). Kicking off `FontFace.load()` for each
     * face makes rendering deterministic; the calls are no-ops once a face is loading/loaded.
     */
    private triggerFontLoads(doc: Document): void {
        try {
            const faces = Array.from(
                doc.fonts as unknown as Iterable<
                    { family: string; status: string; load(): Promise<unknown> }
                >,
            );
            for (const face of faces) {
                if (face.status === "unloaded" && face.family.includes("NCM")) {
                    void face.load().catch(() => undefined);
                }
            }
        } catch {
            // Best effort only; the browser's lazy loading remains as fallback.
        }
    }

    /**
     * Mirrors the engine's `@font-face` rules into the dedicated persistent element.
     *
     * The adaptive glyph sheet is regenerated per flush and its face set follows recent
     * usage — a flush after a small render can present a sheet with only a handful of the
     * faces that already-mounted output depends on. The capture therefore MERGES: a face
     * once seen is kept for the engine's lifetime, so the persistent element always covers
     * every glyph the engine has ever rendered.
     */
    private syncFontFaces(sheet: HTMLStyleElement): void {
        const rules = sheet.sheet?.cssRules;
        let changed = false;
        if (rules) {
            for (const rule of Array.from(rules)) {
                if (!(rule instanceof CSSFontFaceRule)) continue;
                const family = (rule as CSSFontFaceRule).style
                    .getPropertyValue("font-family")
                    .trim();
                if (!family) continue;
                const css = rule.cssText;
                if (this.fontFaceRules.get(family) !== css) {
                    this.fontFaceRules.set(family, css);
                    changed = true;
                }
            }
        }
        if (this.fontFaceRules.size === 0) return;
        if (!changed && this.fontFaceNode && this.fontFaceCss) {
            this.triggerFontLoads(document);
            return;
        }
        this.fontFaceCss = [...this.fontFaceRules.values()].join("\n");
        if (!this.fontFaceNode) {
            this.fontFaceNode = document.getElementById(
                this.fontFaceElementId,
            ) as HTMLStyleElement | null;
            if (!this.fontFaceNode) {
                this.fontFaceNode = document.createElement("style");
                this.fontFaceNode.id = this.fontFaceElementId;
                document.head.appendChild(this.fontFaceNode);
            }
        }
        this.fontFaceNode.textContent = this.fontFaceCss;
        this.triggerFontLoads(document);
    }

    /**
     * The live stylesheet element backing this engine's output.
     *
     * Invasive mode hands this to Obsidian when its native pipeline asks for the CHTML
     * stylesheet. The element is replaced (never mutated in place) on every flush, so callers
     * must re-read this each time instead of holding the node. Null before the first build.
     */
    get stylesheet(): HTMLStyleElement | null {
        return this.styleNode;
    }

    /**
     * Distinct woff2 URLs referenced by the current stylesheet's `@font-face` rules.
     *
     * The font-face set is static per font version, so this reflects the complete download set
     * right after `build()`, before any formula renders. Returns basenames' source URLs; callers
     * that need plain file names take the last path segment. Empty until the stylesheet exists.
     */
    getFontFaceUrls(): string[] {
        const text = this.styleNode?.textContent ?? "";
        return [...new Set(
            Array.from(text.matchAll(/url\(["']?([^"')]+)["']?\)/g), (m) => m[1]),
        )];
    }

    /**
     * Ensures the engine's CHTML stylesheet is present in `targetDoc`.
     * The canonical stylesheet lives in the host window's `document`. A popout window is a *separate*
     * Document, so formulas rendered there would be unstyled without a local copy. Adapters call this
     * after rendering into a non-host document (e.g. a popout window's Reading View).
     *
     * CSSOM rules inserted after the style element was attached are not preserved by cloneNode().
     * Serialize the live rule list instead, and refresh an existing target sheet after every render.
     * This matters for PDF export: Obsidian copies styles into a temporary print window before it
     * renders the note, so a one-time snapshot can contain none of the adaptive glyph rules.
     *
     * Local font URLs are rewritten to the CDN base in the copy: popout documents live at a
     * null `about:blank` origin, and the `app://` protocol handler rejects font fetches from
     * there (faces error out and every letter falls back to a font without the Mathematical
     * Alphanumeric Symbols block). The host document keeps the local URLs — only the mirror
     * changes, so offline rendering in the main window is unaffected.
     */
    ensureStyles(targetDoc: Document): void {
        if (targetDoc === document) return;
        this.flushStyles();
        if (!this.styleNode) return;
        const css = this.mirrorCss(this.serializedStyles());
        let target = targetDoc.getElementById(this.styleElementId) as HTMLStyleElement | null;
        if (!target) {
            target = targetDoc.createElement("style");
            target.id = this.styleElementId;
            targetDoc.head.appendChild(target);
        }
        target.textContent = css;
        // The copied glyph sheet is adaptive and can lack faces; mirror the dedicated
        // font-face element as well so glyphs keep their fonts in every document.
        if (this.fontFaceCss) {
            let faces = targetDoc.getElementById(this.fontFaceElementId) as
                | HTMLStyleElement
                | null;
            if (!faces) {
                faces = targetDoc.createElement("style");
                faces.id = this.fontFaceElementId;
                targetDoc.head.appendChild(faces);
            }
            faces.textContent = this.mirrorCss(this.fontFaceCss);
        }
        this.triggerFontLoads(targetDoc);
    }

    /**
     * Rewrites the active (possibly local) font URL base to the bundled CDN default for
     * cross-document copies. No-op when the engine already runs on the CDN base.
     */
    private mirrorCss(css: string): string {
        return mirrorFontUrls(css, this.config.fontURL);
    }

    private serializedStyles(): string {
        const sheet = this.styleNode?.sheet;
        if (!sheet) return this.styleNode?.textContent ?? "";
        try {
            return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
        } catch {
            return this.styleNode?.textContent ?? "";
        }
    }

    private teardownDocument(): void {
        if (this.styleFlushHandle !== null) {
            window.cancelAnimationFrame(this.styleFlushHandle);
            this.styleFlushHandle = null;
        }
        if (this.styleFlushFallback !== null) {
            window.clearTimeout(this.styleFlushFallback);
            this.styleFlushFallback = null;
        }
        this.styleNode?.remove();
        this.styleNode = null;
        this.serializedRuleCount = -1;
        this.fontFaceNode?.remove();
        this.fontFaceNode = null;
        this.fontFaceRules.clear();
        this.fontFaceCss = "";
        // CHTML exposes `clearCache`; SVG's equivalent is `clearFontCache`. Branch on the concrete
        // type so the teardown is correct for whichever renderer is active.
        if (this.outputJax instanceof CHTML) {
            this.outputJax.clearCache();
        } else if (this.outputJax instanceof SVG) {
            this.outputJax.clearFontCache();
        }
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
