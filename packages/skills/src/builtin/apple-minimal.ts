import type { Skill } from "../types.js";

/** Apple 极简风 — 大留白、字号阶梯、每页一论点、克制装饰。 */
export const appleMinimal: Skill = {
  id: "apple-minimal",
  name: "Apple 极简风",
  description: "大留白 + 字号阶梯分明 + 每页只讲一件事，Keynote 发布会式克制",
  dimension: "style",
  version: "0.1.0",
  builtin: true,
  triggers: ["苹果", "极简", "Apple", "Keynote", "发布会", "简约", "minimal"],
  preferredMood: "minimal",
  preferredTheme: "mono-slate",
  styleNotes:
    "Apple 极简：大量留白（四周留白 ≥80px），字号阶梯极分明（主标题 level:1 巨大、正文小而克制）；" +
    "每页只讲一件事，宁可空不要挤；装饰极克制——去多余 shape，仅用一根细线 / 一个小色块点睛；" +
    "强对比（深字白底或反之）；渐变仅用于封面 / 结尾且克制；配色单一主色 + 中性灰，忌花哨多色；" +
    "关键数据用超大字号居中铺满，配一句精炼注解。",
};
