/**
 * @oneact/ai — SSE 流式 token 推送（策划书 7.1.5 + AI 工程化补强 #4）
 *
 * 现状：generateDeckStream 是「按页回调」（每页完整生成后回调），不是 token 级流式。
 * 本模块提供真正的 token 级流式能力，前端可实时打字机效果。
 *
 * 架构：
 *   1. StreamableProvider — provider 扩展接口，支持 SSE token 流
 *   2. createStreamableProvider — 工厂，返回支持流式的 provider
 *   3. streamChat — 低级 SSE 流式调用
 *   4. generateDeckStreamTokens — 高级封装，逐页生成时 token 级流式
 */
import { LAYOUTS } from "@oneact/layouts";
import type { Page, ValidationResult } from "@oneact/schema";
import { validatePage } from "@oneact/schema";
import type { ComposedSkill } from "@oneact/skills";
import { extractJson } from "./generate.js";
import type { ChatMessage, GenerateOptions, LLMProvider, ProviderConfig, ProviderKind } from "./provider.js";
import type { ModelTier } from "./router.js";
import { buildSpec } from "./spec.js";

// ──────────────────────────── 流式 Provider 接口 ────────────────────────────

/** 流式生成回调：每收到一小段文本就调用。 */
export type TokenStreamCallback = (delta: string, fullText: string) => void;

/** 扩展的 Provider 接口，支持 SSE token 流。 */
export interface StreamableProvider extends LLMProvider {
  /** 流式生成：逐 token 调用 onToken，完成后返回完整文本。 */
  streamGenerate(messages: ChatMessage[], opts: GenerateOptions, onToken: TokenStreamCallback): Promise<string>;
}

// ──────────────────────────── SSE 解析 ────────────────────────────

/**
 * 解析 SSE 流的通用函数。
 *
 * OpenAI 兼容 / Anthropic / Gemini 的 SSE 格式略有不同：
 *   OpenAI:    data: {"choices":[{"delta":{"content":"xxx"}}]}
 *   Anthropic: event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"xxx"}}
 *   Gemini:    不用 SSE，用 streamGenerate 端点返回 JSON 数组流
 *
 * 本函数统一处理：从 data 行提取 delta text，调用 onToken。
 */
export async function parseSSEStream(
  response: Response,
  kind: ProviderKind,
  onToken: (delta: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response 不可流式读取（无 body）");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = extractDelta(json, kind);
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
      } catch {
        // 非 JSON data 行（如 Anthropic 的 event 行），跳过
      }
    }
  }

  return fullText;
}

/** 从不同厂商的 SSE chunk 中提取增量文本。 */
function extractDelta(chunk: Record<string, unknown>, kind: ProviderKind): string {
  switch (kind) {
    case "anthropic":
      // {"type":"content_block_delta","delta":{"type":"text_delta","text":"xxx"}}
      if (chunk.type === "content_block_delta") {
        const delta = chunk.delta as Record<string, unknown> | undefined;
        return (delta?.text as string) ?? "";
      }
      return "";
    case "gemini": {
      // Gemini streamGenerate 返回的是完整 candidates 结构的数组
      const candidates = chunk.candidates as Record<string, unknown>[] | undefined;
      const parts = candidates?.[0]?.content as Record<string, unknown> | undefined;
      const partsArr = parts?.parts as Record<string, unknown>[] | undefined;
      return (partsArr?.[0]?.text as string) ?? "";
    }
    case "openai":
    case "openai-compatible":
    default: {
      // {"choices":[{"delta":{"content":"xxx"}}]}
      const choices = chunk.choices as Record<string, unknown>[] | undefined;
      const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
      return (delta?.content as string) ?? "";
    }
  }
}

// ──────────────────────────── 流式 Provider 工厂 ────────────────────────────

/** 创建支持 SSE 流式的 provider。若环境不支持流式则回退为普通 provider + 模拟流式。 */
export function createStreamableProvider(config: ProviderConfig): StreamableProvider {
  return new SSEStreamableProvider(config);
}

