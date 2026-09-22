import * as Obsidian from "obsidian";
import type { SettingDefinitionItem } from "obsidian";

const ZH: Record<string, string> = {
    "Rendering mode": "渲染模式",
    "Invasive mode (experimental)": "侵入模式（实验性）",
    "Patch Obsidian's built-in MathJax so every rendering surface — including hover previews, embeds and PDF export — renders with the bundled MathJax 4. Off by default; enabling asks for confirmation.": "替换 Obsidian 内置 MathJax 的渲染入口，使悬浮预览、嵌入内容和 PDF 导出等所有界面都使用插件自带的 MathJax 4。默认关闭；启用前会请求确认。",
    Engine: "引擎",
    "MathJax versions": "MathJax 版本",
    Renderer: "渲染器",
    "CommonHTML uses webfonts; SVG embeds glyph paths (no font download needed).": "CommonHTML 使用 Web 字体；SVG 内嵌字形路径（无需下载字体）。",
    Scale: "缩放比例",
    "Multiplier applied to rendered math. 1.0 matches the surrounding text size.": "数学公式的缩放倍数。1.0 与周围文字大小一致。",
    "Math font": "数学字体",
    "New Computer Modern is built in. Every other official MathJax 4 font is downloaded as a verified data pack only when selected.": "New Computer Modern 已内置。其他所有 MathJax 4 官方字体只有在被选择时，才会下载经过校验的数据包。",
    "New Computer Modern is built in. Every other official MathJax 4 font is downloaded as a verified, non-executable data pack only when selected.": "New Computer Modern 已内置。其他所有 MathJax 4 官方字体只有在被选择时，才会下载经过校验且不可执行的数据包。",
    "Font file location": "字体文件地址",
    "Where CommonHTML fetches the selected font's MathJax 4 woff2 files. This changes hosting, not the font family. Ignored for SVG.": "CommonHTML 获取所选字体 MathJax 4 WOFF2 文件的地址。这里只改变托管位置，不改变字体系列；SVG 会忽略此项。",
    "Where the selected font's MathJax 4 woff2 files are fetched from. This changes hosting, not the font family. Font metrics come from the selected font pack, so layout stays correct even offline — only glyph shapes fall back to a system font. Ignored when the renderer is SVG.": "所选字体 MathJax 4 WOFF2 文件的获取地址。这里只改变托管位置，不改变字体系列。字体度量来自所选字体包，因此离线时布局仍然正确，只有字形会回退到系统字体；SVG 会忽略此项。",
    "Font source": "字体来源",
    "CDN fetches woff2 files from the network on use. Local cache downloads them once into the plugin folder so CommonHTML renders offline, and ignores the custom font location above. CommonHTML only — SVG never needs fonts.": "CDN 会在使用时从网络获取 WOFF2 文件。本地缓存会将文件一次性下载到插件目录，使 CommonHTML 可离线渲染，并忽略上方的自定义字体地址。仅适用于 CommonHTML；SVG 不需要字体文件。",
    "CDN (default)": "CDN（默认）",
    "Local cache (offline)": "本地缓存（离线）",
    "Reset font file location": "重置字体文件地址",
    "Restore the bundled CommonHTML font CDN default.": "恢复内置的 CommonHTML 字体 CDN 默认地址。",
    "Reset to default": "恢复默认值",
    "TeX packages": "TeX 宏包",
    "All packages are bundled; these switches only decide which are active. autoload and require are unavailable because a bundled plugin cannot fetch extensions at runtime.": "所有宏包均已内置；这些开关只决定启用哪些宏包。由于打包后的插件无法在运行时获取扩展，因此不支持 autoload 和 require。",
    "Core TeX/LaTeX commands. Always active.": "核心 TeX/LaTeX 命令，始终启用。",
    "amsmath / amssymb: align, gather, cases, extra symbols and operators.": "amsmath / amssymb：align、gather、cases，以及额外的符号和运算符。",
    "Required for macros defined in settings and for the global preamble.": "设置中定义的宏和全局导言需要此宏包。",
    "Chemical equations: \\ce{H2O}, \\pu{123 kJ//mol}.": "化学方程式：\\ce{H2O}、\\pu{123 kJ//mol}。",
    "Show the original LaTeX instead of a red error message when parsing fails.": "解析失败时显示原始 LaTeX，而不是红色错误信息。",
    "Render unknown macros as their literal name instead of raising an error.": "将未知宏按其名称原样渲染，而不是抛出错误。",
    "\\boldsymbol for bold math italics.": "使用 \\boldsymbol 生成粗体数学斜体。",
    "Dirac notation: \\bra, \\ket, \\braket.": "狄拉克记号：\\bra、\\ket、\\braket。",
    "LaTeX2e color: \\color, \\textcolor, \\colorbox, \\fcolorbox.": "LaTeX2e 颜色命令：\\color、\\textcolor、\\colorbox、\\fcolorbox。",
    "mathtools extensions to amsmath: \\coloneqq, \\DeclarePairedDelimiter, matrix* environments.": "mathtools 对 amsmath 的扩展：\\coloneqq、\\DeclarePairedDelimiter、matrix* 环境。",
    "physics package: \\dv, \\pdv, \\abs, \\norm, \\eval, bra-ket, matrix helpers.": "physics 宏包：\\dv、\\pdv、\\abs、\\norm、\\eval、bra-ket 和矩阵辅助命令。",
    "Full text-mode markup inside \\text{} and friends.": "在 \\text{} 等命令中支持完整的文本模式标记。",
    "\\unicode{x1D538} to reach arbitrary code points.": "使用 \\unicode{x1D538} 访问任意 Unicode 码位。",
    "(always on)": "（始终启用）",
    Macros: "宏",
    "Preamble file": "导言文件",
    "Optional vault-relative path whose TeX is evaluated before the inline preamble, e.g. math/macros.tex. Re-read automatically when the file changes.": "可选的库内相对路径，其中的 TeX 会先于内联导言执行，例如 math/macros.tex；文件变化时会自动重新读取。",
    "Optional vault-relative path whose TeX is evaluated before the inline preamble below, e.g. macros/mathjax.tex. Re-read automatically when the file changes.": "可选的库内相对路径，其中的 TeX 会先于下方内联导言执行，例如 macros/mathjax.tex；文件变化时会自动重新读取。",
    "Global preamble": "全局导言",
    "LaTeX evaluated once when the engine starts. Applied when the field loses focus.": "引擎启动时执行一次 LaTeX；输入框失去焦点时应用。",
    "LaTeX evaluated once when the engine starts. Definitions stay available in every formula. Requires the NewCommand package.": "引擎启动时执行一次 LaTeX，其中的定义可供所有公式使用。需要启用 NewCommand 宏包。",
    "Preamble applied.": "导言已应用。",
    Performance: "性能",
    "Formula cache": "公式缓存",
    "Reuse rendered output for identical formulas.": "对相同公式复用已渲染的结果。",
    "Cache size": "缓存大小",
    "Maximum number of cached formulas.": "最多缓存的公式数量。",
    "Render debounce": "渲染防抖",
    "Milliseconds to wait after typing stops before re-rendering in Live Preview.": "在实时预览中停止输入后，等待多少毫秒再重新渲染。",
    "Cache statistics": "缓存统计",
    "Clear cache": "清空缓存",
    Compatibility: "兼容性",
    "Which parts of Obsidian this plugin renders math in.": "选择插件在哪些 Obsidian 界面中渲染数学公式。",
    "Supported surfaces": "支持的界面",
    "Invasive mode is active: every rendering surface (including hover previews and embeds) renders with the bundled engine, and the per-surface switches below are idle.": "侵入模式已启用：所有界面（包括悬浮预览和嵌入内容）均使用插件自带引擎渲染，下面的各界面开关暂不生效。",
    "Reading View, Live Preview and their popout-window variants are supported. Hover Preview and Canvas remain fail-closed and unsupported — invasive mode is the experimental path to full coverage.": "支持阅读视图、实时预览及其弹出窗口。悬浮预览和白板在默认模式下仍保持安全关闭且不受支持；侵入模式是覆盖全部界面的实验性方案。",
    "Reading View": "阅读视图",
    "Live Preview": "实时预览",
    "Popout windows": "弹出窗口",
    "Hover Preview": "悬浮预览",
    Canvas: "白板",
    "Re-renders display math with the bundled engine.": "使用内置引擎重新渲染行间公式。",
    "Takes over mounted math widgets in the editor.": "接管编辑器中已挂载的数学公式组件。",
    "Allows supported adapters to render in detached windows.": "允许受支持的适配器在独立窗口中渲染。",
    "Not supported: raw TeX is not exposed reliably.": "暂不支持：无法可靠获取原始 TeX。",
    "Not supported: canvas cards bypass the Markdown post-processor.": "暂不支持：白板卡片会绕过 Markdown 后处理器。",
    "Managed by invasive mode.": "由侵入模式管理。",
    "Managed by invasive mode (every surface renders with the bundled engine).": "由侵入模式管理（所有界面均使用插件自带引擎渲染）。",
    "Re-renders $$…$$ display math in Reading View with the bundled engine.": "使用插件自带引擎重新渲染阅读视图中的 $$…$$ 行间公式。",
    "Takes over math in the editor with the bundled engine.": "使用插件自带引擎接管编辑器中的数学公式。",
    "Math in detached windows. Invasive mode copies the engine stylesheet into the popout document automatically.": "在独立窗口中渲染数学公式；侵入模式会自动把引擎样式表复制到弹出文档中。",
    "Math in detached windows. Reuses the Reading View / Live Preview adapters; CHTML styles are copied into the popout document automatically.": "在独立窗口中渲染数学公式；复用阅读视图/实时预览适配器，并自动把 CHTML 样式复制到弹出文档中。",
    "Rendered through the patched native pipeline while invasive mode is on.": "启用侵入模式时，通过已接管的原生管线渲染。",
    "Math inside hover popovers. Not supported yet — Obsidian does not expose the TeX source there (planned).": "悬浮弹窗中的数学公式。暂不支持：Obsidian 未在该界面公开 TeX 源码（已规划）。",
    "Math inside canvas cards. Not supported yet — canvas cards bypass the markdown post-processor (planned).": "白板卡片中的数学公式。暂不支持：白板卡片会绕过 Markdown 后处理器（已规划）。",
    "Inline math in Reading View": "阅读视图中的行内公式",
    "Also re-render inline prose math in Reading View.": "同时重新渲染阅读视图正文中的行内公式。",
    "Also re-render $…$ inline math in Reading View. Off by default: inline prose math is riskier to take over than isolated display blocks.": "同时重新渲染阅读视图正文中的 $…$ 行内公式。默认关闭：接管正文行内公式的风险高于独立的行间公式块。",
    "Inline math in Live Preview": "实时预览中的行内公式",
    "Also re-render inline prose math in Live Preview.": "同时重新渲染实时预览正文中的行内公式。",
    "Also re-render $…$ inline math in Live Preview. Off by default: inline prose math is riskier to take over than isolated display blocks.": "同时重新渲染实时预览正文中的 $…$ 行内公式。默认关闭：接管正文行内公式的风险高于独立的行间公式块。",
    "When rendering fails": "渲染失败时",
    "What to show if the bundled engine cannot render a formula.": "当内置引擎无法渲染公式时显示什么。",
    "Fall back to Obsidian's MathJax (recommended)": "回退到 Obsidian 的 MathJax（推荐）",
    "Show the original LaTeX": "显示原始 LaTeX",
    "Show the error message": "显示错误信息",
    Developer: "开发者",
    "Debug mode": "调试模式",
    "Log engine initialisation, cache hits and render errors to the console.": "将引擎初始化、缓存命中和渲染错误记录到控制台。",
    "Assistive MathML": "辅助 MathML",
    "Emit hidden MathML alongside visual output for screen readers.": "在可视输出旁生成隐藏的 MathML，供屏幕阅读器使用。",
    "Emit hidden MathML alongside the visual output for screen readers. Increases DOM size.": "在可视输出旁生成隐藏的 MathML，供屏幕阅读器使用；这会增加 DOM 大小。",
    "Plugin MathJax": "插件 MathJax",
    "Built-in MathJax": "内置 MathJax",
    "not detected yet": "尚未检测",
    "Obsidian's built-in MathJax is newer than the bundled version.": "Obsidian 内置的 MathJax 版本高于插件自带版本。",
    "Obsidian's built-in MathJax is newer than the version bundled with this plugin. You may want to keep the built-in renderer.": "Obsidian 内置的 MathJax 版本高于插件自带版本，建议考虑继续使用内置渲染器。",
    "Latest MathJax: failed to save setting; the previous value was restored.": "Latest MathJax：保存设置失败，已恢复之前的值。",
    "Latest MathJax: failed to save preamble; the previous value was restored.": "Latest MathJax：保存导言失败，已恢复之前的值。",
    "Latest MathJax: failed to save preamble.": "Latest MathJax：保存导言失败。",
};

