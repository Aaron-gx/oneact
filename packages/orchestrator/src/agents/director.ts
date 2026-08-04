/**
 * Director Agent（需求理解）— v3
 *
 * v3 关键改进：
 *   · 生成模式全权负责 Brief + Outline（大纲不再散落在 Conductor 里）
 *   · 职责边界清晰：Director = 规划层，Generator = 执行层
 *
 * 双模式：
 *   · 生成模式：表单答案 → { brief, outline }（复用 brief.ts + generate.ts）
 *   · 编辑模式：解析用户自然语言指令，推断改哪页、改什么
 */
import {
  buildBriefFromAnswers,
  draftBriefWithAi,
  generateOutline,
  type Brief,
  type BriefAnswers,
  type LLMProvider,
  type Outline,
} from "@oneact/ai";
import type { Deck } from "@oneact/schema";
import type { Agent, AgentContext, AgentResult } from "../types.js";

/** 编辑模式意图解析结果。 */
export interface EditIntent {
  /** 要修改的页 id。 */
  pageId: string;
  /** 提炼给 Generator 的指令。 */
  instruction: string;
}

/** v3：生成模式的联合产物（Brief + Outline）。 */
export interface DirectorPlan {
  brief: Brief;
  outline: Outline;
}

export class DirectorAgent implements Agent {
  readonly role = "director" as const;

  constructor(
    private readonly provider: LLMProvider,
    private readonly answers?: BriefAnswers,
    private readonly useAi = true,
  ) {}

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();

    if (ctx.mode === "generate") {
      return this.generatePlan(ctx, start);
    } else {
      return this.parseEditIntent(ctx, start);
    }
  }

  /** v3 生成模式：产出 { brief, outline } 联合产物。 */
  private async generatePlan(ctx: AgentContext, start: number): Promise<AgentResult> {
    const answers = this.answers ?? {
      topic: ctx.topic,
      length: "auto" as const,
    };

    // Step 1: Brief
    let brief: Brief;
    if (!this.useAi) {
      brief = buildBriefFromAnswers(answers);
    } else {
      try {
        brief = await draftBriefWithAi(this.provider, answers);
      } catch {
        brief = buildBriefFromAnswers(answers);
      }
    }

    // Step 2: Outline（v3：由 Director 负责，不再散落在 Conductor）
    let outline: Outline;
    try {
      outline = await generateOutline(
        { provider: this.provider, topic: ctx.topic, brief },
      );
    } catch {
      // 大纲生成失败 → 用 brief 构造最小大纲兜底
      outline = {
        title: brief.title,
        theme: brief.theme,
        pages: brief.sections.map((s, i) => ({
          layout: s.layout ?? "content",
          title: s.title ?? `第${i + 1}页`,
          summary: s.hint ?? "",
        })),
      };
    }

    const plan = { brief, outline };

    return {
      success: true,
      artifact: plan as Record<string, unknown>,
      selfScore: brief.sections.length >= 3 && outline.pages.length >= 3 ? 0.85 : 0.6,
      notes: [`brief: ${brief.sections.length} sections, outline: ${outline.pages.length} pages`],
      durationMs: Date.now() - start,
    };
  }

  /** 编辑模式：解析用户指令，推断改哪页。 */
  private async parseEditIntent(ctx: AgentContext, start: number): Promise<AgentResult> {
    const deck = ctx.deck!;
    const instruction = ctx.instruction ?? "";

    // 优先使用显式指定的 targetPageId
    if (ctx.targetPageId && deck.pages.some((p) => p.id === ctx.targetPageId)) {
      return {
        success: true,
        artifact: { pageId: ctx.targetPageId, instruction },
        selfScore: 1.0,
        durationMs: Date.now() - start,
      };
    }

    // 从指令中推断页 id（匹配"第N页"模式）
    const pageMatch = /第\s*(\d+)\s*页/.exec(instruction);
    if (pageMatch) {
      const pageNum = parseInt(pageMatch[1], 10);
      const page = deck.pages[pageNum - 1];
      if (page) {
        return {
          success: true,
          artifact: { pageId: page.id, instruction },
          selfScore: 0.9,
          durationMs: Date.now() - start,
        };
      }
    }

    // 如果只有一页，直接改它
    if (deck.pages.length === 1) {
      return {
        success: true,
        artifact: { pageId: deck.pages[0].id, instruction },
        selfScore: 0.8,
        durationMs: Date.now() - start,
      };
    }

    // 无法推断 → 默认改第一页并附带警告
    return {
      success: true,
      artifact: { pageId: deck.pages[0].id, instruction },
      selfScore: 0.3,
      notes: ["无法从指令中确定目标页，默认选择第一页"],
      durationMs: Date.now() - start,
    };
  }
}
