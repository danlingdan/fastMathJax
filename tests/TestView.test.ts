// @vitest-environment jsdom

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
    ItemView: class {
        contentEl = document.createElement("div");
        constructor(readonly leaf: unknown) {}
    },
    WorkspaceLeaf: class {},
    setIcon: vi.fn(),
}));

import { MathJaxTestView } from "../src/view/TestView";

beforeAll(() => {
    const proto = HTMLElement.prototype as HTMLElement & Record<string, unknown>;
    proto.empty = function (this: HTMLElement) { this.replaceChildren(); };
    proto.addClass = function (this: HTMLElement, name: string) { this.classList.add(name); };
    proto.removeClasses = function (this: HTMLElement, names: string[]) {
        this.classList.remove(...names);
    };
    proto.setText = function (this: HTMLElement, value: string) { this.textContent = value; };
    proto.toggleClass = function (this: HTMLElement, name: string, enabled: boolean) {
        this.classList.toggle(name, enabled);
    };
    proto.createDiv = function (
        this: HTMLElement,
        options: { cls?: string; text?: string } = {},
    ) {
        const element = document.createElement("div");
        if (options.cls) element.className = options.cls;
        if (options.text) element.textContent = options.text;
        this.appendChild(element);
        return element;
    };
    proto.createSpan = function (
        this: HTMLElement,
        options: { cls?: string; text?: string } = {},
    ) {
        const element = document.createElement("span");
        if (options.cls) element.className = options.cls;
        if (options.text) element.textContent = options.text;
        this.appendChild(element);
        return element;
    };
    proto.createEl = function (
        this: HTMLElement,
        tag: string,
        options: { cls?: string; text?: string; attr?: Record<string, string> } = {},
    ) {
        const element = document.createElement(tag);
        if (options.cls) element.className = options.cls;
        if (options.text) element.textContent = options.text;
        for (const [name, value] of Object.entries(options.attr ?? {})) {
            element.setAttribute(name, value);
        }
        this.appendChild(element);
        return element;
    };
});

describe("MathJaxTestView", () => {
    it("re-renders its mounted formula after an engine/font rebuild", async () => {
        const render = vi.fn(() => {
            const node = document.createElement("mjx-container");
            node.textContent = `render-${render.mock.calls.length}`;
            return node;
        });
        const plugin = {
            engine: {
                version: "4.1.3",
                render,
                stats: { cache: { size: 1, maxSize: 1000, hits: 0, misses: 1 } },
            },
            settings: { renderer: "chtml", fontFamily: "newcm" },
            versionReport: null,
        };
        const view = new MathJaxTestView({} as never, plugin as never);

        await view.onOpen();
        expect(render).toHaveBeenCalledOnce();

        plugin.settings.fontFamily = "stix2";
        view.refresh();

        expect(render).toHaveBeenCalledTimes(2);
        expect(view.contentEl.textContent).toContain("Font stix2");
        expect(view.contentEl.textContent).toContain("render-2");
    });
});
