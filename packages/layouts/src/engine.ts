/**
 * @oneact/layouts — 两级生成模式（策划书 4.3 根本解）
 *
 * 约束模式（默认，约 90% 页面）：AI 只做"内容 → slot"的语义归类，
 *   坐标取 slot 模板值，AI 完全不写像素数字。
 * 自由坐标模式（逃逸层专用）：AI 直接写 rect，走"生成后校验 + 微调"。
 *
 * auto 高度：slot.rect="auto" 时，引擎按内容（行数 × 行高）展开为具体 rect。
 *   接口稳定，v0 用静态估算；后续渐进增强为内容感知布局引擎（简化 flexbox）。
 */
import {
  estimateTextHeight,
  type Anim,
  type AnyElement,
  type ElementType,
  type LayoutDef,
  type Page,
  type Rect,
  type Slot,
} from "@oneact/schema";
import { getLayout, LAYOUTS } from "./layouts.js";

export interface SlotContent {
  type: ElementType;
  props: Record<string, unknown>;
  id?: string;
  anim?: Anim;
}

export interface ComposeOptions {
  pageId?: string;
  background?: Page["background"];
  /** 开启 auto 高度展开（slot.rect="auto" 时按内容估算）。 */
  autoExpand?: boolean;
}

/**
 * 约束模式：选版式 → 填 slot → 引擎生成元素。
 * assignment = { slotName: { type, props } }，坐标取 slot 模板值。
 */
export function composePage(
  layoutName: string,
  assignment: Record<string, SlotContent>,
  opts: ComposeOptions = {},
): Page {
  const layout = getLayout(layoutName);
  if (!layout) {
    throw new Error(`未知版式：${layoutName}。可用：${Object.keys(LAYOUTS).join(", ")}`);
  }
  const pageId = opts.pageId ?? "p1";
  const elements: AnyElement[] = [];

  for (const [slotName, slot] of Object.entries(layout.slots)) {
    const content = assignment[slotName];
    if (!content) continue;
    const rect = resolveSlotRect(slot, content, opts.autoExpand);
    const el = {
      id: content.id ?? `${pageId}-${slotName}`,
      type: content.type,
      rect,
      props: content.props,
      anim: content.anim,
      slot: slotName,
    } as unknown as AnyElement;
    elements.push(el);
  }

  return {
    id: pageId,
    layout: layoutName,
    background: opts.background ?? layout.background,
    elements,
  };
}

function resolveSlotRect(slot: Slot, content: SlotContent, autoExpand?: boolean): Rect {
  if (Array.isArray(slot.rect)) return slot.rect;
  if (autoExpand) return expandAuto(slot, content);
  return [0, 0, 0, 0];
}

/**
 * auto 高度引擎：slot.rect="auto" 时按内容估算高度。
 * slot 可带 anchor { x, y, w, minH } 声明起点（额外字段）；缺省用安全值。
 */
export function expandAuto(slot: Slot, content: SlotContent): Rect {
  const anchor = (slot as Slot & { anchor?: { x: number; y: number; w: number; minH?: number } }).anchor;
  const x = anchor?.x ?? 64;
  const y = anchor?.y ?? 180;
  const w = anchor?.w ?? 1152;
  const minH = anchor?.minH ?? 60;

  if (content.type === "bullet-list" && Array.isArray((content.props as { items?: unknown[] }).items)) {
    const n = (content.props as { items: unknown[] }).items.length;
    const fs = (content.props as { fontSize?: number }).fontSize ?? 18;
    return [x, y, w, Math.max(minH, n * fs * 1.5 + 16)];
  }
  const text = (content.props as { text?: unknown }).text;
  if (typeof text === "string") {
    const fs = (content.props as { fontSize?: number }).fontSize ?? 18;
    const h = estimateTextHeight(text, fs, w, 1.6) + 16;
    return [x, y, w, Math.max(minH, h)];
  }
  return [x, y, w, minH];
}

/** 快速检查某页是否遵守其声明版式的 slot accepts 约束。 */
export function checkLayout(page: Page, layouts: Record<string, LayoutDef> = LAYOUTS): boolean {
  if (!page.layout) return true;
  const layout = layouts[page.layout];
  if (!layout) return false;
  for (const el of page.elements) {
    if (!el.slot) continue;
    const slot = layout.slots[el.slot];
    if (!slot?.accepts.includes(el.type)) return false;
  }
  return true;
}

/** 列出某版式所有 slot 名（AI 选 slot 用）。 */
export function slotsOf(layoutName: string): string[] {
  const layout = getLayout(layoutName);
  return layout ? Object.keys(layout.slots) : [];
}
