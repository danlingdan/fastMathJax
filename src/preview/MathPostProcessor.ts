import type { MarkdownPostProcessorContext } from "obsidian";
import type LatestMathJaxPlugin from "../main";
import { findMathInSection, textForSection } from "../utils/mathSource";
import { logger } from "../utils/logger";
import { createFallbackElement } from "../render/fallback";

/** Marks a node we have already re-rendered so a second post-processor pass skips it. */
const HANDLED_ATTR = "data-latest-mathjax";

/**
 * Re-renders math in Reading View with the bundled MathJax 4 engine.
 *
 * Obsidian has already rendered each formula into a `.math.math-block` / `.math.math-inline`
 * wrapper; we replace only its *contents*, keeping the wrapper so Obsidian's own CSS keeps applying.
 * The original TeX is recovered by re-parsing the section's raw markdown (via
 * `context.getSectionInfo`) and pairing each `.math-*` node with the `$$...$$` / `$...$` match at
 * the same document position.
 *
 * Inline `$...$` re-rendering is gated behind `settings.enableInlineReadingView` (default off),
 * because it is riskier to take over prose-embedded math than isolated display blocks.
 *
 * Fallback is graceful: when section info is unavailable (embeds, hover popovers, canvas cards) or a
 * node has no matching source, we leave Obsidian's output untouched — the user's notes never break.
 * A render error likewise keeps the built-in output in place.
 */
export function createReadingViewProcessor(
    plugin: LatestMathJaxPlugin,
): (element: HTMLElement, context: MarkdownPostProcessorContext) => Promise<void> {
    return async (element: HTMLElement, context: MarkdownPostProcessorContext) => {
        if (!plugin.settings.enableReadingView) return;
        if (
            !plugin.compatibility.canRender(
                element.ownerDocument,
                plugin.settings.enablePopout,
            )
        ) return;

        const handleInline = plugin.settings.enableInlineReadingView;

        const blockNodes = collect(element, "block");
        const inlineNodes = handleInline ? collect(element, "inline") : [];
        if (blockNodes.length === 0 && inlineNodes.length === 0) return;

        const section = context.getSectionInfo(element);
        if (!section) {
            logger.debug("Reading View: no section info, leaving Obsidian output in place");
            return;
        }

        // Recover the TeX in document order, then split by kind so an inline formula can never
        // shift a block's index (and vice versa).
        const sources = findMathInSection(
            textForSection(section.text, section.lineStart, section.lineEnd),
        );
        const blockTex = sources.filter((s) => s.display);
        const inlineTex = sources.filter((s) => !s.display);

        await Promise.all([
            rerender(plugin, blockNodes, blockTex, true),
            rerender(plugin, inlineNodes, inlineTex, false),
        ]);
    };
}

function collect(element: HTMLElement, kind: "block" | "inline"): HTMLElement[] {
    const cls = kind === "block" ? "math-block" : "math-inline";
    return Array.from(
        element.querySelectorAll<HTMLElement>(`.math.${cls}`),
    ).filter((el) => !el.hasAttribute(HANDLED_ATTR));
}

async function rerender(
    plugin: LatestMathJaxPlugin,
    nodes: HTMLElement[],
    texList: { tex: string }[],
    display: boolean,
): Promise<void> {
    // A mismatch means Obsidian and our conservative scanner disagree (currency-like dollars are
    // the common case). Index pairing would move later TeX into the wrong wrapper, so fail closed.
    if (nodes.length !== texList.length) {
        logger.debug(
            `Reading View: ${display ? "block" : "inline"} count mismatch ` +
            `(${nodes.length} wrappers, ${texList.length} sources), leaving built-in output`,
        );
        return;
    }

    for (let i = 0; i < nodes.length; i++) {
        const tex = texList[i]?.tex;
        if (tex === undefined) {
            // More rendered nodes than source matches — cannot replace this one safely.
            continue;
        }
        const wrapper = nodes[i];
        try {
            const node = plugin.engine.renderInto(tex, { display }, wrapper.ownerDocument);
            wrapper.setAttribute(HANDLED_ATTR, "true");
            wrapper.replaceChildren(node);
            logger.debug(`Reading View: re-rendered ${display ? "block" : "inline"} #${i}`);
        } catch (err) {
            if (plugin.settings.fallbackMode !== "obsidian") {
                wrapper.setAttribute(HANDLED_ATTR, "true");
                wrapper.replaceChildren(
                    createFallbackElement(
                        wrapper.ownerDocument,
                        plugin.settings.fallbackMode,
                        tex,
                        display,
                        err,
                    ),
                );
            }
            logger.warn(
                `Reading View: render failed for ${display ? "block" : "inline"} #${i}, keeping built-in output:`,
                err,
            );
        }
    }
}
