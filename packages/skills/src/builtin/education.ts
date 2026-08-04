import type { Skill } from "../types.js";

/** 教育教学 — 课件结构化、知识点分层、例题与记忆口诀、互动设问。 */
export const education: Skill = {
  id: "education",
  name: "教育教学",
  description: "课堂教学/培训课件，知识点结构化 + 例题 + 记忆口诀 + 互动设问",
  dimension: "domain",
  version: "0.1.0",
  builtin: true,
  triggers: ["教学", "课件", "课程", "培训", "讲座", "公开课", "教案", "知识点", "课堂", "lecture", "微课"],
  directives:
    "【教育教学规范】1) 结构：封面(课程名+讲师)→学习目标(3-5条)→知识脉络(用 mindmap 画章节导图)→逐个知识点讲解(定义→要点→例题)→小结→练习/思考题→拓展资源；每页聚焦一个知识点，标题即知识点名。" +
    "2) 认知负荷：单页信息量克制，多用 feature-list/process 分步讲解；公式用 formula 组件；抽象概念配类比与图示(icon/shape)。" +
    "3) 记忆辅助：关键结论提炼成口诀/要点(bullet-list 显式大字号)，重点用 callout(tip) 高亮，易混点用 comparison 对比。" +
    "4) 互动：适当穿插设问页（标题用问句、正文留白引导思考），例题用 process 逐步展示解题过程。" +
    "5) 配色：明快但不花哨，主色用于知识点标题与重点；避免大面积高饱和色影响长时间观看，背景保持清爽留白。",
};
