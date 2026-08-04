/**
 * @oneact/ai — 生成协议（策划书 7.1）
 *
 * 1. 两段式：先大纲（版式 + 标题 + 摘要）→ 确认 → 再逐页/整份生成。
 * 2. 局部修改 = 整页重写：输入当前 page + 指令 → 完整新 page。不做 diff。
 * 3. 生成后必过校验器：不过 → 带错误定位自动重试（默认上限 2）；仍不过如实返回，不静默带病。
 */
import { LAYOUTS } from "@oneact/layouts";
import {
  formatIssues,
  migrate,
  validateDeck,
  validatePage,
  type Deck,
  type Issue,
  type LayoutDef,
  type Page,
  type ValidationResult,
} from "@oneact/schema";
import type { Brief } from "./brief.js";
import type { ChatMessage, LLMProvider, TokenUsage } from "./provider.js";
import { buildSpec, type SpecOptions } from "./spec.js";

export { buildSpec } from "./spec.js";

/** 累加 token 用量的闭包：一次生成/重写包含多次 provider.generate（大纲 + 逐页 + 自愈重试），逐次累加。 */
function makeUsageAccumulator(): { onUsage: (u: TokenUsage) => void; snapshot: () => TokenUsage } {
  const u: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  return {
    onUsage: (x) => {
      u.promptTokens += x.promptTokens;
      u.completionTokens += x.completionTokens;
      u.totalTokens += x.totalTokens;
    },
    snapshot: () => ({ ...u }),
  };
}

/** 从 LLM 输出中提取 JSON（兼容 markdown 代码块 / 前后缀解释文本）。 */
export function extractJson(text: string): string {
  let t = (text || "").trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function issuesToResult(issues: Issue[]): ValidationResult {
  return {
    ok: !issues.some((i) => i.severity === "error"),
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warning"),
  };
}

// ──────────────────────────── 大纲（两段式·第一步）────────────────────────────

export interface OutlineItem {
  layout: string;
  title: string;
  summary: string;
}
export interface Outline {
  title: string;
  theme: string;
  pages: OutlineItem[];
}

export async function generateOutline(opts: GenerateBaseOptions, onUsage?: (u: TokenUsage) => void): Promise<Outline> {
  const spec = buildSpec(specOpts(opts));
  const brief = opts.brief;
  const sysBrief = brief
    ? `\n\n【策划简报】风格与结构已定：theme 必须用 "${brief.theme}"；目标 ${brief.pageCount} 页；受众 ${brief.audience ?? "通用"}；目的 ${brief.purpose ?? "通用"}。结构建议（你可微调版式与标题，但页数≈${brief.pageCount}）：${JSON.stringify(
        brief.sections,
      )}。逐页视觉变化指引：${brief.styleNotes}`
    : "";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        spec +
        sysBrief +
        '\n\n【第一步·大纲】只输出大纲 JSON：{"title","theme","pages":[{"layout","title","summary"}]}，不要完整页面元素。',
    },
    {
      role: "user",
      content: brief
        ? `主题：${opts.topic}\n请严格按简报生成大纲：共 ${brief.pageCount} 页，theme 字段必须填 "${brief.theme}"，cover 在首、closing 在尾。`
        : `主题：${opts.topic}\n请生成大纲（约 ${opts.pageCount ?? 8} 页）。`,
    },
  ];
  const raw = await opts.provider.generate(messages, { responseFormatJson: true, temperature: 0.5, onUsage });
  const outline = JSON.parse(extractJson(raw)) as Outline;
  // 简报模式下强制主题（防 LLM 不听话），保证「按主题选风格」生效
  if (brief) outline.theme = brief.theme;
  return outline;
}

// ──────────────────────────── 整份生成（带自愈）────────────────────────────

export interface GenerateBaseOptions extends SpecOptions {
  provider: LLMProvider;
  topic: string;
  layouts?: Record<string, LayoutDef>;
  maxRetries?: number;
  /** 策划简报（WS3 导演 Agent）：驱动主题/页数/结构与逐页变化；缺省走老路径。 */
  brief?: Brief;
}

export interface GenerateDeckOptions extends GenerateBaseOptions {
  /**
   * 预生成的大纲（可选）。传入时跳过内部 generateOutline 调用，
   * 直接用此大纲逐页生成——省 1 次 LLM 调用 + token。
   * 缺省时自动调 generateOutline 生成。
   */
  outline?: Outline;
  /** 大纲就绪后回调（暴露总页数，便于外部显示定量进度）。 */
  onOutline?: (totalPages: number) => void;
  /** 每页就绪回调（流式按页预览钩子；total 为大纲总页数）。 */
  onPage?: (page: Page, index: number, total: number) => void;
}

export interface GenerateDeckResult {
  deck: Deck | null;
  result: ValidationResult;
  /** 实际重试次数（0 表示首次即通过）。 */
  retries: number;
  /** 本次生成累计的真实 token 用量（输入 + 输出）。 */
  usage?: TokenUsage;
}

