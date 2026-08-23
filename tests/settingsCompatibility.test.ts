import { describe, expect, it, vi } from "vitest";
import { invokeModernSettingTabMethod } from "../src/settingsCompatibility";

describe("invokeModernSettingTabMethod", () => {
    it("does nothing when an older Obsidian host lacks the method", () => {
        expect(invokeModernSettingTabMethod({}, "update")).toBe(false);
    });

    it("preserves the setting tab as the method receiver", () => {
        const update = vi.fn(function (this: { refreshed?: boolean }) {
            this.refreshed = true;
        });
        const tab = { update };

        expect(invokeModernSettingTabMethod(tab, "update")).toBe(true);
        expect(update).toHaveBeenCalledOnce();
        expect(tab.refreshed).toBe(true);
    });
});
