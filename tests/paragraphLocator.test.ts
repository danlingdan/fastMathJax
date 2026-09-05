// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
    planInlineBlocks,
    uniqueParagraphForBlock,
} from "../src/preview/paragraphLocator";

/** Simulates Obsidian's rendered output: mismatched math spans have empty text (glyph paths). */
function currencyParagraph(structure: "bare-p" | "el-p"): HTMLElement {
    const paragraph = document.createElement("p");
    paragraph.append("It costs ");
    const misPaired = document.createElement("span");
    misPaired.className = "math math-inline";
    paragraph.append(misPaired); // Obsidian's MathJax output contributes no text content
    paragraph.append(" is math. Inline code ");
    const code = document.createElement("code");
    code.textContent = "$not_math$";
    paragraph.append(code);
    paragraph.append(".");

    if (structure === "el-p") {
        const wrapper = document.createElement("div");
        wrapper.className = "el-p";
        wrapper.append(paragraph);
        return wrapper;
    }
    return paragraph;
}

describe("uniqueParagraphForBlock", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    const block = "It costs $5 and $6, while $x^2$ is math. Inline code `$not_math$`.";

    it("anchors the suffix outside code spans and matches in bare-p print DOM", () => {
        const container = document.createElement("div");
        const paragraph = currencyParagraph("bare-p");
        container.append(paragraph);

        expect(uniqueParagraphForBlock(container, block)).toBe(paragraph);
    });

    it("matches the inner paragraph inside Obsidian 1.13 el-p wrappers", () => {
        const container = document.createElement("div");
        const wrapper = currencyParagraph("el-p");
        container.append(wrapper);

        const found = uniqueParagraphForBlock(container, block);
        expect(found).toBe(wrapper.firstElementChild);
    });

    it("matches even when the suffix after the last math dollar contains a code span", () => {
        // Regression for the 0.1.x locator: the last $ of the block is the closing delimiter of
        // $x^2$, but backtick-joining the trailing code span made endsWith() unsatisfiable.
        const container = document.createElement("div");
        container.append(currencyParagraph("bare-p"));
        expect(uniqueParagraphForBlock(container, block)).not.toBeNull();
    });

    it("returns null when no paragraph matches the anchors", () => {
        const container = document.createElement("div");
        const paragraph = document.createElement("p");
        paragraph.textContent = "Something entirely different.";
        container.append(paragraph);
        expect(uniqueParagraphForBlock(container, block)).toBeNull();
    });

    it("returns null when several paragraphs match (ambiguous swap)", () => {
        const container = document.createElement("div");
        container.append(currencyParagraph("bare-p"));
        container.append(currencyParagraph("bare-p"));
        expect(uniqueParagraphForBlock(container, block)).toBeNull();
    });

    it("returns null for markdown without any dollar to anchor on", () => {
        const container = document.createElement("div");
        container.append(currencyParagraph("bare-p"));
        expect(uniqueParagraphForBlock(container, "No math here at all.")).toBeNull();
    });
});

describe("planInlineBlocks", () => {
    const acceptanceNote = [
        "# Latest MathJax 0.2.0 Acceptance",
        "",
        "$$x \\in \\R$$",
        "",
        "Euler: $e^{i\\pi}+1=0$, file macro: $2\\XX$.",
        "",
        "It costs $5 and $6, while $x^2$ is math. Inline code `$not_math$`.",
        "",
        "```tex",
        "$$not_math$$",
        "```",
    ].join("\n");

    it("plans exactly the blocks that contain inline math, in order", () => {
        const plans = planInlineBlocks(acceptanceNote);
        expect(plans).toHaveLength(2);
        expect(plans[0].markdown).toBe("Euler: $e^{i\\pi}+1=0$, file macro: $2\\XX$.");
        expect(plans[0].sources.map((s) => s.tex)).toEqual(["e^{i\\pi}+1=0", "2\\XX"]);
        expect(plans[1].sources.map((s) => s.tex)).toEqual(["x^2"]);
    });

    it("sanitizes only blocks whose dollars the scanner rejected", () => {
        const plans = planInlineBlocks(acceptanceNote);
        expect(plans[0].renderMarkdown).toBe(plans[0].markdown);
        expect(plans[1].renderMarkdown).toBe(
            "It costs \\$5 and \\$6, while $x^2$ is math. Inline code `$not_math$`.",
        );
    });

    it("locates every planned block in a simulated print DOM", () => {
        // Print DOM: bare <p> per block; Obsidian's math output contributes no text content and
        // the currency paragraph produced no wrapper at all (its dollars were swallowed).
        const container = document.createElement("div");
        const blocks: Array<{ text: string; wrappers: number }> = [
            { text: "Euler: , file macro: .", wrappers: 2 },
            { text: "It costs is math. Inline code $not_math$.", wrappers: 0 },
        ];
        for (const block of blocks) {
            const p = document.createElement("p");
            p.append(block.text);
            for (let i = 0; i < block.wrappers; i++) {
                p.append(document.createElement("span"));
            }
            container.append(p);
        }

        for (const plan of planInlineBlocks(acceptanceNote)) {
            expect(uniqueParagraphForBlock(container, plan.markdown)).not.toBeNull();
        }
    });

    it("omits display-only and code-only blocks", () => {
        const plans = planInlineBlocks("$$only display$$\n\n`$code$` only\n\nplain text");
        expect(plans).toHaveLength(0);
    });
});
