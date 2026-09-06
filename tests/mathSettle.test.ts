// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForSettledMath } from "../src/preview/mathSettle";
import { describeMathError } from "../src/engine/MathJaxEngine";

function mathWrapper(loaded: boolean): HTMLElement {
    const node = document.createElement("span");
    node.className = "math math-block" + (loaded ? " is-loaded" : "");
    document.body.appendChild(node);
    return node;
}

describe("waitForSettledMath", () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.useRealTimers();
    });

    it("returns immediately when every wrapper is already settled", async () => {
        const nodes = [mathWrapper(true), mathWrapper(true)];
        const settled = await waitForSettledMath(nodes);
        expect(settled).toEqual(nodes);
    });

    it("waits for wrappers that finalize during the wait", async () => {
        const settledNode = mathWrapper(true);
        const pendingNode = mathWrapper(false);
        const promise = waitForSettledMath([settledNode, pendingNode]);

        // Simulate Obsidian's asynchronous math finalization landing a moment later.
        setTimeout(() => pendingNode.classList.add("is-loaded"), 10);
        vi.useFakeTimers();
        const settled = await vi.advanceTimersByTimeAsync(50).then(() => promise);

        expect(settled).toEqual([settledNode, pendingNode]);
    });

    it("drops wrappers that never settle, instead of taking them over", async () => {
        vi.useFakeTimers();
        const settledNode = mathWrapper(true);
        const staleNode = mathWrapper(false);
        const detachedNode = mathWrapper(false);
        detachedNode.remove();

        const promise = waitForSettledMath([settledNode, staleNode, detachedNode]);
        const settled = await vi.advanceTimersByTimeAsync(5_100).then(() => promise);

        expect(settled).toEqual([settledNode]);
    });

    it("does not mistake the plugin's data-attribute writes for finalization", async () => {
        // The takeover writes data-* attributes on wrappers after settling; the wait observes
        // only the class attribute, so those writes can neither resolve nor prolong it.
        vi.useFakeTimers();
        const pendingNode = mathWrapper(false);
        const promise = waitForSettledMath([pendingNode]);
        const settledDuringWrites = promise.then((nodes) => {
            void nodes;
            return true;
        });
        pendingNode.setAttribute("data-latest-mathjax", "true");
        const raced = await Promise.race([
            settledDuringWrites.then(() => "resolved"),
            vi.advanceTimersByTimeAsync(20).then(() => "still-pending"),
        ]);
        expect(raced).toBe("still-pending");
        expect(pendingNode.classList.contains("is-loaded")).toBe(false);
    });
});

describe("describeMathError", () => {
    it("extracts messages from Error instances and error-like objects", () => {
        expect(describeMathError(new Error("boom"))).toBe("boom");
        expect(describeMathError({ message: "Undefined control sequence" })).toBe(
            "Undefined control sequence",
        );
    });

    it("serializes MathJax's plain-object retry signals instead of [object Object]", () => {
        expect(describeMathError({ retry: true })).toBe('{"retry":true}');
        expect(describeMathError("plain")).toBe("plain");
        expect(describeMathError(42)).toBe("42");
    });
});
