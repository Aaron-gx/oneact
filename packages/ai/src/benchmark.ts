/**
 * @oneact/ai — 黄金测试集跑分器（策划书 v0.3 退出标准）
 *
 * 策划书原文：「量化 AI 首次生成校验通过率、2 次重试收敛率，≥3 档模型跑分」
 *
 * 工作原理：
 *   golden set（手写/精选的 deck 集合）
 *     → 每条用例用 topic 触发 generateDeck
 *     → 拿到的 deck 走 validator
 *     → 统计：首次通过率 / N 次收敛率 / 平均重试 / 警告密度 / 指标对比
 *
 * 用法：
 *   import { runBenchmark } from "@oneact/ai/benchmark"
 *   const report = await runBenchmark({ provider, cases, modelTier: "standard" })
 *   console.log(report.summary.firstPassRate)  // 0.0 - 1.0
 */
import { LAYOUTS } from "@oneact/layouts";
import { validateDeck, type Deck, type Issue, type ValidationResult } from "@oneact/schema";
import { generateDeck, generateDeckStream } from "./generate.js";
import type { LLMProvider } from "./provider.js";

// ──────────────────────────── 用例定义 ────────────────────────────

/** 单条黄金测试用例：一个主题 + 期望覆盖的版式/组件。 */
export interface GoldenCase {
  /** 用例 id（报告里引用） */
  id: string;
  /** 主题描述（喂给 LLM 的 topic） */
  topic: string;
  /** 期望页数 */
  pageCount?: number;
  /** 期望覆盖的版式（用于覆盖率检查，可选） */
  expectLayouts?: string[];
  /** 期望覆盖的组件类型（用于覆盖率检查，可选） */
  expectComponents?: string[];
}

/** 从已有 golden deck 反推用例（方便快速扩充测试集）。 */
export function deckToCase(id: string, deck: Deck): GoldenCase {
  return {
    id,
    topic: deck.meta.title ?? id,
    pageCount: deck.pages.length,
    expectLayouts: [...new Set(deck.pages.map((p) => p.layout).filter(Boolean))] as string[],
    expectComponents: [...new Set(deck.pages.flatMap((p) => p.elements.map((e) => e.type)))] as string[],
  };
}

/** 把 golden.act.json 转成一批用例（每页拆一条，覆盖最细粒度）。 */
export function deckToPageCases(id: string, deck: Deck): GoldenCase[] {
  return deck.pages.map((page, i) => ({
    id: `${id}-p${i + 1}`,
    topic: `生成一页「${page.title ?? page.layout ?? "内容"}」，版式：${page.layout ?? "自由"}。内容要点：${page.elements
      .map((e) => {
        const p = e.props as Record<string, unknown>;
        if (typeof p.text === "string") return p.text.slice(0, 40);
        if (Array.isArray(p.items)) return `列表(${p.items.length}项)`;
        if (p.chartType) return `${p.chartType}图表`;
        return e.type;
      })
      .join("；")}`,
    pageCount: 1,
    expectLayouts: page.layout ? [page.layout] : [],
    expectComponents: [...new Set(page.elements.map((e) => e.type))],
  }));
}

// ──────────────────────────── 单条结果 ────────────────────────────

export interface CaseResult {
  caseId: string;
  /** 生成是否成功（无硬错误） */
  passed: boolean;
  /** 首次生成即通过（retries === 0） */
  firstPass: boolean;
  /** 实际重试次数（0 = 首次通过） */
  retries: number;
  /** 最终校验结果 */
  validation: ValidationResult;
  /** 生成的 deck（通过时）；失败时为 null */
  deck: Deck | null;
  /** 实际覆盖的版式 */
  actualLayouts: string[];
  /** 实际覆盖的组件 */
  actualComponents: string[];
  /** 版式覆盖率（实际 ∩ 期望 / 期望） */
  layoutCoverage: number;
  /** 组件覆盖率 */
  componentCoverage: number;
  /** 耗时 ms */
  elapsed: number;
  /** 错误信息（生成失败时） */
  error?: string;
}

// ──────────────────────────── 跑分报告 ────────────────────────────

export interface BenchmarkSummary {
  /** 用例总数 */
  total: number;
  /** 通过数（无硬错误） */
  passed: number;
  /** 首次通过数（retries === 0） */
  firstPass: number;
  /** 首次通过率（策划书核心指标） */
  firstPassRate: number;
  /** 总通过率（含自愈后通过） */
  passRate: number;
  /** 平均重试次数 */
  avgRetries: number;
  /** 平均版式覆盖率 */
  avgLayoutCoverage: number;
  /** 平均组件覆盖率 */
  avgComponentCoverage: number;
  /** 平均警告数（每条用例） */
  avgWarnings: number;
  /** 平均耗时 ms */
  avgElapsed: number;
}

