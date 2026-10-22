// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { MathJaxEngine, MathRenderError } from "../src/engine/MathJaxEngine";
import { defaultEngineConfig } from "../src/engine/MathJaxConfig";

const engines: MathJaxEngine[] = [];

function engine(): MathJaxEngine {
    const instance = new MathJaxEngine(defaultEngineConfig());
    engines.push(instance);
    return instance;
}

afterEach(() => {
    for (const instance of engines.splice(0)) instance.dispose();
    document.head.replaceChildren();
    document.body.replaceChildren();
});

describe("engine lifecycle", () => {
    it("refuses to render after dispose instead of resurrecting itself", () => {
        // A Reading-View pass can resume after the plugin was disabled; rebuilding there would
        // re-inject a stylesheet and an adopted font-face sheet nothing owns any more.
        const instance = engine();
        instance.initialise();
        instance.dispose();

        expect(() => instance.render("x+1", { display: false })).toThrow(MathRenderError);
        expect(instance.isInitialised).toBe(false);
        expect(document.querySelector("[id^=latest-mathjax-chtml-styles]")).toBeNull();
    });

    it("is idempotent on repeated dispose", () => {
        const instance = engine();
        instance.initialise();
        instance.dispose();
        expect(() => instance.dispose()).not.toThrow();
    });

    it("removes the stylesheet it mirrored into a popout document", () => {
        const instance = engine();
        const popout = document.implementation.createHTMLDocument("popout");
        instance.renderInto("x+1", { display: false }, popout);
        expect(popout.getElementById(instance.styleId)).not.toBeNull();

        instance.dispose();
        expect(popout.getElementById(instance.styleId)).toBeNull();
    });
});
