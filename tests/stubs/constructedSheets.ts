/**
 * Constructed-stylesheet stub for jsdom, whose own `CSSStyleSheet` accepts `replaceSync` but
 * exposes no readable content and whose `document` lacks `adoptedStyleSheets`. Production code
 * (src/engine/adoptedSheet.ts) injects plugin-owned CSS through adopted sheets; tests that
 * assert that CSS install this stub on the environment document first. Real browsers are
 * unaffected — the stub is only meant for jsdom test environments.
 */
export function installConstructedSheetStubs(doc: Document): void {
    const win = doc.defaultView as (Window & { CSSStyleSheet?: unknown }) | null;
    if (!win) return;

    class CSSStyleSheetStub {
        private css = "";

        replaceSync(css: string): void {
            this.css = css;
        }

        get cssText(): string {
            return this.css;
        }
    }

    (win as { CSSStyleSheet?: unknown }).CSSStyleSheet = CSSStyleSheetStub;

    let adopted: unknown[] = [];
    Object.defineProperty(doc, "adoptedStyleSheets", {
        configurable: true,
        get: () => adopted,
        set: (value: unknown[]) => {
            adopted = value;
        },
    });
}
