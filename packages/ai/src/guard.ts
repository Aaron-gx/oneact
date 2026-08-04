/**
 * @oneact/ai — 内容安全护栏（策划书 AI 工程化补强 #6）
 *
 * 三层防护：
 *   1. 输入端：检测 prompt 注入、敏感信息泄露、恶意指令
 *   2. 输出端：检测生成内容中的违规文本
 *   3. 生成内容扫描：检测生成的 slides.json 中是否有恶意逃逸块
 *
 * 不依赖外部审核 API（零成本启动），基于规则 + 正则。
 * 生产环境可通过 GuardConfig 接入专业内容安全服务。
 */
import { scanEscape, type EscapeHit } from "@oneact/schema";
import type { Deck, Page } from "@oneact/schema";

// ──────────────────────────── 配置 ────────────────────────────

export interface GuardConfig {
  /** 输入端：启用 prompt 注入检测 */
  enableInjectionDetection: boolean;
  /** 输入端：启用敏感信息检测 */
  enableSensitiveDetection: boolean;
  /** 输出端：启用内容审核 */
  enableOutputModeration: boolean;
  /** 输出端：启用逃逸块安全扫描 */
  enableEscapeScan: boolean;
  /** 自定义敏感词列表 */
  sensitiveKeywords: string[];
  /** 自定义违规词列表（输出端） */
  violationKeywords: string[];
  /** 最大输入长度（防超长 prompt 攻击） */
  maxInputLength: number;
  /** 外部审核回调（接入腾讯云/阿里云内容安全） */
  externalModerator?: (text: string) => Promise<ModerationResult>;
}

export const DEFAULT_GUARD: GuardConfig = {
  enableInjectionDetection: true,
  enableSensitiveDetection: true,
  enableOutputModeration: true,
  enableEscapeScan: true,
  sensitiveKeywords: [
    "密码",
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "access_token",
    "refresh_token",
    "private_key",
    "身份证号",
    "银行卡号",
    "cvv",
    "社保号",
  ],
  violationKeywords: ["色情", "赌博", "毒品", "暴力", "恐怖"],
  maxInputLength: 10_000,
};

// ──────────────────────────── 结果 ────────────────────────────

export type GuardAction = "pass" | "block" | "warn";

export interface GuardResult {
  action: GuardAction;
  /** 命中的规则列表 */
  hits: GuardHit[];
  /** 处理后的安全文本（block 时为拒绝消息） */
  sanitizedText?: string;
  /** 拒绝原因（block 时） */
  reason?: string;
}

export interface GuardHit {
  rule: string;
  severity: "high" | "medium" | "low";
  match: string;
  message: string;
}

export interface ModerationResult {
  pass: boolean;
  reason?: string;
  categories?: string[];
}

// ──────────────────────────── Prompt 注入检测 ────────────────────────────

