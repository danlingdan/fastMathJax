// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { MathJaxEngine, MathRenderError } from "../src/engine/MathJaxEngine";
import { defaultEngineConfig } from "../src/engine/MathJaxConfig";

const engines: MathJaxEngine[] = [];

function engine(config = defaultEngineConfig()): MathJaxEngine {
    const instance = new MathJaxEngine(config, 10);
    engines.push(instance);
    return instance;
}

afterEach(() => {
    for (const instance of engines.splice(0)) instance.dispose();
    document.head.replaceChildren();
    document.body.replaceChildren();
});

describe("MathJaxEngine", () => {
    it("renders CHTML and reuses cloned cache entries", () => {
        const instance = engine();
        const first = instance.render(String.raw`x^2 + \frac{1}{2} + \sqrt{\pi}`, { display: true });
        const second = instance.render(String.raw`x^2 + \frac{1}{2} + \sqrt{\pi}`, { display: true });
        expect(first.tagName.toLowerCase()).toBe("mjx-container");
        expect(first.getAttribute("data-latest-mathjax-engine")).toBe("4.1.3");
        expect(first.querySelector("mjx-c.mjx-c221A")?.textContent).toBe("√");
        expect(first).not.toBe(second);
        expect(instance.stats).toMatchObject({ renders: 1, cache: { hits: 1, misses: 1 } });
    });

    it("applies a preamble macro", () => {
        const config = defaultEngineConfig();
        config.preamble = String.raw`\newcommand{\R}{\mathbb{R}}`;
        const instance = engine(config);
        expect(() => instance.render(String.raw`x \in \R`, { display: false })).not.toThrow();
        expect(instance.preambleProblem).toBeNull();
    });

    it("surfaces TeX parse errors", () => {
        const instance = engine();
        expect(() => instance.render(String.raw`\notARealCommand`, { display: false }))
            .toThrow(MathRenderError);
    });

    it("rebuilds when switching to SVG", () => {
        const instance = engine();
        instance.initialise();
        const revision = instance.revision;
        const config = defaultEngineConfig();
        config.renderer = "svg";
        expect(instance.updateConfig(config)).toBe(true);
        expect(instance.revision).toBeGreaterThan(revision);
        const rendered = instance.render(String.raw`\mathbb{R} \to \mathcal{F}`, { display: false });
        expect(rendered.querySelector("svg")).not.toBeNull();
    });

    it("emits assistive MathML when enabled", () => {
        const config = defaultEngineConfig();
        config.enableAssistiveMml = true;
        const rendered = engine(config).render("x+1", { display: false });
        expect(rendered.querySelector("mjx-assistive-mml math")).not.toBeNull();
    });

    it("adopts output and copies styles into a popout document", () => {
        const instance = engine();
        const popout = document.implementation.createHTMLDocument("popout");
        const rendered = instance.renderInto("x", { display: false }, popout);
        expect(rendered.ownerDocument).toBe(popout);
        const copied = popout.getElementById("latest-mathjax-chtml-styles");
        expect(copied).not.toBeNull();
        expect(copied?.textContent).toContain("mjx-container");
    });

    it("refreshes adaptive styles already copied into a print document", () => {
        const instance = engine();
        const printDocument = document.implementation.createHTMLDocument("print");
        instance.renderInto("x", { display: false }, printDocument);
        const copied = printDocument.getElementById("latest-mathjax-chtml-styles");
        const hostStyle = document.getElementById(
            "latest-mathjax-chtml-styles",
        ) as HTMLStyleElement;
        hostStyle.sheet?.insertRule(".latest-mathjax-print-probe { color: red; }");

        instance.ensureStyles(printDocument);

        expect(printDocument.getElementById("latest-mathjax-chtml-styles")).toBe(copied);
        expect(copied?.textContent).toContain("latest-mathjax-print-probe");
    });
});
