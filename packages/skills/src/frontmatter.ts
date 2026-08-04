/**
 * @oneact/skills — Markdown frontmatter 解析 / 序列化（用户导入 / 导出 skill）
 *
 * 格式：
 *   ---
 *   id: my-pitch
 *   name: 我的路演
 *   description: 一句话描述
 *   dimension: structure        # structure | style | domain
 *   triggers: [路演, 融资]       # 可选，topic 关键词
 *   preferredMood: elegant      # 可选
 *   preferredTheme: aurora-purple
 *   pageCount: 12
 *   ---
 *   ## 骨架                      # 仅 structure 维度；每行 `layout: title | hint`
 *   cover: 项目名 | 大标题
 *   comparison: 现状之痛
 *   ## 风格指引                  # 可选
 *   每页一个论点...
 *   ## 专业指令                  # 可选（主要 domain）
 *   术语规范...
 *
 * 零依赖手写（仿 @oneact/ai generate.ts 的 extractJson 风格）。容错：未知段忽略，
 * 仅缺 frontmatter / dimension 非法 / 缺必填字段时抛错。
 */
import type { Skill, SkillDimension, SkillSection } from "./types.js";

const DIMENSIONS: SkillDimension[] = ["structure", "style", "domain"];

/** 解析单个 frontmatter 值：支持 `[a, b]` 数组 / `"引号"` 字符串 / 裸字符串。 */
function parseValue(raw: string): string | string[] {
  const s = raw.trim();
  if (/^\[.*\]$/.test(s)) {
    return s
      .slice(1, -1)
      .split(",")
      .map((x) => x.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return s.replace(/^["']|["']$/g, "");
}

/** 解析「## 骨架」段的一行 `layout: title | hint`（只 split 首冒号；hint 用管道符）。 */
function parseStructureLine(line: string): SkillSection | null {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const layout = line.slice(0, idx).trim();
  if (!layout) return null;
  const rest = line.slice(idx + 1);
  const pipe = rest.indexOf("|");
  const title = (pipe >= 0 ? rest.slice(0, pipe) : rest).trim() || undefined;
  const hint = (pipe >= 0 ? rest.slice(pipe + 1) : "").trim() || undefined;
  const out: SkillSection = { layout };
  if (title) out.title = title;
  if (hint) out.hint = hint;
  return out;
}

/** 把正文按 `## 标题` 切成 { 标题: 内容 } 映射（未知标题也保留，前向容错）。 */
function splitBodySections(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = body.split(/\r?\n/);
  let curTitle = "";
  let cur: string[] = [];
  const flush = (): void => {
    if (curTitle) out[curTitle] = cur.join("\n");
  };
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      curTitle = m[1].trim();
      cur = [];
    } else if (curTitle) {
      cur.push(line);
    }
  }
  flush();
  return out;
}

/**
 * 把 Markdown（frontmatter + 正文）解析成 Skill。
 * @throws 缺 frontmatter 围栏 / dimension 非法 / 缺 id|name|description 时抛错。
 */
export function parseFrontmatter(md: string): Skill {
  const text = md.replace(/^﻿/, ""); // 去 BOM
  const fence = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?([\s\S]*)$/m.exec(text);
  if (!fence) throw new Error("缺少 frontmatter（需以 --- 开头与结尾围栏包裹）");
  const fmRaw = fence[1];
  const body = fence[2] ?? "";

  // frontmatter 行级解析
  const meta: Record<string, string | string[]> = {};
  for (const line of fmRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx < 0) continue; // 容错：跳过无冒号行
    meta[trimmed.slice(0, idx).trim()] = parseValue(trimmed.slice(idx + 1));
  }

  const id = String(meta.id ?? "").trim();
  const name = String(meta.name ?? "").trim();
  const description = String(meta.description ?? "").trim();
  const dimension = String(meta.dimension ?? "").trim() as SkillDimension;
  if (!id || !name || !description) {
    throw new Error("frontmatter 缺必填字段（id / name / description）");
  }
  if (!DIMENSIONS.includes(dimension)) {
    throw new Error(`dimension 非法：「${dimension}」（须为 structure / style / domain）`);
  }

  const str = (v: string | string[] | undefined): string | undefined =>
    v == null ? undefined : Array.isArray(v) ? v.join(", ") : v;

  const skill: Skill = {
    id,
    name,
    description,
    dimension,
    author: str(meta.author),
    triggers: Array.isArray(meta.triggers)
      ? meta.triggers
      : meta.triggers
        ? [String(meta.triggers)]
        : undefined,
    preferredMood: str(meta.preferredMood),
    preferredTheme: str(meta.preferredTheme),
    pageCount: meta.pageCount ? Number(meta.pageCount) : undefined,
  };

  // 正文段
  const sections = splitBodySections(body);
  const structRaw = sections.骨架 ?? sections.结构 ?? sections.Structure;
  if (structRaw) {
    skill.structure = structRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseStructureLine)
      .filter(Boolean) as SkillSection[];
  }
  const styleRaw = sections.风格指引 ?? sections.Style;
  if (styleRaw?.trim()) skill.styleNotes = styleRaw.trim();
  const dirRaw = sections.专业指令 ?? sections.指令 ?? sections.Directives;
  if (dirRaw?.trim()) skill.directives = dirRaw.trim();
  return skill;
}

/** 把 Skill 序列化为 Markdown frontmatter（导出 / 分享用）。 */
export function serializeSkill(skill: Skill): string {
  const fm: string[] = ["---"];
  fm.push(`id: ${skill.id}`);
  fm.push(`name: ${skill.name}`);
  fm.push(`description: ${skill.description}`);
  fm.push(`dimension: ${skill.dimension}`);
  if (skill.author) fm.push(`author: ${skill.author}`);
  if (skill.triggers?.length) fm.push(`triggers: [${skill.triggers.join(", ")}]`);
  if (skill.preferredMood) fm.push(`preferredMood: ${skill.preferredMood}`);
  if (skill.preferredTheme) fm.push(`preferredTheme: ${skill.preferredTheme}`);
  if (skill.pageCount) fm.push(`pageCount: ${skill.pageCount}`);
  fm.push("---");
  const body: string[] = [];
  if (skill.structure?.length) {
    body.push("## 骨架");
    for (const s of skill.structure) {
      body.push(`${s.layout}: ${s.title ?? ""}${s.hint ? ` | ${s.hint}` : ""}`);
    }
  }
  if (skill.styleNotes) body.push("## 风格指引", skill.styleNotes);
  if (skill.directives) body.push("## 专业指令", skill.directives);
  return `${fm.join("\n")}\n${body.join("\n")}\n`;
}
