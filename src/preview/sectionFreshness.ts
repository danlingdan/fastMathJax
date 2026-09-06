/**
 * Freshness guards for the Reading View post-processor's asynchronous stages (PERF-03).
 *
 * The processor awaits between stages — Obsidian's math settle wait, the vault read for PDF
 * export, and each per-paragraph staging re-render. While it waits, Obsidian can re-render the
 * section or the print document can be discarded, detaching the element the run captured.
 * Mounting into a detached tree is invisible at best; at minimum it burns the full render
 * pipeline for output nobody will ever see. The guards turn stale stages into skipped no-ops so
 * rapid edits converge to the newest document state.
 */

/** True while the section (or print root) element this run captured is still mounted. */
export function sectionIsCurrent(element: HTMLElement): boolean {
    return element.isConnected;
}

/**
 * True when a paragraph or wrapper located before an await is still mounted inside a live
 * section. A target that lost its place must keep whatever Obsidian mounted there since;
 * replacing it would be a silent no-op at best.
 */
export function targetIsCurrent(element: HTMLElement, target: HTMLElement): boolean {
    return element.isConnected && target.isConnected;
}
