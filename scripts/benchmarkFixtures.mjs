/**
 * Deterministic benchmark fixtures for the 0.3.0 measurement pass (ROADMAP PERF-01).
 *
 * Pure module: no filesystem, clock or randomness. `generate-benchmarks.mjs` writes the notes
 * described here, and `tests/benchmarkFixtures.test.ts` pins the composition and byte-for-byte
 * determinism, so regenerated notes only change when this recipe changes.
 */

/** Category shares in percent of the note's total formula count. Must sum to 100. */
export const CATEGORY_SHARES = [
    ["unique-inline", 40],
    ["repeated-inline", 20],
    ["unique-display", 20],
    ["repeated-display", 10],
    ["macro", 5],
    ["invalid", 5],
];

/** Fixed inline sources that repeat, so the second and later renders are cache hits. */
export const REPEATED_INLINE_SOURCES = [
    String.raw`e^{i\pi} = -1`,
    String.raw`a^{2} + b^{2} = c^{2}`,
    String.raw`\hat{H}\,\Psi = E\,\Psi`,
    String.raw`\nabla \cdot \mathbf{E} = \rho / \varepsilon_{0}`,
];

/** Fixed display sources that repeat, exercising the display-math cache path. */
export const REPEATED_DISPLAY_SOURCES = [
    String.raw`\int_{-\infty}^{\infty} e^{-x^{2}}\,dx = \sqrt{\pi}`,
    String.raw`\mathbb{R}^{n} \xrightarrow{\ \sim\ } \mathbb{C}^{n}`,
];

/**
 * Index-parameterized inline templates. Every formula embeds its index, so the pool produces
 * only distinct sources no matter how many the note needs.
 */
export const UNIQUE_INLINE_TEMPLATES = [
    (i) => String.raw`f_{${i}}(x) = ${i}x^{2} + ${2 * i}x + ${i + 1}`,
    (i) => String.raw`\sqrt{x^{2} + y_{${i}}^{2}} \le ${i + 4}`,
    (i) => String.raw`\frac{${i + 1}}{${2 * i + 1}} + \frac{q_{${i}}}{${i + 2}}`,
    (i) => String.raw`\sum_{k=1}^{${i + 9}} k^{${(i % 3) + 2}}`,
    (i) => String.raw`\int_{0}^{\pi/${i + 1}} \sin^{${(i % 4) + 2}}(t)\,dt`,
    (i) => String.raw`\mathcal{F}_{${i}} \subset \mathbb{R}^{${i + 2}}`,
    (i) => String.raw`A_{${i}} \xrightarrow{\ \phi_{${i}}\ } B_{${i + 1}}`,
    (i) =>
        String.raw`\begin{bmatrix} ${i} & ${i + 1} \\ ${2 * i} & ${i + 3}\end{bmatrix}^{-1}`,
    (i) => String.raw`e^{-${i}x}\cos(${i}x)`,
    (i) => String.raw`\lim_{n \to \infty} n^{-${i}} \cdot ${i + 1}`,
];

/** Index-parameterized single-line display templates, kept on one source line each. */
export const UNIQUE_DISPLAY_TEMPLATES = [
    (i) => String.raw`\sum_{k=1}^{\infty} \frac{1}{k^{${i + 1}}} = \zeta(${i + 1}) \le \frac{\pi^{2}}{6}`,
    (i) =>
        String.raw`\det\!\begin{pmatrix} ${i} & ${i + 2} & ${i + 4} \\ ${i + 1} & ${2 * i} & ${i + 3} \\ ${i + 5} & ${i + 2} & ${i}\end{pmatrix} = D_{${i}}`,
    (i) => String.raw`\oint_{\partial \Omega_{${i}}} \mathbf{F}_{${i}} \cdot d\mathbf{r} = 2\pi \cdot ${i}`,
    (i) => String.raw`\frac{d^{${i}}}{dx^{${i}}} \left(e^{-x^{2}}\right) = H_{${i}}(x)\,e^{-x^{2}}`,
    (i) => String.raw`\mathcal{L}\!\left[t^{${i}}\right] = \frac{${i + 1}!}{s^{${i + 1}}} \quad (n \ge ${i})`,
];

/**
 * Macro templates referencing the macros defined in
 * `benchmarks/preamble/benchmark-preamble.tex`, so this section only renders when the
 * vault-relative `Preamble file` setting points at that file.
 */
