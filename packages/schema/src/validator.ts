/**
 * @oneact/schema — 校验器（机器可校验性 = 框架的灵魂）
 *
 * 规则分两级：
 *   硬错误（打回，必须修复）：越界 / id 重复 / 未知类型 / 必填缺失 / slot accepts 不符
 *   软警告（提示，应修复）：重叠>20% / 字号过小 / 对比度不足 / 文本溢出 / 元素>12 / slot 越界 / a11y / 逃逸块可疑
 *
 * 测量方式：本文件用纯计算做"渲染前快速预检"；终审由 core 的离屏真实测量补充。
 */
import { FORMAT_VERSION, canvasSize } from "./format.js";
import {
  area,
  contrastRatio,
  estimateTextHeight,
  intersectArea,
  isInside,
  outOfBounds,
  overlapRatio,
  scanEscape,
  toBox,
  type Box,
} from "./geom.js";
import { FONT_SIZE_LIMITS, getTheme, type Theme } from "./themes.js";
import {
  isElementType,
  plainText,
  toRuns,
  type AnyElement,
  type Deck,
  type ElementType,
  type LayoutDef,
  type Page,
  type RichText,
} from "./types.js";

export type Severity = "error" | "warning";

export interface Issue {
  severity: Severity;
  /** 规则 id（机读） */
  rule: string;
  /** 人类可读说明 */
  message: string;
  pageId?: string;
  elementId?: string;
  detail?: Record<string, unknown>;
}

