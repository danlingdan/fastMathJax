// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { ReadingViewSnapshotStore } from "../src/preview/ReadingViewSnapshotStore";

describe("ReadingViewSnapshotStore", () => {
    it("restores Obsidian output synchronously after a Reading View takeover", () => {
        const wrapper = document.createElement("div");
        wrapper.className = "math math-block";
        wrapper.setAttribute("data-latest-mathjax", "true");
        const builtIn = document.createElement("mjx-container");
        builtIn.className = "MathJax";
        builtIn.textContent = "built-in";
        wrapper.appendChild(builtIn);
        document.body.appendChild(wrapper);

        const store = new ReadingViewSnapshotStore();
        const replacement = document.createElement("mjx-container");
        replacement.setAttribute("data-latest-mathjax-engine", "4.1.3");
        replacement.textContent = "bundled";
        store.replace(wrapper, replacement);

        expect(wrapper.textContent).toBe("bundled");
        store.restoreAll();

        expect(wrapper.firstChild).toBe(builtIn);
        expect(wrapper.textContent).toBe("built-in");
        expect(wrapper.hasAttribute("data-latest-mathjax")).toBe(false);
        wrapper.remove();
    });

    it("keeps the first Obsidian snapshot across repeated engine refreshes", () => {
        const wrapper = document.createElement("span");
        const builtIn = document.createTextNode("built-in");
        wrapper.appendChild(builtIn);
        document.body.appendChild(wrapper);

        const store = new ReadingViewSnapshotStore();
        store.replace(wrapper, document.createTextNode("engine-one"));
        store.replace(wrapper, document.createTextNode("engine-two"));
        store.restoreAll();

        expect(wrapper.firstChild).toBe(builtIn);
        expect(wrapper.textContent).toBe("built-in");
        wrapper.remove();
    });
});
