// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal Modal stand-in: `open()` drives `onOpen()` and attaches the content element to the
 * document (so `confirmInvasiveEnable` can be driven through real clicks), and `close()`
 * drives `onClose()` like Obsidian does.
 */
vi.mock("obsidian", () => ({
    Modal: class {
        contentEl = document.createElement("div");
        titleEl = document.createElement("div");
        open(): void {
            document.body.appendChild(this.contentEl);
            this.onOpen();
        }
        close(): void {
            this.contentEl.remove();
            this.onClose();
        }
        onOpen(): void {}
        onClose(): void {}
    },
}));

import { InvasiveConfirmModal, confirmInvasiveEnable } from "../src/invasive/InvasiveConfirmModal";

/** jsdom lacks Obsidian's HTMLElement helpers; add just what the dialog uses. */
beforeAll(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.setText = function (this: HTMLElement, text: string) {
        this.textContent = text;
        return this;
    };
    proto.addClass = function (this: HTMLElement, cls: string) {
        this.classList.add(cls);
        return this;
    };
    proto.empty = function (this: HTMLElement) {
        this.replaceChildren();
        return this;
    };
    proto.createDiv = function (this: HTMLElement, opts?: { cls?: string; text?: string }) {
        const div = document.createElement("div");
        if (opts?.cls) div.className = opts.cls;
        if (opts?.text) div.textContent = opts.text;
        this.appendChild(div);
        return div;
    };
    proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
        this: HTMLElement,
        tag: K,
        opts?: { cls?: string; text?: string },
    ) {
        const el = document.createElement(tag);
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text) el.textContent = opts.text;
        this.appendChild(el);
        return el;
    };
});

function openModal(settle: (confirmed: boolean) => void): InvasiveConfirmModal {
    const modal = new InvasiveConfirmModal({} as never, settle);
    modal.open();
    return modal;
}

function dialogButtons(): HTMLButtonElement[] {
    return Array.from(
        document.querySelectorAll<HTMLButtonElement>(
            ".latest-mathjax-invasive-confirm button",
        ),
    );
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("InvasiveConfirmModal", () => {
    it("explains the benefits and the risks before asking", () => {
        openModal(() => undefined);
        expect(document.querySelector(".latest-mathjax-invasive-confirm")).not.toBeNull();
        const text = document.body.textContent ?? "";
        expect(text).toContain("hover previews");
        expect(text).toContain("embeds");
        expect(text).toContain("What you gain");
        expect(text).toContain("What you accept");
        expect(text).toContain("patching two internal functions");
        expect(text).toContain("falls back to the default coexistence mode");
    });

    it("styles the confirm button as the primary action", () => {
        openModal(() => undefined);
        const [confirm, cancel] = dialogButtons();
        expect(confirm.classList.contains("mod-cta")).toBe(true);
        expect(cancel.classList.contains("mod-muted")).toBe(true);
    });

    it("resolves true only through the confirm button", () => {
        const settle = vi.fn();
        openModal(settle);
        dialogButtons()[0].click();
        expect(settle).toHaveBeenCalledWith(true);
    });

    it("resolves false on cancel and on a bare close (Escape path)", () => {
        const settleCancel = vi.fn();
        openModal(settleCancel);
        dialogButtons()[1].click();
        expect(settleCancel).toHaveBeenCalledWith(false);

        const settleClose = vi.fn();
        openModal(settleClose).close();
        expect(settleClose).toHaveBeenCalledWith(false);
    });

    it("settles exactly once even if closed twice", () => {
        const settle = vi.fn();
        const modal = openModal(settle);
        dialogButtons()[0].click();
        modal.close();
        expect(settle).toHaveBeenCalledTimes(1);
        expect(settle).toHaveBeenCalledWith(true);
    });

    it("confirmInvasiveEnable resolves with the user's choice", async () => {
        const confirmed = confirmInvasiveEnable({} as never);
        dialogButtons()[0].click();
        await expect(confirmed).resolves.toBe(true);

        const rejected = confirmInvasiveEnable({} as never);
        dialogButtons()[1].click();
        await expect(rejected).resolves.toBe(false);
    });
});
