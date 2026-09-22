<div align="center">

# Latest MathJax for Obsidian

**为 Obsidian 提供新版 MathJax 4：内置、隔离，并支持可靠的 PDF 导出。**

[English](README.md) · [简体中文](README.zh-CN.md)

[![Latest release](https://img.shields.io/github/v/release/danlingdan/fastMathJax?logo=github&label=release)](https://github.com/danlingdan/fastMathJax/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/danlingdan/fastMathJax/ci.yml?branch=main&label=CI)](https://github.com/danlingdan/fastMathJax/actions/workflows/ci.yml)
![Obsidian](https://img.shields.io/badge/Obsidian-1.8.0%2B-7c3aed?logo=obsidian&logoColor=white)
[![License](https://img.shields.io/github/license/danlingdan/fastMathJax)](LICENSE)

[快速开始](#快速开始) · [主要功能](#主要功能) · [字体与离线使用](#字体与离线使用) · [兼容性](#兼容性) · [文档](#文档)

</div>

---

## 为什么需要这个插件

Obsidian 自带的 MathJax 通常落后于上游版本。新 TeX 宏包、字体改进和错误修复，往往要等到 Obsidian 更新后才能使用。本插件内置当前的 **MathJax 4** 引擎，并通过独立作用域渲染公式。

默认模式不会修改 `window.MathJax`，也不会覆盖 Obsidian 的 `renderMath()`；如果插件无法渲染某个公式，可以安全回退到 Obsidian 自带渲染器。可选的“侵入模式”会在用户明确确认后接管原生 MathJax 渲染入口，从而覆盖悬浮预览、嵌入内容等更多界面。

设置页面会自动跟随 Obsidian 的界面语言：中文环境显示中文，其他语言使用英文。

## 主要功能

- **MathJax 4.1.3**：使用较新的 TeX 输入和渲染能力。
- **阅读视图与实时预览**：支持行间公式，并可选择接管行内公式。
- **全部 11 套官方数学字体**：内置 New Computer Modern；Asana Math、五套 Gyre 字体、
  Fira Math、Latin Modern、STIX Two 和 MathJax TeX 在首次选择时按需下载。
- **安全字体包**：下载内容是不可执行的 gzip 数据包，使用固定大小、SHA-256、结构、字体系列和版本进行校验。
- **CommonHTML 或 SVG**：CommonHTML 使用 Web 字体；SVG 内嵌字形路径，适合离线使用和 PDF 导出。
- **库内导言文件**：可将宏保存在版本可控的 `.tex` 文件中；文件变化后自动重新载入。
- **确定性 PDF 导出**：独立 SVG 打印引擎会内嵌字形路径。
- **可选离线字体缓存**：一次下载 CommonHTML 的 WOFF2 字形文件，之后可离线渲染。
- **故障回退**：可选择回退到 Obsidian MathJax、显示原始 LaTeX 或显示错误信息。
- **性能控制**：包含 LRU 公式缓存和实时预览渲染防抖。

## 快速开始

1. 从 [最新 Release](https://github.com/danlingdan/fastMathJax/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 将三个文件放入 `<你的库>/.obsidian/plugins/latest-mathjax/`。
3. 重新加载 Obsidian，在“设置 → 第三方插件”中启用 **Latest MathJax**。

阅读视图默认启用；实时预览和行内公式接管默认关闭，可在“设置 → Latest MathJax → 兼容性”中启用。

## 字体与离线使用

New Computer Modern 的渲染数据包含在 `main.js` 中。其余 10 套官方字体不会增加核心插件体积，而是在用户首次选择时从对应版本的 GitHub Release 下载，并缓存到插件目录。

CommonHTML 仍需 WOFF2 字形文件。你可以选择：

- **CDN（默认）**：使用时从网络读取字体文件；
- **本地缓存（离线）**：一次性下载到插件目录，以后离线使用；
- **SVG**：字形路径直接嵌入输出，不需要字体文件。

更详细的缓存、校验和清理说明见 [离线字体文档](docs/offline-fonts.md)。

## 导言和宏

宏可以写在设置中的“全局导言”里，也可以放在库内的独立文件中，例如 `math/macros.tex`。导言文件先执行，设置中的全局导言随后执行，因此可以在设置中进行个人覆盖。

插件不会开放不受限制的运行时 `\require`；所有可选 TeX 宏包均在构建时静态打包。

## 兼容性

- 桌面版 Obsidian `1.8.0+`；
- 默认模式支持阅读视图、实时预览和对应的弹出窗口；
- 悬浮预览和白板在默认模式下保持安全关闭，因为 Obsidian 没有为这些界面提供可靠的原始 TeX 接口；
- 实验性的侵入模式可以覆盖所有走 Obsidian 原生 MathJax 管线的界面；
- SVG 渲染器适用于完全离线使用和稳定的 PDF 导出。

当前开发状态、已验证范围和仍待执行的桌面测试见 [项目状态](docs/STATUS.md)。

## 构建与验证

```bash
npm ci
npm run check
```

`npm run check` 会执行 lint、测试、TypeScript 检查、生产构建和发布元数据校验。字体包由构建脚本从固定版本的官方 MathJax 字体包生成。

## 文档

- [项目状态](docs/STATUS.md)
- [设置说明](docs/settings.md)
- [兼容性](docs/compatibility.md)
- [离线字体](docs/offline-fonts.md)
- [测试步骤](docs/smoke-testing.md)
- [路线图](docs/ROADMAP.md)

## 许可证

[MIT](LICENSE)
