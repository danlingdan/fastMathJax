/**
 * Conservative Markdown math recovery for Reading View.
 *
 * Obsidian's rendered math wrappers do not retain their TeX source, so the post processor pairs
 * them with expressions recovered from the raw section. False positives are more dangerous than
 * false negatives here: one false match shifts every later DOM/source pair. The scanner therefore
 * ignores fenced and inline code and follows the usual dollar-delimiter whitespace rules.
 */

export interface RecoveredMath {
    tex: string;
    display: boolean;
}

export interface RecoveredMathRange extends RecoveredMath {
    from: number;
    to: number;
}

function isEscaped(text: string, index: number): boolean {
    let slashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
    return slashes % 2 === 1;
}

function repeatLength(text: string, start: number, char: string): number {
    let end = start;
    while (text[end] === char) end++;
    return end - start;
}

/** Marks Markdown code regions while preserving all original offsets. */
function ignoredCodeRanges(text: string): Uint8Array {
    const ignored = new Uint8Array(text.length);
    let fence: { char: "`" | "~"; length: number } | null = null;
    let lineStart = 0;

    while (lineStart < text.length) {
        const newline = text.indexOf("\n", lineStart);
        const lineEnd = newline === -1 ? text.length : newline + 1;
        const line = text.slice(lineStart, lineEnd);
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];

        if (fence) {
            ignored.fill(1, lineStart, lineEnd);
            if (
                marker &&
                marker[0] === fence.char &&
                marker.length >= fence.length
            ) fence = null;
        } else if (marker) {
            fence = { char: marker[0] as "`" | "~", length: marker.length };
            ignored.fill(1, lineStart, lineEnd);
        }
        lineStart = lineEnd;
    }

    // Inline code spans use equal-length backtick runs. Unclosed runs are plain text.
    for (let i = 0; i < text.length; i++) {
        if (ignored[i] || text[i] !== "`") continue;
        const length = repeatLength(text, i, "`");
        const delimiter = "`".repeat(length);
        const close = text.indexOf(delimiter, i + length);
        if (close !== -1 && !ignored[close]) {
            ignored.fill(1, i, close + length);
            i = close + length - 1;
        } else {
            i += length - 1;
        }
    }
    return ignored;
}

function findDelimiter(
    text: string,
    ignored: Uint8Array,
    delimiter: "$" | "$$",
    start: number,
): number {
    for (let i = start; i <= text.length - delimiter.length; i++) {
        if (ignored[i] || isEscaped(text, i)) continue;
        if (text.startsWith(delimiter, i)) return i;
    }
    return -1;
}

function validInlineOpening(text: string, index: number): boolean {
    const next = text[index + 1];
    return next !== undefined && next !== "$" && !/\s/u.test(next);
}

function validInlineClosing(text: string, index: number): boolean {
    const previous = text[index - 1];
    const next = text[index + 1];
    return previous !== undefined && !/\s/u.test(previous) && !(next && /\d/u.test(next));
}

export function findMathRanges(text: string): RecoveredMathRange[] {
    const ignored = ignoredCodeRanges(text);
    const recovered: RecoveredMathRange[] = [];

    for (let i = 0; i < text.length;) {
        if (ignored[i] || text[i] !== "$" || isEscaped(text, i)) {
            i++;
            continue;
        }

        if (text[i + 1] === "$" && !ignored[i + 1]) {
            const close = findDelimiter(text, ignored, "$$", i + 2);
            if (close !== -1) {
                const tex = text.slice(i + 2, close).trim();
                if (tex) recovered.push({ tex, display: true, from: i, to: close + 2 });
                i = close + 2;
                continue;
            }
            i += 2;
            continue;
        }

        if (!validInlineOpening(text, i)) {
            i++;
            continue;
        }

        // The next dollar is the only possible closing delimiter. If it is invalid, treat this
        // opener as literal text; searching farther would swallow currency and later real math.
        const close = findDelimiter(text, ignored, "$", i + 1);
        if (close !== -1 && validInlineClosing(text, close)) {
            const tex = text.slice(i + 1, close).trim();
            if (tex && !tex.includes("\n")) {
                recovered.push({ tex, display: false, from: i, to: close + 1 });
            }
            i = close + 1;
            continue;
        }
        i++;
    }

    return recovered;
}

export function findMathInSection(text: string): RecoveredMath[] {
    return findMathRanges(text).map(({ tex, display }) => ({ tex, display }));
}

/**
 * Escapes dollar signs that the conservative scanner did not accept as math delimiters.
 *
 * Obsidian's PDF parser can interpret currency-like text such as `$5 and $6, while $x$` as one
 * formula even though Reading View leaves the currency alone. Escaping only rejected delimiters
 * makes the two parsers agree without changing real math, code spans, fences, or existing escapes.
 */
export function escapeUnsafeDollarDelimiters(text: string): string {
    const ignored = ignoredCodeRanges(text);
    const accepted = new Uint8Array(text.length);
    for (const range of findMathRanges(text)) accepted.fill(1, range.from, range.to);

    let sanitized = "";
    for (let i = 0; i < text.length; i++) {
        if (
            text[i] === "$" &&
            !ignored[i] &&
            !accepted[i] &&
            !isEscaped(text, i)
        ) sanitized += "\\";
        sanitized += text[i];
    }
    return sanitized;
}

/** Extracts the line range identified by Obsidian's section metadata. */
export function textForSection(text: string, lineStart: number, lineEnd: number): string {
    if (!Number.isInteger(lineStart) || !Number.isInteger(lineEnd) || lineStart < 0 || lineEnd < lineStart) {
        return text;
    }
    return text.split("\n").slice(lineStart, lineEnd + 1).join("\n");
}

export function extractDisplayMath(text: string): string[] {
    return findMathInSection(text)
        .filter((entry) => entry.display)
        .map((entry) => entry.tex);
}
