import type { Skill } from "../types.js";

/** 咨询专业风（麦肯锡式）— 金字塔原理、MECE、数据驱动、so-what 行动导向。 */
export const consultingPro: Skill = {
  id: "consulting-pro",
  name: "咨询专业风",
  description: "麦肯锡式：金字塔原理 + MECE + 数据驱动 + 行动导向，蓝灰克制",
  dimension: "style",
  version: "0.1.0",
  builtin: true,
  triggers: ["咨询", "麦肯锡", "战略", "分析", "洞察", "管理咨询", "BCG", "贝恩"],
  preferredMood: "ocean",
  preferredTheme: "ocean",
  styleNotes:
    "咨询专业风：金字塔原理——结论先行，每页标题即核心论点（action title，如「市场份额下滑源于 X」而非「市场分析」）；" +
    "MECE 分类（相互独立、完全穷尽），用 2×2 矩阵 / 三列框架；数据驱动，每个论断配数据支撑；" +
    "配色克制（深海蓝主色 + 中性灰，忌鲜艳）；图表规范（bar/line 为主，标注数据来源）；每页结尾给「so what」（意味着什么 / 下一步行动）。",
};
