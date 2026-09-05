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

    it("attributes preamble failures to their segment and keeps rendering", () => {
        const config = defaultEngineConfig();
        config.preamble = String.raw`\notARealCommand` + "\n" + String.raw`\newcommand{\R}{\mathbb{R}}`;
        config.preambleSegments = [
            {
                source: 'preamble file "macros/preamble.tex"',
                text: String.raw`\notARealCommand`,
            },
            { source: "settings preamble", text: String.raw`\newcommand{\R}{\mathbb{R}}` },
        ];
        const instance = engine(config);
        instance.initialise();

        const problems = instance.preambleProblems;
        expect(problems).toHaveLength(1);
        expect(problems[0].source).toContain("macros/preamble.tex");
        expect(instance.preambleProblem).toBe(problems[0].message);
        // The failing segment must not prevent later segments (or formulas) from working.
        const rendered = instance.render(String.raw`x \in \R`, { display: false });
        expect(rendered.textContent).toContain("ℝ");
    });

    it("keeps the unlabeled preamble path as a single segment", () => {
        const config = defaultEngineConfig();
        config.preamble = String.raw`\newcommand{\R}{\mathbb{R}}`;
        const instance = engine(config);
        expect(instance.preambleProblems).toEqual([]);
        expect(() => instance.render(String.raw`x \in \R`, { display: false })).not.toThrow();
    });

    it("surfaces TeX parse errors", () => {
        const instance = engine();
        expect(() => instance.render(String.raw`\notARealCommand`, { display: false }))
            .toThrow(MathRenderError);
    });

    it("rebuilds cleanly across CHTML -> SVG -> CHTML switches", () => {
        const instance = engine();
        instance.initialise();
        const dynamicFormula = String.raw`\mathbb{R}\xrightarrow{\text{limit}}\infty`;
        const initialDocument = document.implementation.createHTMLDocument("initial-chtml");
        instance.renderInto(dynamicFormula, { display: false }, initialDocument);
        const initialStyles = initialDocument.getElementById(
            "latest-mathjax-chtml-styles",
        )?.textContent;
        const revision = instance.revision;
        const svg = defaultEngineConfig();
        svg.renderer = "svg";
        expect(instance.updateConfig(svg)).toBe(true);
        expect(instance.revision).toBeGreaterThan(revision);
        const rendered = instance.render(String.raw`\mathbb{R} \to \mathcal{F}`, { display: false });
        expect(rendered.querySelector("svg")).not.toBeNull();

        expect(instance.updateConfig(defaultEngineConfig())).toBe(true);
        const popout = document.implementation.createHTMLDocument("switch-back");
        const chtml = instance.renderInto(dynamicFormula, { display: false }, popout);
        expect(chtml.textContent).toContain("ℝ");
        expect(popout.getElementById("latest-mathjax-chtml-styles")?.textContent)
            .toBe(initialStyles);
    });

    it("keeps concurrent CommonHTML font instances independent", () => {
        const first = engine();
        const second = engine();
        first.initialise();
        second.initialise();

        const formula = String.raw`\mathbb{R}\xrightarrow{\text{limit}}\infty`;
        expect(first.render(formula, { display: false }).textContent).toContain("ℝ");
        expect(second.render(formula, { display: false }).textContent).toContain("ℝ");
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

    it("refreshes styles already copied into a print document", () => {
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
