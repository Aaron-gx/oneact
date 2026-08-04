/**
 * @oneact/core — 组件注册表
 *
 * 组件渲染器 = (element, ctx) => 内部 HTML 字符串。
 * 字符串渲染（非直接 DOM）使核心可在 node 测试、在浏览器 innerHTML 挂载，平台无关。
 * 具体组件渲染器由 @oneact/components 注册。
 */
import type { AnyElement, Theme } from "@oneact/schema";

export interface RenderContext {
  theme: Theme;
  pageId: string;
  elementId: string;
}

export type ComponentRenderer = (el: AnyElement, ctx: RenderContext) => string;

const registry = new Map<string, ComponentRenderer>();

/** 注册单个组件渲染器。 */
export function registerComponent(type: string, renderer: ComponentRenderer): void {
  registry.set(type, renderer);
}

/** 批量注册（组件包入口常用）。 */
export function registerComponents(map: Record<string, ComponentRenderer>): void {
  for (const [k, v] of Object.entries(map)) registry.set(k, v);
}

export function hasComponent(type: string): boolean {
  return registry.has(type);
}

export function listComponents(): string[] {
  return [...registry.keys()];
}

/** 渲染元素内部 HTML；未知类型返回可见占位（不抛错，保证渲染不中断）。 */
export function renderInner(el: AnyElement, ctx: RenderContext): string {
  const r = registry.get(el.type);
  if (!r) {
    return `<div style="color:#dc2626;padding:8px;border:1px dashed #dc2626;border-radius:4px;font-size:14px">未知组件类型：${escapeHtml(el.type)}</div>`;
  }
  return r(el, ctx);
}

/** HTML 转义（防注入，文本类组件必用）。 */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
