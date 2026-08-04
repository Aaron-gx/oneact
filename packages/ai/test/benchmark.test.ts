import { describe, it, expect } from "vitest";
import {
  runBenchmark,
  formatReport,
  compareReports,
  deckToCase,
  deckToPageCases,
  type BenchmarkReport,
} from "../src/benchmark.js";
import { mockProvider } from "../src/provider.js";
import type { Deck } from "@oneact/schema";

const validDeck: Deck = {
  formatVersion: 1,
  meta: { theme: "yuanshan-blue", title: "测试" },
  pages: [
    {
      id: "p1",
      layout: "two-column",
      elements: [
        { id: "h", type: "heading", rect: [64, 48, 200, 60], props: { text: "标题" } },
        { id: "b", type: "bullet-list", rect: [64, 180, 560, 480], props: { items: ["要点一"] } },
      ],
    },
  ],
};

const oobDeck: Deck = {
  formatVersion: 1,
  meta: { theme: "yuanshan-blue" },
  pages: [{ id: "p1", elements: [{ id: "h", type: "heading", rect: [2000, 48, 200, 60], props: { text: "越界" } }] }],
};

describe("deckToCase / deckToPageCases", () => {
  it("converts a deck to a single case with layout+component coverage targets", () => {
    const c = deckToCase("test", validDeck);
    expect(c.id).toBe("test");
    expect(c.topic).toBe("测试");
    expect(c.pageCount).toBe(1);
    expect(c.expectLayouts).toContain("two-column");
    expect(c.expectComponents).toContain("heading");
    expect(c.expectComponents).toContain("bullet-list");
  });

  it("splits a deck into per-page cases", () => {
    const cases = deckToPageCases("g", validDeck);
    expect(cases.length).toBe(1);
    expect(cases[0].id).toBe("g-p1");
    expect(cases[0].pageCount).toBe(1);
  });
});

describe("runBenchmark", () => {
  it("records first-pass when LLM outputs valid deck on first try", async () => {
    const provider = mockProvider([JSON.stringify(validDeck)]);
    const report = await runBenchmark({
      provider,
      cases: [{ id: "c1", topic: "测试", expectComponents: ["heading"] }],
    });
    expect(report.summary.total).toBe(1);
    expect(report.summary.firstPass).toBe(1);
    expect(report.summary.firstPassRate).toBe(1);
    expect(report.summary.passRate).toBe(1);
    expect(report.cases[0].firstPass).toBe(true);
    expect(report.cases[0].componentCoverage).toBe(1);
  });

  it("records healed pass when first output fails but retry succeeds", async () => {
    const provider = mockProvider([JSON.stringify(oobDeck), JSON.stringify(validDeck)]);
    const report = await runBenchmark({
      provider,
      cases: [{ id: "c1", topic: "测试" }],
      maxRetries: 2,
    });
    expect(report.summary.firstPass).toBe(0);
    expect(report.summary.firstPassRate).toBe(0);
    expect(report.summary.passRate).toBe(1); // healed
    expect(report.cases[0].retries).toBe(1);
    expect(report.cases[0].firstPass).toBe(false);
    expect(report.cases[0].passed).toBe(true);
  });

  it("records fail when retries exhausted", async () => {
    const provider = mockProvider([JSON.stringify(oobDeck), JSON.stringify(oobDeck), JSON.stringify(oobDeck)]);
    const report = await runBenchmark({
      provider,
      cases: [{ id: "c1", topic: "测试" }],
      maxRetries: 2,
    });
    expect(report.summary.passRate).toBe(0);
    expect(report.cases[0].passed).toBe(false);
    expect(report.errorBreakdown["out-of-bounds"]).toBeGreaterThan(0);
  });

  it("aggregates error and warning breakdowns across cases", async () => {
    const provider = mockProvider([JSON.stringify(oobDeck), JSON.stringify(oobDeck), JSON.stringify(oobDeck)]);
    const report = await runBenchmark({
      provider,
      cases: [
        { id: "c1", topic: "测试1" },
        { id: "c2", topic: "测试2" },
      ],
      maxRetries: 0,
      throttleMs: 0,
    });
    expect(report.errorBreakdown["out-of-bounds"]).toBeGreaterThanOrEqual(2);
  });
});

describe("formatReport", () => {
  it("produces human-readable output with key metrics", () => {
    const report: BenchmarkReport = {
      model: "test-model",
      modelTier: "standard",
      timestamp: "2026-01-01T00:00:00Z",
      summary: {
        total: 10,
        passed: 9,
        firstPass: 7,
        firstPassRate: 0.7,
        passRate: 0.9,
        avgRetries: 0.3,
        avgLayoutCoverage: 0.8,
        avgComponentCoverage: 0.85,
        avgWarnings: 2.1,
        avgElapsed: 3500,
      },
      cases: [],
      errorBreakdown: { "out-of-bounds": 1 },
      warningBreakdown: { overlap: 3 },
    };
    const text = formatReport(report);
    expect(text).toContain("首次通过");
    expect(text).toContain("70.0%");
    expect(text).toContain("out-of-bounds");
    expect(text).toContain("overlap");
  });
});

describe("compareReports (A/B)", () => {
  it("shows improvement direction with checkmarks", () => {
    const before: BenchmarkReport = makeReport(0.6, 0.8, 1.2, 3.0);
    const after: BenchmarkReport = makeReport(0.8, 0.9, 0.5, 2.0);
    const text = compareReports(before, after);
    expect(text).toContain("60.0%");
    expect(text).toContain("80.0%");
    expect(text).toContain("✓");
  });

  it("flags regression with cross mark", () => {
    const before: BenchmarkReport = makeReport(0.8, 0.9, 0.5, 2.0);
    const after: BenchmarkReport = makeReport(0.6, 0.8, 1.2, 3.0);
    const text = compareReports(before, after);
    expect(text).toContain("✗");
  });
});

function makeReport(firstPassRate: number, passRate: number, avgRetries: number, avgWarnings: number): BenchmarkReport {
  return {
    model: "m",
    modelTier: "standard",
    timestamp: "2026-01-01T00:00:00Z",
    summary: {
      total: 10,
      passed: Math.round(passRate * 10),
      firstPass: Math.round(firstPassRate * 10),
      firstPassRate,
      passRate,
      avgRetries,
      avgLayoutCoverage: 0.8,
      avgComponentCoverage: 0.8,
      avgWarnings,
      avgElapsed: 3000,
    },
    cases: [],
    errorBreakdown: {},
    warningBreakdown: {},
  };
}
