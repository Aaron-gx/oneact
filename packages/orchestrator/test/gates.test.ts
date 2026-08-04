/**
 * @oneact/orchestrator — 质量门禁测试
 */
import { describe, it, expect } from "vitest";
import { checkG1, checkG2, checkG3 } from "../src/gates.js";
import { DEFAULT_CONSTRAINTS } from "../src/types.js";
import type { Brief, Outline } from "@oneact/ai";
import type { Deck } from "@oneact/schema";
import { LAYOUTS } from "@oneact/layouts";

const mockBrief: Brief = {
  topic: "测试主题",
  title: "测试",
  theme: "tech-noir",
  mood: "tech",
  pageCount: 8,
  sections: [
    { layout: "title", title: "封面" },
    { layout: "content", hint: "内容1" },
    { layout: "content", hint: "内容2" },
    { layout: "closing", title: "结尾" },
  ],
  styleNotes: "测试风格",
};

const mockLayouts = LAYOUTS;

describe("G1 结构门禁 (checkG1)", () => {
  it("合规大纲通过", () => {
    const outline: Outline = {
      title: "测试",
      theme: "tech-noir",
      pages: [
        { layout: "cover", title: "封面", summary: "" },
        { layout: "toc", title: "目录", summary: "" },
        { layout: "content", title: "内容1", summary: "" },
        { layout: "content", title: "内容2", summary: "" },
        { layout: "content", title: "内容3", summary: "" },
        { layout: "content", title: "内容4", summary: "" },
        { layout: "content", title: "内容5", summary: "" },
        { layout: "closing", title: "结尾", summary: "" },
      ],
    };

    const result = checkG1(outline, mockBrief, mockLayouts);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("页数不足不通过", () => {
    const outline: Outline = {
      title: "测试",
      theme: "tech-noir",
      pages: [{ layout: "cover", title: "只有封面", summary: "" }],
    };

    const result = checkG1(outline, mockBrief, mockLayouts);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("页数不足"))).toBe(true);
  });

  it("不合法 layout 不通过", () => {
    const outline: Outline = {
      title: "测试",
      theme: "tech-noir",
      pages: [
        { layout: "cover", title: "封面", summary: "" },
        { layout: "nonexistent-layout", title: "内容", summary: "" },
        { layout: "closing", title: "结尾", summary: "" },
      ],
    };

    const result = checkG1(outline, mockBrief, mockLayouts);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("版式不合法"))).toBe(true);
  });

  it("页数偏差过大不通过", () => {
    const outline: Outline = {
      title: "测试",
      theme: "tech-noir",
      pages: Array.from({ length: 2 }, (_, i) => ({
        layout: "cover",
        title: `页${i}`,
        summary: "",
      })),
    };

    const result = checkG1(outline, mockBrief, mockLayouts);
    // brief 期望 8 页，大纲只有 2 页 → 偏差 75%
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("偏差"))).toBe(true);
  });

  it("缺少 theme 不通过", () => {
    const outline: Outline = {
      title: "测试",
      theme: "",
      pages: [
        { layout: "cover", title: "封面", summary: "" },
        { layout: "content", title: "内容", summary: "" },
        { layout: "closing", title: "结尾", summary: "" },
      ],
    };

    const result = checkG1(outline, mockBrief, mockLayouts);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("theme"))).toBe(true);
  });
});

describe("G2 校验门禁 (checkG2)", () => {
  const validDeck: Deck = {
    formatVersion: 1,
    meta: { title: "测试", theme: "tech-noir", size: "16:9" },
    pages: [
      {
        id: "p1",
        layout: "title",
        title: "封面",
        elements: [
          { id: "e1", type: "heading" as const, rect: [100, 100, 800, 100] as [number, number, number, number], props: { text: "标题" } },
        ],
      },
    ],
  };

  it("合规 deck 通过", () => {
    const result = checkG2(validDeck, mockLayouts, DEFAULT_CONSTRAINTS);
    expect(result.gate.passed).toBe(true);
    expect(result.validation).toBeDefined();
    expect(result.guard).toBeDefined();
  });

  it("formatVersion 错误产生 errors", () => {
    const badDeck: Deck = {
      ...validDeck,
      formatVersion: 99 as number,
    };

    const result = checkG2(badDeck, mockLayouts, DEFAULT_CONSTRAINTS);
    expect(result.validation.errors.length).toBeGreaterThan(0);
  });

  it("空 pages 产生错误", () => {
    const emptyDeck: Deck = {
      formatVersion: 1,
      meta: { title: "空", theme: "tech-noir", size: "16:9" },
      pages: [],
    };

    const result = checkG2(emptyDeck, mockLayouts, DEFAULT_CONSTRAINTS);
    expect(result.gate.passed).toBe(false);
  });
});

describe("G3 成品门禁 (checkG3)", () => {
  const validDeck: Deck = {
    formatVersion: 1,
    meta: { title: "测试", theme: "tech-noir", size: "16:9" },
    pages: [
      {
        id: "p1",
        elements: [
          { id: "e1", type: "heading", props: { text: "标题", rect: [100, 100, 800, 100] } },
        ],
      },
    ],
  };

  it("合规 deck + guard pass 通过", () => {
    const result = checkG3(validDeck, { action: "pass", hits: [] });
    expect(result.passed).toBe(true);
  });

  it("空 deck 不通过", () => {
    const emptyDeck: Deck = { ...validDeck, pages: [] };
    const result = checkG3(emptyDeck, null);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("空"))).toBe(true);
  });

  it("formatVersion 不合规不通过", () => {
    const badDeck: Deck = { ...validDeck, formatVersion: 2 };
    const result = checkG3(badDeck, null);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("formatVersion"))).toBe(true);
  });

  it("guard block 不通过", () => {
    const result = checkG3(validDeck, {
      action: "block",
      hits: [],
      reason: "高危逃逸块",
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("安全"))).toBe(true);
  });

  it("空页面不通过", () => {
    const deckWithEmptyPage: Deck = {
      ...validDeck,
      pages: [
        { id: "p1", elements: [] },
      ],
    };
    const result = checkG3(deckWithEmptyPage, null);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes("空页面"))).toBe(true);
  });
});
