/**
 * @oneact/orchestrator — 质量门禁（v2）
 *
 * 三道门禁，逐级把关：
 *   G1-structure  — 大纲阶段：页数合规 · layout 合法 · theme 存在 · brief 对齐度
 *   G2-validation — 生成阶段：validateDeck errors=0 · warnings≤阈值 · guardDeck≠block
 *   G3-export     — 导出阶段：deck 非空 · 元素齐全 · 内容安全通过
 *
 * v2 变更：门禁不再依赖 FSM 状态，由 Conductor 直接调用。
 */
import type { Brief, Outline } from "@oneact/ai";
import { guardDeck, type GuardConfig, type GuardResult } from "@oneact/ai";
import { validateDeck, type Deck, type Issue, type LayoutDef } from "@oneact/schema";
import type { AgentConstraints } from "./types.js";

// ──────────────────────────────── 门禁结果 ────────────────────────────────

export interface GateResult {
  gate: "G1-structure" | "G2-validation" | "G3-export";
  passed: boolean;
  reasons: string[];
  issues?: Issue[];
}

// ──────────────────────────────── G1: 结构门禁 ────────────────────────────────

/**
 * G1 结构门禁：大纲产出后检查。
 *
 * 准出条件：
 *   · 大纲页数 ≥ 3
 *   · 每页 layout 在版式表中存在
 *   · theme 非空
 *   · 页数与 brief.pageCount 偏差 ≤ 30%
 */
export function checkG1(outline: Outline, brief: Brief, layouts: Record<string, LayoutDef>): GateResult {
  const reasons: string[] = [];

  if (!outline.pages || outline.pages.length < 3) {
    reasons.push(`大纲页数不足：${outline.pages?.length ?? 0} < 3`);
  }

  if (!outline.theme) {
    reasons.push("大纲缺少 theme 字段");
  }

  const knownLayouts = new Set(Object.keys(layouts));
  const unknownLayouts = outline.pages
    ?.filter((p) => p.layout && !knownLayouts.has(p.layout))
    .map((p) => `第${outline.pages.indexOf(p) + 1}页 layout="${p.layout}"不存在`)
    ?? [];
  if (unknownLayouts.length > 0) {
    reasons.push(`版式不合法：${unknownLayouts.join("；")}`);
  }

  // 页数偏差检查（brief 对齐度）
  const expected = brief.pageCount;
  const actual = outline.pages?.length ?? 0;
  if (expected > 0 && actual > 0) {
    const deviation = Math.abs(actual - expected) / expected;
    if (deviation > 0.3) {
      reasons.push(`页数偏差过大：大纲 ${actual} 页 vs brief 期望 ${expected} 页（偏差 ${Math.round(deviation * 100)}%）`);
    }
  }

  return {
    gate: "G1-structure",
    passed: reasons.length === 0,
    reasons,
  };
}

// ──────────────────────────────── G2: 校验门禁 ────────────────────────────────

/**
 * G2 校验门禁：生成完成后检查。
 *
 * 准出条件：
 *   · validateDeck errors = 0
 *   · warnings 数量 ≤ constraints.maxWarnings
 *   · guardDeck action ≠ "block"
 */
export function checkG2(
  deck: Deck,
  layouts: Record<string, LayoutDef>,
  constraints: AgentConstraints,
  guardConfig: GuardConfig = { enableEscapeScan: true } as GuardConfig,
): { gate: GateResult; validation: ReturnType<typeof validateDeck>; guard: GuardResult } {
  const validation = validateDeck(deck, { layouts });
  const reasons: string[] = [];

  if (!validation.ok) {
    reasons.push(`存在 ${validation.errors.length} 个硬错误`);
  }

  if (validation.warnings.length > constraints.maxWarnings) {
    reasons.push(`警告数超限：${validation.warnings.length} > ${constraints.maxWarnings}`);
  }

  // 内容安全扫描
  const guard = guardDeck(deck, guardConfig);
  if (guard.action === "block") {
    reasons.push(`安全扫描拦截：${guard.reason ?? "存在高危逃逸块"}`);
  }

  return {
    gate: {
      gate: "G2-validation",
      passed: reasons.length === 0,
      reasons,
      issues: [...validation.errors, ...validation.warnings],
    },
    validation,
    guard,
  };
}

// ──────────────────────────────── G3: 成品门禁 ────────────────────────────────

/**
 * G3 成品门禁：导出前最终检查。
 *
 * 准出条件：
 *   · deck 非空且有页
 *   · 每页至少有 1 个元素
 *   · formatVersion = 1
 *   · guardDeck action ≠ "block"
 */
export function checkG3(deck: Deck, guard: GuardResult | null): GateResult {
  const reasons: string[] = [];

  if (!deck.pages || deck.pages.length === 0) {
    reasons.push("deck 为空（无页面）");
  } else {
    const emptyPages = deck.pages
      .filter((p) => !p.elements || p.elements.length === 0)
      .map((p) => p.id);
    if (emptyPages.length > 0) {
      reasons.push(`存在空页面：${emptyPages.join(", ")}`);
    }
  }

  if (deck.formatVersion !== 1) {
    reasons.push(`formatVersion 不合规：${deck.formatVersion}（应为 1）`);
  }

  if (guard && guard.action === "block") {
    reasons.push(`内容安全未通过：${guard.reason ?? "高危逃逸块"}`);
  }

  return {
    gate: "G3-export",
    passed: reasons.length === 0,
    reasons,
  };
}