export const MACRO_TEMPLATES = [
    (i) => String.raw`\benchQuad{x_{${i}}}`,
    (i) => String.raw`\benchNorm{\vec{v}_{${i}}}`,
    (i) => String.raw`\benchSet`,
    (i) => String.raw`\benchSpeedOfLight`,
    (i) => String.raw`\benchMap{f_{${i}}}{\mathbb{C}}`,
];

/** Deliberately unknown control sequences: every render of this section takes the fallback. */
export const INVALID_TEMPLATES = [
    (i) => String.raw`\benchInvalidCommand${i}`,
    (i) => String.raw`\benchInvalidDisplay${i}`,
];

const INLINE_STEMS = [
    "Segment {n} gives",
    "The bound in item {n} reads",
    "Rewriting item {n} yields",
    "One verifies item {n}:",
    "For comparison, item {n} states that",
];

const SECTION_INTROS = {
    "unique-inline":
        "Each source below is distinct, so every render is a cache miss and may load New Computer Modern glyph chunks on first sight.",
    "repeated-inline":
        "The same handful of sources repeats throughout, so the first instance pays for typesetting and later instances exercise the formula cache.",
    "unique-display":
        "Distinct single-line display blocks; like the unique inline section, every block is a fresh typeset.",
    "repeated-display":
        "Two display sources alternate, measuring repeated display typesets against the cache.",
    macro: "These formulas call macros from `benchmark-preamble.tex`; they render only when the plugin's Preamble file setting points at that file, and render as raw TeX if it does not.",
    invalid: "These control sequences are intentionally undefined. The plugin must leave them to Obsidian's failure fallback without disturbing neighboring formulas.",
};

/**
 * Computes per-category counts for a note total: each category gets the floor of its share,
 * and the remainder lands in unique-inline so the total is exact.
 */
export function compositionFor(totalFormulas) {
    const composition = {};
    let assigned = 0;
    for (const [category, share] of CATEGORY_SHARES) {
        composition[category] = Math.floor((totalFormulas * share) / 100);
        assigned += composition[category];
    }
    composition["unique-inline"] += totalFormulas - assigned;
    return composition;
}

function inlineParagraph(formulas, firstNumber) {
    return formulas
        .map((entry, offset) => {
            const stem = INLINE_STEMS[(firstNumber + offset) % INLINE_STEMS.length].replace(
                "{n}",
                String(firstNumber + offset),
            );
            return `${stem} $${entry.source}$.`;
        })
        .join(" ");
}

function displayBlock(source) {
    return `$$\n${source}\n$$`;
}

function buildFormulas(totalFormulas) {
    const composition = compositionFor(totalFormulas);
    const formulas = [];
    const push = (category, kind, source) => formulas.push({ category, kind, source });

    for (let i = 0; i < composition["unique-inline"]; i += 1) {
        push("unique-inline", "inline", UNIQUE_INLINE_TEMPLATES[i % UNIQUE_INLINE_TEMPLATES.length](i + 1));
    }
    for (let i = 0; i < composition["repeated-inline"]; i += 1) {
        push("repeated-inline", "inline", REPEATED_INLINE_SOURCES[i % REPEATED_INLINE_SOURCES.length]);
    }
    for (let i = 0; i < composition["unique-display"]; i += 1) {
        push("unique-display", "display", UNIQUE_DISPLAY_TEMPLATES[i % UNIQUE_DISPLAY_TEMPLATES.length](i + 1));
    }
    for (let i = 0; i < composition["repeated-display"]; i += 1) {
        push("repeated-display", "display", REPEATED_DISPLAY_SOURCES[i % REPEATED_DISPLAY_SOURCES.length]);
    }
    for (let i = 0; i < composition.macro; i += 1) {
        const template = MACRO_TEMPLATES[i % MACRO_TEMPLATES.length];
        push("macro", i % MACRO_TEMPLATES.length === 4 ? "display" : "inline", template(i + 1));
    }
    for (let i = 0; i < composition.invalid; i += 1) {
        const template = INVALID_TEMPLATES[i % 2];
        push("invalid", i % 2 === 0 ? "inline" : "display", template(Math.floor(i / 2) + 1));
    }

    const summary = CATEGORY_SHARES.map(([category]) =>
        category === "invalid"
            ? `${composition[category]} invalid (intentional)`
            : `${composition[category]} ${category.replace("-", " ")}`,
    ).join(" + ");
    return { composition, formulas, summary };
}

function renderInlineCategory(formulas) {
    const paragraphs = [];
    for (let i = 0; i < formulas.length; i += 5) {
        paragraphs.push(inlineParagraph(formulas.slice(i, i + 5), i + 1));
    }
    return paragraphs.join("\n\n");
}

