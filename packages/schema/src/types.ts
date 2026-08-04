/**
 * @oneact/schema — slides.json 类型定义
 *
 * 设计原则：AI 写得对，人也读得懂。
 *  - rect = [x, y, w, h]：四元数组，紧凑，AI 易写不易错
 *  - 富文本 = runs 数组：一段文字由若干片段组成，支持混排
 *  - z 序 = elements 数组顺序（后者在上层）
 *  - theme 只存名字，token 由主题包解析
 *  - 无障碍内建：image.alt 必填、chart.summary
 */
import type { DeckSize } from "./format.js";

// ────────────────────────────────────────────────────────────────
// 基础
// ────────────────────────────────────────────────────────────────

/** 元素矩形 [x, y, w, h]，单位为逻辑像素。 */
export type Rect = [x: number, y: number, w: number, h: number];

/** 文字片段：一段文字可由多个 run 混排，每片可独立样式。 */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** 覆盖主题文字色 */
  color?: string;
  /** 覆盖字号 */
  fontSize?: number;
  fontFamily?: string;
  /** 超链接 */
  href?: string;
}

/** 富文本：纯字符串（单一样式）或 runs 数组（混排）。 */
export type RichText = string | Run[];

/** 把任意 RichText 归一为 Run[]。 */
export function toRuns(t: RichText): Run[] {
  return typeof t === "string" ? [{ text: t }] : t;
}

/** 取 RichText 的纯文本（用于无障碍、测量估算）。 */
export function plainText(t: RichText): string {
  return toRuns(t)
    .map((r) => r.text)
    .join("");
}

/** 水平对齐。 */
export type Align = "left" | "center" | "right";

// ────────────────────────────────────────────────────────────────
// 动画（声明式原语，兼容 Office 心智）
// ────────────────────────────────────────────────────────────────

/** 单元素动画声明。name 即预设（如 fly-in-left），参数仅 duration/delay/easing/stagger。 */
export interface Anim {
  /** 预设名：entrance/emphasis/exit 类（如 fly-in-left / pulse / fade-out） */
  name: string;
  /** 时长 ms */
  duration?: number;
  /** 延迟 ms */
  delay?: number;
  /** 缓动：linear / ease / ease-out / ease-in-out / 自定义 cubic-bezier */
  easing?: string;
  /** 错落 ms（列表/表格逐项、图表逐系列） */
  stagger?: number;
  /** sequence 编序：同序号同时，序号递增则递延 */
  order?: number;
  /** motion-custom 自定义路径（SVG path 字符串，配合 motion-* 动画） */
  path?: string;
}

/** 页面切换。name 即切换预设（fade / push-left / morph …）。 */
export interface Transition {
  name: string;
  duration?: number;
  easing?: string;
}

// ────────────────────────────────────────────────────────────────
// 背景
// ────────────────────────────────────────────────────────────────

export interface Background {
  color?: string;
  gradient?: { from: string; to: string; angle?: number };
  image?: { src: string; fit?: "cover" | "contain"; alt?: string };
}

// ────────────────────────────────────────────────────────────────
// 图表语义层（4.9）—— AI 只写 类型 + 数据，渲染层翻译为引擎配置
// ────────────────────────────────────────────────────────────────

export type ChartType = "bar" | "line" | "pie" | "doughnut" | "area" | "radar";

export interface ChartSeries {
  name: string;
  values: number[];
  /** 可选：单个系列覆盖色 */
  color?: string;
}

export interface ChartData {
  categories: string[];
  series: ChartSeries[];
}

export interface ChartProps {
  chartType: ChartType;
  data: ChartData;
  title?: string;
  /** 无障碍文字摘要（缺省触发软警告） */
  summary?: string;
  /** 横向柱（bar 专用） */
  horizontal?: boolean;
  /** 堆叠柱（bar 专用） */
  stacked?: boolean;
  /** 折线平滑（line/area 专用） */
  smooth?: boolean;
  showLegend?: boolean;
  showLabels?: boolean;
  /** 覆盖系列色板（不填走主题） */
  seriesColors?: string[];
  /** 饼图/环形图内圆占比（0–0.9，doughnut 专用） */
  innerRadius?: number;
  /** 单位后缀，如 "万"、"%" */
  unit?: string;
}

// ────────────────────────────────────────────────────────────────
// 各组件 props
// ────────────────────────────────────────────────────────────────