export async function generateDeck(opts: GenerateDeckOptions): Promise<GenerateDeckResult> {
  const layouts = opts.layouts ?? LAYOUTS;
  const spec = buildSpec(specOpts(opts));
  const messages: ChatMessage[] = [
    { role: "system", content: spec },
    { role: "user", content: `主题：${opts.topic}\n请直接输出完整的 slides.json（约 ${opts.pageCount ?? 8} 页）。` },
  ];
  const acc = makeUsageAccumulator();
  const healed = await healLoop<Deck>(
    opts.provider,
    messages,
    (parsed) => {
      const { deck } = migrate(parsed as Deck);
      return { obj: deck, result: validateDeck(deck, { layouts }) };
    },
    opts.maxRetries ?? 2,
    (deck) => opts.onPage && deck.pages.forEach((p, i) => opts.onPage?.(p, i, deck.pages.length)),
    acc.onUsage,
  );
  return { deck: healed.obj, result: healed.result, retries: healed.retries, usage: acc.snapshot() };
}

/**
 * 流式按页生成（策划书 7.1.5）：先大纲 → 逐页生成，每生成一页立即校验并 onPage 回调，
 * 用户实时看到 PPT「长出来」。可中途观察/取消，比 generateDeck 更贴合"按页预览"。
 */
export async function generateDeckStream(opts: GenerateDeckOptions): Promise<GenerateDeckResult> {
  const layouts = opts.layouts ?? LAYOUTS;
  const acc = makeUsageAccumulator();
  // 有外部大纲 → 直接用；无 → 内部生成
  const outline = opts.outline ?? (await generateOutline(opts, acc.onUsage));
  opts.onOutline?.(outline.pages.length);
  const brief = opts.brief;
  const deck: Deck = {
    formatVersion: 1,
    meta: { title: outline.title || opts.topic, theme: brief?.theme ?? opts.theme ?? "yuanshan-blue", size: "16:9" },
    pages: [],
  };
  let totalRetries = 0;
  const cap = opts.maxRetries ?? 2;

  for (let i = 0; i < outline.pages.length; i++) {
    const item = outline.pages[i];
    const styleInject = brief?.styleNotes
      ? `\n\n【本份风格指引（逐页要有变化，勿每页同一构图）】${brief.styleNotes}`
      : "";
    const audInject = brief?.audience
      ? `\n受众：${brief.audience}；目的：${brief.purpose ?? "通用"}——语言风格与深度据此调整。`
      : "";
    const spec =
      buildSpec(specOpts(opts)) +
      styleInject +
      `\n\n【逐页生成】只输出单个 page 对象 JSON（含 id/layout/title/elements）。参考版式：${item.layout}；标题：${item.title}。优先用复合语义组件（kpi/stat-grid/feature-card/timeline/process/comparison/callout 等）。`;
    const messages: ChatMessage[] = [
      { role: "system", content: spec },
      {
        role: "user",
        content: `生成第 ${i + 1}/${outline.pages.length} 页（${item.layout}）— 标题：${item.title}${audInject}\n内容要点：${item.summary}`,
      },
    ];
    const healed = await healLoop<Page>(
      opts.provider,
      messages,
      (parsed) => {
        const page = parsed as Page;
        return { obj: page, result: issuesToResult(validatePage(page, { layouts })) };
      },
      cap,
      undefined,
      acc.onUsage,
    );
    // 无论是否校验通过都占位（保证 deck.pages[i] 与 outline.pages[i] 对齐），残缺/空页交给下方补生成
    const page: Page =
      (healed.obj!) || ({ id: `p${i + 1}`, layout: item.layout, title: item.title, elements: [] });
    page.id = `p${i + 1}`;
    deck.pages.push(page);
    opts.onPage?.(page, i, outline.pages.length); // 流式：每页就绪立即回调，外部可即时渲染
    totalRetries += Math.min(healed.retries, cap);
  }

  // 第二轮（补生成）：对仍「空白或校验失败」的页，按原大纲上下文重新生成，避免空白页。
  // isAcceptable = 有元素且无硬错误。
  const isAcceptable = (p: Page): boolean => {
    if (!p || !Array.isArray(p.elements) || p.elements.length === 0) return false;
    return issuesToResult(validatePage(p, { layouts })).ok;
  };
  for (let round = 0; round < 2; round++) {
    const failedIdx: number[] = [];
    deck.pages.forEach((p, i) => {
      if (!isAcceptable(p)) failedIdx.push(i);
    });
    if (failedIdx.length === 0) break;
    for (const i of failedIdx) {
      const item = outline.pages[i];
      if (!item) continue;
      const spec =
        buildSpec(specOpts(opts)) +
        `\n\n【补生成·重要】上一版该页校验失败或为空白。请务必输出**完整、合法**的单个 page 对象 JSON：必须含 id/layout/title/elements；每个元素必须有合法 rect([x,y,w,h]) 与完整 props（bullet-list 必须有 items、table 必须有 columns/rows、chart 必须有 data.categories/series）。参考版式：${item.layout}；标题：${item.title}。优先用复合语义组件。`;
      const messages: ChatMessage[] = [
        { role: "system", content: spec },
        {
          role: "user",
          content: `重新生成第 ${i + 1}/${outline.pages.length} 页（${item.layout}）— 标题：${item.title}\n内容要点：${item.summary}`,
        },
      ];
      const rehealed = await healLoop<Page>(
        opts.provider,
        messages,
        (parsed) => {
          const pg = parsed as Page;
          return { obj: pg, result: issuesToResult(validatePage(pg, { layouts })) };
        },
        cap,
        undefined,
        acc.onUsage,
      );
      totalRetries += Math.min(rehealed.retries, cap);
      if (rehealed.obj && isAcceptable(rehealed.obj)) {
        rehealed.obj.id = `p${i + 1}`;
        deck.pages[i] = rehealed.obj;
        opts.onPage?.(rehealed.obj, i, outline.pages.length); // 更新该页预览
      }
    }
  }

  const result = validateDeck(deck, { layouts });
  return { deck, result, retries: totalRetries, usage: acc.snapshot() };
}

