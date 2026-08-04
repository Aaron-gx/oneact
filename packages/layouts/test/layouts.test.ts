import { describe, it, expect } from "vitest";
import { LAYOUTS, LAYOUT_NAMES, composePage, expandAuto, checkLayout, slotsOf } from "../src/index.js";
import { validateDeck, canvasSize, type Slot } from "@oneact/schema";

describe("built-in layouts", () => {
  it("has the built-in layouts (base + advanced + container)", () => {
    // 基础 8 套必须存在；另有高级版式 + WS1 容器版式（hero/content），总数随迭代增长。
    expect(LAYOUT_NAMES.length).toBeGreaterThanOrEqual(18);
    ["title", "toc", "two-column", "three-card", "big-image", "data", "quote", "end"].forEach((n) =>
      expect(LAYOUT_NAMES).toContain(n),
    );
    // WS1 容器版式
    expect(LAYOUT_NAMES).toContain("hero");
    expect(LAYOUT_NAMES).toContain("content");
  });

  it("all slots within canvas and integers", () => {
    const cs = canvasSize("16:9");
    for (const def of Object.values(LAYOUTS)) {
      for (const slot of Object.values(def.slots)) {
        if (!Array.isArray(slot.rect)) continue;
        const [x, y, w, h] = slot.rect;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x + w).toBeLessThanOrEqual(cs.width);
        expect(y + h).toBeLessThanOrEqual(cs.height);
      }
    }
  });

  it("two-column left/right do not overlap", () => {
    const tc = LAYOUTS["two-column"];
    const left = tc.slots.left.rect as [number, number, number, number];
    const right = tc.slots.right.rect as [number, number, number, number];
    expect(left[0] + left[2]).toBeLessThanOrEqual(right[0]);
  });

  it("three-card columns tile evenly", () => {
    const tc = LAYOUTS["three-card"];
    const c1 = tc.slots.card1.rect as [number, number, number, number];
    const c2 = tc.slots.card2.rect as [number, number, number, number];
    const c3 = tc.slots.card3.rect as [number, number, number, number];
    expect(c1[0] + c1[2]).toBeLessThanOrEqual(c2[0]);
    expect(c2[0] + c2[2]).toBeLessThanOrEqual(c3[0]);
    expect(c3[0] + c3[2]).toBeLessThanOrEqual(canvasSize("16:9").width);
  });
});

describe("composePage (constraint mode)", () => {
  it("assigns slot coords + slot tag + layout", () => {
    const page = composePage(
      "two-column",
      {
        title: { type: "heading", props: { text: "T" } },
        left: { type: "bullet-list", props: { items: ["a", "b"] } },
        right: {
          type: "chart",
          props: { chartType: "bar", data: { categories: ["x"], series: [{ name: "s", values: [1] }] } },
        },
      },
      { pageId: "p1" },
    );
    const title = page.elements.find((e) => e.slot === "title")!;
    expect(title.rect).toEqual(LAYOUTS["two-column"].slots.title.rect);
    expect(title.slot).toBe("title");
    expect(page.layout).toBe("two-column");
    expect(page.id).toBe("p1");
  });

  it("throws on unknown layout", () => {
    expect(() => composePage("nope", {})).toThrow();
  });

  it("composed page passes validator with layouts (no slot errors)", () => {
    const page = composePage("title", {
      title: { type: "heading", props: { text: "一幕 OneAct" } },
      subtitle: { type: "paragraph", props: { text: "AI 原生演示框架" } },
    });
    const r = validateDeck({ formatVersion: 1, meta: { theme: "yuanshan-blue" }, pages: [page] }, { layouts: LAYOUTS });
    expect(r.ok).toBe(true);
    expect(r.errors.some((e) => e.rule === "slot-accepts")).toBe(false);
  });

  it("checkLayout detects wrong type in slot", () => {
    const page = composePage("title", { title: { type: "heading", props: { text: "x" } } });
    expect(checkLayout(page)).toBe(true);
    page.elements[0] = { ...page.elements[0], type: "chart" } as never;
    expect(checkLayout(page)).toBe(false);
  });
});

describe("auto height engine", () => {
  it("expands bullet-list by item count", () => {
    const slot: Slot = { rect: "auto", accepts: ["bullet-list"] };
    const rect = expandAuto(slot, { type: "bullet-list", props: { items: ["a", "b", "c", "d"], fontSize: 20 } });
    expect(rect[3]).toBeGreaterThan(100); // 4 * 20 * 1.5 + 16 = 136
  });
  it("uses anchor when provided", () => {
    const slot = { rect: "auto" as const, accepts: ["paragraph"], anchor: { x: 100, y: 200, w: 800, minH: 80 } };
    const rect = expandAuto(slot, { type: "paragraph", props: { text: "短文本" } });
    expect(rect[0]).toBe(100);
    expect(rect[1]).toBe(200);
    expect(rect[2]).toBe(800);
  });
  it("slotsOf lists slot names", () => {
    expect(slotsOf("two-column")).toEqual(expect.arrayContaining(["title", "subtitle", "left", "right"]));
    expect(slotsOf("nope")).toEqual([]);
  });
});
