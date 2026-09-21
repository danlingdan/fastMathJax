// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isolateOutput, isolateStyles } from "../src/engine/outputIsolation";
import { MathJaxEngine } from "../src/engine/MathJaxEngine";

afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
});

describe("MathJax output isolation", () => {
    it("preserves nested layout, glyph classes and MathML while excluding host selectors", () => {
        const root = document.createElement("mjx-container");
        root.innerHTML = '<mjx-sqrt><mjx-box style="padding-top: .3em"><mjx-c class="mjx-c32">2</mjx-c></mjx-box></mjx-sqrt><mjx-assistive-mml><math><mi>x</mi></math></mjx-assistive-mml>';
        isolateOutput(root);
        expect(root.querySelector("mjx-sqrt, mjx-box, mjx-c, mjx-assistive-mml")).toBeNull();
        expect(root.querySelector("latest-mjx-sqrt > latest-mjx-box > .mjx-c32")?.textContent).toBe("2");
        expect(root.querySelector("latest-mjx-box")?.getAttribute("style")).toContain(".3em");
        expect(root.querySelector("latest-mjx-assistive-mml math mi")?.textContent).toBe("x");
        const html = root.outerHTML;
        isolateOutput(root);
        expect(root.outerHTML).toBe(html);
    });

    it("binds renamed nodes and selectors to one engine style scope", () => {
        const root = document.createElement("mjx-container");
        root.innerHTML = "<mjx-math><mjx-mi><mjx-c>x</mjx-c></mjx-mi></mjx-math>";
        isolateOutput(root, "engine-2");
        expect(root.querySelectorAll('[data-latest-mathjax-style="engine-2"]')).toHaveLength(3);

        const style = document.createElement("style");
        style.textContent = "mjx-container mjx-math, mjx-mi > mjx-c { display: inline-block; }";
        document.head.appendChild(style);
        isolateStyles(style.sheet!.cssRules, "engine-2");
        const css = Array.from(style.sheet!.cssRules, (rule) => rule.cssText).join("\n");
        expect(css).toContain(
            'mjx-container[data-latest-mathjax-engine][data-latest-mathjax-style="engine-2"]',
        );
        expect(css).toContain(
            'latest-mjx-c[data-latest-mathjax-style="engine-2"]',
        );
        isolateStyles(style.sheet!.cssRules, "engine-2");
        expect(Array.from(style.sheet!.cssRules, (rule) => rule.cssText).join("\n")).toBe(css);
    });

    it("scopes grouped and nested rules without changing glyph classes or font URLs", () => {
        const style = document.createElement("style");
        style.textContent = 'mjx-container[jax="CHTML"] mjx-c.mjx-c32, mjx-sqrt > mjx-box { display: block; } @media print { mjx-container [size="s"] { font-size: 70%; } } @font-face { font-family: MJX-NCM; src: url("mjx-font.woff2"); }';
        document.head.append(style);
        const rules = style.sheet!.cssRules;
        const originalFontRule = rules[2].cssText;
        isolateStyles(rules);
        const css = Array.from(rules, r => r.cssText).join("\n");
        expect(css).toContain('mjx-container[data-latest-mathjax-engine][jax="CHTML"] latest-mjx-c.mjx-c32');
        expect(css).toContain("latest-mjx-sqrt > latest-mjx-box");
        expect(css).toContain('mjx-container[data-latest-mathjax-engine] [size="s"]');
        expect(rules[2].cssText).toBe(originalFontRule);
        isolateStyles(rules);
        expect(Array.from(rules, r => r.cssText).join("\n")).toBe(css);
    });

    it("isolates sync, async, cached and popout output including newly used constructs", async () => {
        const engine = new MathJaxEngine();
        try {
            const popout = document.implementation.createHTMLDocument("popout");
            engine.renderInto("x", { display: false }, popout);
            const tex = String.raw`\sqrt{x^2+y_2^2}+\frac{4}{7}`;
            const asyncOutput = await engine.renderAsync(tex, { display: false });
            const cached = engine.renderInto(tex, { display: false }, popout);
            expect(asyncOutput.querySelector("latest-mjx-sqrt")).not.toBeNull();
            expect(cached.querySelector("latest-mjx-frac")).not.toBeNull();
            expect(cached.querySelector("mjx-c")).toBeNull();
            expect(cached.ownerDocument).toBe(popout);
            expect(popout.querySelector("[id^=latest-mathjax-chtml-styles]")?.textContent)
                .toMatch(/latest-mjx-sqrt[^>]+> latest-mjx-box/);
            expect(engine.stats.cache.hits).toBe(1);
        } finally {
            engine.dispose();
        }
    });
});
