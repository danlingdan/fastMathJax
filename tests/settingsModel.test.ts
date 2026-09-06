import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, toEngineConfig } from "../src/settingsModel";

describe("normalizeSettings", () => {
    it("returns independent defaults", () => {
        const first = normalizeSettings(null);
        const second = normalizeSettings(null);
        first.packages.pop();
        expect(second.packages).toEqual(DEFAULT_SETTINGS.packages);
    });

    it("clamps numeric values and rejects invalid enums", () => {
        const settings = normalizeSettings({
            renderer: "bad" as "svg",
            fallbackMode: "bad" as "raw",
            fontSource: "bad" as "cdn",
            scale: 99,
            fontSize: -1,
            cacheSize: 12.6,
            renderDebounce: Number.NaN,
        });
        expect(settings).toMatchObject({
            renderer: "chtml",
            fallbackMode: "obsidian",
            fontSource: "cdn",
            scale: 2,
            fontSize: 8,
            cacheSize: 13,
            renderDebounce: DEFAULT_SETTINGS.renderDebounce,
        });
    });

    it("accepts a valid font source", () => {
        expect(normalizeSettings({ fontSource: "local" }).fontSource).toBe("local");
        expect(normalizeSettings({}).fontSource).toBe(DEFAULT_SETTINGS.fontSource);
    });

    it("deduplicates known packages and restores required packages", () => {
        const settings = normalizeSettings({ packages: ["ams", "ams", "unknown"] });
        expect(settings.packages.filter((pkg) => pkg === "ams")).toHaveLength(1);
        expect(settings.packages).not.toContain("unknown");
        expect(settings.packages).toContain("base");
    });
});

describe("toEngineConfig", () => {
    it("excludes adapter-only settings", () => {
        const config = toEngineConfig(normalizeSettings({ enableLivePreview: true }));
        expect(config).not.toHaveProperty("enableLivePreview");
        expect(config.renderer).toBe("chtml");
    });
});
