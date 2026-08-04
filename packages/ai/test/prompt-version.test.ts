import { describe, it, expect } from "vitest";
import { SpecRegistry, runABTest, formatABResult, createDefaultRegistry } from "../src/prompt-version.js";
import { buildSpec } from "../src/spec.js";
import type { BenchmarkReport } from "../src/benchmark.js";

describe("SpecRegistry", () => {
  it("registers and activates first version automatically", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "初始", buildSpec);
    expect(reg.active.id).toBe("v1");
  });

  it("switches active version", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "初始", buildSpec);
    reg.register("v2", "改进", buildSpec);
    reg.activate("v2");
    expect(reg.active.id).toBe("v2");
  });

  it("builds spec from active version", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "初始", buildSpec);
    const spec = reg.build({ theme: "yuanshan-blue" });
    expect(spec).toContain("formatVersion");
    expect(spec).toContain("rect");
  });

  it("lists all versions in order", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "a", buildSpec);
    reg.register("v2", "b", buildSpec);
    reg.register("v3", "c", buildSpec);
    expect(reg.list().map((v) => v.id)).toEqual(["v1", "v2", "v3"]);
  });

  it("rollbacks to previous version", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "a", buildSpec);
    reg.register("v2", "b", buildSpec);
    reg.activate("v2");
    const prev = reg.rollback();
    expect(prev?.id).toBe("v1");
    expect(reg.active.id).toBe("v1");
  });

  it("cannot rollback past first version", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "a", buildSpec);
    expect(reg.rollback()).toBeNull();
  });

  it("throws on activating unknown version", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "a", buildSpec);
    expect(() => reg.activate("unknown")).toThrow();
  });

  it("serializes to JSON without build function", () => {
    const reg = new SpecRegistry();
    reg.register("v1", "a", buildSpec, ["stable"]);
    const json = reg.toJSON();
    expect(json[0].id).toBe("v1");
    expect(json[0].description).toBe("a");
    expect(json[0].tags).toEqual(["stable"]);
    expect("build" in json[0]).toBe(false);
  });
});

describe("createDefaultRegistry", () => {
  it("has v1.0 registered as stable", () => {
    const reg = createDefaultRegistry();
    expect(reg.active.id).toBe("v1.0");
    expect(reg.active.tags).toContain("stable");
    const spec = reg.build({ theme: "yuanshan-blue" });
    expect(spec).toContain("formatVersion");
  });
});

describe("runABTest", () => {
  function makeReport(firstPassRate: number, avgRetries: number): BenchmarkReport {
    return {
      model: "test",
      modelTier: "standard",
      timestamp: "2026-01-01T00:00:00Z",
      summary: {
        total: 10,
        passed: 8,
        firstPass: Math.round(firstPassRate * 10),
        firstPassRate,
        passRate: firstPassRate + 0.1,
        avgRetries,
        avgLayoutCoverage: 0.8,
        avgComponentCoverage: 0.8,
        avgWarnings: 2,
        avgElapsed: 3000,
      },
      cases: [],
      errorBreakdown: {},
      warningBreakdown: {},
    };
  }

  it("recommends adopt on improvement", () => {
    const result = runABTest({
      baseline: "v1",
      experiment: "v2",
      baselineReport: makeReport(0.6, 1.0),
      experimentReport: makeReport(0.8, 0.5),
    });
    expect(result.recommendation).toBe("adopt");
    expect(result.improved).toBe(true);
    expect(result.deltas.firstPassRate).toBeCloseTo(0.2, 1);
  });

  it("recommends reject on significant regression", () => {
    const result = runABTest({
      baseline: "v1",
      experiment: "v2",
      baselineReport: makeReport(0.8, 0.5),
      experimentReport: makeReport(0.6, 1.0),
    });
    expect(result.recommendation).toBe("reject");
    expect(result.deltas.firstPassRate).toBeLessThan(0);
  });

  it("recommends inconclusive on small change", () => {
    const result = runABTest({
      baseline: "v1",
      experiment: "v2",
      baselineReport: makeReport(0.7, 0.5),
      experimentReport: makeReport(0.72, 0.5),
    });
    expect(result.recommendation).toBe("inconclusive");
  });
});

describe("formatABResult", () => {
  it("produces readable output", () => {
    const result = runABTest({
      baseline: "v1",
      experiment: "v2",
      baselineReport: {
        model: "m",
        modelTier: "standard",
        timestamp: "2026-01-01",
        summary: {
          total: 10,
          passed: 7,
          firstPass: 6,
          firstPassRate: 0.6,
          passRate: 0.7,
          avgRetries: 1.0,
          avgLayoutCoverage: 0.8,
          avgComponentCoverage: 0.8,
          avgWarnings: 2,
          avgElapsed: 3000,
        },
        cases: [],
        errorBreakdown: {},
        warningBreakdown: {},
      },
      experimentReport: {
        model: "m",
        modelTier: "standard",
        timestamp: "2026-01-01",
        summary: {
          total: 10,
          passed: 9,
          firstPass: 8,
          firstPassRate: 0.8,
          passRate: 0.9,
          avgRetries: 0.5,
          avgLayoutCoverage: 0.85,
          avgComponentCoverage: 0.9,
          avgWarnings: 1,
          avgElapsed: 2500,
        },
        cases: [],
        errorBreakdown: {},
        warningBreakdown: {},
      },
    });
    const text = formatABResult(result);
    expect(text).toContain("A/B Test");
    expect(text).toContain("ADOPT");
  });
});
