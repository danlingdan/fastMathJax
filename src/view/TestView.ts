import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type LatestMathJaxPlugin from "../main";
import { MathRenderError } from "../engine/MathJaxEngine";

export const TEST_VIEW_TYPE = "latest-mathjax-test";

interface Sample {
    label: string;
    tex: string;
    display: boolean;
    /** Explains what the sample proves, shown as a tooltip. */
    note: string;
}

/** Mirrors the test matrix in section 20 of the development plan. */
const SAMPLES: Sample[] = [
    {
        label: "Basic",
        tex: "x^2 + \\frac{a}{b} + \\sqrt{x}",
        display: true,
        note: "Superscripts, fractions, radicals",
    },
    {
        label: "Einstein",
        tex: "E = mc^2",
        display: true,
        note: "Smoke test",
    },
    {
        label: "Integral",
        tex: "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}",
        display: true,
        note: "Large operators, limits",
    },
    {
        label: "AMS aligned",
        tex: "\\begin{aligned}\na &= b + c \\\\\nd &= e + f\n\\end{aligned}",
        display: true,
        note: "Requires the AMS package",
    },
    {
        label: "Matrix",
        tex: "A =\n\\begin{bmatrix}\n1 & 2 \\\\\n3 & 4\n\\end{bmatrix}",
        display: true,
        note: "Requires the AMS package",
    },
    {
        label: "Chemistry",
        tex: "\\ce{H2O}\\quad\\ce{CO2 + C -> 2 CO}",
        display: true,
        note: "Requires the mhchem package",
    },
    {
        label: "MathJax 4 only",
        tex: "\\oiint_S \\vec{F}\\cdot d\\vec{S}",
        display: true,
        note: "\\oiint exists in MathJax 4 but not in Obsidian's MathJax 3 — the clearest proof the bundled engine is in use",
    },
    {
        label: "Long equation",
        tex:
            "a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 + a_9 + a_{10} + a_{11} + " +
            "a_{12} + a_{13} + a_{14} + a_{15} + a_{16} + a_{17} + a_{18} + a_{19} + a_{20}",
        display: true,
        note: "Overflow behaviour for very wide math",
    },
    {
        label: "Inline",
        tex: "\\alpha\\beta\\gamma",
        display: false,
        note: "Inline metrics and baseline alignment",
    },
    {
        label: "Invalid",
        tex: "\\frac{",
        display: true,
        note: "Error path and fallback",
    },
];

/**
 * A sandbox for the bundled engine.
 *
 * Exists so the engine can be validated before it is wired into Obsidian's own math rendering — no
 * post processor, no editor extension, nothing that could be blamed on an adapter.
 */
