/**
 * @oneact/components — 文本类组件（heading / paragraph / bullet-list）
 *
 * 富文本 = runs 数组：一段文字由若干片段组成，每片可独立 bold/italic/color，支持中英混排。
 */
import { escapeHtml, toneVar, animInlineStyle } from "@oneact/core";
import type { AnyElement, RichText, Run } from "@oneact/schema";

/** 富文本 → HTML（每片可独立样式，超链接加 rel=noopener）。 */
export function renderRuns(rich: RichText): string {
  const runs: Run[] = typeof rich === "string" ? [{ text: rich }] : rich;
  return runs.map(runToHtml).join("");
}

function runToHtml(r: Run): string {
  let inner = escapeHtml(r.text);
  const styles: string[] = [];
  if (r.bold) styles.push("font-weight:700");
  if (r.italic) styles.push("font-style:italic");
  if (r.underline) styles.push("text-decoration:underline");
  if (r.color) styles.push(`color:${r.color}`);
  if (r.fontSize) styles.push(`font-size:${r.fontSize}px`);
  if (r.fontFamily) styles.push(`font-family:${r.fontFamily}`);
  if (styles.length) inner = `<span style="${styles.join(";")}">${inner}</span>`;
  if (r.href) {
    return `<a href="${escapeHtml(r.href)}" target="_blank" rel="noopener noreferrer" style="color:var(--oa-color-primary);text-decoration:underline;">${inner}</a>`;
  }
  return inner;
}

/** 元素级 bold/italic/underline → CSS 片段（应用到容器，覆盖整段文字）。
 *  注意：bold 必须有肉眼可辨的跳跃 —— 段落 400→700、标题 700→800。
 *  旧实现 baseWeight+100（段落 400→500）几乎看不出变化，是「加粗没反应」的根因。 */
function fmtStyle(p: { bold?: boolean; italic?: boolean; underline?: boolean }, baseWeight: number): string {
  const s: string[] = [`font-weight:${p.bold ? (baseWeight >= 700 ? 800 : 700) : baseWeight}`];
  if (p.italic) s.push("font-style:italic");
  if (p.underline) s.push("text-decoration:underline");
  return s.join(";");
}

export function heading(el: AnyElement): string {
  if (el.type !== "heading") return "";
  const p = el.props;
  const level = p.level ?? 1;
  const fs = `var(--oa-fs-h${level})`;
  const color = p.color ?? toneVar(p.tone ?? "text");
  const align = p.align ?? "left";
  return `<div class="oa-heading" data-oa-edit="text" style="font-family:var(--oa-font-heading);font-size:${fs};${fmtStyle(p, 700)};line-height:1.2;color:${color};text-align:${align};width:100%;height:100%;display:flex;align-items:center;">${renderRuns(
    p.text,
  )}</div>`;
}

export function paragraph(el: AnyElement): string {
  if (el.type !== "paragraph") return "";
  const p = el.props;
  const fs = p.fontSize ? `${p.fontSize}px` : "var(--oa-fs-body)";
  const color = p.color ?? toneVar(p.tone ?? "text");
  const align = p.align ?? "left";
  const lh = p.lineHeight ?? 1.7;
  return `<div class="oa-paragraph" data-oa-edit="text" style="font-size:${fs};${fmtStyle(p, 400)};line-height:${lh};color:${color};text-align:${align};white-space:pre-line;word-break:break-word;width:100%;height:100%;overflow:hidden;">${renderRuns(
    p.text,
  )}</div>`;
}

export function bulletList(el: AnyElement): string {
  if (el.type !== "bullet-list") return "";
  const p = el.props;
  const fs = p.fontSize ? `${p.fontSize}px` : "var(--oa-fs-body)";
  const color = p.color ?? "var(--oa-color-text)";
  const gap = p.gap ?? 10;
  const tag = p.ordered ? "ol" : "ul";
  const marker = p.marker ?? (p.ordered ? "decimal" : "disc");
  const listStyle = marker === "none" ? "none" : marker;
  const items = p.items
    .map((item, i) => {
      const anim = el.anim ? animInlineStyle(el.anim, i) : "";
      return `<li style="${anim}">${renderRuns(item)}</li>`;
    })
    .join("");
  return `<${tag} class="oa-list" data-oa-edit="items" style="font-size:${fs};${fmtStyle(p, 400)};line-height:1.5;color:${color};list-style:${listStyle};list-style-position:outside;padding-left:1.5em;margin:0;display:flex;flex-direction:column;gap:${gap}px;width:100%;height:100%;overflow:hidden;">${items}</${tag}>`;
}