const INJECTION_PATTERNS: { re: RegExp; tag: string; severity: "high" | "medium" }[] = [
  // 覆盖系统指令
  {
    re: /ignore\s+(previous|above|all|prior)\s+(instructions?|prompts?|rules?|commands?)/gi,
    tag: "instruction-override",
    severity: "high",
  },
  { re: /disregard\s+(your|the|all)\s+(system|instructions?|rules?)/gi, tag: "instruction-override", severity: "high" },
  { re: /forget\s+(everything|all|previous)/gi, tag: "instruction-override", severity: "high" },
  // 角色劫持
  { re: /you\s+are\s+now\s+(a|an)\s+/gi, tag: "role-hijack", severity: "medium" },
  { re: /act\s+as\s+(if you are|a different)/gi, tag: "role-hijack", severity: "medium" },
  { re: /pretend\s+(you are|to be)/gi, tag: "role-hijack", severity: "medium" },
  // 系统提示泄露
  {
    re: /(reveal|show|print|repeat|output)\s+(your|the)\s+(system|hidden|initial)\s+(prompt|instructions?|message)/gi,
    tag: "prompt-leak",
    severity: "high",
  },
  { re: /what\s+(is|are)\s+your\s+(system|initial)\s+(prompt|instructions?)/gi, tag: "prompt-leak", severity: "high" },
  // 分隔符注入
  { re: /###\s*(system|instruction|admin)/gi, tag: "delimiter-injection", severity: "medium" },
  // 编码绕过尝试
  { re: /\\x[0-9a-f]{2}/gi, tag: "encoding-bypass", severity: "medium" },
  { re: /&#\d+;/gi, tag: "encoding-bypass", severity: "medium" },
];

/** 检测 prompt 注入。 */
export function detectInjection(text: string): GuardHit[] {
  const hits: GuardHit[] = [];
  for (const p of INJECTION_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      hits.push({
        rule: p.tag,
        severity: p.severity,
        match: m[0].slice(0, 60),
        message: `疑似 prompt 注入：${p.tag}`,
      });
    }
  }
  return hits;
}

// ──────────────────────────── 敏感信息检测 ────────────────────────────

/** 检测输入中的敏感信息。 */
export function detectSensitive(text: string, keywords: string[]): GuardHit[] {
  const hits: GuardHit[] = [];
  const lower = text.toLowerCase();

  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      hits.push({
        rule: "sensitive-info",
        severity: "high",
        match: kw,
        message: `输入包含敏感信息："${kw}"`,
      });
    }
  }

  // 检测疑似密钥格式（长 hex / base64 字符串）
  const keyPatterns = [
    { re: /sk-[a-zA-Z0-9]{20,}/g, name: "OpenAI key" },
    { re: /AKIA[A-Z0-9]{16}/g, name: "AWS key" },
    { re: /ghp_[a-zA-Z0-9]{36}/g, name: "GitHub token" },
    { re: /[a-zA-Z0-9]{40,}/g, name: "疑似密钥" },
  ];
  for (const p of keyPatterns) {
    const m = text.match(p.re);
    if (m) {
      hits.push({
        rule: "key-pattern",
        severity: "high",
        match: m[0].slice(0, 20) + "...",
        message: `检测到疑似密钥格式：${p.name}`,
      });
    }
  }

  return hits;
}

// ──────────────────────────── 输出审核 ────────────────────────────

/** 审核输出文本，检测违规内容。 */
export function moderateOutput(text: string, violationKeywords: string[]): GuardHit[] {
  const hits: GuardHit[] = [];
  for (const kw of violationKeywords) {
    if (text.includes(kw)) {
      hits.push({
        rule: "violation-keyword",
        severity: "high",
        match: kw,
        message: `输出包含违规词："${kw}"`,
      });
    }
  }
  return hits;
}

// ──────────────────────────── 生成内容安全扫描 ────────────────────────────

/** 扫描 deck 中所有逃逸块的安全性。 */
export function scanDeckSecurity(deck: Deck): { pageId: string; elementId: string; hits: EscapeHit[] }[] {
  const results: { pageId: string; elementId: string; hits: EscapeHit[] }[] = [];
  for (const page of deck.pages) {
    for (const el of page.elements) {
      if (el.type === "custom-html") {
        const hits = scanEscape((el.props as { html: string }).html);
        if (hits.length) results.push({ pageId: page.id, elementId: el.id, hits });
      } else if (el.type === "custom-svg") {
        const hits = scanEscape((el.props as { svg: string }).svg);
        if (hits.length) results.push({ pageId: page.id, elementId: el.id, hits });
      }
    }
  }
  return results;
}

// ──────────────────────────── 护栏主入口 ────────────────────────────

/**
 * 输入护栏：检查用户输入是否安全。
 *
 * @returns GuardResult — action=pass 放行，action=block 拒绝，action=warn 提示
 */
