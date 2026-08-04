import type { Skill } from "../types.js";

/** 杂志编辑风 — 大标题排版、引文、分栏、编号栏目，故事感与高级感。 */
export const magazine: Skill = {
  id: "magazine",
  name: "杂志编辑风",
  description: "杂志/编辑设计风，大标题排版 + 引文 + 分栏 + 编号栏目，故事感强",
  dimension: "style",
  version: "0.1.0",
  builtin: true,
  triggers: ["杂志", "编辑", "刊物", "专栏", "叙事", "报道", "品牌故事", "editorial", "magazine", "storytelling"],
  preferredMood: "elegant",
  preferredTheme: "crimson-gold",
  styleNotes:
    "杂志编辑风：像翻一本精装刊物——大号标题占据视觉主导，配大留白；" +
    "多用分栏(two-column)、引文(quote 页/大引号)、编号栏目(section-title 带「NO.01」眉标)；" +
    "图文混排，图片可大尺寸出血(big-image)；正文首段首词加粗放大形成 dropcap 感；" +
    "配色克制高级(黑/白/米/单一主色)，强对比排版；每页像一个跨页，有「卷首语」「专题」「专栏」的栏目感；" +
    "节奏：封面=杂志封面(刊名+期号+主图)，内页交替专题与短栏，结尾=版权页/编者按。",
};
