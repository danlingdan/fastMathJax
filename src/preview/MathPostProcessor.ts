import {
    Component,
    MarkdownRenderer,
    type MarkdownPostProcessorContext,
} from "obsidian";
import type LatestMathJaxPlugin from "../main";
import {
    escapeUnsafeDollarDelimiters,
    findMathInSection,
    textForSection,
} from "../utils/mathSource";
import { waitForSettledMath } from "./mathSettle";
import { planInlineBlocks, uniqueParagraphForBlock } from "./paragraphLocator";
import { sectionIsCurrent, targetIsCurrent } from "./sectionFreshness";
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
        // Invasive mode: Obsidian's own pipeline already renders every formula through the
        // patched native entry point — a second pass here would only re-render its output.
        if (plugin.invasiveActive) return;
        if (!plugin.settings.enableReadingView) return;
        const pdfExport = element.closest(".print") !== null;
        if (
            !pdfExport &&
            !plugin.compatibility.canRender(
                element.ownerDocument,
                plugin.settings.enablePopout,
            )
        ) return;

        const handleInline = plugin.settings.enableInlineReadingView;

        let blockNodes = collect(element, "block");
        let inlineNodes = handleInline ? collect(element, "inline") : [];
        if (blockNodes.length === 0 && inlineNodes.length === 0) return;

        if (!pdfExport) {
            // Obsidian commits its own math output asynchronously. Taking over an unsettled
            // wrapper lets its completion callback run over our node and replace the formula
            // with an error block, so wait — bounded — and only take over settled wrappers.
            const settled = new Set(
                await waitForSettledMath([...blockNodes, ...inlineNodes]),
            );
            blockNodes = blockNodes.filter((node) => settled.has(node));
            inlineNodes = inlineNodes.filter((node) => settled.has(node));
            if (blockNodes.length === 0 && inlineNodes.length === 0) {
                logger.debug("Reading View: math not settled, leaving Obsidian output in place");
                return;
            }
        }

        const sourceText = await sourceForElement(plugin, element, context, pdfExport);
        if (sourceText === null) {
            logger.debug("Reading View: no section info, leaving Obsidian output in place");
            return;
        }
        // The settle wait and the vault read can span seconds; Obsidian may have re-rendered the
        // section meanwhile, detaching everything this run captured. A stale run mounts output
        // nobody will ever see, so it stops here (PERF-03).
        if (!sectionIsCurrent(element)) {
            logger.debug("Reading View: section replaced mid-run; skipping stale render");
            return;
        }

        // Recover the TeX in document order, then split by kind so an inline formula can never
        // shift a block's index (and vice versa).
        const sources = findMathInSection(sourceText);
        const blockTex = sources.filter((s) => s.display);
        const inlineTex = sources.filter((s) => !s.display);

        // A section whose text needed dollar escaping is one Obsidian may have mis-paired: an
        // inline wrapper can span text our scanner never accepted, and replacing its contents
        // would destroy note text (e.g. "It costs $5 and $6" losing "$5 and $6"). Leave those
        // wrappers to the whole-paragraph repair below, which re-renders from sanitized source.
        // PDF export always goes through the per-block path below instead.
        const currencyRisk = escapeUnsafeDollarDelimiters(sourceText) !== sourceText;

        await Promise.all([
            rerender(plugin, blockNodes, blockTex, true, pdfExport),
            pdfExport || currencyRisk
                ? Promise.resolve()
                : rerender(plugin, inlineNodes, inlineTex, false, pdfExport),
        ]);

        if (pdfExport) {
            await rerenderInlineBlocksForPdf(plugin, element, sourceText, context.sourcePath);
        } else {
            await repairDollarParagraphs(
                plugin,
                element,
                sourceText,
                context.sourcePath,
                pdfExport,
            );
        }
    };
}

/**
 * Re-renders inline math block by block in the PDF export document.
 *
 * The print DOM hands us the whole note with no section metadata, and its wrapper count for a
 * currency paragraph can disagree with our scanner — a single disagreement used to fail every
 * inline formula at note level. Each block (planned by `planInlineBlocks`) is located by its
 * paragraph text, re-rendered alone in staging where pairing is 1:1, and swapped in; a block
 * that cannot be located or paired keeps Obsidian's output without touching the rest.
 */
async function rerenderInlineBlocksForPdf(
    plugin: LatestMathJaxPlugin,
    element: HTMLElement,
    sourceText: string,
    sourcePath: string,
): Promise<void> {
    for (const plan of planInlineBlocks(sourceText)) {
        // Each block's staging render is an await; the print document can be discarded mid-loop.
        if (!sectionIsCurrent(element)) {
            logger.debug("PDF export: document discarded mid-run; skipping remaining blocks");
            break;
        }
        const target = uniqueParagraphForBlock(element, plan.markdown);
        if (!target) {
            logger.debug(
                "PDF export: paragraph for an inline-math block not found; keeping built-in output",
            );
            continue;
        }

        const staging = element.ownerDocument.createElement("div");
        const component = new Component();
        component.load();
        try {
            await MarkdownRenderer.render(
                plugin.app,
                plan.renderMarkdown,
                staging,
                sourcePath,
                component,
            );
            const wrappers = Array.from(
                staging.querySelectorAll<HTMLElement>(".math.math-inline"),
            );
            if (wrappers.length !== plan.sources.length) {
                logger.debug(
                    `PDF export: block inline mismatch (${wrappers.length} wrappers, ` +
                        `${plan.sources.length} sources); keeping built-in output`,
                );
                continue;
            }
            await rerender(plugin, wrappers, plan.sources, false, true, { allowDetachedWrappers: true });
            const replacement = staging.querySelector("p");
            if (replacement && targetIsCurrent(element, target)) {
                target.replaceWith(replacement);
            } else if (!targetIsCurrent(element, target)) {
                logger.debug("PDF export: paragraph detached mid-render; keeping built-in output");
            }
        } catch (error) {
            logger.warn("PDF export: failed to re-render an inline block:", error);
        } finally {
            component.unload();
        }
    }
}

