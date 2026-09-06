import type { MarkdownPostProcessorContext } from "obsidian";

import type LatestMathJaxPlugin from "../main";

/**
 * The only post-processor that runs in invasive mode — and it never renders.
 *
 * In invasive mode Obsidian's own pipeline produces every formula through the patched
 * `tex2chtml`, so the coexistence adapters (and their source-recovery machinery) stay idle.
 * The one thing Obsidian's pipeline cannot do is copy the bundled engine's stylesheet into a
 * *popout* document, because the formula nodes are created against the host document and
 * adopted afterwards. This processor runs wherever Obsidian renders markdown — including
 * popouts — and refreshes the engine's stylesheet copy there after each pass.
 */
export function createInvasiveStyleSyncProcessor(
    plugin: LatestMathJaxPlugin,
): (element: HTMLElement, context: MarkdownPostProcessorContext) => void {
    return (element: HTMLElement) => {
        if (!plugin.invasiveActive) return;
        const targetDoc = element.ownerDocument;
        if (targetDoc === document) return; // host document: the engine flush already covers it
        plugin.syncInvasiveStyles(targetDoc);
    };
}
