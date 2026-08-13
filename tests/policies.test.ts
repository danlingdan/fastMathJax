import { describe, expect, it } from "vitest";
import { CompatibilityManager } from "../src/compatibility/CompatibilityManager";
import { fallbackPresentation } from "../src/render/fallback";

describe("CompatibilityManager", () => {
    it("allows the host document and gates popouts", () => {
        const host = {} as Document;
        const popout = {} as Document;
        const manager = new CompatibilityManager(host);
        expect(manager.canRender(host, false)).toBe(true);
        expect(manager.canRender(popout, false)).toBe(false);
        expect(manager.canRender(popout, true)).toBe(true);
    });
});

describe("fallbackPresentation", () => {
    it("formats raw source with its delimiters", () => {
        expect(fallbackPresentation("raw", "x", false, new Error("bad"))).toEqual({
            kind: "source",
            text: "$x$",
        });
        expect(fallbackPresentation("raw", "x", true, new Error("bad")).text).toBe("$$x$$");
    });

    it("formats a safe error message", () => {
        expect(fallbackPresentation("error", "x", false, new Error("bad input"))).toEqual({
            kind: "error",
            text: "MathJax error: bad input",
        });
    });
});
