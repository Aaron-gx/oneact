/**
 * @oneact/orchestrator — 编排核心（v3 · Conductor + Session）
 *
 * v3 关键改进：
 *   · Session 会话控制器：支持 cancel()/pause()/resume()，编辑器可随时打断
 *   · Director 全权负责 Brief + Outline，职责边界清晰
 *   · Inspector 独占校验返回 InspectionReport，Conductor 不重复 validateDeck
 *   · ErrorLocation 结构化错误定位，Healer 精准修复
 *   · CancelToken 注入 AgentContext，Agent 在耗时操作前检查取消信号
 *
 * 两种入口：
 *   · generate(config) — 生成模式
 *   · edit(config)     — 编辑模式（核心场景）
 */
import type { Brief, GuardResult, Outline } from "@oneact/ai";
import { applySkill, guardInput } from "@oneact/ai";
import { LAYOUTS } from "@oneact/layouts";
import type { Deck, LayoutDef, Page, ValidationResult } from "@oneact/schema";
import { EventBus } from "./event-bus.js";
import { checkG1, checkG3 } from "./gates.js";
import {
  DEFAULT_CONSTRAINTS,
  Session,
  type AgentContext,
  type EditConfig,
  type EditResult,
  type GenerateConfig,
  type GenerateResult,
  type InspectionReport,
  type PipelineEvent,
  type SessionStats,
} from "./types.js";

// ──────────────────────────────── 辅助 ────────────────────────────────

/** 生成唯一会话 id。 */
function genSessionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 创建空统计。 */
function emptyStats(): SessionStats {
  return {
    totalRetries: 0,
    firstPass: true,
    gatePasses: 0,
    gateFailures: 0,
    healStrategies: [],
  };
}

/** 检查取消信号，如已取消则抛出。 */
function checkCancel(session: Session): void {
  if (session.isCancelled) {
    throw new SessionCancelled(session.cancelReason ?? "用户取消");
  }
}

/** 取消异常。 */
class SessionCancelled extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "SessionCancelled";
  }
}

// ════════════════════════════════ 生成模式 ════════════════════════════════

/**
 * 生成模式入口：从 topic + answers 到完整 deck。
 *
 * v3 流程：
 *   1. 输入护栏
 *   2. Director → { brief, outline }（全权规划）
 *   3. G1 门禁（大纲结构）
 *   4. Generator → 逐页生成 deck（流式 onPage）
 *   5. Inspector → InspectionReport（独占校验）
 *   6. 失败 → Healer 自愈回路（接收 ErrorLocation[]）
 *   7. G3 成品门禁 → 返回
 */
