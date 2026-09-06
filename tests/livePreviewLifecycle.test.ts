// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { canRestoreBuiltIn } from "../src/editor/lifecycle";
import { hasOutputAtRevision } from "../src/editor/LivePreviewRenderer";

describe("Live Preview teardown", () => {
    it("restores only while the wrapper still contains the output being replaced", () => {
        const wrapper = document.createElement("span");
        const oldOutput = document.createElement("mjx-container");
        wrapper.appendChild(oldOutput);
        document.body.appendChild(wrapper);

        expect(canRestoreBuiltIn(wrapper, oldOutput)).toBe(true);

        const newerOutput = document.createElement("mjx-container");
        wrapper.replaceChildren(newerOutput);
        expect(canRestoreBuiltIn(wrapper, oldOutput)).toBe(false);

        wrapper.remove();
    });

    it("does not overwrite a wrapper claimed by a newer renderer revision", () => {
        const wrapper = document.createElement("span");
        const output = document.createElement("mjx-container");
        wrapper.appendChild(output);
        document.body.appendChild(wrapper);
        wrapper.setAttribute("data-latest-mathjax-live-preview", "2");

        expect(canRestoreBuiltIn(wrapper, output)).toBe(false);

        wrapper.remove();
        expect(canRestoreBuiltIn(wrapper, output)).toBe(false);
    });
});

describe("Live Preview render-loop skip predicate", () => {
    const VERSION = "4.1.3";

    function wrapperWithOutput(engineVersion: string, revision: string): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.className = "math";
        const output = document.createElement("mjx-container");
        output.setAttribute("data-latest-mathjax-engine", engineVersion);
        output.setAttribute("data-latest-mathjax-revision", revision);
        wrapper.appendChild(output);
        document.body.appendChild(wrapper);
        return wrapper;
    }

    it("skips wrappers already rendered by the current engine revision", () => {
        const wrapper = wrapperWithOutput(VERSION, "7");
        expect(hasOutputAtRevision(wrapper, VERSION, 7)).toBe(true);
        wrapper.remove();
    });

    it("re-renders wrappers holding output from a superseded engine revision", () => {
        // The bundled version survives rebuilds; only the revision tells the two engines apart.
        // Matching on version alone left stale widgets mounted after a settings rebuild.
        const wrapper = wrapperWithOutput(VERSION, "6");
        expect(hasOutputAtRevision(wrapper, VERSION, 7)).toBe(false);
        wrapper.remove();
    });

    it("does not match output from a different bundled version", () => {
        const wrapper = wrapperWithOutput("9.9.9", "7");
        expect(hasOutputAtRevision(wrapper, VERSION, 7)).toBe(false);
        wrapper.remove();
    });

    it("does not match wrappers without our output", () => {
        const wrapper = document.createElement("span");
        wrapper.className = "math";
        document.body.appendChild(wrapper);
        expect(hasOutputAtRevision(wrapper, VERSION, 7)).toBe(false);
        wrapper.remove();
    });
});
