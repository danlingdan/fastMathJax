/**
 * TeX package registry.
 *
 * Every package we offer is imported statically so that it self-registers with MathJax's
 * ConfigurationHandler at bundle load time. This is a deliberate departure from MathJax's usual
 * component/lazy-loading model: dynamic `import()` of a URL cannot work inside a bundled Obsidian
 * plugin, so `autoload` and `require` are not offered in v0.0.1. See
 * docs/obsidian-mathjax-research.md section 6.1.
 *
 * Consequence: enabling/disabling a package only changes the `packages` array handed to the TeX
 * input jax; it does not change what is in the bundle.
 */

// Side-effect imports — order irrelevant, each registers itself by name.
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js";
import "@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "@mathjax/src/js/input/tex/braket/BraketConfiguration.js";
import "@mathjax/src/js/input/tex/cancel/CancelConfiguration.js";
import "@mathjax/src/js/input/tex/color/ColorConfiguration.js";
import "@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js";
import "@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js";
import "@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js";
import "@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js";
import "@mathjax/src/js/input/tex/noerrors/NoErrorsConfiguration.js";
import "@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js";

export interface TexPackageInfo {
    /** Name MathJax knows it by — must match `Configuration.create(<name>)`. */
    id: string;
    label: string;
    description: string;
    /** Cannot be turned off in settings. */
    required?: boolean;
    /** Enabled in a fresh install. */
    defaultEnabled: boolean;
}

export const TEX_PACKAGES: TexPackageInfo[] = [
    {
        id: "base",
        label: "Base",
        description: "Core TeX/LaTeX commands. Always active.",
        required: true,
        defaultEnabled: true,
    },
    {
        id: "ams",
        label: "AMS",
        description:
            "amsmath / amssymb: align, gather, cases, extra symbols and operators.",
        defaultEnabled: true,
    },
    {
        id: "newcommand",
        label: "NewCommand",
        description:
            "\\newcommand, \\renewcommand, \\def, \\let, \\DeclareMathOperator.",
        defaultEnabled: true,
    },
    {
        id: "configmacros",
        label: "ConfigMacros",
        description:
            "Required for macros defined in settings and for the global preamble.",
        required: true,
        defaultEnabled: true,
    },
    {
        id: "mhchem",
        label: "mhchem",
        description: "Chemical equations: \\ce{H2O}, \\pu{123 kJ//mol}.",
        defaultEnabled: true,
    },
    {
        id: "noerrors",
        label: "NoErrors",
        description:
            "Show the original LaTeX instead of a red error message when parsing fails.",
        defaultEnabled: false,
    },
    {
        id: "noundefined",
        label: "NoUndefined",
        description:
            "Render unknown macros as their literal name instead of raising an error.",
        defaultEnabled: false,
    },
    {
        id: "boldsymbol",
        label: "Boldsymbol",
        description: "\\boldsymbol for bold math italics.",
        defaultEnabled: false,
    },
    {
        id: "braket",
        label: "Braket",
        description: "Dirac notation: \\bra, \\ket, \\braket.",
        defaultEnabled: false,
    },
    {
        id: "cancel",
        label: "Cancel",
        description: "\\cancel, \\bcancel, \\xcancel, \\cancelto.",
        defaultEnabled: false,
    },
    {
        id: "color",
        label: "Color",
        description: "LaTeX2e color: \\color, \\textcolor, \\colorbox, \\fcolorbox.",
        defaultEnabled: false,
    },
    {
        id: "mathtools",
        label: "Mathtools",
        description:
            "mathtools extensions to amsmath: \\coloneqq, \\DeclarePairedDelimiter, matrix* environments.",
        defaultEnabled: false,
    },
    {
        id: "physics",
        label: "Physics",
        description:
            "physics package: \\dv, \\pdv, \\abs, \\norm, \\eval, bra-ket, matrix helpers.",
        defaultEnabled: false,
    },
    {
        id: "textmacros",
        label: "TextMacros",
        description: "Full text-mode markup inside \\text{} and friends.",
        defaultEnabled: false,
    },
    {
        id: "unicode",
        label: "Unicode",
        description: "\\unicode{x1D538} to reach arbitrary code points.",
        defaultEnabled: false,
    },
];

/** Packages enabled in a fresh install. */
export function defaultEnabledPackages(): string[] {
    return TEX_PACKAGES.filter((p) => p.defaultEnabled).map((p) => p.id);
}

/**
 * Normalises a stored package list: drops unknown ids (e.g. from a future version whose settings
 * were rolled back) and force-adds required ones.
 */
export function resolvePackages(enabled: string[]): string[] {
    const known = new Set(TEX_PACKAGES.map((p) => p.id));
    const result = new Set(enabled.filter((id) => known.has(id)));
    for (const p of TEX_PACKAGES) {
        if (p.required) result.add(p.id);
    }
    // 'base' must come first; MathJax tolerates any order, but keeping it deterministic makes the
    // config hash stable across sessions.
    return [...result].sort((a, b) =>
        a === "base" ? -1 : b === "base" ? 1 : a.localeCompare(b),
    );
}
