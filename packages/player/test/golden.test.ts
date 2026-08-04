import { describe, it, expect } from "vitest";
import { validateDeck } from "@oneact/core";
import { LAYOUTS } from "@oneact/layouts";
import golden from "../../../examples/golden.act.json";

const deck = golden as { pages: { layout?: string; elements: { type: string }[] }[] };

describe("golden test set（黄金测试集 · 策划书 v0.3 退出标准）", () => {
  it("covers all 8 layouts", () => {
    const layouts = new Set(deck.pages.map((p) => p.layout));
    ["title", "toc", "two-column", "three-card", "big-image", "data", "quote", "end"].forEach((l) =>
      expect(layouts.has(l)).toBe(true),
    );
  });

  it("covers all 13 component types", () => {
    const types = new Set(deck.pages.flatMap((p) => p.elements.map((e) => e.type)));
    [
      "heading",
      "paragraph",
      "bullet-list",
      "image",
      "chart",
      "table",
      "shape",
      "icon",
      "custom-html",
      "custom-svg",
      "formula",
      "video",
      "audio",
    ].forEach((t) => expect(types.has(t)).toBe(true));
  });

  it("passes validator with no hard errors", () => {
    const r = validateDeck(golden as never, { layouts: LAYOUTS });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