export async function generate(config: GenerateConfig): Promise<GenerateResult> {
  const sessionId = genSessionId();
  const start = Date.now();
  const bus = new EventBus();
  const stats = emptyStats();
  const session = config.session ?? new Session();

  const constraints = { ...DEFAULT_CONSTRAINTS, ...config.constraints };
  const layouts: Record<string, LayoutDef> = config.layouts ?? LAYOUTS;

  if (config.onEvent) {
    bus.on((event) => config.onEvent!(event));
  }

  const emit = (event: PipelineEvent) => bus.emit(event);

  // ─── 输入护栏 ───
  const inputGuard = await guardInput(config.answers.topic);
  if (inputGuard.action === "block") {
    return finalizeGenerate(false, stats, start, sessionId, emit, session, {
      error: inputGuard.reason ?? "输入被安全护栏拦截",
    });
  }

  emit({ type: "session:start", sessionId, mode: "generate", topic: config.answers.topic });

  // ─── Agent 实例化 ───
  const { DirectorAgent } = await import("./agents/director.js");
  const { GeneratorAgent } = await import("./agents/generator.js");
  const { InspectorAgent } = await import("./agents/inspector.js");
  const { HealerAgent } = await import("./agents/healer.js");

  const director = new DirectorAgent(config.provider, config.answers, config.useAiBrief ?? true);
  const generator = new GeneratorAgent(config.provider, { skills: config.skills }, config.onPage);
  const inspector = new InspectorAgent();
  const healer = new HealerAgent(config.provider, { skills: config.skills });

  // ─── 管线状态 ───
  let brief: Brief | null = null;
  let outline: Outline | null = null;
  let deck: Deck | null = null;
  let report: InspectionReport | null = null;
  let validation: ValidationResult | null = null;
  let guard: GuardResult | null = null;

  const makeCtx = (extras?: Partial<AgentContext>): AgentContext => ({
    sessionId,
    mode: "generate",
    topic: config.answers.topic,
    brief: brief ?? undefined,
    outline: outline ?? undefined,
    deck: deck ?? undefined,
    layouts,
    constraints,
    cancelToken: session.cancelToken,
    ...extras,
  });

  try {
    // ─── 阶段 1：Director → { brief, outline } ───
    checkCancel(session);
    emit({ type: "phase:start", phase: "director" });
    const dResult = await director.execute(makeCtx());
    if (!dResult.success || !dResult.artifact) {
      emit({ type: "error", agent: "director", message: dResult.error ?? "规划失败", recoverable: false });
      return finalizeGenerate(false, stats, start, sessionId, emit, session, { error: dResult.error ?? "规划失败" });
    }

    // v3：Director 产出 { brief, outline } 联合产物
    const plan = dResult.artifact as { brief: Brief; outline: Outline };
    brief = plan.brief;
    outline = plan.outline;
    // 应用 skill：经 brief（sections/mood/theme/styleNotes）+ specOps（§12 directives）生效。
    if (config.skills) {
      brief = applySkill(config.answers, brief, config.skills);
    }

    emit({ type: "brief:ready", title: brief.title, theme: brief.theme, pageCount: brief.pageCount });
    emit({ type: "outline:ready", totalPages: outline.pages.length });
    emit({ type: "phase:complete", phase: "director", durationMs: dResult.durationMs ?? 0, score: dResult.selfScore });

    // ─── G1 门禁（大纲结构）───
    checkCancel(session);
    const g1 = checkG1(outline, brief, layouts);
    emit({ type: "gate:result", passed: g1.passed, gate: "G1-structure", details: g1.reasons.join("；") });
    if (g1.passed) {
      stats.gatePasses++;
    } else {
      stats.gateFailures++;
    }

    // ─── 阶段 2：Generator → 逐页生成 deck ───
    checkCancel(session);
    emit({ type: "phase:start", phase: "generate" });
    // skill 提供了 structure 骨架 → 不传 Director 的 outline，让 Generator 用 brief（含骨架）重生成大纲
    const gResult = await generator.execute(
      makeCtx({ outline: config.skills?.structure?.length ? undefined : outline ?? undefined }),
    );
    if (!gResult.success || !gResult.artifact) {
      emit({ type: "error", agent: "generator", message: gResult.error ?? "内容生成失败", recoverable: false });
      return finalizeGenerate(false, stats, start, sessionId, emit, session, { brief, outline, error: gResult.error ?? "内容生成失败" });
    }
    deck = gResult.artifact as Deck;
    stats.firstPass = gResult.selfScore === undefined || gResult.selfScore >= 0.8;
    emit({ type: "phase:complete", phase: "generate", durationMs: gResult.durationMs ?? 0, score: gResult.selfScore });

    // ─── 阶段 3 + 4：Inspector → Healer 自愈回路 ───
    let healRound = 0;
    let passed = false;

    while (healRound <= constraints.maxHealRounds) {
      checkCancel(session);

      // Inspector 独占校验 → InspectionReport
      emit({ type: "phase:start", phase: "inspect" });
      const iResult = await inspector.execute(makeCtx());
      emit({ type: "phase:complete", phase: "inspect", durationMs: iResult.durationMs ?? 0, score: iResult.selfScore });

      if (!iResult.success || !iResult.artifact) {
        emit({ type: "error", agent: "inspector", message: iResult.error ?? "校验失败", recoverable: true });
        break;
      }

      // v3：直接使用 InspectionReport，不重复 validateDeck
      report = iResult.artifact as InspectionReport;
      validation = report.validation;
      guard = report.guard;

      if (report.passed) {
        stats.gatePasses++;
        emit({ type: "gate:result", passed: true, gate: "G2-validation", details: `${validation.errors.length}e / ${validation.warnings.length}w` });
        passed = true;
        break;
      }

      // 校验失败
      stats.gateFailures++;
      stats.firstPass = false;
      emit({ type: "gate:result", passed: false, gate: "G2-validation", details: `${report.errors.length} 个错误定位` });

      if (healRound >= constraints.maxHealRounds) {
        emit({ type: "error", agent: "healer", message: `自愈 ${healRound} 轮后仍未通过`, recoverable: false });
        break;
      }

      // Healer 修复（v3：传入 InspectionReport，Healer 从中取 ErrorLocation[]）
      const strategy = healRound === 0 ? "regenerate-page" : healRound === 1 ? "downgrade-layout" : "minimal-fallback";
      stats.healStrategies.push(strategy);
      stats.totalRetries++;
      emit({ type: "heal:retry", attempt: healRound + 1, strategy });

      checkCancel(session);
      emit({ type: "phase:start", phase: "heal" });
      const hResult = await healer.execute(
        makeCtx({ handoff: { report, healRound } }),
      );
      if (hResult.success && hResult.artifact) {
        deck = hResult.artifact as Deck;
        emit({ type: "deck:updated" });
      }
      emit({ type: "phase:complete", phase: "heal", durationMs: hResult.durationMs ?? 0, score: hResult.selfScore });

      healRound++;
    }

    // ─── G3 成品门禁 ───
    if (!deck) {
      return finalizeGenerate(false, stats, start, sessionId, emit, session, { brief, outline, validation, guard, error: "deck 为 null" });
    }
    const g3 = checkG3(deck, guard);
    emit({ type: "gate:result", passed: g3.passed, gate: "G3-export", details: g3.reasons.join("；") });
    if (g3.passed) {
      stats.gatePasses++;
    } else {
      stats.gateFailures++;
    }

    const success = passed && g3.passed;
    return finalizeGenerate(success, stats, start, sessionId, emit, session, { brief, outline, deck, validation, guard });

  } catch (e) {
    if (e instanceof SessionCancelled) {
      emit({ type: "session:cancelled", sessionId, reason: e.message });
      return finalizeGenerate(false, stats, start, sessionId, emit, session, {
        brief, outline, deck, validation, guard,
        cancelled: true,
        error: e.message,
      });
    }
    emit({ type: "error", agent: "conductor", message: (e as Error).message, recoverable: false });
    return finalizeGenerate(false, stats, start, sessionId, emit, session, { brief, outline, deck, error: (e as Error).message });
  }
}

