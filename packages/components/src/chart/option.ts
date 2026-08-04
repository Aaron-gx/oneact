/**
 * @oneact/components/chart — 图表语义层 → ECharts option（v0.2 引擎接入）
 *
 * 把 AI 写的「类型 + data」语义翻译成 ECharts option。
 * 三赢之一：pptx 导出可映射原生图表（option 结构化）。
 */
import type { ChartProps, Theme } from "@oneact/schema";

export function chartOption(props: ChartProps, theme: Theme): Record<string, unknown> {
  const opt: Record<string, unknown> = {};
  if (props.title)
    opt.title = { text: props.title, left: "center", top: 6, textStyle: { fontSize: 16, fontWeight: 600 } };

  if (props.chartType === "radar") {
    const cats = props.data.categories;
    const allVals = props.data.series.flatMap((s) => s.values);
    const maxV = allVals.length ? Math.max(1, ...allVals.filter((v) => v > 0)) : 1;
    opt.radar = { indicator: cats.map((c) => ({ name: c, max: maxV })), shape: "polygon", splitNumber: 5 };
    opt.series = props.data.series.map((s) => ({
      type: "radar",
      name: s.name,
      data: [{ value: s.values, name: s.name }],
      areaStyle: { opacity: 0.18 },
    }));
    if (props.showLegend) opt.legend = { bottom: 4 };
    opt.color = theme.chart;
    opt.tooltip = { trigger: "item" };
    return opt;
  }

  if (props.chartType === "pie" || props.chartType === "doughnut") {
    const cats = props.data.categories;
    const first = props.data.series[0];
    opt.series = [
      {
        type: "pie",
        radius: props.chartType === "doughnut" ? ["42%", "72%"] : "72%",
        label: { show: props.showLabels !== false },
        data: cats.map((c, i) => ({ name: c, value: first?.values[i] ?? 0 })),
      },
    ];
    if (props.showLegend) opt.legend = { bottom: 4 };
  } else {
    const series = props.data.series.map((s, i) => {
      const col = s.color ?? theme.chart[i % theme.chart.length];
      const o: Record<string, unknown> = {
        name: s.name,
        type: props.chartType === "area" ? "line" : props.chartType,
        data: s.values,
        smooth: props.smooth,
        itemStyle: { color: col },
        lineStyle: { color: col },
      };
      if (props.chartType === "area") o.areaStyle = { color: col, opacity: 0.15 };
      if (props.stacked) o.stack = "total";
      return o;
    });
    if (props.horizontal) {
      opt.xAxis = { type: "value" };
      opt.yAxis = { type: "category", data: props.data.categories };
    } else {
      opt.xAxis = { type: "category", data: props.data.categories };
      opt.yAxis = { type: "value" };
    }
    opt.series = series;
    if (props.showLegend && props.data.series.length > 1) opt.legend = { bottom: 4 };
  }
  opt.color = theme.chart;
  opt.tooltip = { trigger: props.chartType === "pie" || props.chartType === "doughnut" ? "item" : "axis" };
  return opt;
}
