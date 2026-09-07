// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_FONT_URL, mirrorFontUrls } from "../src/engine/MathJaxConfig";
import { MathJaxEngine } from "../src/engine/MathJaxEngine";

describe("cross-document font URL mirroring", () => {
    it("rewrites a local font base to the CDN default and is a no-op for the CDN base", () => {
        const localBase = "app://somehash/D:/vault/.obsidian/plugins/x/fonts/4.1.3?12345";
        const css = `@font-face { font-family: MJX-NCM-N; src: url("${localBase}/mjx-ncm-n.woff2"); }`;
        const mirrored = mirrorFontUrls(css, localBase);
        expect(mirrored).toContain(`${DEFAULT_FONT_URL}/mjx-ncm-n.woff2`);
        expect(mirrored).not.toContain(localBase);
        // Every occurrence is rewritten, and the CDN base itself is left untouched.
        expect(mirrorFontUrls(`${css}\n${css}`, localBase).match(/mjx-ncm-n\.woff2/g)?.length).toBe(2);
        expect(mirrorFontUrls(css, DEFAULT_FONT_URL)).toBe(css);
    });
});

afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
});

describe("MathJaxEngine with isolation disabled (invasive mode)", () => {
    it("ships native mjx-* tags while keeping the engine stamps", () => {
        const engine = new MathJaxEngine({ isolationEnabled: false });
        try {
            const node = engine.render("x^2", { display: false });
            expect(node.tagName).toBe("MJX-CONTAINER");
            expect(node.querySelector("mjx-mi, mjx-mn, mjx-c")).not.toBeNull();
            expect(node.querySelector("[class^='latest-mjx'], [class*=' latest-mjx']")).toBeNull();
            expect(node.getAttribute("data-latest-mathjax-engine")).toBe(engine.version);
            expect(node.getAttribute("data-latest-mathjax-revision")).toBe(
                String(engine.revision),
            );
        } finally {
            engine.dispose();
        }
    });

    it("leaves the stylesheet selectors in MathJax's own vocabulary", async () => {
        const engine = new MathJaxEngine({ isolationEnabled: false });
        try {
            engine.render("x^2 + \\frac{1}{2}", { display: false });
            // Let the scheduled (rAF + 200 ms fallback) style flush land.
            await new Promise((resolve) => setTimeout(resolve, 250));
            const sheet = document.querySelector("[id^=latest-mathjax-chtml-styles]");
            expect(sheet).not.toBeNull();
            const css = Array.from(
                sheet?.sheet?.cssRules ?? [],
                (rule) => rule.cssText,
            ).join("\n");
            expect(css).toContain("mjx-container");
            expect(css).not.toContain("latest-mjx");
        } finally {
            engine.dispose();
        }
    });

    it("keeps cache clones unrenamed too", () => {
        const engine = new MathJaxEngine({ isolationEnabled: false });
        try {
            const first = engine.render("\\sqrt{3}", { display: false });
            const cached = engine.render("\\sqrt{3}", { display: false });
            expect(cached).not.toBe(first);
            expect(cached.querySelector("mjx-sqrt")).not.toBeNull();
            expect(engine.stats.cache.hits).toBe(1);
        } finally {
            engine.dispose();
        }
    });

    it("defaults to isolation on, matching the coexistence behavior", () => {
        const engine = new MathJaxEngine();
        try {
            const node = engine.render("x^2", { display: false });
            expect(node.querySelector("latest-mjx-mi")).not.toBeNull();
        } finally {
            engine.dispose();
        }
    });
});