async function repairDollarParagraphs(
    plugin: LatestMathJaxPlugin,
    element: HTMLElement,
    source: string,
    sourcePath: string,
    pdfExport: boolean,
): Promise<void> {
    const sanitized = escapeUnsafeDollarDelimiters(source);
    if (sanitized === source) return;

    // Blank lines delimit the block wrappers used by Obsidian's PDF renderer. The sanitizer only
    // inserts backslashes, so source and sanitized arrays retain identical block boundaries.
    const sourceParts = source.split(/(\n[\t ]*\n)/u);
    const sanitizedParts = sanitized.split(/(\n[\t ]*\n)/u);
    for (let i = 0; i < sourceParts.length; i += 2) {
        // Staging renders await; Obsidian can re-render the section between blocks, detaching
        // everything this run captured. Stop instead of rendering into a dead tree (PERF-03).
        if (!sectionIsCurrent(element)) {
            logger.debug(
                `${pdfExport ? "PDF export" : "Reading View"}: section replaced mid-repair; ` +
                "skipping remaining blocks",
            );
            break;
        }
        const originalBlock = sourceParts[i];
        const sanitizedBlock = sanitizedParts[i];
        if (!originalBlock || originalBlock === sanitizedBlock) continue;

        const target = uniqueParagraphForBlock(element, originalBlock);
        if (!target) {
            logger.debug(
                `${pdfExport ? "PDF export" : "Reading View"}: ` +
                "could not safely identify currency paragraph; keeping output",
            );
            continue;
        }

        const staging = element.ownerDocument.createElement("div");
        const component = new Component();
        component.load();
        try {
            await MarkdownRenderer.render(
                plugin.app,
                sanitizedBlock,
                staging,
                sourcePath,
                component,
            );

            const sources = findMathInSection(originalBlock);
            await Promise.all([
                rerender(
                    plugin,
                    Array.from(staging.querySelectorAll<HTMLElement>(".math.math-block")),
                    sources.filter((entry) => entry.display),
                    true,
                    pdfExport,
                    { allowDetachedWrappers: true },
                ),
                rerender(
                    plugin,
                    Array.from(staging.querySelectorAll<HTMLElement>(".math.math-inline")),
                    sources.filter((entry) => !entry.display),
                    false,
                    pdfExport,
                    { allowDetachedWrappers: true },
                ),
            ]);

            const replacement = staging.querySelector("p");
            if (replacement && targetIsCurrent(element, target)) {
                target.replaceWith(replacement);
            } else if (!targetIsCurrent(element, target)) {
                logger.debug(
                    `${pdfExport ? "PDF export" : "Reading View"}: paragraph detached ` +
                    "mid-repair; keeping built-in output",
                );
            }
        } catch (error) {
            logger.warn(
                `${pdfExport ? "PDF export" : "Reading View"}: failed to repair currency paragraph:`,
                error,
            );
        } finally {
            component.unload();
        }
    }
}

async function sourceForElement(
    plugin: LatestMathJaxPlugin,
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
    pdfExport: boolean,
): Promise<string | null> {
    const section = context.getSectionInfo(element);
    if (section) {
        return textForSection(section.text, section.lineStart, section.lineEnd);
    }

    // Obsidian's PDF exporter deliberately supplies a post-processor context whose
    // getSectionInfo() always returns null. The export root still has a public sourcePath, so read
    // that note and process it as one section. Other null-section surfaces remain unsupported.
    if (!pdfExport || !context.sourcePath) return null;
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!file) return null;
    try {
        return await plugin.app.vault.cachedRead(file);
    } catch (error) {
        logger.warn("PDF export: failed to read source note, keeping built-in output:", error);
        return null;
    }
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
    pdfExport = false,
    opts: { allowDetachedWrappers?: boolean } = {},
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
        // Staging wrappers are detached by design; live wrappers that lost their place since
        // collect would only receive output nobody displays.
        if (!opts.allowDetachedWrappers && !wrapper.isConnected) {
            logger.debug(
                `Reading View: ${display ? "block" : "inline"} #${i} detached since collect; skipping`,
            );
            continue;
        }
        try {
            const node = plugin.renderInto(tex, display, wrapper.ownerDocument, pdfExport);
            plugin.readingViewSnapshots.replace(wrapper, node);
            wrapper.setAttribute(HANDLED_ATTR, "true");
            logger.debug(`Reading View: re-rendered ${display ? "block" : "inline"} #${i}`);
        } catch (err) {
            // The bundled CHTML stylesheet and Obsidian's MathJax 3 error stylesheet conflict in
            // the temporary print document. Preserve a legible source fallback in PDF instead of
            // exporting overlapping red glyphs.
            const fallbackMode = pdfExport && plugin.settings.fallbackMode === "obsidian"
                ? "raw"
                : plugin.settings.fallbackMode;
            if (fallbackMode !== "obsidian") {
                plugin.readingViewSnapshots.replace(
                    wrapper,
                    createFallbackElement(
                        wrapper.ownerDocument,
                        fallbackMode,
                        tex,
                        display,
                        err,
                    ),
                );
                wrapper.setAttribute(HANDLED_ATTR, "true");
            }
            logger.warn(
                `Reading View: render failed for ${display ? "block" : "inline"} #${i}, keeping built-in output:`,
                err,
            );
        }
    }
}
