/**
 * @oneact/components — 逃逸块（custom-html / custom-svg），发布红线（策划书 4.11）
 *
 * 主防线：iframe sandbox（默认禁脚本/同源/表单）+ 严格 CSP。
 * 补充：DOMPurify-lite 白名单消毒（见 sanitize.ts）。
 * 确需脚本的逃逸块须用户显式 trusted（仅放开 allow-scripts，不开 same-origin，脚本无法访问父文档）。
 */
import { escapeHtml } from "@oneact/core";
import type { AnyElement } from "@oneact/schema";
import { escapeAttr, sanitizeHtml, sanitizeSvg } from "./sanitize.js";

export function customHtml(el: AnyElement): string {
  if (el.type !== "custom-html") return "";
  const p = el.props;
  // trusted 仅放开脚本（不放开 same-origin，防脚本逃逸沙箱访问父文档）
  const sandbox = p.trusted ? "allow-scripts" : "";
  const scriptCsp = p.trusted ? " script-src 'unsafe-inline';" : "";
  const csp = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src https:;${scriptCsp}">`;
  const body = sanitizeHtml(p.html);
  const doc = `<!DOCTYPE html><html><head>${csp}<style>html,body{margin:0;padding:0;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1c1a;background:transparent;}*{box-sizing:border-box}a{color:#2f54eb}</style></head><body>${body}</body></html>`;
  return `<iframe class="oa-escape" sandbox="${sandbox}" srcdoc="${escapeAttr(
    doc,
  )}" style="width:100%;height:100%;border:0;background:transparent;color-scheme:normal;" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
}

export function customSvg(el: AnyElement): string {
  if (el.type !== "custom-svg") return "";
  const p = el.props;
  const clean = sanitizeSvg(p.svg);
  const title = p.title ? `<title>${escapeHtml(p.title)}</title>` : "";
  return `<div class="oa-svg" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;">${ensureSvgSizing(
    clean,
    title,
  )}</div>`;
}

/** 确保内联 svg 填满容器：若无 width/height/viewBox 则补默认。 */
function ensureSvgSizing(svg: string, title: string): string {
  let s = svg.trim();
  if (!/^<svg/i.test(s)) return escapeHtml(s);
  if (title && !/<title>/i.test(s))
    s = s.replace(/^<svg\b/i, `<svg data-t="1"`) && s.replace(/(<svg[^>]*>)/i, `$1${title}`);
  if (!/viewbox=/i.test(s)) s = s.replace(/^<svg\b/i, '<svg viewBox="0 0 100 100"');
  s = s.replace(/(<svg\b[^>]*?)\s+width\s*=\s*("[^"]*"|'[^']*')/i, "$1");
  s = s.replace(/(<svg\b[^>]*?)\s+height\s*=\s*("[^"]*"|'[^']*')/i, "$1");
  s = s.replace(/^<svg\b/i, '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"');
  return s;
}
