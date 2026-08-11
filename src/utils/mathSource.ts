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
