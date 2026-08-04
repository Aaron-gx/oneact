import { describe, it, expect } from "vitest";
import { exportPptx } from "../src/index.js";
import { listExporters } from "@oneact/core";
import golden from "../../../examples/golden.act.json";
import type { Deck } from "@oneact/schema";

describe("pptx 降级导出（策划书第 8 节）", () => {
  it("generates a non-empty pptx blob for golden deck", async () => {
    const { data, filename } = await exportPptx(golden as unknown as Deck);
    expect(data).toBeInstanceOf(Blob);
    expect(data.size).toBeGreaterThan(1000);
    expect(filename).toMatch(/\.pptx$/);
  });

  it("降级报告明示丢失项（不偷偷丢东西）", async () => {
    const { report } = await exportPptx(golden as unknown as Deck);
    expect(report.length).toBeGreaterThan(0);
    // golden 含公式/视频/音频/逃逸块/动画/图表 → 都应进报告
    expect(report.some((r) => r.kind === "公式")).toBe(true);
    expect(report.some((r) => r.kind === "视频")).toBe(true);
    expect(report.some((r) => r.kind === "动画")).toBe(true);
    expect(report.some((r) => r.kind === "图表")).toBe(true); // 命令行环境图表降级
  });

  it("registers pptx exporter to core registry", () => {
    expect(listExporters().some((e) => e.name === "pptx")).toBe(true);
  });
});