export interface HeadingProps {
  text: RichText;
  /** 层级：1=大标题(默认) 2=中 3=小，对应主题字号阶梯 */
  level?: 1 | 2 | 3;
  align?: Align;
  color?: string;
  /** 主题色：primary / accent / text（标题常用 primary） */
  tone?: "primary" | "accent" | "text";
  /** 元素级加粗/斜体/下划线（应用到整段文字） */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface ParagraphProps {
  text: RichText;
  align?: Align | "justify";
  fontSize?: number;
  color?: string;
  lineHeight?: number;
  tone?: "text" | "text-secondary" | "primary" | "accent";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface BulletListProps {
  items: RichText[];
  ordered?: boolean;
  marker?: "disc" | "circle" | "square" | "decimal" | "none";
  gap?: number;
  fontSize?: number;
  color?: string;
  /** 列表项行高 */
  lineHeight?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface ImageProps {
  /** URL / base64 / 占位符（"placeholder:描述"） */
  src: string;
  /** 无障碍替代文本，必填 */
  alt: string;
  fit?: "cover" | "contain" | "fill";
  radius?: number;
}

export interface TableProps {
  /** 列宽比例，如 [2, 1, 1]；随 rect 宽度自适应 */
  columns: number[];
  head?: RichText[];
  rows: RichText[][];
  fontSize?: number;
  headColor?: string;
  /** 斑马纹 */
  zebra?: boolean;
}

export type ShapeKind = "rect" | "ellipse" | "line" | "triangle" | "diamond" | "chevron";

export interface ShapeProps {
  shape: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  /** line / chevron 等的方向 */
  direction?: "up" | "down" | "left" | "right";
}

export interface IconProps {
  /** 内置图标名（lucide 子集，见 components.IconSet） */
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export interface CustomHtmlProps {
  /** 逃逸块 HTML；默认不可信 → iframe sandbox + 消毒 */
  html: string;
  /** 显式授权脚本（用户确认后才在沙箱内放开） */
  trusted?: boolean;
}

export interface CustomSvgProps {
  /** 内联 SVG 字符串（消毒后直接渲染） */
  svg: string;
  title?: string;
}

export interface FormulaProps {
  /** LaTeX 公式源码 */
  latex: string;
  /** true=块级展示（默认），false=行内 */
  display?: boolean;
  color?: string;
}

export interface VideoProps {
  /** URL / base64 / placeholder */
  src: string;
  poster?: string;
  /** 默认 true */
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export interface AudioProps {
  src: string;
  /** 默认 true */
  controls?: boolean;
  autoplay?: boolean;
  loop?: boolean;
}

// ────────────────────────────────────────────────────────────────
// 复合语义组件（WS1）
// 自包含：AI 只填语义字段，渲染层确定性产出整组精致视觉
// （卡片底 + 图标 + 标题 + 描述等），替代「shape+heading+paragraph 手摆易漏」。
// ────────────────────────────────────────────────────────────────

/** 单个大数字指标卡。 */
export interface KpiProps {
  /** 大数字 / 核心指标 */
  value: RichText;
  /** 标签（如「季度营收」） */
  label?: RichText;
  /** 趋势注释（如「↑ 18%」） */
  trend?: { text: RichText; dir?: "up" | "down" | "flat" };
  /** 内置图标名 */
  icon?: string;
  tone?: "primary" | "accent";
}

/** 多个 KPI 的网格排列。 */
export interface StatGridProps {
  cells: { value: RichText; label?: RichText; icon?: string; tone?: "primary" | "accent" }[];
  /** 每行几个；缺省按 cells 数自适应（≤2→2，3→3，≥4→4） */
  columns?: 2 | 3 | 4;
}

/** 特性卡片：图标 + 标题 + 描述。 */
export interface FeatureCardProps {
  icon?: string;
  title: RichText;
  desc?: RichText;
  tone?: "primary" | "accent";
}

/** 特性列表：多行，每行 图标 + 标题 + 描述，行间分隔。 */
export interface FeatureListProps {
  items: { icon?: string; title: RichText; desc?: RichText }[];
  /** 是否带序号 */
  numbered?: boolean;
}

/** 时间线：节点序列（圆点 + 时间 + 标题 + 描述），确定性连线。 */
export interface TimelineProps {
  items: { time?: RichText; title: RichText; desc?: RichText }[];
  /** 默认 horizontal */
  orientation?: "horizontal" | "vertical";
}

/** 流程：步骤序列（编号圆 + 标题 + 描述 + 箭头），确定性连接。 */
export interface ProcessProps {
  steps: { title: RichText; desc?: RichText }[];
  /** 默认 true：带编号 */
  numbered?: boolean;
}

/** 左右对比：左右各一栏（标题 + 要点），不同底色区分。 */
export interface ComparisonProps {
  left: { title: RichText; items?: RichText[]; tone?: "negative" | "neutral" };
  right: { title: RichText; items?: RichText[]; tone?: "positive" | "neutral" };
}

/** 装饰章节标题：竖条/眉标 + 标题 + 副标题。 */
export interface SectionTitleProps {
  title: RichText;
  subtitle?: RichText;
  /** 眉标 / 小标签（如「CHAPTER 01」） */
  kicker?: RichText;
  align?: Align;
  tone?: "primary" | "accent";
}

/** 提示框：图标 + 标题 + 文本，按 variant 配色。 */
export interface CalloutProps {
  text: RichText;
  title?: RichText;
  icon?: string;
  variant?: "info" | "success" | "warning" | "tip";
}

/** 徽标 / 胶囊标签。 */
export interface BadgeProps {
  text: RichText;
  tone?: "primary" | "accent" | "neutral" | "positive" | "negative";
  icon?: string;
}

/** 分隔线（可带文字）。 */
export interface DividerProps {
  variant?: "solid" | "dashed" | "dots";
  tone?: "border" | "primary" | "accent";
  /** 带文字的分隔线（文字居中，两侧线条） */
  label?: RichText;
}

/** 头像：圆形头像 + 姓名 + 角色。 */
export interface AvatarProps {
  name: RichText;
  role?: RichText;
  /** 头像图；缺省用姓名首字母占位 */
  src?: string;
  icon?: string;
}

/** 金字塔：分层策略（自顶向下），每层 label + desc，顶层最窄。 */
export interface PyramidProps {
  /** 自顶向下的层级；第 0 层在顶部、最窄 */
  layers: { label: RichText; desc?: RichText }[];
  tone?: "primary" | "accent";
  /** 朝向：up=顶尖底宽（默认），down=顶宽底尖（倒金字塔） */
  orientation?: "up" | "down";
}

/** 漏斗：转化漏斗，递减宽度条 + 每段 value/百分比，首阶段最宽。 */
export interface FunnelProps {
  /** 自上而下的阶段；首阶段为漏斗顶部（最宽） */
  stages: { label: RichText; value?: number; desc?: RichText }[];
  tone?: "primary" | "accent";
}

/** 数据高亮块：超大数字 + 标签 + 同比/环比 delta，比 kpi 更「演讲感」。 */
export interface StatHighlightProps {
  /** 大数字 / 核心指标（巨大铺满） */
  value: RichText;
  label?: RichText;
  /** 同比 / 环比变化（dir 决定胶囊配色） */
  delta?: { text: RichText; dir?: "up" | "down" | "flat"; period?: string };
  /** 补充说明小字 */
  caption?: RichText;
  icon?: string;
  tone?: "primary" | "accent";
}

/** 组织架构节点。 */
export interface OrgNode {
  name: RichText;
  role?: RichText;
  icon?: string;
}
/** 组织架构分支：一个二级节点 + 其下属三级成员。 */
export interface OrgBranch {
  node: OrgNode;
  children?: OrgNode[];
}
/** 组织架构：根节点 + 二级分支（每分支可挂三级成员），确定性连线。 */
export interface OrgChartProps {
  root: OrgNode;
  branches?: OrgBranch[];
  tone?: "primary" | "accent";
}

/** 甘特任务条。 */
export interface GanttTask {
  name: RichText;
  /** 起始刻度（相对 0） */
  start: number;
  /** 结束刻度 */
  end: number;
  tone?: "primary" | "accent";
  /** 完成进度 0–100 */
  progress?: number;
}
/** 甘特图：任务条 + 时间轴，按 start/end 相对刻度排布，可标进度。 */
export interface GanttProps {
  tasks: GanttTask[];
  /** 时间刻度标签（如 ["Q1","Q2","Q3","Q4"]）；缺省按 start/end 自动均分 */
  timeline?: string[];
  tone?: "primary" | "accent";
}

/** 思维导图分支：标签 + 子项。 */
export interface MindmapBranch {
  label: RichText;
  items?: RichText[];
  tone?: "primary" | "accent";
}
/** 思维导图：中心主题 + 向右展开的分支（每分支带子项）。 */
export interface MindmapProps {
  center: RichText;
  branches?: MindmapBranch[];
  tone?: "primary" | "accent";
}

/** AI 动效卡：自带入场/常驻动效的特性卡（sparkles + 光感 + badge），比 feature-card 更炫。 */
export interface AiCardProps {
  title: RichText;
  desc?: RichText;
  icon?: string;
  /** 入场/常驻动效预设（默认 fade-in-up） */
  effect?: "fade-in-up" | "zoom-in" | "slide-in-left" | "glow-pulse";
  /** 角标文字（如 "AI" / "NEW"） */
  badge?: RichText;
  tone?: "primary" | "accent";
}

// ────────────────────────────────────────────────────────────────
// 组件类型映射 & 元素（判别联合，便于 narrow）
// ────────────────────────────────────────────────────────────────

export type ElementType =
  | "heading"
  | "paragraph"
  | "bullet-list"
  | "image"
  | "chart"
  | "table"
  | "shape"
  | "icon"
  | "custom-html"
  | "custom-svg"
  | "formula"
  | "video"
  | "audio"
  // ── 复合语义组件（WS1）──
  | "kpi"
  | "stat-grid"
  | "feature-card"
  | "feature-list"
  | "timeline"
  | "process"
  | "comparison"
  | "section-title"
  | "callout"
  | "badge"
  | "divider"
  | "avatar"
  | "pyramid"
  | "funnel"
  | "stat-highlight"
  | "org-chart"
  | "gantt"
  | "mindmap"
  | "ai-card";

export interface ElementPropsMap {
  heading: HeadingProps;
  paragraph: ParagraphProps;
  "bullet-list": BulletListProps;
  image: ImageProps;
  chart: ChartProps;
  table: TableProps;
  shape: ShapeProps;
  icon: IconProps;
  "custom-html": CustomHtmlProps;
  "custom-svg": CustomSvgProps;
  formula: FormulaProps;
  video: VideoProps;
  audio: AudioProps;
  // ── 复合语义组件（WS1）──
  kpi: KpiProps;
  "stat-grid": StatGridProps;
  "feature-card": FeatureCardProps;
  "feature-list": FeatureListProps;
  timeline: TimelineProps;
  process: ProcessProps;
  comparison: ComparisonProps;
  "section-title": SectionTitleProps;
  callout: CalloutProps;
  badge: BadgeProps;
  divider: DividerProps;
  avatar: AvatarProps;
  pyramid: PyramidProps;
  funnel: FunnelProps;
  "stat-highlight": StatHighlightProps;
  "org-chart": OrgChartProps;
  gantt: GanttProps;
  mindmap: MindmapProps;
  "ai-card": AiCardProps;
}

export interface ElementBase {
  /** 元素 id（页内唯一，可寻址） */
  id: string;
  rect: Rect;
  anim?: Anim;
  /** 附加类名（主题/插件 hook） */
  className?: string;
  /** 该元素所属 slot 名（约束模式下由布局引擎填，供校验器检查越界） */
  slot?: string;
}

export interface HeadingElement extends ElementBase {
  type: "heading";
  props: HeadingProps;
}
export interface ParagraphElement extends ElementBase {
  type: "paragraph";
  props: ParagraphProps;
}
export interface BulletListElement extends ElementBase {
  type: "bullet-list";
  props: BulletListProps;
}
export interface ImageElement extends ElementBase {
  type: "image";
  props: ImageProps;
}
export interface ChartElement extends ElementBase {
  type: "chart";
  props: ChartProps;
}
export interface TableElement extends ElementBase {
  type: "table";
  props: TableProps;
}
export interface ShapeElement extends ElementBase {
  type: "shape";
  props: ShapeProps;
}
export interface IconElement extends ElementBase {
  type: "icon";
  props: IconProps;
}
export interface CustomHtmlElement extends ElementBase {
  type: "custom-html";
  props: CustomHtmlProps;
}
export interface CustomSvgElement extends ElementBase {
  type: "custom-svg";
  props: CustomSvgProps;
}
export interface FormulaElement extends ElementBase {
  type: "formula";
  props: FormulaProps;
}
export interface VideoElement extends ElementBase {
  type: "video";
  props: VideoProps;
}
export interface AudioElement extends ElementBase {
  type: "audio";
  props: AudioProps;
}
// ── 复合语义组件元素（WS1）──
export interface KpiElement extends ElementBase {
  type: "kpi";
  props: KpiProps;
}
export interface StatGridElement extends ElementBase {
  type: "stat-grid";
  props: StatGridProps;
}
export interface FeatureCardElement extends ElementBase {
  type: "feature-card";
  props: FeatureCardProps;
}
export interface FeatureListElement extends ElementBase {
  type: "feature-list";
  props: FeatureListProps;
}
export interface TimelineElement extends ElementBase {
  type: "timeline";
  props: TimelineProps;
}
export interface ProcessElement extends ElementBase {
  type: "process";
  props: ProcessProps;
}
export interface ComparisonElement extends ElementBase {
  type: "comparison";
  props: ComparisonProps;
}
export interface SectionTitleElement extends ElementBase {
  type: "section-title";
  props: SectionTitleProps;
}
export interface CalloutElement extends ElementBase {
  type: "callout";
  props: CalloutProps;
}
export interface BadgeElement extends ElementBase {
  type: "badge";
  props: BadgeProps;
}
export interface DividerElement extends ElementBase {
  type: "divider";
  props: DividerProps;
}
export interface AvatarElement extends ElementBase {
  type: "avatar";
  props: AvatarProps;
}
export interface PyramidElement extends ElementBase {
  type: "pyramid";
  props: PyramidProps;
}
export interface FunnelElement extends ElementBase {
  type: "funnel";
  props: FunnelProps;
}
export interface StatHighlightElement extends ElementBase {
  type: "stat-highlight";
  props: StatHighlightProps;
}
export interface OrgChartElement extends ElementBase {
  type: "org-chart";
  props: OrgChartProps;
}
export interface GanttElement extends ElementBase {
  type: "gantt";
  props: GanttProps;
}
export interface MindmapElement extends ElementBase {
  type: "mindmap";
  props: MindmapProps;
}
export interface AiCardElement extends ElementBase {
  type: "ai-card";
  props: AiCardProps;
}

/** 任意元素（判别联合，按 type narrow props）。 */
export type AnyElement =
  | HeadingElement
  | ParagraphElement
  | BulletListElement
  | ImageElement
  | ChartElement
  | TableElement
  | ShapeElement
  | IconElement
  | CustomHtmlElement
  | CustomSvgElement
  | FormulaElement
  | VideoElement
  | AudioElement
  | KpiElement
  | StatGridElement
  | FeatureCardElement
  | FeatureListElement
  | TimelineElement
  | ProcessElement
  | ComparisonElement
  | SectionTitleElement
  | CalloutElement
  | BadgeElement
  | DividerElement
  | AvatarElement
  | PyramidElement
  | FunnelElement
  | StatHighlightElement
  | OrgChartElement
  | GanttElement
  | MindmapElement
  | AiCardElement;

export type ElementOf<T extends ElementType> = Extract<AnyElement, { type: T }>;

// ────────────────────────────────────────────────────────────────
// 页面 & 版式 slot 规范（4.3）
// ────────────────────────────────────────────────────────────────

export interface Page {
  /** 页 id（全局唯一） */
  id: string;
  /** 参考的版式名（编译时脚手架，坐标仍为绝对值） */
  layout?: string;
  background?: Background;
  transition?: Transition;
  /** 演讲者备注（v0 即入格式，演讲者视图 v2 消费） */
  notes?: string;
  /** 页标题（大纲/缩略图用） */
  title?: string;
  elements: AnyElement[];
}

/** 版式 slot：rect 为 [x,y,w,h] 或 "auto"（布局引擎编译时展开）。 */
export interface Slot {
  rect: Rect | "auto";
  /** 接受的组件类型（约束组件归位，校验器可硬校验） */
  accepts: ElementType[];
}

/** 版式定义：slots 是具名坐标模板。 */
export interface LayoutDef {
  name: string;
  title: string;
  /** 适配尺寸（默认 16:9） */
  size?: DeckSize;
  slots: Record<string, Slot>;
  /** 该版式默认背景（可选） */
  background?: Background;
}

// ────────────────────────────────────────────────────────────────
// Deck
// ────────────────────────────────────────────────────────────────

export interface DeckMeta {
  title?: string;
  author?: string;
  /** 主题名（token 由主题包解析，换主题不动内容） */
  theme: string;
  size?: DeckSize;
}

export interface Deck {
  formatVersion: number;
  meta: DeckMeta;
  pages: Page[];
}

/** 所有内置组件类型清单（校验器、注册表共用）。 */
export const ELEMENT_TYPES: ElementType[] = [
  "heading",
  "paragraph",
  "bullet-list",
  "image",
  "chart",
  "table",
  "shape",
  "icon",
  "custom-html",
  "custom-svg",
  "formula",
  "video",
  "audio",
  // 复合语义组件（WS1）
  "kpi",
  "stat-grid",
  "feature-card",
  "feature-list",
  "timeline",
  "process",
  "comparison",
  "section-title",
  "callout",
  "badge",
  "divider",
  "avatar",
  "pyramid",
  "funnel",
  "stat-highlight",
  "org-chart",
  "gantt",
  "mindmap",
  "ai-card",
];

export function isElementType(x: unknown): x is ElementType {
  return typeof x === "string" && (ELEMENT_TYPES as string[]).includes(x);
}