export interface ValidationResult {
  /** 无硬错误。 */
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

export interface ValidateOptions {
  /** 供 slot 越界 / accepts 检查的版式表。 */
  layouts?: Record<string, LayoutDef>;
  /** 指定主题（默认取 deck.meta.theme）。 */
  theme?: Theme;
  /** slot 越界报硬错误而非软警告。 */
  strictSlots?: boolean;
  /** 关闭软警告（仅返回硬错误）。 */
  warningsOnlyErrors?: boolean;
}

function make(severity: Severity, rule: string, message: string, ctx: Partial<Issue> = {}): Issue {
  return { severity, rule, message, ...ctx };
}

// ──────────────────────────────── 文本色 / 背景解析 ────────────────────────────────

function toneColor(tone: string | undefined, theme: Theme, fallback: keyof Theme["colors"]): string {
  const c = theme.colors;
  switch (tone) {
    case "primary":
      return c.primary;
    case "accent":
      return c.accent;
    case "text":
      return c.text;
    case "text-secondary":
      return c["text-secondary"];
    default:
      return c[fallback];
  }
}

function resolveFg(el: AnyElement, theme: Theme): string | null {
  switch (el.type) {
    case "heading":
      return el.props.color ?? toneColor(el.props.tone, theme, "text");
    case "paragraph":
      return el.props.color ?? toneColor(el.props.tone ?? "text", theme, "text");
    case "bullet-list":
      return el.props.color ?? theme.colors.text;
    case "table":
      return theme.colors.text;
    default:
      return null;
  }
}

function resolveBg(page: Page, theme: Theme): string {
  const bg = page.background;
  if (bg?.color) return bg.color;
  if (bg?.gradient?.from) return bg.gradient.from;
  return theme.colors.bg;
}

// ──────────────────────────────── 单元素规则 ────────────────────────────────

function checkRequired(el: AnyElement, pageId: string, push: (i: Issue) => void): void {
  // 校验器面对的是运行时数据（LLM/用户手写），字段可能缺失，故以宽松 Record 视之。
  const p = (el.props ?? {}) as unknown as Record<string, unknown>;
  const need = (cond: unknown, field: string) => {
    if (!cond)
      push(make("error", "missing-field", `${el.type}.${field} 必填`, { pageId, elementId: el.id, detail: { field } }));
  };
  switch (el.type) {
    case "heading":
    case "paragraph":
      need(p.text != null && plainText(p.text as RichText) !== "", "text");
      break;
    case "bullet-list":
      need(Array.isArray(p.items) && (p.items as unknown[]).length > 0, "items");
      break;
    case "image":
      need(typeof p.src === "string" && p.src !== "", "src");
      break;
    case "chart": {
      need(typeof p.chartType === "string" && p.chartType !== "", "chartType");
      const d = p.data as { categories?: unknown[]; series?: { name?: string; values?: unknown[] }[] } | undefined;
      need(d && Array.isArray(d.categories), "data.categories");
      need(d && Array.isArray(d.series) && d.series.length > 0, "data.series");
      if (d && Array.isArray(d.series)) {
        const cats = d.categories;
        d.series.forEach((s, i) => {
          if (!Array.isArray(s.values))
            push(
              make("error", "missing-field", `chart.data.series[${i}].values 必填为数组`, { pageId, elementId: el.id }),
            );
          else if (cats && s.values.length !== cats.length)
            push(
              make(
                "warning",
                "chart-length-mismatch",
                `chart.data.series[${i}] 的 values 长度(${s.values.length})与 categories(${cats.length})不一致`,
                { pageId, elementId: el.id },
              ),
            );
        });
      }
      break;
    }
    case "table": {
      need(Array.isArray(p.columns) && (p.columns as number[]).length > 0, "columns");
      need(Array.isArray(p.rows), "rows");
      if (Array.isArray(p.rows) && Array.isArray(p.columns)) {
        const ncols = (p.columns as number[]).length;
        (p.rows as unknown[][]).forEach((row, i) => {
          if (!Array.isArray(row) || row.length !== ncols)
            push(
              make(
                "error",
                "table-shape",
                `table.rows[${i}] 列数(${Array.isArray(row) ? row.length : 0})≠columns(${ncols})`,
                {
                  pageId,
                  elementId: el.id,
                },
              ),
            );
        });
      }
      break;
    }
    case "shape":
      need(typeof p.shape === "string" && p.shape !== "", "shape");
      break;
    case "icon":
      need(typeof p.name === "string" && p.name !== "", "name");
      break;
    case "custom-html":
      need(typeof p.html === "string" && p.html !== "", "html");
      break;
    case "custom-svg":
      need(typeof p.svg === "string" && p.svg !== "", "svg");
      break;
    // ── 复合语义组件（WS1）必填字段（均加空值守卫，防 plainText 崩）──
    case "kpi":
      need(p.value != null && plainText(p.value as RichText) !== "", "value");
      break;
    case "stat-grid":
      need(Array.isArray(p.cells) && (p.cells as unknown[]).length > 0, "cells");
      break;
    case "feature-card":
      need(p.title != null && plainText(p.title as RichText) !== "", "title");
      break;
    case "feature-list":
      need(Array.isArray(p.items) && (p.items as unknown[]).length > 0, "items");
      break;
    case "timeline":
      need(Array.isArray(p.items) && (p.items as unknown[]).length > 0, "items");
      break;
    case "process":
      need(Array.isArray(p.steps) && (p.steps as unknown[]).length > 0, "steps");
      break;
    case "comparison": {
      const l = p.left as { title?: RichText } | undefined;
      const r = p.right as { title?: RichText } | undefined;
      need(l?.title != null && plainText(l.title) !== "", "left.title");
      need(r?.title != null && plainText(r.title) !== "", "right.title");
      break;
    }
    case "section-title":
      need(p.title != null && plainText(p.title as RichText) !== "", "title");
      break;
    case "callout":
      need(p.text != null && plainText(p.text as RichText) !== "", "text");
      break;
    case "badge":
      need(p.text != null && plainText(p.text as RichText) !== "", "text");
      break;
    case "divider":
      break; // 无必填字段
    case "avatar":
      need(p.name != null && plainText(p.name as RichText) !== "", "name");
      break;
  }
}

function checkFontSize(el: AnyElement, push: (i: Issue) => void, pageId: string): void {
  if (el.type === "paragraph" && typeof el.props.fontSize === "number" && el.props.fontSize < FONT_SIZE_LIMITS.body) {
    push(
      make("warning", "font-size", `正文字号 ${el.props.fontSize}px < ${FONT_SIZE_LIMITS.body}px`, {
        pageId,
        elementId: el.id,
      }),
    );
  }
  if (el.type === "bullet-list" && typeof el.props.fontSize === "number" && el.props.fontSize < FONT_SIZE_LIMITS.body) {
    push(
      make("warning", "font-size", `列表字号 ${el.props.fontSize}px < ${FONT_SIZE_LIMITS.body}px`, {
        pageId,
        elementId: el.id,
      }),
    );
  }
  if (el.type === "table" && typeof el.props.fontSize === "number" && el.props.fontSize < FONT_SIZE_LIMITS.body) {
    push(
      make("warning", "font-size", `表格字号 ${el.props.fontSize}px < ${FONT_SIZE_LIMITS.body}px`, {
        pageId,
        elementId: el.id,
      }),
    );
  }
}

function checkContrast(el: AnyElement, page: Page, theme: Theme, push: (i: Issue) => void): void {
  const fg = resolveFg(el, theme);
  if (!fg) return;
  const bg = resolveBg(page, theme);
  const ratio = contrastRatio(fg, bg);
  if (ratio != null && ratio < 4.5) {
    push(
      make("warning", "contrast", `文字与背景对比度 ${ratio.toFixed(2)} < 4.5`, {
        pageId: page.id,
        elementId: el.id,
        detail: { ratio: Number(ratio.toFixed(2)) },
      }),
    );
  }
}

function checkOverflow(el: AnyElement, push: (i: Issue) => void, pageId: string): void {
  const box = toBox(el.rect);
  if (box.h <= 0 || box.w <= 0) return;
  let text = "";
  let fs = 18;
  let lh = 1.5;
  if (el.type === "heading") {
    text = plainText(el.props.text);
    fs = [48, 34, 26][(el.props.level ?? 1) - 1];
    lh = 1.25;
  } else if (el.type === "paragraph") {
    text = plainText(el.props.text);
    fs = el.props.fontSize ?? 18;
    lh = el.props.lineHeight ?? 1.7;
  } else if (el.type === "bullet-list") {
    text = el.props.items.map((i) => plainText(i)).join("\n");
    fs = el.props.fontSize ?? 18;
    lh = el.props.lineHeight ?? 1.55;
  } else if (el.type === "table") {
    // 表格：行高内容驱动，逐单元格估算取行最大，累加 vs rect.h（策划书 4.10）
    const p = el.props;
    const cols = p.columns;
    const ncols = cols.length || 1;
    const total = cols.reduce((a, b) => a + b, 0) || 1;
    const widths = cols.map((c) => (box.w * c) / total);
    const tfs = p.fontSize ?? 14;
    const rows: RichText[][] = [...(p.head ? [p.head] : []), ...p.rows];
    let totalH = 0;
    for (const row of rows) {
      let maxCell = 0;
      row.forEach((cell, ci) => {
        const h = estimateTextHeight(plainText(cell), tfs, widths[ci] ?? box.w / ncols, 1.4) + 20;
        if (h > maxCell) maxCell = h;
      });
      totalH += maxCell || tfs * 1.4 + 20;
    }
    if (totalH > box.h + 1) {
      push(
        make("warning", "text-overflow", `表格估算溢出约 ${Math.round(totalH - box.h)}px`, {
          pageId,
          elementId: el.id,
          detail: { estimated: Math.round(totalH), capacity: Math.round(box.h) },
        }),
      );
    }
    return;
  } else {
    return;
  }
  const estimated = estimateTextHeight(text, fs, box.w, lh);
  if (estimated > box.h + 1) {
    push(
      make("warning", "text-overflow", `文本估算溢出约 ${Math.round(estimated - box.h)}px`, {
        pageId,
        elementId: el.id,
        detail: { estimated: Math.round(estimated), capacity: Math.round(box.h) },
      }),
    );
  }
}

function checkA11y(el: AnyElement, push: (i: Issue) => void, pageId: string): void {
  if (el.type === "image" && (!el.props.alt || el.props.alt.trim() === "")) {
    push(make("warning", "a11y-alt", `image 缺少 alt（无障碍）`, { pageId, elementId: el.id }));
  }
  if (el.type === "chart" && (!el.props.summary || el.props.summary.trim() === "")) {
    push(make("warning", "a11y-summary", `chart 缺少 summary 文字摘要（无障碍）`, { pageId, elementId: el.id }));
  }
}

function checkEscape(el: AnyElement, push: (i: Issue) => void, pageId: string): void {
  if (el.type === "custom-html") {
    const hits = scanEscape(el.props.html);
    if (hits.length) {
      push(
        make("warning", "escape-unsafe", `custom-html 含可疑内容：${hits.map((h) => h.tag).join(", ")}（将隔离消毒）`, {
          pageId,
          elementId: el.id,
          detail: { hits },
        }),
      );
    }
    if (!el.props.trusted) {
      push(
        make("warning", "escape-sandboxed", `custom-html 未授权(trusted)，将以沙箱隔离渲染`, {
          pageId,
          elementId: el.id,
        }),
      );
    }
  } else if (el.type === "custom-svg") {
    const hits = scanEscape(el.props.svg);
    if (hits.length) {
      push(
        make("warning", "escape-unsafe", `custom-svg 含可疑内容：${hits.map((h) => h.tag).join(", ")}（将消毒）`, {
          pageId,
          elementId: el.id,
          detail: { hits },
        }),
      );
    }
  }
}

// ──────────────────────────────── 主校验 ────────────────────────────────

export function validatePage(page: Page, options: ValidateOptions = {}): Issue[] {
  const issues: Issue[] = [];
  // 防御：LLM 可能输出残缺 page（缺 elements / 不是对象）。返回可自愈的硬错误，而非崩溃。
  if (!page || typeof page !== "object" || !Array.isArray((page as { elements?: unknown }).elements)) {
    issues.push(
      make(
        "error",
        "page-malformed",
        "页面缺少 elements 数组（模型输出不完整）。请输出完整的单个 page 对象 JSON：{\"id\":...,\"layout\":...,\"title\":...,\"elements\":[...]}",
        { pageId: (page as { id?: string })?.id },
      ),
    );
    return issues;
  }
  const theme = options.theme ?? getTheme();
  const canvas = canvasSize();

  const elIds = new Set<string>();
  const boxes: { id: string; box: Box; type: ElementType }[] = [];

  if (page.elements.length > 12) {
    issues.push(
      make("warning", "too-many-elements", `页面元素数 ${page.elements.length} > 12，信息过载`, {
        pageId: page.id,
        detail: { count: page.elements.length },
      }),
    );
  }

  for (const el of page.elements) {
    // 防御：元素本身可能是 null/非对象（LLM 残缺输出）
    if (!el || typeof el !== "object") {
      issues.push(make("error", "element-malformed", `元素为空或非对象`, { pageId: page.id }));
      continue;
    }
    if (!el.id) {
      issues.push(make("error", "element-id-missing", `元素缺少 id`, { pageId: page.id }));
    } else if (elIds.has(el.id)) {
      issues.push(
        make("error", "element-id-duplicate", `元素 id 重复：${el.id}`, { pageId: page.id, elementId: el.id }),
      );
    } else {
      elIds.add(el.id);
    }

    if (!isElementType(el.type)) {
      issues.push(
        make("error", "unknown-type", `未知组件类型：${String(el.type)}`, { pageId: page.id, elementId: el.id }),
      );
      continue;
    }

    // 防御：LLM 偶发输出缺 rect 的元素，避免 toBox 解构崩溃
    if (!Array.isArray(el.rect) || el.rect.length < 4) {
      issues.push(
        make("error", "element-malformed", `元素 #${el.id} 缺少合法 rect（[x,y,w,h]）`, {
          pageId: page.id,
          elementId: el.id,
        }),
      );
      continue;
    }

    const box = toBox(el.rect);
    boxes.push({ id: el.id || "?", box, type: el.type });

    // 边界（小偏差降级为警告，避免 AI 坐标几像素误差报硬错误）
    const oob = outOfBounds(box, canvas);
    if (oob.total > 0.5) {
      const sev: Severity = oob.total > 8 ? "error" : "warning";
      issues.push(
        make(sev, "out-of-bounds", `元素超出画布边界约 ${Math.round(oob.total)}px`, {
          pageId: page.id,
          elementId: el.id,
          detail: oob,
        }),
      );
    }

    // 防御：各项 check 假设 props 完整；LLM 残缺输出（bullet-list 缺 items、table 缺 columns/rows、
    // chart 缺 data…）会让 check*.map/reduce 崩溃。这里整体 try/catch，崩溃 → 可自愈的 element-malformed 错误。
    try {
      checkRequired(el, page.id, (i) => issues.push(i));
      checkFontSize(el, (i) => issues.push(i), page.id);
      checkContrast(el, page, theme, (i) => issues.push(i));
      checkOverflow(el, (i) => issues.push(i), page.id);
      checkA11y(el, (i) => issues.push(i), page.id);
      checkEscape(el, (i) => issues.push(i), page.id);
    } catch (e) {
      issues.push(
        make(
          "error",
          "element-malformed",
          `元素 #${el.id || "?"} 结构不完整：${(e as Error).message}。请输出完整 props（bullet-list 需 items、table 需 columns/rows、chart 需 data.categories/series 等）`,
          { pageId: page.id, elementId: el.id },
        ),
      );
    }
  }

  // 重叠 > 20%（豁免：shape 作为背景层完全包含另一元素 —— 全画布装饰/卡片底色，属正常叠加，不是错误）
  const containsBox = (
    o: { x: number; y: number; w: number; h: number },
    n: { x: number; y: number; w: number; h: number },
  ) => o.x <= n.x + 0.5 && o.y <= n.y + 0.5 && o.x + o.w >= n.x + n.w - 0.5 && o.y + o.h >= n.y + n.h - 0.5;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      const r = overlapRatio(a.box, b.box);
      if (r > 0.2) {
        const isBgContainer =
          (a.type === "shape" && containsBox(a.box, b.box)) || (b.type === "shape" && containsBox(b.box, a.box));
        if (isBgContainer) continue;
        issues.push(
          make("warning", "overlap", `元素重叠 ${(r * 100).toFixed(0)}%：${a.id} ↔ ${b.id}`, {
            pageId: page.id,
            detail: { a: a.id, b: b.id, ratio: Number(r.toFixed(2)) },
          }),
        );
      }
    }
  }

  // 孤立容器检测（WS5）：卡片级 shape 上若无任何内容元素落座，疑似漏放内容（空卡片）。
  // 直接命中「建模五步法」式的空方框问题；该 warning 喂入自愈循环，AI 会补内容或改用复合组件。
  for (const s of boxes) {
    if (s.type !== "shape") continue;
    const sb = s.box;
    const a = area(sb);
    if (sb.w < 150 || sb.h < 100 || a > 700000) continue; // 仅卡片级，排除细条/圆点/全画布装饰
    const hasContent = boxes.some((o) => {
      if (o.id === s.id || o.type === "shape") return false; // 只认内容元素
      const oa = area(o.box);
      return oa > 0 && intersectArea(sb, o.box) / oa >= 0.5; // 内容元素过半落在卡片上
    });
    if (!hasContent) {
      issues.push(
        make("warning", "orphan-container", `孤立卡片形状 #${s.id} 上无内容元素，疑似漏放内容`, {
          pageId: page.id,
          elementId: s.id,
          detail: { w: sb.w, h: sb.h },
        }),
      );
    }
  }

  // slot 越界 / accepts
  if (page.layout) {
    const def = options.layouts?.[page.layout];
    if (!def) {
      issues.push(
        make("warning", "layout-unknown", `版式 "${page.layout}" 未注册，slot 校验已跳过`, { pageId: page.id }),
      );
    } else {
      for (const el of page.elements) {
        if (!el.slot) continue;
        const slot = def.slots[el.slot];
        if (!slot) {
          issues.push(
            make("error", "slot-unknown", `元素引用了版式 ${page.layout} 中不存在的 slot "${el.slot}"`, {
              pageId: page.id,
              elementId: el.id,
            }),
          );
          continue;
        }
        if (Array.isArray(slot.rect) && !isInside(toBox(el.rect), toBox(slot.rect))) {
          const sev: Severity = options.strictSlots ? "error" : "warning";
          issues.push(
            make(sev, "slot-overflow", `元素超出 slot "${el.slot}" 范围`, { pageId: page.id, elementId: el.id }),
          );
        }
        if (!slot.accepts.includes(el.type)) {
          issues.push(
            make(
              "error",
              "slot-accepts",
              `元素类型 ${el.type} 不被 slot "${el.slot}" 接受（${slot.accepts.join(" | ")}）`,
              {
                pageId: page.id,
                elementId: el.id,
              },
            ),
          );
        }
      }
    }
  }

  return issues;
}

