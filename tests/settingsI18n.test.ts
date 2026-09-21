// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
    isChineseLanguage,
    localizeSettingDefinitions,
    localizeSettingsElement,
    translateSettingText,
} from "../src/settingsI18n";

describe("settings localization", () => {
    it("recognizes every Chinese Obsidian locale while preserving English", () => {
        expect(isChineseLanguage("zh-CN")).toBe(true);
        expect(isChineseLanguage("zh-TW")).toBe(true);
        expect(isChineseLanguage("en")).toBe(false);
        expect(translateSettingText("Math font", "zh-CN")).toBe("数学字体");
        expect(translateSettingText("Math font", "en")).toBe("Math font");
    });

    it("localizes declarative settings, dropdown options and custom renderers", () => {
        const render = vi.fn((setting: { settingEl: HTMLElement }) => {
            setting.settingEl.textContent = "Clear cache";
        });
        const localized = localizeSettingDefinitions([{
            type: "group",
            heading: "Engine",
            items: [{
                name: "Font source",
                desc: "Restore the bundled CommonHTML font CDN default.",
                control: {
                    type: "dropdown",
                    key: "fontSource",
                    options: { cdn: "CDN (default)", local: "Local cache (offline)" },
                },
            }, {
                name: "Cache statistics",
                render,
            }],
        }], "zh-CN");

        const group = localized[0] as typeof localized[0] & {
            heading: string;
            items: Array<{
                name: string;
                desc?: string;
                control?: { options?: Record<string, string> };
                render?: (setting: { settingEl: HTMLElement }) => void;
            }>;
        };
        expect(group.heading).toBe("引擎");
        expect(group.items[0].name).toBe("字体来源");
        expect(group.items[0].control?.options?.local).toBe("本地缓存（离线）");

        const settingEl = document.createElement("div");
        group.items[1].render?.({ settingEl });
        expect(render).toHaveBeenCalledOnce();
        expect(settingEl.textContent).toBe("清空缓存");
    });

    it("localizes legacy settings DOM text and tooltips", () => {
        const root = document.createElement("div");
        root.innerHTML = '<span>Math font</span><button aria-label="Reset to default">Clear cache</button>';
        localizeSettingsElement(root, "zh-CN");
        expect(root.textContent).toBe("数学字体清空缓存");
        expect(root.querySelector("button")?.getAttribute("aria-label")).toBe("恢复默认值");
    });
});
