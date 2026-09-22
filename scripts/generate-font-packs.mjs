import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT_DIR = join(ROOT, "font-packs");
const GENERATED_MANIFEST = join(ROOT, "src", "fonts", "fontPackManifest.generated.ts");
const FONT_VERSION = "4.1.3";
const SCHEMA_VERSION = 1;

const FONTS = [
    {
        id: "asana",
        name: "Asana Math",
        packageName: "@mathjax/mathjax-asana-font",
        exportName: "MathJaxAsanaFont",
    },
    {
        id: "bonum",
        name: "Gyre Bonum",
        packageName: "@mathjax/mathjax-bonum-font",
        exportName: "MathJaxBonumFont",
    },
    {
        id: "dejavu",
        name: "Gyre DejaVu",
        packageName: "@mathjax/mathjax-dejavu-font",
        exportName: "MathJaxDejavuFont",
    },
    {
        id: "fira",
        name: "Fira Math",
        packageName: "@mathjax/mathjax-fira-font",
        exportName: "MathJaxFiraFont",
    },
    {
        id: "modern",
        name: "Latin Modern",
        packageName: "@mathjax/mathjax-modern-font",
        exportName: "MathJaxModernFont",
    },
    {
        id: "pagella",
        name: "Gyre Pagella",
        packageName: "@mathjax/mathjax-pagella-font",
        exportName: "MathJaxPagellaFont",
    },
    {
        id: "schola",
        name: "Gyre Schola",
        packageName: "@mathjax/mathjax-schola-font",
        exportName: "MathJaxScholaFont",
    },
    {
        id: "stix2",
        name: "STIX Two",
        packageName: "@mathjax/mathjax-stix2-font",
        exportName: "MathJaxStix2Font",
    },
    {
        id: "termes",
        name: "Gyre Termes",
        packageName: "@mathjax/mathjax-termes-font",
        exportName: "MathJaxTermesFont",
    },
    {
        id: "tex",
        name: "MathJax TeX",
        packageName: "@mathjax/mathjax-tex-font",
        exportName: "MathJaxTexFont",
    },
];

async function importDynamicModules(packageName, renderer) {
    const entry = fileURLToPath(import.meta.resolve(`${packageName}/js/${renderer}.js`));
    const directory = join(dirname(entry), renderer, "dynamic");
    const files = (await readdir(directory).catch((error) => {
        if (error?.code === "ENOENT") return [];
        throw error;
    }))
        .filter((name) => name.endsWith(".js"))
        .sort();
    await Promise.all(files.map((name) => import(new URL(`./${renderer}/dynamic/${name}`, `file:///${entry.replaceAll("\\", "/")}`))));
}

function plainVariant(variant) {
    const chars = {};
    for (const key in variant.chars) chars[key] = variant.chars[key];
    return {
        chars,
        ...(variant.letter !== undefined ? { letter: variant.letter } : {}),
        ...(variant.cacheID !== undefined ? { cacheID: variant.cacheID } : {}),
    };
}

function serializeInstance(FontClass, renderer) {
    const font = new FontClass();
    for (const dynamic of Object.values(FontClass.dynamicFiles ?? {})) dynamic.setup(font);
    for (const extension of FontClass.dynamicExtensions?.values() ?? []) {
        for (const dynamic of Object.values(extension.files ?? {})) dynamic.setup(font);
    }
    return {
        name: FontClass.NAME,
        options: FontClass.OPTIONS,
        variants: Object.fromEntries(
            Object.entries(font.variant).map(([name, variant]) => [name, plainVariant(variant)]),
        ),
        delimiters: font.delimiters,
        cssFontMap: font.cssFontMap,
        cssFontPrefix: font.cssFontPrefix,
        cssFamilyPrefix: font.cssFamilyPrefix,
        remapChars: font.remapChars,
        params: font.params,
        sizeVariants: font.sizeVariants,
        stretchVariants: font.stretchVariants,
        ...(renderer === "chtml"
            ? {
                defaultStyles: FontClass.defaultStyles,
                defaultFonts: FontClass.defaultFonts,
                defaultCssFamilyPrefix: FontClass.defaultCssFamilyPrefix,
                defaultVariantLetters: FontClass.defaultVariantLetters,
                fontUsage: font.fontUsage,
            }
            : {}),
    };
}

async function buildPack(font) {
    await Promise.all([
        importDynamicModules(font.packageName, "chtml"),
        importDynamicModules(font.packageName, "svg"),
    ]);
    const chtmlModule = await import(`${font.packageName}/js/chtml.js`);
    const svgModule = await import(`${font.packageName}/js/svg.js`);
    const pack = {
        schemaVersion: SCHEMA_VERSION,
        id: font.id,
        name: font.name,
        fontVersion: FONT_VERSION,
        packageName: font.packageName,
        chtml: serializeInstance(chtmlModule[font.exportName], "chtml"),
        svg: serializeInstance(svgModule[font.exportName], "svg"),
    };
    const json = Buffer.from(JSON.stringify(pack));
    const compressed = gzipSync(json, { level: 9, mtime: 0 });
    // zlib writes a platform-specific gzip OS byte (Windows vs Linux), which used to make the
    // committed manifest disagree with release assets despite identical expanded data.
    compressed[9] = 255;
    const fileName = `mathjax-font-${font.id}-${FONT_VERSION}.json.gz`;
    await writeFile(join(OUTPUT_DIR, fileName), compressed);
    return {
        id: font.id,
        name: font.name,
        fontVersion: FONT_VERSION,
        fileName,
        sha256: createHash("sha256").update(compressed).digest("hex"),
        compressedBytes: compressed.byteLength,
        uncompressedBytes: json.byteLength,
    };
}

await mkdir(OUTPUT_DIR, { recursive: true });
const entries = [];
for (const font of FONTS) entries.push(await buildPack(font));

const generated = `// Generated by scripts/generate-font-packs.mjs. Do not edit by hand.\n` +
    `export const FONT_PACK_MANIFEST = ${JSON.stringify(entries, null, 4)} as const;\n`;
await writeFile(GENERATED_MANIFEST, generated);
await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(entries, null, 2)}\n`);
console.log(JSON.stringify(entries, null, 2));
