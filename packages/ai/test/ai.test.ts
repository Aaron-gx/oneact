import { describe, it, expect } from "vitest";
import { extractJson, generateDeck, generateDeckStream, rewritePage, buildSpec, mockProvider } from "../src/index.js";
import { LAYOUTS } from "@oneact/layouts";
import type { Deck, Page } from "@oneact/schema";

describe("extractJson", () => {
  it("strips markdown fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("extracts object from surrounding prose", () => {
    expect(extractJson('好的，这是结果：\n{"a":1}\n以上。')).toBe('{"a":1}');
  });
  it("passes through plain json", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe("buildSpec", () => {
  it("contains format + layout + component guidance", () => {
    const s = buildSpec({ theme: "yuanshan-blue" });
    expect(s).toContain("formatVersion");
    expect(s).toContain("two-column");
    expect(s).toContain("rect");
    expect(s).toContain("chart");
    expect(s).toContain("自检清单");
    expect(s).toContain("负面示例");
  });
  it("weak tier enforces constraint mode", () => {
    const s = buildSpec({ modelTier: "weak" });
    expect(s).toContain("约束模式");
    expect(s).toContain("禁止自己编造");
  });
});

const goodDeck: Deck = {
  formatVersion: 1,
  meta: { theme: "yuanshan-blue" },
  pages: [{ id: "p1", elements: [{ id: "h", type: "heading", rect: [64, 48, 200, 60], props: { text: "标题" } }] }],
};
// 越界（硬错误）
const badDeck: Deck = {
  formatVersion: 1,
  meta: { theme: "yuanshan-blue" },
  pages: [{ id: "p1", elements: [{ id: "h", type: "heading", rect: [2000, 48, 200, 60], props: { text: "标题" } }] }],
};

describe("generateDeck self-heal loop", () => {
  it("heals on retry when first output fails validation", async () => {
    const provider = mockProvider([JSON.stringify(badDeck), JSON.stringify(goodDeck)]);
    const res = await generateDeck({ provider, topic: "测试" });
    expect(res.result.ok).toBe(true);
    expect(res.retries).toBe(1);
    expect(res.deck?.pages[0].elements[0].rect[0]).toBe(64);
  });

  it("returns not-ok after exhausting retries (no silent delivery)", async () => {
    const provider = mockProvider([JSON.stringify(badDeck), JSON.stringify(badDeck), JSON.stringify(badDeck)]);
    const res = await generateDeck({ provider, topic: "测试", maxRetries: 2 });
    expect(res.result.ok).toBe(false);
    expect(res.retries).toBe(3); // maxRetries + 1
    expect(res.result.errors.some((e) => e.rule === "out-of-bounds")).toBe(true);
  });

  it("handles non-JSON output then heals", async () => {
    const provider = mockProvider(["这不是 JSON", JSON.stringify(goodDeck)]);
    const res = await generateDeck({ provider, topic: "测试" });
    expect(res.result.ok).toBe(true);
  });
});

describe("rewritePage (full-page rewrite)", () => {
  it("returns a valid rewritten page", async () => {
    const page: Page = {
      id: "p1",
      elements: [{ id: "h", type: "heading", rect: [64, 48, 200, 60], props: { text: "旧" } }],
    };
    const newPage: Page = {
      id: "p1",
      elements: [{ id: "h", type: "heading", rect: [64, 48, 400, 60], props: { text: "新标题" } }],
    };
    const provider = mockProvider([JSON.stringify(newPage)]);
    const res = await rewritePage({ provider, page, instruction: "把标题改成新标题" });
    expect(res.result.ok).toBe(true);
    expect(res.page?.elements[0].props).toMatchObject({ text: "新标题" });
  });
});

describe("generateDeckStream self-heal（残缺 page 不崩溃）", () => {
  it("大纲后某页缺 elements → 自愈重试得到完整页", async () => {
    const outline = JSON.stringify({
      title: "测试",
      theme: "yuanshan-blue",
      pages: [{ layout: "cover", title: "封面", summary: "s" }],
    });
    // 模拟 qwen 偶发输出：page 缺 elements 数组（曾导致 validatePage 崩溃）
    const malformed = JSON.stringify({ id: "p1", layout: "cover", title: "封面" });
    const good = JSON.stringify({
      id: "p1",
      layout: "cover",
      title: "封面",
      elements: [{ id: "e1", type: "heading", rect: [64, 280, 1152, 110], props: { text: "标题" } }],
    });
    const provider = mockProvider([outline, malformed, good]);
    const { deck, result, retries } = await generateDeckStream({
      provider,
      topic: "测试",
      layouts: LAYOUTS,
      maxRetries: 2,
    });
    expect(deck).toBeTruthy();
    expect(deck.pages.length).toBe(1);
    expect(deck.pages[0].elements.length).toBe(1); // 自愈后含 elements
    expect(retries).toBeGreaterThanOrEqual(1);
    expect(result.ok).toBe(true);
  });

  it("元素 props 残缺（bullet-list 无 items）→ 自愈，不因 checkOverflow .map 崩溃", async () => {
    const outline = JSON.stringify({
      title: "测试",
      theme: "yuanshan-blue",
      pages: [{ layout: "content", title: "页", summary: "s" }],
    });
    // 曾让 checkOverflow 在 el.props.items.map 崩溃（reading 'map'）
    const malformed = JSON.stringify({
      id: "p1",
      layout: "content",
      elements: [{ id: "b", type: "bullet-list", rect: [64, 130, 1152, 400], props: {} }],
    });
    const good = JSON.stringify({
      id: "p1",
      layout: "content",
      elements: [
        { id: "b", type: "bullet-list", rect: [64, 130, 1152, 400], props: { items: ["要点一", "要点二"] } },
      ],
    });
    const provider = mockProvider([outline, malformed, good]);
    const { deck, result } = await generateDeckStream({ provider, topic: "测试", layouts: LAYOUTS, maxRetries: 2 });
    expect(deck).toBeTruthy();
    expect(result.ok).toBe(true);
  });

  it("空白/失败页在原上下文下被补生成（不留空白页）", async () => {
    const outline = JSON.stringify({
      title: "测试",
      theme: "yuanshan-blue",
      pages: [
        { layout: "cover", title: "封面", summary: "s" },
        { layout: "content", title: "内容", summary: "s" },
      ],
    });
    const page1Good = JSON.stringify({
      id: "p1", layout: "cover", elements: [{ id: "h1", type: "heading", rect: [64, 280, 1152, 110], props: { text: "封面" } }],
    });
    // 第 2 页第一版是空白（elements 为空）→ 应触发补生成
    const page2Blank = JSON.stringify({ id: "p2", layout: "content", elements: [] });
    // 补生成后第 2 页完整
    const page2Good = JSON.stringify({
      id: "p2", layout: "content", elements: [{ id: "h2", type: "heading", rect: [64, 44, 1152, 60], props: { text: "内容" } }],
    });
    const provider = mockProvider([outline, page1Good, page2Blank, page2Good]);
    const { deck } = await generateDeckStream({ provider, topic: "测试", layouts: LAYOUTS, maxRetries: 2 });
    expect(deck.pages.length).toBe(2);
    // 第 2 页不再是空白：补生成后有元素
    expect(deck.pages[1].elements.length).toBeGreaterThan(0);
  });
});
