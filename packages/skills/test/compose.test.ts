import { describe, it, expect } from "vitest";
import { composeSkills } from "../src/compose.js";
import type { Skill } from "../src/types.js";

const struct: Skill = {
  id: "s",
  name: "结构A",
  description: "",
  dimension: "structure",
  pageCount: 12,
  structure: [{ layout: "cover", title: "封面" }],
  directives: "结构指令",
  styleNotes: "结构节奏",
};
const style: Skill = {
  id: "y",
  name: "风格A",
  description: "",
  dimension: "style",
  preferredMood: "minimal",
  preferredTheme: "mono-slate",
  directives: "风格指令",
  styleNotes: "视觉节奏",
};
const domain: Skill = {
  id: "d",
  name: "行业A",
  description: "",
  dimension: "domain",
  directives: "行业指令",
};

describe("composeSkills · 维度收集与拼接", () => {
  it("空数组返回空 ComposedSkill，不崩", () => {
    const c = composeSkills([]);
    expect(c.sourceNames).toEqual([]);
    expect(c.structure).toBeUndefined();
    expect(c.directives).toBeUndefined();
    expect(c.styleNotes).toBeUndefined();
  });

  it("单 structure 维度取其 structure / pageCount", () => {
    const c = composeSkills([struct]);
    expect(c.structure).toEqual(struct.structure);
    expect(c.pageCount).toBe(12);
    expect(c.sourceNames).toEqual(["结构A"]);
  });

  it("三维度叠加 sourceNames 按 structure→style→domain 顺序（即使乱序输入）", () => {
    const c = composeSkills([domain, style, struct]);
    expect(c.sourceNames).toEqual(["结构A", "风格A", "行业A"]);
  });

  it("style 缺 preferredMood 时为 undefined（不补全）", () => {
    const c = composeSkills([{ ...style, preferredMood: undefined }]);
    expect(c.preferredMood).toBeUndefined();
  });

  it("style 维度提供 preferredMood / preferredTheme", () => {
    const c = composeSkills([style]);
    expect(c.preferredMood).toBe("minimal");
    expect(c.preferredTheme).toBe("mono-slate");
  });

  it("directives 按维度标签分块、structure→style→domain 顺序拼接", () => {
    const c = composeSkills([struct, style, domain]);
    expect(c.directives).toContain("【来自结构维度】结构指令");
    expect(c.directives).toContain("【来自视觉风格维度】风格指令");
    expect(c.directives).toContain("【来自行业维度】行业指令");
    const iStruct = c.directives!.indexOf("结构指令");
    const iStyle = c.directives!.indexOf("风格指令");
    const iDomain = c.directives!.indexOf("行业指令");
    expect(iStruct).toBeLessThan(iStyle);
    expect(iStyle).toBeLessThan(iDomain);
  });

  it("styleNotes 同样按维度标签分块拼接", () => {
    const c = composeSkills([struct, style]);
    expect(c.styleNotes).toContain("【来自结构维度】结构节奏");
    expect(c.styleNotes).toContain("【来自视觉风格维度】视觉节奏");
  });

  it("无 directives / styleNotes 的维度不产生空块", () => {
    const c = composeSkills([{ id: "s2", name: "S2", description: "", dimension: "structure" }]);
    expect(c.directives).toBeUndefined();
    expect(c.styleNotes).toBeUndefined();
  });

  it("同维度重复时后者覆盖前者", () => {
    const a: Skill = { id: "a", name: "A", description: "", dimension: "style", preferredMood: "tech" };
    const b: Skill = { id: "b", name: "B", description: "", dimension: "style", preferredMood: "minimal" };
    const c = composeSkills([a, b]);
    expect(c.preferredMood).toBe("minimal");
    expect(c.sourceNames).toEqual(["B"]);
  });

  it("BUILTIN_SKILLS 可被 compose 正常处理", async () => {
    const { BUILTIN_SKILLS } = await import("../src/builtin.js");
    const pitch = BUILTIN_SKILLS.find((s) => s.id === "startup-pitch")!;
    const minimal = BUILTIN_SKILLS.find((s) => s.id === "apple-minimal")!;
    const fin = BUILTIN_SKILLS.find((s) => s.id === "finance")!;
    const c = composeSkills([pitch, minimal, fin]);
    expect(c.sourceNames).toEqual(["商业路演 BP", "Apple 极简风", "金融行业"]);
    expect(c.structure?.length).toBeGreaterThan(0);
    expect(c.preferredTheme).toBe("mono-slate");
    expect(c.directives).toContain("金融");
  });
});
