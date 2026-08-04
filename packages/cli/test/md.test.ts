import { describe, it, expect } from "vitest";
import { markdownToDeck } from "../src/md.js";

const MD = `# 测试演示

## 第一节

正文段落。

- 要点 A
- 要点 B

## 第二节

> 引用一句

![示意图](http://x/a.png)
`;

describe("md2act（Markdown → .act，策划书 v2）", () => {
  it("splits pages by ## and extracts deck title from first #", () => {
    const deck = markdownToDeck(MD);
    expect(deck.meta.title).toBe("测试演示");
    expect(deck.pages.length).toBe(2);
  });

  it("maps list / image / quote", () => {
    const deck = markdownToDeck(MD);
    expect(deck.pages[0].elements.some((e) => e.type === "bullet-list")).toBe(true);
    expect(deck.pages[1].elements.some((e) => e.type === "image")).toBe(true);
    expect(deck.pages[1].elements.some((e) => e.type === "paragraph")).toBe(true); // 引用 → paragraph
  });

  it("produces a valid formatVersion + meta", () => {
    const deck = markdownToDeck(MD);
    expect(deck.formatVersion).toBe(1);
    expect(deck.meta.theme).toBe("yuanshan-blue");
  });
});
