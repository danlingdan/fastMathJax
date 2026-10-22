import { describe, expect, it } from "vitest";
import { resolveFontBase } from "../src/fonts/fontBase";

const LOCAL_DIR = ".obsidian/plugins/latest-mathjax/fonts/dejavu/4.1.3";
const CDN = "https://cdn.jsdelivr.net/npm/@mathjax/mathjax-dejavu-font@4.1.3/chtml/woff2";

function resolve(overrides: Partial<Parameters<typeof resolveFontBase>[0]> = {}) {
    return resolveFontBase({
        fontSource: "local",
        localDir: LOCAL_DIR,
        configuredUrl: CDN,
        resourcePath: (path) => `app://vaulthash/${path}`,
        ...overrides,
    });
}

describe("resolveFontBase", () => {
    it("uses the configured URL in CDN mode", () => {
        expect(resolve({ fontSource: "cdn" })).toBe(CDN);
    });

    it("falls back to the configured URL while no local cache exists", () => {
        expect(resolve({ localDir: null })).toBe(CDN);
    });

    it("serves the local cache directory in local mode", () => {
        expect(resolve()).toBe(`app://vaulthash/${LOCAL_DIR}`);
    });

    it("never returns a base carrying a query or fragment (issue #2)", () => {
        const base = resolve({
            resourcePath: (path) => `app://vaulthash/${path}?1729076543210`,
        });
        expect(base).toBe(`app://vaulthash/${LOCAL_DIR}`);
        expect(base).not.toContain("?");
        // The engine appends "/<file>.woff2" to this base; the path must therefore end at the
        // font-version directory, not inside a query string.
        expect(`${base}/mjx-gdv-n.woff2`).toBe(
            `app://vaulthash/${LOCAL_DIR}/mjx-gdv-n.woff2`,
        );
    });
});
