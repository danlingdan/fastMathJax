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
        const pdfExport = element.closest(".print") !== null;
        if (
            !pdfExport &&
            !plugin.compatibility.canRender(
                element.ownerDocument,
                plugin.settings.enablePopout,
            )
        ) return;

        const handleInline = plugin.settings.enableInlineReadingView;

        const blockNodes = collect(element, "block");
        const inlineNodes = handleInline ? collect(element, "inline") : [];
        if (blockNodes.length === 0 && inlineNodes.length === 0) return;

        const sourceText = await sourceForElement(plugin, element, context, pdfExport);
        if (sourceText === null) {
            logger.debug("Reading View: no section info, leaving Obsidian output in place");
            return;
        }

        // Recover the TeX in document order, then split by kind so an inline formula can never
        // shift a block's index (and vice versa).
        const sources = findMathInSection(sourceText);
        const blockTex = sources.filter((s) => s.display);
        const inlineTex = sources.filter((s) => !s.display);

        await Promise.all([
            rerender(plugin, blockNodes, blockTex, true, pdfExport),
            rerender(plugin, inlineNodes, inlineTex, false, pdfExport),
        ]);

        if (pdfExport) {
            await repairPdfDollarParagraphs(
                plugin,
                element,
                sourceText,
                context.sourcePath,
            );
        }
    };
}

async function repairPdfDollarParagraphs(
    plugin: LatestMathJaxPlugin,
    element: HTMLElement,
    source: string,
    sourcePath: string,
): Promise<void> {
    const sanitized = escapeUnsafeDollarDelimiters(source);
    if (sanitized === source) return;

    // Blank lines delimit the block wrappers used by Obsidian's PDF renderer. The sanitizer only
    // inserts backslashes, so source and sanitized arrays retain identical block boundaries.
    const sourceParts = source.split(/(\n[\t ]*\n)/u);
    const sanitizedParts = sanitized.split(/(\n[\t ]*\n)/u);
    for (let i = 0; i < sourceParts.length; i += 2) {
        const originalBlock = sourceParts[i];
        const sanitizedBlock = sanitizedParts[i];
        if (!originalBlock || originalBlock === sanitizedBlock) continue;

        const target = uniqueParagraphForBlock(element, originalBlock);
        if (!target) {
            logger.debug("PDF export: could not safely identify currency paragraph; keeping output");
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
                    true,
                ),
                rerender(
                    plugin,
                    Array.from(staging.querySelectorAll<HTMLElement>(".math.math-inline")),
                    sources.filter((entry) => !entry.display),
                    false,
                    true,
                ),
            ]);

            const replacement = staging.querySelector("p");
            if (replacement) target.replaceWith(replacement);
        } catch (error) {
            logger.warn("PDF export: failed to repair currency paragraph:", error);
        } finally {
            component.unload();
        }
    }
}

function uniqueParagraphForBlock(element: HTMLElement, markdown: string): HTMLElement | null {
    const firstDollar = markdown.indexOf("$");
    const lastDollar = markdown.lastIndexOf("$");
    if (firstDollar < 0 || lastDollar < firstDollar) return null;

    const normalize = (value: string): string => value.replace(/\s+/gu, " ").trim();
    const prefix = normalize(markdown.slice(0, firstDollar));
    const suffix = normalize(markdown.slice(lastDollar + 1));
    if (prefix.length < 4 && suffix.length < 4) return null;

    const candidates = Array.from(element.querySelectorAll<HTMLElement>("p")).filter((paragraph) => {
        const text = normalize(paragraph.textContent ?? "");
        return (!prefix || text.startsWith(prefix)) && (!suffix || text.endsWith(suffix));
    });
    return candidates.length === 1 ? candidates[0] : null;
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
