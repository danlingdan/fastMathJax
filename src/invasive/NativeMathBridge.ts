import { loadMathJax } from "obsidian";

import { logger } from "../utils/logger";

/**
 * Replaces Obsidian's native MathJax rendering with this plugin's engine (1.0 "invasive mode").
 *
 * Feasibility facts this relies on (verified against the Obsidian 1.13.7 app bundle):
 *
 * 1. Obsidian loads MathJax 3 lazily and unconditionally assigns `window.MathJax` just before
 *    the script executes, so pre-seeding a config object is clobbered — patching after
 *    `loadMathJax()` is the only stable hook.
 * 2. Every native render path (the Reading View post-processor and the Live Preview widget)
 *    funnels through `MathJax.tex2chtml(source, { display })`, and stylesheet syncing funnels
 *    through `MathJax.chtmlStylesheet()`. Both are resolved dynamically on `window` at call
 *    time, so replacing these two members reroutes every surface — including hover previews,
 *    embeds and PDF export, which the coexistence adapters can never reach.
 * 3. Native callers expect a single `mjx-container` root element back. MathJax 4 emits the same
 *    tag vocabulary, so with tag renaming disabled the output slots straight into Obsidian's
 *    wrapper DOM.
 *
 * Only these two members are patched. `tex2svg`, `version` and everything else stay native so
 * other plugins keep working, and `uninstall()` restores the original references exactly.
 */

/** Minimal structural view of the members this bridge touches on Obsidian's native MathJax. */
interface NativeMathJax {
    tex2chtml?: (tex: string, options?: { display?: boolean }) => HTMLElement;
    chtmlStylesheet?: (options?: unknown) => HTMLStyleElement;
    [key: string]: unknown;
}

/** Marker attribute carrying the TeX a rendered container was produced from. */
export const INVASIVE_SOURCE_ATTR = "data-latest-mathjax-source";
const INVASIVE_BODY_CLASS = "latest-mathjax-invasive";
/** Holds the *native* v3 stylesheet while fallback rendering is in use (see `renderNative`). */
const NATIVE_FALLBACK_STYLE_ID = "latest-mathjax-native-fallback-styles";

export type InstallResult = { ok: true } | { ok: false; reason: string };

export interface NativeMathBridgeOptions {
    /**
     * Renders one formula with the bundled engine and returns the container to mount, or null
     * to fall through to the native renderer (used by the "fall back to Obsidian" failure mode).
     * Must not throw.
     */
    render: (tex: string, display: boolean) => HTMLElement | null;
    /** The bundled engine's current stylesheet element; recreated on every flush. */
    stylesheet: () => HTMLStyleElement | null;
}

function nativeMathJax(): NativeMathJax | null {
    return (window as unknown as { MathJax?: NativeMathJax }).MathJax ?? null;
}

export class NativeMathBridge {
    private readonly options: NativeMathBridgeOptions;
    private installed = false;
    private originalTex2chtml: NonNullable<NativeMathJax["tex2chtml"]> | undefined;
    private originalStylesheet: NonNullable<NativeMathJax["chtmlStylesheet"]> | undefined;

    /** Stable identities for the patched members so `uninstall` only removes our own patches. */
    private readonly patchedTex2chtml = (
        tex: string,
        options?: { display?: boolean },
    ): HTMLElement => this.renderPatched(tex, options?.display === true);
    private readonly patchedStylesheet = (): HTMLStyleElement => this.stylesheetPatched();
    private emptyStylesheet: HTMLStyleElement | null = null;

    constructor(options: NativeMathBridgeOptions) {
        this.options = options;
    }

    get isInstalled(): boolean {
        return this.installed;
    }

    /**
     * Loads Obsidian's MathJax via the public API, then patches the two render entry points.
     * Fails closed: any structural mismatch returns `{ ok: false }` and leaves the native
     * renderer untouched, which the plugin treats as "stay in coexistence mode".
     */
    async install(): Promise<InstallResult> {
        if (this.installed) return { ok: true };
        try {
            await loadMathJax();
        } catch (err) {
            return { ok: false, reason: `loadMathJax() failed: ${describe(err)}` };
        }
        const mj = nativeMathJax();
        if (!mj) {
            return { ok: false, reason: "window.MathJax is missing after loadMathJax()" };
        }
        if (typeof mj.tex2chtml !== "function" || typeof mj.chtmlStylesheet !== "function") {
            return {
                ok: false,
                reason:
                    "window.MathJax does not expose tex2chtml/chtmlStylesheet; Obsidian's " +
                    "internal renderer interface has changed",
            };
        }
        this.originalTex2chtml = mj.tex2chtml;
        this.originalStylesheet = mj.chtmlStylesheet;
        mj.tex2chtml = this.patchedTex2chtml;
        mj.chtmlStylesheet = this.patchedStylesheet;
        document.body.classList.add(INVASIVE_BODY_CLASS);
        this.installed = true;
        logger.debug("invasive mode: native MathJax render entry points patched");
        return { ok: true };
    }

