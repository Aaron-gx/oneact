/**
 * @oneact/exporter-pptx — .pptx 降级导出（策划书第 8 节）
 *
 * PptxGenJS 实现。静态页直接映射；动画/交互/逃逸块转静态占位，
 * 并产出**降级报告**（明示丢失项，不偷偷丢东西）。
 * import 本包即把 pptx 导出器注册到 core 的导出器注册表。
 */
import { registerExporter } from "@oneact/core";
import { getTheme, plainText, type AnyElement, type Deck, type RichText, type Run, type Theme } from "@oneact/schema";
import PptxGenJS from "pptxgenjs";

const W_IN = 10;
const H_IN = 5.625; // 16:9 inch（1280×720 / 96dpi×... → 用 10×5.625 保比例）
const SX = W_IN / 1280;
const SY = H_IN / 720;

export interface PptxReportItem {
  kind: string;
  detail: string;
}

type Rect4 = [number, number, number, number];

function inch(rect: Rect4): { x: number; y: number; w: number; h: number } {
  return { x: rect[0] * SX, y: rect[1] * SY, w: rect[2] * SX, h: rect[3] * SY };
}

/** 颜色 → pptx 6 位 hex（无 #）。var() 解析主题，不可解析回退。 */
function color(c: string | undefined, theme: Theme, fallback: string): string {
  if (!c) return fallback;
  if (c.startsWith("#")) return c.replace("#", "").slice(0, 6).toUpperCase();
  const m = /--oa-color-([\w-]+)/.exec(c);
  if (m) {
    const key = m[1] as keyof Theme["colors"];
    const v = theme.colors[key] ?? theme.colors.text;
    return v.replace("#", "").slice(0, 6).toUpperCase();
  }
  return fallback;
}

function runsToText(rich: RichText, theme: Theme): Record<string, unknown>[] {
  const runs: Run[] = typeof rich === "string" ? [{ text: rich }] : rich;
  return runs.map((r) => ({
    text: r.text,
    options: {
      bold: r.bold,
      italic: r.italic,
      underline: r.underline ? { style: "sng" as const } : undefined,
      color: r.color ? color(r.color, theme, "1D1C1A") : undefined,
      fontSize: r.fontSize ? r.fontSize / 1.33 : undefined,
    },
  }));
}

