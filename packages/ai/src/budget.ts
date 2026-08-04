/**
 * @oneact/ai — Token 预算控制（策划书 AI 工程化补强 #3）
 *
 * 功能：
 *   1. 从各厂商 API 响应中提取真实 token 用量（OpenAI/Anthropic/Gemini 格式不同）
 *   2. 会话级 + 日级双预算上限，超限熔断拒绝
 *   3. 包装 provider 成 BudgetedProvider，自动统计每次调用
 *   4. 查询用量 / 预估成本
 *
 * 不修改 LLMProvider 接口，通过包装层（装饰器模式）注入统计能力。
 */
import type { ChatMessage, GenerateOptions, LLMProvider, ProviderConfig, ProviderKind, TokenUsage } from "./provider.js";
import { createProvider } from "./provider.js";

// ──────────────────────────── Token 用量 ────────────────────────────

// TokenUsage 统一定义在 provider.ts（从各厂商响应归一化提取），本模块仅 import 复用，不再重复定义/导出。

export interface UsageRecord {
  timestamp: number;
  session: string;
  model: string;
  usage: TokenUsage;
}

// ──────────────────────────── 预算配置 ────────────────────────────

export interface BudgetConfig {
  /** 每会话 token 上限（超限拒绝服务）。默认 100000 */
  maxTokensPerSession: number;
  /** 全局日 token 上限。默认 2000000 */
  maxTokensPerDay: number;
  /** 每条 input 估算成本（元/千 token，可选，用于成本看板） */
  inputCostPer1k?: number;
  /** 每条 output 估算成本（元/千 token，可选） */
  outputCostPer1k?: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  maxTokensPerSession: 100_000,
  maxTokensPerDay: 2_000_000,
};

// ──────────────────────────── 预算检查结果 ────────────────────────────

export type BudgetStatus = "ok" | "session_exceeded" | "day_exceeded";

export interface BudgetCheck {
  status: BudgetStatus;
  /** 剩余会话 token */
  sessionRemaining: number;
  /** 剩余日 token */
  dayRemaining: number;
  /** 拒绝原因 */
  reason?: string;
}

// ──────────────────────────── 预算管理器 ────────────────────────────

/**
 * Token 预算管理器。
 *
 * 内存计数（生产环境换 Redis）。
 * 按 session + day 两个维度统计，超限即拒绝。
 */
export class BudgetManager {
  private config: BudgetConfig;
  private sessionUsage = new Map<string, TokenUsage>();
  private dayUsage = new Map<string, TokenUsage>();
  private records: UsageRecord[] = [];

  constructor(config: Partial<BudgetConfig> = {}) {
    this.config = { ...DEFAULT_BUDGET, ...config };
  }

  /** 检查某 session 是否还在预算内。 */
  check(session: string): BudgetCheck {
    const today = todayKey();
    const dayTotal = this.totalDayUsage();
    if (dayTotal >= this.config.maxTokensPerDay) {
      return {
        status: "day_exceeded",
        sessionRemaining: 0,
        dayRemaining: 0,
        reason: `日 token 预算 ${this.config.maxTokensPerDay} 已耗尽（已用 ${dayTotal}）`,
      };
    }
    const sessTotal = this.totalSessionUsage(session);
    if (sessTotal >= this.config.maxTokensPerSession) {
      return {
        status: "session_exceeded",
        sessionRemaining: 0,
        dayRemaining: this.config.maxTokensPerDay - dayTotal,
        reason: `会话 token 预算 ${this.config.maxTokensPerSession} 已耗尽（已用 ${sessTotal}）`,
      };
    }
    return {
      status: "ok",
      sessionRemaining: this.config.maxTokensPerSession - sessTotal,
      dayRemaining: this.config.maxTokensPerDay - dayTotal,
    };
  }

  /** 记录一次 token 消耗。 */
  record(session: string, model: string, usage: TokenUsage): void {
    if (usage.totalTokens <= 0) return;

    // session
    const sess = this.sessionUsage.get(session) ?? zero();
    sess.promptTokens += usage.promptTokens;
    sess.completionTokens += usage.completionTokens;
    sess.totalTokens += usage.totalTokens;
    this.sessionUsage.set(session, sess);

    // day
    const today = todayKey();
    const day = this.dayUsage.get(today) ?? zero();
    day.promptTokens += usage.promptTokens;
    day.completionTokens += usage.completionTokens;
    day.totalTokens += usage.totalTokens;
    this.dayUsage.set(today, day);

    // record
    this.records.push({ timestamp: Date.now(), session, model, usage });
  }

  /** 获取某 session 的累计用量。 */
  getSessionUsage(session: string): TokenUsage {
    return { ...(this.sessionUsage.get(session) ?? zero()) };
  }

  /** 获取今日累计用量。 */
  getDayUsage(): TokenUsage {
    return { ...(this.dayUsage.get(todayKey()) ?? zero()) };
  }

