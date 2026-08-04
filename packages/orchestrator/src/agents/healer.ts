/**
 * Healer Agent（自愈修复）— v3
 *
 * v3 关键改进：
 *   · 接收 ErrorLocation[]（结构化错误定位），不再从裸字符串盲猜
 *   · 按定位精准修复：知道该修哪个页的哪个元素的什么问题
 *
 * 策略逐级升级：
 *   1. regenerate-page — 带结构化错误重写同页（复用 rewritePage）
 *   2. downgrade-layout — 降级到最简单的 content 版式 + 减少元素
 *   3. minimal-fallback — 最小可用版式兜底（只保留标题）
 *
 * 支持批量修复：一次性处理所有出错页。
 */
import { rewritePage, type LLMProvider, type SpecOptions } from "@oneact/ai";
import type { Deck, Page } from "@oneact/schema";
import type { Agent, AgentContext, AgentResult, ErrorLocation, InspectionReport } from "../types.js";

export type HealStrategy = "regenerate-page" | "downgrade-layout" | "minimal-fallback";

export class HealerAgent implements Agent {
  readonly role = "healer" as const;

  constructor(
    private readonly provider: LLMProvider,
    private readonly specOpts: SpecOptions = {},
  ) {}

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();
    const deck = ctx.deck!;
    const report = ctx.handoff?.report as InspectionReport | undefined;
    const healRound = (ctx.handoff?.healRound as number) ?? 0;

    if (!report || report.passed) {
      return { success: true, artifact: deck, notes: ["无需修复"], durationMs: Date.now() - start };
    }

    // v3：从 InspectionReport.errors 获取结构化错误定位
    const errorLocations: ErrorLocation[] = report.errors;

    // 根据当前轮次选择策略
    const strategy: HealStrategy = healRound === 0 ? "regenerate-page" : healRound === 1 ? "downgrade-layout" : "minimal-fallback";

    // 找出所有出错页（批量修复）
    const errorPageIds = new Set(errorLocations.map((e) => e.pageId));

    if (errorPageIds.size === 0) {
      return { success: false, artifact: deck, error: "全局错误无法定位到具体页面", durationMs: Date.now() - start };
    }

    // 并行修复所有出错页
    const healPromises = deck.pages.map(async (page) => {
      if (!errorPageIds.has(page.id)) return page;

      // v3：过滤出当前页的错误定位
      const pageErrors = errorLocations.filter((e) => e.pageId === page.id);
      return this.healPage(page, pageErrors, strategy, ctx);
    });

    const healedPages = await Promise.all(healPromises);
    const healedDeck: Deck = { ...deck, pages: healedPages };

    return {
      success: true,
      artifact: healedDeck,
      selfScore: 0.7,
      notes: [`${strategy}: 修复 ${errorPageIds.size} 页`],
      durationMs: Date.now() - start,
    };
  }

  /** 修复单页（v3：使用 ErrorLocation 精准构造修复指令）。 */
  private async healPage(
    page: Page,
    errors: ErrorLocation[],
    strategy: HealStrategy,
    ctx: AgentContext,
  ): Promise<Page> {
    if (strategy === "minimal-fallback") {
      return this.minimalFallback(page);
    }

    // v3：按 ErrorLocation 构造精准的修复指令
    const instruction = this.buildHealInstruction(page, errors, strategy);

    try {
      const result = await rewritePage({
        provider: this.provider,
        page,
        instruction,
        layouts: ctx.layouts,
        ...this.specOpts,
        modelTier: ctx.constraints.modelTier,
        maxRetries: 1,
      });
      return result.page ?? page;
    } catch {
      return page;
    }
  }

  /**
   * v3：根据 ErrorLocation 和策略构造精准的修复指令。
   *
   * 每个 ErrorLocation 都带有 rule + suggestion，Healer 把这些信息结构化地传递给 LLM，
   * 而不是让它从笼统的错误描述里盲猜。
   */
  private buildHealInstruction(page: Page, errors: ErrorLocation[], strategy: HealStrategy): string {
    const errorDetails = errors.map((e, i) => {
      const target = e.elementId ? `元素 "${e.elementId}"` : "整页";
      return `${i + 1}. ${target} — 规则[${e.rule}]：${e.message}${e.suggestion ? `\n   建议：${e.suggestion}` : ""}`;
    }).join("\n");

    if (strategy === "regenerate-page") {
      return `请修复以下校验问题后重新输出完整页面：\n${errorDetails}`;
    }

    // downgrade-layout: 要求简化
    return `页面有校验问题无法通过。请大幅简化：使用最基础的 content 版式，只保留核心标题和要点，去掉复杂元素。\n需修复的问题：\n${errorDetails}`;
  }

  /** 最小兜底：只保留标题，零 LLM 调用。 */
  private minimalFallback(page: Page): Page {
    const titleEl = page.elements.find((e) => e.type === "heading");
    return {
      ...page,
      elements: titleEl ? [titleEl] : [{
        id: `${page.id}-title`,
        type: "heading",
        rect: [64, 280, 1152, 110],
        props: { text: page.title ?? "（内容降级）" },
      }],
      layout: "content",
    };
  }
}
