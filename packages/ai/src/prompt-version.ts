/**
 * @oneact/ai — Prompt 版本管理 + A/B 测试（策划书 AI 工程化补强 #5）
 *
 * 问题：spec.ts 的 prompt 是一个函数，改一行代码效果就可能天差地别，
 *       但没有版本管理就无法回退、无法对比、无法量化改动效果。
 *
 * 方案：
 *   1. SpecVersion — 一个 prompt 版本 = { id, build, description, createdAt }
 *   2. SpecRegistry — 注册多个版本，当前激活版本可切换
 *   3. ABTestResult — 用 benchmark 跑两次，compareReports 对比
 *   4. 所有版本记录到 spec-versions.json，支持回退和审计
 */
import type { BenchmarkReport } from "./benchmark.js";
import { compareReports } from "./benchmark.js";
import { buildSpec, type SpecOptions } from "./spec.js";

// ──────────────────────────── 版本定义 ────────────────────────────

/** 一个 prompt 版本：id + build 函数 + 元数据。 */
export interface SpecVersion {
  /** 版本 id（如 "v1.0", "v1.1-add-decor"） */
  id: string;
  /** 人类可读描述（改了什么） */
  description: string;
  /** 创建时间 */
  createdAt: string;
  /** 该版本的 spec build 函数 */
  build: (opts: SpecOptions) => string;
  /** 该版本基准跑分结果（A/B 对比时填充） */
  benchmark?: BenchmarkReport;
  /** 标签（如 "stable", "experiment", "rollback"） */
  tags?: string[];
}

// ──────────────────────────── 注册表 ────────────────────────────

/**
 * Spec 版本注册表。
 *
 * 用法：
 *   const registry = new SpecRegistry();
 *   registry.register("v1", "初始版本", buildSpec);
 *   registry.register("v2", "增加装饰元素指引", buildSpecV2);
 *   registry.activate("v2");
 *   const spec = registry.build({ theme: "yuanshan-blue" });
 */
export class SpecRegistry {
  private versions = new Map<string, SpecVersion>();
  private activeId!: string;
  private order: string[] = [];

  /** 注册一个版本。第一个注册的自动激活。 */
  register(id: string, description: string, build: (opts: SpecOptions) => string, tags?: string[]): SpecVersion {
    const version: SpecVersion = {
      id,
      description,
      createdAt: new Date().toISOString(),
      build,
      tags,
    };
    this.versions.set(id, version);
    this.order.push(id);
    if (!this.activeId) this.activeId = id;
    return version;
  }

  /** 切换当前激活版本。 */
  activate(id: string): void {
    if (!this.versions.has(id)) {
      throw new Error(`Spec 版本 "${id}" 未注册`);
    }
    this.activeId = id;
  }

  /** 获取当前激活版本。 */
  get active(): SpecVersion {
    const v = this.versions.get(this.activeId);
    if (!v) throw new Error("无激活的 Spec 版本");
    return v;
  }

  /** 用当前激活版本 build spec。 */
  build(opts: SpecOptions): string {
    return this.active.build(opts);
  }

  /** 列出全部版本（按注册顺序）。 */
  list(): SpecVersion[] {
    return this.order.map((id) => this.versions.get(id)!).filter(Boolean);
  }

  /** 获取某版本。 */
  get(id: string): SpecVersion | undefined {
    return this.versions.get(id);
  }

  /** 回退到上一个版本。 */
  rollback(): SpecVersion | null {
    const idx = this.order.indexOf(this.activeId);
    if (idx <= 0) return null;
    this.activeId = this.order[idx - 1];
    return this.active;
  }

  /** 记录某版本的跑分结果。 */
  recordBenchmark(id: string, report: BenchmarkReport): void {
    const v = this.versions.get(id);
    if (v) v.benchmark = report;
  }

  /** 序列化为 JSON（持久化到 spec-versions.json）。 */
  toJSON(): Omit<SpecVersion, "build">[] {
    return this.list().map(({ build: _, ...rest }) => rest);
  }
}

// ──────────────────────────── A/B 测试 ────────────────────────────

