/**
 * @oneact/components/chart — 图表引擎抽象（策划书 4.9 / 第10节：允许插件替换引擎）
 * v0.1 默认手绘 SVG（零依赖）；v0.2 可切 ECharts（语义层翻译为 option，运行时 init）。
 */
import type { ChartProps, Theme } from "@oneact/schema";
import { renderChartECharts } from "./echarts.js";
import { renderChart } from "./svg.js";

export type ChartEngine = "svg" | "echarts";

let _engine: ChartEngine = "svg";

export function setChartEngine(e: ChartEngine): void {
  _engine = e;
}
export function getChartEngine(): ChartEngine {
  return _engine;
}

/** 按当前引擎渲染图表（返回 HTML 字符串）。 */
export function renderChartByEngine(props: ChartProps, theme: Theme): string {
  return _engine === "echarts" ? renderChartECharts(props, theme) : renderChart(props, theme);
}
