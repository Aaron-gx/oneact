/**
 * @oneact/orchestrator — 核心类型定义（v3 · 协作回路 + 会话控制）
 *
 * 以策划书定义的"协作回路"为核心：
 *   人指定某页某元素 → AI 只重写该片段 → 校验器检查 → 重渲染 → 人继续指示
 *
 * v3 关键改进：
 *   · Inspector 独占校验（返回完整 InspectionReport，Conductor 不重复校验）
 *   · ErrorLocation 结构化错误定位（Healer 精准修复，不盲猜）
 *   · Director 全权负责 Brief + Outline（职责边界清晰）
 *   · Session 会话控制器（可取消/暂停/恢复/断点续传）
 */
import type { Brief, Outline } from "@oneact/ai";
import type { GuardResult, LLMProvider } from "@oneact/ai";
import type { BriefAnswers } from "@oneact/ai";
import type { ComposedSkill } from "@oneact/skills";
import type { Deck, LayoutDef, Page, ValidationResult } from "@oneact/schema";

// ──────────────────────────────── Agent 角色 ────────────────────────────────

export type AgentRole = "conductor" | "director" | "generator" | "inspector" | "healer";

/** 运行模式。 */
export type RunMode = "generate" | "edit";

// ──────────────────────────────── 编排上下文 ────────────────────────────────

/** 传递给 Agent 的执行上下文（管线状态快照）。 */
export interface AgentContext {
  /** 本次会话 id。 */
  sessionId: string;
  /** 运行模式。 */
  mode: RunMode;
  /** 原始主题（生成模式）或用户指令（编辑模式）。 */
  topic: string;
  /** 当前 brief（生成模式，Director 产出）。 */
  brief?: Brief;
  /** 当前大纲（生成模式，Director 产出）。 */
  outline?: Outline;
  /** 当前 deck（两种模式均有，编辑模式的核心输入）。 */
  deck?: Deck;
  /** 编辑模式：用户指令。 */
  instruction?: string;
  /** 编辑模式：要修改的页 id。 */
  targetPageId?: string;
  /** 版式表。 */
  layouts: Record<string, LayoutDef>;
  /** 约束。 */
  constraints: AgentConstraints;
  /** 来自上游 Agent 的上下文传递。 */
  handoff?: Record<string, unknown>;
  /** v3：取消信号（Session 注入，Agent 在耗时操作前检查）。 */
  cancelToken?: CancelToken;
}

/** v3：取消令牌。Agent 在耗时操作前调用 shouldCancel() 判断是否应中止。 */
export interface CancelToken {
  /** 返回 true 表示用户已请求取消。 */
  shouldCancel(): boolean;
}

/** v3：常量取消令牌——永不取消。 */
export const NEVER_CANCEL: CancelToken = { shouldCancel: () => false };

/** Agent 约束配置。 */
export interface AgentConstraints {
  /** 单页最大重试次数。 */
  maxPageRetries: number;
  /** 全局最大自愈轮次。 */
  maxHealRounds: number;
  /** 模型分档。 */
  modelTier: "weak" | "standard" | "strong";
  /** 警告阈值（超过此数视为校验失败）。 */
  maxWarnings: number;
  /** 是否启用离屏真实测量（Inspector 终审）。 */
  enableOffscreenMeasure: boolean;
}

// ──────────────────────────────── v3：结构化错误定位 ────────────────────────────────

/**
 * v3：结构化错误定位。
 *
 * Healer 拿到这个对象就知道该修哪个页的哪个元素的什么问题，
 * 不再需要从裸字符串里盲猜。
 */
export interface ErrorLocation {
  /** 出错的页 id。 */
  pageId: string;
  /** 出错的元素 id（如能定位到元素）。 */
  elementId?: string;
  /** 校验规则 id（机读，如 "rect-out-of-bounds"）。 */
  rule: string;
  /** 人类可读的错误说明。 */
  message: string;
  /** 修复建议（Healer 优先采用）。 */
  suggestion?: string;
}

// ──────────────────────────────── v3：检查报告 ────────────────────────────────

/**
 * v3：Inspector 的完整产出。
 *
 * Conductor 直接使用这个判断，不再自己重复 validateDeck。
 */
export interface InspectionReport {
  /** 校验结果（公式估算 + 可选离屏测量）。 */
  validation: ValidationResult;
  /** 内容安全扫描结果。 */
  guard: GuardResult;
  /** 结构化错误定位列表（从 validation.errors 转换）。 */
  errors: ErrorLocation[];
  /** 综合质量评分（0-1）。 */
  score: number;
  /** 是否通过门禁。 */
  passed: boolean;
}

// ──────────────────────────────── Agent 结果 ────────────────────────────────

export interface AgentResult {
  success: boolean;
  /** 产出物。 */
  artifact?: Brief | Outline | Page | Page[] | Deck | InspectionReport | Record<string, unknown>;
  /** 质量自评（0-1）。 */
  selfScore?: number;
  /** 给下游的注意事项。 */
  notes?: string[];
  /** 失败原因。 */
  error?: string;
  /** token 消耗。 */
  tokensUsed?: number;
  /** 耗时 ms。 */
  durationMs?: number;
}

// ──────────────────────────────── Agent 接口 ────────────────────────────────

/** 专家 Agent 统一接口。 */
export interface Agent {
  readonly role: AgentRole;
  /** 执行 Agent 职责。 */
  execute(ctx: AgentContext): Promise<AgentResult>;
}

// ──────────────────────────────── 管线事件 ────────────────────────────────

