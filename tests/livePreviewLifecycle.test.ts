// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { canRestoreBuiltIn } from "../src/editor/lifecycle";

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
