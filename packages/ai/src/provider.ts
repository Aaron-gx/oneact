/**
 * @oneact/ai — 模型 provider 适配层
 *
 * 用户自配 key，key 只存本地，不经过任何服务器。
 * 适配：OpenAI 兼容协议（含 OpenAI / 国产模型）/ Anthropic / Gemini。
 * 统一抽象为 generate(messages) → 文本，上层生成协议不感知具体厂商。
 */

export type ProviderKind = "openai" | "openai-compatible" | "anthropic" | "gemini";

export interface ProviderConfig {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  /** OpenAI 兼容协议自定义端点（国产模型/本地 Ollama 等）。 */
  baseUrl?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** 强制 JSON 输出（OpenAI response_format / Gemini responseMimeType）。 */
  responseFormatJson?: boolean;
  /** 本次调用的真实 token 用量回调（从各厂商响应中提取，供上层累加统计）。 */
  onUsage?: (usage: TokenUsage) => void;
}

/** 一次模型调用的 token 用量（各厂商响应字段统一归一化）。 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 从厂商响应里提取真实 token 用量；无法提取时返回 null（不计入）。 */
function extractUsage(data: {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; input_tokens?: number; output_tokens?: number };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; completionTokenCount?: number; totalTokenCount?: number };
}): TokenUsage | null {
  // OpenAI / Anthropic / 兼容协议：response.usage
  const u = data.usage;
  if (u) {
    const pt = u.prompt_tokens ?? u.input_tokens ?? 0;
    const ct = u.completion_tokens ?? u.output_tokens ?? 0;
    if (pt || ct) return { promptTokens: pt, completionTokens: ct, totalTokens: u.total_tokens ?? pt + ct };
  }
  // Gemini：response.usageMetadata
  const um = data.usageMetadata;
  if (um) {
    const pt = um.promptTokenCount ?? 0;
    const ct = um.candidatesTokenCount ?? um.completionTokenCount ?? 0;
    if (pt || ct) return { promptTokens: pt, completionTokens: ct, totalTokens: um.totalTokenCount ?? pt + ct };
  }
  return null;
}

export interface LLMProvider {
  readonly config: ProviderConfig;
  generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<string>;
}

export function createProvider(config: ProviderConfig): LLMProvider {
  switch (config.kind) {
    case "anthropic":
      return { config, generate: (m, o) => anthropicChat(config, m, o) };
    case "gemini":
      return { config, generate: (m, o) => geminiChat(config, m, o) };
    case "openai":
    case "openai-compatible":
    default:
      return { config, generate: (m, o) => openaiChat(config, m, o) };
  }
}

async function openaiChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: GenerateOptions = {},
): Promise<string> {
  const base = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    model: config.model,
    messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.responseFormatJson) body.response_format = { type: "json_object" };
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI-compatible API ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const usage = extractUsage(data);
  if (usage && opts.onUsage) opts.onUsage(usage);
  return data.choices?.[0]?.message?.content ?? "";
}

async function anthropicChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: GenerateOptions = {},
): Promise<string> {
  const sys = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const userMsgs = messages.filter((m) => m.role !== "system");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    model: config.model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: userMsgs,
    temperature: opts.temperature ?? 0.4,
  };
  if (sys) body.system = sys;
  const base = (config.baseUrl ?? "https://api.anthropic.com").replace(/\/+(v\d+)?\/?$/, "");
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      // 浏览器直连 Anthropic 必须带此 header，否则 CORS 预检失败（key 仍在本地，不经服务器）
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const usage = extractUsage(data);
  if (usage && opts.onUsage) opts.onUsage(usage);
  return data.content?.find((c) => c.type === "text")?.text ?? "";
}

async function geminiChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  opts: GenerateOptions = {},
): Promise<string> {
  const sys = messages.find((m) => m.role === "system")?.content;
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { contents };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  if (opts.responseFormatJson) {
    body.generationConfig = { ...(body.generationConfig || {}), responseMimeType: "application/json" };
  }
  if (opts.temperature != null) {
    body.generationConfig = { ...(body.generationConfig || {}), temperature: opts.temperature };
  }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await safeText(res)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  const usage = extractUsage(data);
  if (usage && opts.onUsage) opts.onUsage(usage);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function safeText(res: Response): Promise<string> {
  // 安全审计修复（2026-08-02）：脱敏错误信息
  // 仅返回状态码和截断的通用描述，不暴露可能含密钥/内部路径的原始响应体
  try {
    const text = await res.text();
    // 仅在开发环境下返回更多细节（通过 localStorage 或 env 控制）
    // 生产环境：只返回状态码 + 通用提示
    const isDev = typeof localStorage !== "undefined" && localStorage.getItem("oneact-debug") === "1";
    if (isDev) {
      return `${res.status}: ${text.slice(0, 200)}`;
    }
    return `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

/** 测试用：把固定文本包成 provider（不调网络）。 */
export function mockProvider(responses: string[] | ((msgs: ChatMessage[]) => string)): LLMProvider {
  const fn = typeof responses === "function" ? responses : () => responses.shift() ?? "";
  return {
    config: { kind: "openai-compatible", apiKey: "test", model: "mock" },
    generate: async (m) => fn(m),
  };
}