class SSEStreamableProvider implements StreamableProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generate(messages: ChatMessage[], opts: GenerateOptions = {}): Promise<string> {
    // 非流式调用（复用底层 fetch）
    return this.streamGenerate(messages, opts, () => {});
  }

  async streamGenerate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
    onToken: TokenStreamCallback,
  ): Promise<string> {
    const { kind, apiKey, model, baseUrl } = this.config;

    if (kind === "anthropic") {
      return this.streamAnthropic(messages, opts, onToken);
    }

    // OpenAI 兼容 + OpenAI：用 stream: true
    const base = (baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      stream: true,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.responseFormatJson) body.response_format = { type: "json_object" };

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Stream API ${res.status}: ${await safeText(res)}`);
    if (!res.body) throw new Error("Response 无 body，不支持流式");

    return parseSSEStream(res, kind, (delta) => onToken(delta, ""));
  }

  private async streamAnthropic(
    messages: ChatMessage[],
    opts: GenerateOptions,
    onToken: TokenStreamCallback,
  ): Promise<string> {
    const { apiKey, model } = this.config;
    const sys = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const userMsgs = messages.filter((m) => m.role !== "system");
    const body = {
      model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: userMsgs,
      temperature: opts.temperature ?? 0.4,
      stream: true,
      ...(sys ? { system: sys } : {}),
    };

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Anthropic Stream ${res.status}: ${await safeText(res)}`);
    return parseSSEStream(res, "anthropic", (delta) => onToken(delta, ""));
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "<no body>";
  }
}

// ──────────────────────────── 高级：逐页 token 级流式生成 ────────────────────────────

export interface StreamTokensOptions {
  provider: StreamableProvider;
  topic: string;
  pageCount?: number;
  theme?: string;
  modelTier?: ModelTier;
  /** 场景化知识（skill 组合），注入 buildSpec §12。 */
  skills?: ComposedSkill;
  /** token 级回调（打字机效果） */
  onToken?: (delta: string, fullText: string) => void;
  /** 单页生成完成回调 */
  onPage?: (page: Page, index: number, total: number) => void;
  /** 大纲完成回调 */
  onOutline?: (totalPages: number) => void;
  maxRetries?: number;
}

export interface StreamTokensResult {
  pages: Page[];
  retries: number;
}

/**
 * 流式逐页生成，每页 token 级实时输出。
 *
 * 前端用法：
 *   for await (const event of streamDeckEvents(provider, { topic, onToken, onPage })) {
 *     // event.type: "outline" | "page_token" | "page_done" | "complete"
 *   }
 */
export async function generateDeckStreamTokens(opts: StreamTokensOptions): Promise<StreamTokensResult> {
  const layouts = LAYOUTS;
  const tier = opts.modelTier ?? "standard";
  const maxRetries = opts.maxRetries ?? 2;
  const pages: Page[] = [];
  let totalRetries = 0;

  // Step 1: 生成大纲（非流式，大纲很短）
  const outlineSpec =
    buildSpec({ theme: opts.theme, pageCount: opts.pageCount, modelTier: tier, skills: opts.skills }) +
    '\n\n【第一步·大纲】只输出大纲 JSON：{"title","theme","pages":[{"layout","title","summary"}]}';
  const outlineRaw = await opts.provider.generate(
    [
      { role: "system", content: outlineSpec },
      { role: "user", content: `主题：${opts.topic}\n请生成大纲（约 ${opts.pageCount ?? 8} 页）。` },
    ],
    { responseFormatJson: true, temperature: 0.5 },
  );

  let outline: { title: string; theme: string; pages: { layout: string; title: string; summary: string }[] };
  try {
    outline = JSON.parse(extractJson(outlineRaw));
  } catch {
    outline = {
      title: opts.topic,
      theme: opts.theme ?? "yuanshan-blue",
      pages: [{ layout: "cover", title: opts.topic, summary: "" }],
    };
  }

  opts.onOutline?.(outline.pages.length);

  // Step 2: 逐页流式生成
  for (let i = 0; i < outline.pages.length; i++) {
    const item = outline.pages[i];
    const pageSpec =
      buildSpec({ theme: opts.theme, pageCount: 1, modelTier: tier, skills: opts.skills }) +
      `\n\n【逐页生成】只输出单个 page 对象 JSON（含 id/layout/title/elements）。参考版式：${item.layout}；标题：${item.title}。`;

    let attempts = 0;
    let page: Page | null = null;

    while (attempts <= maxRetries && !page) {
      attempts++;
      let fullText = "";

      const raw = await opts.provider.streamGenerate(
        [
          { role: "system", content: pageSpec },
          {
            role: "user",
            content: `生成第 ${i + 1} 页（${item.layout}）— 标题：${item.title}\n内容要点：${item.summary}`,
          },
        ],
        { responseFormatJson: true, temperature: 0.4 },
        (delta, current) => {
          fullText = current || fullText + delta;
          opts.onToken?.(delta, fullText);
        },
      );

      try {
        const parsed = JSON.parse(extractJson(raw)) as Page;
        const issues = validatePage(parsed, { layouts });
        if (!issues.some((iss) => iss.severity === "error")) {
          parsed.id = `p${i + 1}`;
          page = parsed;
        }
      } catch {
        // JSON 解析失败，重试
      }
    }

    if (page) {
      pages.push(page);
      opts.onPage?.(page, i, outline.pages.length);
    } else {
      totalRetries += attempts;
    }
  }

  return { pages, retries: totalRetries };
}
