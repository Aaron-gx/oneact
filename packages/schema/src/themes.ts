/**
 * @oneact/schema — 主题 design tokens
 *
 * 每套主题 = 一组 token，运行时注入 CSS 变量。
 * v0 先 1 套（远山蓝，默认），内置 3 套。主题即插件，社区可发布。
 */

export interface ColorTokens {
  primary: string;
  accent: string;
  text: string;
  "text-secondary": string;
  bg: string;
  surface: string;
  border: string;
  /** 强调底色（标签/胶囊背景） */
  "primary-soft": string;
}

export interface FontTokens {
  heading: string;
  body: string;
  number: string;
}

export interface FontSizeTokens {
  h1: number; // 44
  h2: number; // 32
  h3: number; // 24
  body: number; // 18
  small: number; // 14
  caption: number; // 12
}

export interface Theme {
  name: string;
  label: string;
  colors: ColorTokens;
  fonts: FontTokens;
  fontSizes: FontSizeTokens;
  radius: number;
  shadow: string;
  /** 基础间距单位 */
  spacing: number;
  /** 图表系列色板（走主题，换肤自动生效） */
  chart: string[];
}

/** 中文友好系统字体栈（零加载成本）。 */
const CN_FONT_STACK =
  "'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'Source Han Sans SC', 'Noto Sans CJK SC', system-ui, -apple-system, 'Segoe UI', sans-serif";
const NUMBER_FONT_STACK =
  "'SF Pro Display', 'DIN Alternate', 'Helvetica Neue', ui-monospace, 'Cascadia Code', Consolas, monospace";

/** 字号阶梯（也是校验器字号下限依据）。 */
export const FONT_SIZE_LIMITS = {
  heading: 24,
  body: 14,
} as const;

const baseFontSizes: FontSizeTokens = {
  h1: 48,
  h2: 34,
  h3: 26,
  body: 19,
  small: 14,
  caption: 12,
};

const baseFonts: FontTokens = {
  heading: CN_FONT_STACK,
  body: CN_FONT_STACK,
  number: NUMBER_FONT_STACK,
};

