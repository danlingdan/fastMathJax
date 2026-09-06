import { App, Modal } from "obsidian";

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
        this.titleEl.setText("Enable invasive mode?");
        this.contentEl.addClass("latest-mathjax-invasive-confirm");

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-intro" }).setText(
            "Invasive mode replaces Obsidian's built-in MathJax renderer with this plugin's " +
                "MathJax 4 engine for every rendering surface.",
        );

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-heading" })
            .setText("What you gain");
        const gains = this.contentEl.createEl("ul", { cls: "latest-mathjax-invasive-list" });
        for (const item of BENEFITS) gains.createEl("li", { text: item });

        this.contentEl.createDiv({ cls: "latest-mathjax-invasive-heading" })
            .setText("What you accept");
        const risks = this.contentEl.createEl("ul", { cls: "latest-mathjax-invasive-list" });
        for (const item of RISKS) risks.createEl("li", { text: item });

        const buttons = this.contentEl.createDiv({ cls: "latest-mathjax-invasive-buttons" });
        const confirm = buttons.createEl("button", {
            text: "Enable invasive mode",
            cls: "mod-cta",
        });
        confirm.addEventListener("click", () => {
            this.confirmed = true;
            this.close();
        });
        const cancel = buttons.createEl("button", { text: "Cancel", cls: "mod-muted" });
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