export async function guardInput(text: string, config: GuardConfig = DEFAULT_GUARD): Promise<GuardResult> {
  const hits: GuardHit[] = [];

  // 长度限制
  if (text.length > config.maxInputLength) {
    return {
      action: "block",
      hits: [
        {
          rule: "input-too-long",
          severity: "medium",
          match: `${text.length} chars`,
          message: `输入过长（${text.length} > ${config.maxInputLength}），疑似攻击`,
        },
      ],
      reason: `输入超过最大长度限制（${config.maxInputLength} 字符）`,
    };
  }

  // Prompt 注入检测
  if (config.enableInjectionDetection) {
    hits.push(...detectInjection(text));
  }

  // 敏感信息检测
  if (config.enableSensitiveDetection) {
    hits.push(...detectSensitive(text, config.sensitiveKeywords));
  }

  // 判断 action
  const highSeverity = hits.filter((h) => h.severity === "high");
  if (highSeverity.length > 0) {
    return {
      action: "block",
      hits,
      reason: `输入触发安全护栏：${highSeverity.map((h) => h.message).join("；")}`,
    };
  }

  const mediumSeverity = hits.filter((h) => h.severity === "medium");
  if (mediumSeverity.length > 0) {
    return {
      action: "warn",
      hits,
      sanitizedText: text,
    };
  }

  return { action: "pass", hits, sanitizedText: text };
}

/**
 * 输出护栏：检查 LLM 输出是否安全。
 */
export async function guardOutput(text: string, config: GuardConfig = DEFAULT_GUARD): Promise<GuardResult> {
  const hits: GuardHit[] = [];

  // 违规词检测
  if (config.enableOutputModeration) {
    hits.push(...moderateOutput(text, config.violationKeywords));
  }

  // 外部审核
  if (config.externalModerator) {
    const mod = await config.externalModerator(text);
    if (!mod.pass) {
      hits.push({
        rule: "external-moderation",
        severity: "high",
        match: mod.categories?.join(",") ?? "",
        message: mod.reason ?? "外部审核未通过",
      });
    }
  }

  const highSeverity = hits.filter((h) => h.severity === "high");
  if (highSeverity.length > 0) {
    // 输出端不直接 block，而是清洗后返回
    let sanitized = text;
    for (const kw of config.violationKeywords) {
      sanitized = sanitized.split(kw).join("***");
    }
    return { action: "warn", hits, sanitizedText: sanitized };
  }

  return { action: "pass", hits, sanitizedText: text };
}

/**
 * Deck 安全扫描：检查生成 deck 的逃逸块。
 */
export function guardDeck(deck: Deck, config: GuardConfig = DEFAULT_GUARD): GuardResult {
  if (!config.enableEscapeScan) return { action: "pass", hits: [] };

  const results = scanDeckSecurity(deck);
  if (results.length === 0) return { action: "pass", hits: [] };

  const hits: GuardHit[] = results.flatMap((r) =>
    r.hits.map((h) => ({
      rule: `escape-${h.tag}`,
      severity: h.tag === "script" || h.tag === "eval" ? ("high" as const) : ("medium" as const),
      match: h.sample,
      message: `逃逸块 #${r.pageId}/${r.elementId} 含 ${h.tag}`,
    })),
  );

  const highCount = hits.filter((h) => h.severity === "high").length;
  return {
    action: highCount > 0 ? "block" : "warn",
    hits,
    reason: highCount > 0 ? `生成的 deck 有 ${highCount} 个高危逃逸块` : undefined,
  };
}

/**
 * 一键护栏：同时检查输入文本和输出 deck。
 * 生成流程的统一安全入口。
 */
export async function guardPipeline(
  input: string,
  deck: Deck,
  config: GuardConfig = DEFAULT_GUARD,
): Promise<{ input: GuardResult; output: GuardResult; deck: GuardResult }> {
  const [inputResult, outputResult] = await Promise.all([
    guardInput(input, config),
    guardOutput(JSON.stringify(deck), config),
  ]);
  const deckResult = guardDeck(deck, config);
  return { input: inputResult, output: outputResult, deck: deckResult };
}
