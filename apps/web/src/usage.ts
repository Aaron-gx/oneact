/**
 * @oneact/web — AI 用量记录（usage.ts）
 *
 * 详细记录每次 AI 调用（生成整套 / 改这页 / 测试连接 / 简报），存 localStorage，主页「AI 用量」展示。
 * 用于复盘模型使用情况、成功率、生成页数、耗时等。
 */
export interface UsageEntry {
  /** 毫秒时间戳 */
  t: number;
  /** 调用类型 */
  type: "generate" | "rewrite" | "test" | "brief";
  /** 模型名 */
  model?: string;
  /** 服务商 */
  kind?: string;
  /** 显示名 */
  label?: string;
  /** 主题（生成）或指令（改这页） */
  topic?: string;
  /** 是否成功 */
  ok: boolean;
  /** 生成页数（generate） */
  pages?: number;
  /** 自愈重试次数 */
  retries?: number;
  /** 耗时 ms */
  ms?: number;
  /** 输入 token（prompt） */
  promptTokens?: number;
  /** 输出 token（completion） */
  completionTokens?: number;
  /** 总 token */
  totalTokens?: number;
  /** 失败原因 */
  error?: string;
}

const KEY = "oneact-usage";
const MAX = 500;

export function getUsage(): UsageEntry[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function recordUsage(e: Omit<UsageEntry, "t">): void {
  const list = getUsage();
  list.push({ ...e, t: Date.now() });
  while (list.length > MAX) list.shift();
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 配额满：静默 */
  }
}

export function clearUsage(): void {
  localStorage.removeItem(KEY);
}

export interface UsageSummary {
  total: number;
  ok: number;
  fail: number;
  successRate: number;
  totalPages: number;
  totalMs: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  byType: Record<string, number>;
  byModel: { model: string; count: number; ok: number; tokens: number }[];
}

export function summarizeUsage(entries: UsageEntry[]): UsageSummary {
  const byType: Record<string, number> = {};
  const modelMap: Record<string, { count: number; ok: number; tokens: number }> = {};
  let ok = 0;
  let totalPages = 0;
  let totalMs = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  for (const e of entries) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.ok) ok++;
    if (e.pages) totalPages += e.pages;
    if (e.ms) totalMs += e.ms;
    if (e.totalTokens) totalTokens += e.totalTokens;
    if (e.promptTokens) promptTokens += e.promptTokens;
    if (e.completionTokens) completionTokens += e.completionTokens;
    const m = e.model || "(未知模型)";
    modelMap[m] = modelMap[m] || { count: 0, ok: 0, tokens: 0 };
    modelMap[m].count++;
    if (e.ok) modelMap[m].ok++;
    if (e.totalTokens) modelMap[m].tokens += e.totalTokens;
  }
  return {
    total: entries.length,
    ok,
    fail: entries.length - ok,
    successRate: entries.length ? Math.round((ok / entries.length) * 100) : 0,
    totalPages,
    totalMs,
    totalTokens,
    promptTokens,
    completionTokens,
    byType,
    byModel: Object.entries(modelMap)
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.count - a.count),
  };
}
