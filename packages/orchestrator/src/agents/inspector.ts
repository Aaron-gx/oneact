/**
 * Inspector Agent（质量审查）— v3
 *
 * v3 关键改进：
 *   · 独占校验：返回完整 InspectionReport，Conductor 不再重复 validateDeck
 *   · ErrorLocation：将裸 Issue 转换为结构化错误定位，Healer 按定位精准修
 *
 * 两级校验（策划书 4.4 节核心要求）：
 *   · 预检（快速）：validateDeck / validatePage 公式估算，零 DOM 依赖
 *   · 终审（准确）：validateDeckMeasured 离屏真实测量，浏览器环境专用
 */
import { guardDeck, type GuardConfig, type GuardResult } from "@oneact/ai";
import { validateDeck, validatePage, type Deck, type Issue, type Page, type ValidationResult } from "@oneact/schema";
import type { Agent, AgentContext, AgentResult, ErrorLocation, InspectionReport } from "../types.js";

/** Issue → ErrorLocation 的转换规则表。 */
const RULE_SUGGESTIONS: Record<string, string> = {
  "unknown-type": "移除该元素或替换为合法类型（heading/text/bullet-list/chart 等）",
  "element-malformed": "补充完整的 rect 和 props 字段",
  "rect-out-of-bounds": "将 rect 调整到画布范围内（0-1280 × 0-720）",
  "missing-field": "补全缺失的必填字段",
  "too-many-elements": "减少元素数量到 12 个以内",
  "slot-unknown": "修正 slot 引用，使其匹配版式定义中的 slot 名称",
  "page-id-missing": "为页面添加唯一 id",
  "page-id-duplicate": "确保每个页面 id 唯一",
  "element-id-missing": "为元素添加唯一 id",
  "element-id-duplicate": "确保每个元素 id 唯一",
};

export class InspectorAgent implements Agent {
  readonly role = "inspector" as const;

  constructor(
    private readonly guardConfig?: GuardConfig,
    /** 离屏测量函数（浏览器环境注入 validateDeckMeasured，Node 环境不注入）。 */
    private readonly measureDeck?: (deck: Deck) => ValidationResult,
  ) {}

  async execute(ctx: AgentContext): Promise<AgentResult> {
    const start = Date.now();

    if (ctx.mode === "edit") {
      return this.inspectPage(ctx, start);
    }
    return this.inspectDeck(ctx, start);
  }

  /** 生成模式：全量校验 → InspectionReport。 */
  private async inspectDeck(ctx: AgentContext, start: number): Promise<AgentResult> {
    const deck = ctx.deck!;
    const layouts = ctx.layouts;

    // 第一级：公式估算预检（快速）
    let validation = validateDeck(deck, { layouts });

    // 第二级：离屏真实测量终审（浏览器环境，策划书 4.4）
    if (ctx.constraints.enableOffscreenMeasure && this.measureDeck) {
      const measured = this.measureDeck(deck);
      validation = {
        ok: measured.ok && validation.ok,
        errors: [...validation.errors, ...measured.errors],
        warnings: measured.warnings,
      };
    }

    // 内容安全扫描
    const guard = guardDeck(deck, this.guardConfig);

    // v3：将 Issue[] 转换为 ErrorLocation[]
    const errors = this.toErrorLocations(validation.errors);
    const score = this.score(validation, guard);
    const passed = validation.ok && guard.action !== "block";

    const report: InspectionReport = {
      validation,
      guard,
      errors,
      score,
      passed,
    };

    return {
      success: passed,
      artifact: report,
      selfScore: score,
      notes: [
        `${validation.errors.length}e / ${validation.warnings.length}w`,
        `guard: ${guard.action}`,
      ],
      durationMs: Date.now() - start,
    };
  }

  /** 编辑模式：只校验被修改的单页 → InspectionReport。 */
  private async inspectPage(ctx: AgentContext, start: number): Promise<AgentResult> {
    const page = ctx.handoff?.editedPage as Page | undefined;

    if (!page) {
      return { success: false, error: "编辑模式需要 editedPage", durationMs: Date.now() - start };
    }

    const issues = validatePage(page, { layouts: ctx.layouts });
    const validation: ValidationResult = {
      ok: !issues.some((i) => i.severity === "error"),
      errors: issues.filter((i) => i.severity === "error"),
      warnings: issues.filter((i) => i.severity === "warning"),
    };

    const errors = this.toErrorLocations(validation.errors);
    const score = this.score(validation, { action: "pass", hits: [], reason: undefined });
    const passed = validation.ok;

    const report: InspectionReport = {
      validation,
      guard: { action: "pass", hits: [], reason: undefined },
      errors,
      score,
      passed,
    };

    return {
      success: passed,
      artifact: report,
      selfScore: score,
      notes: [`${validation.errors.length}e / ${validation.warnings.length}w`],
      durationMs: Date.now() - start,
    };
  }

  /** v3：将裸 Issue[] 转换为结构化 ErrorLocation[]。 */
  private toErrorLocations(issues: Issue[]): ErrorLocation[] {
    return issues.map((issue) => ({
      pageId: issue.pageId ?? "unknown",
      elementId: issue.elementId,
      rule: issue.rule,
      message: issue.message,
      suggestion: RULE_SUGGESTIONS[issue.rule] ?? this.deriveSuggestion(issue),
    }));
  }

  /** 对于没有预设建议的规则，从 issue 内容推导一个通用建议。 */
  private deriveSuggestion(issue: Issue): string {
    if (issue.elementId) {
      return `检查元素 ${issue.elementId}：${issue.message}`;
    }
    return `修复问题：${issue.message}`;
  }

  /** 质量评分：错误权重 0.3，警告权重 0.05，高危安全命中权重 0.2。 */
  private score(validation: ValidationResult, guard: GuardResult): number {
    const e = validation.errors.length * 0.3;
    const w = validation.warnings.length * 0.05;
    const g = guard.hits.filter((h) => h.severity === "high").length * 0.2;
    return Math.max(0, 1 - e - w - g);
  }
}
