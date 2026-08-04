/**
 * @oneact/components/chart — ECharts 引擎（v0.2）
 *
 * 输出 <div data-option> 占位；真正 echarts.init 由运行时（player/editor）在
 * 加载 echarts 库后遍历 .oa-echarts 完成。option 来自语义层（chartOption）。
 */
import type { ChartProps, Theme } from "@oneact/schema";
import { escapeAttr } from "../sanitize.js";
import { chartOption } from "./option.js";

export function renderChartECharts(props: ChartProps, theme: Theme): string {
  const option = chartOption(props, theme);
  const aria = props.summary ?? props.title ?? "图表";
  return `<div class="oa-echarts" role="img" aria-label="${escapeAttr(aria)}" data-option="${escapeAttr(JSON.stringify(option))}" style="width:100%;height:100%"></div>`;
}

/**
 * 运行时初始化助手（浏览器）：遍历容器内 .oa-echarts，用 window.echarts 渲染。
 * 需页面已加载 echarts（CDN 或 npm）。未加载则静默跳过（降级为空占位）。
 */
export function initEChartsWidgets(root: HTMLElement): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ec = (globalThis as { echarts?: any }).echarts;
  if (!ec) return;
  root.querySelectorAll<HTMLElement>(".oa-echarts").forEach((el) => {
    if (el.dataset.__ecDone === "1") return;
    try {
      const option = JSON.parse(el.dataset.option || "{}");
      const chart = ec.init(el);
      chart.setOption(option);
      el.dataset.__ecDone = "1";
    } catch {
      /* 单图初始化失败不影响其他 */
    }
  });
}
