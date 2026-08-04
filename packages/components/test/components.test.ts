import { describe, it, expect } from "vitest";
import "../src/index.js"; // 导入即注册全部内置组件
import { renderDeck, renderPage, getTheme } from "@oneact/core";
import {
  renderChart,
  sanitizeHtml,
  sanitizeSvg,
  renderRuns,
  chartOption,
  setChartEngine,
  getChartEngine,
} from "../src/index.js";
import type { Deck } from "@oneact/schema";

describe("rich text (runs)", () => {
  it("plain / styled / link / color", () => {
    expect(renderRuns("hi")).toBe("hi");
    expect(renderRuns([{ text: "b", bold: true }])).toContain("font-weight:700");
    expect(renderRuns([{ text: "x", href: "http://a.com" }])).toContain("<a ");
    expect(renderRuns([{ text: "x", color: "#f00" }])).toContain("color:#f00");
    expect(renderRuns([{ text: "<img>", bold: true }])).toContain("&lt;img&gt;"); // 转义防注入
  });
});

describe("escape sanitization", () => {
  it("strips scripts + event handlers + javascript: urls", () => {
    expect(sanitizeHtml("<script>x</script><p>hi</p>")).not.toContain("script");
    expect(sanitizeHtml('<p onclick="x">hi</p>')).not.toContain("onclick");
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
    expect(sanitizeHtml("<p>safe</p>")).toContain("safe");
  });
  it("sanitizeSvg strips image/use/script", () => {
    expect(sanitizeSvg("<svg><script/></svg>")).not.toContain("script");
    expect(sanitizeSvg('<svg><image href="http://x"/></svg>')).not.toContain("image");
  });
});

