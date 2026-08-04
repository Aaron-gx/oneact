/**
 * @oneact/mcp — MCP server（策划书第 7 节 LLM 接入：任何 Agent 通过 MCP 生成/校验/重写 .act）
 *
 * stdio transport。模型配置走环境变量（key 只在本地进程，不经过任何服务器）：
 *   ONEACT_PROVIDER (openai-compatible|openai|anthropic|gemini)
 *   ONEACT_API_KEY  ONEACT_MODEL  ONEACT_BASE_URL(可选)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildSpec, createProvider, generateDeck, generateOutline, rewritePage, type ProviderKind } from "@oneact/ai";
import { LAYOUTS } from "@oneact/layouts";
import { validateDeck, type Deck, type Page } from "@oneact/schema";
import { BUILTIN_SKILLS, composeSkills, type ComposedSkill } from "@oneact/skills";

/** 把 skillIds 解析为 ComposedSkill（仅匹配内置 skill；用户导入的 skill 存在 web localStorage，MCP 进程不可见）。 */
function composeFromIds(ids: unknown): ComposedSkill | undefined {
  if (!Array.isArray(ids) || ids.length === 0) return undefined;
  const found = BUILTIN_SKILLS.filter((s) => (ids as string[]).includes(s.id));
  return found.length ? composeSkills(found) : undefined;
}

function provider() {
  const kind = (process.env.ONEACT_PROVIDER ?? "openai-compatible") as ProviderKind;
  const apiKey = process.env.ONEACT_API_KEY ?? "";
  const model = process.env.ONEACT_MODEL ?? "";
  const baseUrl = process.env.ONEACT_BASE_URL;
  if (!apiKey || !model) throw new Error("未配置 ONEACT_API_KEY / ONEACT_MODEL 环境变量（key 仅存本地）");
  return createProvider({ kind, apiKey, model, baseUrl });
}

const server = new Server({ name: "oneact-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

const TOOLS = [
  {
    name: "oneact_list_skills",
    description: "列出所有内置 skill（id/name/dimension/description/triggers），供其他工具的 skillIds 参数选用",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "oneact_get_spec",
    description: "获取 OneAct 生成说明书（作为 system prompt）",
    inputSchema: {
      type: "object",
      properties: {
        theme: { type: "string" },
        pageCount: { type: "number" },
        modelTier: { type: "string" },
        skillIds: { type: "array", items: { type: "string" }, description: "skill id（先调 oneact_list_skills 获取）" },
      },
    },
  },
  {
    name: "oneact_validate",
    description: "校验 slides.json（硬错误/软警告）",
    inputSchema: { type: "object", properties: { deck: { type: "object" } }, required: ["deck"] },
  },
  {
    name: "oneact_generate_outline",
    description: "两段式·第一步：生成大纲",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" }, theme: { type: "string" }, pageCount: { type: "number" }, skillIds: { type: "array", items: { type: "string" }, description: "skill id（先调 oneact_list_skills 获取）" } },
      required: ["topic"],
    },
  },
  {
    name: "oneact_generate_deck",
    description: "生成完整 deck（含校验自愈循环）",
    inputSchema: {
      type: "object",
      properties: { topic: { type: "string" }, theme: { type: "string" }, pageCount: { type: "number" }, skillIds: { type: "array", items: { type: "string" }, description: "skill id（先调 oneact_list_skills 获取）" } },
      required: ["topic"],
    },
  },
  {
    name: "oneact_rewrite_page",
    description: "局部修改 = 整页重写（输入当前 page + 指令）",
    inputSchema: {
      type: "object",
      properties: { page: { type: "object" }, instruction: { type: "string" }, skillIds: { type: "array", items: { type: "string" }, description: "skill id（先调 oneact_list_skills 获取）" } },
      required: ["page", "instruction"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const args = (req.params.arguments ?? {}) as Record<string, any>;
  try {
    switch (name) {
      case "oneact_list_skills":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                BUILTIN_SKILLS.map((s) => ({
                  id: s.id,
                  name: s.name,
                  dimension: s.dimension,
                  description: s.description,
                  triggers: s.triggers,
                })),
              ),
            },
          ],
        };
      case "oneact_get_spec":
        return {
          content: [
            {
              type: "text",
              text: buildSpec({
                theme: args.theme,
                pageCount: args.pageCount,
                modelTier: args.modelTier,
                skills: composeFromIds(args.skillIds),
              }),
            },
          ],
        };
      case "oneact_validate": {
        const r = validateDeck(args.deck as Deck, { layouts: LAYOUTS });
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings.length }) },
          ],
        };
      }
      case "oneact_generate_outline": {
        const out = await generateOutline({
          provider: provider(),
          topic: args.topic,
          theme: args.theme,
          pageCount: args.pageCount,
          skills: composeFromIds(args.skillIds),
        });
        return { content: [{ type: "text", text: JSON.stringify(out) }] };
      }
      case "oneact_generate_deck": {
        const { deck, result, retries } = await generateDeck({
          provider: provider(),
          topic: args.topic,
          theme: args.theme,
          pageCount: args.pageCount,
          skills: composeFromIds(args.skillIds),
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                deck,
                ok: result.ok,
                errors: result.errors.length,
                warnings: result.warnings.length,
                retries,
              }),
            },
          ],
        };
      }
      case "oneact_rewrite_page": {
        const { page, result, retries } = await rewritePage({
          provider: provider(),
          page: args.page as Page,
          instruction: args.instruction,
          skills: composeFromIds(args.skillIds),
        });
        return { content: [{ type: "text", text: JSON.stringify({ page, ok: result.ok, retries }) }] };
      }
      default:
        return { content: [{ type: "text", text: `未知工具：${name}` }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: "text", text: `错误：${(e as Error).message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    // stdio 就绪，等待 Agent 请求
  })
  .catch((e) => {
    console.error("[oneact-mcp] 启动失败：", e);
    process.exit(1);
  });
