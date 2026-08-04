/**
 * @oneact/core — 插件 / AI Skill 加载（策划书第 10 节：五类注册点的统一入口）
 *
 * skill = 生成说明书补丁 + 领域组件 + 版式 + 主题 + 导出器 + 专属校验规则。
 * registerSkill 一次性把组件/主题/导出器注册到 core；layouts/校验规则通过 onRegister 回调
 * （因 core 不反向依赖 layouts/validator，由 skill 自行调用对应注册函数）。
 */
import { registerTheme, type LayoutDef, type Theme } from "@oneact/schema";
import { registerExporter, type DeckExporter } from "./exporter-registry.js";
import { registerComponents, type ComponentRenderer } from "./registry.js";

export interface SkillPlugin {
  name: string;
  title?: string;
  /** 说明书补丁（追加到 buildSpec 输出） */
  specPatch?: () => string;
  components?: Record<string, ComponentRenderer>;
  themes?: Theme[];
  exporters?: DeckExporter[];
  /** 版式 / 专属校验规则等：由 skill 自行调用 registerLayout / 注册校验 */
  onRegister?: () => void;
}

const skills = new Map<string, SkillPlugin>();

export function registerSkill(skill: SkillPlugin): void {
  skills.set(skill.name, skill);
  if (skill.components) registerComponents(skill.components);
  if (skill.themes) skill.themes.forEach((t) => registerTheme(t));
  if (skill.exporters) skill.exporters.forEach((e) => registerExporter(e));
  skill.onRegister?.();
}

export function listSkills(): string[] {
  return [...skills.keys()];
}
export function getSkill(name: string): SkillPlugin | undefined {
  return skills.get(name);
}
/** 合并所有 skill 的说明书补丁。 */
export function collectSpecPatches(): string {
  return [...skills.values()]
    .map((s) => s.specPatch?.() ?? "")
    .filter(Boolean)
    .join("\n\n");
}

/** 领域组件包示例类型（skill 携带的版式，由 layouts 包 registerLayout 注册）。 */
export type { LayoutDef };
