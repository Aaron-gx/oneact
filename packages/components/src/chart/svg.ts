/**
 * @oneact/components/chart — 手绘 SVG 图表（v0.1 零依赖实现）
 *
 * 图表语义层（策划书 4.9）：AI 只写 chartType + data，本模块翻译为 SVG。
 * 颜色全部走主题 var(--oa-chart)，换肤自动生效。
 * 支持：bar（分组）· line（可平滑）· area · pie · doughnut。
 * viewBox 固定 1000×560 逻辑坐标，容器 scale 即可，矢量不糊。
 */
import { escapeHtml } from "@oneact/core";
import type { ChartProps, Theme } from "@oneact/schema";

const VBW = 1000;
const VBH = 560;

export function renderChart(props: ChartProps, theme: Theme): string {
  const ariaLabel = escapeHtml(props.summary ?? props.title ?? "图表");
  const titleEl = props.title
    ? `<text x="${VBW / 2}" y="38" text-anchor="middle" font-size="28" font-weight="700" fill="var(--oa-color-text)" font-family="var(--oa-font-heading)">${escapeHtml(
        props.title,
      )}</text>`
    : "";
  const palette = props.seriesColors ?? theme.chart;
  const top = props.title ? 74 : 30;
  const body =
    props.chartType === "pie" || props.chartType === "doughnut"
      ? renderPie(props, palette, top)
      : props.chartType === "radar"
        ? renderRadar(props, palette, top)
        : renderAxisChart(props, palette, top);
  return `<svg viewBox="0 0 ${VBW} ${VBH}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${ariaLabel}" font-family="var(--oa-font-body)">${titleEl}${body}</svg>`;
}

// ──────────────────────────── 数值格式化 / 刻度 ────────────────────────────

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e8) return trim(v / 1e8) + "亿";
  if (a >= 1e4) return trim(v / 1e4) + "万";
  if (a >= 1000) return trim(v / 1000) + "k";
  return String(Math.round(v * 100) / 100);
}
function trim(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}
function pct(f: number): string {
  return (f * 100).toFixed(1).replace(/\.0$/, "") + "%";
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  let nice: number;
  if (n <= 1) nice = 1;
  else if (n <= 1.5) nice = 1.5;
  else if (n <= 2) nice = 2;
  else if (n <= 3) nice = 3;
  else if (n <= 5) nice = 5;
  else if (n <= 7.5) nice = 7.5;
  else nice = 10;
  return nice * mag;
}

// ──────────────────────────── 坐标轴图（bar / line / area）────────────────────────────

