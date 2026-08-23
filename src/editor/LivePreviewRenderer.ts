import { type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type LatestMathJaxPlugin from "../main";
import { createFallbackElement } from "../render/fallback";
import { findMathRanges, type RecoveredMathRange } from "../utils/mathSource";
import { logger } from "../utils/logger";
import { canRestoreBuiltIn } from "./lifecycle";

const HANDLED_ATTR = "data-latest-mathjax-live-preview";
const SOURCE_ATTR = "data-latest-mathjax-source";
const DISPLAY_ATTR = "data-latest-mathjax-display";

function isElement(node: Node): node is Element {
    return node.nodeType === 1;
}

/**
 * Live Preview adapter that cooperates with Obsidian's editor widgets.
 *
 * Obsidian remains responsible for locating formulas, virtual scrolling, and showing source while
 * the cursor edits a formula. Once one of its `.math` widgets is mounted, this adapter resolves the
 * widget's document position to TeX from our conservative Markdown scanner and replaces only the
 * widget contents. This avoids depending on private syntax-token names or competing decoration
 * precedence while still never reverse-engineering TeX from rendered HTML.
 */
export class LivePreviewRenderer {
    constructor(private readonly plugin: LatestMathJaxPlugin) {}

    getExtension(): Extension {
        const plugin = this.plugin;

        return ViewPlugin.fromClass(
            class {
                private timer: number | null = null;
                private animationFrame: number | null = null;
                private lastRevision = -1;
                private readonly observer: MutationObserver;
                private readonly schedulingWindow: Window;

                constructor(private readonly view: EditorView) {
                    this.schedulingWindow = view.dom.ownerDocument.defaultView ?? window;
                    const Observer = view.dom.ownerDocument.defaultView?.MutationObserver
                        ?? MutationObserver;
                    this.observer = new Observer((records) => {
                        if (this.hasNewObsidianMath(records)) this.schedule(0);
                    });
                    this.observer.observe(view.dom, { childList: true, subtree: true });
                    this.schedule(0);
                }

                /** Ignores mutations caused by our own replacement nodes. */
                private hasNewObsidianMath(records: MutationRecord[]): boolean {
                    const needsHandling = (wrapper: Element): boolean =>
                        !wrapper.hasAttribute(HANDLED_ATTR) &&
                        !wrapper.querySelector(
                            `[data-latest-mathjax-engine="${plugin.engine.version}"]`,
                        );

                    for (const record of records) {
                        if (isElement(record.target)) {
                            const wrapper = record.target.matches(".math")
                                ? record.target
                                : record.target.closest(".math");
                            if (wrapper && needsHandling(wrapper)) return true;
                        }
                        for (const added of Array.from(record.addedNodes)) {
                            if (!isElement(added)) continue;
                            if (added.matches(".math") && needsHandling(added)) return true;
                            for (const wrapper of Array.from(added.querySelectorAll(".math"))) {
                                if (needsHandling(wrapper)) return true;
                            }
                        }
                    }
                    return false;
                }

                update(update: ViewUpdate): void {
                    if (
                        update.docChanged ||
                        update.selectionSet ||
                        update.viewportChanged ||
                        this.lastRevision !== plugin.engine.revision
                    ) this.schedule(update.docChanged ? plugin.settings.renderDebounce : 0);
                }

                private schedule(delay: number): void {
                    if (this.timer !== null) this.schedulingWindow.clearTimeout(this.timer);
                    if (this.animationFrame !== null) {
                        this.schedulingWindow.cancelAnimationFrame(this.animationFrame);
                    }
                    this.timer = this.schedulingWindow.setTimeout(() => {
                        this.timer = null;
                        // Obsidian mounts its math widgets during the view update. Run after the next
                        // layout frame so the wrappers exist before we query them.
                        this.animationFrame = this.schedulingWindow.requestAnimationFrame(() => {
                            this.animationFrame = null;
                            this.renderMountedMath();
                        });
                    }, Math.max(0, delay));
                }

                private renderMountedMath(): void {
                    const targetDocument = this.view.dom.ownerDocument;
                    if (
                        !plugin.settings.enableLivePreview ||
                        !plugin.compatibility.canRender(targetDocument, plugin.settings.enablePopout)
                    ) return;

                    const ranges = findMathRanges(this.view.state.doc.toString());
                    const revision = plugin.engine.revision;
                    this.lastRevision = revision;

                    for (const wrapper of Array.from(
                        this.view.dom.querySelectorAll<HTMLElement>(".math"),
                    )) {
                        if (
                            wrapper.getAttribute(HANDLED_ATTR) === String(revision) ||
                            wrapper.querySelector(
                                `[data-latest-mathjax-engine="${plugin.engine.version}"]`,
                            )
                        ) continue;
                        const source = this.sourceForWrapper(wrapper, ranges);
                        if (!source || (!source.display && !plugin.settings.enableInlineLivePreview)) {
                            continue;
                        }

                        try {
                            const rendered = plugin.engine.renderInto(
                                source.tex,
                                { display: source.display },
                                targetDocument,
                            );
                            // Keep our own source on the child: Obsidian can recreate the wrapper
                            // and drop wrapper attributes while preserving its rendered contents.
                            rendered.setAttribute(SOURCE_ATTR, source.tex);
                            rendered.setAttribute(DISPLAY_ATTR, String(source.display));
                            wrapper.replaceChildren(rendered);
                            wrapper.setAttribute(HANDLED_ATTR, String(revision));
                        } catch (error) {
                            if (plugin.settings.fallbackMode !== "obsidian") {
                                wrapper.replaceChildren(
                                    createFallbackElement(
                                        targetDocument,
                                        plugin.settings.fallbackMode,
                                        source.tex,
                                        source.display,
                                        error,
                                    ),
                                );
                                wrapper.setAttribute(HANDLED_ATTR, String(revision));
                            }
                            logger.warn("Live Preview: bundled render failed, keeping fallback:", error);
                        }
                    }
                }

                private sourceForWrapper(
                    wrapper: HTMLElement,
                    ranges: RecoveredMathRange[],
                ): RecoveredMathRange | undefined {
                    let position: number;
                    try {
                        position = this.view.posAtDOM(wrapper);
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

                destroy(): void {
                    this.observer.disconnect();
                    if (this.timer !== null) this.schedulingWindow.clearTimeout(this.timer);
                    if (this.animationFrame !== null) {
                        this.schedulingWindow.cancelAnimationFrame(this.animationFrame);
                    }

                    const ranges = findMathRanges(this.view.state.doc.toString());
                    const wrappers = new Set<HTMLElement>(Array.from(
                        this.view.dom.querySelectorAll<HTMLElement>(`[${HANDLED_ATTR}]`),
                    ));
                    for (const rendered of Array.from(
                        this.view.dom.querySelectorAll<HTMLElement>("[data-latest-mathjax-engine]"),
                    )) {
                        const wrapper = rendered.closest<HTMLElement>(".math");
                        if (wrapper) wrappers.add(wrapper);
                    }
                    for (const wrapper of wrappers) {
                        const rendered = wrapper.querySelector<HTMLElement>(
                            "[data-latest-mathjax-engine]",
                        );
                        const mapped = this.sourceForWrapper(wrapper, ranges);
                        const source = mapped ?? (rendered ? {
                            // Our MathJax output retains the root TeX in data-latex even if
                            // Obsidian recreates the wrapper and strips our auxiliary attributes.
                            tex: rendered.getAttribute(SOURCE_ATTR)
                                ?? rendered.querySelector("mjx-math")?.getAttribute("data-latex")
                                ?? "",
                            display: rendered.hasAttribute(DISPLAY_ATTR)
                                ? rendered.getAttribute(DISPLAY_ATTR) === "true"
                                : wrapper.classList.contains("math-block"),
                            from: 0,
                            to: 0,
                        } : undefined);
                        const renderedAtDestroy = rendered;
                        wrapper.removeAttribute(HANDLED_ATTR);
                        if (!source?.tex) continue;
                        void plugin.renderWithBuiltIn(source.tex, source.display).then((rendered) => {
                            if (canRestoreBuiltIn(wrapper, renderedAtDestroy)) {
                                wrapper.replaceChildren(rendered);
                            }
                        }).catch((error) => {
                            logger.warn("Live Preview: failed to restore Obsidian output:", error);
                        });
                    }
                }
            },
        );
    }
}
