import { describe, it, expect } from "vitest";
import {
  BudgetManager,
  BudgetedProvider,
  BudgetExceededError,
  estimateUsage,
  createBudgetedProvider,
} from "../src/budget.js";
import { mockProvider } from "../src/provider.js";

describe("BudgetManager", () => {
  it("starts with full budget remaining", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 1000, maxTokensPerDay: 5000 });
    const check = bm.check("session-1");
    expect(check.status).toBe("ok");
    expect(check.sessionRemaining).toBe(1000);
    expect(check.dayRemaining).toBe(5000);
  });

  it("records usage and tracks remaining", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 1000, maxTokensPerDay: 5000 });
    bm.record("s1", "model", { promptTokens: 200, completionTokens: 100, totalTokens: 300 });
    const check = bm.check("s1");
    expect(check.sessionRemaining).toBe(700);
    expect(check.dayRemaining).toBe(4700);
  });

  it("blocks when session budget exceeded", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 500, maxTokensPerDay: 10000 });
    bm.record("s1", "m", { promptTokens: 300, completionTokens: 300, totalTokens: 600 });
    const check = bm.check("s1");
    expect(check.status).toBe("session_exceeded");
    expect(check.reason).toContain("会话");
  });

  it("blocks when day budget exceeded", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 100000, maxTokensPerDay: 1000 });
    bm.record("s1", "m", { promptTokens: 700, completionTokens: 400, totalTokens: 1100 });
    const check = bm.check("s1");
    expect(check.status).toBe("day_exceeded");
    expect(check.reason).toContain("日");
  });

  it("tracks independent sessions separately", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 1000, maxTokensPerDay: 50000 });
    bm.record("s1", "m", { promptTokens: 500, completionTokens: 0, totalTokens: 500 });
    bm.record("s2", "m", { promptTokens: 100, completionTokens: 0, totalTokens: 100 });
    expect(bm.check("s1").sessionRemaining).toBe(500);
    expect(bm.check("s2").sessionRemaining).toBe(900);
  });

  it("resetSession clears session usage", () => {
    const bm = new BudgetManager({ maxTokensPerSession: 1000, maxTokensPerDay: 50000 });
    bm.record("s1", "m", { promptTokens: 500, completionTokens: 0, totalTokens: 500 });
    bm.resetSession("s1");
    expect(bm.check("s1").sessionRemaining).toBe(1000);
  });

  it("estimateCost calculates based on rate", () => {
    const bm = new BudgetManager({
      maxTokensPerSession: 100000,
      maxTokensPerDay: 1000000,
      inputCostPer1k: 0.01,
      outputCostPer1k: 0.03,
    });
    bm.record("s1", "m", { promptTokens: 10000, completionTokens: 5000, totalTokens: 15000 });
    // input: 0.01 * 10 = 0.1, output: 0.03 * 5 = 0.15, total = 0.25
    expect(bm.estimateCost("s1")).toBe(0.25);
  });
});

describe("estimateUsage", () => {
  it("estimates higher tokens for Chinese text", () => {
    const cn = estimateUsage("你好世界这是一段中文", "");
    const en = estimateUsage("hello world this is english", "");
    expect(cn.promptTokens).toBeGreaterThan(en.promptTokens);
  });

  it("counts output tokens", () => {
    const u = estimateUsage("", "hello world");
    expect(u.completionTokens).toBeGreaterThan(0);
    expect(u.totalTokens).toBe(u.promptTokens + u.completionTokens);
  });
});

describe("BudgetedProvider", () => {
  it("wraps provider and tracks usage", async () => {
    const mock = mockProvider(["hello world"]);
    const bm = new BudgetManager({ maxTokensPerSession: 100000, maxTokensPerDay: 1000000 });
    const budgeted = new BudgetedProvider(mock, bm, "s1");

    const result = await budgeted.generate([{ role: "user", content: "hi" }]);
    expect(result).toBe("hello world");

    const usage = bm.getSessionUsage("s1");
    expect(usage.totalTokens).toBeGreaterThan(0);
  });

  it("throws BudgetExceededError when budget exhausted", async () => {
    const mock = mockProvider(["hello"]);
    const bm = new BudgetManager({ maxTokensPerSession: 5, maxTokensPerDay: 100000 });
    // 先耗尽预算
    bm.record("s1", "m", { promptTokens: 0, completionTokens: 0, totalTokens: 10 });

    const budgeted = new BudgetedProvider(mock, bm, "s1");
    await expect(budgeted.generate([{ role: "user", content: "hi" }])).rejects.toThrow(BudgetExceededError);
  });

  it("createBudgetedProvider factory works", async () => {
    const bm = new BudgetManager({ maxTokensPerSession: 100000, maxTokensPerDay: 1000000 });
    const provider = createBudgetedProvider({ kind: "openai-compatible", apiKey: "test", model: "mock" }, bm, "s1");
    expect(provider.config.model).toBe("mock");
  });
});

describe("BudgetExceededError", () => {
  it("carries status field", () => {
    const err = new BudgetExceededError("test reason", "session_exceeded");
    expect(err.message).toBe("test reason");
    expect(err.status).toBe("session_exceeded");
    expect(err.name).toBe("BudgetExceededError");
  });
});
