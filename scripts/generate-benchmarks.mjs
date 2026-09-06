#!/usr/bin/env node
/**
 * Writes the PERF-01 benchmark notes from the deterministic recipe in
 * benchmarkFixtures.mjs. Run via `npm run bench:generate`; the output is committed, so a
 * diff after regeneration means the recipe (and its tests) changed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBenchmarkNote } from "./benchmarkFixtures.mjs";

const OUTPUT_DIR = join("benchmarks", "notes");
const NOTE_SIZES = [100, 500];

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const total of NOTE_SIZES) {
    const note = buildBenchmarkNote(total);
    const path = join(OUTPUT_DIR, `benchmark-${total}.md`);
    writeFileSync(path, note.markdown, "utf8");
    const sections = Object.entries(note.composition)
        .map(([category, count]) => `${category}=${count}`)
        .join(" ");
    console.log(`wrote ${path} (${total} formulas): ${sections}`);
}
