// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type LatestMathJaxPlugin from "../src/main";
import type { MarkdownPostProcessorContext } from "obsidian";
import { ReadingViewSnapshotStore } from "../src/preview/ReadingViewSnapshotStore";

vi.mock("obsidian", () => {
    class Component {
        load(): void {}
        unload(): void {}
    }
    return {
        Component,
        MarkdownRenderer: {
            render: vi.fn(async (_app: unknown, _markdown: string, el: HTMLElement) => {
                // Mirror Obsidian's staging output: a paragraph with one inline math wrapper.
                el.innerHTML = '<p>staged <span class="math math-inline"></span></p>';
            }),
        },
    };
});

import { MarkdownRenderer } from "obsidian";
import { createReadingViewProcessor } from "../src/preview/MathPostProcessor";

const SOURCE = [
    "It costs $5 and $6, while $x^2$ is math.",
    "",
    "She paid $7 and $8, while $y^2$ is fine.",
].join("\n");

interface Harness {
    plugin: LatestMathJaxPlugin;
    renderInto: Mock;
    section: HTMLElement;
    processor: (element: HTMLElement, context: MarkdownPostProcessorContext) => Promise<void>;
}

interface HarnessOptions {
    source: string;
    sectionHTML: string;
    renderInto?: Mock;
}

function createHarness(options: HarnessOptions = {
    source: SOURCE,
    sectionHTML: [
        "<p>It costs $5 and $6, while ",
        '<span class="math math-inline is-loaded">mispaired</span>',
        " is math.</p>",
        "<p>She paid $7 and $8, while ",
        '<span class="math math-inline is-loaded">mispaired</span>',
        " is fine.</p>",
    ].join(""),
}): Harness {
    const renderInto = options.renderInto ?? vi.fn((tex: string, _opts: { display: boolean }, doc: Document) => {
        const el = doc.createElement("span");
        el.className = "test-engine-output";
        el.textContent = `engine:${tex}`;
        return el;
    });
    const plugin = {
        settings: {
            enableReadingView: true,
            enableInlineReadingView: true,
            fallbackMode: "obsidian",
        },
        compatibility: { canRender: () => true },
        renderInto: renderInto as unknown as LatestMathJaxPlugin["renderInto"],
        readingViewSnapshots: new ReadingViewSnapshotStore(),
        app: {},
    } as unknown as LatestMathJaxPlugin;

    const section = document.createElement("div");
    section.innerHTML = options.sectionHTML;
    document.body.appendChild(section);

    const processor = createReadingViewProcessor(plugin);
    const context = {
        getSectionInfo: () => ({ text: options.source, lineStart: 0, lineEnd: 10 }),
        sourcePath: "note.md",
    } as unknown as MarkdownPostProcessorContext;
    return {
        plugin,
        renderInto,
        section,
        processor: (element) => processor(element, context),
    };
}

