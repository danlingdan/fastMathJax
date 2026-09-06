// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadMathJax = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("obsidian", () => ({ loadMathJax }));

import {
    INVASIVE_SOURCE_ATTR,
    NativeMathBridge,
    scopeNativeCss,
} from "../src/invasive/NativeMathBridge";

type Patchable = { tex2chtml?: unknown; chtmlStylesheet?: unknown; [key: string]: unknown };

function setNativeMathJax(members: Patchable | null): void {
    (window as unknown as { MathJax: Patchable | null }).MathJax = members;
}

function nativeMathJax(): Patchable {
    return (window as unknown as { MathJax: Patchable }).MathJax;
}

const rendering = (tex: string, display: boolean): HTMLElement => {
    const node = document.createElement("mjx-container");
    node.textContent = `${tex}${display ? "(display)" : ""}`;
    return node;
};

afterEach(() => {
    document.body.replaceChildren();
    document.head.replaceChildren();
    setNativeMathJax(null);
    vi.clearAllMocks();
});

describe("NativeMathBridge", () => {
    beforeEach(() => {
        loadMathJax.mockResolvedValue(undefined);
    });

    it("patches both entry points after loadMathJax and routes renders through the callback", async () => {
        const original = vi.fn(() => document.createElement("span"));
        setNativeMathJax({ tex2chtml: original, chtmlStylesheet: () => document.createElement("style") });
        const bridge = new NativeMathBridge({ render: rendering, stylesheet: () => null });

        const result = await bridge.install();

        expect(result).toEqual({ ok: true });
        expect(loadMathJax).toHaveBeenCalledTimes(1);
        expect(original).not.toHaveBeenCalled();
        const node = nativeMathJax().tex2chtml?.("x^2", { display: true }) as HTMLElement;
        expect(node.textContent).toBe("x^2(display)");
        expect(document.body.classList.contains("latest-mathjax-invasive")).toBe(true);
    });

    it("restores the exact original members and markers on uninstall", async () => {
        const originalTex = (tex: string) => {
            void tex;
            return document.createElement("span");
        };
        const originalSheet = () => document.createElement("style");
        setNativeMathJax({ tex2chtml: originalTex, chtmlStylesheet: originalSheet });
        const bridge = new NativeMathBridge({ render: rendering, stylesheet: () => null });
        await bridge.install();

        bridge.uninstall();

        expect(nativeMathJax().tex2chtml).toBe(originalTex);
        expect(nativeMathJax().chtmlStylesheet).toBe(originalSheet);
        expect(document.body.classList.contains("latest-mathjax-invasive")).toBe(false);
        expect(bridge.isInstalled).toBe(false);
        bridge.uninstall(); // idempotent
        expect(nativeMathJax().tex2chtml).toBe(originalTex);
    });

    it("is a no-op install while already installed (originals are not clobbered)", async () => {
        const original = () => document.createElement("span");
        setNativeMathJax({ tex2chtml: original, chtmlStylesheet: () => document.createElement("style") });
        const bridge = new NativeMathBridge({ render: rendering, stylesheet: () => null });
        await bridge.install();
        await bridge.install();
        bridge.uninstall();
        expect(nativeMathJax().tex2chtml).toBe(original);
    });

    it("fails closed when window.MathJax is missing or structurally unexpected", async () => {
        setNativeMathJax(null);
        const missing = await new NativeMathBridge({ render: rendering, stylesheet: () => null }).install();
        expect(missing.ok).toBe(false);
        if (!missing.ok) expect(missing.reason).toContain("does not expose");

        setNativeMathJax({ chtmlStylesheet: () => document.createElement("style") });
        const partial = await new NativeMathBridge({ render: rendering, stylesheet: () => null }).install();
        expect(partial.ok).toBe(false);
        if (!partial.ok) expect(partial.reason).toContain("tex2chtml");
        expect(loadMathJax).toHaveBeenCalledTimes(2);
    });

    it("fails closed when loadMathJax itself fails", async () => {
        loadMathJax.mockRejectedValue(new Error("offline"));
        const result = await new NativeMathBridge({ render: rendering, stylesheet: () => null }).install();
        expect(result.ok).toBe(false);
    });

    it("falls through to the native renderer when the callback returns null", async () => {
        const nativeNode = document.createElement("span");
        const originalTex = vi.fn(() => nativeNode);
        const originalSheet = vi.fn(() => {
            const style = document.createElement("style");
            style.textContent = "mjx-container { display: block; }";
            return style;
        });
        setNativeMathJax({ tex2chtml: originalTex, chtmlStylesheet: originalSheet });
        const bridge = new NativeMathBridge({
            render: () => null,
            stylesheet: () => null,
        });
        await bridge.install();

        const node = nativeMathJax().tex2chtml?.("\\bad", { display: false }) as HTMLElement;

        expect(node).toBe(nativeNode);
        expect(originalTex).toHaveBeenCalledWith("\\bad", { display: false });
        // The native stylesheet must be mirrored, or the fallback formula renders unstyled —
        // and it must be scoped so v3 CSS cannot hit the plugin's own MathJax 4 output (0.3.0).
        const mirrored = document.getElementById("latest-mathjax-native-fallback-styles");
        expect(mirrored?.textContent)
            .toContain("mjx-container:not([data-latest-mathjax-engine])");
        expect(mirrored?.textContent).not.toMatch(/(^|[\s>])mjx-container[\s[.]/);
        bridge.uninstall();
        expect(document.getElementById("latest-mathjax-native-fallback-styles")).toBeNull();
    });

    it("scopes native CSS to non-plugin containers without touching unrelated rules", () => {
        const css = [
            'mjx-container[jax="CHTML"] { line-height: 0; }',
            "mjx-container { display: block; }",
            'mjx-container[jax="CHTML"] mjx-mi { font-size: 70%; }',
            '@font-face { font-family: MJXCHTML; src: url("x.woff2"); }',
        ].join("\n");
        const scoped = scopeNativeCss(css);
        expect(scoped).toContain('mjx-container:not([data-latest-mathjax-engine])[jax="CHTML"]');
        expect(scoped).toContain("mjx-container:not([data-latest-mathjax-engine]) { display: block; }");
        expect(scoped).toContain("src: url(\"x.woff2\")");
        expect(scoped.match(/mjx-container(?![\w:-])/g)).toBeNull();
    });

    it("tolerates a throwing render callback by using the native fallback", async () => {
        const originalTex = vi.fn(() => document.createElement("span"));
        setNativeMathJax({
            tex2chtml: originalTex,
            chtmlStylesheet: () => document.createElement("style"),
        });
        const bridge = new NativeMathBridge({
            render: () => {
                throw new Error("contract violation");
            },
            stylesheet: () => null,
        });
        await bridge.install();

        const node = nativeMathJax().tex2chtml?.("x", {}) as HTMLElement;
        expect(node.tagName).toBe("SPAN");
        expect(originalTex).toHaveBeenCalled();
    });

    it("returns an empty span when neither the engine nor the native renderer can produce output", async () => {
        const originalTex = vi.fn(() => {
            throw new Error("native also fails");
        });
        setNativeMathJax({
            tex2chtml: originalTex,
            chtmlStylesheet: () => document.createElement("style"),
        });
        const bridge = new NativeMathBridge({ render: () => null, stylesheet: () => null });
        await bridge.install();

        const node = nativeMathJax().tex2chtml?.("x") as HTMLElement;
        expect(node.tagName).toBe("SPAN");
    });

    it("hands out the engine stylesheet and keeps an empty stand-in before the engine exists", async () => {
        setNativeMathJax({ tex2chtml: () => document.createElement("span"), chtmlStylesheet: () => document.createElement("style") });
        const sheet = document.createElement("style");
        let current: HTMLStyleElement | null = sheet;
        const bridge = new NativeMathBridge({ render: rendering, stylesheet: () => current });
        await bridge.install();

        expect(nativeMathJax().chtmlStylesheet?.()).toBe(sheet);

        current = null; // engine disposed/rebuilding
        const standIn = nativeMathJax().chtmlStylesheet?.() as HTMLStyleElement;
        expect(standIn.tagName).toBe("STYLE");
        expect(nativeMathJax().chtmlStylesheet?.()).toBe(standIn);
    });

    it("cannot render natively through the bridge before install", () => {
        const bridge = new NativeMathBridge({ render: rendering, stylesheet: () => null });
        expect(bridge.renderNative("x", false)).toBeNull();
    });

    it("exposes the source attribute name for unload restore", () => {
        expect(INVASIVE_SOURCE_ATTR).toBe("data-latest-mathjax-source");
    });
});
