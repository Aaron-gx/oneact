import type { Skill } from "../types.js";

/** 年度路线图 — 按季度/阶段展开里程碑与交付物，重时间感与节奏。 */
export const roadmap: Skill = {
  id: "roadmap",
  name: "年度路线图",
  description: "产品/项目年度路线图，按季度阶段展开里程碑、交付物与负责人",
  dimension: "structure",
  version: "0.1.0",
  builtin: true,
  triggers: ["路线图", "roadmap", "规划", "里程碑", "年度计划", "季度规划", "产品规划", "项目排期", "迭代规划"],
  pageCount: 8,
  structure: [
    { layout: "cover", title: "年度路线图 · 周期", hint: "如「2026 产品年度路线图」" },
    { layout: "toc", title: "目录" },
    { layout: "section-divider", title: "战略主题", hint: "一句话点出全年主线" },
    { layout: "timeline", title: "全年里程碑总览", hint: "Q1-Q4 关键节点时间线" },
    { layout: "process", title: "Q1 季度计划", hint: "目标 + 交付物 + 负责人" },
    { layout: "process", title: "Q2 季度计划", hint: "目标 + 交付物" },
    { layout: "comparison", title: "Q3-Q4 重点", hint: "下半年两大攻坚方向" },
    { layout: "closing", title: "风险与依赖 · 下一步", hint: "关键风险 + 所需资源" },
  ],
  styleNotes:
    "路线图重时间感与节奏：总览页用 timeline 横向铺满全年(Q1→Q4)，季度页用 process 分步列交付物；" +
    "排期页用 gantt 甘特图直观展示任务条与进度(progress%)；里程碑节点突出日期与交付物名称(加粗/主色)；" +
    "用 pyramid 表达「愿景→目标→举措」分层；颜色按阶段或主题区分，避免堆砌细节，每页聚焦一个阶段的 3-5 个关键交付。",
};
