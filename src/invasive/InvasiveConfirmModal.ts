import { App, Modal } from "obsidian";
import { getObsidianLanguage, isChineseLanguage } from "../settingsI18n";

const BENEFITS: string[] = [
    "MathJax 4.1.3 in every rendering surface: Reading View, Live Preview, hover previews, " +
        "embeds, PDF export and popout windows.",
    "A single rendering engine — removes the double-MathJax style conflicts that the default " +
        "coexistence mode has to work around.",
    "Your macros and preamble apply in places the coexistence mode cannot reach, such as " +
        "hover previews and embeds.",
];

const RISKS: string[] = [
    "It works by patching two internal functions of Obsidian's built-in MathJax. An Obsidian " +
        "update can break it; the plugin then falls back to the default coexistence mode " +
        "automatically and tells you.",
    "Formulas can lay out slightly differently than Obsidian's built-in MathJax 3 output.",
    "Other plugins that rely on details of the built-in MathJax 3 rendering could behave " +
        "differently while invasive mode is on.",
    "This feature is experimental and off by default. You can turn it off at any time and " +
        "every rendered note returns to the built-in renderer.",
];

const BENEFITS_ZH: string[] = [
    "所有渲染界面都使用 MathJax 4.1.3：阅读视图、实时预览、悬浮预览、嵌入内容、PDF 导出和弹出窗口。",
    "只使用一个渲染引擎，避免默认共存模式需要处理的双 MathJax 样式冲突。",
    "宏和导言也会应用到共存模式无法覆盖的界面，例如悬浮预览和嵌入内容。",
];

const RISKS_ZH: string[] = [
    "此功能会修改 Obsidian 内置 MathJax 的两个内部函数。Obsidian 更新可能使其失效；插件届时会自动回退到默认共存模式并提示你。",
    "公式布局可能与 Obsidian 内置 MathJax 3 的输出略有不同。",
    "启用侵入模式时，依赖内置 MathJax 3 渲染细节的其他插件可能出现不同表现。",
    "此功能仍属实验性且默认关闭。你可以随时关闭，所有已渲染笔记都会恢复使用内置渲染器。",
];

/**
 * Confirmation dialog shown before invasive mode is switched on (settings only; switching off
 * never asks). Resolves once, whether through the buttons, Escape or closing the modal.
 */
export class InvasiveConfirmModal extends Modal {
    private confirmed = false;
    private settled = false;

    constructor(
        app: App,
        private readonly settle: (confirmed: boolean) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const zh = isChineseLanguage(getObsidianLanguage());
        this.titleEl.setText(zh ? "启用侵入模式？" : "Enable invasive mode?");
        this.contentEl.addClass("latest-mathjax-invasive-confirm");

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-intro" }).setText(
            zh
                ? "侵入模式会在所有渲染界面中，用本插件的 MathJax 4 引擎替换 Obsidian 内置 MathJax 渲染器。"
                : "Invasive mode replaces Obsidian's built-in MathJax renderer with this plugin's " +
                    "MathJax 4 engine for every rendering surface.",
        );

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-heading" })
            .setText(zh ? "你将获得" : "What you gain");
        const gains = this.contentEl.createEl("ul", { cls: "latest-mathjax-invasive-list" });
        for (const item of zh ? BENEFITS_ZH : BENEFITS) gains.createEl("li", { text: item });

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-heading" })
            .setText(zh ? "你需要接受" : "What you accept");
        const risks = this.contentEl.createEl("ul", { cls: "latest-mathjax-invasive-list" });
        for (const item of zh ? RISKS_ZH : RISKS) risks.createEl("li", { text: item });

        const buttons = this.contentEl.createDiv({ cls: "latest-mathjax-invasive-buttons" });
        const confirm = buttons.createEl("button", {
            text: zh ? "启用侵入模式" : "Enable invasive mode",
            cls: "mod-cta",
        });
        confirm.addEventListener("click", () => {
            this.confirmed = true;
            this.close();
        });
        const cancel = buttons.createEl("button", {
            text: zh ? "取消" : "Cancel",
            cls: "mod-muted",
        });
        cancel.addEventListener("click", () => this.close());
    }

    onClose(): void {
        if (this.settled) return;
        this.settled = true;
        this.contentEl.empty();
        this.settle(this.confirmed);
    }
}

/**
 * Resolves true only when the user actively confirms; Escape, the close button and Cancel all
 * resolve false. The settings UI keeps the toggle in sync with the answer.
 */
export function confirmInvasiveEnable(app: App): Promise<boolean> {
    return new Promise((resolve) => {
        const modal = new InvasiveConfirmModal(app, (confirmed) => resolve(confirmed));
        modal.open();
    });
}
