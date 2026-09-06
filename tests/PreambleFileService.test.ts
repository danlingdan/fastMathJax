import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    PREAMBLE_RELOAD_DEBOUNCE_MS,
    PreambleFileService,
    type PreambleLoadResult,
} from "../src/preamble/PreambleFileService";
import type { PreambleProblem } from "../src/preamble/preambleModel";

interface Harness {
    service: PreambleFileService;
    rawPath: string;
    content: string;
    problem: PreambleProblem | null;
    appliedContentChanges: number;
    refreshes: number;
    files: Map<string, string>;
    failReadFor: string | null;
    lastResult: () => PreambleLoadResult;
}

function createHarness(rawPath = "macros/preamble.tex"): Harness {
    const state: Harness = {
        service: null as unknown as PreambleFileService,
        rawPath,
        content: "",
        problem: null,
        appliedContentChanges: 0,
        refreshes: 0,
        files: new Map([["macros/preamble.tex", "\\newcommand{\\A}{a}"]]),
        failReadFor: null,
        lastResult: () => ({ content: "", problem: null, changed: false }),
    };
    state.service = new PreambleFileService({
        getRawPath: () => state.rawPath,
        readFile: async (path) => {
            if (state.failReadFor === path) throw new Error("disk on fire");
            const text = state.files.get(path);
            if (text === undefined) throw new Error("ENOENT");
            return text;
        },
        statPath: (path) => {
            if (path === "macros") return "folder";
            return state.files.has(path) ? "file" : "missing";
        },
        applyResult: (content, problem) => {
            state.lastResult = () => ({ content, problem, changed: state.content !== content });
            const changed = state.content !== content;
            state.content = content;
            state.problem = problem;
            if (changed) state.appliedContentChanges++;
            return changed;
        },
        onContentApplied: () => {
            state.refreshes++;
        },
        debounceMs: PREAMBLE_RELOAD_DEBOUNCE_MS,
    });
    return state;
}

