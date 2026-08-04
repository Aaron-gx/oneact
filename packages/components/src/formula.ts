/**
 * @oneact/components — 公式组件（KaTeX）
 * AI 写 LaTeX 源码，渲染层调 KaTeX 翻译。需页面注入 KaTeX CSS（见 KATEX_CSS）。
 */
import { escapeHtml } from "@oneact/core";
import type { AnyElement } from "@oneact/schema";
import katex from "katex";

/** KaTeX 样式表（CDN），player/editor 注入 <link>。 */
export const KATEX_CSS = "https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css";

export function formula(el: AnyElement): string {
  if (el.type !== "formula") return "";
  const p = el.props;
  const latex = p.latex ?? "";
  let html: string;
  try {
    html = katex.renderToString(latex, { throwOnError: false, displayMode: p.display !== false, output: "html" });
  } catch {
    html = escapeHtml(latex);
  }
  const color = p.color ? `color:${p.color};` : "";
  return `<div class="oa-formula" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:auto;font-size:1.7em;${color}">${html}</div>`;
}
