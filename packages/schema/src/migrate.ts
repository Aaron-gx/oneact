/**
 * @oneact/schema — 格式迁移器
 *
 * 链式纯函数 migrate(deck, from, to)：v1→v2→v3 逐级应用。
 * 格式一旦发布即冻结，永不 breaking change，只新增迁移器。
 * 旧 runtime 遇新格式给出明确提示（由 validator 的 format-version 规则保证）。
 */
import { FORMAT_VERSION } from "./format.js";
import type { Deck } from "./types.js";

export interface Migration {
  from: number;
  to: number;
  apply: (deck: Deck) => Deck;
}

/** 已注册的迁移步骤（当前仅 v1，无历史迁移）。 */
export const MIGRATIONS: Migration[] = [];

/** 注册一条迁移步骤（迁移器开发时用）。 */
export function registerMigration(m: Migration): void {
  MIGRATIONS.push(m);
  MIGRATIONS.sort((a, b) => a.from - b.from);
}

export interface MigrateResult {
  deck: Deck;
  migrated: boolean;
}

/**
 * 把 deck 从其声明版本迁移到目标版本（默认当前版本）。
 * - 声明版本高于目标 → 抛错（旧 runtime 遇新格式）。
 * - 声明版本等于目标 → 原样返回。
 * - 声明版本低于目标 → 逐级应用迁移器。
 */
export function migrate(deck: Deck, to: number = FORMAT_VERSION): MigrateResult {
  let d = deck;
  let from = typeof d.formatVersion === "number" ? d.formatVersion : 0;
  if (from > to) {
    throw new Error(`formatVersion ${from} 高于运行时支持 ${to}，请升级 OneAct 运行时。`);
  }
  let changed = false;
  while (from < to) {
    const m = MIGRATIONS.find((x) => x.from === from);
    if (!m) {
      throw new Error(`缺少 ${from} → ${from + 1} 迁移器，无法继续迁移。`);
    }
    d = { ...m.apply(d), formatVersion: m.to };
    from = m.to;
    changed = true;
  }
  // 防御性归一化（与版本无关）：AI 生成或旧文件可能输出 pages / elements 不是数组，
  // 统一兜底成数组，避免下游渲染/导出出现「xxx is not iterable」崩溃。合法数据结构不变。
  d = {
    ...d,
    pages: Array.isArray(d.pages)
      ? d.pages.map((p) => (p && typeof p === "object" ? { ...p, elements: Array.isArray(p.elements) ? p.elements : [] } : p))
      : [],
  };
  return { deck: d, migrated: changed };
}
