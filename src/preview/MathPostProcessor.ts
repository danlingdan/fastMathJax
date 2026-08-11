import type { MarkdownPostProcessorContext } from "obsidian";
import type LatestMathJaxPlugin from "../main";
import { extractDisplayMath } from "../utils/mathSource";
import { logger } from "../utils/logger";

/** Marks a node we have already re-rendered so a second post-processor pass skips it. */
const HANDLED_ATTR = "data-latest-mathjax";

/**
 * Re-renders display math (`$$ ... $$`) in Reading View with the bundled MathJax 4 engine.
 *
 * Obsidian has already rendered the formula into a `.math.math-block` wrapper; we replace only its
 * *contents*, keeping the wrapper so Obsidian's own CSS keeps applying. The original TeX is
 * recovered by re-parsing the section's raw markdown (via `context.getSectionInfo`) and pairing
 * each `.math-block` node with the `$$...$$` match at the same document position.
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

        const blocks = Array.from(
            element.querySelectorAll<HTMLElement>(".math.math-block"),
        ).filter((el) => !el.hasAttribute(HANDLED_ATTR));
        if (blocks.length === 0) return;

        const section = context.getSectionInfo(element);
        if (!section) {
            logger.debug("Reading View: no section info, leaving Obsidian output in place");
            return;
        }

        const sources = extractDisplayMath(section.text);
        if (sources.length === 0) return;

        for (let i = 0; i < blocks.length; i++) {
            const tex = sources[i];
            if (tex === undefined) {
                // More rendered blocks than source matches — cannot replace this one safely.
                continue;
            }

            const wrapper = blocks[i];
            try {
                const node = plugin.engine.render(tex, { display: true });
                wrapper.setAttribute(HANDLED_ATTR, "true");
                wrapper.replaceChildren(node);
                logger.debug(`Reading View: re-rendered display block #${i}`);
            } catch (err) {
                // Engine threw (MathRenderError): keep Obsidian's already-rendered output.
                logger.warn(
                    `Reading View: render failed for block #${i}, keeping built-in output:`,
                    err,
                );
            }
        }
    };
}
