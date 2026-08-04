import { describe, it, expect } from "vitest";
import { importPptx } from "../src/pptx-import.js";
import { exportPptx } from "@oneact/exporter-pptx";
import golden from "../../../examples/golden.act.json";
import type { Deck } from "@oneact/schema";

describe("pptx 导入（v3：.pptx → deck）", () => {
  it("export → import 往返：能提取文本层", async () => {
    const { data } = await exportPptx(golden as unknown as Deck);
    const deck = importPptx(new Uint8Array(await data.arrayBuffer()));
    expect(deck.formatVersion).toBe(1);
    expect(deck.pages.length).toBeGreaterThan(0);
    const hasText = deck.pages.some((p) => p.elements.some((e) => e.type === "heading" || e.type === "paragraph"));
    expect(hasText).toBe(true);
  });
});