export function isChineseLanguage(language: string): boolean {
    return language.toLowerCase().startsWith("zh");
}

/** Use Obsidian's public API when present while retaining the documented 1.8.0 minimum. */
export function getObsidianLanguage(): string {
    const api = Obsidian as unknown as { getLanguage?: () => string };
    try {
        return api.getLanguage?.() || document.documentElement.lang || "en";
    } catch {
        return document.documentElement.lang || "en";
    }
}

export function translateSettingText(text: string, language: string): string {
    if (!isChineseLanguage(language)) return text;
    const direct = ZH[text];
    if (direct) return direct;
    if (text.endsWith(" (always on)")) {
        const base = text.slice(0, -" (always on)".length);
        return `${ZH[base] ?? base}（始终启用）`;
    }
    if (text.endsWith(" Managed by invasive mode.")) {
        const base = text.slice(0, -" Managed by invasive mode.".length);
        return `${ZH[base] ?? base} 由侵入模式管理。`;
    }
    return text
        .replace(" entries", " 条")
        .replace(" hits", " 次命中")
        .replace(" misses", " 次未命中")
        .replace(" hit rate", " 命中率")
        .replace(" renders this session", " 次本次会话渲染");
}

export function localizeSettingsElement(root: HTMLElement, language: string): void {
    if (!isChineseLanguage(language)) return;
    const showText = root.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
    const walker = root.ownerDocument.createTreeWalker(root, showText);
    let node = walker.nextNode();
    while (node) {
        const value = node.nodeValue ?? "";
        const leading = value.match(/^\s*/)?.[0] ?? "";
        const trailing = value.match(/\s*$/)?.[0] ?? "";
        const content = value.slice(leading.length, value.length - trailing.length);
        if (content) node.nodeValue = leading + translateSettingText(content, language) + trailing;
        node = walker.nextNode();
    }
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("[aria-label], [title]"))) {
        for (const attribute of ["aria-label", "title"] as const) {
            const value = element.getAttribute(attribute);
            if (value) element.setAttribute(attribute, translateSettingText(value, language));
        }
    }
}