export class MathJaxTestView extends ItemView {
    private input: HTMLTextAreaElement | null = null;
    private displayToggle = true;
    private resultEl: HTMLElement | null = null;
    private statusEl: HTMLElement | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private plugin: LatestMathJaxPlugin,
    ) {
        super(leaf);
    }

    getViewType(): string {
        return TEST_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Latest MathJax render test";
    }

    getIcon(): string {
        return "sigma";
    }

    async onOpen(): Promise<void> {
        const root = this.contentEl;
        root.empty();
        root.addClass("latest-mathjax-test-view");

        this.buildHeader(root);
        this.buildSamples(root);
        this.buildInput(root);
        this.buildResult(root);

        // Something on screen straight away is more useful than an empty panel.
        this.loadSample(SAMPLES[0]);
        this.renderNow();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    // ------------------------------------------------------------------ header

    private buildHeader(root: HTMLElement): void {
        const header = root.createDiv({ cls: "latest-mathjax-test-header" });
        header.createEl("h3", { text: "Latest MathJax render test" });

        const report = this.plugin.versionReport;
        const meta = header.createDiv({ cls: "latest-mathjax-test-meta" });
        meta.createSpan({ text: `Plugin MathJax ${this.plugin.engine.version}` });
        meta.createSpan({
            text: `Built-in MathJax ${report?.builtIn ?? "unknown"}`,
        });
        meta.createSpan({
            text: `Renderer ${this.plugin.settings.renderer.toUpperCase()}`,
        });

        if (report?.builtInIsNewer) {
            const warn = header.createDiv({ cls: "latest-mathjax-warning" });
            setIcon(warn.createSpan(), "alert-triangle");
            warn.createSpan({
                text: "Obsidian's built-in MathJax is newer than the bundled version.",
            });
        }
    }

    // ----------------------------------------------------------------- samples

    private buildSamples(root: HTMLElement): void {
        const section = root.createDiv({ cls: "latest-mathjax-test-samples" });
        section.createEl("h4", { text: "Test matrix" });
        const buttons = section.createDiv({ cls: "latest-mathjax-test-sample-buttons" });

        for (const sample of SAMPLES) {
            const button = buttons.createEl("button", {
                text: sample.label,
                attr: { title: sample.note },
            });
            button.addEventListener("click", () => {
                this.loadSample(sample);
                this.renderNow();
            });
        }

        const runAll = section.createEl("button", {
            text: "Run all",
            cls: "mod-cta latest-mathjax-run-all",
        });
        runAll.addEventListener("click", () => this.runAll());
    }

    private loadSample(sample: Sample): void {
        if (!this.input) return;
        this.input.value = sample.tex;
        this.displayToggle = sample.display;
        this.displayToggleEl?.toggleClass("is-enabled", sample.display);
        if (this.displayCheckbox) this.displayCheckbox.checked = sample.display;
    }

    // ------------------------------------------------------------------- input

    private displayToggleEl: HTMLElement | null = null;
    private displayCheckbox: HTMLInputElement | null = null;

    private buildInput(root: HTMLElement): void {
        const section = root.createDiv({ cls: "latest-mathjax-test-input" });
        section.createEl("h4", { text: "LaTeX input" });

        this.input = section.createEl("textarea", {
            cls: "latest-mathjax-test-textarea",
            attr: { rows: "6", spellcheck: "false", placeholder: "E = mc^2" },
        });

        // Ctrl/Cmd+Enter renders; plain Enter stays a newline so multi-line environments are typable.
        this.input.addEventListener("keydown", (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                this.renderNow();
            }
        });

        const controls = section.createDiv({ cls: "latest-mathjax-test-controls" });

        const label = controls.createEl("label", { cls: "latest-mathjax-test-checkbox" });
        this.displayCheckbox = label.createEl("input", { attr: { type: "checkbox" } });
        this.displayCheckbox.checked = this.displayToggle;
        this.displayCheckbox.addEventListener("change", () => {
            this.displayToggle = this.displayCheckbox?.checked ?? true;
        });
        label.createSpan({ text: "Display mode" });

        const renderButton = controls.createEl("button", {
            text: "Render",
            cls: "mod-cta",
        });
        renderButton.addEventListener("click", () => this.renderNow());

        const compareButton = controls.createEl("button", { text: "Compare with built-in" });
        compareButton.setAttribute(
            "title",
            "Render the same input with Obsidian's MathJax for a side-by-side check",
        );
        compareButton.addEventListener("click", () => void this.renderComparison());

        controls.createSpan({
            cls: "latest-mathjax-test-hint",
            text: "Ctrl/Cmd + Enter to render",
        });
    }

    // ------------------------------------------------------------------ result

    private buildResult(root: HTMLElement): void {
        const section = root.createDiv({ cls: "latest-mathjax-test-result" });
        section.createEl("h4", { text: "Result" });
        this.statusEl = section.createDiv({ cls: "latest-mathjax-test-status" });
        this.resultEl = section.createDiv({ cls: "latest-mathjax-test-output" });
    }

    private setStatus(text: string, kind: "ok" | "error" | "info" = "info"): void {
        if (!this.statusEl) return;
        this.statusEl.empty();
        this.statusEl.removeClasses(["is-error", "is-ok"]);
        if (kind === "error") this.statusEl.addClass("is-error");
        if (kind === "ok") this.statusEl.addClass("is-ok");
        this.statusEl.setText(text);
    }

    private renderNow(): void {
        const tex = this.input?.value ?? "";
        if (!this.resultEl) return;
        this.resultEl.empty();

        if (!tex.trim()) {
            this.setStatus("Nothing to render.");
            return;
        }

        const start = performance.now();
        try {
            const node = this.plugin.engine.render(tex, { display: this.displayToggle });
            const ms = performance.now() - start;
            const wrapper = this.resultEl.createDiv({
                cls: this.displayToggle
                    ? "latest-mathjax-block"
                    : "latest-mathjax-inline",
            });
            wrapper.appendChild(node);
            const stats = this.plugin.engine.stats.cache;
            this.setStatus(
                `Rendered in ${ms.toFixed(1)}ms · cache ${stats.size}/${stats.maxSize} · ` +
                    `${stats.hits} hits / ${stats.misses} misses`,
                "ok",
            );
        } catch (err) {
            const message =
                err instanceof MathRenderError ? err.message : String(err);
            this.setStatus(`Render failed: ${message}`, "error");
            this.resultEl.createEl("pre", {
                cls: "latest-mathjax-test-raw",
                text: tex,
            });
        }
    }

    /**
     * Renders the same source with both engines.
     *
     * This is the acceptance check for "MathJax 4 and Obsidian's MathJax coexist without
     * interfering" — step 6 of the plan's Stage 0/1 exit criteria.
     */
    private async renderComparison(): Promise<void> {
        const tex = this.input?.value ?? "";
        if (!this.resultEl || !tex.trim()) return;
        this.resultEl.empty();

        const table = this.resultEl.createDiv({ cls: "latest-mathjax-compare" });

        const ours = table.createDiv({ cls: "latest-mathjax-compare-cell" });
        ours.createDiv({
            cls: "latest-mathjax-compare-title",
            text: `Plugin — MathJax ${this.plugin.engine.version}`,
        });
        try {
            ours.createDiv().appendChild(
                this.plugin.engine.render(tex, { display: this.displayToggle }),
            );
        } catch (err) {
            ours.createEl("pre", {
                cls: "latest-mathjax-test-raw",
                text: err instanceof Error ? err.message : String(err),
            });
        }

        const theirs = table.createDiv({ cls: "latest-mathjax-compare-cell" });
        const report = this.plugin.versionReport;
        theirs.createDiv({
            cls: "latest-mathjax-compare-title",
            text: `Obsidian — MathJax ${report?.builtIn ?? "?"}`,
        });
        try {
            const node = await this.plugin.renderWithBuiltIn(tex, this.displayToggle);
            theirs.createDiv().appendChild(node);
        } catch (err) {
            theirs.createEl("pre", {
                cls: "latest-mathjax-test-raw",
                text: err instanceof Error ? err.message : String(err),
            });
        }

        this.setStatus(
            "Side-by-side render complete. Both engines ran in the same document without " +
                "interfering.",
            "ok",
        );
    }

    /** Renders every sample so regressions across the matrix are visible at a glance. */
    private runAll(): void {
        if (!this.resultEl) return;
        this.resultEl.empty();
        this.setStatus("Running the full test matrix…");

        let failures = 0;
        const start = performance.now();

        for (const sample of SAMPLES) {
            const row = this.resultEl.createDiv({ cls: "latest-mathjax-test-row" });
            const head = row.createDiv({ cls: "latest-mathjax-test-row-head" });
            head.createSpan({ text: sample.label, cls: "latest-mathjax-test-row-label" });
            head.createSpan({ text: sample.note, cls: "latest-mathjax-test-row-note" });

            const body = row.createDiv({ cls: "latest-mathjax-test-row-body" });
            try {
                const node = this.plugin.engine.render(sample.tex, {
                    display: sample.display,
                });
                body.appendChild(node);
                row.addClass("is-ok");
            } catch (err) {
                failures++;
                // The "Invalid" sample is meant to fail — flag it as expected rather than broken.
                const expected = sample.label === "Invalid";
                row.addClass(expected ? "is-expected-failure" : "is-failure");
                body.createEl("pre", {
                    cls: "latest-mathjax-test-raw",
                    text: `${expected ? "expected failure: " : ""}${
                        err instanceof Error ? err.message : String(err)
                    }`,
                });
            }
        }

        const ms = performance.now() - start;
        const unexpected = failures - (failures > 0 ? 1 : 0);
        this.setStatus(
            `${SAMPLES.length} samples in ${ms.toFixed(1)}ms · ` +
                `${failures} failure(s), ${unexpected} unexpected`,
            unexpected > 0 ? "error" : "ok",
        );
    }
}