describe("Reading View post-processor (PERF-03)", () => {
    beforeEach(() => {
        vi.mocked(MarkdownRenderer.render).mockClear();
        document.body.innerHTML = "";
    });

    it("repairs each currency paragraph via a staging re-render", async () => {
        const { processor, section, renderInto } = createHarness();
        await processor(section);

        // Both blocks staged, each staged paragraph re-rendered 1:1 with the bundled engine.
        expect(MarkdownRenderer.render).toHaveBeenCalledTimes(2);
        expect(renderInto.mock.calls.map((call) => call[0])).toEqual(["x^2", "y^2"]);
        const text = section.textContent ?? "";
        expect(text).toContain("staged");
        expect(text).toContain("engine:x^2");
        expect(text).toContain("engine:y^2");
        expect(text).not.toContain("mispaired");
        // The staging render receives the sanitized source: currency dollars stay literal.
        expect(vi.mocked(MarkdownRenderer.render).mock.calls.map((call) => call[1])).toEqual([
            "It costs \\$5 and \\$6, while $x^2$ is math.",
            "She paid \\$7 and \\$8, while $y^2$ is fine.",
        ]);
    });

    it("stops staging remaining blocks once the section was replaced mid-repair", async () => {
        const { processor, section, renderInto } = createHarness();
        vi.mocked(MarkdownRenderer.render).mockImplementation(
            async (_app: unknown, _markdown: string, el: HTMLElement) => {
                el.innerHTML = '<p>staged <span class="math math-inline"></span></p>';
                // Obsidian re-rendered the section during the first staging await.
                section.remove();
            },
        );

        await processor(section);

        expect(MarkdownRenderer.render).toHaveBeenCalledTimes(1);
        expect(renderInto).toHaveBeenCalledTimes(1);
        expect(renderInto.mock.calls[0][0]).toBe("x^2");
    });

    it("aborts the PDF run when the print document was discarded during the vault read", async () => {
        const { plugin, renderInto } = createHarness();
        const printRoot = document.createElement("div");
        printRoot.className = "print";
        const block = document.createElement("div");
        block.innerHTML = '<span class="math math-block is-loaded"></span>';
        printRoot.appendChild(block);
        document.body.appendChild(printRoot);

        plugin.app = {
            vault: {
                getFileByPath: () => ({ path: "note.md" }),
                cachedRead: async () => {
                    printRoot.remove();
                    return SOURCE;
                },
            },
        } as unknown as LatestMathJaxPlugin["app"];
        const processor = createReadingViewProcessor(plugin);
        const context = {
            getSectionInfo: () => null,
            sourcePath: "note.md",
        } as unknown as MarkdownPostProcessorContext;

        await processor(printRoot, context);

        expect(renderInto).not.toHaveBeenCalled();
        expect(MarkdownRenderer.render).not.toHaveBeenCalled();
    });

    it("renders inline math when the display count mismatches (SURF-02)", async () => {
        // Source has one display formula; Obsidian rendered two block wrappers. The display
        // side must fail closed on its own without dragging the inline side down.
        const { processor, section } = createHarness({
            source: "$$\nd_{1}\n$$\n\nValue $x^2$ here.",
            sectionHTML: [
                '<span class="math math-block is-loaded">obsidian-display-1</span>',
                '<span class="math math-block is-loaded">obsidian-display-2</span>',
                "<p>Value ",
                '<span class="math math-inline is-loaded">obsidian-inline</span>',
                " here.</p>",
            ].join(""),
        });

        await processor(section);

        const text = section.textContent ?? "";
        expect(text).toContain("engine:x^2");
        expect(text).toContain("obsidian-display-1");
        expect(text).toContain("obsidian-display-2");
        expect(text).not.toContain("engine:d_{1}");
    });

    it("renders display math when the inline count mismatches (SURF-02)", async () => {
        // Source has one inline formula; Obsidian rendered two inline wrappers.
        const { processor, section } = createHarness({
            source: "$$\nd_{1}\n$$\n\nValue $x^2$ here.",
            sectionHTML: [
                '<span class="math math-block is-loaded">obsidian-display</span>',
                "<p>Value ",
                '<span class="math math-inline is-loaded">obsidian-inline-1</span>',
                '<span class="math math-inline is-loaded">obsidian-inline-2</span>',
                " here.</p>",
            ].join(""),
        });

        await processor(section);

        const text = section.textContent ?? "";
        expect(text).toContain("engine:d_{1}");
        expect(text).toContain("obsidian-inline-1");
        expect(text).toContain("obsidian-inline-2");
        expect(text).not.toContain("engine:x^2");
    });

    it("keeps a failing formula on Obsidian's output while siblings render (SURF-02)", async () => {
        const renderInto = vi.fn((tex: string, _opts: { display: boolean }, doc: Document) => {
            if (tex === "bad") throw new Error("Undefined control sequence");
            const el = doc.createElement("span");
            el.className = "test-engine-output";
            el.textContent = `engine:${tex}`;
            return el;
        });
        const { processor, section } = createHarness({
            source: "First $bad$ then $good$.",
            sectionHTML: [
                "<p>First ",
                '<span class="math math-inline is-loaded">obsidian-bad</span>',
                " then ",
                '<span class="math math-inline is-loaded">obsidian-good</span>',
                ".</p>",
            ].join(""),
            renderInto,
        });

        await processor(section);

        const text = section.textContent ?? "";
        expect(text).toContain("obsidian-bad");
        expect(text).toContain("engine:good");
        // The failed wrapper was not claimed by the plugin; the successful one was.
        const wrappers = Array.from(section.querySelectorAll<HTMLElement>(".math.math-inline"));
        const bad = wrappers.find((wrapper) => wrapper.textContent === "obsidian-bad");
        const good = wrappers.find((wrapper) => wrapper.textContent === "engine:good");
        expect(bad?.hasAttribute("data-latest-mathjax")).toBe(false);
        expect(good?.getAttribute("data-latest-mathjax")).toBe("true");
    });
});