/** 远山蓝（商务，默认）。 */
const yuanshanBlue: Theme = {
  name: "yuanshan-blue",
  label: "远山蓝",
  colors: {
    primary: "#2f54eb",
    accent: "#7c3aed",
    text: "#1d1c1a",
    "text-secondary": "#5b5a55",
    bg: "#ffffff",
    surface: "#f6f5f2",
    border: "rgba(24,22,18,.10)",
    "primary-soft": "#eef0fe",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 12,
  shadow: "0 2px 6px rgba(24,22,18,.07), 0 8px 24px rgba(24,22,18,.09)",
  spacing: 8,
  chart: ["#2f54eb", "#7c3aed", "#22c55e", "#f59e0b", "#06b6d4", "#ef4444"],
};

/** 墨绿（学术）。 */
const inkGreen: Theme = {
  name: "ink-green",
  label: "墨绿",
  colors: {
    primary: "#0f766e",
    accent: "#15803d",
    text: "#1a2421",
    "text-secondary": "#56635e",
    bg: "#fbfdfc",
    surface: "#eef5f2",
    border: "rgba(15,40,33,.12)",
    "primary-soft": "#e2f1ec",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 10,
  shadow: "0 2px 6px rgba(15,40,33,.08), 0 8px 24px rgba(15,40,33,.10)",
  spacing: 8,
  chart: ["#0f766e", "#15803d", "#65a30d", "#0ea5e9", "#ca8a04", "#9333ea"],
};

/** 暖橙（活力）。 */
const warmOrange: Theme = {
  name: "warm-orange",
  label: "暖橙",
  colors: {
    primary: "#ea580c",
    accent: "#d946ef",
    text: "#1f1a17",
    "text-secondary": "#6b5d54",
    bg: "#fffdf8",
    surface: "#fdf0e3",
    border: "rgba(60,30,10,.12)",
    "primary-soft": "#fde9d6",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 14,
  shadow: "0 2px 6px rgba(120,50,10,.08), 0 8px 24px rgba(120,50,10,.12)",
  spacing: 8,
  chart: ["#ea580c", "#d946ef", "#f59e0b", "#ef4444", "#0ea5e9", "#22c55e"],
};

/** 科技深色（深底霓虹，科技/AI/未来感）。 */
const techNoir: Theme = {
  name: "tech-noir",
  label: "科技深色",
  colors: {
    primary: "#22d3ee",
    accent: "#a78bfa",
    text: "#e8ecf4",
    "text-secondary": "#9aa3b8",
    bg: "#0b1020",
    surface: "#161d33",
    border: "rgba(255,255,255,.10)",
    "primary-soft": "#123240",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 14,
  shadow: "0 2px 8px rgba(0,0,0,.40), 0 12px 32px rgba(0,0,0,.45)",
  spacing: 8,
  chart: ["#22d3ee", "#a78bfa", "#34d399", "#f472b6", "#60a5fa", "#fbbf24"],
};

/** 极光紫（高级感，产品发布/品牌）。 */
const auroraPurple: Theme = {
  name: "aurora-purple",
  label: "极光紫",
  colors: {
    primary: "#6d28d9",
    accent: "#db2777",
    text: "#1e1633",
    "text-secondary": "#5b4b7a",
    bg: "#ffffff",
    surface: "#f6f3ff",
    border: "rgba(109,40,217,.12)",
    "primary-soft": "#ede7ff",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 16,
  shadow: "0 2px 8px rgba(109,40,217,.10), 0 12px 32px rgba(109,40,217,.12)",
  spacing: 8,
  chart: ["#6d28d9", "#db2777", "#7c3aed", "#c026d3", "#4f46e5", "#9333ea"],
};

/** 森林青（有机绿，自然/可持续/健康）。 */
const forest: Theme = {
  name: "forest",
  label: "森林青",
  colors: {
    primary: "#15803d",
    accent: "#65a30d",
    text: "#16241a",
    "text-secondary": "#4a5e4f",
    bg: "#fbfdf8",
    surface: "#eef6ed",
    border: "rgba(20,60,30,.12)",
    "primary-soft": "#e0efd9",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 12,
  shadow: "0 2px 6px rgba(20,60,30,.08), 0 10px 26px rgba(20,60,30,.10)",
  spacing: 8,
  chart: ["#15803d", "#65a30d", "#0d9488", "#84cc16", "#10b981", "#ca8a04"],
};

/** 赤金（中国红+金，传统/节庆/政务）。 */
const crimsonGold: Theme = {
  name: "crimson-gold",
  label: "赤金",
  colors: {
    primary: "#be1622",
    accent: "#c8893a",
    text: "#2a1a12",
    "text-secondary": "#6b5644",
    bg: "#fffaf3",
    surface: "#fbf0e6",
    border: "rgba(120,30,20,.14)",
    "primary-soft": "#fbe6e0",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 10,
  shadow: "0 2px 6px rgba(120,30,20,.10), 0 10px 26px rgba(120,30,20,.12)",
  spacing: 8,
  chart: ["#be1622", "#c8893a", "#b45309", "#dc2626", "#a16207", "#92400e"],
};

/** 深海蓝（青蓝，金融/数据/水务）。 */
const ocean: Theme = {
  name: "ocean",
  label: "深海蓝",
  colors: {
    primary: "#0369a1",
    accent: "#0891b2",
    text: "#0d2230",
    "text-secondary": "#45606e",
    bg: "#f7fbfd",
    surface: "#e9f3f8",
    border: "rgba(10,50,80,.12)",
    "primary-soft": "#dceef6",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 12,
  shadow: "0 2px 6px rgba(10,50,80,.08), 0 10px 26px rgba(10,50,80,.10)",
  spacing: 8,
  chart: ["#0369a1", "#0891b2", "#0284c7", "#06b6d4", "#0e7490", "#22d3ee"],
};

/** 樱粉（柔和粉，生活/教育/女性向）。 */
const sakura: Theme = {
  name: "sakura",
  label: "樱粉",
  colors: {
    primary: "#be185d",
    accent: "#ec4899",
    text: "#2a1620",
    "text-secondary": "#6b4a5a",
    bg: "#fffafd",
    surface: "#fce7f1",
    border: "rgba(190,24,93,.12)",
    "primary-soft": "#fbe2ee",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 16,
  shadow: "0 2px 6px rgba(190,24,93,.08), 0 10px 26px rgba(190,24,93,.12)",
  spacing: 8,
  chart: ["#be185d", "#ec4899", "#f43f5e", "#db2777", "#e11d48", "#d946ef"],
};

/** 极简灰（灰阶 + 一点亮色，Apple/极简风）。 */
const monoSlate: Theme = {
  name: "mono-slate",
  label: "极简灰",
  colors: {
    primary: "#1f2937",
    accent: "#4f46e5",
    text: "#111827",
    "text-secondary": "#6b7280",
    bg: "#ffffff",
    surface: "#f4f5f7",
    border: "rgba(20,30,50,.10)",
    "primary-soft": "#eef0f3",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 8,
  shadow: "0 1px 3px rgba(17,24,39,.06), 0 6px 18px rgba(17,24,39,.08)",
  spacing: 8,
  chart: ["#1f2937", "#4f46e5", "#6b7280", "#9ca3af", "#374151", "#4338ca"],
};

/** 日落（暖色，生活/营销/活力）。 */
const sunset: Theme = {
  name: "sunset",
  label: "日落",
  colors: {
    primary: "#e11d48",
    accent: "#f59e0b",
    text: "#2a1410",
    "text-secondary": "#6b4a44",
    bg: "#fffaf7",
    surface: "#fef0e9",
    border: "rgba(180,40,30,.12)",
    "primary-soft": "#fde6e0",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 14,
  shadow: "0 2px 6px rgba(180,40,30,.08), 0 10px 26px rgba(180,40,30,.12)",
  spacing: 8,
  chart: ["#e11d48", "#f59e0b", "#ea580c", "#dc2626", "#d97706", "#f43f5e"],
};

/** 医疗薄荷（清爽薄荷，医疗/健康/清洁）。 */
const medicalMint: Theme = {
  name: "medical-mint",
  label: "医疗薄荷",
  colors: {
    primary: "#0d9488",
    accent: "#0ea5e9",
    text: "#0a2a26",
    "text-secondary": "#45635f",
    bg: "#fbffff",
    surface: "#e6f7f5",
    border: "rgba(10,80,70,.12)",
    "primary-soft": "#d3f0eb",
  },
  fonts: baseFonts,
  fontSizes: baseFontSizes,
  radius: 12,
  shadow: "0 2px 6px rgba(10,80,70,.08), 0 10px 26px rgba(10,80,70,.10)",
  spacing: 8,
  chart: ["#0d9488", "#0ea5e9", "#14b8a6", "#06b6d4", "#0891b2", "#22c55e"],
};

export const DEFAULT_THEME = "yuanshan-blue";

export const THEMES: Record<string, Theme> = {
  "yuanshan-blue": yuanshanBlue,
  "ink-green": inkGreen,
  "warm-orange": warmOrange,
  "tech-noir": techNoir,
  "aurora-purple": auroraPurple,
  forest,
  "crimson-gold": crimsonGold,
  ocean,
  sakura,
  "mono-slate": monoSlate,
  sunset,
  "medical-mint": medicalMint,
};

export const BUILT_IN_THEMES: Theme[] = [
  yuanshanBlue,
  inkGreen,
  warmOrange,
  techNoir,
  auroraPurple,
  forest,
  crimsonGold,
  ocean,
  sakura,
  monoSlate,
  sunset,
  medicalMint,
];

/** 主题色板摘要（供 UI 选择器渲染色块，避免各处硬编码主题列表）。 */
export interface ThemeSwatch {
  name: string;
  label: string;
  primary: string;
  accent: string;
  /** 深色背景主题（文字需用浅色，UI 预览块按深底渲染） */
  dark?: boolean;
}

export const THEME_SWATCHES: ThemeSwatch[] = BUILT_IN_THEMES.map((t) => ({
  name: t.name,
  label: t.label,
  primary: t.colors.primary,
  accent: t.colors.accent,
  // 深底主题：背景明度低，UI 预览块需按深底渲染、文字用浅色
  dark: t.name === "tech-noir",
}));

/** 取主题；未知主题回退到默认主题（不抛错，保证渲染不中断）。 */
export function getTheme(name?: string): Theme {
  if (name && THEMES[name]) return THEMES[name];
  return THEMES[DEFAULT_THEME];
}

/** 合并用户自定义主题（插件注册用）。返回新 THEMES 副本。 */
export function registerTheme(theme: Theme): Record<string, Theme> {
  THEMES[theme.name] = theme;
  return THEMES;
}

/**
 * 风格情绪标签 —— 映射到具体主题（见 @oneact/ai 的 MOOD_THEME）。
 * 下沉到 schema 作为跨包单一事实源：@oneact/ai、@oneact/skills、@oneact/orchestrator
 * 均可引用而不产生循环依赖（schema 不依赖任何包）。
 */
export type Mood =
  | "tech"
  | "business"
  | "academic"
  | "vibrant"
  | "minimal"
  | "traditional"
  | "nature"
  | "medical"
  | "ocean"
  | "elegant"
  | "sunset"
  | "sakura";
