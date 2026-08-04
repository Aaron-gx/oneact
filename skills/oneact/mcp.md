# OneAct MCP Server · 工具定义

> 任何 Agent（Claude / Cursor / 自建）通过 MCP 接入 OneAct，即可生成 / 校验 / 修改 .act 演示。
> 工具实现对应 `@oneact/ai` 包的导出函数。v1 提供官方 MCP server（基于 @modelcontextprotocol/sdk）。

## 工具清单

### `oneact_get_spec`

获取生成说明书（system prompt 用）。

- 入参：`{ theme?: string, pageCount?: number, modelTier?: "weak"|"standard"|"strong" }`
- 返回：说明书文本（见 `spec.md`）
- 对应：`buildSpec()`

### `oneact_generate_outline`

两段式第一步：生成大纲。

- 入参：`{ topic: string, theme?: string, pageCount?: number }`
- 返回：`{ title, theme, pages: [{ layout, title, summary }] }`
- 对应：`generateOutline()`

### `oneact_generate_deck`

整份生成（含校验自愈循环）。

- 入参：`{ topic: string, theme?: string, pageCount?: number, maxRetries?: number }`
- 返回：`{ deck: <slides.json>, ok: boolean, errors[], warnings[], retries }`
- 对应：`generateDeck()`

### `oneact_rewrite_page`

局部修改 = 整页重写。

- 入参：`{ page: <page json>, instruction: string, maxRetries?: number }`
- 返回：`{ page: <新 page json>, ok, errors[], warnings[], retries }`
- 对应：`rewritePage()`

### `oneact_validate`

校验任意 slides.json。

- 入参：`{ deck: <slides.json> }`
- 返回：`{ ok, errors[], warnings[] }`
- 对应：`validateDeck()`

## Provider 配置

MCP server 启动时由用户配置模型 provider（key 仅存本地）：

```jsonc
{
  "kind": "openai-compatible", // openai | openai-compatible | anthropic | gemini
  "apiKey": "<用户自配>",
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1", // 国产模型 / 本地 Ollama 可改
}
```

## 设计要点

- **两段式**：先 `generate_outline` 让用户确认，再 `generate_deck`，避免一口气跑偏。
- **自愈**：`generate_deck` / `rewrite_page` 内部已含校验→重试循环（默认 2 次），Agent 无需手动重试。
- **多模型分档**：弱模型传 `modelTier: "weak"` → 强制约束模式（禁自由坐标）+ 更多约束。
