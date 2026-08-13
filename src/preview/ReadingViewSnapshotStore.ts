/**
 * Keeps the Obsidian-rendered children that Reading View replaces.
 *
 * MathJax CommonHTML depends on a stylesheet owned by the plugin. Restoring these nodes before the
 * engine is disposed makes disabling or reloading the plugin synchronous and reversible, instead
 * of leaving already-mounted formulas blank until Obsidian happens to rebuild the preview.
 */
export class ReadingViewSnapshotStore {
    private readonly originals = new Map<HTMLElement, Node[]>();

    replace(wrapper: HTMLElement, replacement: Node): void {
        this.pruneDisconnected();
        if (!this.originals.has(wrapper)) {
            this.originals.set(wrapper, Array.from(wrapper.childNodes));
        }
        wrapper.replaceChildren(replacement);
    }

    restoreAll(): void {
        for (const [wrapper, children] of this.originals) {
            if (wrapper.isConnected) {
                wrapper.replaceChildren(...children);
                wrapper.removeAttribute("data-latest-mathjax");
            }
        }
        this.originals.clear();
    }

    private pruneDisconnected(): void {
        for (const wrapper of this.originals.keys()) {
            if (!wrapper.isConnected) this.originals.delete(wrapper);
        }
    }
}
