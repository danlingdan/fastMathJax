import type { MarkdownView } from "obsidian";
import type { EditorView } from "@codemirror/view";

import { findMathRanges, type RecoveredMathRange } from "../utils/mathSource";
import { INVASIVE_SOURCE_ATTR } from "./NativeMathBridge";

/**
 * One-time migration for editor widgets that rendered with the *native* renderer before the
 * bridge landed (the cold-startup race: widgets register their render callbacks before the
 * plugin's patch applies).
 *
 * `setViewState` cannot fix this: Obsidian updates a markdown view in place and CodeMirror
 * keeps widget DOM for unchanged decoration sets. Instead, each stale wrapper's TeX is
 * recovered from the editor document via `posAtDOM` — the same mapping the coexistence
 * Live Preview adapter uses — and its output is replaced directly. Any *later* widget
 * re-render goes through the patched render path on its own.
 */
export function migrateStaleEditorMath(
    view: MarkdownView,
    render: (tex: string, display: boolean) => HTMLElement | null,
): number {
    // `editor.cm` exists at runtime on every Obsidian build but is missing from the 1.8 typings.
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    const container = view.containerEl;
    if (!cm || !container) return 0;
    const wrappers = container.querySelectorAll<HTMLElement>(".math");
    if (wrappers.length === 0) return 0;
    const ranges = findMathRanges(cm.state.doc.toString());
    let migrated = 0;
    for (const wrapper of Array.from(wrappers)) {
        // Already ours (or ours + nothing native) — nothing to do.
        if (wrapper.querySelector("mjx-container[data-latest-mathjax-engine]")) continue;
        // Not rendered at all — the widget will call the patched renderer when it does.
        if (wrapper.querySelector("mjx-container") === null) continue;
        const source = sourceForWrapper(cm, wrapper, ranges);
        if (!source) continue;
        try {
            const rendered = render(source.tex, source.display);
            if (!rendered) continue;
            rendered.setAttribute(INVASIVE_SOURCE_ATTR, source.tex);
            wrapper.replaceChildren(rendered);
            migrated++;
        } catch {
            // Leave the native output in place; a later widget re-render retries.
        }
    }
    return migrated;
}

function sourceForWrapper(
    cm: EditorView,
    wrapper: HTMLElement,
    ranges: RecoveredMathRange[],
): RecoveredMathRange | undefined {
    let position: number;
    try {
        position = cm.posAtDOM(wrapper);
    } catch {
        return undefined;
    }
    const display = wrapper.classList.contains("math-block");
    return ranges.find(
        (range) =>
            range.display === display &&
            position >= range.from &&
            position <= range.to,
    ) ?? ranges.find(
        (range) => range.display === display && Math.abs(range.from - position) <= 2,
    );
}