function renderDisplayCategory(formulas) {
    return formulas.map((entry) => displayBlock(entry.source)).join("\n\n");
}

function renderMacroSection(formulas) {
    return formulas
        .map((entry) => (entry.kind === "display" ? displayBlock(entry.source) : `A macro evaluation $${entry.source}$ appears here.`))
        .join("\n\n");
}

function renderInvalidSection(formulas) {
    return formulas
        .map((entry) => (entry.kind === "display" ? displayBlock(entry.source) : `The undefined command $${entry.source}$ must fail closed.`))
        .join("\n\n");
}

/**
 * Builds the full benchmark note for a total formula count.
 *
 * Returns `{ totalFormulas, composition, formulas, markdown }`. `formulas` is the ordered
 * list of `{ category, kind, source }` entries the note contains, in the order they appear,
 * so tests can audit the markdown without parsing TeX out of it.
 */
export function buildBenchmarkNote(totalFormulas) {
    if (!Number.isInteger(totalFormulas) || totalFormulas < 10) {
        throw new Error(`benchmark note needs an integer total >= 10, got ${totalFormulas}`);
    }
    const { composition, formulas, summary } = buildFormulas(totalFormulas);
    if (formulas.length !== totalFormulas) {
        throw new Error(`recipe produced ${formulas.length} formulas, expected ${totalFormulas}`);
    }
    if (composition["repeated-inline"] < REPEATED_INLINE_SOURCES.length * 2) {
        throw new Error("repeated-inline count is too small for every source to repeat twice");
    }
    if (composition["repeated-display"] < REPEATED_DISPLAY_SOURCES.length * 2) {
        throw new Error("repeated-display count is too small for every source to repeat twice");
    }
    const uniqueInline = new Set(formulas.filter((f) => f.category === "unique-inline").map((f) => f.source));
    const uniqueDisplay = new Set(formulas.filter((f) => f.category === "unique-display").map((f) => f.source));
    if (uniqueInline.size !== composition["unique-inline"] || uniqueDisplay.size !== composition["unique-display"]) {
        throw new Error("unique sections produced duplicate sources");
    }

    const byCategory = (category) => formulas.filter((f) => f.category === category);
    const inlineCount = (category) => byCategory(category).filter((f) => f.kind === "inline").length;

    const parts = [
        `# Latest MathJax benchmark — ${totalFormulas} formulas`,
        "",
        `<!-- Generated by \`npm run bench:generate\` (scripts/generate-benchmarks.mjs); do not edit by hand. -->`,
        `<!-- Composition: ${totalFormulas} formulas = ${summary}. -->`,
        `<!-- Setup: copy benchmark-preamble.tex into the vault and set the plugin's Preamble file setting to its vault path; keep other settings at their defaults. -->`,
        "",
        `## Unique inline (${composition["unique-inline"]})`,
        "",
        SECTION_INTROS["unique-inline"],
        "",
        renderInlineCategory(byCategory("unique-inline")),
        "",
        `## Repeated inline (${composition["repeated-inline"]})`,
        "",
        SECTION_INTROS["repeated-inline"],
        "",
        renderInlineCategory(byCategory("repeated-inline")),
        "",
        `## Unique display (${composition["unique-display"]})`,
        "",
        SECTION_INTROS["unique-display"],
        "",
        renderDisplayCategory(byCategory("unique-display")),
        "",
        `## Repeated display (${composition["repeated-display"]})`,
        "",
        SECTION_INTROS["repeated-display"],
        "",
        renderDisplayCategory(byCategory("repeated-display")),
        "",
        `## Preamble macros (${composition.macro}; ${inlineCount("macro")} inline, ${composition.macro - inlineCount("macro")} display)`,
        "",
        SECTION_INTROS.macro,
        "",
        renderMacroSection(byCategory("macro")),
        "",
        `## Invalid input (${composition.invalid}; ${inlineCount("invalid")} inline, ${composition.invalid - inlineCount("invalid")} display)`,
        "",
        SECTION_INTROS.invalid,
        "",
        renderInvalidSection(byCategory("invalid")),
        "",
        "## Math-free anchor",
        "",
        "This paragraph contains no mathematics. Use it for typing measurements: text entered here must not re-render any formula in the note, so edits in this paragraph isolate editor latency from render work.",
        "",
    ];
    return { totalFormulas, composition, formulas, markdown: parts.join("\n") + "\n" };
}
