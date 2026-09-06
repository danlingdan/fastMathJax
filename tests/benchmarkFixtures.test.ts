import { describe, expect, it } from "vitest";
import {
    buildBenchmarkNote,
    CATEGORY_SHARES,
    compositionFor,
    REPEATED_DISPLAY_SOURCES,
    REPEATED_INLINE_SOURCES,
} from "../scripts/benchmarkFixtures.mjs";

describe("benchmark fixtures (PERF-01)", () => {
    it("allocates the exact total across all categories for the canonical note sizes", () => {
        for (const total of [100, 500]) {
            const composition = compositionFor(total);
            const shares = Object.fromEntries(CATEGORY_SHARES);
            let sum = 0;
            for (const [category, count] of Object.entries(composition)) {
                expect(count).toBe(Math.floor((total * shares[category]) / 100));
                sum += count;
            }
            expect(sum).toBe(total);
        }
        expect(compositionFor(100)).toEqual({
            "unique-inline": 40,
            "repeated-inline": 20,
            "unique-display": 20,
            "repeated-display": 10,
            macro: 5,
            invalid: 5,
        });
    });

    it("rejects totals that cannot host the repeated pools", () => {
        expect(() => buildBenchmarkNote(0)).toThrow();
        expect(() => buildBenchmarkNote(10)).toThrow();
        expect(() => buildBenchmarkNote(12.5)).toThrow();
    });

    it("builds deterministic markdown", () => {
        for (const total of [100, 500]) {
            const first = buildBenchmarkNote(total);
            const second = buildBenchmarkNote(total);
            expect(first.markdown).toBe(second.markdown);
            expect(first.formulas).toEqual(second.formulas);
        }
    });

    it("contains exactly the composed formulas in the markdown", () => {
        for (const total of [100, 500]) {
            const note = buildBenchmarkNote(total);
            expect(note.formulas).toHaveLength(total);
            for (const entry of note.formulas) {
                if (entry.kind === "inline") {
                    expect(note.markdown).toContain(`$${entry.source}$`);
                } else {
                    expect(note.markdown).toContain(`$$\n${entry.source}\n$$`);
                }
            }
        }
    });

    it("keeps the unique sections duplicate-free", () => {
        const note = buildBenchmarkNote(500);
        for (const category of ["unique-inline", "unique-display"]) {
            const sources = note.formulas.filter((f) => f.category === category).map((f) => f.source);
            expect(new Set(sources).size).toBe(sources.length);
        }
    });

    it("repeats every fixed source enough times to produce cache hits", () => {
        const note = buildBenchmarkNote(500);
        for (const [category, pool] of [
            ["repeated-inline", REPEATED_INLINE_SOURCES],
            ["repeated-display", REPEATED_DISPLAY_SOURCES],
        ] as const) {
            for (const source of pool) {
                const hits = note.formulas.filter((f) => f.category === category && f.source === source);
                expect(hits.length).toBeGreaterThanOrEqual(2);
            }
        }
    });

    it("exercises the macro and failure-fallback paths", () => {
        const note = buildBenchmarkNote(500);
        const macros = note.formulas.filter((f) => f.category === "macro");
        expect(macros.length).toBeGreaterThan(0);
        expect(macros.every((f) => f.source.includes("\\bench"))).toBe(true);

        const invalid = note.formulas.filter((f) => f.category === "invalid");
        expect(invalid.length).toBeGreaterThan(0);
        expect(invalid.some((f) => f.kind === "display")).toBe(true);
        expect(invalid.every((f) => /\\benchInvalid/.test(f.source))).toBe(true);
    });

    it("documents the preamble setup and ends with a math-free anchor", () => {
        const note = buildBenchmarkNote(100);
        expect(note.markdown).toContain("benchmark-preamble.tex");
        const anchor = note.markdown.indexOf("## Math-free anchor");
        expect(anchor).toBeGreaterThan(0);
        expect(note.markdown.slice(anchor)).not.toContain("$");
    });
});