describe("chart SVG (zero-dep, hand-drawn)", () => {
  const theme = getTheme("yuanshan-blue");
  it("bar → rects + title", () => {
    const svg = renderChart(
      {
        chartType: "bar",
        data: { categories: ["a", "b", "c"], series: [{ name: "s", values: [1, 2, 3] }] },
        title: "销量",
      },
      theme,
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("<rect");
    expect(svg).toContain(">销量<");
  });
  it("line → path + data points", () => {
    const svg = renderChart(
      { chartType: "line", data: { categories: ["a", "b", "c"], series: [{ name: "s", values: [3, 1, 2] }] } },
      theme,
    );
    expect(svg).toContain("<path");
    expect(svg).toContain("<circle");
  });
  it("area → filled path", () => {
    const svg = renderChart(
      { chartType: "area", data: { categories: ["a", "b"], series: [{ name: "s", values: [2, 5] }] } },
      theme,
    );
    expect(svg).toContain('opacity="0.16"');
  });
  it("smooth line uses bezier", () => {
    const svg = renderChart(
      {
        chartType: "line",
        smooth: true,
        data: { categories: ["a", "b", "c", "d"], series: [{ name: "s", values: [1, 3, 2, 4] }] },
      },
      theme,
    );
    expect(svg).toContain("C"); // cubic bezier command
  });
  it("pie → arcs + legend", () => {
    const svg = renderChart(
      { chartType: "pie", data: { categories: ["a", "b"], series: [{ name: "s", values: [3, 1] }] }, showLegend: true },
      theme,
    );
    expect(svg).toContain("<path");
    expect(svg).toContain("a"); // legend label
  });
  it("doughnut → arcs + labels", () => {
    const svg = renderChart(
      {
        chartType: "doughnut",
        data: { categories: ["a", "b", "c"], series: [{ name: "s", values: [1, 1, 1] }] },
        showLabels: true,
      },
      theme,
    );
    expect(svg).toContain("<path");
    expect(svg).toContain("%");
  });
  it("uses theme palette color", () => {
    const svg = renderChart(
      { chartType: "bar", data: { categories: ["a"], series: [{ name: "s", values: [1] }] } },
      theme,
    );
    expect(svg).toContain("#2f54eb"); // theme primary as first chart color
  });
});

describe("component renderers (P0/P1/P2)", () => {
  it("renders all built-in components through renderDeck", () => {
    const deck: Deck = {
      formatVersion: 1,
      meta: { theme: "yuanshan-blue" },
      pages: [
        {
          id: "p1",
          elements: [
            { id: "h", type: "heading", rect: [64, 48, 600, 60], props: { text: "标题" } },
            { id: "pa", type: "paragraph", rect: [64, 130, 600, 80], props: { text: "正文" } },
            { id: "bl", type: "bullet-list", rect: [64, 230, 600, 200], props: { items: ["一", "二"] } },
            { id: "im", type: "image", rect: [64, 450, 200, 200], props: { src: "placeholder:截图", alt: "图" } },
            {
              id: "c",
              type: "chart",
              rect: [700, 130, 520, 400],
              props: { chartType: "bar", data: { categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } },
            },
            { id: "t", type: "table", rect: [700, 540, 520, 150], props: { columns: [2, 1], rows: [["a", "b"]] } },
            { id: "s", type: "shape", rect: [900, 48, 80, 60], props: { shape: "ellipse" } },
            { id: "ic", type: "icon", rect: [1000, 48, 60, 60], props: { name: "star" } },
            { id: "ch", type: "custom-html", rect: [1100, 660, 160, 50], props: { html: "<p>hi</p>" } },
          ],
        },
      ],
    };
    const html = renderDeck(deck);
    expect(html).toContain("标题");
    expect(html).toContain("正文");
    expect(html).toContain("截图"); // placeholder label
    expect(html).toContain("<rect"); // chart bar
    expect(html).toContain("oa-table"); // table
    expect(html).toContain("iframe"); // custom-html sandbox
    expect(html).toContain('sandbox=""'); // 默认隔离
    expect(html).toContain("polygon"); // star icon
    expect(html).toContain("border-radius:50%"); // ellipse shape
  });

  it("custom-html trusted opens allow-scripts", () => {
    const html = renderPage(
      {
        id: "p1",
        elements: [
          { id: "x", type: "custom-html", rect: [0, 0, 100, 100], props: { html: "<p>hi</p>", trusted: true } },
        ],
      },
      getTheme(),
    );
    expect(html).toContain('sandbox="allow-scripts"');
  });

  it("image url renders <img>", () => {
    const html = renderPage(
      {
        id: "p1",
        elements: [{ id: "i", type: "image", rect: [0, 0, 100, 100], props: { src: "https://x/a.png", alt: "x" } }],
      },
      getTheme(),
    );
    expect(html).toContain("<img");
    expect(html).toContain('src="https://x/a.png"');
  });

  it("bullet-list stagger applies per-item delay", () => {
    const html = renderPage(
      {
        id: "p1",
        elements: [
          {
            id: "l",
            type: "bullet-list",
            rect: [0, 0, 300, 200],
            props: { items: ["a", "b", "c"] },
            anim: { name: "fade-in", stagger: 100 },
          },
        ],
      },
      getTheme(),
    );
    expect(html).toContain("100ms"); // 第 2 项延迟
    expect(html).toContain("200ms"); // 第 3 项延迟
  });
});

describe("formula / media components", () => {
  it("formula renders katex html", () => {
    const html = renderPage(
      { id: "p1", elements: [{ id: "f", type: "formula", rect: [64, 48, 400, 120], props: { latex: "E=mc^2" } }] },
      getTheme(),
    );
    expect(html).toContain("oa-formula");
    expect(html).toContain("katex"); // katex 产物含 class="katex"
  });
  it("video renders <video controls poster>", () => {
    const html = renderPage(
      {
        id: "p1",
        elements: [{ id: "v", type: "video", rect: [64, 48, 400, 300], props: { src: "x.mp4", poster: "p.jpg" } }],
      },
      getTheme(),
    );
    expect(html).toContain("<video");
    expect(html).toContain("controls");
    expect(html).toContain('poster="p.jpg"');
  });
  it("audio renders <audio controls>", () => {
    const html = renderPage(
      { id: "p1", elements: [{ id: "a", type: "audio", rect: [64, 48, 400, 80], props: { src: "x.mp3" } }] },
      getTheme(),
    );
    expect(html).toContain("<audio");
    expect(html).toContain("controls");
  });
});

describe("chart engine（v0.2 ECharts 接入）", () => {
  it("chartOption translates bar semantics → echarts option", () => {
    const opt = chartOption(
      { chartType: "bar", data: { categories: ["a", "b"], series: [{ name: "s", values: [1, 2] }] } },
      getTheme("yuanshan-blue"),
    );
    const series = opt.series as { type: string; data: number[] }[];
    expect(series[0].type).toBe("bar");
    expect(series[0].data).toEqual([1, 2]);
    expect(opt.xAxis).toBeDefined();
    expect(Array.isArray(opt.color)).toBe(true);
  });
  it("pie option maps categories → data", () => {
    const opt = chartOption(
      { chartType: "pie", data: { categories: ["a", "b"], series: [{ name: "s", values: [3, 1] }] } },
      getTheme("yuanshan-blue"),
    );
    const s = (opt.series as { type: string; data: { name: string; value: number }[] }[])[0];
    expect(s.type).toBe("pie");
    expect(s.data[0]).toMatchObject({ name: "a", value: 3 });
  });
  it("setChartEngine switches to echarts (输出 .oa-echarts 占位)", () => {
    expect(getChartEngine()).toBe("svg");
    setChartEngine("echarts");
    expect(getChartEngine()).toBe("echarts");
    const html = renderPage(
      {
        id: "p1",
        elements: [
          {
            id: "c",
            type: "chart",
            rect: [0, 0, 400, 300],
            props: { chartType: "bar", data: { categories: ["a"], series: [{ name: "s", values: [1] }] } },
          },
        ],
      },
      getTheme("yuanshan-blue"),
    );
    expect(html).toContain("oa-echarts");
    expect(html).toContain("data-option=");
    setChartEngine("svg");
    expect(getChartEngine()).toBe("svg");
  });
});
