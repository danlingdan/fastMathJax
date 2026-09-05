import { logger } from "../utils/logger";

/**
 * Obsidian commits its own MathJax output asynchronously: a `.math` wrapper first appears with a
 * placeholder, and only later receives its rendered contents plus the `is-loaded` class.
 *
 * Replacing a wrapper's contents *before* that finalization makes Obsidian's completion callback
 * run over our node afterwards — it re-typesets our serialized markup as TeX and replaces the
 * formula with an error block (observed on cold starts, where font downloads delay finalization
 * past our takeover). Waiting for `is-loaded` takes over only settled wrappers; wrappers that
 * never settle within the timeout are skipped so Obsidian's output simply stays in place.
 */
const MATH_LOADED_CLASS = "is-loaded";
const MATH_LOAD_TIMEOUT_MS = 5_000;

/**
 * Resolves once every given wrapper has settled, and returns the subset that actually settled.
 * Detached wrappers never settle and are dropped, so a re-render swap during the wait cannot
 * leave us mounting into stale nodes.
 */
export async function waitForSettledMath(nodes: HTMLElement[]): Promise<HTMLElement[]> {
    if (nodes.length === 0) return nodes;
    const pending = nodes.filter((node) => !node.classList.contains(MATH_LOADED_CLASS));
    if (pending.length === 0) return nodes;

    await new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
            if (pending.every((node) => node.classList.contains(MATH_LOADED_CLASS))) {
                observer.disconnect();
                resolve();
            }
        });
        for (const node of pending) {
            observer.observe(node, { attributes: true, attributeFilter: ["class"] });
        }
        setTimeout(() => {
            observer.disconnect();
            resolve();
        }, MATH_LOAD_TIMEOUT_MS);
    });

    const settled = nodes.filter(
        (node) => node.isConnected && node.classList.contains(MATH_LOADED_CLASS),
    );
    if (settled.length !== nodes.length) {
        logger.debug(
            `math settle: ${nodes.length - settled.length} of ${nodes.length} wrappers ` +
                "did not finalize in time; leaving Obsidian's output in place",
        );
    }
    return settled;
}