    /** Restores the original members and every marker this bridge added. Idempotent. */
    uninstall(): void {
        if (!this.installed) return;
        const mj = nativeMathJax();
        if (mj) {
            if (mj.tex2chtml === this.patchedTex2chtml) {
                mj.tex2chtml = this.originalTex2chtml;
            }
            if (mj.chtmlStylesheet === this.patchedStylesheet) {
                mj.chtmlStylesheet = this.originalStylesheet;
            }
        }
        document.body.classList.remove(INVASIVE_BODY_CLASS);
        document.getElementById(NATIVE_FALLBACK_STYLE_ID)?.remove();
        this.installed = false;
        this.originalTex2chtml = undefined;
        this.originalStylesheet = undefined;
        logger.debug("invasive mode: native MathJax entry points restored");
    }

    /**
     * Renders with the *native* MathJax, bypassing the patch. Used by the plugin's
     * "fall back to Obsidian" failure mode: the one case where MathJax 3 output appears
     * alongside MathJax 4 output, so its stylesheet is mirrored into a separate element.
     */
    renderNative(tex: string, display: boolean): HTMLElement | null {
        const original = this.originalTex2chtml;
        const mj = nativeMathJax();
        if (!original || !mj) return null;
        try {
            const node = original.call(mj, tex, { display });
            this.syncNativeFallbackStyles();
            return node ?? null;
        } catch (err) {
            logger.warn("invasive mode: native fallback render failed:", err);
            return null;
        }
    }

    private renderPatched(tex: string, display: boolean): HTMLElement {
        let node: HTMLElement | null = null;
        try {
            node = this.options.render(tex, display);
        } catch (err) {
            // The render callback is contractually non-throwing; treat a violation as fallback.
            logger.warn("invasive mode: render callback threw:", err);
        }
        if (node) return node;
        const native = this.renderNative(tex, display);
        if (native) return native;
        // Absolute last resort so native callers always receive a mountable element.
        return document.createElement("span");
    }

    private stylesheetPatched(): HTMLStyleElement {
        const sheet = this.options.stylesheet();
        if (sheet) return sheet;
        // Engine not built yet: hand back a stable empty element so the caller's append/toggle
        // bookkeeping stays harmless until the first real flush replaces our reference.
        if (!this.emptyStylesheet) this.emptyStylesheet = document.createElement("style");
        return this.emptyStylesheet;
    }

    /**
     * Mirrors the native v3 stylesheet into the document. The native engine accumulates rules
     * as it renders, but its own flush entry point is patched out — without this mirror, a
     * natively rendered fallback formula would appear with no glyph CSS at all.
     */
    private syncNativeFallbackStyles(): void {
        const original = this.originalStylesheet;
        const mj = nativeMathJax();
        if (!original || !mj) return;
        try {
            const sheet = original.call(mj);
            if (!sheet) return;
            const text = sheet.textContent && sheet.textContent.trim().length > 0
                ? sheet.textContent
                : serializeSheet(sheet);
            if (!text) return;
            let element = document.getElementById(NATIVE_FALLBACK_STYLE_ID) as
                | HTMLStyleElement
                | null;
            if (!element) {
                element = document.createElement("style");
                element.id = NATIVE_FALLBACK_STYLE_ID;
                document.head.appendChild(element);
            }
            element.textContent = text;
        } catch (err) {
            logger.debug("invasive mode: native stylesheet sync failed:", err);
        }
    }
}

function serializeSheet(sheet: HTMLStyleElement): string {
    const rules = sheet.sheet?.cssRules;
    if (!rules) return "";
    try {
        return Array.from(rules, (rule) => rule.cssText).join("\n");
    } catch {
        return "";
    }
}

function describe(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
