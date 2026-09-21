// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { MathJaxEngine } from "../src/engine/MathJaxEngine";
import { defaultEngineConfig, defaultFontUrl } from "../src/engine/MathJaxConfig";
import type { DownloadedFontPack } from "../src/fonts/PackedFont";

const packs = Object.fromEntries(["stix2", "fira"].map((id) => [
    id,
    JSON.parse(gunzipSync(readFileSync(
        `font-packs/mathjax-font-${id}-4.1.3.json.gz`,
    )).toString("utf8")) as DownloadedFontPack,
]));

const engines: MathJaxEngine[] = [];

afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
    document.head.replaceChildren();
    document.body.replaceChildren();
});

function downloadedEngine(
    family: "stix2" | "fira",
    renderer: "chtml" | "svg",
): MathJaxEngine {
    const config = defaultEngineConfig();
    config.renderer = renderer;
    config.fontFamily = family;
    config.fontPack = packs[family];
    config.fontURL = defaultFontUrl(family);
    const engine = new MathJaxEngine(config);
    engines.push(engine);
    return engine;
}

describe("downloaded font packs", () => {
    it("hot-switches NewCM -> STIX Two -> Fira with a full engine rebuild", () => {
        const engine = new MathJaxEngine(defaultEngineConfig());
        engines.push(engine);
        expect(engine.render("x+1", { display: false }).outerHTML).toContain("NCM");

        for (const [family, prefix] of [
            ["stix2", "STX"],
            ["fira", "FIRA"],
        ] as const) {
            const config = defaultEngineConfig();
            config.fontFamily = family;
            config.fontPack = packs[family];
            config.fontURL = defaultFontUrl(family);
            expect(engine.updateConfig(config)).toBe(true);
            expect(engine.render("x+1", { display: false }).outerHTML).toContain(prefix);
        }
    });

    it("keeps simultaneous CHTML engines in distinct metric scopes", () => {
        const newcm = new MathJaxEngine(defaultEngineConfig());
        const stix = downloadedEngine("stix2", "chtml");
        engines.push(newcm);
        const newcmNode = newcm.render("x+1", { display: false });
        const stixNode = stix.render("x+1", { display: false });
        const newcmScope = newcmNode.getAttribute("data-latest-mathjax-style");
        const stixScope = stixNode.getAttribute("data-latest-mathjax-style");

        expect(newcmScope).toBeTruthy();
        expect(stixScope).toBeTruthy();
        expect(newcmScope).not.toBe(stixScope);
        expect(newcmNode.querySelector("latest-mjx-c")?.getAttribute(
            "data-latest-mathjax-style",
        )).toBe(newcmScope);
        expect(stixNode.querySelector("latest-mjx-c")?.getAttribute(
            "data-latest-mathjax-style",
        )).toBe(stixScope);
    });

    it.each([
        ["stix2", "STX"],
        ["fira", "FIRA"],
    ] as const)("renders %s CHTML with its own metrics and font faces", (family, prefix) => {
        const engine = downloadedEngine(family, "chtml");
        const target = document.implementation.createHTMLDocument(`${family} render`);
        const rendered = engine.renderInto(
            String.raw`\begin{aligned}\mathbb{R}&\xrightarrow{f}\sum_{i=1}^n x_i\\y&=\frac{a}{b}+\sqrt{x}\end{aligned}`,
            { display: true },
            target,
        );
        const sheet = document.querySelector<HTMLStyleElement>(
            "[id^=latest-mathjax-chtml-styles]",
        );
        const css = sheet?.sheet
            ? Array.from(sheet.sheet.cssRules, (rule) => rule.cssText).join("\n")
            : sheet?.textContent ?? "";
        const rawCss = sheet?.textContent ?? "";
        expect(rendered.outerHTML).toContain(prefix);
        expect(rendered.outerHTML).toContain("latest-mjx-frac");
        expect(css).toContain("latest-mjx-frac");
        expect(css).toContain("latest-mjx-line");
        expect(rawCss).toContain(`mathjax-${family}-font@4.1.3/chtml/woff2`);
        expect(rawCss).not.toContain("mathjax-newcm-font");
    });

    it.each(["stix2", "fira"] as const)(
        "renders %s SVG with embedded paths and no font URL",
        (family) => {
        const engine = downloadedEngine(family, "svg");
        const rendered = engine.render(String.raw`\sqrt{x}+\mathbb{R}\to\infty`, {
            display: true,
        });
        expect(rendered.querySelectorAll("path").length).toBeGreaterThan(0);
        expect(rendered.outerHTML).not.toContain(`mathjax-${family}-font`);
        expect(engine.getFontFaceUrls().every((url) => url.startsWith("data:"))).toBe(true);
        },
    );
});
