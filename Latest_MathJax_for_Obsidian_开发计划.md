# Latest MathJax for Obsidian 插件开发计划

## 1. 项目概述

### 1.1 项目名称

**Latest MathJax for Obsidian**

备选名称：

- Modern MathJax
- MathJax Next
- MathJax 4 for Obsidian

### 1.2 项目目标

开发一款适用于 Obsidian 的社区插件，使 Obsidian 在不修改本体、不直接覆盖内置 MathJax 全局对象的前提下，使用最新版 MathJax 4 进行公式渲染。

插件重点解决以下问题：

- Obsidian 内置 MathJax 版本更新滞后；
- 新版 MathJax 的语法、扩展、字体与渲染能力无法及时使用；
- 用户希望统一 Reading View 与 Live Preview 中的数学公式渲染效果；
- 希望支持更丰富的 TeX packages、自定义宏、字体和渲染配置；
- 避免通过覆盖 `window.MathJax` 等方式破坏 Obsidian 原有数学渲染逻辑。

---

## 2. 核心设计原则

### 2.1 不直接替换 Obsidian 内置 MathJax

不采用以下方式：

```js
delete window.MathJax;
window.MathJax = {};
```

也不采用：

```ts
(obsidian as any).renderMath = myRenderMath;
```

原因：

- Obsidian 没有提供公开的 MathJax 引擎替换 API；
- 强行覆盖全局 MathJax 可能破坏 Obsidian 自身功能；
- 其他依赖 MathJax 的插件可能发生兼容性问题；
- Obsidian 更新后容易失效。

### 2.2 插件维护独立 MathJax 4 Renderer

目标架构：

```text
                    Obsidian
                       │
             Markdown / CodeMirror
                       │
             ┌─────────┴─────────┐
             │                   │
      Obsidian MathJax      Latest MathJax Plugin
                                │
                         MathJax 4 Renderer
                                │
                    ┌───────────┴───────────┐
                    │                       │
              Live Preview             Reading View
                    │                       │
                    └───────────┬───────────┘
                                │
                           最终公式 DOM
```

插件中的 MathJax 与 Obsidian 内置版本相互隔离。

---

## 3. 第一阶段目标

第一版优先实现：

- [ ] 独立加载 MathJax 4
- [ ] MathJax 版本检测
- [ ] CHTML 渲染
- [ ] Display Math 渲染
- [ ] Inline Math 渲染
- [ ] Reading View 支持
- [ ] Live Preview 支持
- [ ] AMS 支持
- [ ] `mhchem` 支持
- [ ] `autoload` 支持
- [ ] 自定义宏
- [ ] Global Preamble
- [ ] 公式缓存
- [ ] Render debounce
- [ ] 设置页面

暂时不要求：

- Canvas 完整支持
- PDF Export 完整接管
- Hover Preview 完整支持
- SVG 高级配置
- Accessibility 高级配置
- 自定义 MathJax 插件开发接口

---

# 4. 技术路线

## 4.1 MathJax 引擎

推荐依赖：

```bash
npm install @mathjax/src
```

由插件自行初始化 MathJax。

核心模块：

```text
MathJaxEngine
│
├── TeX Input
├── Packages
├── Macros
├── CHTML Output
├── SVG Output
├── Font Manager
└── Cache
```

统一暴露接口：

```ts
interface RenderOptions {
    display: boolean;
}

interface MathRenderer {
    render(
        tex: string,
        options: RenderOptions
    ): Promise<HTMLElement>;
}
```

---

# 5. Reading View 实现

## 5.1 使用 Markdown Post Processor

注册：

```ts
this.registerMarkdownPostProcessor(
    async (element, context) => {
        await this.processMath(element, context);
    }
);
```

目标：

```text
Markdown
   ↓
Obsidian Markdown Renderer
   ↓
Latest MathJax Post Processor
   ↓
MathJax 4 Renderer
   ↓
公式 DOM
```

## 5.2 关键问题

Obsidian 的 Post Processor 执行时，原始公式可能已经被内置 MathJax 转换。

因此需要研究：

- `MarkdownPostProcessorContext`
- section 信息
- Markdown 原始文本获取方式
- 已渲染公式与原始 source 的映射方式

尽量避免仅通过已生成的 `<mjx-container>` 反推 LaTeX。

---

# 6. Live Preview 实现

Live Preview 是整个项目最关键的部分。

Obsidian 编辑器基于 CodeMirror 6。

需要使用：

```ts
this.registerEditorExtension(...)
```

大体流程：

