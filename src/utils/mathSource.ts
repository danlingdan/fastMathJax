/**
 * Recovers original TeX from raw markdown.
 *
 * Obsidian renders math *before* post processors run and keeps no copy of the source LaTeX in the
 * DOM (see docs/obsidian-mathjax-research.md §3). The reliable recovery path is to re-parse the
 * section's raw markdown, which `MarkdownPostProcessorContext.getSectionInfo` hands us.
 *
 * This module is deliberately Obsidian-agnostic: pure text → TeX. It is reused by the Reading View
 * adapter (Stage 3) and will be reused by Live Preview (Stage 4).
 */

/** Drops fenced code blocks so a `$$` *inside* code is never mistaken for display math. */
function stripFencedCode(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, "")
        .replace(/~~~\s*(?:\w+)?[\s\S]*?~~~/g, "");
}

/**
 * Finds every `$$ ... $$` block in a markdown section, in document order.
 * Returns the trimmed inner TeX with the delimiters stripped.
 */
export function extractDisplayMath(text: string): string[] {
    const clean = stripFencedCode(text);
    const out: string[] = [];
    const re = /\$\$([\s\S]+?)\$\$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean)) !== null) {
        out.push(m[1].trim());
    }
    return out;
}

export interface RecoveredMath {
    /** Inner TeX with delimiters stripped. */
    tex: string;
    /** `true` for `$$…$$` display math, `false` for `$…$` inline math. */
    display: boolean;
}

/**
 * Recovers every math expression in a section, block and inline mixed, in strict document order.
 *
 * Used to pair each `.math-*` DOM node (which Obsidian renders without a copy of its source) back to
 * the TeX that produced it. The scan is deliberately conservative:
 *   - fenced code blocks are removed first (code containing `$$` must not match);
 *   - an escaped `\$` is skipped, so currency like `$5 and $6` never triggers;
 *   - `$$…$$` is matched greedily-paired and takes priority over inline at the same position;
 *   - a lone `$` with no closing partner is ignored (avoids stray-currency false positives).
 */
export function findMathInSection(text: string): RecoveredMath[] {
    const src = stripFencedCode(text);
    const out: RecoveredMath[] = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
        const ch = src[i];

        // Escaped dollar: skip the backslash and the dollar.
        if (ch === "\\" && src[i + 1] === "$") {
            i += 2;
            continue;
        }

        if (ch === "$") {
            // Display math: $$ ... $$
            if (src[i + 1] === "$") {
                const close = src.indexOf("$$", i + 2);
                if (close === -1) break; // unterminated display; stop scanning
                const tex = src.slice(i + 2, close).trim();
                if (tex.length > 0) out.push({ tex, display: true });
                i = close + 2;
                continue;
            }

            // Inline math: $ ... $ (next non-escaped dollar)
            let j = i + 1;
            let closed = -1;
            while (j < n) {
                if (src[j] === "\\" && src[j + 1] === "$") {
                    j += 2;
                    continue;
                }
                if (src[j] === "$") {
                    closed = j;
                    break;
                }
                j++;
            }
            if (closed === -1) break; // unterminated inline; stop scanning
            const tex = src.slice(i + 1, closed).trim();
            // Require non-empty content; a stray pairing of two adjacent dollars means no math.
            if (tex.length > 0) out.push({ tex, display: false });
            i = closed + 1;
            continue;
        }

        i++;
    }

    return out;
}
