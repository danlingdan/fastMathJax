import { describe, expect, it } from "vitest";
import { asDirectoryBase, fontFileName } from "../src/utils/resourceUrl";

describe("asDirectoryBase", () => {
    it("leaves a plain resource URL untouched", () => {
        expect(asDirectoryBase("app://abc123/.obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3"))
            .toBe("app://abc123/.obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3");
    });

    it("drops cache-busting queries, fragments and both together", () => {
        const base = "app://abc123/.obsidian/plugins/latest-mathjax/fonts/newcm/4.1.3";
        expect(asDirectoryBase(`${base}?1729076543210`)).toBe(base);
        expect(asDirectoryBase(`${base}?mtime=1729076543210`)).toBe(base);
        expect(asDirectoryBase(`${base}#section`)).toBe(base);
        expect(asDirectoryBase(`${base}?v=1#section`)).toBe(base);
    });

    it("keeps a base that is only a host", () => {
        expect(asDirectoryBase("app://abc123")).toBe("app://abc123");
        expect(asDirectoryBase("app://abc123?ts=1")).toBe("app://abc123");
    });
});

describe("fontFileName", () => {
    it("takes the last path segment of a font URL", () => {
        expect(fontFileName("https://cdn.example.com/chtml/woff2/mjx-ncm-s.woff2"))
            .toBe("mjx-ncm-s.woff2");
        expect(fontFileName("app://abc/fonts/newcm/4.1.3/mjx-ncm-s.woff2"))
            .toBe("mjx-ncm-s.woff2");
    });

    it("drops a query or fragment before taking the segment", () => {
        expect(fontFileName("https://cdn.example.com/woff2/mjx-ncm-s.woff2?v=4.1.3"))
            .toBe("mjx-ncm-s.woff2");
        expect(fontFileName("https://cdn.example.com/woff2/mjx-ncm-s.woff2#face"))
            .toBe("mjx-ncm-s.woff2");
    });

    it("falls back to the raw value when there is no segment", () => {
        expect(fontFileName("")).toBe("");
        expect(fontFileName("?only-query")).toBe("?only-query");
    });
});
