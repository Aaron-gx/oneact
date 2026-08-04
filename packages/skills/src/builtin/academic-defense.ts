import type { Skill } from "../types.js";

/** 学术答辩（毕业论文 / 课题答辩）— 严谨信息密度、方法/结果规范、致谢。 */
export const academicDefense: Skill = {
  id: "academic-defense",
  name: "学术答辩",
  description: "毕业论文/课题答辩，研究背景→方法→结果→讨论→结论，严谨规范",
  dimension: "structure",
  version: "0.1.0",
  builtin: true,
  triggers: ["答辩", "毕业", "论文", "课题", "开题", "中期", "科研", "学术"],
  pageCount: 12,
  structure: [
    { layout: "cover", title: "论文标题 · 作者 · 导师", hint: "含学校 / 学院" },
    { layout: "toc", title: "目录" },
    { layout: "section-divider", title: "研究背景", hint: "问题来源与意义" },
    { layout: "content", title: "文献综述", hint: "研究现状 + 研究空白" },
    { layout: "content", title: "研究问题与假设", hint: "明确 RQ / 假设" },
    { layout: "process", title: "研究方法", hint: "方法 / 数据 / 实验设计" },
    { layout: "dashboard", title: "实验结果", hint: "关键数据 + 图表" },
    { layout: "comparison", title: "讨论", hint: "结果 vs 预期，与已有研究对比" },
    { layout: "content", title: "结论与展望", hint: "贡献 + 局限 + 未来工作" },
    { layout: "closing", title: "致谢 · 答辩", hint: "感谢导师 / 评委 / 同窗" },
  ],
  styleNotes:
    "学术答辩重严谨：信息密度适中（每页可承载较多内容但需有条理）；图表 / 公式规范（坐标轴单位、图例、公式编号）；" +
    "配色克制（墨绿 / 深蓝），忌花哨；方法与结果分页清晰；讨论页突出「你的发现 vs 已有研究」；结论页明列贡献与局限。",
};
