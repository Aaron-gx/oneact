import type { Skill } from "../types.js";

/** 商业路演 BP（融资路演）— 痛点驱动叙事，约 12 页，含融资 ASK。 */
export const startupPitch: Skill = {
  id: "startup-pitch",
  name: "商业路演 BP",
  description: "种子轮/天使轮融资路演，痛点→方案→市场→模式→团队→融资 ASK 叙事",
  dimension: "structure",
  version: "0.1.0",
  builtin: true,
  triggers: ["路演", "BP", "融资", "种子轮", "天使轮", "创投", "pitch", "商业计划"],
  pageCount: 12,
  structure: [
    { layout: "cover", title: "项目名 · 一句话价值主张", hint: "大标题 + 副标（所在赛道）" },
    { layout: "section-divider", title: "痛点与机会", hint: "切入要解决的问题" },
    { layout: "comparison", title: "现状之痛", hint: "传统方案 vs 理想状态，左红右绿" },
    { layout: "hero", title: "我们的解决方案", hint: "一句话讲清产品，配大图/示意" },
    { layout: "process", title: "产品 / 技术架构", hint: "三步法或核心流程" },
    { layout: "stats-grid", title: "市场规模", hint: "TAM / SAM / SOM 三个大数字" },
    { layout: "feature-list", title: "商业模式", hint: "如何赚钱：收费方式 / 客单 / 复购" },
    { layout: "dashboard", title: "核心数据与增长", hint: "关键指标 + 增长曲线" },
    { layout: "team", title: "核心团队", hint: "3 位核心成员 + 背景亮点" },
    { layout: "data", title: "融资计划", hint: "本轮额度、估值、资金用途、里程碑" },
    { layout: "closing", title: "Join Us", hint: "ASK：融资额 + 联系方式" },
  ],
  styleNotes:
    "路演叙事要有张力：每页一个核心论点，标题即结论；数据页用大数字 + 趋势强调增长；痛点页用对比制造冲突；融资页信息要全（金额 / 估值 / 用途 / 里程碑）。",
};
