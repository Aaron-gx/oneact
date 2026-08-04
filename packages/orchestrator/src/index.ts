/**
 * @oneact/orchestrator — 一幕 OneAct 多 Agent 协同编排层（v3 · 协作回路 + 会话控制）
 *
 * v3 关键改进：
 *   · Inspector 独占校验（InspectionReport），Conductor 不重复 validateDeck
 *   · ErrorLocation 结构化错误定位，Healer 精准修复
 *   · Director 全权负责 Brief + Outline
 *   · Session 会话控制器（可取消/暂停/恢复）
 *
 * 双模式入口：
 *   · generate(config) — 生成模式：topic → Brief+Outline → 逐页生成 → 校验 → 自愈 → deck
 *   · edit(config)     — 编辑模式（核心场景）：用户指令 → 意图解析 → 整页重写 → 校验 → 返回
 */
// 核心类型
export type {
  Agent,
  AgentContext,
  AgentConstraints,
  AgentResult,
  AgentRole,
  CancelToken,
  EditConfig,
  EditResult,
  ErrorLocation,
  GenerateConfig,
  GenerateResult,
  InspectionReport,
  PipelineEvent,
  RunMode,
  SessionStats,
  SessionStatus,
} from "./types.js";
export { DEFAULT_CONSTRAINTS, NEVER_CANCEL, Session } from "./types.js";

// 门禁结果
export type { GateResult } from "./gates.js";

// 事件总线
export { EventBus } from "./event-bus.js";

// 质量门禁
export { checkG1, checkG2, checkG3 } from "./gates.js";

// 编排核心 — 双模式入口
export { generate, edit } from "./orchestrator.js";

// 专家 Agent（供高级用户自定义注入）
export { DirectorAgent, type EditIntent, type DirectorPlan } from "./agents/director.js";
export { GeneratorAgent } from "./agents/generator.js";
export { InspectorAgent } from "./agents/inspector.js";
export { HealerAgent, type HealStrategy } from "./agents/healer.js";