describe("PreambleFileService", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("loads the configured file and reports no problem", async () => {
        const state = createHarness();
        const result = await state.service.reload();
        expect(result).toMatchObject({
            content: "\\newcommand{\\A}{a}",
            problem: null,
            changed: true,
        });
        expect(state.refreshes).toBe(1);
    });

    it("reports a visible problem for missing files without throwing", async () => {
        const state = createHarness("macros/absent.tex");
        const result = await state.service.reload();
        expect(result.content).toBe("");
        expect(result.problem?.message).toContain("not found");
        // Problem-only outcome: the engine input is unchanged, so nothing re-renders.
        expect(state.refreshes).toBe(0);
    });

    it("distinguishes folders from missing files", async () => {
        const state = createHarness("macros");
        const result = await state.service.reload();
        expect(result.problem?.message).toContain("folder");
    });

    it("rejects absolute paths without reading anything", async () => {
        const state = createHarness("C:\\vault\\preamble.tex");
        const result = await state.service.reload();
        expect(result.problem?.message).toContain("Absolute paths");
        expect(state.content).toBe("");
    });

    it("turns read failures into a diagnostic and keeps the previous content out", async () => {
        const state = createHarness();
        state.failReadFor = "macros/preamble.tex";
        const result = await state.service.reload();
        expect(result.problem?.message).toContain("disk on fire");
        expect(state.content).toBe("");
    });

    it("clears the problem when the configured path is removed", async () => {
        const state = createHarness("macros/absent.tex");
        await state.service.reload();
        expect(state.problem).not.toBeNull();
        state.rawPath = "";
        await state.service.reload();
        expect(state.problem).toBeNull();
        expect(state.content).toBe("");
    });

    it("collapses a vault edit burst into exactly one reload", async () => {
        const state = createHarness();
        await state.service.reload();

        const reloadSpy = vi.spyOn(state.service, "reload");
        state.files.set("macros/preamble.tex", "\\newcommand{\\A}{b}");
        state.service.handleVaultEvent("macros/preamble.tex", "modify");
        state.service.handleVaultEvent("macros/preamble.tex", "modify");
        state.service.handleVaultEvent("macros/preamble.tex", "modify");
        expect(reloadSpy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(PREAMBLE_RELOAD_DEBOUNCE_MS + 1);
        expect(reloadSpy).toHaveBeenCalledTimes(1);
        expect(state.content).toBe("\\newcommand{\\A}{b}");
    });

    it("ignores events for unrelated paths", async () => {
        const state = createHarness();
        await state.service.reload();
        const reloadSpy = vi.spyOn(state.service, "reload");

        state.service.handleVaultEvent("macros/other.tex", "modify");
        state.service.handleVaultEvent("notes/preamble.tex", "delete");
        await vi.advanceTimersByTimeAsync(PREAMBLE_RELOAD_DEBOUNCE_MS + 1);
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("treats a rename onto the configured path as a reload trigger", async () => {
        const state = createHarness("macros/renamed.tex");
        state.files.set("macros/renamed.tex", "\\newcommand{\\A}{a}");
        state.service.handleVaultEvent("macros/renamed.tex", "rename");
        await vi.advanceTimersByTimeAsync(PREAMBLE_RELOAD_DEBOUNCE_MS + 1);
        expect(state.content).toBe("\\newcommand{\\A}{a}");
        expect(state.problem).toBeNull();
    });

    it("drops the file contribution when the configured file is deleted", async () => {
        const state = createHarness();
        await state.service.reload();
        expect(state.content).toBe("\\newcommand{\\A}{a}");

        state.files.delete("macros/preamble.tex");
        state.service.handleVaultEvent("macros/preamble.tex", "delete");
        await vi.advanceTimersByTimeAsync(PREAMBLE_RELOAD_DEBOUNCE_MS + 1);
        expect(state.content).toBe("");
        expect(state.problem?.message).toContain("not found");
    });

    it("does not reload after dispose", async () => {
        const state = createHarness();
        await state.service.reload();
        const reloadSpy = vi.spyOn(state.service, "reload");

        state.service.handleVaultEvent("macros/preamble.tex", "modify");
        state.service.dispose();
        await vi.advanceTimersByTimeAsync(PREAMBLE_RELOAD_DEBOUNCE_MS + 1);
        expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("reloadIfPathChanged skips the read while the configured path is unchanged", async () => {
        const state = createHarness();
        await state.service.reload();
        const reloadSpy = vi.spyOn(state.service, "reload");

        const outcome = await state.service.reloadIfPathChanged();
        expect(outcome).toBeNull();
        expect(reloadSpy).not.toHaveBeenCalled();
        expect(state.appliedContentChanges).toBe(1);
    });

    it("reloadIfPathChanged reloads when the configured path changed", async () => {
        const state = createHarness("macros/preamble.tex");
        await state.service.reload();
        expect(state.content).toBe("\\newcommand{\\A}{a}");

        state.files.set("macros/other.tex", "\\newcommand{\\B}{b}");
        state.rawPath = "macros/other.tex";
        const outcome = await state.service.reloadIfPathChanged();

        expect(outcome).toMatchObject({ content: "\\newcommand{\\B}{b}", changed: true });
        expect(state.content).toBe("\\newcommand{\\B}{b}");
        expect(state.refreshes).toBe(2);
    });

    it("reloadIfPathChanged reloads before any load has completed", async () => {
        const state = createHarness();
        const outcome = await state.service.reloadIfPathChanged();
        expect(outcome).not.toBeNull();
        expect(state.content).toBe("\\newcommand{\\A}{a}");
    });

    it("reloadIfPathChanged stays skipped after a failed read of the same path", async () => {
        const state = createHarness();
        state.failReadFor = "macros/preamble.tex";
        await state.service.reload();
        expect(state.problem?.message).toContain("disk on fire");

        state.failReadFor = null;
        // The applied state (empty content + problem) already belongs to this path, so a settings
        // save must not re-read it; healing stays with vault events and the reload command.
        const outcome = await state.service.reloadIfPathChanged();
        expect(outcome).toBeNull();
    });
});
