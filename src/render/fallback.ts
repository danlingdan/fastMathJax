import type { FallbackMode } from "../settingsModel";

export interface FallbackPresentation {
    kind: "source" | "error";
    text: string;
}

export function fallbackPresentation(
    mode: Exclude<FallbackMode, "obsidian">,
    tex: string,
    display: boolean,
    error: unknown,
): FallbackPresentation {
    if (mode === "error") {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: "error", text: `MathJax error: ${message}` };
    }
    return {
        kind: "source",
        text: display ? `$$${tex}$$` : `$${tex}$`,
    };
}

export function createFallbackElement(
    doc: Document,
    mode: Exclude<FallbackMode, "obsidian">,
    tex: string,
    display: boolean,
    error: unknown,
): HTMLElement {
    const presentation = fallbackPresentation(mode, tex, display, error);
    const element = doc.createElement(display ? "div" : "span");
    element.className = `latest-mathjax-fallback is-${presentation.kind}`;
    element.textContent = presentation.text;
    return element;
}
