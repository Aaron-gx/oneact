import { describe, it, expect } from "vitest";
import { clamp } from "../src/player.js";
import { validateDeck } from "@oneact/core";
import { LAYOUTS } from "@oneact/layouts";
import sampleDeck from "../../../examples/self-intro.act.json";

describe("player utils", () => {
  it("clamp bounds value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(3, 0, 10)).toBe(3);
  });
});

describe("built-in sample deck", () => {
  it("self-intro.act.json passes validator with no hard errors", () => {
    const r = validateDeck(sampleDeck as never, { layouts: LAYOUTS });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("has 9 pages covering multiple layouts", () => {
    const deck = sampleDeck as { pages: { layout?: string }[] };
    expect(deck.pages.length).toBe(9);
    const layouts = new Set(deck.pages.map((p) => p.layout));
    expect(layouts.has("title")).toBe(true);
    expect(layouts.has("two-column")).toBe(true);
    expect(layouts.has("three-card")).toBe(true);
    expect(layouts.has("data")).toBe(true);
    expect(layouts.has("quote")).toBe(true);
  });
});