// ──────────────────────────── 局部重写（整页重写）────────────────────────────

export interface RewritePageOptions extends SpecOptions {
  provider: LLMProvider;
  page: Page;
  instruction: string;
  layouts?: Record<string, LayoutDef>;
  maxRetries?: number;
}

export interface RewritePageResult {
  page: Page | null;
  result: ValidationResult;
  retries: number;
  /** 本次重写累计的真实 token 用量。 */
  usage?: TokenUsage;
}

export async function rewritePage(opts: RewritePageOptions): Promise<RewritePageResult> {
  const layouts = opts.layouts ?? LAYOUTS;
  const spec =
    buildSpec(specOpts(opts)) +
    "\n\n【整页重写】你只重写一页。输出单个 page 对象 JSON（含 id/layout/title/transition/background/notes/elements）。保留用户未提及的元素，整页重写，不要做 diff。";
  const messages: ChatMessage[] = [
    { role: "system", content: spec },
    {
      role: "user",
      content: `当前页 JSON：\n${JSON.stringify(opts.page)}\n\n修改指令：${opts.instruction}\n\n请输出修改后的完整 page JSON。`,
    },
  ];
  const acc = makeUsageAccumulator();
  const healed = await healLoop<Page>(
    opts.provider,
    messages,
    (parsed) => {
      const page = parsed as Page;
      return { obj: page, result: issuesToResult(validatePage(page, { layouts })) };
    },
    opts.maxRetries ?? 2,
    undefined,
    acc.onUsage,
  );
  return { page: healed.obj, result: healed.result, retries: healed.retries, usage: acc.snapshot() };
}

// ──────────────────────────── 自愈循环 ────────────────────────────

async function healLoop<T>(
  provider: LLMProvider,
  messages: ChatMessage[],
  parse: (raw: unknown) => { obj: T; result: ValidationResult },
  maxRetries: number,
  onSuccess?: (obj: T) => void,
  onUsage?: (u: TokenUsage) => void,
): Promise<{ obj: T | null; result: ValidationResult; retries: number }> {
  let conversation = messages;
  let lastResult: ValidationResult | null = null;
  let lastObj: T | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const raw = await provider.generate(conversation, { responseFormatJson: true, temperature: 0.4, onUsage });
    const jsonText = extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const msg = (e as Error).message;
      lastResult = {
        ok: false,
        errors: [{ severity: "error", rule: "json-parse", message: "输出非合法 JSON：" + msg }],
        warnings: [],
      };
      lastObj = null;
      conversation = [
        ...messages,
        { role: "assistant", content: raw },
        { role: "user", content: `上一次输出不是合法 JSON（${msg}）。请只输出一个合法 JSON 对象，不要代码块或解释。` },
      ];
      continue;
    }
    const { obj, result } = parse(parsed);
    lastObj = obj;
    lastResult = result;
    if (result.ok) {
      onSuccess?.(obj);
      return { obj, result, retries: attempt };
    }
    conversation = [
      ...messages,
      { role: "assistant", content: raw },
      { role: "user", content: `校验未通过，请按下列问题修复后重新输出完整 JSON：\n${formatIssues(result)}` },
    ];
  }
  return { obj: lastObj, result: lastResult!, retries: maxRetries + 1 };
}

function specOpts(opts: SpecOptions): SpecOptions {
  return { theme: opts.theme, pageCount: opts.pageCount, modelTier: opts.modelTier, skills: opts.skills };
}
