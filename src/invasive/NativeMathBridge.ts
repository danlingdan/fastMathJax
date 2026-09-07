import { loadMathJax } from "obsidian";

import { logger } from "../utils/logger";

/**
 * Replaces Obsidian's native MathJax rendering with this plugin's engine (1.0 "invasive mode").
 *
 * Feasibility facts this relies on (verified against the Obsidian 1.13.7 app bundle):
 *
 * 1. Obsidian loads MathJax 3 lazily and unconditionally assigns `window.MathJax` just before
 *    the script executes, so pre-seeding a config object is clobbered — patching the members is
 *    the only stable hook.
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
 *
 * Timing: a Live Preview widget can render during workspace restore, before the plugin's
 * layout-ready hook runs. `preinstall()` therefore installs a setter trap on `window.MathJax`
 * while the plugin loads, so the members are patched the instant the MathJax bundle object
 * appears — before any caller can reach them. `install()` then only verifies and finalizes.
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
/** Window slot keeping the real native object while the setter trap is active. */
const TRAP_SLOT = "__latestMathJaxNative";

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
    /**
     * Copies the engine stylesheet into a target (popout) document. Only the owning instance
     * provides this; guest instances (see `install`) forward their style syncs to it.
     */
    syncStyles?: (targetDoc: Document) => void;
}

/** The bridge that currently owns the patch in this JS context, if any. */
let activeBridge: NativeMathBridge | null = null;

/**
 * Clears the context-wide bridge registry. Test-only: each test creates fresh bridges and
 * the registry would otherwise make later installs adopt earlier tests' bridges.
 */
export function resetActiveBridgeForTests(): void {
    activeBridge = null;
}

function windowRef(): Window {
    return window;
}

function nativeMathJax(): NativeMathJax | null {
    return (window as unknown as { MathJax?: NativeMathJax }).MathJax ?? null;
}

function isFullMathJax(value: unknown): value is NativeMathJax {
    return (
        typeof value === "object" && value !== null &&
        typeof (value as NativeMathJax).tex2chtml === "function" &&
        typeof (value as NativeMathJax).chtmlStylesheet === "function"
    );
}

export class NativeMathBridge {
    private readonly options: NativeMathBridgeOptions;
    private installed = false;
    /** True when another bridge in this context already owns the patch and this one adopts it. */
    private adopted = false;
    private trapActive = false;
    private originalTex2chtml: NonNullable<NativeMathJax["tex2chtml"]> | undefined;
    private originalStylesheet: NonNullable<NativeMathJax["chtmlStylesheet"]> | undefined;

    /**
     * Obsidian popout windows share the plugin's JS context: every window runs its own plugin
     * instance, and without this check each would patch `window.MathJax` in turn, each saving
     * the previous instance's patch as "the original". Only one bridge may own the patch per
     * context; later instances adopt it.
     */
    private static activeBridge(): NativeMathBridge | null {
        return activeBridge;
    }

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
     * Installs the setter trap (or patches immediately if the bundle is already loaded).
     * Called during plugin `onload`, i.e. before Obsidian renders any math, so the very first
     * widget render already goes through the bundled engine. Never throws.
     */
    preinstall(): void {
        if (this.installed || this.trapActive) return;
        try {
            const current = nativeMathJax();
            if (isFullMathJax(current)) {
                // MathJax is already loaded (plugin reload / late preinstall): patch directly.
                this.attach(current);
                return;
            }
            const win = windowRef() as unknown as Record<string, unknown>;
            // Preserve whatever non-full value currently occupies the slot (e.g. Obsidian's
            // partial config object) — dropping the property without stashing it would lose
            // the object for every later reader if no assignment ever fires the trap.
            win[TRAP_SLOT] = current;
            Object.defineProperty(window, "MathJax", {
                configurable: true,
                get: () => win[TRAP_SLOT],
                set: (value: unknown) => {
                    win[TRAP_SLOT] = value;
                    if (isFullMathJax(value)) {
                        try {
                            this.attach(value);
                        } catch (err) {
                            // Never break the MathJax bundle evaluation itself.
                            logger.warn("invasive mode: trap patch failed:", err);
                        }
                    }
                },
            });
            this.trapActive = true;
        } catch (err) {
            logger.warn("invasive mode: preinstall failed:", err);
        }
    }

    /**
     * Loads Obsidian's MathJax via the public API and makes sure the entry points are patched.
     * With the trap active this usually just confirms the trap already did the work. Fails
     * closed: any structural mismatch returns `{ ok: false }` and leaves the native renderer
     * untouched, which the plugin treats as "stay in coexistence mode".
     */
    async install(): Promise<InstallResult> {
        if (this.installed) return { ok: true };
        const owner = NativeMathBridge.activeBridge();
        if (owner && owner !== this && owner.isInstalled) {
            // Another plugin instance (a popout) already owns the patch in this shared JS
            // context. Adopt it: the guest must not save the owner's patch as "the original"
            // nor fight it over the render entry points.
            this.adopted = true;
            this.installed = true;
            document.body.classList.add(INVASIVE_BODY_CLASS);
            logger.debug("invasive mode: adopting the bridge owned by the primary instance");
            return { ok: true };
        }
        try {
            await loadMathJax();
        } catch (err) {
            return { ok: false, reason: `loadMathJax() failed: ${describe(err)}` };
        }
        const mj = nativeMathJax();
        if (!isFullMathJax(mj)) {
            return {
                ok: false,
                reason:
                    "window.MathJax does not expose tex2chtml/chtmlStylesheet; Obsidian's " +
                    "internal renderer interface has changed",
            };
        }
        if (!this.attach(mj)) {
            return { ok: false, reason: "entry points were patched by something else first" };
        }
        // If any native renders slipped in before the patch (trap miss on an unexpected
        // bundle shape), make sure their output is styled: mirror the v3 stylesheet now.
        this.syncNativeFallbackStyles();
        activeBridge = this;
        logger.debug("invasive mode: native MathJax render entry points patched");
        return { ok: true };
    }

