/**
 * @oneact/orchestrator — v3 协作回路 + 会话控制测试
 *
 * v3 测试覆盖：
 *   · generate() — Director 全权产出 {brief, outline}
 *   · edit()     — 编辑模式核心场景
 *   · InspectionReport 独占校验
 *   · ErrorLocation 结构化错误定位
 *   · Session 取消/暂停
 *   · Agent 单元测试
 */
import { describe, it, expect } from "vitest";
import { generate, edit } from "../src/orchestrator.js";
import { DirectorAgent } from "../src/agents/director.js";
import { InspectorAgent } from "../src/agents/inspector.js";
import { HealerAgent } from "../src/agents/healer.js";
import { Session, NEVER_CANCEL } from "../src/types.js";
import type { PipelineEvent, AgentContext, InspectionReport } from "../src/types.js";
import type { ChatMessage, GenerateOptions, LLMProvider, ProviderConfig } from "@oneact/ai";
import type { Deck } from "@oneact/schema";
import { LAYOUTS } from "@oneact/layouts";
import { DEFAULT_CONSTRAINTS } from "../src/types.js";

// ──────────────────────────────── Mock Provider ────────────────────────────────

const mockConfig: ProviderConfig = {
  kind: "openai-compatible",
  apiKey: "mock-key",
  model: "mock-model",
  baseUrl: "http://localhost",
};

function makeMockProvider(responses: string[]): LLMProvider {
  let idx = 0;
  return {
    config: mockConfig,
    async generate(_messages: ChatMessage[], _opts?: GenerateOptions): Promise<string> {
      const r = responses[idx];
      idx++;
      if (r === undefined) throw new Error("Mock provider: no more responses");
      return r;
    },
  };
}

function makeFnProvider(fn: (messages: ChatMessage[]) => string): LLMProvider {
  return {
    config: mockConfig,
    async generate(messages: ChatMessage[], _opts?: GenerateOptions): Promise<string> {
      return fn(messages);
    },
  };
}

// ──────────────────────────────── Mock 数据 ────────────────────────────────

const mockOutlineJson = JSON.stringify({
  title: "AI 测试演示",
  theme: "tech-noir",
  pages: [
    { layout: "cover", title: "AI 测试演示", summary: "封面" },
    { layout: "toc", title: "目录", summary: "目录" },
    { layout: "content", title: "什么是 AI", summary: "内容1" },
    { layout: "content", title: "AI 的应用", summary: "内容2" },
    { layout: "content", title: "AI 的未来", summary: "内容3" },
    { layout: "content", title: "AI 的挑战", summary: "内容4" },
    { layout: "closing", title: "总结", summary: "结尾" },
  ],
});

function makeMockPageJson(pageId: string, layout: string, title: string): string {
  return JSON.stringify({
    id: pageId, layout, title,
    elements: [{ id: `${pageId}-heading`, type: "heading", rect: [100, 100, 800, 100], props: { text: title } }],
  });
}

function makeMockDeck(): Deck {
  return {
    formatVersion: 1,
    id: "test-deck",
    title: "测试演示",
    theme: "tech-noir",
    pages: [
      { id: "p1", layout: "content", title: "第一页", elements: [
        { id: "p1-h", type: "heading", rect: [64, 64, 1152, 100], props: { text: "第一页标题" } } ] },
      { id: "p2", layout: "content", title: "第二页", elements: [
        { id: "p2-h", type: "heading", rect: [64, 64, 1152, 100], props: { text: "第二页标题" } } ] },
    ],
  } as Deck;
}

// ════════════════════════════════ generate 模式 ════════════════════════════════