export async function exportPptx(deck: Deck): Promise<{ data: Blob; filename: string; report: PptxReportItem[] }> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "OA", width: W_IN, height: H_IN });
  pptx.layout = "OA";
  pptx.author = deck.meta.author || "OneAct";
  pptx.title = deck.meta.title || "OneAct deck";
  const theme = getTheme(deck.meta.theme);
  const report: PptxReportItem[] = [];

  for (const page of deck.pages) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slide: any = pptx.addSlide();
    if (page.background?.color) slide.background = { color: color(page.background.color, theme, "FFFFFF") };
    if (page.notes) slide.addNotes(page.notes);
    // 兜底：AI/旧文件可能输出非数组 elements；逐元素 try/catch，单个异常元素不致整份导出崩溃。
    const els = Array.isArray(page.elements) ? page.elements : [];
    for (const el of els) {
      try {
        map(slide, pptx, el, theme, report);
      } catch (e) {
        report.push({
          kind: "导出异常",
          detail: `${el?.id ?? "?"}(${el?.type ?? "?"}) 跳过：${(e as Error).message}`,
        });
      }
    }
  }

  const data = (await pptx.write({ outputType: "blob" })) as Blob;
  return { data, filename: (deck.meta.title || "deck") + ".pptx", report };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function map(slide: any, pptx: any, el: AnyElement, theme: Theme, report: PptxReportItem[]): void {
  const r = inch(el.rect);
  if (el.anim) report.push({ kind: "动画", detail: `${el.id} 的「${el.anim.name}」降级为静态（pptx 不保真动画）` });

  switch (el.type) {
    case "heading": {
      const p = el.props;
      const fs = [44, 32, 24][(p.level ?? 1) - 1] / 1.33;
      const c = p.color
        ? color(p.color, theme, "2F54EB")
        : p.tone === "primary"
          ? "2F54EB"
          : p.tone === "accent"
            ? "7C3AED"
            : "1D1C1A";
      slide.addText(runsToText(p.text, theme), {
        ...r,
        fontSize: fs,
        bold: true,
        color: c,
        align: p.align,
        valign: "middle",
      });
      break;
    }
    case "paragraph": {
      const p = el.props;
      slide.addText(runsToText(p.text, theme), {
        ...r,
        fontSize: (p.fontSize ?? 18) / 1.33,
        color: p.color ? color(p.color, theme, "1D1C1A") : "1D1C1A",
        align: p.align,
        valign: "top",
      });
      break;
    }
    case "bullet-list": {
      const p = el.props;
      const fs = (p.fontSize ?? 18) / 1.33;
      const c = p.color ? color(p.color, theme, "1D1C1A") : "1D1C1A";
      const items = p.items.map((it) => ({
        text: plainText(it),
        options: { bullet: p.ordered ? { type: "number" } : true, fontSize: fs, color: c, breakLine: true },
      }));
      slide.addText(items, { ...r, valign: "top" });
      break;
    }
    case "image": {
      const p = el.props;
      if (p.src.startsWith("placeholder:")) {
        slide.addText(`[图片] ${p.src.slice(12)}`, {
          ...r,
          align: "center",
          valign: "middle",
          fontSize: 11,
          color: "888888",
        });
      } else if (p.src.startsWith("data:")) {
        slide.addImage({ data: p.src, ...r });
      } else {
        slide.addImage({ path: p.src, ...r });
      }
      break;
    }
    case "chart": {
      const p = el.props;
      // pptxgenjs 原生图表依赖浏览器侧资源；命令行环境直接降级（浏览器/桌面才映射原生图表）
      if (typeof document !== "undefined") {
        try {
          const CT = pptx.ChartType;
          const ct =
            p.chartType === "line" || p.chartType === "area"
              ? CT.line
              : p.chartType === "pie" || p.chartType === "doughnut"
                ? CT.pie
                : CT.bar;
          const chartData = p.data.series.map((s) => ({ name: s.name, labels: p.data.categories, data: s.values }));
          slide.addChart(ct, chartData, {
            ...r,
            showLegend: p.showLegend ?? false,
            chartColors: theme.chart.map((c) => c.replace("#", "")),
            barDir: p.horizontal ? "bar" : "col",
          });
          if (p.title)
            slide.addText(p.title, {
              x: r.x,
              y: Math.max(0, r.y - 0.32),
              w: r.w,
              h: 0.3,
              fontSize: 11,
              bold: true,
              align: "center",
              color: "1D1C1A",
            });
        } catch (e) {
          slide.addText(`[图表 ${p.chartType}]`, {
            ...r,
            align: "center",
            valign: "middle",
            fontSize: 13,
            color: "888888",
          });
          report.push({
            kind: "图表",
            detail: `${el.id} 降级为占位（pptx 原生图表映射失败：${(e as Error).message}）`,
          });
        }
      } else {
        slide.addText(`[图表 ${p.chartType}]`, {
          ...r,
          align: "center",
          valign: "middle",
          fontSize: 13,
          color: "888888",
        });
        report.push({
          kind: "图表",
          detail: `${el.id} 降级为占位（命令行环境不支持 pptx 原生图表导出，浏览器/桌面可用）`,
        });
      }
      break;
    }
    case "table": {
      const p = el.props;
      const total = p.columns.reduce((a, b) => a + b, 0) || 1;
      const colW = p.columns.map((c) => (r.w * c) / total);
      const fs = (p.fontSize ?? 14) / 1.33;
      const rows = [...(p.head ? [p.head] : []), ...p.rows].map((row) =>
        row.map((cell) => ({ text: plainText(cell), options: { fontSize: fs, valign: "middle" } })),
      );
      slide.addTable(rows, { x: r.x, y: r.y, colW, border: { type: "solid", pt: 1, color: "CCCCCC" } });
      break;
    }
    case "shape": {
      const p = el.props;
      const ST = pptx.ShapeType;
      const t =
        p.shape === "ellipse"
          ? ST.ellipse
          : p.shape === "line"
            ? ST.line
            : p.shape === "triangle"
              ? ST.triangle
              : p.shape === "diamond"
                ? ST.diamond
                : ST.rect;
      slide.addShape(t, {
        ...r,
        fill: { color: p.fill ? color(p.fill, theme, "2F54EB") : "2F54EB" },
        line: p.stroke ? { color: color(p.stroke, theme, "000000"), width: p.strokeWidth } : undefined,
      });
      break;
    }
    case "icon":
      slide.addText(`⟨${el.props.name}⟩`, {
        ...r,
        align: "center",
        valign: "middle",
        fontSize: 24,
        color: color(el.props.color, theme, "2F54EB"),
      });
      report.push({ kind: "图标", detail: `${el.id} 降级为文字占位（矢量图标无法映射 pptx 形状）` });
      break;
    case "formula":
      slide.addText(`$${el.props.latex}$`, {
        ...r,
        align: "center",
        valign: "middle",
        fontSize: 20,
        color: el.props.color ? color(el.props.color, theme, "1D1C1A") : "1D1C1A",
      });
      report.push({ kind: "公式", detail: `${el.id} 降级为纯文本（pptx 不支持 LaTeX 渲染）` });
      break;
    case "video":
      slide.addText("[视频]", { ...r, align: "center", valign: "middle", color: "888888" });
      report.push({ kind: "视频", detail: `${el.id} 降级为占位（pptx 媒体需另行嵌入）` });
      break;
    case "audio":
      slide.addText("[音频]", { ...r, align: "center", valign: "middle", color: "888888" });
      report.push({ kind: "音频", detail: `${el.id} 降级为占位（pptx 媒体需另行嵌入）` });
      break;
    // ── 复合语义组件（WS1）：导出为多行文本（保留内容）+ 降级报告，绝不静默丢弃 ──
    case "kpi": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      lines.push({
        text: plainText(p.value),
        options: { fontSize: 28, bold: true, color: p.tone === "accent" ? "7C3AED" : "2F54EB", breakLine: true },
      });
      if (p.label)
        lines.push({ text: plainText(p.label), options: { fontSize: 12, color: "5B5A55", breakLine: true } });
      if (p.trend)
        lines.push({
          text: plainText(p.trend.text),
          options: { fontSize: 11, color: p.trend.dir === "down" ? "DC2626" : "16A34A" },
        });
      slide.addText(lines, { ...r, valign: "middle", align: "left" });
      report.push({ kind: "复合组件", detail: `${el.id}(kpi) 降级为纯文本卡片（pptx 不保真卡片样式）` });
      break;
    }
    case "stat-grid": {
      const p = el.props;
      const lines = p.cells.map((c) => ({
        text: `${plainText(c.value)}    ${c.label ? plainText(c.label) : ""}`,
        options: { fontSize: 16, bold: true, color: c.tone === "accent" ? "7C3AED" : "2F54EB", breakLine: true },
      }));
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(stat-grid) 降级为多行文本（${p.cells.length} 个指标）` });
      break;
    }
    case "feature-card": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      lines.push({
        text: plainText(p.title),
        options: { fontSize: 18, bold: true, color: p.tone === "accent" ? "7C3AED" : "2F54EB", breakLine: true },
      });
      if (p.desc) lines.push({ text: plainText(p.desc), options: { fontSize: 12, color: "5B5A55" } });
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(feature-card) 降级为纯文本（pptx 不保真卡片样式）` });
      break;
    }
    case "feature-list": {
      const p = el.props;
      const lines = p.items.map((it, i) => ({
        text: `${p.numbered ? i + 1 + ". " : "• "}${plainText(it.title)}${it.desc ? " — " + plainText(it.desc) : ""}`,
        options: { fontSize: 14, breakLine: true },
      }));
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(feature-list) 降级为多行文本` });
      break;
    }
    case "timeline": {
      const p = el.props;
      const lines = p.items.map((it) => ({
        text: `${it.time ? plainText(it.time) + "  " : ""}${plainText(it.title)}${it.desc ? " — " + plainText(it.desc) : ""}`,
        options: { fontSize: 14, breakLine: true },
      }));
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(timeline) 降级为多行文本（不保真时间轴连线）` });
      break;
    }
    case "process": {
      const p = el.props;
      const lines = p.steps.map((s, i) => ({
        text: `${p.numbered === false ? "▸ " : i + 1 + ". "}${plainText(s.title)}${s.desc ? " — " + plainText(s.desc) : ""}`,
        options: { fontSize: 14, breakLine: true },
      }));
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(process) 降级为多行文本（不保真步骤箭头）` });
      break;
    }
    case "comparison": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      lines.push({
        text: plainText(p.left.title),
        options: { fontSize: 16, bold: true, color: "DC2626", breakLine: true },
      });
      (p.left.items ?? []).forEach((it) =>
        lines.push({ text: "✗ " + plainText(it), options: { fontSize: 12, color: "DC2626", breakLine: true } }),
      );
      lines.push({ text: " ", options: { fontSize: 6, breakLine: true } });
      lines.push({
        text: plainText(p.right.title),
        options: { fontSize: 16, bold: true, color: "16A34A", breakLine: true },
      });
      (p.right.items ?? []).forEach((it) =>
        lines.push({ text: "✓ " + plainText(it), options: { fontSize: 12, color: "16A34A", breakLine: true } }),
      );
      slide.addText(lines, { ...r, valign: "top" });
      report.push({ kind: "复合组件", detail: `${el.id}(comparison) 降级为多行文本（不保真左右分栏底色）` });
      break;
    }
    case "section-title": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      if (p.kicker)
        lines.push({
          text: plainText(p.kicker),
          options: { fontSize: 11, bold: true, color: "2F54EB", breakLine: true },
        });
      lines.push({
        text: plainText(p.title),
        options: { fontSize: 28, bold: true, color: "1D1C1A", breakLine: p.subtitle ? true : false },
      });
      if (p.subtitle) lines.push({ text: plainText(p.subtitle), options: { fontSize: 14, color: "5B5A55" } });
      slide.addText(lines, { ...r, valign: "middle", align: p.align ?? "left" });
      report.push({ kind: "复合组件", detail: `${el.id}(section-title) 降级为纯文本（不保真装饰竖条）` });
      break;
    }
    case "callout": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      if (p.title) lines.push({ text: plainText(p.title), options: { fontSize: 14, bold: true, breakLine: true } });
      lines.push({ text: plainText(p.text), options: { fontSize: 13 } });
      slide.addText(lines, { ...r, valign: "middle" });
      report.push({ kind: "复合组件", detail: `${el.id}(callout) 降级为纯文本（不保真提示框配色）` });
      break;
    }
    case "badge":
      slide.addText(plainText(el.props.text), {
        ...r,
        align: "center",
        valign: "middle",
        fontSize: 12,
        bold: true,
        color: "2F54EB",
      });
      report.push({ kind: "复合组件", detail: `${el.id}(badge) 降级为纯文本（不保真胶囊底色）` });
      break;
    case "divider":
      slide.addShape(pptx.ShapeType.line, { ...r, line: { color: "CCCCCC", width: 1 } });
      report.push({ kind: "复合组件", detail: `${el.id}(divider) 导出为线条` });
      break;
    case "avatar": {
      const p = el.props;
      const lines: Record<string, unknown>[] = [];
      lines.push({ text: plainText(p.name), options: { fontSize: 16, bold: true, breakLine: true } });
      if (p.role) lines.push({ text: plainText(p.role), options: { fontSize: 12, color: "5B5A55" } });
      slide.addText(lines, { ...r, align: "center", valign: "middle" });
      report.push({ kind: "复合组件", detail: `${el.id}(avatar) 降级为纯文本（不保真圆形头像）` });
      break;
    }
    case "custom-html":
      slide.addText("[自定义 HTML]", { ...r, align: "center", valign: "middle", fontSize: 11, color: "888888" });
      report.push({ kind: "HTML 逃逸块", detail: `${el.id} 降级为静态占位（pptx 不支持任意 HTML/脚本）` });
      break;
    case "custom-svg":
      slide.addText("[自定义 SVG]", { ...r, align: "center", valign: "middle", fontSize: 11, color: "888888" });
      report.push({ kind: "SVG 逃逸块", detail: `${el.id} 降级为静态占位（pptx 不直接支持内联 SVG）` });
      break;
    default: {
      // 安全网（WS5）：未知类型绝不静默丢失，降级为可见占位 + 报告。
      // switch 已穷尽当前联合，default 仅在未来新增类型未适配时触发，故 cast 取字段。
      const e = el as AnyElement;
      slide.addText(`[未支持组件：${e.type}]`, {
        ...r,
        align: "center",
        valign: "middle",
        fontSize: 11,
        color: "888888",
      });
      report.push({ kind: "未支持组件", detail: `${e.id}(${e.type}) 导出器未实现，降级为占位（内容可能丢失）` });
    }
  }
}

registerExporter({
  name: "pptx",
  label: ".pptx（降级导出，附降级报告）",
  ext: ".pptx",
  mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  export: async (deck) => {
    const { data, filename } = await exportPptx(deck);
    return { data, filename, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  },
});
