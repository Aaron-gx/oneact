/**
 * @oneact/core — 离屏真实测量（策划书 4.4 终审）
 *
 * 校验器的纯计算估算只做"渲染前快速预检"；
 * 终审用离屏真实测量：把页面 DOM 离屏渲染，以 scrollHeight / getBoundingClientRect()
 * 读取真实溢出与重叠，消除中英文混排、加粗、padding 带来的估算误差。
 *
 * 仅浏览器环境生效（有 document）；node 环境自动跳过，回退到纯估算。
 */
import {
  canvasSize,
  getTheme,
  type Deck,
  type Issue,
  type Page,
  type Theme,
  validateDeck,
  type ValidationResult,
} from "@oneact/schema";
import { renderPage } from "./render.js";

/** 离屏测量单页：返回真实溢出 / 重叠的软警告 issue（rule 带 -measured 后缀）。 */
export function measurePage(page: Page, theme: Theme): Issue[] {
  if (typeof document === "undefined") return []; // 非浏览器环境：交给纯估算
  const issues: Issue[] = [];
  const cs = canvasSize();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:absolute;left:-99999px;top:0;width:${cs.width}px;height:${cs.height}px;visibility:hidden;pointer-events:none;`;
  host.innerHTML = renderPage(page, theme, { interactive: false });
  document.body.appendChild(host);

  try {
    const els = Array.from(host.querySelectorAll<HTMLElement>("[data-id]"));
    // 1) 真实文本溢出：临时放开高度测内容真实高
    for (const el of els) {
      const cap = el.clientHeight; // rect.h
      if (cap <= 0) continue;
      const origH = el.style.height;
      const origOv = el.style.overflow;
      el.style.height = "auto";
      el.style.overflow = "visible";
      const contentH = el.scrollHeight;
      el.style.height = origH;
      el.style.overflow = origOv;
      if (contentH > cap + 1) {
        issues.push({
          severity: "warning",
          rule: "overflow-measured",
          message: `文本真实溢出约 ${Math.round(contentH - cap)}px（离屏测量）`,
          pageId: page.id,
          elementId: el.dataset.id,
          detail: { measured: Math.round(contentH), capacity: cap },
        });
      }
    }
    // 2) 真实重叠：getBoundingClientRect
    const rects = els.map((el) => ({ id: el.dataset.id || "?", r: el.getBoundingClientRect() }));
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        const iw = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        const ih = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        const inter = iw * ih;
        if (inter <= 0) continue;
        const area = (r: DOMRect) => (r.right - r.left) * (r.bottom - r.top);
        const minA = Math.min(area(a), area(b));
        const ratio = minA > 0 ? inter / minA : 0;
        if (ratio > 0.2) {
          issues.push({
            severity: "warning",
            rule: "overlap-measured",
            message: `元素真实重叠 ${(ratio * 100).toFixed(0)}%（离屏测量）：${rects[i].id} ↔ ${rects[j].id}`,
            pageId: page.id,
            detail: { a: rects[i].id, b: rects[j].id, ratio: Number(ratio.toFixed(2)) },
          });
        }
      }
    }
  } finally {
    host.remove();
  }
  return issues;
}

/** 离屏测量整份 deck。 */
export function measureDeck(deck: Deck, theme?: Theme): Issue[] {
  const t = theme ?? getTheme(deck.meta.theme);
  return deck.pages.flatMap((p) => measurePage(p, t));
}

/**
 * 校验 + 离屏测量合并（浏览器终审入口）。
 * = schema.validateDeck（纯估算预检）+ measureDeck（离屏真实测量），warnings 合并。
 */
export function validateDeckMeasured(deck: Deck, theme?: Theme): ValidationResult {
  const t = theme ?? getTheme(deck.meta.theme);
  const r = validateDeck(deck, { theme: t });
  const measured = measureDeck(deck, t);
  if (measured.length) r.warnings.push(...measured);
  return r;
}