export function localizeSettingDefinitions(
    definitions: SettingDefinitionItem[],
    language: string,
): SettingDefinitionItem[] {
    if (!isChineseLanguage(language)) return definitions;
    const visit = (item: SettingDefinitionItem): SettingDefinitionItem => {
        const localized = { ...item } as SettingDefinitionItem & {
            heading?: string;
            name?: string;
            desc?: string;
            aliases?: string[];
            items?: SettingDefinitionItem[];
            render?: (setting: { settingEl: HTMLElement }) => void;
            control?: { type?: string; options?: Record<string, string> };
        };
        if (localized.heading) localized.heading = translateSettingText(localized.heading, language);
        if (localized.name) localized.name = translateSettingText(localized.name, language);
        if (localized.desc) localized.desc = translateSettingText(localized.desc, language);
        if (localized.aliases) {
            localized.aliases = localized.aliases.map((alias) =>
                translateSettingText(alias, language));
        }
        if (localized.items) localized.items = localized.items.map(visit);
        if (localized.control?.options) {
            localized.control = {
                ...localized.control,
                options: Object.fromEntries(Object.entries(localized.control.options).map(
                    ([key, value]) => [key, translateSettingText(value, language)],
                )),
            };
        }
        if (localized.render) {
            const render = localized.render;
            localized.render = (setting: { settingEl: HTMLElement }) => {
                render(setting);
                localizeSettingsElement(setting.settingEl, language);
            };
        }
        return localized;
    };
    return definitions.map(visit);
}
