// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import { MathJaxEngine } from "../src/engine/MathJaxEngine";
import { defaultEngineConfig, defaultFontUrl } from "../src/engine/MathJaxConfig";
import { FONT_PACK_MANIFEST } from "../src/fonts/fontPackManifest.generated";
import type { FontFamily } from "../src/fonts/FontPackManager";
import type { DownloadedFontPack } from "../src/fonts/PackedFont";

type DownloadedFontFamily = Exclude<FontFamily, "newcm">;

const FONT_PREFIXES: Record<DownloadedFontFamily, string> = {
    asana: "ASNA",
    bonum: "GB",
    dejavu: "GDV",
    fira: "FIRA",
    modern: "MM",
    pagella: "GP",
    schola: "GS",
    stix2: "STX",
    termes: "GT",
    tex: "TEX",
};

const fontCases = FONT_PACK_MANIFEST.map((entry) =>
    [entry.id, FONT_PREFIXES[entry.id]] as const);

const gunzipAsync = promisify(gunzip);

async function loadPack(family: DownloadedFontFamily): Promise<DownloadedFontPack> {
    return JSON.parse((await gunzipAsync(await readFile(
        `font-packs/mathjax-font-${family}-4.1.3.json.gz`,
    ))).toString("utf8")) as DownloadedFontPack;
}

const engines: MathJaxEngine[] = [];

afterEach(() => {
    for (const engine of engines.splice(0)) engine.dispose();
    document.head.replaceChildren();
    document.body.replaceChildren();
});

function downloadedEngine(
    family: DownloadedFontFamily,
    renderer: "chtml" | "svg",
    fontPack: DownloadedFontPack,
): MathJaxEngine {
    const config = defaultEngineConfig();
    config.renderer = renderer;
    config.fontFamily = family;
    config.fontPack = fontPack;
    config.fontURL = defaultFontUrl(family);
    const engine = new MathJaxEngine(config);
    engines.push(engine);
    return engine;
}

describe("downloaded font packs", () => {
    it("hot-switches between bundled and representative downloadable fonts", async () => {
        const engine = new MathJaxEngine(defaultEngineConfig());
        engines.push(engine);
        expect(engine.render("x+1", { display: false }).outerHTML).toContain("NCM");

        for (const [family, prefix] of [
            ["stix2", FONT_PREFIXES.stix2],
            ["fira", FONT_PREFIXES.fira],
        ] as const) {
            const config = defaultEngineConfig();
            config.fontFamily = family;
            config.fontPack = await loadPack(family);
            config.fontURL = defaultFontUrl(family);
            expect(engine.updateConfig(config)).toBe(true);
            expect(engine.render("x+1", { display: false }).outerHTML).toContain(prefix);
        }
    });

    it("keeps simultaneous CHTML engines in distinct metric scopes", async () => {
        const newcm = new MathJaxEngine(defaultEngineConfig());
        const stix = downloadedEngine("stix2", "chtml", await loadPack("stix2"));
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

    it.each(fontCases)("renders %s in CHTML and SVG", async (family, prefix) => {
        const fontPack = await loadPack(family);
        const engine = downloadedEngine(family, "chtml", fontPack);
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

        const svgEngine = downloadedEngine(family, "svg", fontPack);
        const svgRendered = svgEngine.render(String.raw`\sqrt{x}+\mathbb{R}\to\infty`, {
            display: true,
        });
        expect(svgRendered.querySelectorAll("path").length).toBeGreaterThan(0);
        expect(svgRendered.outerHTML).not.toContain(`mathjax-${family}-font`);
        expect(svgEngine.getFontFaceUrls().every((url) => url.startsWith("data:"))).toBe(true);
    });
});
