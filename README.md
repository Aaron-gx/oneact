# 一幕 OneAct

> **AI 原生的演示文档格式 + 渲染运行时 —— PPT 界的 HTML + 浏览器。**
>
> An AI-native presentation format + rendering runtime — the HTML + browser of the slides world.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-339933.svg)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9-f69220.svg)](https://pnpm.io)
[![Tests](https://img.shields.io/badge/tests-290%20passed-brightgreen.svg)](#-测试)

AI 用 JSON 写幻灯片，框架负责高保真渲染；人像用 WPS 一样逐页预览，并可用自然语言指挥 AI 局部修改任意元素。**Skill 系统让生成质量对齐「资深设计师 + 行业专家」；多 Agent 编排器自治完成「策划 → 大纲 → 逐页 → 质检 → 自愈」全流程。**

---

## ✨ 核心特性

- **格式即资产**：`slides.json` 声明式组件树，可校验、可程序化编辑、AI 生成质量稳定。
- **25 种元素**：13 基础（标题/段落/列表/图表/表格/形状/图标/公式/音视频/逃逸块…）+ 12 复合语义组件（kpi / stat-grid / feature-card / timeline / process / comparison / callout / badge / avatar…），AI 填语义字段即出整组精致视觉。
- **固定画布 + 等比缩放**：1280×720 逻辑坐标，投影仪模型——任何屏幕布局完全一致，绝不重排。
- **20 套版式 + slot 规范**：AI 先选版式再填 slot，坐标取模板值，**零坐标计算**（约束模式）；仅炫技页用自由坐标。
- **12 套主题**：远山蓝 / 墨绿 / 暖橙 / 科技深色 / 极光紫 / 森林青 / 赤金 / 深海蓝 / 樱粉 / 极简灰 / 日落 / 医疗薄荷，完整 design tokens，换肤全统一。
- **校验器（灵魂）**：硬错误（越界/id 重复/必填缺失）+ 软警告（重叠/字号/对比度/溢出）两级规则，机器可校验；不过则带错误定位打回 AI 自愈。
- **Skill 场景化知识包**：三正交维度（结构 / 视觉风格 / 行业），每维单选可叠加；9 个内置 skill（路演 / 汇报 / 答辩 / 发布会 + Apple极简 / 咨询 / 科技风 + 金融 / 医疗）+ 用户 Markdown 自导入。
- **多 Agent 编排器**：Director / Generator / Inspector / Healer 四 Agent 协作 + G1/G2/G3 三道质量门禁 + Session 会话控制（可取消/暂停），事件总线实时推送进度。
- **图表语义层**：AI 只写「类型 + 数据」，渲染层翻译——零依赖手绘 SVG（bar/line/pie/doughnut/area），颜色走主题。
- **声明式动画**：进入 / 强调 / 退出 + 页面切换，命名兼容 Office，参数仅 duration/delay/easing/stagger。
- **AI 工程化**：多模型分档路由（weak/standard/strong）+ token 预算熔断 + SSE 流式 + prompt 版本 A/B 测试 + 内容安全护栏（注入检测/输出审核/逃逸块扫描）。
- **三入口**：Web 编辑器（类 WPS 三栏 + 灵动岛问卷）/ MCP server（6 工具，任意 Agent 接入）/ CLI（9 命令）。
- **双格式导出**：`.act`（JSON + assets 目录，git 可 diff）+ 自包含单 HTML（双击即播）+ `.pptx` 降级导出（25 元素全覆盖 + 降级报告）。

## 🚀 快速开始

> **前置要求**：Node.js ≥ 18、pnpm ≥ 9（未安装 pnpm 可执行 `corepack enable`）。

```bash
pnpm install          # 安装 workspace 依赖（pnpm 9+）
pnpm test             # 运行全部单测（290 tests / 24 文件）
pnpm build:player     # 构建单文件播放器
```

**30 秒可体验**：构建后双击 `packages/player/dist/runtime.html`，即播内置「一幕自荐」示例（缩略图栏 + 键盘翻页 + 切换动画 + 手绘图表）。

**Web 编辑器**（三栏编辑 + AI 生成 + skill 管理）：

```bash
node apps/web/build.mjs   # 构建 dist/editor.html
node apps/web/serve.mjs   # 本地预览服务
```

**CLI**（9 命令）：

```bash
oneact validate examples/self-intro.act.json        # 校验
oneact from-md examples/sample.md out.act.json      # Markdown → .act
oneact export examples/self-intro.act.json out.html # 导出自包含 HTML
oneact export deck.act.json out.pptx                # 降级导出 pptx（附降级报告）
oneact serve examples/self-intro.act.json           # 舞台预览服务（默认 5173）
oneact http                                          # HTTP 渲染服务（POST /render，默认 5200）
oneact benchmark --tier strong                      # 黄金测试集跑分
```

## 🧩 用作 SDK

渲染 + 校验：

```ts
import { renderDeck, validateDeck } from "@oneact/core";
import "@oneact/components"; // 导入即注册全部 25 个组件
import { LAYOUTS } from "@oneact/layouts";

const deck = await fetch("./self-intro.act.json").then((r) => r.json());
const html = renderDeck(deck); // → HTML 字符串，innerHTML 即挂载
const result = validateDeck(deck, { layouts: LAYOUTS }); // { ok, errors, warnings }
```

AI 生成（用户自配 key）+ skill 注入：

```ts
import { createProvider, generateDeck } from "@oneact/ai";
import { BUILTIN_SKILLS, composeSkills } from "@oneact/skills";

const provider = createProvider({ kind: "openai-compatible", apiKey: process.env.KEY!, model: "gpt-4o" });
// 选 skill 组合并注入（路演结构 + Apple极简 + 金融行业）
const skills = composeSkills([
  BUILTIN_SKILLS.find((s) => s.id === "startup-pitch")!,
  BUILTIN_SKILLS.find((s) => s.id === "apple-minimal")!,
  BUILTIN_SKILLS.find((s) => s.id === "finance")!,
]);
const { deck, result, retries } = await generateDeck({
  provider, topic: "AI 创业项目", theme: "mono-slate", skills,
});
// 内置校验自愈：不过自动重试，仍不过如实返回
```

多 Agent 编排（自治全流程）：

```ts
import { generate } from "@oneact/orchestrator";
const res = await generate({ provider, answers: { topic: "Q3 复盘" }, skills, onEvent: console.log });
// Director → Generator → Inspector → Healer，三道门禁逐级把关，自愈最多 3 轮
```

## 📦 monorepo 结构（12 包 + 2 应用）

```
oneact/
├── packages/
│   ├── schema/          格式定义 + 25 元素类型 + 校验器 + 迁移器 + JSON Schema + 12 主题
│   ├── core/            渲染引擎 + 组件注册表 + 主题/动画引擎 + 离屏测量
│   ├── components/      25 个内置组件（手绘 SVG 图表 + 逃逸块消毒 + KaTeX 公式）
│   ├── layouts/         20 套版式 + slot 规范 + auto 高度引擎
│   ├── ai/              provider 适配 + 两段式生成 + 校验自愈 + 分档路由 + 预算 + 流式 + 安全护栏 + skill 应用
│   ├── skills/          场景化 skill（三维度 + 9 内置 + Markdown 导入解析）
│   ├── orchestrator/    多 Agent 编排（4 Agent + 3 门禁 + Session + 事件总线）
│   ├── player/          单文件播放器 runtime.html
│   ├── exporter-deck/   .act 打包 + 自包含单 HTML
│   ├── exporter-pptx/   pptx 降级导出（25 元素全覆盖 + 降级报告）
│   ├── mcp/             MCP server（6 工具，任意 Agent 接入）
│   └── cli/             9 命令（validate/init/from-md/from-pptx/export/serve/http/benchmark）
├── apps/
│   ├── web/             在线编辑器（三栏 + 灵动岛问卷 + skill 管理 + AI 可视化）
│   └── desktop/         Tauri 壳（关联 .act，复用 player runtime）
└── examples/            self-intro.act.json「一幕自荐」+ golden 黄金集 + sample.md
```

## 🧪 测试

```bash
pnpm test   # vitest，290 tests / 24 文件：校验器 / 几何 / 动画 / 图表 SVG / 消毒 / 版式 / 自愈循环 / 编排门禁 / skill 叠加 / frontmatter 解析
```

## 🗺 演进路线

| 版本 | 状态 | 内容 |
| --- | --- | --- |
| **v0.1** | ✅ 完成 | 单文件 player + schema/校验器/迁移器 + 25 组件 + 20 版式 + 12 主题 + 动画 + 图表 SVG + AI 生成层 + CLI |
| **v0.2** | ✅ 完成 | md2act、HTTP 渲染服务、pptx 导入文本提取、离屏测量 |
| **v0.3** | ✅ 完成 | 流式按页预览 + 黄金测试集跑分（多档模型）+ 多模型分档路由 + token 预算 + prompt A/B + 安全护栏 |
| **v1** | ✅ 完成 | MCP server（6 工具）+ Web 编辑器（三栏 + AI 局部重写 + 灵动岛问卷）+ pptx 降级导出 |
| **+** | ✅ 完成 | 多 Agent 编排器（4 Agent + 3 门禁 + Session）+ Skill 系统（三维度 + 9 内置 + 自导入） |
| v2 | 待续 | 桌面端编译发布、协作（CRDT）、演讲者视图双屏 |
| v3 | 待续 | 插件/skill 市场、HTTP 渲染服务增强 |

> 核心地基 + AI 生成 + 编辑器 + 多 Agent 编排 + skill 均已实现并测试（290 tests 通过）。后续聚焦生态与协作。

## 🔑 设计决策摘录

- **两级生成模式**：约束模式（默认，坐标取 slot）+ 自由坐标（逃逸层专用）——根治 LLM 空间推理弱的问题。
- **Skill 三维度正交**：structure（骨架）/ style（视觉）/ domain（行业）可叠加；`composeSkills` 只收集、`applySkill` 仲裁（用户显式输入 > skill > 原推断）；单一注入入口 `SpecOptions.skills`，无 skill 时 `buildSpec` 输出零变化。
- **格式版本化**：`formatVersion` + 链式迁移器，格式冻结后永不 breaking change。
- **核心框架无关**：渲染核心输出 HTML 字符串，不绑 React；player 是纯 DOM。
- **资源策略**：`.act` 用同名 `.assets/` 目录（diff 友好，不做 base64），base64 仅用于自包含 HTML 分发产物。
- **模型 key 用户自配**：仅存本地，不经过任何服务器。

完整设计见 [`./策划书.md`](./策划书.md)。

## 🤝 贡献

欢迎 Issue / PR。提交前请跑 `pnpm lint && pnpm typecheck && pnpm test`，并遵循 [Conventional Commits](https://www.conventionalcommits.org/)（仓库已配 commitlint + husky 自动校验）。

- 🐛 **缺陷**请提 [Issue](./issues)，附最小复现（`.act` 文件或 JSON 片段）
- 💡 **功能建议**请先开 Issue 讨论，达成共识后再提 PR
- 📖 **文档与示例**（`examples/`）同样欢迎贡献，门槛低、收益大

## 🗣 反馈与社区

- [GitHub Discussions](./discussions) — 用法问答、最佳实践、showcase
- [GitHub Issues](./issues) — 缺陷报告与功能请求

## 📄 许可证

[Apache-2.0](./LICENSE)（含专利授权，大公司敢用）。© 2026 OneAct Contributors。
