/**
 * @oneact/components/chart — 图表组件（语义层入口，引擎可切换）
 */
import type { RenderContext } from "@oneact/core";
import type { AnyElement } from "@oneact/schema";
import { renderChartByEngine } from "./engines.js";

export function chart(el: AnyElement, ctx: RenderContext): string {
  if (el.type !== "chart") return "";
  return renderChartByEngine(el.props, ctx.theme);
}

export { renderChart } from "./svg.js";
export { chartOption } from "./option.js";
export { renderChartByEngine, setChartEngine, getChartEngine, type ChartEngine } from "./engines.js";
export { renderChartECharts, initEChartsWidgets } from "./echarts.js";
