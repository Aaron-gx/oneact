/**
 * @oneact/core — 导出器注册点（策划书第 10 节：五类注册点之一）
 *
 * 五类注册点：组件（registerComponent）/ 版式（registerLayout）/ 主题（registerTheme）
 *              / 导出器（registerExporter）/ AI Skill。
 * 第三方可注册自定义导出器（pdf / png / pptx / 自定义），编辑器/CLI 通过 listExporters 枚举。
 */
import type { Deck } from "@oneact/schema";

export interface ExportResult {
  /** 导出内容（字符串：文本/JSON/HTML；或 Blob：二进制）。 */
  data: string | Blob;
  filename: string;
  mime: string;
}

export interface DeckExporter {
  name: string;
  label: string;
  ext: string;
  mime: string;
  /** 是否在当前环境可用（如 pptx 需特定依赖）。 */
  available?: () => boolean;
  export(deck: Deck): ExportResult | Promise<ExportResult>;
}

const exporters = new Map<string, DeckExporter>();

export function registerExporter(e: DeckExporter): void {
  exporters.set(e.name, e);
}
export function registerExporters(list: DeckExporter[]): void {
  list.forEach(registerExporter);
}
export function listExporters(): DeckExporter[] {
  return [...exporters.values()];
}
export function getExporter(name: string): DeckExporter | undefined {
  return exporters.get(name);
}