```text
CodeMirror 6
      │
      ├── 文档变化
      │
      ├── Syntax Tree
      │
      ├── 找到 Math Range
      │
      └── Decoration / Widget
                 │
                 ↓
             MathWidget
                 │
                 ↓
          MathJaxEngine
```

MathWidget 示例结构：

```ts
class MathWidget extends WidgetType {

    constructor(
        private tex: string,
        private display: boolean,
        private engine: MathJaxEngine
    ) {
        super();
    }

    toDOM(): HTMLElement {

        const container =
            document.createElement("span");

        container.addClass(
            "latest-mathjax-container"
        );

        this.engine
            .render(this.tex, {
                display: this.display
            })
            .then(node => {
                container.replaceChildren(node);
            });

        return container;
    }
}
```

---

# 7. 数学公式识别

## 7.1 不使用正则作为主要解析方案

不建议：

```ts
/\$\$(.*?)\$\$/g
```

因为会遇到：

```markdown
`$123`

\$100
```

以及代码块：

````markdown
```python
x = "$100"
```
````

因此优先使用 CodeMirror Syntax Tree。

例如：

```ts
syntaxTree(view.state)
```

然后定位：

```text
Inline Math

Display Math
```

获取：

```text
from
to
source
display
```

形成：

```ts
interface MathToken {
    source: string;
    display: boolean;
    from: number;
    to: number;
}
```

---

# 8. 渲染缓存

MathJax 渲染成本较高。

Live Preview 中不能每输入一个字符都完整重新 typeset。

计划加入：

```ts
Map<string, RenderResult>
```

缓存 Key：

```text
hash(
    tex
    + display
    + configHash
    + mathjaxVersion
)
```

例如：

```text
E = mc^2
```

第一次：

```text
MathJax Render
```

之后：

```text
Cache Hit
```

同时加入：

```text
Render Debounce
```

默认建议：

```text
120 ~ 180 ms
```

---

# 9. 设置页面

第一版设置：

```text
Latest MathJax
────────────────────────────

Engine

MathJax version
4.x.x

Renderer
[ CommonHTML ▼ ]

────────────────────────────

TeX Packages

☑ AMS
☑ Autoload
☑ Require
☑ mhchem
☑ NewCommand

────────────────────────────

Macros

[ Edit global preamble ]

────────────────────────────

Performance

☑ Formula cache

Cache size
[ 1000 ]

Render debounce
[ 150 ms ]

────────────────────────────

Compatibility

☑ Reading View
☑ Live Preview
☐ Hover Preview
☐ Canvas
☐ Popout Windows
```

---

# 10. 版本检测

启动时检测：

```text
Obsidian MathJax
        ↓
Built-in Version

Plugin MathJax
        ↓
Bundled Version
```

显示：

```text
Built-in MathJax:
3.x.x

Plugin MathJax:
4.x.x

Latest MathJax Renderer:
Enabled
```

如果未来出现：

```text
Built-in MathJax:
4.2.0

Plugin MathJax:
4.1.3
```

插件可提示：

```text
Obsidian's built-in MathJax is newer than the bundled version.
```

并允许：

```text
Disable replacement renderer
```

---

# 11. 项目目录设计

```text
obsidian-latest-mathjax/
│
├── manifest.json
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── styles.css
│
└── src/
    │
    ├── main.ts
    ├── settings.ts
    │
    ├── engine/
    │   ├── MathJaxEngine.ts
    │   ├── MathJaxConfig.ts
    │   ├── MathCache.ts
    │   └── packages.ts
    │
    ├── editor/
    │   ├── MathExtension.ts
    │   ├── MathWidget.ts
    │   └── MathDetector.ts
    │
    ├── preview/
    │   └── MathPostProcessor.ts
    │
    └── utils/
        ├── hash.ts
        ├── version.ts
        └── logger.ts
```

---

# 12. manifest.json

初始版本：

```json
{
  "id": "latest-mathjax",
  "name": "Latest MathJax",
  "version": "0.1.0",
  "minAppVersion": "1.8.0",
  "description": "Use the latest MathJax engine for mathematical rendering in Obsidian.",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

后续根据实际兼容性调整：

```text
minAppVersion
```

以及：

```text
isDesktopOnly
```

---

# 13. 开发阶段划分

## Stage 0：Obsidian MathJax 行为调查

目标：

确认 Obsidian 当前 MathJax 的实际工作方式。

任务：

- [ ] 获取 Obsidian 当前 MathJax 版本
- [ ] 调查 `loadMathJax()`
- [ ] 调查 `renderMath()`
- [ ] 调查 `finishRenderMath()`
- [ ] 检查 Reading View DOM
- [ ] 检查 Live Preview DOM
- [ ] 检查公式 syntax tree
- [ ] 检查 Popout Window 行为
- [ ] 检查 Canvas 中公式行为

交付：

```text
docs/
└── obsidian-mathjax-research.md
```

---

## Stage 1：独立 MathJax Engine

目标：

让插件完全独立完成：

```text
LaTeX
   ↓