function renderAxisChart(props: ChartProps, palette: string[], top: number): string {
  const L = 76;
  const R = VBW - 30;
  const B = VBH - 50;
  const T = top;
  const cats = props.data.categories;
  const series = props.data.series;
  const allVals = series.flatMap((s) => s.values);
  const rawMax = allVals.length ? Math.max(0, ...allVals) : 0;
  const rawMin = allVals.length ? Math.min(0, ...allVals) : 0;
  const hasNeg = rawMin < 0;
  const max = niceCeil(rawMax);
  const min = hasNeg ? -niceCeil(-rawMin) : 0;
  const range = max - min || 1;
  const plotW = R - L;
  const plotH = B - T;
  const x = (i: number) => L + (plotW * (i + 0.5)) / cats.length;
  const y = (v: number) => B - (plotH * (v - min)) / range;
  const zeroY = y(0);

  // 网格 + y 轴标签
  const ticks = 4;
  let grid = "";
  for (let t = 0; t <= ticks; t++) {
    const val = min + (range * t) / ticks;
    const yy = y(val);
    grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${R}" y2="${yy.toFixed(1)}" stroke="var(--oa-color-border)" stroke-width="1"/>`;
    grid += `<text x="${L - 12}" y="${(yy + 5).toFixed(1)}" text-anchor="end" font-size="15" fill="var(--oa-color-text-secondary)">${fmt(val)}</text>`;
  }
  const zeroLine = hasNeg
    ? `<line x1="${L}" y1="${zeroY}" x2="${R}" y2="${zeroY}" stroke="var(--oa-color-text-secondary)" stroke-width="1.5"/>`
    : "";
  const xlabels = cats
    .map(
      (c, i) =>
        `<text x="${x(i).toFixed(1)}" y="${B + 26}" text-anchor="middle" font-size="15" fill="var(--oa-color-text-secondary)">${escapeHtml(c)}</text>`,
    )
    .join("");

  let seriesEls = "";
  if (props.chartType === "bar") {
    const groupW = plotW / cats.length;
    const groupPad = groupW * 0.25;
    const barW = (groupW - groupPad) / series.length;
    series.forEach((s, si) => {
      const color = s.color ?? palette[si % palette.length];
      s.values.forEach((v, ci) => {
        const gx = L + groupW * ci + groupPad / 2 + barW * si;
        const top0 = v >= 0 ? y(v) : zeroY;
        const h = Math.abs(y(v) - zeroY);
        seriesEls += `<rect x="${gx.toFixed(1)}" y="${top0.toFixed(1)}" width="${(barW * 0.9).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${color}" rx="2"><title>${escapeHtml(
          s.name,
        )}: ${fmt(v)}</title></rect>`;
      });
    });
  } else {
    // line / area
    const smooth = props.smooth;
    series.forEach((s, si) => {
      const color = s.color ?? palette[si % palette.length];
      const pts: [number, number][] = s.values.map((v, ci) => [x(ci), y(v)]);
      if (pts.length === 0) return;
      const linePath = smooth
        ? smoothPath(pts)
        : "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L");
      if (props.chartType === "area") {
        const areaD = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${zeroY.toFixed(1)} L${pts[0][0].toFixed(1)},${zeroY.toFixed(1)} Z`;
        seriesEls += `<path d="${areaD}" fill="${color}" opacity="0.16"/>`;
      }
      seriesEls += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p) => {
        seriesEls += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${color}"/>`;
      });
      const last = pts[pts.length - 1];
      seriesEls += `<text x="${(last[0] + 8).toFixed(1)}" y="${(last[1] + 4).toFixed(1)}" font-size="14" font-weight="600" fill="${color}">${fmt(
        s.values[s.values.length - 1],
      )}</text>`;
    });
  }

  return grid + zeroLine + xlabels + seriesEls;
}

/** Catmull-Rom → 三次贝塞尔（平滑折线）。 */
function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const t = 0.18;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// ──────────────────────────── 饼图 / 环形图 ────────────────────────────

function renderPie(props: ChartProps, palette: string[], top: number): string {
  const s = props.data.series[0];
  const vals = s ? s.values : [];
  const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cx = props.showLegend ? 350 : VBW / 2;
  const cy = (top + VBH - 30) / 2;
  const r = Math.min(cx - 50, (VBH - 30 - top) / 2 - 10);
  const innerR = props.chartType === "doughnut" ? r * (props.innerRadius ?? 0.58) : 0;
  let start = -Math.PI / 2;
  let slices = "";
  let labels = "";
  vals.forEach((v, i) => {
    const frac = Math.max(0, v) / total;
    if (frac <= 0) return;
    const end = start + frac * Math.PI * 2;
    const color = palette[i % palette.length];
    slices += `<path d="${arcPath(cx, cy, r, innerR, start, end)}" fill="${color}" stroke="var(--oa-color-bg)" stroke-width="2"><title>${escapeHtml(
      props.data.categories[i] ?? "",
    )}: ${pct(frac)}</title></path>`;
    if (props.showLabels && frac > 0.05) {
      const mid = (start + end) / 2;
      const lr = innerR > 0 ? (r + innerR) / 2 : r * 0.7;
      const lx = cx + Math.cos(mid) * lr;
      const ly = cy + Math.sin(mid) * lr;
      labels += `<text x="${lx.toFixed(1)}" y="${(ly + 5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="600" fill="#fff">${pct(frac)}</text>`;
    }
    start = end;
  });
  let legend = "";
  if (props.showLegend) {
    const lx = cx + r + 50;
    legend = vals
      .map((v, i) => {
        const yy = cy - (vals.length * 28) / 2 + i * 28 + 8;
        return `<rect x="${lx}" y="${yy - 12}" width="16" height="16" rx="3" fill="${palette[i % palette.length]}"/><text x="${lx + 26}" y="${
          yy
        }" font-size="16" fill="var(--oa-color-text)">${escapeHtml(props.data.categories[i] ?? "")}</text>`;
      })
      .join("");
  }
  return slices + labels + legend;
}

// ──────────────────────────── 雷达图 ────────────────────────────

