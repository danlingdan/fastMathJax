// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mutationNeedsRender } from "../src/editor/observerFilter";

/**
 * Mirrors the Live Preview renderer's handled decision: a wrapper is handled when it carries the
 * pass marker or still contains output tagged with the bundled engine version.
 */
function isHandled(wrapper: Element): boolean {
    return wrapper.hasAttribute("data-latest-mathjax-live-preview") ||
        wrapper.querySelector('[data-latest-mathjax-engine="4.1.3"]') !== null;
}

function mathWrapper(handled: boolean, engineChild = false): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "math math-inline";
    if (engineChild) {
        const output = document.createElement("mjx-container");
        output.setAttribute("data-latest-mathjax-engine", "4.1.3");
        wrapper.appendChild(output);
    }
    if (handled) wrapper.setAttribute("data-latest-mathjax-live-preview", "1");
    document.body.appendChild(wrapper);
    return wrapper;
}

function childList(target: Node, added: Node[] = []): MutationRecord {
    return {
        type: "childList",
        target,
        addedNodes: Array.from(added) as NodeListOf<Node>,
        removedNodes: [] as NodeListOf<Node>,
        previousSibling: null,
        nextSibling: null,
        attributeName: null,
        attributeNamespace: null,
        oldValue: null,
    } as unknown as MutationRecord;
}

describe("Live Preview observer filter (PERF-04)", () => {
    it("ignores the render pass's own replacement mutation", () => {
        // Our render wrote children into this wrapper and tagged it; the observer sees
        // exactly that childList mutation afterwards.
        const wrapper = mathWrapper(true, true);
        const records = [childList(wrapper, [])];
        expect(mutationNeedsRender(records, isHandled)).toBe(false);
    });

    it("ignores a wrapper Obsidian recreated around our preserved output", () => {
        // Obsidian may drop wrapper attributes while keeping the engine-tagged child.
        const wrapper = mathWrapper(false, true);
        const records = [childList(wrapper.parentNode!, [wrapper])];
        expect(mutationNeedsRender(records, isHandled)).toBe(false);
    });

    it("schedules for a fresh Obsidian math wrapper", () => {
        const fresh = mathWrapper(false);
        const unrelated = document.createElement("p");
        const records = [childList(unrelated, [fresh])];
        expect(mutationNeedsRender(records, isHandled)).toBe(true);
    });

    it("schedules when an added subtree contains an unhandled wrapper", () => {
        const subtree = document.createElement("div");
        subtree.appendChild(mathWrapper(false));
        expect(mutationNeedsRender([childList(document.body, [subtree])], isHandled)).toBe(true);
    });

    it("ignores records whose wrappers are all handled", () => {
        const handled = mathWrapper(true, true);
        const preserved = mathWrapper(false, true);
        const unrelated = document.createElement("p");
        const records = [
            childList(handled, []),
            childList(document.body, [preserved, unrelated]),
        ];
        expect(mutationNeedsRender(records, isHandled)).toBe(false);
    });

    it("ignores text-node targets and non-math additions", () => {
        const text = document.createTextNode("plain prose");
        const records = [
            childList(text, []),
            childList(document.body, [document.createElement("span")]),
        ];
        expect(mutationNeedsRender(records, isHandled)).toBe(false);
    });
});
