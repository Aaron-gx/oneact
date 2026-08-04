/**
 * @oneact/core — 渲染引擎
 *
 * 固定画布（1280×720 / size 预设）+ 绝对定位 + 等比缩放（投影仪模型）。
 * 渲染产出 HTML 字符串：node 可测试，浏览器 innerHTML 即挂载。
 * 缩放由 player 在外层容器用 transform:scale 应用（见 computeScale）。
 */
import { canvasSize, getTheme, type Background, type Deck, type Page, type Theme } from "@oneact/schema";
import { animInlineStyle, animKeyframesCss } from "./animation.js";
import { escapeHtml, renderInner, type RenderContext } from "./registry.js";
import { themeToCssVars } from "./theme.js";
import { transitionKeyframesCss } from "./transitions.js";

export interface RenderOptions {
  theme?: Theme;
  canvasW?: number;
  canvasH?: number;
  /** 是否输出 data-id/data-type 供编辑器点选（默认 true）。 */
  interactive?: boolean;
}

function bgStyle(bg?: Background): string {
  if (!bg) return "";
  if (bg.color) return `background:${bg.color};`;
  if (bg.gradient)
    return `background:linear-gradient(${bg.gradient.angle ?? 135}deg,${bg.gradient.from},${bg.gradient.to});`;
  if (bg.image) return `background:url('${bg.image.src}') center/${bg.image.fit ?? "cover"} no-repeat;`;
  return "";
}

/**
 * 转义 style 属性值中的双引号，防止 HTML 属性提前闭合。
 * 安全审计修复（2026-08-02）：同时拦截 CSS 中的危险模式（expression/url(javascript:)），
 * 防止通过 background/color 等 CSS 属性注入恶意代码。
 */
function escapeStyle(s: string): string {
  // 1. 转义双引号防属性闭合
  let escaped = s.replace(/"/g, "&quot;");
  // 2. 拦截 CSS 注入向量（expression()、url(javascript:)、-moz-binding）
  escaped = escaped.replace(/expression\s*\(/gi, "removed(");
  escaped = escaped.replace(/url\s*\(\s*["']?\s*javascript:/gi, "url(removed:");
  escaped = escaped.replace(/-moz-binding\s*:/gi, "removed:");
  return escaped;
}

export function renderPage(
  page: Page,
  theme: Theme,
  opts: { canvasW?: number; canvasH?: number; interactive?: boolean } = {},
): string {
  const W = opts.canvasW ?? 1280;
  const H = opts.canvasH ?? 720;
  const interactive = opts.interactive !== false;
  // 防御：elements 可能缺失/非数组（LLM 残缺输出），避免渲染崩溃
  const els = (Array.isArray(page?.elements) ? page.elements : [])
    .filter((el) => el && Array.isArray(el.rect) && el.rect.length >= 4)
    .map((el) => {
      const [x, y, w, h] = el.rect;
      const ctx: RenderContext = { theme, pageId: page.id, elementId: el.id };
      const inner = renderInner(el, ctx);
      const anim = el.anim ? animInlineStyle(el.anim) : "";
      const cls = `oa-el oa-el-${el.type}${el.className ? " " + el.className : ""}`;
      const data = interactive ? `data-id="${escapeHtml(el.id)}" data-type="${escapeHtml(el.type)}"` : "";
      const slotAttr = el.slot ? `data-slot="${escapeHtml(el.slot)}"` : "";
      return `<div class="${cls}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${anim}" ${data} ${slotAttr}>${inner}</div>`;
    })
    .join("");
  const canvasStyle = `${themeToCssVars(theme)};position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--oa-color-bg);${bgStyle(page.background)}`;
  return `<div class="oa-canvas" data-page="${escapeHtml(page.id)}" style="${escapeStyle(canvasStyle)}">${els}</div>`;
}

export function renderDeck(deck: Deck, opts: { theme?: Theme; interactive?: boolean } = {}): string {
  const theme = opts.theme ?? getTheme(deck.meta.theme);
  const cs = canvasSize(deck.meta.size);
  const pages = deck.pages
    .map((p) => renderPage(p, theme, { canvasW: cs.width, canvasH: cs.height, interactive: opts.interactive }))
    .join("\n");
  return `<div class="oa-deck" data-format-version="${deck.formatVersion}" style="${escapeStyle(themeToCssVars(theme))}">${pages}</div>`;
}

/** 基础 CSS（reset / 字体 / 选中态）。 */
export function deckBaseCss(): string {
  return `
.oa-deck{font-family:var(--oa-font-body);color:var(--oa-color-text);}
.oa-deck *{box-sizing:border-box;}
.oa-canvas{font-family:var(--oa-font-body);}
.oa-el{outline:0;}
.oa-el[data-selected="1"]{outline:2px solid var(--oa-color-primary);outline-offset:2px;}
`.trim();
}

/** 汇总所有运行时 CSS（基础 + 动画 keyframes + 切换 keyframes），注入一次。 */
export function runtimeCss(): string {
  return [deckBaseCss(), animKeyframesCss(), transitionKeyframesCss()].join("\n");
}

/** 计算画布在容器内的等比缩放比（投影仪模型：缩放构图不变）。 */
export function computeScale(containerW: number, containerH: number, canvasW = 1280, canvasH = 720): number {
  return Math.min(containerW / canvasW, containerH / canvasH);
}
