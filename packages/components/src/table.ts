/**
 * @oneact/components — 表格组件（固定画布模型下最难组件，规则见策划书 4.10）
 *  - 列宽用比例声明（columns: [2,1,1]），随 rect 宽度自适应
 *  - 行高内容驱动；rect.h 语义为最大高度（超出由校验器软警告，不做表内滚动）
 */
import type { AnyElement } from "@oneact/schema";
import { renderRuns } from "./text.js";

export function table(el: AnyElement): string {
  if (el.type !== "table") return "";
  const p = el.props;
  const totalRatio = p.columns.reduce((a: number, b: number) => a + b, 0) || 1;
  const widths = p.columns.map((c: number) => ((c / totalRatio) * 100).toFixed(2) + "%");
  const fs = p.fontSize ? `${p.fontSize}px` : "var(--oa-fs-small)";
  const headColor = p.headColor ?? "var(--oa-color-primary-soft)";

  const colgroup = widths.map((w) => `<col style="width:${w}"/>`).join("");
  const head = p.head
    ? `<thead><tr>${p.head
        .map(
          (h) =>
            `<th style="text-align:left;padding:11px 14px;background:${headColor};color:var(--oa-color-text);font-weight:600;border-bottom:1px solid var(--oa-color-border);">${renderRuns(
              h,
            )}</th>`,
        )
        .join("")}</tr></thead>`
    : "";
  const rows = p.rows
    .map(
      (r, ri) =>
        `<tr>${r
          .map(
            (c) =>
              `<td style="padding:10px 14px;border-bottom:1px solid var(--oa-color-border);${ri % 2 === 1 && p.zebra ? "background:var(--oa-color-surface);" : ""}vertical-align:top;overflow:hidden;">${renderRuns(
                c,
              )}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `<table class="oa-table" style="width:100%;border-collapse:collapse;font-size:${fs};font-family:var(--oa-font-body);table-layout:fixed;"><colgroup>${colgroup}</colgroup>${head}<tbody>${rows}</tbody></table>`;
}
