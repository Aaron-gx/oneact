/**
 * @oneact/components — 复合语义组件（WS1）
 *
 * 设计哲学：把「视觉组合的确定性」从 LLM 移到这里。AI 只填语义字段（数组/枚举），
 * 本文件确定性产出整组精致视觉（卡片底 + 图标 + 标题 + 描述 + 连线/箭头…）。
 * 这样根除「AI 发了容器 shape 却漏发内容子元素」的空卡片问题，质量稳定达到设计师级。
 *
 * 全部走主题 CSS 变量，换肤自动生效；文字一律经 renderRuns（转义 + 富文本）。
 */
import type { AnyElement, RichText } from "@oneact/schema";
import { iconSvg } from "./icon.js";
import { renderRuns } from "./text.js";

/** 主题语义色 → CSS 变量。 */
function toneColor(tone?: string): string {
  if (tone === "accent") return "var(--oa-color-accent)";
  return "var(--oa-color-primary)";
}

/** 富文本 → 安全 HTML。 */
function rt(t: RichText | undefined): string {
  return t ? renderRuns(t) : "";
}

/** 取字符串富文本的纯首字符（头像占位用）。 */
function initial(t: RichText): string {
  const s = typeof t === "string" ? t : t.map((r) => r.text).join("");
  return (s.trim()[0] || "?").toUpperCase();
}

// ─────────────────────────── KPI 指标卡 ───────────────────────────