export interface BenchmarkReport {
  /** 模型信息 */
  model: string;
  /** 模型档位 */
  modelTier: string;
  /** 时间戳 */
  timestamp: string;
  /** 汇总指标 */
  summary: BenchmarkSummary;
  /** 每条用例详情 */
  cases: CaseResult[];
  /** 按规则聚合的错误统计 */
  errorBreakdown: Record<string, number>;
  /** 按规则聚合的警告统计 */
  warningBreakdown: Record<string, number>;
}

// ──────────────────────────── 跑分器 ────────────────────────────

export interface BenchmarkOptions {
  provider: LLMProvider;
  cases: GoldenCase[];
  modelTier?: "weak" | "standard" | "strong";
  theme?: string;
  /** 单条用例最大重试（默认 2，与 generateDeck 一致） */
  maxRetries?: number;
  /** 用流式生成（generateDeckStream，逐页生成）还是整体生成 */
  mode?: "deck" | "stream";
  /** 每条用例之间的延迟 ms（避免限流） */
  throttleMs?: number;
  /** 进度回调 */
  onProgress?: (current: number, total: number, caseId: string) => void;
}

export async function runBenchmark(opts: BenchmarkOptions): Promise<BenchmarkReport> {
  const layouts = LAYOUTS;
  const tier = opts.modelTier ?? "standard";
  const maxRetries = opts.maxRetries ?? 2;
  const throttle = opts.throttleMs ?? 500;

  const cases: CaseResult[] = [];
  const errorBreakdown: Record<string, number> = {};
  const warningBreakdown: Record<string, number> = {};

  for (let i = 0; i < opts.cases.length; i++) {
    const c = opts.cases[i];
    opts.onProgress?.(i + 1, opts.cases.length, c.id);

    const result = await runSingleCase(opts.provider, c, tier, opts.theme, maxRetries, layouts, opts.mode ?? "deck");
    cases.push(result);

    // 聚合错误/警告统计
    for (const err of result.validation.errors) {
      errorBreakdown[err.rule] = (errorBreakdown[err.rule] ?? 0) + 1;
    }
    for (const warn of result.validation.warnings) {
      warningBreakdown[warn.rule] = (warningBreakdown[warn.rule] ?? 0) + 1;
    }

    // 节流
    if (i < opts.cases.length - 1 && throttle > 0) {
      await sleep(throttle);
    }
  }

  const total = cases.length;
  const passed = cases.filter((c) => c.passed).length;
  const firstPass = cases.filter((c) => c.firstPass).length;

  const summary: BenchmarkSummary = {
    total,
    passed,
    firstPass,
    firstPassRate: total > 0 ? round(firstPass / total) : 0,
    passRate: total > 0 ? round(passed / total) : 0,
    avgRetries: total > 0 ? round(cases.reduce((s, c) => s + c.retries, 0) / total, 2) : 0,
    avgLayoutCoverage: total > 0 ? round(cases.reduce((s, c) => s + c.layoutCoverage, 0) / total) : 0,
    avgComponentCoverage: total > 0 ? round(cases.reduce((s, c) => s + c.componentCoverage, 0) / total) : 0,
    avgWarnings: total > 0 ? round(cases.reduce((s, c) => s + c.validation.warnings.length, 0) / total, 1) : 0,
    avgElapsed: total > 0 ? Math.round(cases.reduce((s, c) => s + c.elapsed, 0) / total) : 0,
  };

  return {
    model: opts.provider.config.model,
    modelTier: tier,
    timestamp: new Date().toISOString(),
    summary,
    cases,
    errorBreakdown,
    warningBreakdown,
  };
}

// ──────────────────────────── 单条执行 ────────────────────────────

async function runSingleCase(
  provider: LLMProvider,
  goldenCase: GoldenCase,
  tier: string,
  theme: string | undefined,
  maxRetries: number,
  layouts: typeof LAYOUTS,
  mode: "deck" | "stream",
): Promise<CaseResult> {
  const start = Date.now();
  const base = {
    provider,
    topic: goldenCase.topic,
    pageCount: goldenCase.pageCount ?? 1,
    theme,
    modelTier: tier as "weak" | "standard" | "strong",
    maxRetries,
  };

  try {
    const genResult = mode === "stream" ? await generateDeckStream(base) : await generateDeck(base);

    const deck = genResult.deck;
    const result = genResult.result;
    const actualLayouts = deck ? ([...new Set(deck.pages.map((p) => p.layout).filter(Boolean))] as string[]) : [];
    const actualComponents = deck ? [...new Set(deck.pages.flatMap((p) => p.elements.map((e) => e.type)))] : [];

    return {
      caseId: goldenCase.id,
      passed: result.ok,
      firstPass: genResult.retries === 0 && result.ok,
      retries: genResult.retries,
      validation: result,
      deck,
      actualLayouts,
      actualComponents,
      layoutCoverage: coverage(actualLayouts, goldenCase.expectLayouts),
      componentCoverage: coverage(actualComponents, goldenCase.expectComponents),
      elapsed: Date.now() - start,
    };
  } catch (e) {
    return {
      caseId: goldenCase.id,
      passed: false,
      firstPass: false,
      retries: maxRetries + 1,
      validation: {
        ok: false,
        errors: [{ severity: "error", rule: "exception", message: (e as Error).message }],
        warnings: [],
      },
      deck: null,
      actualLayouts: [],
      actualComponents: [],
      layoutCoverage: 0,
      componentCoverage: 0,
      elapsed: Date.now() - start,
      error: (e as Error).message,
    };
  }
}

