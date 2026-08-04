/**
 * Generator Agent（内容生成）
 *
 * 双模式：
 *   · 生成模式：大纲 → 逐页生成 deck（复用 generateDeckStream，注入外部 outline 省一次调用）
 *   · 编辑模式：当前页 + 用户指令 → 整页重写（复用 rewritePage）
 *
 * 流式回调：生成模式下每页就绪立即回调，用户实时看到 PPT "长出来"。
 */
import {
  generateDeckStream,
  rewritePage,
  type LLMProvider,
  type SpecOptions,
} from "@oneact/ai";
import type { Deck, Page } from "@oneact/schema";
import type { Agent, AgentContext, AgentResult } from "../types.js";
import type { EditIntent } from "./director.js";

export class GeneratorAgent implements Agent {
  readonly role = "generator" as const;

  constructor(
    private readonly provider: LLMProvider,
    private readonly specOpts: SpecOptions = {},
    private readonly onPage?: (page: Page, index: number, total: number) => void,
  ) {}

  async execute(ctx: AgentContext): Promise<AgentResult> {
    return ctx.mode === "generate" ? this.generate(ctx) : this.edit(ctx);
  }

  /** 生成模式：大纲 → 逐页生成。 */
  private async generate(ctx: AgentContext, start = Date.now()): Promise<AgentResult> {
    const brief = ctx.brief!;

    // 如果有大纲 → 注入，省一次 generateOutline 调用
    // 如果没有 → 内部自动生成
    try {
      const result = await generateDeckStream({
        provider: this.provider,
        topic: ctx.topic,
        brief,
        outline: ctx.outline, // 关键：注入外部大纲，跳过冗余生成
        layouts: ctx.layouts,
        ...this.specOpts,
        modelTier: ctx.constraints.modelTier,
        maxRetries: ctx.constraints.maxPageRetries,
        onPage: (page, index, total) => {
          this.onPage?.(page, index, total);
        },
      });

      if (!result.deck) {
        return { success: false, error: `生成失败，重试 ${result.retries} 次`, durationMs: Date.now() - start };
      }

      return {
        success: true,
        artifact: result.deck,
        selfScore: result.result.ok ? 0.9 : 0.6,
        notes: [`${result.deck.pages.length} pages, ${result.retries} retries`],
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return { success: false, error: `生成异常: ${(e as Error).message}`, durationMs: Date.now() - start };
    }
  }

  /** 编辑模式：整页重写。 */
  private async edit(ctx: AgentContext, start = Date.now()): Promise<AgentResult> {
    const deck = ctx.deck!;
    const intent = ctx.handoff?.intent as EditIntent | undefined;

    if (!intent) {
      return { success: false, error: "编辑模式需要 intent（Director 产出）", durationMs: Date.now() - start };
    }

    const page = deck.pages.find((p) => p.id === intent.pageId);
    if (!page) {
      return { success: false, error: `页 ${intent.pageId} 不存在`, durationMs: Date.now() - start };
    }

    try {
      const result = await rewritePage({
        provider: this.provider,
        page,
        instruction: intent.instruction,
        layouts: ctx.layouts,
        ...this.specOpts,
        modelTier: ctx.constraints.modelTier,
        maxRetries: ctx.constraints.maxPageRetries,
      });

      if (!result.page) {
        return { success: false, error: "整页重写失败", durationMs: Date.now() - start };
      }

      return {
        success: true,
        artifact: result.page,
        selfScore: result.result.ok ? 0.85 : 0.5,
        notes: [`重写 ${intent.pageId}, ${result.retries} retries`],
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return { success: false, error: `重写异常: ${(e as Error).message}`, durationMs: Date.now() - start };
    }
  }
}
