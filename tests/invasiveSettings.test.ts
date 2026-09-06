import { describe, expect, it } from "vitest";

import {
    configHash,
    defaultEngineConfig,
    needsRebuild,
} from "../src/engine/MathJaxConfig";
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    toEngineConfig,
} from "../src/settingsModel";

describe("invasive mode settings (INV-SET)", () => {
    it("defaults to off and survives normalization of old data.json files", () => {
        expect(DEFAULT_SETTINGS.invasiveMode).toBe(false);
        expect(normalizeSettings(null).invasiveMode).toBe(false);
        expect(normalizeSettings({}).invasiveMode).toBe(false);
        // A non-boolean leftover must never enable the mode.
        expect(normalizeSettings({ invasiveMode: "true" as unknown as boolean }).invasiveMode)
            .toBe(false);
    });

    it("persists an explicit opt-in", () => {
        expect(normalizeSettings({ invasiveMode: true }).invasiveMode).toBe(true);
    });

    it("disables output isolation while invasive and keeps it otherwise", () => {
        expect(toEngineConfig(normalizeSettings({})).isolationEnabled).toBe(true);
        expect(toEngineConfig(normalizeSettings({ invasiveMode: true })).isolationEnabled)
            .toBe(false);
    });

    it("counts isolation as an output-affecting change for hashing and rebuilds", () => {
        const base = defaultEngineConfig();
        const invasive = { ...base, isolationEnabled: false };
        expect(needsRebuild(base, invasive)).toBe(true);
        expect(configHash(base)).not.toBe(configHash(invasive));
        expect(needsRebuild(base, { ...base })).toBe(false);
    });
});
