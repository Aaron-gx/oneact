/**
 * @oneact/ai — 策划简报 Brief（WS3 导演 Agent 的大脑）
 *
 * 生成管线从「topic→直出」升级为「brief→大纲→逐页」。Brief 承载受众/目的/风格/长度/结构，
 * 由三种途径产生（任选）：
 *   · buildBriefFromAnswers() — 表单答案 → Brief，确定性，零 token（默认灵动岛问卷模式）
 *   · draftBriefWithAi()      — 1 次 LLM 调用，把表单答案润色成更专业的 Brief（「✦ 生成创意简报」）
 *   · reviseBriefWithAi()     — 1 次 LLM 调用，按用户对话消息修订 Brief（对话模式）
 *
 * Brief 驱动大纲（决定主题 + 页数 + 结构）与逐页生成（styleNotes 指引逐页变化），
 * 从而根除「千篇一律配色」与「固定 8 页」。
 */
import { extractJson } from "./generate.js";
import type { ChatMessage, LLMProvider } from "./provider.js";
import type { Mood } from "@oneact/schema";
import type { ComposedSkill } from "@oneact/skills";

// Mood 已下沉到 @oneact/schema（与 theme 体系同源）；此处 re-export 保持
// `import { Mood } from "@oneact/ai"` 的既有用法兼容（briefing.ts / 测试零改）。
export type { Mood };

// ──────────────────────────────── 类型 ────────────────────────────────
// 注：Mood 类型已下沉到 @oneact/schema，见文件顶部 re-export。

/** 需求澄清表单答案（灵动岛问卷收集）。 */
export interface BriefAnswers {
  topic: string;
  audience?: string;
  purpose?: string;
  /** 风格/情绪；"auto" 表示由主题自动推断 */
  mood?: Mood | "auto";
  length?: "auto" | "short" | "standard" | "detailed";
  /** 用户指定必含的要点/章节 */
  points?: string[];
}

/** 大纲章节建议（指导 outline 生成，非死板）。 */
export interface BriefSection {
  /** 建议版式 */
  layout: string;
  /** 建议标题（可空，交大纲 AI 定） */
  title?: string;
  /** 该页要点提示 */
  hint?: string;
}

export interface Brief {
  topic: string;
  title: string;
  theme: string;
  mood: Mood;
  audience?: string;
  purpose?: string;
  pageCount: number;
  sections: BriefSection[];
  /** 给逐页生成的风格/逐页变化指引 */
  styleNotes: string;
}

// ──────────────────────────────── 主题→风格映射 ────────────────────────────────

/** 关键词 → 情绪（按优先级匹配；首个命中胜出）。 */
const MOOD_KEYWORDS: { mood: Mood; re: RegExp }[] = [
  { mood: "medical", re: /医疗|医学|健康|医院|临床|药品|护理|患者|疾病|治疗|医药|中医|中药|药材/ },
  { mood: "traditional", re: /传统|文化|国学|诗词|节日|春节|政务|党建|红色|非遗|历史|古|中华/ },
  { mood: "nature", re: /环境|生态|自然|可持续|绿色|碳|环保|农业|植物|动物|气候/ },
  {
    mood: "tech",
    re: /AI|人工智能|机器学习|算法|编程|代码|软件|互联网|数据|云|区块链|科技|数字化|Python|Java|系统|架构|大模型|智能/,
  },
  { mood: "academic", re: /学术|论文|研究|科研|建模|数学|物理|化学|生物|实验|课题|毕业|答辩|课程|教学/ },
  { mood: "ocean", re: /金融|财务|经济|投资|股票|银行|证券|保险|报表|营收|商业计划|融资/ },
  { mood: "elegant", re: /设计|品牌|发布会|产品发布|高端|奢侈|艺术|美学/ },
  { mood: "vibrant", re: /营销|活动|推广|生活方式|美食|旅游|时尚|运动|游戏|娱乐/ },
  { mood: "sakura", re: /儿童|母婴|女性|少女|可爱|萌|早教|育儿/ },
  { mood: "sunset", re: /派对|庆典|狂欢|暖场|年会|晚会|节日/ },
];

const MOOD_THEME: Record<Mood, string> = {
  tech: "tech-noir",
  business: "yuanshan-blue",
  academic: "ink-green",
  vibrant: "warm-orange",
  minimal: "mono-slate",
  traditional: "crimson-gold",
  nature: "forest",
  medical: "medical-mint",
  ocean: "ocean",
  elegant: "aurora-purple",
  sunset: "sunset",
  sakura: "sakura",
};

const MOOD_LABEL: Record<Mood, string> = {
  tech: "科技深色",
  business: "商务远山蓝",
  academic: "学术墨绿",
  vibrant: "活力暖橙",
  minimal: "极简灰",
  traditional: "赤金中国风",
  nature: "森林青",
  medical: "医疗薄荷",
  ocean: "深海蓝",
  elegant: "极光紫",
  sunset: "日落",
  sakura: "樱粉",
};

const LENGTH_PAGES: Record<NonNullable<BriefAnswers["length"]>, number> = {
  auto: 11,
  short: 7,
  standard: 11,
  detailed: 16,
};

