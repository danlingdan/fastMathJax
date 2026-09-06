/** Keep MathJax's internal layout elements out of Obsidian's MathJax CSS namespace. */
export function isolateOutput(container: HTMLElement): void {
    for (const element of Array.from(container.querySelectorAll("*"))) {
        if (!element.localName.startsWith("mjx-")) continue;
        const replacement = element.ownerDocument.createElement(`latest-${element.localName}`);
        for (const attribute of Array.from(element.attributes)) {
            replacement.setAttribute(attribute.name, attribute.value);
        }
        replacement.append(...Array.from(element.childNodes));
        element.replaceWith(replacement);
    }
}

/** Rewrite selectors only: font names, URLs, glyph classes and SVG paths stay intact. */
export function isolateStyles(rules: CSSRuleList): void {
    for (const rule of Array.from(rules)) {
        if ("selectorText" in rule) {
            const styleRule = rule as CSSStyleRule;
            styleRule.selectorText = styleRule.selectorText.replace(
                /(^|[\s>+~,(])mjx-([\w-]+)/g,
                (_match, prefix: string, name: string) => name === "container"
                    ? `${prefix}mjx-container[data-latest-mathjax-engine]`
                    : `${prefix}latest-mjx-${name}`,
            ).replace(/(\[data-latest-mathjax-engine\])\1+/g, "$1");
        } else if ("cssRules" in rule) {
            isolateStyles((rule as CSSGroupingRule).cssRules);
        }
    }
}
