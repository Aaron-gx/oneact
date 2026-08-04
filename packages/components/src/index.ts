/**
 * @oneact/components — 一幕 OneAct 内置组件库
 *
 * import 本包即自动注册全部内置组件（P0/P1/P2）到 core 的组件注册表。
 *   P0：heading / paragraph / bullet-list / image / chart（手绘 SVG）
 *   P1：table / shape / icon
 *   P2：custom-html / custom-svg（逃逸块，安全沙箱）
 */
import { registerComponents } from "@oneact/core";
import { chart } from "./chart/index.js";
import {
  kpi,
  statGrid,
  featureCard,
  featureList,
  timeline,
  process,
  comparison,
  sectionTitle,
  callout,
  badge,
  divider,
  avatar,
  pyramid,
  funnel,
  statHighlight,
  orgChart,
  gantt,
  mindmap,
  aiCard,
} from "./composite.js";
import { customHtml, customSvg } from "./custom.js";
import { formula, KATEX_CSS } from "./formula.js";
import { icon, ICON_NAMES, iconSvg } from "./icon.js";
import { image } from "./image.js";
import { video, audio } from "./media.js";
import { sanitizeHtml, sanitizeSvg, escapeAttr } from "./sanitize.js";
import { shape } from "./shape.js";
import { table } from "./table.js";
import { heading, paragraph, bulletList, renderRuns } from "./text.js";

let registered = false;

/** 注册全部内置组件（幂等）。 */
export function registerBuiltinComponents(): void {
  if (registered) return;
  registerComponents({
    heading,
    paragraph,
    "bullet-list": bulletList,
    image,
    chart,
    table,
    shape,
    icon,
    "custom-html": customHtml,
    "custom-svg": customSvg,
    formula,
    video,
    audio,
    // 复合语义组件（WS1）
    kpi,
    "stat-grid": statGrid,
    "feature-card": featureCard,
    "feature-list": featureList,
    timeline,
    process,
    comparison,
    "section-title": sectionTitle,
    callout,
    badge,
    divider,
    avatar,
    pyramid,
    funnel,
    "stat-highlight": statHighlight,
    "org-chart": orgChart,
    gantt,
    mindmap,
    "ai-card": aiCard,
  });
  registered = true;
}

// 导入即注册（player / 编辑器 import 本包即生效）。
registerBuiltinComponents();

export { renderRuns, ICON_NAMES, iconSvg, sanitizeHtml, sanitizeSvg, escapeAttr, KATEX_CSS };
export {
  renderChart,
  chartOption,
  setChartEngine,
  getChartEngine,
  initEChartsWidgets,
  type ChartEngine,
} from "./chart/index.js";