export function suggestMood(topic: string): Mood {
  // 按命中关键词数量计分（解决「Python 数学建模」这类多领域词的归属：建模×2 胜过 Python×1）。
  // 平局时按数组顺序（medical/traditional/nature/tech/...）取先者。
  let best: Mood = "business";
  let bestScore = 0;
  for (const k of MOOD_KEYWORDS) {
    // 原正则无 g 标志 → match 只返首个；这里用带 g 的副本计数。
    const score = (topic.match(new RegExp(k.re.source, "g")) || []).length;
    if (score > bestScore) {
      bestScore = score;
      best = k.mood;
    }
  }
  return best;
}
export function moodTheme(mood: Mood): string {
  return MOOD_THEME[mood] ?? "yuanshan-blue";
}
export function moodLabel(mood: Mood): string {
  return MOOD_LABEL[mood] ?? mood;
}

// ──────────────────────────────── 确定性 Brief 构建（零 token）────────────────────────────────

const CONTENT_LAYOUT_POOL = [
  "content",
  "dashboard",
  "comparison",
  "process",
  "timeline",
  "three-card",
  "stats-grid",
  "feature-list",
];

/** 表单答案 → Brief（默认路径，无 LLM 调用）。结构骨架交大纲 AI 填实标题。 */
export function buildBriefFromAnswers(a: BriefAnswers): Brief {
  const mood: Mood = !a.mood || a.mood === "auto" ? suggestMood(a.topic) : a.mood;
  const theme = moodTheme(mood);
  const pageCount = LENGTH_PAGES[a.length ?? "auto"] ?? 11;
  const points = a.points ?? [];

  const sections: BriefSection[] = [];
  sections.push({ layout: "cover", title: a.topic });
  if (pageCount >= 8) sections.push({ layout: "toc", title: "目录" });

  const contentN = Math.max(1, pageCount - sections.length - 1); // 留一页给结尾
  for (let i = 0; i < contentN; i++) {
    sections.push({
      layout: CONTENT_LAYOUT_POOL[i % CONTENT_LAYOUT_POOL.length],
      hint: points[i] ?? "",
    });
  }
  sections.push({ layout: "closing", title: "总结" });

  return {
    topic: a.topic,
    title: a.topic,
    theme,
    mood,
    audience: a.audience,
    purpose: a.purpose,
    pageCount,
    sections,
    styleNotes: buildStyleNotes(mood, a.purpose),
  };
}

function buildStyleNotes(mood: Mood, purpose?: string): string {
  const base =
    "封面与结尾页用渐变背景（取主题主色→强调色，135°）；章节/分隔页可用浅色调底；内容页白底（深色主题用深底）+ 主色点缀。" +
    "逐页构图要有变化：不要每页同一布局，交替使用「左标题右内容」「上图下文」「数据卡片网格」「时间线/流程」等，形成节奏。" +
    "优先用复合语义组件（kpi/stat-grid/feature-card/timeline/process/comparison/callout 等）而非手摆 shape+文字。";
  const byMood: Partial<Record<Mood, string>> = {
    tech: "科技感：深底 + 霓虹主色 + 几何线条装饰；数据多用大数字 + 图表。",
    traditional: "中国风：可加竖排标题、印章式装饰、留白意境；忌花哨。",
    minimal: "极简：大量留白，字号阶梯分明，每页只讲一件事。",
    elegant: "高级感：大图/大字 + 金色点缀，强对比。",
    academic: "学术：信息密度适中，图表/公式规范，配色克制。",
  };
  const byPurpose = purpose
    ? `演示目的为「${purpose}」，据此调整侧重（汇报重数据、教学重流程、路演重故事与愿景）。`
    : "";
  return [base, byMood[mood] ?? "", byPurpose].filter(Boolean).join(" ");
}

// ──────────────────────────────── Skill 应用（仲裁）────────────────────────────────

/**
 * 把已叠加的 skill（ComposedSkill）应用到 Brief，做「用户显式输入优先于 skill」的仲裁。
 * 在 briefing 的 compose 之后、onConfirm 之前调用（那里同时持有用户输入与 composed）。
 *
 * 仲裁优先级（用户显式 > skill > 原推断）：
 *   · pageCount：用户 length≠auto → LENGTH_PAGES[length]；否则 skill.pageCount；否则原值
 *   · mood：用户 mood≠auto → 用户；否则 skill.preferredMood；否则原值（已 suggestMood）
 *   · theme：skill.preferredTheme 直配；否则 moodTheme(mood)
 *   · sections：skill.structure 非空则覆盖（SkillSection↔BriefSection 同构，结构化赋值）
 *   · styleNotes：在原值后追加 skill 的（compose 已按维度标签分块）
 */
