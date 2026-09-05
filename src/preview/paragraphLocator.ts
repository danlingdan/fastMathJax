import {
    escapeUnsafeDollarDelimiters,
    findMathInSection,
    lastMathDollarIndex,
    type RecoveredMath,
} from "../utils/mathSource";

/** One blank-line-separated source block scheduled for a per-block inline re-render. */
export interface InlineBlockPlan {
    /** The raw source block, used to locate the rendered paragraph in the DOM. */
    markdown: string;
    /** The block text to render into staging (sanitized when it contains rejected dollars). */
    renderMarkdown: string;
    /** Inline math sources recovered from the block, in document order. */
    sources: RecoveredMath[];
}

/**
 * Plans per-block inline re-renders for a whole-note source.
 *
 * PDF export receives the entire note as one section, so Obsidian's rendered wrapper count for
 * the note can disagree with our scanner wherever a currency paragraph mis-pairs — and a single
 * disagreement used to fail every inline formula in the export. Planning block by block (blank
 * lines separate blocks, mirroring how Obsidian structures the print DOM) confines any mismatch
 * to its own paragraph. Blocks without inline math are omitted; display math pairs reliably at
 * note level and is handled elsewhere.
 */
export function planInlineBlocks(sourceText: string): InlineBlockPlan[] {
    const parts = sourceText.split(/(\n[\t ]*\n)/u);
    const plans: InlineBlockPlan[] = [];
    for (let i = 0; i < parts.length; i += 2) {
        const markdown = parts[i];
        if (!markdown || !markdown.trim()) continue;
        const sources = findMathInSection(markdown).filter((entry) => !entry.display);
        if (sources.length === 0) continue;
        plans.push({
            markdown,
            renderMarkdown: escapeUnsafeDollarDelimiters(markdown),
            sources,
        });
    }
    return plans;
}

/**
 * Finds the rendered paragraph produced from `markdown` inside `element`.
 *
 * Used by the Reading View currency repair: a paragraph Obsidian mis-paired as math is replaced
 * wholesale with a re-render of the sanitized source, but only when exactly one paragraph matches,
 * so a wrong match can never swap unrelated content.
 *
 * Exported for regression coverage: the locator is the piece most sensitive to Obsidian DOM
 * changes (1.13 wraps paragraphs as `div.el-p > p`; the print DOM uses bare `p`).
 */
export function uniqueParagraphForBlock(
    element: HTMLElement,
    markdown: string,
): HTMLElement | null {
    const firstDollar = markdown.indexOf("$");
    // Anchor the suffix at the last dollar outside code spans; anchoring at a code-span dollar
    // embeds backticks into the suffix, which rendered text content can never contain.
    const lastDollar = lastMathDollarIndex(markdown);
    if (firstDollar < 0 || lastDollar < firstDollar) return null;

    const normalize = (value: string): string => value.replace(/\s+/gu, " ").trim();
    // Code spans also drop their backticks when rendered, so strip them from both anchors.
    const stripCodeMarkers = (value: string): string => value.replace(/`/gu, "");
    const prefix = normalize(stripCodeMarkers(markdown.slice(0, firstDollar)));
    const suffix = normalize(stripCodeMarkers(markdown.slice(lastDollar + 1)));
    if (prefix.length < 4 && suffix.length < 4) return null;

    const candidates = Array.from(element.querySelectorAll<HTMLElement>("p")).filter((paragraph) => {
        const text = normalize(paragraph.textContent ?? "");
        return (!prefix || text.startsWith(prefix)) && (!suffix || text.endsWith(suffix));
    });
    return candidates.length === 1 ? candidates[0] : null;
}
