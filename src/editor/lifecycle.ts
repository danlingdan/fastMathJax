const HANDLED_ATTR = "data-latest-mathjax-live-preview";

/** Prevents a slow teardown render from overwriting output mounted by a newer plugin revision. */
export function canRestoreBuiltIn(wrapper: HTMLElement, previousOutput: Element | null): boolean {
    return wrapper.isConnected &&
        !wrapper.hasAttribute(HANDLED_ATTR) &&
        (previousOutput === null || wrapper.contains(previousOutput));
}