export function kpi(el: AnyElement): string {
  if (el.type !== "kpi") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const trendColor =
    p.trend?.dir === "down" ? "#dc2626" : p.trend?.dir === "flat" ? "var(--oa-color-text-secondary)" : "#16a34a";
  const icon = p.icon ? iconSvg(p.icon, 26, c) : "";
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-radius:var(--oa-radius);padding:22px 26px;box-shadow:var(--oa-shadow);box-sizing:border-box">
    ${icon ? `<div style="width:44px;height:44px;border-radius:12px;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center">${icon}</div>` : ""}
    <div data-oa-edit="value" style="font-family:var(--oa-font-number);font-size:var(--oa-fs-h1);font-weight:800;line-height:1.05;color:${c};letter-spacing:-.01em">${rt(p.value)}</div>
    ${p.label ? `<div style="font-size:var(--oa-fs-small);color:var(--oa-color-text-secondary);font-weight:500">${rt(p.label)}</div>` : ""}
    ${p.trend ? `<div style="font-size:var(--oa-fs-small);color:${trendColor};font-weight:600">${rt(p.trend.text)}</div>` : ""}
  </div>`;
}

// ─────────────────────────── 统计网格 ───────────────────────────

export function statGrid(el: AnyElement): string {
  if (el.type !== "stat-grid") return "";
  const p = el.props;
  const n = p.cells.length;
  const cols = p.columns ?? (n <= 2 ? 2 : n === 3 ? 3 : 4);
  const cells = p.cells
    .map((cell) => {
      const c = toneColor(cell.tone);
      return `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-radius:var(--oa-radius);padding:20px 12px;box-shadow:var(--oa-shadow);box-sizing:border-box">
        ${cell.icon ? iconSvg(cell.icon, 22, c) : ""}
        <div style="font-family:var(--oa-font-number);font-size:var(--oa-fs-h2);font-weight:800;color:${c};line-height:1.05">${rt(cell.value)}</div>
        ${cell.label ? `<div style="font-size:var(--oa-fs-small);color:var(--oa-color-text-secondary);text-align:center">${rt(cell.label)}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:grid;grid-template-columns:repeat(${cols},1fr);gap:16px;box-sizing:border-box">${cells}</div>`;
}

// ─────────────────────────── 特性卡片 ───────────────────────────

export function featureCard(el: AnyElement): string {
  if (el.type !== "feature-card") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const icon = p.icon ? iconSvg(p.icon, 28, c) : "";
  return `<div style="height:100%;display:flex;flex-direction:column;gap:14px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-radius:var(--oa-radius);padding:26px;box-shadow:var(--oa-shadow);box-sizing:border-box">
    ${icon ? `<div style="width:56px;height:56px;border-radius:14px;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center">${icon}</div>` : ""}
    <div data-oa-edit="title" style="font-family:var(--oa-font-heading);font-size:var(--oa-fs-h3);font-weight:700;color:${c};line-height:1.25">${rt(p.title)}</div>
    ${p.desc ? `<div data-oa-edit="desc" style="font-size:15px;line-height:1.7;color:var(--oa-color-text-secondary)">${rt(p.desc)}</div>` : ""}
  </div>`;
}

// ─────────────────────────── 特性列表（多行）───────────────────────────

export function featureList(el: AnyElement): string {
  if (el.type !== "feature-list") return "";
  const p = el.props;
  const rows = p.items
    .map((it, i) => {
      const marker = p.numbered
        ? `<div style="flex:none;width:36px;height:36px;border-radius:50%;background:var(--oa-color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--oa-font-number);font-weight:700;font-size:16px">${i + 1}</div>`
        : it.icon
          ? `<div style="flex:none;width:40px;height:40px;border-radius:10px;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center">${iconSvg(it.icon, 22, "var(--oa-color-primary)")}</div>`
          : `<div style="flex:none;width:10px;height:10px;border-radius:50%;background:var(--oa-color-primary);margin-top:8px"></div>`;
      const last = i === p.items.length - 1;
      return `<div style="display:flex;align-items:flex-start;gap:16px;padding:14px 4px;${last ? "" : "border-bottom:1px solid var(--oa-color-border);"}box-sizing:border-box">
        ${marker}
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--oa-font-heading);font-size:var(--oa-fs-h3);font-weight:600;color:var(--oa-color-text);line-height:1.3">${rt(it.title)}</div>
          ${it.desc ? `<div style="font-size:15px;line-height:1.6;color:var(--oa-color-text-secondary);margin-top:4px">${rt(it.desc)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box">${rows}</div>`;
}

// ─────────────────────────── 时间线 ───────────────────────────

export function timeline(el: AnyElement): string {
  if (el.type !== "timeline") return "";
  const p = el.props;
  if (p.orientation === "vertical") {
    const items = p.items
      .map((it) => {
        return `<div style="display:flex;gap:18px;align-items:flex-start">
          <div style="flex:none;display:flex;flex-direction:column;align-items:center">
            <div style="width:16px;height:16px;border-radius:50%;background:var(--oa-color-primary);box-shadow:0 0 0 4px var(--oa-color-primary-soft);flex:none;margin-top:4px"></div>
            <div style="width:2px;flex:1;background:var(--oa-color-border);margin-top:4px"></div>
          </div>
          <div style="flex:1;padding-bottom:22px">
            ${it.time ? `<div style="font-size:var(--oa-fs-small);font-weight:700;color:var(--oa-color-primary);margin-bottom:2px">${rt(it.time)}</div>` : ""}
            <div style="font-family:var(--oa-font-heading);font-size:18px;font-weight:600;color:var(--oa-color-text);line-height:1.3">${rt(it.title)}</div>
            ${it.desc ? `<div style="font-size:14px;line-height:1.6;color:var(--oa-color-text-secondary);margin-top:3px">${rt(it.desc)}</div>` : ""}
          </div>
        </div>`;
      })
      .join("");
    return `<div style="height:100%;display:flex;flex-direction:column;box-sizing:border-box">${items}</div>`;
  }
  // 水平（默认）
  const items = p.items
    .map((it) => {
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:9px;position:relative;z-index:1;min-width:0">
        ${it.time ? `<div style="font-size:var(--oa-fs-small);font-weight:700;color:var(--oa-color-primary)">${rt(it.time)}</div>` : `<div style="height:var(--oa-fs-small)"></div>`}
        <div style="width:18px;height:18px;border-radius:50%;background:var(--oa-color-primary);border:3px solid var(--oa-color-bg);box-shadow:0 0 0 3px var(--oa-color-primary-soft);flex:none"></div>
        <div style="font-family:var(--oa-font-heading);font-size:17px;font-weight:600;color:var(--oa-color-text);line-height:1.3">${rt(it.title)}</div>
        ${it.desc ? `<div style="font-size:13px;line-height:1.55;color:var(--oa-color-text-secondary)">${rt(it.desc)}</div>` : ""}
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;align-items:flex-start;gap:8px;padding:6px 4% 0;position:relative;box-sizing:border-box">
    <div style="position:absolute;left:10%;right:10%;top:calc(var(--oa-fs-small) + 25px);height:3px;background:var(--oa-color-primary-soft);border-radius:2px;z-index:0"></div>
    ${items}
  </div>`;
}

// ─────────────────────────── 流程（步骤 + 箭头）───────────────────────────

export function process(el: AnyElement): string {
  if (el.type !== "process") return "";
  const p = el.props;
  const numbered = p.numbered !== false;
  const parts: string[] = [];
  p.steps.forEach((s, i) => {
    const head = numbered
      ? `<div style="width:48px;height:48px;border-radius:50%;background:var(--oa-color-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--oa-font-number);font-weight:700;font-size:20px;box-shadow:0 4px 12px rgba(47,84,235,.25)">${i + 1}</div>`
      : `<div style="width:48px;height:48px;border-radius:50%;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center">${iconSvg("check", 24, "var(--oa-color-primary)")}</div>`;
    parts.push(
      `<div style="flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;gap:11px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-radius:var(--oa-radius);padding:20px 12px;box-shadow:var(--oa-shadow);box-sizing:border-box;min-width:0">
        ${head}
        <div style="font-family:var(--oa-font-heading);font-size:17px;font-weight:600;color:var(--oa-color-text);line-height:1.3">${rt(s.title)}</div>
        ${s.desc ? `<div style="font-size:13px;line-height:1.55;color:var(--oa-color-text-secondary)">${rt(s.desc)}</div>` : ""}
      </div>`,
    );
    if (i < p.steps.length - 1) {
      parts.push(
        `<div style="flex:none;display:flex;align-items:center;color:var(--oa-color-primary)">${iconSvg("arrow-right", 26, "var(--oa-color-primary)")}</div>`,
      );
    }
  });
  return `<div style="height:100%;display:flex;align-items:stretch;gap:6px;box-sizing:border-box">${parts.join("")}</div>`;
}

// ─────────────────────────── 左右对比 ───────────────────────────

interface SideStyle {
  bg: string;
  border: string;
  accent: string;
  marker: string;
}
function sideStyle(tone?: string): SideStyle {
  if (tone === "negative") return { bg: "#fef2f2", border: "#fecaca", accent: "#dc2626", marker: "x" };
  if (tone === "positive") return { bg: "#f0fdf4", border: "#bbf7d0", accent: "#16a34a", marker: "check-circle" };
  return {
    bg: "var(--oa-color-surface)",
    border: "var(--oa-color-border)",
    accent: "var(--oa-color-primary)",
    marker: "circle",
  };
}

function comparisonSide(title: RichText, items: RichText[] | undefined, s: SideStyle, titleColor: string): string {
  const list = (items ?? [])
    .map((it) => {
      const mk =
        s.marker === "circle"
          ? `<div style="flex:none;width:7px;height:7px;border-radius:50%;background:${s.accent};margin-top:9px"></div>`
          : iconSvg(s.marker, 18, s.accent);
      return `<div style="display:flex;align-items:flex-start;gap:10px;font-size:15px;line-height:1.55;color:var(--oa-color-text)">${mk}<span>${rt(it)}</span></div>`;
    })
    .join("");
  return `<div style="flex:1;display:flex;flex-direction:column;gap:14px;background:${s.bg};border:1px solid ${s.border};border-radius:var(--oa-radius);padding:24px;box-sizing:border-box;min-width:0">
    <div style="font-family:var(--oa-font-heading);font-size:var(--oa-fs-h3);font-weight:700;color:${titleColor}">${rt(title)}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${list}</div>
  </div>`;
}

export function comparison(el: AnyElement): string {
  if (el.type !== "comparison") return "";
  const p = el.props;
  const ls = sideStyle(p.left.tone);
  const rs = sideStyle(p.right.tone);
  return `<div style="height:100%;display:flex;gap:16px;align-items:stretch;box-sizing:border-box">
    ${comparisonSide(p.left.title, p.left.items, ls, "var(--oa-color-text)")}
    ${comparisonSide(p.right.title, p.right.items, rs, "var(--oa-color-primary)")}
  </div>`;
}

// ─────────────────────────── 装饰章节标题 ───────────────────────────

export function sectionTitle(el: AnyElement): string {
  if (el.type !== "section-title") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const align = p.align ?? "left";
  const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const bar = `<div style="flex:none;width:6px;height:1.1em;background:${c};border-radius:3px"></div>`;
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;text-align:${align};box-sizing:border-box">
    ${p.kicker ? `<div style="font-size:var(--oa-fs-small);font-weight:700;letter-spacing:.18em;color:${c};text-transform:uppercase">${rt(p.kicker)}</div>` : ""}
    <div style="display:flex;align-items:center;gap:16px;justify-content:${justify}">
      ${align === "left" ? bar : ""}
      <div data-oa-edit="title" style="font-family:var(--oa-font-heading);font-size:var(--oa-fs-h2);font-weight:800;color:var(--oa-color-text);line-height:1.15">${rt(p.title)}</div>
      ${align !== "left" ? bar : ""}
    </div>
    ${p.subtitle ? `<div style="font-size:var(--oa-fs-body);color:var(--oa-color-text-secondary)">${rt(p.subtitle)}</div>` : ""}
  </div>`;
}

// ─────────────────────────── 提示框 callout ───────────────────────────

interface CalloutStyle {
  bg: string;
  accent: string;
  icon: string;
}
function calloutStyle(variant?: string): CalloutStyle {
  switch (variant) {
    case "success":
      return { bg: "#f0fdf4", accent: "#16a34a", icon: "check-circle" };
    case "warning":
      return { bg: "#fffbeb", accent: "#d97706", icon: "alert" };
    case "tip":
      return { bg: "#f5f3ff", accent: "#7c3aed", icon: "sparkles" };
    case "info":
    default:
      return { bg: "var(--oa-color-primary-soft)", accent: "var(--oa-color-primary)", icon: "info" };
  }
}

export function callout(el: AnyElement): string {
  if (el.type !== "callout") return "";
  const p = el.props;
  const s = calloutStyle(p.variant);
  const icon = iconSvg(p.icon ?? s.icon, 22, s.accent);
  return `<div style="height:100%;display:flex;align-items:flex-start;gap:14px;background:${s.bg};border:1px solid ${s.accent}33;border-left:4px solid ${s.accent};border-radius:var(--oa-radius);padding:16px 20px;box-sizing:border-box">
    <div style="flex:none;margin-top:1px">${icon}</div>
    <div style="flex:1;min-width:0">
      ${p.title ? `<div style="font-weight:700;font-size:var(--oa-fs-body);color:${s.accent};margin-bottom:4px">${rt(p.title)}</div>` : ""}
      <div data-oa-edit="text" style="font-size:var(--oa-fs-body);line-height:1.65;color:var(--oa-color-text)">${rt(p.text)}</div>
    </div>
  </div>`;
}

// ─────────────────────────── 徽标 badge ───────────────────────────

interface BadgeStyle {
  bg: string;
  fg: string;
}
function badgeStyle(tone?: string): BadgeStyle {
  switch (tone) {
    case "accent":
      return { bg: "#f5f3ff", fg: "var(--oa-color-accent)" };
    case "neutral":
      return { bg: "var(--oa-color-surface)", fg: "var(--oa-color-text-secondary)" };
    case "positive":
      return { bg: "#f0fdf4", fg: "#16a34a" };
    case "negative":
      return { bg: "#fef2f2", fg: "#dc2626" };
    case "primary":
    default:
      return { bg: "var(--oa-color-primary-soft)", fg: "var(--oa-color-primary)" };
  }
}

export function badge(el: AnyElement): string {
  if (el.type !== "badge") return "";
  const p = el.props;
  const s = badgeStyle(p.tone);
  const icon = p.icon ? iconSvg(p.icon, 14, s.fg) : "";
  return `<div style="height:100%;display:flex;align-items:center;justify-content:center">
    <span data-oa-edit="text" style="display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:999px;font-size:var(--oa-fs-small);font-weight:600;background:${s.bg};color:${s.fg};white-space:nowrap">${icon}${rt(p.text)}</span>
  </div>`;
}

// ─────────────────────────── 分隔线 divider ───────────────────────────

export function divider(el: AnyElement): string {
  if (el.type !== "divider") return "";
  const p = el.props;
  const color =
    p.tone === "primary"
      ? "var(--oa-color-primary)"
      : p.tone === "accent"
        ? "var(--oa-color-accent)"
        : "var(--oa-color-border)";
  const style = p.variant === "dashed" ? "dashed" : p.variant === "dots" ? "dotted" : "solid";
  if (p.label) {
    return `<div style="height:100%;display:flex;align-items:center;gap:16px">
      <div style="flex:1;border-top:2px ${style} ${color}"></div>
      <span style="font-size:var(--oa-fs-small);color:var(--oa-color-text-secondary);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${rt(p.label)}</span>
      <div style="flex:1;border-top:2px ${style} ${color}"></div>
    </div>`;
  }
  return `<div style="height:100%;display:flex;align-items:center"><div style="width:100%;border-top:2px ${style} ${color}"></div></div>`;
}

// ─────────────────────────── 头像 avatar ───────────────────────────

export function avatar(el: AnyElement): string {
  if (el.type !== "avatar") return "";
  const p = el.props;
  const inner = p.src
    ? `<img src="${p.src}" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : p.icon
      ? iconSvg(p.icon, 40, "var(--oa-color-primary)")
      : `<span style="font-family:var(--oa-font-number);font-size:32px;font-weight:700;color:var(--oa-color-primary)">${initial(p.name)}</span>`;
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;text-align:center;box-sizing:border-box">
    <div style="width:92px;height:92px;border-radius:50%;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center;overflow:hidden;border:3px solid var(--oa-color-surface);box-shadow:var(--oa-shadow);box-sizing:border-box">${inner}</div>
    <div data-oa-edit="name" style="font-family:var(--oa-font-heading);font-weight:700;font-size:var(--oa-fs-body);color:var(--oa-color-text)">${rt(p.name)}</div>
    ${p.role ? `<div style="font-size:var(--oa-fs-small);color:var(--oa-color-text-secondary)">${rt(p.role)}</div>` : ""}
  </div>`;
}

// ─────────────────────────── 金字塔 ───────────────────────────

/** 整数千分位（漏斗数值格式化）。 */
function thousands(v: number): string {
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function pyramid(el: AnyElement): string {
  if (el.type !== "pyramid") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const up = p.orientation !== "down";
  const layers = p.layers ?? [];
  const n = layers.length || 1;
  const base = 0.3; // 顶端宽度占比（不全归零，留文字空间）
  const w = (k: number) => (up ? base + (1 - base) * (k / n) : 1 - (1 - base) * (k / n));
  const rows = layers
    .map((layer, i) => {
      const topW = w(i);
      const botW = w(i + 1);
      const lt = ((1 - topW) / 2) * 100;
      const rt2 = ((1 + topW) / 2) * 100;
      const lb = ((1 - botW) / 2) * 100;
      const rb = ((1 + botW) / 2) * 100;
      const minW = Math.min(topW, botW);
      const padX = ((1 - minW) / 2) * 100;
      const op = (0.5 + (0.5 * i) / (n - 1 || 1)).toFixed(2);
      return `<div style="position:relative;height:${(100 / n).toFixed(2)}%">
        <div style="position:absolute;inset:0;clip-path:polygon(${lt.toFixed(1)}% 0,${rt2.toFixed(1)}% 0,${rb.toFixed(1)}% 100%,${lb.toFixed(1)}% 100%);background:${c};opacity:${op}"></div>
        <div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:0 calc(${padX.toFixed(1)}% + 10px);text-align:center;box-sizing:border-box">
          <div style="font-family:var(--oa-font-heading);font-weight:700;color:#fff;font-size:15px;line-height:1.2;text-shadow:0 1px 2px rgba(0,0,0,.18)">${rt(layer.label)}</div>
          ${layer.desc ? `<div style="font-size:12px;color:rgba(255,255,255,.94);line-height:1.35;text-shadow:0 1px 2px rgba(0,0,0,.18)">${rt(layer.desc)}</div>` : ""}
        </div>
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:6px 4%;box-sizing:border-box">${rows}</div>`;
}

// ─────────────────────────── 漏斗 ───────────────────────────

export function funnel(el: AnyElement): string {
  if (el.type !== "funnel") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const stages = p.stages ?? [];
  const n = stages.length || 1;
  const vals = stages.map((s) => s.value);
  const hasV = vals.every((v) => typeof v === "number");
  const maxV = hasV ? Math.max(1, ...vals.filter((v): v is number => v > 0)) : 1;
  const segW = (i: number) =>
    hasV && typeof vals[i] === "number" ? Math.max(0.2, vals[i] / maxV) : 1 - (0.7 * i) / (n - 1 || 1);
  const topW = (i: number) => (i === 0 ? 1 : segW(i - 1));
  const rows = stages
    .map((st, i) => {
      const tw = topW(i);
      const bw = segW(i);
      const lt = ((1 - tw) / 2) * 100;
      const rt2 = ((1 + tw) / 2) * 100;
      const lb = ((1 - bw) / 2) * 100;
      const rb = ((1 + bw) / 2) * 100;
      const minW = Math.min(tw, bw);
      const padX = ((1 - minW) / 2) * 100;
      const op = (0.6 + (0.4 * i) / (n - 1 || 1)).toFixed(2);
      const valTxt = typeof st.value === "number" ? thousands(st.value) : "";
      const pctTxt = hasV && typeof st.value === "number" ? `${Math.round(((st.value / maxV) * 1000) / 10)}%` : "";
      return `<div style="position:relative;height:${(100 / n).toFixed(2)}%">
        <div style="position:absolute;inset:0;clip-path:polygon(${lt.toFixed(1)}% 0,${rt2.toFixed(1)}% 0,${rb.toFixed(1)}% 100%,${lb.toFixed(1)}% 100%);background:${c};opacity:${op}"></div>
        <div style="position:relative;height:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:0 calc(${padX.toFixed(1)}% + 12px);text-align:center;box-sizing:border-box">
          <span style="font-family:var(--oa-font-heading);font-weight:700;color:#fff;font-size:15px;text-shadow:0 1px 2px rgba(0,0,0,.18)">${rt(st.label)}</span>
          ${valTxt ? `<span style="font-family:var(--oa-font-number);font-weight:800;color:#fff;font-size:17px;text-shadow:0 1px 2px rgba(0,0,0,.18)">${rt(valTxt)}</span>` : ""}
          ${pctTxt ? `<span style="font-size:12px;font-weight:600;color:#fff;background:rgba(255,255,255,.24);padding:1px 9px;border-radius:999px;text-shadow:0 1px 2px rgba(0,0,0,.18)">${pctTxt}</span>` : ""}
        </div>
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:6px 8%;box-sizing:border-box">${rows}</div>`;
}

// ─────────────────────────── 数据高亮块 ───────────────────────────

export function statHighlight(el: AnyElement): string {
  if (el.type !== "stat-highlight") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const dColor =
    p.delta?.dir === "down" ? "#dc2626" : p.delta?.dir === "flat" ? "var(--oa-color-text-secondary)" : "#16a34a";
  const arrow = p.delta?.dir === "down" ? "↓" : p.delta?.dir === "flat" ? "→" : "↑";
  const icon = p.icon ? iconSvg(p.icon, 24, c) : "";
  const delta = p.delta
    ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:999px;font-size:var(--oa-fs-small);font-weight:700;color:#fff;background:${dColor};white-space:nowrap">${arrow}${p.delta.period ? ` <span style="opacity:.88;font-weight:600">${rt(p.delta.period)}</span>` : ""} ${rt(p.delta.text)}</span>`
    : "";
  return `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:12px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-left:6px solid ${c};border-radius:var(--oa-radius);padding:24px 30px;box-shadow:var(--oa-shadow);box-sizing:border-box;position:relative">
    ${icon ? `<div style="position:absolute;top:18px;right:20px;width:40px;height:40px;border-radius:10px;background:var(--oa-color-primary-soft);display:flex;align-items:center;justify-content:center">${icon}</div>` : ""}
    <div data-oa-edit="value" style="font-family:var(--oa-font-number);font-size:54px;font-weight:800;line-height:1;color:${c};letter-spacing:-.02em">${rt(p.value)}</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      ${delta}
      ${p.label ? `<span style="font-size:var(--oa-fs-body);color:var(--oa-color-text);font-weight:600">${rt(p.label)}</span>` : ""}
    </div>
    ${p.caption ? `<div style="font-size:var(--oa-fs-small);color:var(--oa-color-text-secondary);line-height:1.5">${rt(p.caption)}</div>` : ""}
  </div>`;
}

// ─────────────────────────── 组织架构 ───────────────────────────

export function orgChart(el: AnyElement): string {
  if (el.type !== "org-chart") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const line = "var(--oa-color-border)";
  interface Node {
    name: RichText;
    role?: RichText;
    icon?: string;
  }
  const card = (node: Node, w: number, variant: "root" | "branch" | "leaf"): string => {
    const fill = variant === "root";
    const ic = node.icon ? iconSvg(node.icon, variant === "leaf" ? 15 : 19, fill ? "#fff" : c) : "";
    const nameColor = fill ? "#fff" : variant === "leaf" ? "var(--oa-color-text)" : c;
    const roleColor = fill ? "rgba(255,255,255,.85)" : "var(--oa-color-text-secondary)";
    return `<div style="width:${w}px;background:${fill ? c : "var(--oa-color-surface)"};border:${fill ? "none" : "1px solid var(--oa-color-border)"};border-radius:10px;padding:${variant === "leaf" ? "7px 10px" : "9px 12px"};box-shadow:${fill ? "0 5px 16px rgba(47,84,235,.2)" : "var(--oa-shadow)"};box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center">
      ${ic ? `<div style="display:flex">${ic}</div>` : ""}
      <div style="font-family:var(--oa-font-heading);font-weight:700;font-size:${variant === "leaf" ? 13 : 15}px;color:${nameColor};line-height:1.2">${rt(node.name)}</div>
      ${node.role ? `<div style="font-size:${variant === "leaf" ? 11 : 12}px;color:${roleColor};line-height:1.2">${rt(node.role)}</div>` : ""}
    </div>`;
  };
  const vline = (h: number) => `<div style="width:2px;height:${h}px;background:${line};flex:none"></div>`;
  // 同级横排：多于 1 个时画横线连接各列中心（half = 列宽 / 2）
  const siblings = (cols: string[], half: number): string => {
    const hl =
      cols.length > 1
        ? `<div style="position:absolute;top:0;left:${half}px;right:${half}px;height:2px;background:${line}"></div>`
        : "";
    return `<div style="display:flex;gap:20px;position:relative">${hl}${cols.join("")}</div>`;
  };
  const branches = p.branches ?? [];
  const branchCols = branches.map((b) => {
    const kids = (b.children ?? []).length
      ? `${vline(14)}<div style="display:flex;flex-direction:column;align-items:center;gap:5px">${(b.children ?? [])
          .map(
            (ch) =>
              `<div style="width:150px;background:var(--oa-color-surface);border:1px solid var(--oa-color-border);border-left:3px solid ${c};border-radius:6px;padding:6px 10px;box-sizing:border-box;text-align:left"><div style="font-weight:600;font-size:13px;color:var(--oa-color-text);line-height:1.2">${rt(ch.name)}</div>${ch.role ? `<div style="font-size:11px;color:var(--oa-color-text-secondary);line-height:1.2;margin-top:1px">${rt(ch.role)}</div>` : ""}</div>`,
          )
          .join("")}</div>`
      : "";
    return `<div style="display:flex;flex-direction:column;align-items:center;width:168px">${vline(18)}${card(b.node, 168, "branch")}${kids}</div>`;
  });
  const branchesBlock = branchCols.length ? `${vline(18)}${siblings(branchCols, 84)}` : "";
  return `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;box-sizing:border-box">
    ${card(p.root, 200, "root")}
    ${branchesBlock}
  </div>`;
}

// ─────────────────────────── 甘特图 ───────────────────────────

export function gantt(el: AnyElement): string {
  if (el.type !== "gantt") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const tasks = p.tasks ?? [];
  const tl = p.timeline;
  const maxEnd = tasks.length ? Math.max(...tasks.map((t) => t.end)) : 1;
  const labels = tl?.length ? tl : Array.from({ length: Math.max(1, Math.ceil(maxEnd)) }, (_, i) => String(i + 1));
  const span = Math.max(labels.length, maxEnd, 1);
  const axis = labels
    .map((lb, i) => {
      const left = (i / labels.length) * 100;
      return `<div style="position:absolute;left:${left.toFixed(2)}%;top:0;bottom:0;border-left:1px dashed var(--oa-color-border)"></div><div style="position:absolute;left:${left.toFixed(2)}%;top:0;transform:translateX(4px);font-size:12px;color:var(--oa-color-text-secondary);font-weight:600">${rt(lb)}</div>`;
    })
    .join("");
  const rows = tasks
    .map((t) => {
      const tc = t.tone === "accent" ? "var(--oa-color-accent)" : c;
      const left = (t.start / span) * 100;
      const width = Math.max(1.5, ((t.end - t.start) / span) * 100);
      const prog = typeof t.progress === "number" ? Math.max(0, Math.min(100, t.progress)) : null;
      const fillW = prog !== null ? (width * prog) / 100 : width;
      return `<div style="display:flex;align-items:center;gap:12px;height:30px">
        <div style="flex:none;width:120px;font-size:13px;color:var(--oa-color-text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right">${rt(t.name)}</div>
        <div style="flex:1;position:relative;height:100%">
          <div style="position:absolute;left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;top:50%;transform:translateY(-50%);height:18px;background:${tc};opacity:.2;border-radius:6px"></div>
          <div style="position:absolute;left:${left.toFixed(2)}%;width:${fillW.toFixed(2)}%;top:50%;transform:translateY(-50%);height:18px;background:${tc};border-radius:6px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:11px;font-weight:700;overflow:hidden;white-space:nowrap">${prog !== null ? prog + "%" : ""}</div>
        </div>
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;flex-direction:column;gap:8px;padding:8px 12px;box-sizing:border-box">
    <div style="position:relative;height:20px;margin-left:132px">${axis}</div>
    <div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
  </div>`;
}

// ─────────────────────────── 思维导图 ───────────────────────────

export function mindmap(el: AnyElement): string {
  if (el.type !== "mindmap") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const branches = p.branches ?? [];
  const branchRows = branches
    .map((b) => {
      const bc = b.tone === "accent" ? "var(--oa-color-accent)" : c;
      const items = (b.items ?? [])
        .map(
          (it) =>
            `<span style="font-size:13px;color:var(--oa-color-text-secondary);line-height:1.4">· ${rt(it)}</span>`,
        )
        .join(" ");
      return `<div style="display:flex;align-items:center;gap:10px;min-width:0">
        <div style="flex:none;width:22px;height:2px;background:${bc}"></div>
        <div style="flex:none;display:inline-flex;align-items:center;padding:6px 14px;border-radius:999px;background:var(--oa-color-primary-soft);color:${bc};font-family:var(--oa-font-heading);font-weight:700;font-size:15px;white-space:nowrap">${rt(b.label)}</div>
        <div style="flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center">${items}</div>
      </div>`;
    })
    .join("");
  return `<div style="height:100%;display:flex;align-items:center;gap:20px;padding:8px 12px;box-sizing:border-box">
    <div style="flex:none;display:flex;align-items:center;justify-content:center;padding:16px 20px;border-radius:16px;background:${c};color:#fff;font-family:var(--oa-font-heading);font-weight:800;font-size:18px;text-align:center;box-shadow:0 6px 18px rgba(47,84,235,.22);max-width:200px;line-height:1.25">${rt(p.center)}</div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:16px;border-left:2px solid var(--oa-color-border);padding-left:20px">
      ${branchRows}
    </div>
  </div>`;
}

// ─────────────────────────── AI 动效卡 ───────────────────────────

export function aiCard(el: AnyElement): string {
  if (el.type !== "ai-card") return "";
  const p = el.props;
  const c = toneColor(p.tone);
  const effect = p.effect ?? "fade-in-up";
  const ic = p.icon ? iconSvg(p.icon, 28, c) : iconSvg("sparkles", 28, c);
  const animMap: Record<string, string> = {
    "fade-in-up": "oa-aicard-up .6s ease-out both",
    "zoom-in": "oa-aicard-zoom .55s cubic-bezier(.2,.8,.2,1) both",
    "slide-in-left": "oa-aicard-slide .55s ease-out both",
    "glow-pulse": "oa-aicard-glow 2.6s ease-in-out infinite",
  };
  const animation = animMap[effect];
  const style = `<style>@keyframes oa-aicard-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}@keyframes oa-aicard-zoom{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}@keyframes oa-aicard-slide{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}}@keyframes oa-aicard-glow{0%,100%{box-shadow:0 0 0 0 var(--oa-color-primary-soft)}50%{box-shadow:0 0 22px 4px var(--oa-color-primary-soft)}}</style>`;
  return `${style}<div style="height:100%;display:flex;flex-direction:column;gap:14px;background:linear-gradient(135deg,var(--oa-color-surface),var(--oa-color-primary-soft));border:1px solid var(--oa-color-border);border-radius:var(--oa-radius);padding:24px;box-sizing:border-box;position:relative;overflow:hidden;animation:${animation}">
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:${c};opacity:.08"></div>
    <div style="display:flex;align-items:center;gap:12px;position:relative">
      <div style="width:48px;height:48px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:var(--oa-shadow)">${ic}</div>
      ${p.badge ? `<span style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${c};color:#fff;font-size:12px;font-weight:700;letter-spacing:.05em;white-space:nowrap">${iconSvg("sparkles", 12, "#fff")}${rt(p.badge)}</span>` : ""}
    </div>
    <div data-oa-edit="title" style="font-family:var(--oa-font-heading);font-size:var(--oa-fs-h3);font-weight:800;color:${c};line-height:1.25;position:relative">${rt(p.title)}</div>
    ${p.desc ? `<div data-oa-edit="desc" style="font-size:15px;line-height:1.7;color:var(--oa-color-text-secondary);position:relative">${rt(p.desc)}</div>` : ""}
  </div>`;
}
