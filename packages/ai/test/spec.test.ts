import { describe, it, expect } from "vitest";
import { buildSpec } from "../src/spec.js";
import type { ComposedSkill } from "@oneact/skills";

const composed: ComposedSkill = {
  sourceNames: ["商业路演BP", "Apple极简", "金融"],
  pageCount: 12,
  structure: [{ layout: "cover", title: "封面" }],
  preferredMood: "minimal",
  styleNotes: "【来自视觉风格维度】大留白",
  directives: "【来自行业维度】数据标来源",
};

describe("buildSpec · skill 注入（§12）", () => {
  it("不传 skills 时不含「场景化知识」（零回归）", () => {
    const spec = buildSpec({ theme: "yuanshan-blue", pageCount: 8 });
    expect(spec).not.toContain("场景化知识");
    expect(spec).toContain("现在请生成约 8 页");
  });

  it("传 skills 时含 §12 场景化知识段 + sourceNames", () => {
    const spec = buildSpec({ theme: "yuanshan-blue", pageCount: 8, skills: composed });
    expect(spec).toContain("场景化知识");
    expect(spec).toContain("商业路演BP + Apple极简 + 金融");
    expect(spec).toContain("数据标来源");
  });

  it("传 skills 时含结构骨架 JSON + 目标页数", () => {
    const spec = buildSpec({ skills: composed });
    expect(spec).toContain('"layout":"cover"');
    expect(spec).toContain("目标 12 页");
  });

  it("skills 无 structure 时不输出骨架块，但仍输出 directives", () => {
    const onlyDomain: ComposedSkill = { sourceNames: ["金融"], directives: "【来自行业维度】合规" };
    const spec = buildSpec({ skills: onlyDomain });
    expect(spec).toContain("合规");
    expect(spec).not.toContain("结构骨架");
  });

  it("空 sourceNames 视为无 skill（零回归）", () => {
    const empty: ComposedSkill = { sourceNames: [] };
    const spec = buildSpec({ skills: empty });
    expect(spec).not.toContain("场景化知识");
  });
});
