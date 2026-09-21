import { ChtmlFontData, type ChtmlVariantData } from "@mathjax/src/js/output/chtml/FontData.js";
import { SvgFontData, type SvgVariantData } from "@mathjax/src/js/output/svg/FontData.js";
import type {
    CharOptions,
    CssFontMap,
    DelimiterMap,
    FontParameters,
    RemapMapMap,
    VariantMap,
} from "@mathjax/src/js/output/common/FontData.js";
import type { OptionList } from "@mathjax/src/js/util/Options.js";
import type { StyleJson } from "@mathjax/src/js/util/StyleJson.js";

export interface PackedVariant {
    chars: Record<number, [number, number, number] | [number, number, number, CharOptions]>;
    letter?: string;
    cacheID?: string;
}

export interface PackedRendererData {
    name: string;
    options: OptionList;
    variants: Record<string, PackedVariant>;
    delimiters: DelimiterMap<never>;
    cssFontMap: CssFontMap;
    cssFontPrefix: string;
    cssFamilyPrefix: string;
    remapChars: RemapMapMap;
    params: FontParameters;
    sizeVariants: string[];
    stretchVariants: string[];
    defaultStyles?: StyleJson;
    defaultFonts?: StyleJson;
    defaultCssFamilyPrefix?: string;
    defaultVariantLetters?: Record<string, string>;
    fontUsage?: StyleJson;
}

export interface DownloadedFontPack {
    schemaVersion: 1;
    id: string;
    name: string;
    fontVersion: string;
    packageName: string;
    chtml: PackedRendererData;
    svg: PackedRendererData;
}

function chtmlVariants(data: PackedRendererData): VariantMap<CharOptions, ChtmlVariantData> {
    return Object.fromEntries(Object.entries(data.variants).map(([name, variant]) => [
        name,
        {
            chars: variant.chars,
            linked: [],
            letter: variant.letter ?? "",
        },
    ]));
}

function svgVariants(
    data: PackedRendererData,
    id: string,
): VariantMap<CharOptions, SvgVariantData> {
    return Object.fromEntries(Object.entries(data.variants).map(([name, variant]) => [
        name,
        {
            chars: variant.chars,
            linked: [],
            cacheID: variant.cacheID ?? `${id}-${name}`,
        },
    ]));
}

function rewriteStyleUrls(styles: StyleJson, from: string, to: string): StyleJson {
    if (!from || from === to) return styles;
    return Object.fromEntries(Object.entries(styles).map(([selector, declarations]) => [
        selector,
        Object.fromEntries(Object.entries(declarations).map(([key, value]) => [
            key,
            typeof value === "string" ? value.split(from).join(to) : value,
        ])),
    ]));
}

export function createPackedChtmlFont(pack: DownloadedFontPack): typeof ChtmlFontData {
    const data = pack.chtml;
    class PackedChtmlFont extends ChtmlFontData {
        static NAME = data.name;
        static OPTIONS = { ...ChtmlFontData.OPTIONS, ...data.options };
        protected static defaultStyles = data.defaultStyles ?? {};
        protected static defaultFonts = data.defaultFonts ?? {};
        protected static defaultCssFamilyPrefix = data.defaultCssFamilyPrefix ?? "";
        protected static defaultVariantLetters = data.defaultVariantLetters ?? {};

        constructor(options: OptionList = {}) {
            super(options);
            this.variant = chtmlVariants(data);
            this.delimiters = data.delimiters;
            this.cssFontMap = data.cssFontMap;
            this.cssFontPrefix = data.cssFontPrefix;
            this.cssFamilyPrefix = data.cssFamilyPrefix;
            this.remapChars = data.remapChars;
            this.params = data.params;
            this.sizeVariants = data.sizeVariants;
            this.stretchVariants = data.stretchVariants;
            this.fontUsage = rewriteStyleUrls(
                data.fontUsage ?? {},
                String(data.options.fontURL ?? ""),
                String(this.options.fontURL ?? ""),
            );
        }
    }
    return PackedChtmlFont;
}

export function createPackedSvgFont(pack: DownloadedFontPack): typeof SvgFontData {
    const data = pack.svg;
    class PackedSvgFont extends SvgFontData {
        static NAME = data.name;
        static OPTIONS = { ...SvgFontData.OPTIONS, ...data.options };

        constructor(options: OptionList = {}) {
            super(options);
            this.variant = svgVariants(data, pack.id);
            this.delimiters = data.delimiters;
            this.cssFontMap = data.cssFontMap;
            this.cssFontPrefix = data.cssFontPrefix;
            this.cssFamilyPrefix = data.cssFamilyPrefix;
            this.remapChars = data.remapChars;
            this.params = data.params;
            this.sizeVariants = data.sizeVariants;
            this.stretchVariants = data.stretchVariants;
        }
    }
    return PackedSvgFont;
}
