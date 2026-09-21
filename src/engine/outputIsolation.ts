/** Keep MathJax's internal layout elements out of Obsidian's MathJax CSS namespace. */
export function isolateOutput(container: HTMLElement, styleScope?: string): void {
    for (const element of Array.from(container.querySelectorAll("*"))) {
        if (!element.localName.startsWith("mjx-")) continue;
        const replacement = element.ownerDocument.createElement(`latest-${element.localName}`);
        for (const attribute of Array.from(element.attributes)) {
            replacement.setAttribute(attribute.name, attribute.value);
        }
        if (styleScope) replacement.setAttribute("data-latest-mathjax-style", styleScope);
        replacement.append(...Array.from(element.childNodes));
        element.replaceWith(replacement);
    }
}

/**
 * Rewrite selectors only: font names, URLs, glyph classes and SVG paths stay intact.
 *
 * A rule whose selectorText cannot be rewritten is left alone rather than failing the whole
 * pass: an unrewritten rule simply stops matching our renamed elements, which is the isolation
 * goal anyway. Chromium rejects selectorText writes on some rule types, and one throw would
 * otherwise leave every later rule unrewritten.
 */
export function isolateStyles(rules: CSSRuleList, styleScope?: string): void {
    const scope = styleScope
        ? `[data-latest-mathjax-style="${CSS.escape(styleScope)}"]`
        : "";
    for (const rule of Array.from(rules)) {
        try {
            if ("selectorText" in rule) {
                const styleRule = rule as CSSStyleRule;
                styleRule.selectorText = styleRule.selectorText.replace(
                    /(^|[\s>+~,(])mjx-([\w-]+)/g,
                    (_match, prefix: string, name: string) => name === "container"
                        ? `${prefix}mjx-container[data-latest-mathjax-engine]`
                        : `${prefix}latest-mjx-${name}`,
                ).replace(/(\[data-latest-mathjax-engine\])\1+/g, "$1");
                if (scope) {
                    styleRule.selectorText = styleRule.selectorText
                        .replace(
                            /mjx-container\[data-latest-mathjax-engine\]/g,
                            `mjx-container[data-latest-mathjax-engine]${scope}`,
                        )
                        .replace(/latest-mjx-[\w-]+/g, (tag) => `${tag}${scope}`)
                        .replace(new RegExp(`(${escapeRegExp(scope)}){2,}`, "g"), "$1");
                }
            } else if ("cssRules" in rule) {
                isolateStyles((rule as CSSGroupingRule).cssRules, styleScope);
            }
        } catch {
            // Leave this rule as MathJax wrote it.
        }
    }
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