    /** Applies the member patch to a full MathJax object. False when that is not possible. */
    private attach(mj: NativeMathJax): boolean {
        if (this.installed) return true;
        if (mj.tex2chtml === this.patchedTex2chtml) return true; // already ours (trap double-fire)
        if (typeof mj.tex2chtml !== "function" || typeof mj.chtmlStylesheet !== "function") {
            return false;
        }
        this.originalTex2chtml = mj.tex2chtml;
        this.originalStylesheet = mj.chtmlStylesheet;
        mj.tex2chtml = this.patchedTex2chtml;
        mj.chtmlStylesheet = this.patchedStylesheet;
        document.body.classList.add(INVASIVE_BODY_CLASS);
        this.installed = true;
        activeBridge = this;
        this.dropTrap();
        return true;
    }

    /** Removes the setter trap once the real patch is in place (or on uninstall). */
    private dropTrap(): void {
        if (!this.trapActive) return;
        try {
            const win = windowRef() as unknown as Record<string, unknown>;
            const native = win[TRAP_SLOT];
            delete (window as unknown as { MathJax?: unknown }).MathJax;
            if (native !== undefined) {
                (window as unknown as { MathJax?: unknown }).MathJax = native;
            }
            delete win[TRAP_SLOT];
        } catch (err) {
            logger.warn("invasive mode: dropping the trap failed:", err);
        }
        this.trapActive = false;
    }

    /** Restores the original members and every marker this bridge added. Idempotent. */
    uninstall(): void {
        this.dropTrap();
        if (this.adopted) {
            // A guest never owned the patch — leaving it to the owner is correct.
            this.adopted = false;
            this.installed = false;
            return;
        }
        const mj = nativeMathJax();
        if (mj) {
            if (mj.tex2chtml === this.patchedTex2chtml) {
                mj.tex2chtml = this.originalTex2chtml;
            }
            if (mj.chtmlStylesheet === this.patchedStylesheet) {
                mj.chtmlStylesheet = this.originalStylesheet;
            }
        }
        if (activeBridge === this) activeBridge = null;
        document.body.classList.remove(INVASIVE_BODY_CLASS);
        document.getElementById(NATIVE_FALLBACK_STYLE_ID)?.remove();
        this.installed = false;
        this.originalTex2chtml = undefined;
        this.originalStylesheet = undefined;
        logger.debug("invasive mode: native MathJax entry points restored");
    }

    /**
     * The owning instance's cross-document style sync, for guest instances: popout rendering
     * goes through the shared patch (owned by the primary window's engine), so style copies
     * into any document must be made by that same engine.
     */
    get ownerStyleSync(): ((targetDoc: Document) => void) | null {
        if (!this.adopted) return null;
        return NativeMathBridge.activeBridge()?.options.syncStyles ?? null;
    }

    /**
     * Renders with the *native* MathJax, bypassing the patch. Used by the plugin's
     * "fall back to Obsidian" failure mode: the one case where MathJax 3 output appears
     * alongside MathJax 4 output, so its stylesheet is mirrored — scoped — into the document.
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
     *
     * The mirror is scoped to *exclude* containers this plugin rendered: both engines emit the
     * same `mjx-*` vocabulary with different typesetting metrics, and an unscoped v3 sheet
     * would re-create the cross-contamination artifacts fixed in 0.3.0, this time against the
     * MathJax 4 output.
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
            const scoped = scopeNativeCss(text);
            if (!scoped) return;
            let element = document.getElementById(NATIVE_FALLBACK_STYLE_ID) as
                | HTMLStyleElement
                | null;
            if (!element) {
                element = document.createElement("style");
                element.id = NATIVE_FALLBACK_STYLE_ID;
                document.head.appendChild(element);
            }
            element.textContent = scoped;
        } catch (err) {
            logger.debug("invasive mode: native stylesheet sync failed:", err);
        }
    }
}

/**
 * Restricts native v3 CSS rules to containers the plugin did NOT render, and renames its
 * font families so the two engines' @font-face declarations cannot shadow each other.
 *
 * Every v3 CHTML rule is prefixed with `mjx-container`, so rewriting that token with a
 * `:not()` exclusion keeps the rules from matching MathJax 4 output. The family rename is
 * essential: v3's `MJXTEX*` / `MJXZERO` @font-face declarations share their names with the
 * families the v4 output references, and a later same-name declaration wins the cascade —
 * silently stripping the bundled engine's letter glyphs (observed on desktop, 1.0 pass).
 * Rules that mention neither token (URLs, sizes) are left untouched. Exported for tests.
 */
export function scopeNativeCss(css: string): string {
    if (!css) return "";
    return css
        .replace(/MJX((?:TEX|ZERO)[A-Z0-9-]*)/g, "MJXNV$1")
        .replace(/mjx-container(?![\w-])/g, "mjx-container:not([data-latest-mathjax-engine])");
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
