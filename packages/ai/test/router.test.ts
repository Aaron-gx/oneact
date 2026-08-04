import { describe, it, expect } from "vitest";
import { ModelRouter, DEFAULT_TIERS, routerFromEnv, type RouterConfig } from "../src/router.js";

describe("ModelRouter", () => {
  const config: RouterConfig = {
    apiKey: "test-key",
    models: { weak: "lite-model", standard: "main-model", strong: "pro-model" },
    kind: "openai-compatible",
  };

  it("returns correct model per tier", () => {
    const router = new ModelRouter(config);
    expect(router.getProvider("weak").config.model).toBe("lite-model");
    expect(router.getProvider("standard").config.model).toBe("main-model");
    expect(router.getProvider("strong").config.model).toBe("pro-model");
  });

  it("caches provider instances per tier", () => {
    const router = new ModelRouter(config);
    const p1 = router.getProvider("standard");
    const p2 = router.getProvider("standard");
    expect(p1).toBe(p2); // same reference
  });

  it("default returns standard provider", () => {
    const router = new ModelRouter(config);
    expect(router.default.config.model).toBe("main-model");
  });

  it("applies tier params with forceConstraintMode for weak", () => {
    const router = new ModelRouter(config);
    expect(router.getTierParams("weak").forceConstraintMode).toBe(true);
    expect(router.getTierParams("standard").forceConstraintMode).toBe(false);
    expect(router.getTierParams("strong").forceConstraintMode).toBe(false);
  });

  it("throws on missing model for tier", () => {
    const router = new ModelRouter({ apiKey: "k", models: { weak: "m", standard: "m", strong: "m" } });
    expect(() => router.getTierParams("weak")).not.toThrow();
  });

  it("supports tierOverrides", () => {
    const router = new ModelRouter({
      ...config,
      tierOverrides: { weak: { temperature: 0.1 } },
    });
    expect(router.getTierParams("weak").temperature).toBe(0.1);
  });

  it("supports per-tier provider kind (cross-vendor)", () => {
    const router = new ModelRouter({
      apiKey: "k",
      models: { weak: "glm-flash", standard: "gpt-4o", strong: "claude-3.5" },
      kindPerTier: { weak: "openai-compatible", standard: "openai", strong: "anthropic" },
    });
    expect(router.getProvider("strong").config.kind).toBe("anthropic");
  });
});

describe("DEFAULT_TIERS", () => {
  it("weak has lower temperature than strong", () => {
    expect(DEFAULT_TIERS.weak.temperature).toBeLessThanOrEqual(DEFAULT_TIERS.strong.temperature);
  });
  it("weak forces constraint mode", () => {
    expect(DEFAULT_TIERS.weak.forceConstraintMode).toBe(true);
  });
});

describe("routerFromEnv", () => {
  afterEach(() => {
    // 清理环境变量
    delete process.env.ONEACT_API_KEY;
    delete process.env.ONEACT_MODEL;
    delete process.env.ONEACT_MODEL_WEAK;
    delete process.env.ONEACT_MODEL_STRONG;
  });

  it("throws when env not set", () => {
    expect(() => routerFromEnv()).toThrow();
  });

  it("creates router from env with fallback tiers", () => {
    process.env.ONEACT_API_KEY = "test";
    process.env.ONEACT_MODEL = "main-model";
    const router = routerFromEnv();
    expect(router.getProvider("standard").config.model).toBe("main-model");
    // weak/strong fall back to standard
    expect(router.getProvider("weak").config.model).toBe("main-model");
    expect(router.getProvider("strong").config.model).toBe("main-model");
  });

  it("uses explicit per-tier models when set", () => {
    process.env.ONEACT_API_KEY = "test";
    process.env.ONEACT_MODEL = "main";
    process.env.ONEACT_MODEL_WEAK = "lite";
    process.env.ONEACT_MODEL_STRONG = "pro";
    const router = routerFromEnv();
    expect(router.getProvider("weak").config.model).toBe("lite");
    expect(router.getProvider("standard").config.model).toBe("main");
    expect(router.getProvider("strong").config.model).toBe("pro");
  });
});