describe("generate() 生成模式", () => {
  it("v3 Director 全权产出 {brief, outline}：成功生成 deck", async () => {
    // v3：Director 产出 brief（确定性路径，不调 LLM）+ outline（1 次 LLM 调用）
    // Generator 不再需要 generateOutline，只调 generateDeckStream 逐页生成
    const responses: string[] = [
      mockOutlineJson, // Director.generateOutline
      makeMockPageJson("p1", "cover", "AI 测试演示"),
      makeMockPageJson("p2", "toc", "目录"),
      makeMockPageJson("p3", "content", "什么是 AI"),
      makeMockPageJson("p4", "content", "AI 的应用"),
      makeMockPageJson("p5", "content", "AI 的未来"),
      makeMockPageJson("p6", "content", "AI 的挑战"),
      makeMockPageJson("p7", "closing", "总结"),
    ];

    const events: PipelineEvent[] = [];
    const result = await generate({
      provider: makeMockProvider(responses),
      answers: { topic: "AI 测试演示", audience: "工程师", purpose: "科普", mood: "tech", length: "short" },
      useAiBrief: false,
      onEvent: (e) => events.push(e),
    });

    expect(result.success).toBe(true);
    expect(result.deck).not.toBeNull();
    expect(result.brief).not.toBeNull();
    expect(result.outline).not.toBeNull();
    expect(result.deck!.pages.length).toBe(7);

    const types = events.map((e) => e.type);
    expect(types).toContain("session:start");
    expect(types).toContain("brief:ready");
    expect(types).toContain("outline:ready");
    expect(types).toContain("session:complete");
  });

  it("onPage 流式回调：每页就绪时触发", async () => {
    const responses: string[] = [
      mockOutlineJson,
      makeMockPageJson("p1", "cover", "封面"),
      makeMockPageJson("p2", "content", "内容1"),
      makeMockPageJson("p3", "content", "内容2"),
      makeMockPageJson("p4", "content", "内容3"),
      makeMockPageJson("p5", "content", "内容4"),
      makeMockPageJson("p6", "content", "内容5"),
      makeMockPageJson("p7", "closing", "结尾"),
    ];

    const pages: { index: number; total: number }[] = [];
    const result = await generate({
      provider: makeMockProvider(responses),
      answers: { topic: "流式测试", mood: "tech", length: "short" },
      useAiBrief: false,
      onPage: (_page, index, total) => pages.push({ index, total }),
    });

    expect(result.success).toBe(true);
    expect(pages.length).toBe(7);
    expect(pages[0].total).toBe(7);
  });

  it("首次通过：无错误时 firstPass=true", async () => {
    const responses: string[] = [
      mockOutlineJson,
      ...Array.from({ length: 7 }, (_, i) => makeMockPageJson(`p${i + 1}`, "content", `页${i + 1}`)),
    ];

    const result = await generate({
      provider: makeMockProvider(responses),
      answers: { topic: "首次通过测试", mood: "tech", length: "short" },
      useAiBrief: false,
    });

    expect(result.success).toBe(true);
    expect(result.stats.firstPass).toBe(true);
  });

  it("坏页不崩溃：最终 deck 所有页至少有 1 个元素", async () => {
    const badPageJson = JSON.stringify({
      id: "p3", layout: "content", title: "问题页",
      elements: [{ id: "p3-bad", type: "unknown_type", rect: [64, 64, 800, 100], props: { text: "问题" } }],
    });
    const goodPageJson = makeMockPageJson("p3", "content", "修复后");

    const responses: string[] = [
      mockOutlineJson,
      makeMockPageJson("p1", "cover", "封面"),
      makeMockPageJson("p2", "toc", "目录"),
      badPageJson,
      makeMockPageJson("p4", "content", "内容3"),
      makeMockPageJson("p5", "content", "内容4"),
      makeMockPageJson("p6", "content", "内容5"),
      makeMockPageJson("p7", "closing", "结尾"),
      goodPageJson, goodPageJson, goodPageJson,
    ];

    const result = await generate({
      provider: makeMockProvider(responses),
      answers: { topic: "自愈测试", mood: "tech", length: "short" },
      useAiBrief: false,
      constraints: { maxHealRounds: 1, maxPageRetries: 0 },
    });

    expect(result.deck).not.toBeNull();
    expect(result.deck!.pages.length).toBe(7);
    for (const page of result.deck!.pages) {
      expect(page.elements.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ════════════════════════════════ edit 模式 ════════════════════════════════

describe("edit() 编辑模式（核心场景）", () => {
  it("成功重写指定页", async () => {
    const deck = makeMockDeck();
    const rewrittenPage = makeMockPageJson("p1", "content", "修改后的标题");
    const result = await edit({
      provider: makeMockProvider([rewrittenPage]),
      deck, instruction: "把第1页的标题改成'修改后的标题'", targetPageId: "p1",
    });

    expect(result.success).toBe(true);
    expect(result.page).not.toBeNull();
    expect(result.page!.id).toBe("p1");
  });

  it("Director 从指令推断页码：第2页", async () => {
    const deck = makeMockDeck();
    const rewrittenPage = makeMockPageJson("p2", "content", "第二页修改");
    const result = await edit({
      provider: makeMockProvider([rewrittenPage]),
      deck, instruction: "第2页加一个图表",
    });

    expect(result.success).toBe(true);
    expect(result.page!.id).toBe("p2");
  });

  it("编辑后 deck 中非目标页保持不变", async () => {
    const deck = makeMockDeck();
    const originalPage2 = deck.pages[1];
    const rewrittenPageJson = makeMockPageJson("p1", "content", "新标题");
    const result = await edit({
      provider: makeMockProvider([rewrittenPageJson]),
      deck, instruction: "修改第1页", targetPageId: "p1",
    });

    expect(result.success).toBe(true);
    const page2InResult = result.deck!.pages.find((p) => p.id === "p2");
    expect(page2InResult).toEqual(originalPage2);
  });
});

// ════════════════════════════════ v3：InspectionReport 测试 ════════════════════════════════

describe("v3 InspectorAgent — InspectionReport", () => {
  it("合法 deck：返回 passed=true 的 InspectionReport", async () => {
    const deck = makeMockDeck();
    const agent = new InspectorAgent();
    const ctx: AgentContext = {
      sessionId: "test", mode: "generate", topic: "测试", deck,
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(true);
    const report = result.artifact as InspectionReport;
    expect(report.passed).toBe(true);
    expect(report.score).toBeGreaterThan(0.8);
    expect(report.errors).toEqual([]);
  });

  it("坏 deck：返回 ErrorLocation[] 结构化错误定位", async () => {
    const deck: Deck = {
      ...makeMockDeck(),
      pages: [{
        id: "p1", layout: "content", title: "坏页",
        elements: [{ id: "p1-bad", type: "unknown_type", rect: [64, 64, 800, 100], props: {} }],
      }],
    };
    const agent = new InspectorAgent();
    const ctx: AgentContext = {
      sessionId: "test", mode: "generate", topic: "测试", deck,
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(false);
    const report = result.artifact as InspectionReport;
    expect(report.passed).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);

    // v3：检查 ErrorLocation 结构
    const loc = report.errors[0];
    expect(loc.pageId).toBe("p1");
    expect(loc.elementId).toBe("p1-bad");
    expect(loc.rule).toBe("unknown-type");
    expect(loc.suggestion).toBeDefined();
  });

  it("编辑模式：校验单页", async () => {
    const deck = makeMockDeck();
    const page = deck.pages[0];
    const agent = new InspectorAgent();
    const ctx: AgentContext = {
      sessionId: "test", mode: "edit", topic: "测试", deck,
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
      handoff: { editedPage: page },
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(true);
    const report = result.artifact as InspectionReport;
    expect(report.passed).toBe(true);
  });
});

// ════════════════════════════════ v3：Session 会话控制测试 ════════════════════════════════

describe("v3 Session 会话控制器", () => {
  it("初始状态为 running", () => {
    const session = new Session();
    expect(session.status).toBe("running");
    expect(session.isCancelled).toBe(false);
  });

  it("cancel() 后状态变为 cancelled", () => {
    const session = new Session();
    session.cancel("测试取消");
    expect(session.status).toBe("cancelled");
    expect(session.isCancelled).toBe(true);
    expect(session.cancelReason).toBe("测试取消");
    expect(session.cancelToken.shouldCancel()).toBe(true);
  });

  it("pause()/resume() 状态切换", () => {
    const session = new Session();
    session.pause();
    expect(session.status).toBe("paused");
    session.resume();
    expect(session.status).toBe("running");
  });

  it("complete() 后状态变为 completed", () => {
    const session = new Session();
    session.complete();
    expect(session.status).toBe("completed");
  });

  it("cancelled 后 complete() 不改变状态", () => {
    const session = new Session();
    session.cancel();
    session.complete();
    expect(session.status).toBe("cancelled");
  });

  it("NEVER_CANCEL 永不取消", () => {
    expect(NEVER_CANCEL.shouldCancel()).toBe(false);
  });
});

// ════════════════════════════════ Session 集成测试（传入式 API） ════════════════════════════════

describe("Session 传入式取消：generate/edit 接收外部 session", () => {
  it("generate() 接收外部 session，调用方可在生成前取消", async () => {
    const session = new Session();
    session.cancel("测试取消");

    const result = await generate({
      provider: makeMockProvider([]),
      answers: { topic: "取消测试", mood: "tech", length: "short" },
      useAiBrief: false,
      session,
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("取消");
  });

  it("edit() 接收外部 session，调用方可在编辑前取消", async () => {
    const deck = makeMockDeck();
    const session = new Session();
    session.cancel();

    const result = await edit({
      provider: makeMockProvider([]),
      deck,
      instruction: "改第1页",
      targetPageId: "p1",
      session,
    });

    expect(result.cancelled).toBe(true);
    expect(result.success).toBe(false);
  });

  it("不传 session 时正常工作（内部创建临时 session）", async () => {
    const responses: string[] = [
      mockOutlineJson,
      ...Array.from({ length: 7 }, (_, i) => makeMockPageJson(`p${i + 1}`, "content", `页${i + 1}`)),
    ];

    const result = await generate({
      provider: makeMockProvider(responses),
      answers: { topic: "无 session 测试", mood: "tech", length: "short" },
      useAiBrief: false,
    });

    expect(result.success).toBe(true);
    expect(result.cancelled).toBeFalsy();
  });
});

// ════════════════════════════════ Agent 单元测试 ════════════════════════════════

describe("DirectorAgent", () => {
  it("生成模式 v3：产出 {brief, outline}", async () => {
    const agent = new DirectorAgent(makeFnProvider(() => mockOutlineJson), {
      topic: "测试", length: "auto",
    }, false);

    const ctx: AgentContext = {
      sessionId: "test", mode: "generate", topic: "测试",
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(true);
    const plan = result.artifact as { brief: unknown; outline: unknown };
    expect(plan.brief).toBeDefined();
    expect(plan.outline).toBeDefined();
  });

  it("编辑模式：从指令推断页 id", async () => {
    const deck = makeMockDeck();
    const agent = new DirectorAgent(makeFnProvider(() => "{}"));
    const ctx: AgentContext = {
      sessionId: "test", mode: "edit", topic: "改第2页", deck,
      instruction: "改第2页的图表",
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
    };

    const result = await agent.execute(ctx);
    const intent = result.artifact as { pageId: string; instruction: string };
    expect(intent.pageId).toBe("p2");
  });

  it("编辑模式：显式 targetPageId 优先", async () => {
    const deck = makeMockDeck();
    const agent = new DirectorAgent(makeFnProvider(() => "{}"));
    const ctx: AgentContext = {
      sessionId: "test", mode: "edit", topic: "改", deck,
      instruction: "随便改改", targetPageId: "p2",
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
    };

    const result = await agent.execute(ctx);
    const intent = result.artifact as { pageId: string; instruction: string };
    expect(intent.pageId).toBe("p2");
    expect(result.selfScore).toBe(1.0);
  });
});

describe("HealerAgent", () => {
  it("无错误时不修复", async () => {
    const deck = makeMockDeck();
    const agent = new HealerAgent(makeFnProvider(() => "{}"));
    const ctx: AgentContext = {
      sessionId: "test", mode: "generate", topic: "测试", deck,
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
      handoff: { report: { passed: true, errors: [], validation: { ok: true, errors: [], warnings: [] }, guard: { action: "pass", hits: [] }, score: 1.0 }, healRound: 0 },
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(true);
    expect(result.notes).toContain("无需修复");
  });

  it("minimal-fallback 策略：零 LLM 调用降级", async () => {
    const deck: Deck = {
      ...makeMockDeck(),
      pages: [{ ...makeMockDeck().pages[0], elements: [] }],
    };
    const agent = new HealerAgent(makeFnProvider(() => {
      throw new Error("不应该调用 LLM");
    }));

    const report: InspectionReport = {
      passed: false,
      errors: [{ pageId: "p1", rule: "empty-page", message: "页面无元素", suggestion: "添加至少一个元素" }],
      validation: { ok: false, errors: [], warnings: [] },
      guard: { action: "pass", hits: [] },
      score: 0,
    };

    const ctx: AgentContext = {
      sessionId: "test", mode: "generate", topic: "测试", deck,
      layouts: LAYOUTS, constraints: DEFAULT_CONSTRAINTS,
      handoff: { report, healRound: 2 },
    };

    const result = await agent.execute(ctx);
    expect(result.success).toBe(true);
    const healedDeck = result.artifact as Deck;
    const healedPage = healedDeck.pages.find((p) => p.id === "p1");
    expect(healedPage!.elements.length).toBeGreaterThanOrEqual(1);
  });
});