export interface ABTestConfig {
  /** 基线版本 id（对照） */
  baseline: string;
  /** 实验版本 id（改动） */
  experiment: string;
  /** 使用的跑分报告（baseline / experiment） */
  baselineReport: BenchmarkReport;
  experimentReport: BenchmarkReport;
}

export interface ABTestResult {
  config: ABTestConfig;
  /** 格式化的对比文本 */
  comparison: string;
  /** 实验版是否优于基线 */
  improved: boolean;
  /** 关键指标变化 */
  deltas: {
    firstPassRate: number;
    passRate: number;
    avgRetries: number;
    avgWarnings: number;
    avgLayoutCoverage: number;
    avgComponentCoverage: number;
  };
  /** 建议：adopt（采用）/ reject（拒绝）/ inconclusive（需更多数据） */
  recommendation: "adopt" | "reject" | "inconclusive";
}

/** 运行一次 A/B 测试，对比两个版本的跑分。 */
export function runABTest(config: ABTestConfig): ABTestResult {
  const comparison = compareReports(config.baselineReport, config.experimentReport);
  const b = config.baselineReport.summary;
  const a = config.experimentReport.summary;

  const deltas = {
    firstPassRate: round(a.firstPassRate - b.firstPassRate),
    passRate: round(a.passRate - b.passRate),
    avgRetries: round(a.avgRetries - b.avgRetries, 2),
    avgWarnings: round(a.avgWarnings - b.avgWarnings, 1),
    avgLayoutCoverage: round(a.avgLayoutCoverage - b.avgLayoutCoverage),
    avgComponentCoverage: round(a.avgComponentCoverage - b.avgComponentCoverage),
  };

  // 判断：首次通过率提升 ≥5% 且无指标显著退化 → adopt
  //       首次通过率下降 ≥5% → reject
  //       否则 inconclusive
  let recommendation: "adopt" | "reject" | "inconclusive";
  const fpDelta = deltas.firstPassRate;
  const retryWorse = deltas.avgRetries > 0.3;
  const warningWorse = deltas.avgWarnings > 1;

  if (fpDelta >= 0.05 && !retryWorse && !warningWorse) {
    recommendation = "adopt";
  } else if (fpDelta <= -0.05) {
    recommendation = "reject";
  } else {
    recommendation = "inconclusive";
  }

  const improved = recommendation === "adopt";

  return { config, comparison, improved, deltas, recommendation };
}

/** 格式化 A/B 结果为可读文本（PR 评论 / 报告用）。 */
export function formatABResult(result: ABTestResult): string {
  const { config, deltas, recommendation } = result;
  const sign = (n: number | string) => (Number(n) > 0 ? `+${n}` : `${n}`);

  return [
    `=== A/B Test: ${config.baseline} vs ${config.experiment} ===`,
    ``,
    `首次通过率:   ${sign((deltas.firstPassRate * 100).toFixed(1))}%`,
    `总通过率:     ${sign((deltas.passRate * 100).toFixed(1))}%`,
    `平均重试:     ${sign(deltas.avgRetries)}`,
    `平均警告:     ${sign(deltas.avgWarnings)}`,
    `版式覆盖:     ${sign((deltas.avgLayoutCoverage * 100).toFixed(1))}%`,
    `组件覆盖:     ${sign((deltas.avgComponentCoverage * 100).toFixed(1))}%`,
    ``,
    `建议: ${recommendation === "adopt" ? "ADOPT（采用实验版）" : recommendation === "reject" ? "REJECT（保持基线）" : "INCONCLUSIVE（需更多数据）"}`,
    ``,
    result.comparison,
  ].join("\n");
}

// ──────────────────────────── 默认注册表 ────────────────────────────

/** 全局默认注册表，注册了当前 spec.ts 作为 v1。 */
export function createDefaultRegistry(): SpecRegistry {
  const registry = new SpecRegistry();
  registry.register("v1.0", "初始版本：完整 spec（组件清单 + 版式坐标 + 设计法则 + 自检清单 + 负面示例）", buildSpec, [
    "stable",
  ]);
  return registry;
}

// ──────────────────────────── 工具 ────────────────────────────

function round(n: number, digits = 3): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
