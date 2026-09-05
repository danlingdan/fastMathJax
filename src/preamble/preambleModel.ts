import type { PreambleSegment } from "../engine/MathJaxConfig";

/**
 * A problem with the preamble configuration or the preamble TeX itself.
 *
 * `source` names where the failing text came from ("settings preamble" or
 * `preamble file "<path>"`), so a parse error in a vault file is actionable even though the
 * engine only ever sees the merged text.
 */
export interface PreambleProblem {
    source: string;
    message: string;
}

export const INLINE_PREAMBLE_SOURCE = "settings preamble";

/** Human-readable label for the file-backed segment of the merged preamble. */
export function preambleFileSource(path: string): string {
    return `preamble file "${path}"`;
}

/**
 * Normalizes a user-typed preamble file path to a vault-relative POSIX path.
 *
 * Returns `null` for anything that cannot name a file inside the vault: absolute paths
 * (leading `/` or a drive letter), which would silently escape the vault on one platform
 * or another. An empty result means "no preamble file configured" and is not an error.
 */
export function normalizePreamblePath(input: string): string | null {
    const trimmed = input.trim().replace(/\\/g, "/");
    if (!trimmed) return "";
    if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed)) return null;
    // Collapse separators and redundant path pieces the vault would not resolve anyway.
    const collapsed = trimmed
        .split("/")
        .filter((part) => part.length > 0 && part !== ".")
        .join("/");
    return collapsed;
}

/**
 * Builds the merged preamble text: file content first, then the inline settings preamble.
 *
 * The file segment is the shared, versioned base; the inline segment is evaluated second so a
 * user can override a file macro with `\renewcommand`. Deterministic and side-effect free —
 * the same inputs always produce the same text, which is what makes engine cache keys and
 * rebuild detection stable.
 */
export function mergePreambles(filePreamble: string, inlinePreamble: string): string {
    return [filePreamble.trim(), inlinePreamble.trim()].filter(Boolean).join("\n");
}

/**
 * Splits the merged preamble into labeled segments so the engine can evaluate each part and
 * attribute failures. When no file is configured there are no segments and the engine evaluates
 * the inline text exactly as it did before 0.2.0.
 */
export function buildPreambleSegments(
    filePreamble: string,
    inlinePreamble: string,
    filePath: string,
): PreambleSegment[] {
    const segments: PreambleSegment[] = [];
    const file = filePreamble.trim();
    if (file) segments.push({ source: preambleFileSource(filePath), text: file });
    const inline = inlinePreamble.trim();
    if (inline) segments.push({ source: INLINE_PREAMBLE_SOURCE, text: inline });
    return segments;
}