// ════════════════════════════════ 编辑模式 ════════════════════════════════

/**
 * 编辑模式入口（核心场景）：用户指令 → 修改单页 → 校验 → 返回。
 *
 * v3 流程：
 *   1. Director 解析指令 → EditIntent
 *   2. Generator 整页重写
 *   3. Inspector 单页校验 → InspectionReport
 *   4. 失败 → Healer 修复（接收 ErrorLocation[]）
 *   5. 全程支持 cancel()
 */
export async function edit(config: EditConfig): Promise<EditResult> {
  const sessionId = genSessionId();
  const start = Date.now();
  const bus = new EventBus();
  const stats = emptyStats();
  const session = config.session ?? new Session();

  const constraints = { ...DEFAULT_CONSTRAINTS, ...config.constraints };
  const layouts: Record<string, LayoutDef> = config.layouts ?? LAYOUTS;

  if (config.onEvent) {
    bus.on((event) => config.onEvent!(event));
  }

  const emit = (event: PipelineEvent) => bus.emit(event);

  emit({ type: "session:start", sessionId, mode: "edit", topic: config.instruction });

  // ─── Agent 实例化 ───
  const { DirectorAgent } = await import("./agents/director.js");
  const { GeneratorAgent } = await import("./agents/generator.js");
  const { InspectorAgent } = await import("./agents/inspector.js");
  const { HealerAgent } = await import("./agents/healer.js");

  const director = new DirectorAgent(config.provider);
  const generator = new GeneratorAgent(config.provider, { skills: config.skills });
  const inspector = new InspectorAgent();
  const healer = new HealerAgent(config.provider, { skills: config.skills });

  let deck: Deck = config.deck;
  let editedPage: Page | null = null;
  let validation: ValidationResult | null = null;

  const makeCtx = (extras?: Partial<AgentContext>): AgentContext => ({
    sessionId,
    mode: "edit",
    topic: config.instruction,
    deck,
    instruction: config.instruction,
    targetPageId: config.targetPageId,
    layouts,
    constraints,
    cancelToken: session.cancelToken,
    ...extras,
  });

  try {
    // ─── 阶段 1：Director → 意图解析 ───
    checkCancel(session);
    emit({ type: "phase:start", phase: "director" });
    const dResult = await director.execute(makeCtx());
    if (!dResult.success || !dResult.artifact) {
      emit({ type: "error", agent: "director", message: dResult.error ?? "意图解析失败", recoverable: false });
      return finalizeEdit(false, stats, start, sessionId, emit, session, { error: dResult.error ?? "意图解析失败" });
    }

    const intent = dResult.artifact as { pageId: string; instruction: string };
    emit({ type: "phase:complete", phase: "director", durationMs: dResult.durationMs ?? 0, score: dResult.selfScore });

    // ─── 阶段 2：Generator → 整页重写 ───
    checkCancel(session);
    emit({ type: "phase:start", phase: "generate" });
    const gResult = await generator.execute(makeCtx({ handoff: { intent } }));
    if (!gResult.success || !gResult.artifact) {
      emit({ type: "error", agent: "generator", message: gResult.error ?? "页面重写失败", recoverable: false });
      return finalizeEdit(false, stats, start, sessionId, emit, session, { error: gResult.error ?? "页面重写失败" });
    }

    editedPage = gResult.artifact as Page;
    deck = { ...deck, pages: deck.pages.map((p) => (p.id === intent.pageId ? editedPage! : p)) };
    emit({ type: "deck:updated", pageId: intent.pageId });
    emit({ type: "phase:complete", phase: "generate", durationMs: gResult.durationMs ?? 0, score: gResult.selfScore });

    // ─── 阶段 3 + 4：Inspector → Healer 回路 ───
    let healRound = 0;
    let passed = false;

    while (healRound <= constraints.maxPageRetries) {
      checkCancel(session);
      emit({ type: "phase:start", phase: "inspect" });
      const iResult = await inspector.execute(makeCtx({ handoff: { intent, editedPage } }));
      emit({ type: "phase:complete", phase: "inspect", durationMs: iResult.durationMs ?? 0, score: iResult.selfScore });

      if (!iResult.success || !iResult.artifact) {
        break;
      }

      const report = iResult.artifact as InspectionReport;
      validation = report.validation;

      if (report.passed) {
        stats.gatePasses++;
        passed = true;
        emit({ type: "gate:result", passed: true, gate: "page-validate", details: iResult.notes?.join("；") ?? "通过" });
        break;
      }

      stats.gateFailures++;
      stats.firstPass = false;
      emit({ type: "gate:result", passed: false, gate: "page-validate", details: `${report.errors.length} 个错误定位` });

      if (healRound >= constraints.maxPageRetries) {
        emit({ type: "error", agent: "healer", message: `修复 ${healRound} 次后仍未通过`, recoverable: false });
        break;
      }

      const strategy = healRound === 0 ? "regenerate-page" : "minimal-fallback";
      stats.healStrategies.push(strategy);
      stats.totalRetries++;
      emit({ type: "heal:retry", attempt: healRound + 1, strategy, pageId: intent.pageId });

      checkCancel(session);
      emit({ type: "phase:start", phase: "heal" });
      const hResult = await healer.execute(
        makeCtx({ deck, handoff: { report, healRound } }),
      );
      if (hResult.success && hResult.artifact) {
        const healedDeck = hResult.artifact as Deck;
        const healedPage = healedDeck.pages.find((p) => p.id === intent.pageId);
        if (healedPage) {
          editedPage = healedPage;
          deck = healedDeck;
          emit({ type: "deck:updated", pageId: intent.pageId });
        }
      }
      emit({ type: "phase:complete", phase: "heal", durationMs: hResult.durationMs ?? 0, score: hResult.selfScore });

      healRound++;
    }

    return finalizeEdit(passed, stats, start, sessionId, emit, session, { page: editedPage, deck, validation });

  } catch (e) {
    if (e instanceof SessionCancelled) {
      emit({ type: "session:cancelled", sessionId, reason: e.message });
      return finalizeEdit(false, stats, start, sessionId, emit, session, {
        page: editedPage, deck, validation, cancelled: true, error: e.message,
      });
    }
    emit({ type: "error", agent: "conductor", message: (e as Error).message, recoverable: false });
    return finalizeEdit(false, stats, start, sessionId, emit, session, { page: editedPage, deck, error: (e as Error).message });
  }
}

