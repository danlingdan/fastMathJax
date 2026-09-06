# Surface contexts — math in structural containers

<!--
Structural fixture for ROADMAP SURF-01. Hand-written on purpose: each context below is a real
Obsidian container whose rendering path differs from a plain section. Copy this file and
`surface-embed-target.md` into a clean test vault, open it in Reading View and Live Preview, and
check every context against the matrix in docs/smoke-testing.md.

Pass criteria per context: every formula is either rendered by the bundled engine from
unambiguous source, or deliberately left to Obsidian. Formula sources must never shift — a
formula's rendered output must match its source, and currency-like or code-span text must stay
literal.
-->

## 1. Callout

> [!note] Callout with math
> Inline Euler $e^{i\pi} + 1 = 0$ inside the callout body.
>
> $$
> \sum_{k=1}^{n} k = \frac{n(n+1)}{2}
> $$

## 2. Table

| Identity | Formula | Kind |
| --- | --- | --- |
| Pythagoras | $a^2 + b^2 = c^2$ | inline in cell |
| Gaussian integral | $\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}$ | inline in cell |
| Literal cost | it costs $5 and $6 here | currency in cell |

## 3. Lists

- unordered item with inline $x_{1}$
- nested list:
    - deeper item with $\alpha_{2}$ and `code $not_math$ span`
1. ordered item with $\beta_{3}$
2. ordered item followed by display math

    $$
    \lim_{n\to\infty}\left(1+\frac{1}{n}\right)^{n} = e
    $$

## 4. Blockquote

> Quoted inline $\Gamma_{4}$ formula and a cost of $9.
>
> $$
> \begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}^{-1}
> $$

## 5. Footnote

Body text with a footnote reference[^1], followed by plain prose so the section is unambiguous.

[^1]: The footnote body contains inline $\zeta_{5}$ math.

## 6. Embed

An embedded note follows. Embeds render through Obsidian's own pipeline without section
metadata, so the plugin is expected to leave them untouched:

![[surface-embed-target]]