// ──────────────────────────── 工具函数 ────────────────────────────

function coverage(actual: string[], expected?: string[]): number {
  if (!expected || expected.length === 0) return 1;
  const hit = expected.filter((e) => actual.includes(e)).length;
  return round(hit / expected.length);
}

function round(n: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ──────────────────────────── 报告格式化 ────────────────────────────

/** 把跑分报告格式化为可读文本（CLI 输出 / PR 评论）。 */
export function formatReport(report: BenchmarkReport): string {
  const s = report.summary;
  const lines: string[] = [
    `=== OneAct 黄金测试集跑分报告 ===`,
    `模型: ${report.model} (${report.modelTier})`,
    `时间: ${report.timestamp}`,
    ``,
    `--- 核心指标 ---`,
    `用例总数:     ${s.total}`,
    `首次通过:     ${s.firstPass}/${s.total} (${(s.firstPassRate * 100).toFixed(1)}%)`,
    `自愈后通过:   ${s.passed}/${s.total} (${(s.passRate * 100).toFixed(1)}%)`,
    `平均重试:     ${s.avgRetries}`,
    `平均版式覆盖: ${(s.avgLayoutCoverage * 100).toFixed(1)}%`,
    `平均组件覆盖: ${(s.avgComponentCoverage * 100).toFixed(1)}%`,
    `平均警告数:   ${s.avgWarnings}`,
    `平均耗时:     ${s.avgElapsed}ms`,
    ``,
    `--- 错误分布（按规则）---`,
  ];

  const sortedErrors = Object.entries(report.errorBreakdown).sort((a, b) => b[1] - a[1]);
  if (sortedErrors.length === 0) {
    lines.push("  (无错误)");
  } else {
    for (const [rule, count] of sortedErrors) {
      lines.push(`  ${rule}: ${count}`);
    }
  }

  lines.push("", `--- 警告分布（按规则）---`);
  const sortedWarnings = Object.entries(report.warningBreakdown).sort((a, b) => b[1] - a[1]);
  if (sortedWarnings.length === 0) {
    lines.push("  (无警告)");
  } else {
    for (const [rule, count] of sortedWarnings) {
      lines.push(`  ${rule}: ${count}`);
    }
  }

  lines.push("", `--- 逐条结果 ---`);
  for (const c of report.cases) {
    const status = c.firstPass ? "PASS(首次)" : c.passed ? "PASS(自愈)" : "FAIL";
    lines.push(
      `  [${status}] ${c.caseId} — retries=${c.retries}, warnings=${c.validation.warnings.length}, ${c.elapsed}ms`,
    );
  }

  return lines.join("\n");
}

/** 对比两次跑分结果（A/B 对比，量化 prompt / schema 改动效果）。 */
export function compareReports(before: BenchmarkReport, after: BenchmarkReport): string {
  const b = before.summary;
  const a = after.summary;
  const fmt = (n: number, pct = false) => (pct ? `${(n * 100).toFixed(1)}%` : `${n}`);
  const delta = (after: number, before: number, pct = false, good = "up") => {
    const d = after - before;
    const sign = d > 0 ? "+" : "";
    const better = (good === "up" && d > 0) || (good === "down" && d < 0);
    const mark = d === 0 ? "  " : better ? " ✓" : " ✗";
    return `${fmt(before, pct)} → ${fmt(after, pct)} (${sign}${pct ? (d * 100).toFixed(1) + "%" : d.toFixed(2)})${mark}`;
  };

  return [
    `=== A/B 对比 ===`,
    `首次通过率:   ${delta(a.firstPassRate, b.firstPassRate, true)}`,
    `总通过率:     ${delta(a.passRate, b.passRate, true)}`,
    `平均重试:     ${delta(a.avgRetries, b.avgRetries, false, "down")}`,
    `平均警告:     ${delta(a.avgWarnings, b.avgWarnings, false, "down")}`,
    `版式覆盖:     ${delta(a.avgLayoutCoverage, b.avgLayoutCoverage, true)}`,
    `组件覆盖:     ${delta(a.avgComponentCoverage, b.avgComponentCoverage, true)}`,
    `平均耗时:     ${delta(a.avgElapsed, b.avgElapsed)}ms`,
  ].join("\n");
}