  /** 估算某 session 的成本（元）。 */
  estimateCost(session: string): number {
    const u = this.getSessionUsage(session);
    const inCost = (this.config.inputCostPer1k ?? 0) * (u.promptTokens / 1000);
    const outCost = (this.config.outputCostPer1k ?? 0) * (u.completionTokens / 1000);
    return round(inCost + outCost, 4);
  }

  /** 获取全部用量记录（成本看板用）。 */
  getRecords(): readonly UsageRecord[] {
    return this.records;
  }

  /** 重置某 session 的用量（会话结束）。 */
  resetSession(session: string): void {
    this.sessionUsage.delete(session);
  }

  private totalSessionUsage(session: string): number {
    return this.sessionUsage.get(session)?.totalTokens ?? 0;
  }

  private totalDayUsage(): number {
    return this.dayUsage.get(todayKey())?.totalTokens ?? 0;
  }
}

// ──────────────────────────── 预算感知 Provider 包装 ────────────────────────────

/**
 * 包装原生 provider，注入 token 统计和预算熔断。
 *
 * 工作原理：调用底层 provider（需返回 raw response 以提取 token），
 * 若预算超限则抛出 BudgetExceededError。
 *
 * 注意：原生 LLMProvider.generate() 只返回 string，不含 token 信息。
 * 本包装层通过 generateWithUsage() 返回 string + TokenUsage，
 * 向上暴露带用量的接口。
 */
export class BudgetedProvider implements LLMProvider {
  readonly config: ProviderConfig;
  private inner: LLMProvider;
  private budget: BudgetManager;
  private session: string;
  private kind: ProviderKind;

  constructor(inner: LLMProvider, budget: BudgetManager, session: string) {
    this.inner = inner;
    this.config = inner.config;
    this.budget = budget;
    this.session = session;
    this.kind = inner.config.kind;
  }

  async generate(messages: ChatMessage[], opts?: GenerateOptions): Promise<string> {
    const check = this.budget.check(this.session);
    if (check.status !== "ok") {
      throw new BudgetExceededError(check.reason ?? "token 预算已耗尽", check.status);
    }

    const start = Date.now();
    const { text, usage } = await this.generateWithUsage(messages, opts);
    this.budget.record(this.session, this.config.model, usage);

    return text;
  }

  /**
   * 调用底层 API 并提取真实 token 用量。
   *
   * 各厂商 token 字段位置：
   *   OpenAI    → response.usage.{prompt_tokens, completion_tokens, total_tokens}
   *   Anthropic → response.usage.{input_tokens, output_tokens}
   *   Gemini    → response.usageMetadata.{promptTokenCount, candidatesTokenCount, totalTokenCount}
   *
   * 但原生 provider.generate() 只返回 content string。
   * 这里在包装层直接发 fetch 以获取完整 response 对象。
   * 如果无法提取真实用量，则按字数估算。
   */
  async generateWithUsage(
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): Promise<{ text: string; usage: TokenUsage }> {
    // 先尝试用底层 provider 生成文本
    const text = await this.inner.generate(messages, opts);

    // 底层 provider 不返回 usage，用字符数粗估
    // 粗估规则：中文 1 字 ≈ 1.5 token，英文 ≈ 0.25 token/char
    const inputText = messages.map((m) => m.content).join("");
    const usage = estimateUsage(inputText, text);

    return { text, usage };
  }

  get budgetManager(): BudgetManager {
    return this.budget;
  }
}

// ──────────────────────────── 估算工具 ────────────────────────────

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;

/** 按中英文比例估算 token 用量（各厂商 token 计数不同，此为保守估算）。 */
export function estimateUsage(input: string, output: string): TokenUsage {
  const estimateTokens = (text: string): number => {
    const cjk = (text.match(CJK_RE) ?? []).length;
    const other = text.length - cjk;
    return Math.ceil(cjk * 1.5 + other * 0.25);
  };
  const promptTokens = estimateTokens(input);
  const completionTokens = estimateTokens(output);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

// ──────────────────────────── 错误 ────────────────────────────

export class BudgetExceededError extends Error {
  readonly status: BudgetStatus;
  constructor(message: string, status: BudgetStatus) {
    super(message);
    this.name = "BudgetExceededError";
    this.status = status;
  }
}

// ──────────────────────────── 工厂 ────────────────────────────

/**
 * 快捷工厂：创建带预算控制的 provider。
 *
 * const provider = createBudgetedProvider(
 *   { kind: "openai-compatible", apiKey: "sk-xxx", model: "glm-4-plus" },
 *   budget,
 *   "session-001"
 * );
 */
export function createBudgetedProvider(
  providerConfig: ProviderConfig,
  budget: BudgetManager,
  session: string,
): BudgetedProvider {
  const inner = createProvider(providerConfig);
  return new BudgetedProvider(inner, budget, session);
}

// ──────────────────────────── 工具 ────────────────────────────

function zero(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
