/**
 * @oneact/ai — 多模型分档路由（策划书 7.1.7）
 *
 * 不同模型的结构化生成严谨度差异大，按档位自动路由：
 *   weak     → 轻量/快模型，spec 强制约束模式（禁自由坐标），更多 few-shot
 *   standard → 主力模型，spec 默认约束模式
 *   strong   → 最强模型，spec 放开自由坐标，few-shot 可精简
 *
 * 用户只需配置一组 ProviderConfig，router 按 tier 选 model + temperature + maxTokens。
 * 也可配置多组 ProviderConfig 实现跨厂商分档（如 weak 用国产快模型，strong 用 GPT-4o）。
 */
import type { LLMProvider, ProviderConfig, ProviderKind } from "./provider.js";
import { createProvider } from "./provider.js";

export type ModelTier = "weak" | "standard" | "strong";

/** 单档配置：该档位用哪个模型 + 生成参数。 */
export interface TierConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  /** 该档位是否强制约束模式（spec 中禁自由坐标） */
  forceConstraintMode: boolean;
  /** 该档位 provider 类型（允许跨厂商，如 weak 用国产、strong 用 OpenAI） */
  kind?: ProviderKind;
  /** 自定义端点 */
  baseUrl?: string;
}

/** 预设档位（用户可直接用或覆盖）。 */
export const DEFAULT_TIERS: Record<ModelTier, Omit<TierConfig, "model">> = {
  weak: {
    temperature: 0.3,
    maxTokens: 4096,
    forceConstraintMode: true,
  },
  standard: {
    temperature: 0.4,
    maxTokens: 8192,
    forceConstraintMode: false,
  },
  strong: {
    temperature: 0.5,
    maxTokens: 8192,
    forceConstraintMode: false,
  },
};

/** 路由器配置：API key + 三档模型名。 */
export interface RouterConfig {
  apiKey: string;
  /** 三档模型名（必须） */
  models: Record<ModelTier, string>;
  /** 覆盖默认档位参数（可选） */
  tierOverrides?: Partial<Record<ModelTier, Partial<TierConfig>>>;
  /** 默认 provider 类型（单厂商分档） */
  kind?: ProviderKind;
  /** 默认端点 */
  baseUrl?: string;
  /** 每档独立的 provider 类型（跨厂商分档，可选） */
  kindPerTier?: Partial<Record<ModelTier, ProviderKind>>;
  /** 每档独立端点 */
  baseUrlPerTier?: Partial<Record<ModelTier, string>>;
}

/**
 * 模型路由器：按 tier 返回 provider + 该档位 spec 参数。
 */
export class ModelRouter {
  private config: RouterConfig;
  private cache = new Map<ModelTier, LLMProvider>();

  constructor(config: RouterConfig) {
    this.config = config;
  }

  /** 获取指定档位的 provider。 */
  getProvider(tier: ModelTier = "standard"): LLMProvider {
    const cached = this.cache.get(tier);
    if (cached) return cached;

    const tierConfig = this.resolveTier(tier);
    const providerConfig: ProviderConfig = {
      kind: tierConfig.kind ?? this.config.kind ?? "openai-compatible",
      apiKey: this.config.apiKey,
      model: tierConfig.model,
      baseUrl: tierConfig.baseUrl ?? this.config.baseUrl,
    };
    const provider = createProvider(providerConfig);
    this.cache.set(tier, provider);
    return provider;
  }

  /** 获取指定档位的生成参数。 */
  getTierParams(tier: ModelTier = "standard"): TierConfig {
    return this.resolveTier(tier);
  }

  /** 获取指定档位的 modelTier spec 参数（传给 buildSpec）。 */
  getSpecTier(tier: ModelTier = "standard"): "weak" | "standard" | "strong" {
    return tier;
  }

  /** 快捷方式：standard 档 provider（最常用）。 */
  get default(): LLMProvider {
    return this.getProvider("standard");
  }

  private resolveTier(tier: ModelTier): TierConfig {
    const base = DEFAULT_TIERS[tier];
    const override = this.config.tierOverrides?.[tier] ?? {};
    const model = this.config.models[tier];
    if (!model) throw new Error(`RouterConfig.models.${tier} 未配置模型名`);
    return {
      model,
      temperature: override.temperature ?? base.temperature,
      maxTokens: override.maxTokens ?? base.maxTokens,
      forceConstraintMode: override.forceConstraintMode ?? base.forceConstraintMode,
      kind: override.kind ?? this.config.kindPerTier?.[tier],
      baseUrl: override.baseUrl ?? this.config.baseUrlPerTier?.[tier],
    };
  }
}

/**
 * 从环境变量创建路由器（CLI / MCP 场景）。
 *
 * 环境变量约定：
 *   ONEACT_API_KEY          — API key（必须）
 *   ONEACT_MODEL            — standard 档模型（必须）
 *   ONEACT_MODEL_WEAK       — weak 档模型（可选，缺省同 standard）
 *   ONEACT_MODEL_STRONG     — strong 档模型（可选，缺省同 standard）
 *   ONEACT_PROVIDER         — provider 类型（可选，默认 openai-compatible）
 *   ONEACT_BASE_URL         — 端点（可选）
 */
export function routerFromEnv(): ModelRouter {
  const apiKey = process.env.ONEACT_API_KEY ?? "";
  const standardModel = process.env.ONEACT_MODEL ?? "";
  if (!apiKey || !standardModel) {
    throw new Error("未配置 ONEACT_API_KEY / ONEACT_MODEL（key 仅存本地）");
  }
  const weakModel = process.env.ONEACT_MODEL_WEAK ?? standardModel;
  const strongModel = process.env.ONEACT_MODEL_STRONG ?? standardModel;
  const kind = (process.env.ONEACT_PROVIDER ?? "openai-compatible") as ProviderKind;
  const baseUrl = process.env.ONEACT_BASE_URL;

  return new ModelRouter({
    apiKey,
    models: { weak: weakModel, standard: standardModel, strong: strongModel },
    kind,
    baseUrl,
  });
}
