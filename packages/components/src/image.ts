/**
 * @oneact/components — 图片组件
 * src 支持 URL / base64 / 占位符（"placeholder:描述" → 灰块 + 文字标注）。
 */
import { escapeHtml } from "@oneact/core";
import type { AnyElement } from "@oneact/schema";

export function image(el: AnyElement): string {
  if (el.type !== "image") return "";
  const p = el.props;
  const fit = p.fit ?? "cover";
  const radius = p.radius ?? 0;

  if (typeof p.src === "string" && p.src.startsWith("placeholder:")) {
    const label = p.src.slice("placeholder:".length).trim() || "图片占位";
    return `<div style="width:100%;height:100%;background:var(--oa-color-surface);border:2px dashed var(--oa-color-border);border-radius:${radius}px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--oa-color-text-secondary);gap:10px;text-align:center;padding:12px;"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg><span style="font-size:14px;">${escapeHtml(label)}</span></div>`;
  }

  const alt = escapeHtml(p.alt ?? "");
  return `<img src="${escapeHtml(p.src ?? "")}" alt="${alt}" style="width:100%;height:100%;object-fit:${fit};border-radius:${radius}px;display:block;" loading="lazy"/>`;
}