MathJax 4
   ↓
HTML
```

任务：

- [ ] 集成 `@mathjax/src`
- [ ] TeX Input
- [ ] CHTML Output
- [ ] 基础 package
- [ ] Inline Math
- [ ] Display Math
- [ ] 错误捕获
- [ ] Renderer API

完成标准：

```text
E = mc^2

\int_0^\infty e^{-x^2}\,dx

\begin{aligned}
a &= b + c \\
d &= e + f
\end{aligned}
```

均可正常渲染。

---

## Stage 2：插件测试页面

目标：

在 Obsidian 中提供独立测试环境。

功能：

```text
Command Palette
       ↓
Open Latest MathJax Test
```

页面中：

```text
LaTeX Input

[                         ]

Display Mode
[✓]

[ Render ]

Result:
...
```

作用：

在接管 Obsidian 原生公式之前验证 MathJax 4 Engine。

---

## Stage 3：Reading View

任务：

- [ ] Markdown Post Processor
- [ ] 检测公式节点
- [ ] 获取原始 TeX
- [ ] 替换 Obsidian 默认公式输出
- [ ] Inline Math
- [ ] Display Math
- [ ] 多公式页面
- [ ] 错误公式 fallback

完成标准：

普通 Markdown：

```markdown
Einstein equation:

$$
E = mc^2
$$
```

在 Reading View 中完全由插件 MathJax 渲染。

---

## Stage 4：Live Preview

任务：

- [ ] CodeMirror Extension
- [ ] Syntax Tree 分析
- [ ] Inline Math Detection
- [ ] Display Math Detection
- [ ] MathWidget
- [ ] Decoration
- [ ] 光标进入公式时恢复源码编辑
- [ ] 光标离开公式时恢复渲染
- [ ] Selection 行为测试

完成标准：

```text
输入公式
↓
停止输入
↓
MathJax 4 渲染
↓
点击公式
↓
恢复 LaTeX 编辑
```

体验应尽可能接近 Obsidian 原生 Live Preview。

---

## Stage 5：性能优化

任务：

- [ ] Render Cache
- [ ] LRU Cache
- [ ] Debounce
- [ ] Render Queue
- [ ] Async Render 管理
- [ ] DOM 复用
- [ ] 大文档测试
- [ ] 100+ 公式压力测试
- [ ] 500+ 公式压力测试

核心指标：

```text
普通公式缓存命中后：
接近即时显示
```

目标避免：

```text
输入卡顿
滚动卡顿
重复渲染
内存持续增长
```

---

## Stage 6：TeX 扩展

计划支持：

```text
AMS

autoload

require

newcommand

mhchem
```

后续考虑：

```text
physics

mathtools

cancel

color

unicode
```

需要区分：

```text
MathJax 官方 extension
```

与：

```text
第三方 LaTeX package
```

不能直接假定所有原生 LaTeX package 都能在 MathJax 中使用。

---

## Stage 7：Global Preamble

支持用户定义：

```latex
\newcommand{\R}{\mathbb{R}}

\newcommand{\E}{\mathbb{E}}

\DeclareMathOperator{\Var}{Var}
```

例如用户笔记：

```latex
$$
X \in \R
$$
```

自动应用全局配置。

---

# 14. 字体支持

MathJax 4 对字体系统有较大升级。

第一阶段默认：

```text
New Computer Modern
```

后续增加：

```text
Math Font

○ New Computer Modern
○ STIX Two
○ TeX
○ Custom
```

目标：

允许用户控制数学公式字体，而不影响正文主题。

---

# 15. SVG Renderer

第一版默认：

```text
CHTML
```

原因：

- 更适合正文混排；
- inline math 表现自然；
- DOM 结构更适合 Obsidian；
- 性能通常更适合作为默认选项。

后续增加：

```text
Renderer

○ CHTML
○ SVG
```

SVG 适合：

- 高清截图
- 特殊显示需求
- 某些字体场景

---

# 16. Compatibility Layer

建立统一兼容层：

```text
CompatibilityManager
│
├── ReadingViewAdapter
├── LivePreviewAdapter
├── HoverPreviewAdapter
├── CanvasAdapter
├── PopoutAdapter
└── ExportAdapter
```

优先级：

```text
Reading View
     ↓
Live Preview
     ↓
Hover Preview
     ↓
Popout
     ↓
