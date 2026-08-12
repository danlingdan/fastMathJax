import { syntaxTree } from "@codemirror/language";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
    WidgetType,
} from "@codemirror/view";
import { Prec, type EditorState, type Extension, type Range } from "@codemirror/state";
import type { MathJaxEngine } from "../engine/MathJaxEngine";
import type LatestMathJaxPlugin from "../main";
import { logger } from "../utils/logger";

/**
 * Live Preview (CodeMirror 6) adapter.
 *
 * Obsidian renders math in Live Preview through its own `Decoration.replace` + `WidgetType`. We take
 * over the same ranges with a higher-precedence decoration (`Prec.highest`) so our widget wins and
 * Obsidian's math widget for that range is displaced. The original TeX is read straight from the
 * editor state's syntax tree + `sliceDoc`, never reverse-engineered from a rendered DOM node.
 *
 * Cursor interaction follows the plan's requirement: when the selection overlaps a math range we
 * skip the decoration entirely, so Obsidian falls back to showing the raw `$$…$$` / `$…$` source
 * (standard Live Preview "show source while editing" behaviour).
 *
 * @risk This relies on `Prec.highest` outranking Obsidian's built-in math decoration, and on the
 * math token names following the underscore-joined token convention documented in
 * docs/obsidian-mathjax-research.md §4. Both need in-app confirmation (open question in that doc).
 */

const HANDLED_TOKEN = "math";

function isMathToken(nodeName: string): boolean {
    return nodeName.split("_").includes(HANDLED_TOKEN);
}

function isBlockToken(nodeName: string): boolean {
    return nodeName.split("_").includes("math-block");
}

/** A widget that renders a single math expression with our bundled MathJax 4 engine. */
class MathWidget extends WidgetType {
    constructor(
        private readonly tex: string,
        private readonly display: boolean,
        private readonly engine: MathJaxEngine,
        private readonly showSourceOnError: boolean,
    ) {
        super();
    }

    eq(other: MathWidget): boolean {
        return (
            other.tex === this.tex &&
            other.display === this.display &&
            other.showSourceOnError === this.showSourceOnError
        );
    }

    toDOM(): HTMLElement {
        try {
            return this.engine.render(this.tex, { display: this.display });
        } catch (err) {
            logger.warn("Live Preview: render failed, falling back to source:", err);
            // Graceful fallback: show the raw source so the note never breaks.
            const span = document.createElement(this.display ? "div" : "span");
            span.className = "mathjax-live-preview-error";
            span.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
            return span;
        }
    }

    ignoreEvent(): boolean {
        // Allow text selection inside the rendered math but no editing.
        return false;
    }
}

function buildDecorations(
    state: EditorState,
    engine: MathJaxEngine,
    enabled: boolean,
    handleInline: boolean,
    showSourceOnError: boolean,
): DecorationSet {
    if (!enabled) return Decoration.none;
    const widgets: Range<Decoration>[] = [];
    const selection = state.selection;

    // Whether a range overlaps the current selection — if so we must NOT replace it, so the user
    // sees the raw source while the cursor is inside the formula.
    const overlapsSelection = (from: number, to: number): boolean => {
        for (const range of selection.ranges) {
            if (range.from <= to && range.to >= from) return true;
        }
        return false;
    };

    syntaxTree(state).iterate({
        enter: (node) => {
            const name = node.name;
            if (!isMathToken(name)) return;
            if (!isBlockToken(name) && !handleInline) return; // inline disabled

            const from = node.from;
            const to = node.to;
            if (from === to) return;

            // Skip ranges the cursor is currently inside.
            if (overlapsSelection(from, to)) return;

            const display = isBlockToken(name);
            const raw = state.sliceDoc(from, to);
            const tex = stripDelimiters(raw, display);
            if (tex.length === 0) return;

            const widget = new MathWidget(tex, display, engine, showSourceOnError);
            widgets.push(Decoration.replace({ widget }).range(from, to));
        },
    });

    return Decoration.set(widgets, true);
}

/** Removes the outermost `$…$` or `$$…$$` delimiters and trims whitespace. */
function stripDelimiters(raw: string, display: boolean): string {
    let s = raw.trim();
    if (display) {
        if (s.startsWith("$$")) s = s.slice(2);
        if (s.endsWith("$$")) s = s.slice(0, -2);
    } else {
        if (s.startsWith("$")) s = s.slice(1);
        if (s.endsWith("$")) s = s.slice(0, -1);
    }
    return s.trim();
}

export class LivePreviewRenderer {
    constructor(private plugin: LatestMathJaxPlugin) {}

    getExtension(): Extension {
        const plugin = this.plugin;
        return Prec.highest(
            ViewPlugin.fromClass(
                class {
                    decorations: DecorationSet;

                    constructor(view: EditorView) {
                        this.decorations = buildDecorations(
                            view.state,
                            plugin.engine,
                            plugin.settings.enableLivePreview,
                            plugin.settings.enableInlineLivePreview,
                            true,
                        );
                    }

                    update(update: ViewUpdate): void {
                        if (
                            update.docChanged ||
                            update.selectionSet ||
                            update.viewportChanged
                        ) {
                            this.decorations = buildDecorations(
                                update.state,
                                plugin.engine,
                                plugin.settings.enableLivePreview,
                                plugin.settings.enableInlineLivePreview,
                                true,
                            );
                        }
                    }
                },
                {
                    decorations: (v) => v.decorations,
                },
            ),
        );
    }
}
