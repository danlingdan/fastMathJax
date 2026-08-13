import { describe, expect, it } from "vitest";
import {
    extractDisplayMath,
    escapeUnsafeDollarDelimiters,
    findMathInSection,
    findMathRanges,
    textForSection,
} from "../src/utils/mathSource";

describe("findMathInSection", () => {
    it("recovers block and inline math in order", () => {
        expect(findMathInSection("Before $x+1$\n$$y^2$$ after $z$."))
            .toEqual([
                { tex: "x+1", display: false },
                { tex: "y^2", display: true },
                { tex: "z", display: false },
            ]);
    });

    it("ignores fenced code with either marker", () => {
        const markdown = [
            "```tex",
            "$$not_math$$",
            "```",
            "~~~",
            "$also_not_math$",
            "~~~",
            "$$real$$",
        ].join("\n");
        expect(findMathInSection(markdown)).toEqual([{ tex: "real", display: true }]);
    });

    it("ignores inline code spans", () => {
        expect(findMathInSection("`$code$` and ``$$also code$$`` then $real$"))
            .toEqual([{ tex: "real", display: false }]);
    });

    it("does not let currency shift later formulas", () => {
        expect(findMathInSection("It costs $5 and $6, while $x$ is math."))
            .toEqual([{ tex: "x", display: false }]);
    });

    it("honours odd and even backslash escaping", () => {
        expect(findMathInSection(String.raw`\$literal$ and \\$x$`))
            .toEqual([{ tex: "x", display: false }]);
    });

    it("ignores empty, whitespace-delimited, multiline-inline, and unclosed input", () => {
        expect(findMathInSection("$$ $$ $ spaced $ $line\nbreak$ $unclosed"))
            .toEqual([]);
    });

    it("continues after an unclosed display opener", () => {
        expect(findMathInSection("$$ unclosed and later $x$"))
            .toEqual([{ tex: "x", display: false }]);
    });
});

describe("escapeUnsafeDollarDelimiters", () => {
    it("escapes currency-like dollars while preserving real math", () => {
        expect(escapeUnsafeDollarDelimiters("It costs $5 and $6, while $x^2$ is math."))
            .toBe(String.raw`It costs \$5 and \$6, while $x^2$ is math.`);
    });

    it("does not alter fenced code, inline code, or existing escapes", () => {
        const source = [String.raw`Already \$literal and $x$.`, "`$inline$`", "```", "$fenced$", "```"].join("\n");
        expect(escapeUnsafeDollarDelimiters(source)).toBe(source);
    });
});

describe("extractDisplayMath", () => {
    it("returns only display expressions", () => {
        expect(extractDisplayMath("$a$ $$ b $$ $c$")).toEqual(["b"]);
    });
});

describe("findMathRanges", () => {
    it("returns exact delimiter-inclusive editor ranges", () => {
        const text = "A $x$ and $$y$$.";
        expect(findMathRanges(text)).toEqual([
            { tex: "x", display: false, from: 2, to: 5 },
            { tex: "y", display: true, from: 10, to: 15 },
        ]);
    });
});

describe("textForSection", () => {
    it("uses Obsidian's inclusive line range instead of reusing the entire note", () => {
        expect(textForSection("first $x$\nsecond $y$\nthird $z$", 1, 1))
            .toBe("second $y$");
    });

    it("falls back to the supplied text for invalid metadata", () => {
        expect(textForSection("$x$", -1, 2)).toBe("$x$");
    });
});