export type PipelineEvent =
  | { type: "session:start"; sessionId: string; mode: RunMode; topic: string }
  | { type: "phase:start"; phase: string }
  | { type: "phase:complete"; phase: string; durationMs: number; score?: number }
  | { type: "gate:result"; passed: boolean; gate: string; details: string }
  | { type: "heal:retry"; attempt: number; strategy: string; pageId?: string }
  | { type: "page:ready"; pageId: string; index: number; total: number }
  | { type: "outline:ready"; totalPages: number }
  | { type: "brief:ready"; title: string; theme: string; pageCount: number }
  | { type: "deck:updated"; pageId?: string }
  | { type: "session:complete"; sessionId: string; success: boolean; durationMs: number; stats: SessionStats }
  | { type: "session:cancelled"; sessionId: string; reason: string }
  | { type: "error"; agent: AgentRole; message: string; recoverable: boolean };

// ──────────────────────────────── 会话结果 ────────────────────────────────

/** 生成模式结果。 */
export interface GenerateResult {
  success: boolean;
  deck: Deck | null;
  brief: Brief | null;
  outline: Outline | null;
  validation: ValidationResult | null;
  guard: GuardResult | null;
  stats: SessionStats;
  /** v3：是否被用户取消。 */
  cancelled?: boolean;
  error?: string;
}

/** 编辑模式结果。 */
export interface EditResult {
  success: boolean;
  /** 修改后的页面（编辑模式核心产出）。 */
  page: Page | null;
  /** 修改后的完整 deck（可选，便于调用方整体替换）。 */
  deck: Deck | null;
  validation: ValidationResult | null;
  stats: SessionStats;
  /** v3：是否被用户取消。 */
  cancelled?: boolean;
  error?: string;
}

/** 会话统计。 */
export interface SessionStats {
  totalRetries: number;
  firstPass: boolean;
  gatePasses: number;
  gateFailures: number;
  healStrategies: string[];
}

// ──────────────────────────────── v3：会话控制器 ────────────────────────────────

/** 会话状态。 */
export type SessionStatus = "running" | "paused" | "cancelled" | "completed" | "failed";

/**
 * v3：会话控制器。
 *
 * 有状态的会话管理，支持取消/暂停/恢复。
 * generate()/edit() 内部创建 Session，外部可通过返回值控制。
 */
export class Session {
  private _status: SessionStatus = "running";
  private _cancelReason: string | null = null;

  /** 创建取消令牌（注入 AgentContext）。 */
  readonly cancelToken: CancelToken = {
    shouldCancel: () => this._status === "cancelled",
  };

  get status(): SessionStatus {
    return this._status;
  }

  get isCancelled(): boolean {
    return this._status === "cancelled";
  }

  get cancelReason(): string | null {
    return this._cancelReason;
  }

  /** 用户请求取消。 */
  cancel(reason = "用户取消"): void {
    if (this._status === "running" || this._status === "paused") {
      this._status = "cancelled";
      this._cancelReason = reason;
    }
  }

  /** 暂停（Agent 在下一个检查点感知）。 */
  pause(): void {
    if (this._status === "running") {
      this._status = "paused";
    }
  }

  /** 恢复。 */
  resume(): void {
    if (this._status === "paused") {
      this._status = "running";
    }
  }

  /** 标记完成。 */
  complete(): void {
    if (this._status !== "cancelled") {
      this._status = "completed";
    }
  }

  /** 标记失败。 */
  fail(): void {
    if (this._status !== "cancelled") {
      this._status = "failed";
    }
  }
}

// ──────────────────────────────── 配置 ────────────────────────────────

/** Conductor 配置（生成模式）。 */
export interface GenerateConfig {
  provider: LLMProvider;
  answers: BriefAnswers;
  layouts?: Record<string, LayoutDef>;
  useAiBrief?: boolean;
  /** 场景化 skill 组合（注入 buildSpec §12；structure 覆盖 brief.sections）。 */
  skills?: ComposedSkill;
  constraints?: Partial<AgentConstraints>;
  onEvent?: (event: PipelineEvent) => void;
  onPage?: (page: Page, index: number, total: number) => void;
  /**
   * 会话控制器（可选）。
   * 传入时调用方可通过 session.cancel() 随时打断生成。
   * 不传时内部创建一个临时 session（无法外部取消）。
   */
  session?: Session;
}

/** Conductor 配置（编辑模式）。 */
export interface EditConfig {
  provider: LLMProvider;
  /** 当前完整 deck。 */
  deck: Deck;
  /** 用户指令，如"把第3页的图表换成饼图"。 */
  instruction: string;
  /** 要修改的页 id（如未指定，由 Director 解析指令推断）。 */
  targetPageId?: string;
  layouts?: Record<string, LayoutDef>;
  /** 场景化 skill 组合（注入 buildSpec §12）。 */
  skills?: ComposedSkill;
  constraints?: Partial<AgentConstraints>;
  onEvent?: (event: PipelineEvent) => void;
  /**
   * 会话控制器（可选）。
   * 传入时调用方可通过 session.cancel() 随时打断编辑。
   * 不传时内部创建一个临时 session（无法外部取消）。
   */
  session?: Session;
}

// ──────────────────────────────── 默认约束 ────────────────────────────────

export const DEFAULT_CONSTRAINTS: AgentConstraints = {
  maxPageRetries: 2,
  maxHealRounds: 3,
  modelTier: "standard",
  maxWarnings: 10,
  enableOffscreenMeasure: false, // 浏览器环境才开
};
