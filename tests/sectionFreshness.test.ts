// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { sectionIsCurrent, targetIsCurrent } from "../src/preview/sectionFreshness";

describe("Reading View freshness guards (PERF-03)", () => {
    it("treats a mounted section as current", () => {
        const section = document.createElement("div");
        document.body.appendChild(section);
        expect(sectionIsCurrent(section)).toBe(true);
    });

    it("treats a section detached after an await as stale", () => {
        const section = document.createElement("div");
        document.body.appendChild(section);
        section.remove();
        expect(sectionIsCurrent(section)).toBe(false);
    });

    it("requires both the section and the located target to be mounted", () => {
        const section = document.createElement("div");
        const target = document.createElement("p");
        section.appendChild(target);
        document.body.appendChild(section);
        expect(targetIsCurrent(section, target)).toBe(true);

        // Obsidian re-rendered the paragraph out of the live section during an await.
        const detachedHost = document.createElement("div");
        detachedHost.appendChild(target);
        expect(targetIsCurrent(section, target)).toBe(false);

        // Or the whole section was replaced while the target itself is still somewhere.
        section.remove();
        expect(targetIsCurrent(section, target)).toBe(false);
    });
});