// ════════════════════════════════ 收尾 ════════════════════════════════

/** 生成模式收尾。 */
function finalizeGenerate(
  success: boolean,
  stats: SessionStats,
  start: number,
  sessionId: string,
  emit: (e: PipelineEvent) => void,
  session: Session,
  data: {
    brief?: Brief | null;
    outline?: Outline | null;
    deck?: Deck | null;
    validation?: ValidationResult | null;
    guard?: GuardResult | null;
    cancelled?: boolean;
    error?: string;
  },
): GenerateResult {
  const durationMs = Date.now() - start;
  if (data.cancelled) {
    emit({ type: "session:cancelled", sessionId, reason: data.error ?? "取消" });
  } else {
    session.complete();
  }
  emit({ type: "session:complete", sessionId, success, durationMs, stats });

  return {
    success,
    deck: data.deck ?? null,
    brief: data.brief ?? null,
    outline: data.outline ?? null,
    validation: data.validation ?? null,
    guard: data.guard ?? null,
    stats,
    cancelled: data.cancelled,
    error: data.error,
  };
}

/** 编辑模式收尾。 */
function finalizeEdit(
  success: boolean,
  stats: SessionStats,
  start: number,
  sessionId: string,
  emit: (e: PipelineEvent) => void,
  session: Session,
  data: {
    page?: Page | null;
    deck?: Deck | null;
    validation?: ValidationResult | null;
    cancelled?: boolean;
    error?: string;
  },
): EditResult {
  const durationMs = Date.now() - start;
  if (data.cancelled) {
    emit({ type: "session:cancelled", sessionId, reason: data.error ?? "取消" });
  } else {
    session.complete();
  }
  emit({ type: "session:complete", sessionId, success, durationMs, stats });

  return {
    success,
    page: data.page ?? null,
    deck: data.deck ?? null,
    validation: data.validation ?? null,
    stats,
    cancelled: data.cancelled,
    error: data.error,
  };
}
