import type { Skill } from "../types.js";

/** 科技发布会风 — 深色大屏、霓虹强调、数据可视化、未来感。 */
export const techKeynote: Skill = {
  id: "tech-keynote",
  name: "科技发布会风",
  description: "深色大屏 + 霓虹强调 + 数据可视化，AI/科技/未来感主题",
  dimension: "style",
  version: "0.1.0",
  builtin: true,
  triggers: ["科技", "AI", "大模型", "未来", "极客", "开发者", "技术发布"],
  preferredMood: "tech",
  preferredTheme: "tech-noir",
  styleNotes:
    "科技深色风：深底（#0b1020 系）+ 霓虹主色（青 / 紫）+ 几何线条 / 网格 / 光效装饰；数据多用大数字 + 图表 + 代码片段点缀；" +
    "文字用浅色（白 / 浅灰）确保深底可读；可用 custom-html 炫技页（粒子 / 动效）增强未来感；" +
    "封面 / 结尾用渐变 + 装饰 shape 营造氛围；整体冷峻、精密、高级。",
};
