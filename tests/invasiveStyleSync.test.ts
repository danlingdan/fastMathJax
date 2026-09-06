// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createInvasiveStyleSyncProcessor } from "../src/invasive/invasiveStyleSync";

function pluginStub(invasiveActive: boolean) {
    return {
        invasiveActive,
        syncInvasiveStyles: vi.fn(),
    };
}

describe("invasive style-sync post-processor", () => {
    it("does nothing while invasive mode is off", () => {
        const plugin = pluginStub(false);
        const processor = createInvasiveStyleSyncProcessor(plugin as never);
        processor(document.createElement("div"), {} as never);
        expect(plugin.syncInvasiveStyles).not.toHaveBeenCalled();
    });

    it("does nothing for host-document renders (the engine flush already covers them)", () => {
        const plugin = pluginStub(true);
        const processor = createInvasiveStyleSyncProcessor(plugin as never);
        processor(document.createElement("div"), {} as never);
        expect(plugin.syncInvasiveStyles).not.toHaveBeenCalled();
    });

    it("syncs the engine stylesheet into popout documents", () => {
        const plugin = pluginStub(true);
        const processor = createInvasiveStyleSyncProcessor(plugin as never);
        const popout = document.implementation.createHTMLDocument("popout");
        processor(popout.createElement("div"), {} as never);
        expect(plugin.syncInvasiveStyles).toHaveBeenCalledWith(popout);
    });
});
