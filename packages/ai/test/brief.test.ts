import { describe, it, expect } from "vitest";
import {
  suggestMood,
  moodTheme,
  moodLabel,
  buildBriefFromAnswers,
  draftBriefWithAi,
  reviseBriefWithAi,
  applySkill,
  type BriefAnswers,
  type Brief,
} from "../src/brief.js";
import type { ComposedSkill } from "@oneact/skills";
import { mockProvider } from "../src/provider.js";

describe("brief · 风格推断", () => {
  it("suggestMood 按关键词映射", () => {
    expect(suggestMood("Python 数学建模实战")).toBe("academic");
    expect(suggestMood("AI 大模型技术演进")).toBe("tech");
    expect(suggestMood("中医药文化传承")).toBe("medical"); // medical 优先于 traditional
    expect(suggestMood("季度财务汇报")).toBe("ocean");
    expect(suggestMood("一个普通话题")).toBe("business"); // 兜底
  });
  it("moodTheme / moodLabel", () => {
    expect(moodTheme("tech")).toBe("tech-noir");
    expect(moodTheme("traditional")).toBe("crimson-gold");
    expect(moodLabel("tech")).toBe("科技深色");
  });
});

describe("brief · 确定性构建", () => {
  it("buildBriefFromAnswers 产出合理结构 + 主题", () => {
    const a: BriefAnswers = { topic: "AI 技术分享", length: "short" };
    const b = buildBriefFromAnswers(a);
    expect(b.theme).toBe("tech-noir");
    expect(b.pageCount).toBe(7);
    expect(b.sections.length).toBeGreaterThan(0);
    expect(b.sections[0].layout).toBe("cover");
    expect(b.sections[b.sections.length - 1].layout).toBe("closing");
    expect(b.styleNotes).toContain("逐页");
  });
  it("长版含目录页", () => {
    const b = buildBriefFromAnswers({ topic: "x", length: "detailed" });
    expect(b.pageCount).toBe(16);
    expect(b.sections.some((s) => s.layout === "toc")).toBe(true);
  });
  it("显式 mood 覆盖推断", () => {
    const b = buildBriefFromAnswers({ topic: "AI", mood: "minimal" });
    expect(b.theme).toBe("mono-slate");
  });
});

const fakeBrief: Brief = {
  topic: "AI",
  title: "AI 演讲",
  theme: "tech-noir",
  mood: "tech",
  pageCount: 8,
  sections: [{ layout: "cover" }],
  styleNotes: "逐页变化",
};

describe("brief · AI 起草/修订", () => {
  it("draftBriefWithAi 解析 LLM 返回的 Brief", async () => {
    const provider = mockProvider([
      JSON.stringify({
        ...fakeBrief,
        title: "AI 时代的产品力",
        pageCount: 10,
        sections: [{ layout: "cover", title: "封面" }],
      }),
    ]);
    const b = await draftBriefWithAi(provider, { topic: "AI" });
    expect(b.title).toBe("AI 时代的产品力");
    expect(b.pageCount).toBe(10);
  });
  it("draftBriefWithAi 在 LLM 失败时回退确定性 Brief", async () => {
    const provider = mockProvider(["不是 JSON {{{"]);
    const b = await draftBriefWithAi(provider, { topic: "AI 技术" });
    expect(b.theme).toBe("tech-noir"); // 回退仍按主题选了风格
  });
  it("reviseBriefWithAi 修订页数", async () => {
    const provider = mockProvider([JSON.stringify({ ...fakeBrief, pageCount: 12 })]);
    const b = await reviseBriefWithAi(provider, fakeBrief, "再加几页");
    expect(b.pageCount).toBe(12);
  });
  it("pageCount 越界被钳制", async () => {
    const provider = mockProvider([JSON.stringify({ ...fakeBrief, pageCount: 999 })]);
    const b = await draftBriefWithAi(provider, { topic: "x" });
    expect(b.pageCount).toBeLessThanOrEqual(20);
  });
});

describe("brief · applySkill 仲裁（用户显式 > skill > 原推断）", () => {
  const structComposed: ComposedSkill = {
    sourceNames: ["路演"],
    pageCount: 12,
    structure: [
      { layout: "cover", title: "项目名" },
      { layout: "closing", title: "ASK" },
    ],
  };

  it("structure 非空时覆盖 sections", () => {
    const answers: BriefAnswers = { topic: "AI 创业", mood: "auto", length: "auto" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, structComposed);
    expect(out.sections.map((s) => s.layout)).toEqual(["cover", "closing"]);
  });

  it("用户 mood=auto 时采用 skill.preferredMood 并重算 theme", () => {
    const answers: BriefAnswers = { topic: "x", mood: "auto" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, { sourceNames: ["极简"], preferredMood: "minimal" });
    expect(out.mood).toBe("minimal");
    expect(out.theme).toBe("mono-slate");
  });

  it("用户显式 mood 时 skill.preferredMood 不覆盖（用户赢）", () => {
    const answers: BriefAnswers = { topic: "x", mood: "tech" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, { sourceNames: ["极简"], preferredMood: "minimal" });
    expect(out.mood).toBe("tech");
    expect(out.theme).toBe("tech-noir");
  });

  it("用户 length=auto 时采用 skill.pageCount", () => {
    const answers: BriefAnswers = { topic: "x", length: "auto" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, structComposed);
    expect(out.pageCount).toBe(12);
  });

  it("用户显式 length 时 skill.pageCount 不覆盖（用户赢）", () => {
    const answers: BriefAnswers = { topic: "x", length: "short" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, structComposed);
    expect(out.pageCount).toBe(7); // short = 7
  });

  it("preferredTheme 直配 theme", () => {
    const answers: BriefAnswers = { topic: "x", mood: "auto" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, {
      sourceNames: ["t"],
      preferredTheme: "aurora-purple",
      preferredMood: "elegant",
    });
    expect(out.theme).toBe("aurora-purple");
  });

  it("无 structure 时不改动 sections", () => {
    const answers: BriefAnswers = { topic: "x" };
    const brief = buildBriefFromAnswers(answers);
    const before = brief.sections.length;
    const out = applySkill(answers, brief, { sourceNames: ["d"], directives: "合规" });
    expect(out.sections.length).toBe(before);
  });

  it("styleNotes 在原值后追加（保留通用指引）", () => {
    const answers: BriefAnswers = { topic: "x" };
    const brief = buildBriefFromAnswers(answers);
    const out = applySkill(answers, brief, { sourceNames: ["s"], styleNotes: "场景指引" });
    expect(out.styleNotes).toContain("场景指引");
    expect(out.styleNotes).toContain(brief.styleNotes);
  });
});
