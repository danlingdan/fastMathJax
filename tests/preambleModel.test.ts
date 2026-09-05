import { describe, expect, it } from "vitest";
import {
    INLINE_PREAMBLE_SOURCE,
    buildPreambleSegments,
    mergePreambles,
    normalizePreamblePath,
    preambleFileSource,
} from "../src/preamble/preambleModel";
import { DEFAULT_SETTINGS, normalizeSettings, toEngineConfig } from "../src/settingsModel";
import { needsRebuild } from "../src/engine/MathJaxConfig";

describe("normalizePreamblePath", () => {
    it("normalizes separators and redundant pieces", () => {
        expect(normalizePreamblePath("  mathjax-preamble.tex ")).toBe("mathjax-preamble.tex");
        expect(normalizePreamblePath("macros\\math\\preamble.tex")).toBe(
            "macros/math/preamble.tex",
        );
        expect(normalizePreamblePath("./macros//preamble.tex")).toBe("macros/preamble.tex");
    });

    it("maps empty input to disabled, not an error", () => {
        expect(normalizePreamblePath("")).toBe("");
        expect(normalizePreamblePath("   ")).toBe("");
    });

    it("rejects absolute paths as null", () => {
        expect(normalizePreamblePath("/etc/preamble.tex")).toBeNull();
        expect(normalizePreamblePath("C:\\vault\\preamble.tex")).toBeNull();
        expect(normalizePreamblePath("D:/preamble.tex")).toBeNull();
    });
});

describe("mergePreambles", () => {
    it("places file content before the inline preamble", () => {
        const merged = mergePreambles("\\newcommand{\\A}{a}", "\\newcommand{\\B}{b}");
        expect(merged).toBe("\\newcommand{\\A}{a}\n\\newcommand{\\B}{b}");
    });

    it("is stable for either side being empty", () => {
        expect(mergePreambles("", "\\newcommand{\\B}{b}")).toBe("\\newcommand{\\B}{b}");
        expect(mergePreambles("\\newcommand{\\A}{a}", "")).toBe("\\newcommand{\\A}{a}");
        expect(mergePreambles("", "")).toBe("");
    });

    it("produces identical text for identical inputs (deterministic)", () => {
        const first = mergePreambles("\\A", "\\B");
        const second = mergePreambles("\\A", "\\B");
        expect(first).toBe(second);
    });
});

describe("buildPreambleSegments", () => {
    it("labels the file and inline segments", () => {
        const segments = buildPreambleSegments("\\A", "\\B", "macros/preamble.tex");
        expect(segments).toEqual([
            { source: preambleFileSource("macros/preamble.tex"), text: "\\A" },
            { source: INLINE_PREAMBLE_SOURCE, text: "\\B" },
        ]);
    });

    it("omits empty segments", () => {
        expect(buildPreambleSegments("", "\\B", "p.tex")).toHaveLength(1);
        expect(buildPreambleSegments("", "", "p.tex")).toHaveLength(0);
    });
});

describe("preamble file settings mapping", () => {
    it("keeps the configured path and migrates 0.1.x data without it", () => {
        const migrated = normalizeSettings({ renderer: "svg" } as never);
        expect(migrated.preambleFile).toBe("");

        const configured = normalizeSettings({ preambleFile: "  macros/p.tex  " } as never);
        expect(configured.preambleFile).toBe("macros/p.tex");
    });

    it("merges the file content into the engine config in evaluation order", () => {
        const settings = normalizeSettings({ preamble: "\\B", preambleFile: "p.tex" });
        const config = toEngineConfig(settings, "\\A");
        expect(config.preamble).toBe("\\A\n\\B");
        expect(config.preambleSegments).toEqual([
            { source: preambleFileSource("p.tex"), text: "\\A" },
            { source: INLINE_PREAMBLE_SOURCE, text: "\\B" },
        ]);
    });

    it("keeps the inline-only config identical to the pre-0.2.0 shape", () => {
        const settings = normalizeSettings({ preamble: "\\B" });
        const config = toEngineConfig(settings);
        expect(config.preamble).toBe("\\B");
        expect(config.preambleSegments).toBeUndefined();
        expect(config).toEqual(toEngineConfig(normalizeSettings({ preamble: "\\B" })));
    });

    it("treats a preamble file content change as an engine rebuild", () => {
        const settings = normalizeSettings({ preamble: "\\B", preambleFile: "p.tex" });
        const before = toEngineConfig(settings, "\\A");
        const after = toEngineConfig(settings, "\\renewcommand{\\A}{c}");
        expect(needsRebuild(before, after)).toBe(true);
        expect(DEFAULT_SETTINGS.preambleFile).toBe("");
    });
});
