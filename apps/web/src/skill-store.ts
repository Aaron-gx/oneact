/**
 * @oneact/web — skill 本地存储（用户导入的 skill）
 *
 * 仿 providers.ts / doc-store.ts：localStorage key = oneact-skills（数组）。
 * 内置 skill（BUILTIN_SKILLS）不存盘；listAllSkills() 合并 builtin + user（用户可覆盖同 id 内置）。
 */
import { BUILTIN_SKILLS, type Skill } from "@oneact/skills";

const KEY = "oneact-skills";

/** 读取用户导入的 skill 列表（不含内置）。 */
export function loadUserSkills(): Skill[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr as Skill[];
    }
  } catch {
    /* fall through */
  }
  return [];
}

/** 保存用户 skill 列表。 */
export function saveUserSkills(list: Skill[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 配额满：静默 */
  }
}

/** 所有可用 skill：内置 + 用户导入（同 id 时用户覆盖内置）。 */
export function listAllSkills(): Skill[] {
  const user = loadUserSkills();
  const userIds = new Set(user.map((s) => s.id));
  return [...BUILTIN_SKILLS.filter((s) => !userIds.has(s.id)), ...user];
}

/** 按 id 查单个 skill（builtin + user）。 */
export function findSkill(id: string): Skill | undefined {
  return listAllSkills().find((s) => s.id === id);
}

/** 导入 / 更新一个用户 skill（同 id 覆盖）。 */
export function addUserSkill(skill: Skill): void {
  const filtered = loadUserSkills().filter((s) => s.id !== skill.id);
  filtered.push({ ...skill, builtin: false });
  saveUserSkills(filtered);
}

/** 删除用户 skill（按 id）。 */
export function deleteUserSkill(id: string): void {
  saveUserSkills(loadUserSkills().filter((s) => s.id !== id));
}
