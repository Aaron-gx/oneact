/**
 * @oneact/components — 音视频组件（HTML5 video / audio）
 * src 支持 URL / base64。Web 运行时多出的实时/多媒体维度。
 */
import { escapeHtml } from "@oneact/core";
import type { AnyElement } from "@oneact/schema";

export function video(el: AnyElement): string {
  if (el.type !== "video") return "";
  const p = el.props;
  const controls = p.controls !== false ? "controls" : "";
  const attrs = [
    controls,
    p.autoplay ? "autoplay" : "",
    p.loop ? "loop" : "",
    p.muted ? "muted" : "",
    p.autoplay ? "playsinline" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const poster = p.poster ? `poster="${escapeHtml(p.poster)}"` : "";
  return `<video src="${escapeHtml(p.src)}" ${poster} ${attrs} style="width:100%;height:100%;object-fit:contain;background:#000;border-radius:8px;display:block;" preload="metadata"></video>`;
}

export function audio(el: AnyElement): string {
  if (el.type !== "audio") return "";
  const p = el.props;
  const controls = p.controls !== false ? "controls" : "";
  const attrs = [controls, p.autoplay ? "autoplay" : "", p.loop ? "loop" : ""].filter(Boolean).join(" ");
  return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--oa-color-surface);border-radius:8px;"><audio src="${escapeHtml(
    p.src,
  )}" ${attrs} style="width:92%;" preload="metadata"></audio></div>`;
}