export function validateDeck(deck: Deck, options: ValidateOptions = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const theme = options.theme ?? getTheme(deck.meta?.theme);

  const addIssue = (i: Issue) => (i.severity === "error" ? errors.push(i) : warnings.push(i));

  // formatVersion
  if (typeof deck.formatVersion !== "number") {
    errors.push(make("error", "format-version", "deck.formatVersion 缺失"));
  } else if (deck.formatVersion > FORMAT_VERSION) {
    errors.push(
      make(
        "error",
        "format-version",
        `formatVersion ${deck.formatVersion} 高于运行时支持的 ${FORMAT_VERSION}，请升级 OneAct`,
        {
          detail: { got: deck.formatVersion, supported: FORMAT_VERSION },
        },
      ),
    );
  }

  // meta
  if (!deck.meta?.theme) {
    warnings.push(make("warning", "theme-missing", "meta.theme 缺失，将使用默认主题"));
  }

  // pages
  if (!Array.isArray(deck.pages) || deck.pages.length === 0) {
    errors.push(make("error", "no-pages", "deck 至少需要一页"));
  } else {
    const pageIds = new Set<string>();
    for (const page of deck.pages) {
      if (!page.id) {
        errors.push(make("error", "page-id-missing", "页面缺少 id"));
        continue;
      }
      if (pageIds.has(page.id)) {
        errors.push(make("error", "page-id-duplicate", `页面 id 重复：${page.id}`, { pageId: page.id }));
      }
      pageIds.add(page.id);

      const pageIssues = validatePage(page, { ...options, theme });
      pageIssues.forEach(addIssue);
    }
  }

  const all: Issue[] = [...errors, ...warnings];
  void all;
  return { ok: errors.length === 0, errors, warnings };
}

/** 把校验结果格式化为人类可读文本（CLI / AI 自愈提示用）。 */
export function formatIssues(result: ValidationResult): string {
  if (result.ok && result.warnings.length === 0) return "✓ 校验通过，无问题。";
  const lines: string[] = [];
  for (const e of result.errors) {
    lines.push(`✗ [${e.rule}] ${loc(e)} ${e.message}`);
  }
  for (const w of result.warnings) {
    lines.push(`⚠ [${w.rule}] ${loc(w)} ${w.message}`);
  }
  return lines.join("\n");
}

function loc(i: Issue): string {
  return [i.pageId, i.elementId]
    .filter(Boolean)
    .map((x) => `#${x}`)
    .join(" ");
}

export { toRuns };