Canvas
     ↓
Export
```

---

# 17. 错误处理

如果 MathJax 4 渲染失败：

```text
MathJax4 render
      ↓
   Error
      ↓
Fallback
```

Fallback 可选：

```text
1. 显示原始 LaTeX

2. 使用 Obsidian 内置 MathJax

3. 显示错误信息
```

推荐默认：

```text
Fallback to Obsidian MathJax
```

确保插件错误不会导致用户公式完全不可用。

---

# 18. Debug 模式

设置：

```text
Developer

☐ Debug mode
```

开启后记录：

```text
[MathJax4]

Engine initialized

Render request

Cache hit

Cache miss

Render error

Reading View replaced

Live Preview widget mounted
```

方便开发阶段定位问题。

---

# 19. 性能目标

目标之一：

即使一个 Markdown 文件包含：

```text
300+
```

公式，依然保持流畅。

主要优化：

```text
Syntax Tree
    ↓
只处理可见范围
    ↓
Cache
    ↓
Debounce
    ↓
Async Render Queue
```

后续可考虑：

```text
Viewport-aware Rendering
```

仅渲染当前编辑器可见区域附近的公式。

---

# 20. 测试矩阵

## 基础公式

```latex
x^2
```

```latex
\frac{a}{b}
```

```latex
\sqrt{x}
```

---

## AMS

```latex
\begin{aligned}
a &= b + c \\
d &= e + f
\end{aligned}
```

---

## Matrix

```latex
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
```

---

## Chemistry

```latex
\ce{H2O}
```

---

## Long Equation

测试：

```text
超宽公式
```

---

## Invalid LaTeX

例如：

```latex
\frac{
```

测试：

```text
错误提示
fallback
编辑恢复
```

---

# 21. Obsidian 场景测试

必须测试：

- [ ] Reading View
- [ ] Live Preview
- [ ] Source Mode
- [ ] Embedded Note
- [ ] Callout
- [ ] Table
- [ ] List
- [ ] Blockquote
- [ ] Footnote
- [ ] Hover Preview
- [ ] Canvas
- [ ] Popout Window
- [ ] Mobile
- [ ] PDF Export

---

# 22. 插件兼容性测试

重点关注：

```text
Extended MathJax

Latex Suite

Templater

Dataview

Excalidraw
```

目标不是保证完全兼容所有插件，而是：

```text
插件关闭后
Obsidian 能完全恢复原状
```

必须避免：

```text
污染 window.MathJax
```

---

# 23. Release Roadmap

## v0.0.1

目标：

MathJax Engine Demo

功能：

- MathJax 4
- CHTML
- 测试命令
- Test View

---

## v0.0.2

目标：

Reading View

功能：

- Inline Math
- Display Math
- Markdown Post Processor

---

## v0.0.3

目标：

Live Preview Prototype

功能：

- CodeMirror Extension
- Math Widget
- Display Math

---

## v0.0.4

目标：

完整 Live Preview

功能：

- Inline Math
- 光标编辑逻辑
- Widget 生命周期

---

## v0.0.5

目标：

性能优化

功能：

- Cache
- Debounce
- Async Render Queue

---

## v0.0.6

目标：

TeX Configuration

功能：

- Global Macros
- Global Preamble
- Packages

---

## v0.0.7

目标：

兼容性扩展

功能：

- Hover Preview
- Popout
- Canvas

---

## v0.0.8

目标：

Renderer

功能：

- CHTML
- SVG
- Font configuration

---

## v0.0.9

目标：

Beta

任务：

- Bug Fix
- Performance
- Mobile Test
- Plugin Compatibility

---

## v0.1.0

目标：

第一版正式发布。

核心能力：

```text
MathJax 4
+
Reading View
+
Live Preview
+
CHTML
+
AMS
+
mhchem
+
Global Preamble
+
Macros
+
Cache
+
Settings
```

---

# 24. GitHub 目录规划

```text
latest-mathjax/
│
├── .github/
│   └── workflows/
│       └── release.yml
│
├── docs/
│   ├── architecture.md
│   ├── obsidian-mathjax-research.md
│   └── compatibility.md
│
├── src/
│
├── test/
│
├── manifest.json
├── versions.json
├── package.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

---

# 25. CI/CD

GitHub Actions：

```text
Push Tag
   ↓
npm install
   ↓
npm run build
   ↓
Release
```

Release 附件：

```text
main.js

manifest.json

styles.css
```

符合 Obsidian 社区插件发布格式。

---

# 26. 风险点

## 风险 1：Obsidian 内部公式结构变化

解决：

```text
Adapter Layer
```

不要让 MathJaxEngine 直接依赖 Obsidian DOM。

---

## 风险 2：Live Preview 与 Obsidian 原生数学 Widget 冲突

解决：

优先研究：

```text
CodeMirror Syntax Tree
```

与：

```text
Decoration precedence
```

必要时：

```text
仅对用户启用的 MathJax 4 模式进行覆盖
```

---

## 风险 3：MathJax Bundle 体积过大

解决：

不要 bundle 全部 MathJax package。

只加载：

```text
TeX

CHTML

必要 extensions

默认字体
```

其余 extension 按需加载。

---

## 风险 4：移动端性能

解决：

第一版优先桌面验证。

如果移动端性能不足：

```json
"isDesktopOnly": true
```

后续优化后再开放移动端。

---

## 风险 5：大量公式导致卡顿

解决：

```text
Cache

LRU

Debounce

Viewport Rendering

Async Queue
```

---

# 27. 开发优先级

推荐严格按照以下顺序推进：

```text
Stage 0
Obsidian MathJax 调查
        ↓
Stage 1
MathJax4 Engine
        ↓
Stage 2
Test View
        ↓
Stage 3
Reading View
        ↓
Stage 4
Live Preview
        ↓
Stage 5
Cache / Performance
        ↓
Stage 6
Macros / Packages
        ↓
Stage 7
Compatibility
        ↓
v0.1.0
```

不要一开始就尝试：

```text
Canvas
+
Hover
+
PDF
+
Mobile
+
所有 Packages
```

否则开发复杂度会快速失控。

---

# 28. 第一阶段具体开发任务

建议首先完成以下任务。

## Task 1

创建标准 Obsidian Sample Plugin 项目。

完成：

```text
manifest.json

src/main.ts

styles.css

esbuild
```

---

## Task 2

集成 MathJax 4。

创建：

```text
src/engine/MathJaxEngine.ts
```

目标：

```ts
engine.render(
    String.raw`\int_0^\infty e^{-x^2}\,dx`,
    {
        display: true
    }
)
```

返回可插入 DOM 的结果。

---

## Task 3

创建测试命令。

```text
Command:

Latest MathJax:
Open Render Test
```

---

## Task 4

完成 Version Inspector。

显示：

```text
Plugin MathJax Version

Obsidian Built-in MathJax Version
```

---

## Task 5

创建 Reading View Prototype。

只接管：

```text
$$ ... $$
```

先不处理 inline math。

---

## Task 6

Reading View 稳定后，再加入：

```text
$ ... $
```

---

## Task 7

开始 CodeMirror Live Preview Prototype。

先处理：

```text
Display Math
```

再处理：

```text
Inline Math
```

---

# 29. MVP 完成定义

当以下场景可以正常工作时，MVP 视为完成：

Markdown：

```markdown
# Math Test

Inline:

$E = mc^2$

Display:

$$
\int_0^\infty e^{-x^2}\,dx
$$

Matrix:

$$
A =
\begin{bmatrix}
1 & 2 \\
3 & 4
\end{bmatrix}
$$
```

要求：

- Reading View 正常；
- Live Preview 正常；
- 编辑公式正常；
- 切换页面正常；
- 插件关闭后恢复 Obsidian 默认公式；
- 不修改 `window.MathJax`；
- 不影响普通 Markdown；
- 公式缓存正常；
- 无明显内存泄漏。

---

# 30. 最终目标

插件最终希望形成：

```text
              Latest MathJax
                    │
        ┌───────────┴───────────┐
        │                       │
     MathJax 4              Obsidian Adapter
        │                       │
 ┌──────┼──────┐        ┌──────┼──────┐
 │      │      │        │      │      │
TeX   CHTML   SVG     Editor Preview Canvas
 │
 ├── AMS
 ├── mhchem
 ├── macros
 ├── preamble
 └── extensions
```

插件不只是“升级 MathJax 版本”，而是逐步成为：

> **Obsidian 的现代数学公式渲染兼容层。**

---

# 31. 当前最重要的下一步

优先完成：

```text
Stage 0
+
Stage 1
```

也就是：

1. 调查 Obsidian 当前 MathJax 实现；
2. 创建插件工程；
3. 集成独立 MathJax 4；
4. 完成最小 Renderer；
5. 在 Obsidian 中建立测试页面；
6. 验证 MathJax 4 与 Obsidian 内置 MathJax 能否同时存在且互不干扰。

只有这一步稳定后，再正式接管 Reading View 和 Live Preview。

---

## 项目状态

```text
Status: Planning

Target Release:
v0.1.0

Priority:
Reading View → Live Preview → Performance → Extensions
```
