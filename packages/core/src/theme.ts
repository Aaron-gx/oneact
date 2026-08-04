/**
 * @oneact/core — 主题引擎
 *
 * Theme tokens → CSS 变量（注入到 .oa-deck scope）。
 * 组件用 var(--oa-...) 取色，换肤自动生效，颜色永不硬编码。
 */
import type { Theme } from "@oneact/schema";

/** 把主题 token 转为 CSS 变量声明串（无外层括号）。 */
export function themeToCssVars(theme: Theme): string {
  const c = theme.colors;
  const f = theme.fonts;
  const fs = theme.fontSizes;
  return [
    `--oa-color-primary:${c.primary}`,
    `--oa-color-accent:${c.accent}`,
    `--oa-color-text:${c.text}`,
    `--oa-color-text-secondary:${c["text-secondary"]}`,
    `--oa-color-bg:${c.bg}`,
    `--oa-color-surface:${c.surface}`,
    `--oa-color-border:${c.border}`,
    `--oa-color-primary-soft:${c["primary-soft"]}`,
    `--oa-font-heading:${f.heading}`,
    `--oa-font-body:${f.body}`,
    `--oa-font-number:${f.number}`,
    `--oa-fs-h1:${fs.h1}px`,
    `--oa-fs-h2:${fs.h2}px`,
    `--oa-fs-h3:${fs.h3}px`,
    `--oa-fs-body:${fs.body}px`,
    `--oa-fs-small:${fs.small}px`,
    `--oa-fs-caption:${fs.caption}px`,
    `--oa-radius:${theme.radius}px`,
    `--oa-shadow:${theme.shadow}`,
    `--oa-spacing:${theme.spacing}px`,
    `--oa-chart:${theme.chart.map((s) => `'${s}'`).join(",")}`,
  ].join(";");
}

/** 语义色 → CSS 变量。 */
export function toneVar(tone?: string): string {
  switch (tone) {
    case "primary":
      return "var(--oa-color-primary)";
    case "accent":
      return "var(--oa-color-accent)";
    case "text-secondary":
      return "var(--oa-color-text-secondary)";
    case "text":
    default:
      return "var(--oa-color-text)";
  }
}

/** 取图表系列色（按 index 循环）。 */
export function chartColor(theme: Theme, i: number): string {
  return theme.chart[i % theme.chart.length];
}

/** 把 CSS 变量字符串里的 chart 列表解析回数组（渲染器用）。 */
export function cssChartList(): string {
  return "var(--oa-chart)";
}
