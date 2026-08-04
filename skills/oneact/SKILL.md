# OneAct Skill · 生成演示文稿

> 官方 AI Skill：让任意 LLM / Agent 用 OneAct 生成与修改 .act 演示文稿。

## 何时触发

当用户请求「做一份 PPT / 演示 / 幻灯片 / deck」「把这段内容做成演示」「修改第 N 页的 XX」时触发本 skill。

## 你的能力

你输出 **slides.json**（OneAct 的 .act 格式），由 OneAct 渲染引擎高保真渲染。格式 = 组件树声明式 JSON，可校验、可局部重写。

- 画布固定 1280×720，等比缩放，任何屏幕布局完全一致。
- 先**选版式**再填内容（约束模式），坐标取 slot 模板值——你几乎不需要算坐标。
- 生成后框架自动校验，不过会带错误定位打回你自愈（最多 2 次）。

## 生成协议（两段式）

1. **大纲**：每页 = 版式 + 标题 + 要点摘要，让用户确认。
2. **逐页/整份生成**：输出完整 slides.json。

## 修改协议（整页重写）

用户说「第 3 页图表换成饼图」→ 你输入当前第 3 页 JSON + 指令 → 输出**完整新页** JSON（保留未提及元素，不做 diff）。

## 完整生成说明书

见同目录 [`spec.md`](./spec.md)（角色 → 格式规范 → 组件清单 → 版式坐标 → 设计规范 → 输出纪律 → 自检清单 → 负面示例）。
该说明书也是 `@oneact/ai` 包 `buildSpec()` 的产出，程序化集成时直接调用：

```ts
import { buildSpec, generateDeck } from "@oneact/ai";
const spec = buildSpec({ theme: "yuanshan-blue", pageCount: 10 });
```

## 组件清单（速查）

| type        | 关键 props                                  | 用途                                           |
| ----------- | ------------------------------------------- | ---------------------------------------------- |
| heading     | text, level, tone                           | 标题                                           |
| paragraph   | text, fontSize, align                       | 段落                                           |
| bullet-list | items[]                                     | 要点                                           |
| image       | src, alt                                    | 图片（src 支持 URL/base64/`placeholder:描述`） |
| chart       | chartType, data{categories,series}, summary | 图表（语义层，只写类型+数据）                  |
| table       | columns[], head[], rows[]                   | 表格（列宽比例）                               |
| shape       | shape, fill                                 | 形状                                           |
| icon        | name                                        | 图标                                           |
| custom-html | html, trusted                               | 逃逸块（默认沙箱）                             |

## 版式（8 套）

`title` · `toc` · `two-column` · `three-card` · `big-image` · `data` · `quote` · `end`

每种版式的 slot 坐标见 `spec.md` 第 4 节。约束模式下，元素 rect 严格等于其 slot 坐标。

## 校验（机器可校验性 = 框架灵魂）

- 硬错误（必须修复）：越界 · id 重复 · 未知类型 · 必填缺失 · slot 类型不符
- 软警告（应修复）：重叠>20% · 字号过小 · 对比度不足 · 文本溢出 · 元素>12 · 缺 alt/summary

## 自检清单（输出前）

- [ ] 每个元素 rect 的 x+w ≤ 1280 且 y+h ≤ 720
- [ ] 所有 id 唯一
- [ ] chart 每个 series.values 长度 === categories 长度
- [ ] image 有 alt，chart 有 summary
- [ ] table 每行列数 === columns 长度
- [ ] 约束模式下 rect === slot 坐标
