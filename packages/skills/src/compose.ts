/**
 * @oneact/skills — 叠加合成
 *
 * composeSkills 把用户选中的若干 skill（每维至多一个）叠加成 ComposedSkill。
 * 纯收集 + 按维度标签拼接，**不做任何「用户 vs skill」决策**——仲裁集中在
 * @oneact/ai 的 applySkill（那里同时看得到用户输入）。
 */
import type { ComposedSkill, Skill, SkillDimension } from "./types.js";

/** 稳定输出顺序（影响 sourceNames 与拼接段顺序）。 */
const DIM_ORDER: SkillDimension[] = ["structure", "style", "domain"];
const DIM_LABEL: Record<SkillDimension, string> = {
  structure: "结构",
  style: "视觉风格",
  domain: "行业",
};

/** 把一段文本包上维度标签（空文本返回 undefined）。 */
function labeled(dim: SkillDimension, text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  return `【来自${DIM_LABEL[dim]}维度】${text.trim()}`;
}

/**
 * 叠加 skills。同维度出现 2 个时后者覆盖前者并 console.warn（UI 单选保证不发生，此为兜底）。
 * directives / styleNotes 按维度标签分块、按 structure→style→domain 顺序拼接。
 */
export function composeSkills(skills: Skill[]): ComposedSkill {
  const byDim = new Map<SkillDimension, Skill>();
  for (const s of skills) {
    const prev = byDim.get(s.dimension);
    if (prev) {
      console.warn(`[skills] 同维度 "${s.dimension}" 选了多个（${prev.name} / ${s.name}），后者覆盖前者`);
    }
    byDim.set(s.dimension, s);
  }

  // sourceNames 按固定维度顺序，稳定
  const sourceNames: string[] = [];
  for (const d of DIM_ORDER) {
    const s = byDim.get(d);
    if (s) sourceNames.push(s.name);
  }

  const struct = byDim.get("structure");
  const style = byDim.get("style");

  const directiveParts: string[] = [];
  const styleParts: string[] = [];
  for (const d of DIM_ORDER) {
    const s = byDim.get(d);
    if (!s) continue;
    const dp = labeled(d, s.directives);
    if (dp) directiveParts.push(dp);
    const sp = labeled(d, s.styleNotes);
    if (sp) styleParts.push(sp);
  }

  const examples: { layout: string; snippet: object }[] = [];
  for (const d of DIM_ORDER) {
    const s = byDim.get(d);
    if (s?.examples?.length) examples.push(...s.examples);
  }

  return {
    sourceNames,
    structure: struct?.structure,
    pageCount: struct?.pageCount,
    preferredMood: style?.preferredMood,
    preferredTheme: style?.preferredTheme,
    styleNotes: styleParts.length ? styleParts.join("\n\n") : undefined,
    directives: directiveParts.length ? directiveParts.join("\n\n") : undefined,
    examples: examples.length ? examples : undefined,
  };
}
