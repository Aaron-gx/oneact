import { describe, it, expect } from "vitest";
import "../src/index.js"; // 导入即注册全部内置组件（含 WS1 复合组件）
import { renderPage } from "@oneact/core";
import { getTheme, validatePage } from "@oneact/schema";
import { LAYOUTS } from "@oneact/layouts";
import type { AnyElement, Page } from "@oneact/schema";

const theme = getTheme("yuanshan-blue");

/** 渲染单个元素（包成 page）。 */
function render(el: AnyElement): string {
  const page: Page = { id: "p1", elements: [el] };
  return renderPage(page, theme, { interactive: false });
}

describe("WS1 复合语义组件 · 渲染", () => {
  it("kpi 渲染大数字 + 标签 + 趋势", () => {
    const html = render({
      id: "k",
      type: "kpi",
      rect: [64, 64, 300, 180],
      props: { value: "98.5%", label: "满意度", trend: { text: "↑ 3%", dir: "up" } },
    });
    expect(html).toContain(">98.5%<");
    expect(html).toContain("满意度");
    expect(html).toContain("#16a34a"); // up 趋势绿
  });

  it("stat-grid 渲染所有 cell", () => {
    const html = render({
      id: "s",
      type: "stat-grid",
      rect: [64, 64, 1152, 200],
      props: {
        cells: [
          { value: "1", label: "a" },
          { value: "2", label: "b" },
          { value: "3", label: "c" },
        ],
      },
    });
    expect(html).toContain("grid-template-columns");
    expect(html).toContain(">1<");
    expect(html).toContain(">3<");
  });

  it("feature-card 渲染图标 + 标题 + 描述", () => {
    const html = render({
      id: "f",
      type: "feature-card",
      rect: [64, 64, 360, 400],
      props: { icon: "rocket", title: "极速", desc: "毫秒级" },
    });
    expect(html).toContain("极速");
    expect(html).toContain("毫秒级");
    expect(html).toContain("<svg"); // 图标
  });

  it("feature-list 渲染多行 + 序号", () => {
    const html = render({
      id: "fl",
      type: "feature-list",
      rect: [64, 64, 1152, 400],
      props: { numbered: true, items: [{ title: "第一", desc: "d1" }, { title: "第二" }] },
    });
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).toContain("第一");
    expect(html).toContain("第二");
  });

  it("timeline 渲染节点 + 连线（水平）", () => {
    const html = render({
      id: "t",
      type: "timeline",
      rect: [64, 64, 1152, 300],
      props: {
        items: [
          { time: "Q1", title: "启动" },
          { time: "Q2", title: "增长" },
        ],
      },
    });
    expect(html).toContain("Q1");
    expect(html).toContain("启动");
    expect(html).toContain("border-radius:50%"); // 圆点
  });

  it("process 渲染步骤 + 编号 + 箭头", () => {
    const html = render({
      id: "p",
      type: "process",
      rect: [64, 64, 1152, 300],
      props: { steps: [{ title: "分析" }, { title: "设计" }, { title: "上线" }] },
    });
    expect(html).toContain(">1<");
    expect(html).toContain(">3<");
    expect(html).toContain("分析");
    expect((html.match(/<svg/g) || []).length).toBe(2); // 3 步 → 2 个箭头
  });

  it("comparison 渲染左右两栏 + ✓/✗ 标记", () => {
    const html = render({
      id: "c",
      type: "comparison",
      rect: [64, 64, 1152, 400],
      props: {
        left: { title: "旧", items: ["慢"], tone: "negative" },
        right: { title: "新", items: ["快"], tone: "positive" },
      },
    });
    expect(html).toContain(">旧<");
    expect(html).toContain(">新<");
    expect(html).toContain("#dc2626"); // 负面色
    expect(html).toContain("#16a34a"); // 正面色
  });

  it("section-title 渲染眉标 + 标题 + 装饰条", () => {
    const html = render({
      id: "st",
      type: "section-title",
      rect: [64, 64, 900, 160],
      props: { kicker: "CHAPTER 01", title: "核心优势", subtitle: "三大要点" },
    });
    expect(html).toContain("CHAPTER 01");
    expect(html).toContain("核心优势");
    expect(html).toContain("三大要点");
  });

  it("callout 按 variant 配色（warning）", () => {
    const html = render({
      id: "co",
      type: "callout",
      rect: [64, 64, 900, 120],
      props: { variant: "warning", title: "注意", text: "请保存" },
    });
    expect(html).toContain("注意");
    expect(html).toContain("请保存");
    expect(html).toContain("#d97706"); // warning 琥珀
  });

  it("badge 渲染胶囊", () => {
    const html = render({ id: "b", type: "badge", rect: [64, 64, 200, 40], props: { text: "NEW", tone: "positive" } });
    expect(html).toContain("NEW");
    expect(html).toContain("border-radius:999px");
  });

  it("divider 带文字", () => {
    const html = render({ id: "d", type: "divider", rect: [64, 64, 1152, 20], props: { label: "章节" } });
    expect(html).toContain("章节");
    expect(html).toContain("border-top");
  });

  it("avatar 渲染首字母占位 + 姓名 + 角色", () => {
    const html = render({ id: "a", type: "avatar", rect: [64, 64, 360, 400], props: { name: "张三", role: "工程师" } });
    expect(html).toContain("张");
    expect(html).toContain("张三");
    expect(html).toContain("工程师");
  });

  it("富文本注入被转义（安全）", () => {
    const html = render({
      id: "k2",
      type: "kpi",
      rect: [64, 64, 300, 180],
      props: { value: "<script>x</script>", label: "ok" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("可编辑文本节点带 data-oa-edit 标记（供原地 contenteditable 编辑）", () => {
    expect(render({ id: "h", type: "heading", rect: [64, 64, 600, 60], props: { text: "标题" } })).toContain(
      'data-oa-edit="text"',
    );
    expect(render({ id: "p", type: "paragraph", rect: [64, 64, 600, 60], props: { text: "正文" } })).toContain(
      'data-oa-edit="text"',
    );
    expect(render({ id: "k", type: "kpi", rect: [64, 64, 300, 180], props: { value: "99" } })).toContain(
      'data-oa-edit="value"',
    );
    expect(render({ id: "b", type: "badge", rect: [64, 64, 200, 40], props: { text: "NEW" } })).toContain(
      'data-oa-edit="text"',
    );
    expect(
      render({ id: "fc", type: "feature-card", rect: [64, 64, 360, 400], props: { title: "T", desc: "D" } }),
    ).toContain('data-oa-edit="title"');
    expect(
      render({ id: "fc2", type: "feature-card", rect: [64, 64, 360, 400], props: { title: "T", desc: "D" } }),
    ).toContain('data-oa-edit="desc"');
  });
});

describe("WS1 复合语义组件 · 校验", () => {
  it("缺必填字段报硬错误", () => {
    const issues = validatePage({
      id: "p1",
      elements: [{ id: "k", type: "kpi", rect: [64, 64, 300, 180], props: { label: "无 value" } }],
    });
    expect(issues.some((i) => i.rule === "missing-field" && i.elementId === "k")).toBe(true);
  });
  it("process 空 steps 报错", () => {
    const issues = validatePage({
      id: "p1",
      elements: [{ id: "p", type: "process", rect: [64, 64, 1152, 300], props: { steps: [] } }],
    });
    expect(issues.some((i) => i.rule === "missing-field")).toBe(true);
  });
  it("复合组件落在接受它的 slot 上，无 slot-accepts 错误", () => {
    const page: Page = {
      id: "p1",
      layout: "content",
      elements: [
        { id: "t", type: "heading", rect: [64, 44, 1152, 60], slot: "title", props: { text: "T" } },
        {
          id: "proc",
          type: "process",
          rect: [64, 130, 1152, 550],
          slot: "body",
          props: { steps: [{ title: "a" }, { title: "b" }] },
        },
      ],
    };
    const issues = validatePage(page, { layouts: LAYOUTS });
    expect(issues.some((i) => i.rule === "slot-accepts")).toBe(false);
  });
});

describe("WS5 孤立容器检测", () => {
  it("卡片 shape 上无内容 → orphan-container warning", () => {
    const issues = validatePage({
      id: "p1",
      elements: [
        { id: "box", type: "shape", rect: [100, 150, 280, 400], props: { shape: "rect", fill: "#eee" } },
        // 没有任何内容元素落在 box 上 → 空卡片
      ],
    });
    expect(issues.some((i) => i.rule === "orphan-container" && i.elementId === "box")).toBe(true);
  });
  it("卡片 shape 上有标题 → 不报 orphan", () => {
    const issues = validatePage({
      id: "p1",
      elements: [
        { id: "box", type: "shape", rect: [100, 150, 280, 400], props: { shape: "rect", fill: "#eee" } },
        { id: "t", type: "heading", rect: [120, 170, 240, 60], props: { text: "标题" } },
      ],
    });
    expect(issues.some((i) => i.rule === "orphan-container")).toBe(false);
  });
  it("全画布装饰 shape 不报 orphan", () => {
    const issues = validatePage({
      id: "p1",
      elements: [{ id: "bg", type: "shape", rect: [0, 0, 1280, 720], props: { shape: "rect", fill: "#000" } }],
    });
    expect(issues.some((i) => i.rule === "orphan-container")).toBe(false);
  });
});