export function applySkill(answers: BriefAnswers, brief: Brief, composed: ComposedSkill): Brief {
  const next: Brief = { ...brief };
  // 页数
  if (answers.length && answers.length !== "auto") {
    next.pageCount = LENGTH_PAGES[answers.length];
  } else if (composed.pageCount) {
    next.pageCount = composed.pageCount;
  }
  // mood：用户显式优先
  const userMood = answers.mood && answers.mood !== "auto" ? answers.mood : undefined;
  if (userMood) {
    next.mood = userMood;
  } else if (composed.preferredMood) {
    next.mood = composed.preferredMood as Mood;
  }
  // theme：skill 直配 或 按 mood 解析
  next.theme = composed.preferredTheme ?? moodTheme(next.mood);
  // 结构骨架
  if (composed.structure && composed.structure.length > 0) {
    next.sections = composed.structure.map((s) => ({ ...s }));
  }
  // 风格指引：追加（保留通用指引 + skill 场景指引）
  if (composed.styleNotes) {
    next.styleNotes = brief.styleNotes ? `${brief.styleNotes} ${composed.styleNotes}` : composed.styleNotes;
  }
  return next;
}

// ──────────────────────────────── AI Brief（起草 / 修订）────────────────────────────────

const BRIEF_SYSTEM = `你是「一幕 OneAct」的资深策划导演。请把用户的模糊需求，转化为一份结构清晰、可直接驱动生成的「创意简报 Brief」（JSON）。

可用主题（按风格）：远山蓝(商务) / 墨绿(学术) / 暖橙(活力) / tech-noir 科技深色(科技/AI) / aurora-purple 极光紫(高端/品牌) / forest 森林青(自然/环保) / crimson-gold 赤金(传统/政务) / ocean 深海蓝(金融/数据) / sakura 樱粉(生活/教育) / mono-slate 极简灰(Apple风) / sunset 日落(营销) / medical-mint 医疗薄荷(医疗/健康)。
可用版式：cover 封面 / toc 目录 / section-divider 章节分隔 / content 标题+内容 / hero 单内容 / dashboard 仪表盘 / comparison 对比 / process 流程 / timeline 时间线 / three-card 三卡片 / stats-grid 统计网格 / feature-list 特性列表 / data 数据页 / quote 引用 / closing 结尾。
可用复合组件（优先用）：kpi / stat-grid / feature-card / feature-list / timeline / process / comparison / section-title / callout / badge / divider / avatar。

只输出一个 JSON 对象，不要代码块或解释，结构：
{"topic","title"(精炼有力的演示标题),"theme"(从上面主题里选一个最贴合的),"mood"(tech|business|academic|vibrant|minimal|traditional|nature|medical|ocean|elegant),"audience","purpose","pageCount"(6-18 整数，按内容复杂度),"sections":[{"layout","title","hint"}](封面→可选目录→3-8 个内容页(选合适版式)→结尾，长度与 pageCount 一致),"styleNotes"(逐页视觉变化与侧重指引，一句话)}`;

function parseBrief(raw: string): Brief {
  const obj = JSON.parse(extractJson(raw)) as Partial<Brief>;
  return {
    topic: obj.topic ?? "",
    title: obj.title ?? obj.topic ?? "",
    theme: obj.theme ?? "yuanshan-blue",
    mood: obj.mood! ?? "business",
    audience: obj.audience,
    purpose: obj.purpose,
    pageCount: Math.max(4, Math.min(20, Math.round(obj.pageCount ?? 11))),
    sections: Array.isArray(obj.sections) ? obj.sections : [],
    styleNotes: obj.styleNotes ?? "",
  };
}

/** 表单答案 → AI 润色后的专业 Brief（1 次 LLM 调用）。 */
export async function draftBriefWithAi(provider: LLMProvider, answers: BriefAnswers): Promise<Brief> {
  const fallback = buildBriefFromAnswers(answers);
  const messages: ChatMessage[] = [
    { role: "system", content: BRIEF_SYSTEM },
    {
      role: "user",
      content:
        `主题：${answers.topic}\n` +
        `受众：${answers.audience ?? "未指定"}\n` +
        `目的：${answers.purpose ?? "未指定"}\n` +
        `风格倾向：${answers.mood && answers.mood !== "auto" ? moodLabel(answers.mood) : "由你判断"}\n` +
        `长度：${answers.length ?? "auto"}\n` +
        `必含要点：${(answers.points ?? []).join("；") || "无"}\n` +
        `请输出创意简报 JSON。`,
    },
  ];
  try {
    const raw = await provider.generate(messages, { responseFormatJson: true, temperature: 0.5 });
    return parseBrief(raw);
  } catch {
    return fallback; // AI 失败回退确定性 Brief，保证可用
  }
}

/** 按用户的对话消息修订 Brief（对话模式，可多次调用）。 */
export async function reviseBriefWithAi(provider: LLMProvider, brief: Brief, userMessage: string): Promise<Brief> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: BRIEF_SYSTEM + "\n\n你现在基于已有 Brief，按用户的新要求修订后重新输出完整 Brief JSON。",
    },
    {
      role: "user",
      content: `当前 Brief：\n${JSON.stringify(brief)}\n\n用户的新要求：${userMessage}\n\n请输出修订后的完整 Brief JSON。`,
    },
  ];
  try {
    const raw = await provider.generate(messages, { responseFormatJson: true, temperature: 0.4 });
    return parseBrief(raw);
  } catch {
    return brief; // 失败保留原 brief
  }
}
