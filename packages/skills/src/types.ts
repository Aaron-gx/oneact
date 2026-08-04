/**
 * @oneact/skills — 类型定义
 *
 * Skill = 场景化生成知识包，分三个正交维度：
 *   · structure — 结构骨架（sections / 页数 / 叙事流）
 *   · style     — 视觉风格（mood / theme / 装饰节奏）
 *   · domain    — 行业知识（术语 / 合规 / 配色禁忌 / 数据惯例）
 * 用户每维单选一个，composeSkills 叠加成 ComposedSkill，注入 buildSpec 的 system prompt。
 *
 * 仅依赖 @oneact/schema，不依赖 @oneact/ai（防环）。SkillSection 与 @oneact/ai 的 BriefSection
 * 结构对齐（{layout,title?,hint?}），applySkill 可直接结构化赋值。
 */

/** skill 作用的正交维度（每维至多选一个，叠加组合）。 */
export type SkillDimension = "structure" | "style" | "domain";

/**
 * 骨架章节（与 @oneact/ai 的 BriefSection 同构）。
 * 刻意复制而非 import，避免 skills→ai 依赖环；加字段时两边同步。
 */
export interface SkillSection {
  layout: string;
  title?: string;
  hint?: string;
}

/** 单个 skill（场景化生成知识包）。纯 JSON 可序列化（供 MCP / localStorage 持久化）。 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  dimension: SkillDimension;
  version?: string;
  author?: string;
  /** 内置 skill 标记（区别于用户导入）。 */
  builtin?: boolean;
  /** topic 关键词，用于自动建议（阶段2）。MVP 仅作 UI 展示。 */
  triggers?: string[];

  // —— structure 维度 ——
  /** 场景化骨架（用户未自定义时覆盖 Brief.sections）。 */
  structure?: SkillSection[];
  /** 建议页数（用户未显式选 length 时生效）。 */
  pageCount?: number;

  // —— style 维度 ——
  /** 偏好情绪（宽松 string，运行时 moodTheme 回退；值应取自 @oneact/schema 的 Mood 联合）。 */
  preferredMood?: string;
  /** 偏好主题名（直配 brief.theme，如 "mono-slate"）。 */
  preferredTheme?: string;
  /** 视觉 / 结构节奏指引。 */
  styleNotes?: string;

  // —— 任意维度（主要 domain）——
  /** 专业指令块（行业术语 / 合规 / 配色禁忌 / 数据惯例），拼入 buildSpec。 */
  directives?: string;

  // —— 阶段2：few-shot 范例（MVP 保留类型，compose 永远输出空）——
  examples?: { layout: string; snippet: object }[];
}

/** composeSkills 的输出：多维度叠加后的「有效 skill」。纯 JSON 可序列化。 */
export interface ComposedSkill {
  /** 叠加的 skill 展示名（如 ["商业路演BP","Apple极简","金融"]）。 */
  sourceNames: string[];
  structure?: SkillSection[];
  pageCount?: number;
  preferredMood?: string;
  preferredTheme?: string;
  /** 各维度 styleNotes 按「【来自 xxx 维度】」分块拼接。 */
  styleNotes?: string;
  /** 各维度 directives 按维度标签分块拼接。 */
  directives?: string;
  /** few-shot 范例（聚合所有 skill 的 examples，注入 buildSpec 作参考）。 */
  examples?: { layout: string; snippet: object }[];
}
