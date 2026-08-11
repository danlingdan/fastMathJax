/**
 * FNV-1a 32-bit, expressed as an 8-char hex string.
 *
 * Chosen over a cryptographic hash because cache keys are computed on every keystroke in Live
 * Preview: this needs to be cheap and synchronous. Collisions only cost a wrong cache hit within a
 * single session, and the key includes the full config hash, so the risk is acceptable.
 */
export function fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        // hash * 16777619 with 32-bit overflow, via shifts to stay in int range
        hash +=
            (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        hash >>>= 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** Cache key for one rendered formula. */
export function renderCacheKey(
    tex: string,
    display: boolean,
    configHash: string,
): string {
    return `${configHash}:${display ? "b" : "i"}:${fnv1a(tex)}:${tex.length}`;
}
