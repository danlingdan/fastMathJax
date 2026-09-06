/**
 * Decides whether Live Preview mutation records contain math the plugin still needs to render.
 *
 * This is the guard that keeps the editor observer from feeding back on itself (PERF-04): our own
 * render pass replaces a wrapper's children and tags it, and those mutations land in the very
 * observer that schedules render passes. A wrapper counts as handled when it carries the pass
 * marker or still contains output tagged with the bundled engine version — Obsidian may recreate
 * the wrapper and drop its attributes while preserving our rendered child.
 */

function isElement(node: Node): node is Element {
    return node.nodeType === 1;
}

function wrapperOf(node: Element): Element | null {
    return node.matches(".math") ? node : node.closest(".math");
}

export function mutationNeedsRender(
    records: MutationRecord[],
    isHandled: (wrapper: Element) => boolean,
): boolean {
    for (const record of records) {
        if (isElement(record.target)) {
            const wrapper = wrapperOf(record.target);
            if (wrapper && !isHandled(wrapper)) return true;
        }
        for (const added of Array.from(record.addedNodes)) {
            if (!isElement(added)) continue;
            const direct = wrapperOf(added);
            if (direct && !isHandled(direct)) return true;
            for (const wrapper of Array.from(added.querySelectorAll(".math"))) {
                if (!isHandled(wrapper)) return true;
            }
        }
    }
    return false;
}