function renderRadar(props: ChartProps, palette: string[], top: number): string {
  const cats = props.data.categories;
  const n = cats.length;
  if (n < 3) return "";
  const cx = VBW / 2;
  const cy = (top + VBH - 30) / 2;
  const r = Math.min(VBW / 2 - 130, (VBH - 30 - top) / 2 - 24);
  const ang = (i: number) => -Math.PI / 2 + (Math.PI * 2 * i) / n;
  const px = (i: number, rr: number) => cx + Math.cos(ang(i)) * rr;
  const py = (i: number, rr: number) => cy + Math.sin(ang(i)) * rr;

  // 满分刻度：所有正向值的最大值（缺省视作 0–100 量纲）
  const allVals = props.data.series.flatMap((s) => s.values);
  const maxV = allVals.length ? Math.max(1, ...allVals.filter((v) => v > 0)) : 1;

  // 同心多边形网格圈 + 轴线
  const rings = 5;
  let grid = "";
  for (let g = 1; g <= rings; g++) {
    const rr = (r * g) / rings;
    const pts = cats.map((_, i) => `${px(i, rr).toFixed(1)},${py(i, rr).toFixed(1)}`).join(" ");
    grid += `<polygon points="${pts}" fill="none" stroke="var(--oa-color-border)" stroke-width="1"/>`;
  }
  for (let i = 0; i < n; i++) {
    grid += `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${px(i, r).toFixed(1)}" y2="${py(i, r).toFixed(1)}" stroke="var(--oa-color-border)" stroke-width="1"/>`;
  }

  // 维度标签
  let labels = "";
  cats.forEach((c, i) => {
    const lx = px(i, r + 24);
    const ly = py(i, r + 24) + 5;
    const anchor = Math.abs(lx - cx) < 6 ? "middle" : lx > cx ? "start" : "end";
    labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" font-size="15" font-weight="600" fill="var(--oa-color-text)">${escapeHtml(c)}</text>`;
  });

  // 每个系列一个填充多边形
  let polys = "";
  props.data.series.forEach((s, si) => {
    const color = s.color ?? palette[si % palette.length];
    const pts = s.values
      .map((v, i) => {
        const rr = (r * Math.max(0, v)) / maxV;
        return `${px(i, rr).toFixed(1)},${py(i, rr).toFixed(1)}`;
      })
      .join(" ");
    polys += `<polygon points="${pts}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"><title>${escapeHtml(s.name)}</title></polygon>`;
    s.values.forEach((v, i) => {
      const rr = (r * Math.max(0, v)) / maxV;
      polys += `<circle cx="${px(i, rr).toFixed(1)}" cy="${py(i, rr).toFixed(1)}" r="3.5" fill="${color}"/>`;
    });
  });

  // 多系列图例
  let legend = "";
  if (props.showLegend && props.data.series.length > 1) {
    const lx = 28;
    const ly0 = top + 6;
    legend = props.data.series
      .map((s, si) => {
        const color = s.color ?? palette[si % palette.length];
        return `<rect x="${lx}" y="${(ly0 + si * 26).toFixed(1)}" width="14" height="14" rx="3" fill="${color}"/><text x="${lx + 22}" y="${(ly0 + si * 26 + 12).toFixed(1)}" font-size="14" fill="var(--oa-color-text)">${escapeHtml(s.name)}</text>`;
      })
      .join("");
  }

  return grid + labels + polys + legend;
}

/** 扇形 / 环形切片路径。ir=0 为实心扇形。 */
function arcPath(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + Math.cos(a0) * r;
  const y0 = cy + Math.sin(a0) * r;
  const x1 = cx + Math.cos(a1) * r;
  const y1 = cy + Math.sin(a1) * r;
  if (ir <= 0) {
    return `M${cx.toFixed(1)},${cy.toFixed(1)} L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(
      1,
    )} Z`;
  }
  const ix0 = cx + Math.cos(a0) * ir;
  const iy0 = cy + Math.sin(a0) * ir;
  const ix1 = cx + Math.cos(a1) * ir;
  const iy1 = cy + Math.sin(a1) * ir;
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} L${ix1.toFixed(
    1,
  )},${iy1.toFixed(1)} A${ir.toFixed(1)},${ir.toFixed(1)} 0 ${large} 0 ${ix0.toFixed(1)},${iy0.toFixed(1)} Z`;
}
