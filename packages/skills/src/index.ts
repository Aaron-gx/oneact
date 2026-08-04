/**
 * @oneact/skills — 一幕 OneAct 场景化生成知识包
 *
 * 三正交维度（structure 结构 / style 视觉 / domain 行业），用户每维单选一个，
 * composeSkills 叠加成 ComposedSkill，注入 @oneact/ai 的 buildSpec system prompt。
 * 仅依赖 @oneact/schema（防环）；不依赖 @oneact/ai。
 */
export * from "./types.js";
export * from "./compose.js";
export * from "./builtin.js";
export * from "./frontmatter.js";
