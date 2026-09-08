import { logger } from "../utils/logger";

/**
 * Plugin-owned CSS that cannot ship in the static styles.css — adaptive MathJax glyph rules,
 * mirrored @font-face sets, the scoped native-v3 fallback mirror — is injected through
 * *constructed stylesheets* (`document.adoptedStyleSheets`). That is the platform's designed
 * mechanism for dynamic CSS: Obsidian's plugin guidelines forbid plugins from creating and
 * attaching `<style>` elements (eslint `obsidianmd/no-forbidden-elements`), and constructed
 * sheets are supported in every Obsidian runtime (Chromium desktop, modern mobile webviews).
 *
 * Sheets are marked with a plain JS property so an engine instance can find and release its
 * own sheet across rebuilds and plugin reloads without keeping DOM references.
 */

type MarkedSheet = CSSStyleSheet & Record<string, unknown>;

/** Marker for the engine's mirrored `@font-face` sheet in the host document. */
export const FONT_FACE_SHEET_MARKER = "latestMathJaxFontFaceSheet";
/** Marker for the scoped native-v3 fallback mirror (invasive mode) in the host document. */
export const NATIVE_FALLBACK_SHEET_MARKER = "latestMathJaxNativeFallbackSheet";

type SheetDocument = Document & { adoptedStyleSheets?: CSSStyleSheet[] };

function sheetsOf(doc: Document): CSSStyleSheet[] {
    return (doc as SheetDocument).adoptedStyleSheets ?? [];
}

function setSheets(doc: Document, sheets: CSSStyleSheet[]): void {
    (doc as SheetDocument).adoptedStyleSheets = sheets;
}

function isMarked(sheet: CSSStyleSheet, marker: string): boolean {
    return marker in (sheet as unknown as Record<string, unknown>);
}

/**
 * Returns the document's adopted sheet carrying `marker`, adopting a fresh empty one first
 * when absent. Returns null in environments without constructed stylesheets (jsdom without
 * the test stub); callers skip injection there rather than falling back to style elements.
 */
export function adoptSheet(doc: Document, marker: string): CSSStyleSheet | null {
    const win = doc.defaultView;
    if (!win || typeof win.CSSStyleSheet !== "function") return null;
    const adopted = sheetsOf(doc);
    const existing = adopted.find((sheet) => isMarked(sheet, marker));
    if (existing) return existing;
    try {
        const sheet = new win.CSSStyleSheet() as MarkedSheet;
        sheet[marker] = true;
        setSheets(doc, [...adopted, sheet]);
        return sheet;
    } catch (err) {
        // Losing dynamic CSS must never take rendering down; the next sync retries.
        logger.debug("adopting a constructed stylesheet failed:", err);
        return null;
    }
}

/** Replaces a sheet's content. A failed replace leaves the previous CSS in place. */
export function setSheetCss(sheet: CSSStyleSheet, css: string): void {
    try {
        sheet.replaceSync(css);
    } catch (err) {
        logger.debug("constructed stylesheet sync failed:", err);
    }
}

/** Removes this plugin's sheet carrying `marker` from the document's adopted set. */
export function releaseSheet(doc: Document, marker: string): void {
    const adopted = sheetsOf(doc);
    const kept = adopted.filter((sheet) => !isMarked(sheet, marker));
    if (kept.length !== adopted.length) setSheets(doc, kept);
}

/** Finds the adopted sheet carrying `marker`, or null. Exported for tests. */
export function findAdoptedSheet(doc: Document, marker: string): CSSStyleSheet | null {
    return sheetsOf(doc).find((sheet) => isMarked(sheet, marker)) ?? null;
}
