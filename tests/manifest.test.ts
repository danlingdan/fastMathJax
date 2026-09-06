import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface PluginManifest {
    isDesktopOnly: boolean;
    version: string;
    minAppVersion: string;
}

const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL("../manifest.json", import.meta.url)), "utf8"),
) as PluginManifest;

describe("manifest (MOB-02)", () => {
    it("stays desktop-only until the mobile acceptance matrix passes", () => {
        // MOB-01 requires measured startup, memory, touch-editing, renderer and font evidence
        // from at least one Android and one iOS/iPadOS device (docs/mobile-spike.md). Until that
        // evidence exists, `isDesktopOnly` must remain true — claiming mobile support without it
        // would misrepresent what has been verified. Flip it in the same change that records the
        // passing device matrix, and update this test with it.
        expect(manifest.isDesktopOnly).toBe(true);
    });
});
