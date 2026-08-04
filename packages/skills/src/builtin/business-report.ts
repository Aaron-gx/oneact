import type { Skill } from "../types.js";

/** 工作汇报（季度/年度）— 结论先行、数据支撑、目标对齐。 */
export const businessReport: Skill = {
  id: "business-report",
  name: "工作汇报",
  description: "季度/年度工作汇报，结论先行 + KPI 仪表盘 + 进展/问题/计划",
  dimension: "structure",
  version: "0.1.0",
  builtin: true,
  triggers: ["汇报", "总结", "复盘", "季度", "年度", "OKR", "述职", "周报", "月报"],
  pageCount: 10,
  structure: [
    { layout: "cover", title: "汇报主题 · 周期", hint: "如「Q3 产品工作汇报」" },
    { layout: "toc", title: "目录" },
    { layout: "section-divider", title: "整体概览", hint: "一句话结论先行" },
    { layout: "dashboard", title: "核心 KPI 概览", hint: "3 个关键指标 + 趋势图" },
    { layout: "timeline", title: "重点进展", hint: "按时间线列关键里程碑" },
    { layout: "comparison", title: "目标 vs 实际", hint: "达成情况对比" },
    { layout: "content", title: "问题与挑战", hint: "坦诚列出 + 原因分析" },
    { layout: "process", title: "下阶段计划", hint: "N 步法，明确负责人 / 时间" },
    { layout: "data", title: "关键数据", hint: "支撑结论的明细数据" },
    { layout: "closing", title: "总结 · 资源诉求", hint: "结论 + 需要的支持" },
  ],
  styleNotes:
    "汇报重数据与结论：每页标题即结论（如「营收同比增长 18%」而非「营收分析」）；KPI 页突出同比 / 环比；问题页不回避，配改进措施；计划页要可执行（负责人 + deadline）。",
};
