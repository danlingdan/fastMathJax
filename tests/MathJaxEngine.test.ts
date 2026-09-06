// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { MathJaxEngine, MathRenderError } from "../src/engine/MathJaxEngine";
import { DEFAULT_FONT_URL, defaultEngineConfig } from "../src/engine/MathJaxConfig";

const engines: MathJaxEngine[] = [];

/** Both supported output renderers; the 0.4.0 compatibility matrix runs everything twice. */
const RENDERERS = ["chtml", "svg"] as const;

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
        expect(first.querySelector("latest-mjx-c.mjx-c221A")?.textContent).toBe("√");
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

    it("rebuilds cleanly across CHTML -> SVG -> CHTML switches", () => {        const instance = engine();
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

    it("resets cache statistics on output-affecting reconfiguration", () => {
        const instance = engine();
        instance.initialise();
        const tex = String.raw`x^2`;
        instance.render(tex, { display: false });
        instance.render(tex, { display: false });
        expect(instance.stats).toMatchObject({ cache: { hits: 1, misses: 1 } });

        // A scale change is output-affecting but cheap: entries are dropped and the session
        // counters reset with them, so the settings display never reports stale statistics.
        const rescaled = defaultEngineConfig();
        rescaled.scale = 2;
        expect(instance.updateConfig(rescaled)).toBe(true);
        expect(instance.stats).toMatchObject({ cache: { size: 0, hits: 0, misses: 0 } });

        // A size-only change keeps entries (clamped) and statistics; it is not an invalidation.
        instance.render(tex, { display: false });
        const before = instance.stats.cache;
        instance.setCacheSize(10);
        expect(instance.stats.cache).toMatchObject({
            size: Math.min(before.size, 10),
            hits: before.hits,
            misses: before.misses,
        });
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
        expect(rendered.querySelector("latest-mjx-assistive-mml math")).not.toBeNull();
    });

    it("toggling assistive MathML rebuilds and flips output presence", () => {
        const instance = engine();
        instance.initialise();
        const disabled = instance.render("x+1", { display: false });
        expect(disabled.querySelector("latest-mjx-assistive-mml")).toBeNull();

        // enableAssistiveMml changes the DOM, so it must force a document rebuild.
        const enabled = defaultEngineConfig();
        enabled.enableAssistiveMml = true;
        expect(instance.updateConfig(enabled)).toBe(true);
        const enabledOutput = instance.render("x+1", { display: false });
        expect(enabledOutput.querySelector("latest-mjx-assistive-mml math")).not.toBeNull();

        expect(instance.updateConfig(defaultEngineConfig())).toBe(true);
        expect(instance.render("x+1", { display: false }).querySelector("latest-mjx-assistive-mml"))
            .toBeNull();
    });

    it.each(RENDERERS)(
        "replaces — never stacks — the stylesheet on rebuild and keeps renamed glyph rules (%s)",
        (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            const instance = engine(config);
            instance.initialise();
            instance.render("x+1", { display: false });

            // Any rebuild (renderer/package/preamble/assistive change) tears the document down
            // and rebuilds the stylesheet. The new sheet must replace the old one — a stale thin
            // sheet winning the cascade left rebuilt glyphs without their rules on desktop — and
            // its live rules must be isolated again.
            const toggled = defaultEngineConfig();
            toggled.renderer = renderer;
            toggled.enableAssistiveMml = true;
            expect(instance.updateConfig(toggled)).toBe(true);
            instance.render("y+2", { display: false });

            const sheets = document.querySelectorAll("#latest-mathjax-chtml-styles");
            expect(sheets).toHaveLength(1);
            const live = (sheets[0] as HTMLStyleElement).sheet;
            expect(live).not.toBeNull();
            const selectors = Array.from(
                live!.cssRules,
                (r) => (r as CSSStyleRule).selectorText ?? "",
            );
            // CHTML renames glyph rules (latest-mjx-c), SVG its own wrappers; either way the
            // sheet must carry renamed selectors, not only MathJax's raw mjx-* ones.
            expect(selectors.some((s) => s.includes("latest-mjx-"))).toBe(true);
        },
    );

    it.each(RENDERERS)(
        "emits exactly one assistive MathML tree per cache hit in %s",
        (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            config.enableAssistiveMml = true;
            const instance = engine(config);
            const first = instance.render("x+1", { display: false });
            const second = instance.render("x+1", { display: false });
            expect(instance.stats).toMatchObject({ renders: 1, cache: { hits: 1, misses: 1 } });
            expect(first).not.toBe(second);
            for (const node of [first, second]) {
                // No duplicated speech trees: one assistive container, one MathML root inside it.
                expect(node.querySelectorAll("latest-mjx-assistive-mml, mjx-assistive-mml"))
                    .toHaveLength(1);
                const math = node.querySelector("latest-mjx-assistive-mml math");
                expect(math).not.toBeNull();
                expect(math?.ownerDocument).toBe(node.ownerDocument);
            }
            // The stored template stays intact for future clones.
            const third = instance.render("x+1", { display: false });
            expect(third.querySelector("latest-mjx-assistive-mml math")).not.toBeNull();
        },
    );

    it.each(RENDERERS)(
        "keeps semantic MathML children of the assistive tree in %s",
        (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            config.enableAssistiveMml = true;
            const rendered = engine(config).render("x+1", { display: false });
            const math = rendered.querySelector("latest-mjx-assistive-mml math");
            expect(math).not.toBeNull();
            const tags = Array.from(math?.querySelectorAll("mi, mo, mn") ?? [], (n) => n.tagName);
            expect(tags).toEqual(["mi", "mo", "mn"]);
            // Speech text is produced by the (unbundled) SRE pipeline, never duplicated inline.
            expect(math?.querySelectorAll("[data-semantic-type], [data-speech]")).toHaveLength(0);
        },
    );

    it.each(RENDERERS)(
        "ships the visually-hidden clipping styles for the assistive container in %s",
        (renderer) => {
            // Without these rules the second (MathML) copy would paint on screen. MathJax marks
            // the visual output aria-hidden and hides the assistive container with a 1px clip;
            // our isolation renames the element, so the live rule must target the renamed
            // selector. (The element's textContent keeps MathJax's original text — only the
            // parsed rule set is rewritten and applied.)
            const config = defaultEngineConfig();
            config.renderer = renderer;
            config.enableAssistiveMml = true;
            engine(config).render("x+1", { display: false });
            const sheet = document.getElementById("latest-mathjax-chtml-styles");
            const rules = Array.from(sheet?.sheet?.cssRules ?? [], (rule) => rule as CSSStyleRule)
                .filter((rule) => rule.selectorText?.includes("latest-mjx-assistive-mml"));
            expect(rules.length).toBeGreaterThanOrEqual(2);
            expect(rules.some((rule) => rule.cssText.includes("clip"))).toBe(true);
            expect(rules.some((rule) => rule.selectorText?.includes('="block"'))).toBe(true);
        },
    );

    it("stamps rendered output with the producing engine revision", () => {
        const instance = engine();
        const first = instance.render("x+1", { display: false });
        expect(first.getAttribute("data-latest-mathjax-revision")).toBe(String(instance.revision));

        // After a rebuild the revision advances, so adapters can tell the old markup from the
        // new even though the bundled version string is unchanged. Cache clones keep the stamp.
        const enabled = defaultEngineConfig();
        enabled.enableAssistiveMml = true;
        expect(instance.updateConfig(enabled)).toBe(true);
        const second = instance.render("x+1", { display: false });
        const cached = instance.render("x+1", { display: false });
        expect(second.getAttribute("data-latest-mathjax-revision"))
            .toBe(String(instance.revision));
        expect(second.getAttribute("data-latest-mathjax-revision"))
            .not.toBe(first.getAttribute("data-latest-mathjax-revision"));
        expect(cached.getAttribute("data-latest-mathjax-revision"))
            .toBe(String(instance.revision));
    });

    it("lists the font-face URLs of its stylesheet (FONT-01)", () => {
        const instance = engine();
        instance.initialise();
        const urls = instance.getFontFaceUrls();
        expect(urls.length).toBeGreaterThan(0);
        expect(urls.every((url) => url.endsWith(".woff2"))).toBe(true);
        expect(urls.some((url) => url.startsWith(DEFAULT_FONT_URL))).toBe(true);
    });

    it("keeps SVG output and its stylesheet free of font downloads (FONT-02)", () => {
        const config = defaultEngineConfig();
        config.renderer = "svg";
        config.fontURL = "https://cdn.example.com/woff2";
        const instance = engine(config);
        const rendered = instance.render(
            String.raw`\sqrt[3]{\frac{a}{b}}\xrightarrow{\text{lim}}\mathbb{R}`,
            { display: true },
        );
        // SVG embeds glyph paths; neither the markup nor the flushed stylesheet may reference
        // the configured font URL.
        expect(rendered.outerHTML).not.toContain("cdn.example.com");
        const sheet = document.getElementById("latest-mathjax-chtml-styles");
        const text = sheet?.textContent ?? "";
        expect(text).not.toContain("cdn.example.com");
        expect(text).not.toContain('url("http');
        expect(text).not.toContain("url(http");
        // The one permitted font-face is MathJax's zero-width trick, embedded as a data URI —
        // offline by construction. Any network font source would fail here.
        const srcs = [...text.matchAll(/@font-face[^}]*?url\(([^)]+)\)/g)]
            .map((m) => m[1].replaceAll('"', ""));
        expect(srcs.length).toBeGreaterThanOrEqual(1);
        expect(srcs.every((src) => src.startsWith("data:"))).toBe(true);
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

    describe("renderer compatibility matrix (COMP-01)", () => {
        it.each(RENDERERS)("renders, caches and hands out clones in %s", (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            const instance = engine(config);
            const tex = String.raw`x^2 + \frac{1}{2} + \sqrt{\pi}`;
            const first = instance.render(tex, { display: true });
            const second = instance.render(tex, { display: true });
            expect(first.tagName.toLowerCase()).toBe("mjx-container");
            expect(first.getAttribute("data-latest-mathjax-engine")).toBe("4.1.3");
            if (renderer === "svg") {
                // SVG draws glyphs as paths; there is no text content to assert on.
                expect(first.querySelector("svg path")).not.toBeNull();
            } else {
                expect(first.querySelector("latest-mjx-c.mjx-c221A")?.textContent).toBe("√");
            }
            expect(first).not.toBe(second);
            expect(instance.stats).toMatchObject({ renders: 1, cache: { hits: 1, misses: 1 } });
        });

        it.each(RENDERERS)("surfaces TeX parse errors in %s", (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            expect(() => engine(config).render(String.raw`\notARealCommand`, { display: false }))
                .toThrow(MathRenderError);
        });

        it.each(RENDERERS)("applies preamble macros and adopts output into a popout in %s", (renderer) => {
            const config = defaultEngineConfig();
            config.renderer = renderer;
            config.preamble = String.raw`\newcommand{\RR}{\mathbb{R}}`;
            const instance = engine(config);
            instance.initialise();
            expect(instance.preambleProblem).toBeNull();
            const popout = document.implementation.createHTMLDocument(`popout-${renderer}`);
            const rendered = instance.renderInto(String.raw`x \in \RR`, { display: false }, popout);
            expect(rendered.ownerDocument).toBe(popout);
            expect(popout.getElementById("latest-mathjax-chtml-styles")).not.toBeNull();
            if (renderer === "svg") {
                expect(rendered.querySelector("svg path")).not.toBeNull();
            } else {
                expect(rendered.textContent).toContain("ℝ");
            }
        });
    });
});
