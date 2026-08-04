import { describe, it, expect } from "vitest";
import {
  validateDeck,
  validatePage,
  formatIssues,
  migrate,
  overlapRatio,
  outOfBounds,
  contrastRatio,
  estimateTextHeight,
  isInside,
  toBox,
  scanEscape,
  canvasSize,
  FORMAT_VERSION,
  getTheme,
  type Deck,
  type Page,
  type AnyElement,
  type LayoutDef,
} from "../src/index.js";

function page(els: AnyElement[], id = "p1", layout?: string): Page {
  return { id, layout, elements: els };
}
function deck(pages: Page[], theme = "yuanshan-blue"): Deck {
  return { formatVersion: 1, meta: { theme, size: "16:9" }, pages };
}
const E = (
  id: string,
  type: AnyElement["type"],
  rect: [number, number, number, number],
  props: Record<string, unknown>,
  extra: Partial<AnyElement> = {},
): AnyElement => ({ id, type, rect, props, ...extra }) as AnyElement;

// ──────────────────────── 几何 ────────────────────────
describe("geometry", () => {
  it("overlapRatio", () => {
    expect(overlapRatio(toBox([0, 0, 10, 10]), toBox([20, 20, 10, 10]))).toBe(0); // 不相交
    expect(overlapRatio(toBox([0, 0, 10, 10]), toBox([0, 0, 10, 10]))).toBe(1); // 完全相同
    expect(overlapRatio(toBox([0, 0, 10, 10]), toBox([5, 0, 10, 10]))).toBeCloseTo(0.5, 5); // 半重叠
  });
  it("outOfBounds", () => {
    expect(outOfBounds(toBox([0, 0, 100, 100]), canvasSize("16:9")).total).toBe(0);
    expect(outOfBounds(toBox([-10, 0, 100, 100]), canvasSize("16:9")).left).toBe(10);
    expect(outOfBounds(toBox([1200, 0, 100, 100]), canvasSize("16:9")).right).toBe(20); // 1300-1280
    expect(outOfBounds(toBox([0, 700, 10, 100]), canvasSize("16:9")).bottom).toBe(80); // 800-720
  });
  it("isInside", () => {
    expect(isInside(toBox([10, 10, 5, 5]), toBox([0, 0, 100, 100]))).toBe(true);
    expect(isInside(toBox([-1, 0, 5, 5]), toBox([0, 0, 100, 100]))).toBe(false);
  });
  it("contrastRatio (WCAG)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 0);
    expect(contrastRatio("#888888", "#ffffff")).toBeGreaterThan(3);
    expect(contrastRatio("not-a-color", "#fff")).toBeNull();
  });
  it("estimateTextHeight CJK", () => {
    // 10 个中文字,16px,宽 160 → 每行 10 字 → 1 行 → 24px (1.5 行高)
    expect(estimateTextHeight("一二三四五六七八九十", 16, 160, 1.5)).toBeCloseTo(24, 0);
    // 宽度只能放 5 字 → 2 行 → 48px
    expect(estimateTextHeight("一二三四五六七八九十", 16, 80, 1.5)).toBeCloseTo(48, 0);
  });
  it("scanEscape detects risky patterns", () => {
    expect(scanEscape("<script>x</script>").map((h) => h.tag)).toContain("script");
    expect(scanEscape('<div onclick="x">').map((h) => h.tag)).toContain("event-handler");
    expect(scanEscape("https://evil.com/x").map((h) => h.tag)).toContain("external-link");
    expect(scanEscape("<p>safe</p>")).toHaveLength(0);
  });
});

// ──────────────────────── 校验器：通过 / 结构 ────────────────────────
describe("validator structure", () => {
  it("valid deck passes", () => {
    const r = validateDeck(
      deck([
        page([
          E("h", "heading", [64, 48, 700, 60], { text: "标题" }),
          E("p", "paragraph", [64, 140, 700, 200], { text: "正文" }),
        ]),
      ]),
    );
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("out-of-bounds → error", () => {
    const r = validateDeck(deck([page([E("h", "heading", [1200, 48, 200, 60], { text: "x" })])]));
    expect(r.errors.some((e) => e.rule === "out-of-bounds")).toBe(true);
  });

  it("duplicate element id → error", () => {
    const r = validateDeck(
      deck([
        page([
          E("h", "heading", [64, 48, 200, 60], { text: "a" }),
          E("h", "heading", [64, 140, 200, 60], { text: "b" }),
        ]),
      ]),
    );
    expect(r.errors.some((e) => e.rule === "element-id-duplicate")).toBe(true);
  });

  it("duplicate page id → error", () => {
    const r = validateDeck(
      deck([
        page([E("h", "heading", [64, 48, 200, 60], { text: "a" })], "p1"),
        page([E("h2", "heading", [64, 48, 200, 60], { text: "b" })], "p1"),
      ]),
    );
    expect(r.errors.some((e) => e.rule === "page-id-duplicate")).toBe(true);
  });

  it("unknown component type → error", () => {
    const r = validateDeck(deck([page([E("x", "alien" as AnyElement["type"], [64, 48, 200, 60], {})])]));
    expect(r.errors.some((e) => e.rule === "unknown-type")).toBe(true);
  });

  it("page missing elements → healable error (不崩溃)", () => {
    // LLM 偶发输出残缺 page（无 elements），校验器应返回可自愈错误而非抛异常
    const issues = validatePage({ id: "p1", layout: "cover" } as never);
    expect(issues.some((e) => e.rule === "page-malformed" && e.severity === "error")).toBe(true);
    const issues2 = validatePage(null as never);
    expect(issues2.some((e) => e.rule === "page-malformed")).toBe(true);
  });

  it("malformed element props → 可自愈错误，不崩溃（checkOverflow 曾 .map 崩溃）", () => {
    // bullet-list 缺 items：checkOverflow 曾在 items.map 崩溃
    const a = validatePage({
      id: "p1",
      elements: [{ id: "b", type: "bullet-list", rect: [64, 64, 200, 100], props: {} } as never],
    } as never);
    expect(Array.isArray(a)).toBe(true);
    expect(a.some((e) => e.rule === "missing-field" || e.rule === "element-malformed")).toBe(true);
    // table 缺 columns：checkOverflow 曾在 cols.reduce/map 崩溃
    const b = validatePage({
      id: "p1",
      elements: [{ id: "t", type: "table", rect: [64, 64, 200, 100], props: { rows: [] } } as never],
    } as never);
    expect(Array.isArray(b)).toBe(true);
    // 元素为 null：曾崩溃
    const c = validatePage({ id: "p1", elements: [null as never] } as never);
    expect(c.some((e) => e.rule === "element-malformed")).toBe(true);
  });

  it("missing text → error", () => {
    const r = validateDeck(deck([page([E("h", "heading", [64, 48, 200, 60], { text: "" })])]));
    expect(r.errors.some((e) => e.rule === "missing-field")).toBe(true);
  });

  it("missing chart fields → error", () => {
    const r = validateDeck(deck([page([E("c", "chart", [64, 48, 400, 300], { chartType: "bar" })])]));
    expect(r.errors.some((e) => e.rule === "missing-field" && e.message.includes("categories"))).toBe(true);
  });

  it("table column mismatch → error", () => {
    const r = validateDeck(
      deck([page([E("t", "table", [64, 48, 400, 200], { columns: [2, 1, 1], rows: [["a", "b"]] })])]),
    );
    expect(r.errors.some((e) => e.rule === "table-shape")).toBe(true);
  });

  it("formatVersion too high → error", () => {
    const r = validateDeck({ formatVersion: 99, meta: { theme: "yuanshan-blue" }, pages: [] });
    expect(r.errors.some((e) => e.rule === "format-version")).toBe(true);
  });
});

// ──────────────────────── 校验器：软警告 ────────────────────────
describe("validator warnings", () => {
  it("overlap > 20% → warning", () => {
    const r = validateDeck(
      deck([
        page([
          E("a", "shape", [64, 48, 400, 300], { shape: "rect" }),
          E("b", "shape", [100, 80, 400, 300], { shape: "rect" }),
        ]),
      ]),
    );
    expect(r.warnings.some((w) => w.rule === "overlap")).toBe(true);
  });

  it("too many elements → warning", () => {
    const els: AnyElement[] = Array.from({ length: 13 }, (_, i) =>
      E(`s${i}`, "shape", [i * 90, 0, 80, 80], { shape: "rect" }),
    );
    const r = validateDeck(deck([page(els)]));
    expect(r.warnings.some((w) => w.rule === "too-many-elements")).toBe(true);
  });

  it("small font → warning", () => {
    const r = validateDeck(deck([page([E("p", "paragraph", [64, 48, 400, 200], { text: "x", fontSize: 10 })])]));
    expect(r.warnings.some((w) => w.rule === "font-size")).toBe(true);
  });

  it("image missing alt → warning", () => {
    const r = validateDeck(deck([page([E("im", "image", [64, 48, 200, 200], { src: "x.png" })])]));
    expect(r.warnings.some((w) => w.rule === "a11y-alt")).toBe(true);
  });

  it("chart missing summary → warning", () => {
    const r = validateDeck(
      deck([
        page([
          E("c", "chart", [64, 48, 400, 300], {
            chartType: "bar",
            data: { categories: ["a"], series: [{ name: "s", values: [1] }] },
          }),
        ]),
      ]),
    );
    expect(r.warnings.some((w) => w.rule === "a11y-summary")).toBe(true);
  });

  it("custom-html without trusted → sandbox warning", () => {
    const r = validateDeck(deck([page([E("h", "custom-html", [64, 48, 400, 300], { html: "<p>hi</p>" })])]));
    expect(r.warnings.some((w) => w.rule === "escape-sandboxed")).toBe(true);
  });

  it("custom-html with script → unsafe warning", () => {
    const r = validateDeck(
      deck([page([E("h", "custom-html", [64, 48, 400, 300], { html: "<script>x</script>", trusted: true })])]),
    );
    expect(r.warnings.some((w) => w.rule === "escape-unsafe")).toBe(true);
  });

  it("text overflow estimate → warning", () => {
    // 很窄的容器塞长文本
    const r = validateDeck(
      deck([
        page([E("p", "paragraph", [64, 48, 100, 40], { text: "这是一段很长很长很长很长的正文内容用于测试溢出" })]),
      ]),
    );
    expect(r.warnings.some((w) => w.rule === "text-overflow")).toBe(true);
  });

  it("low contrast → warning", () => {
    const r = validateDeck(
      deck([page([E("p", "paragraph", [64, 48, 400, 200], { text: "x", color: "#cccccc" })], "p1")]),
    );
    expect(r.warnings.some((w) => w.rule === "contrast")).toBe(true);
  });
});

// ──────────────────────── slot 规则 ────────────────────────
describe("validator slots", () => {
  const layout: LayoutDef = {
    name: "two-col",
    title: "两栏",
    slots: {
      title: { rect: [64, 48, 1152, 60], accepts: ["heading"] },
      left: { rect: [64, 180, 560, 480], accepts: ["bullet-list", "text" as never, "paragraph"] },
    },
  };
  it("element outside slot → warning", () => {
    const el = E("h", "heading", [64, 48, 1152, 60], { text: "t" }, { slot: "title" });
    const r = validateDeck(deck([page([el], "p1", "two-col")]), { layouts: { two_col: layout, "two-col": layout } });
    expect(r.warnings.some((w) => w.rule === "slot-overflow")).toBe(false); // 正好在 slot 内
  });
  it("element outside slot bounds → warning", () => {
    const el = E("h", "heading", [900, 48, 400, 60], { text: "t" }, { slot: "title" }); // 超出 title 宽度
    const r = validateDeck(deck([page([el], "p1", "two-col")]), { layouts: { "two-col": layout } });
    expect(r.warnings.some((w) => w.rule === "slot-overflow")).toBe(true);
  });
  it("wrong type for slot accepts → error", () => {
    const el = E(
      "c",
      "chart",
      [64, 180, 560, 480],
      { chartType: "bar", data: { categories: ["a"], series: [{ name: "s", values: [1] }] } },
      { slot: "title" },
    );
    const r = validateDeck(deck([page([el], "p1", "two-col")]), { layouts: { "two-col": layout } });
    expect(r.errors.some((e) => e.rule === "slot-accepts")).toBe(true);
  });
});

// ──────────────────────── 迁移器 ────────────────────────
describe("migrate", () => {
  it("same version → no change", () => {
    const d = deck([page([E("h", "heading", [64, 48, 200, 60], { text: "x" })])]);
    const res = migrate(d, FORMAT_VERSION);
    expect(res.migrated).toBe(false);
  });
  it("future version → throws", () => {
    const d = deck([page([E("h", "heading", [64, 48, 200, 60], { text: "x" })])]);
    expect(() => migrate({ ...d, formatVersion: FORMAT_VERSION + 1 }, FORMAT_VERSION)).toThrow();
  });
});

// ──────────────────────── 主题 ────────────────────────
describe("themes", () => {
  it("unknown theme falls back to default", () => {
    expect(getTheme("does-not-exist").name).toBe("yuanshan-blue");
    expect(getTheme("ink-green").colors.primary).toBe("#0f766e");
  });
});

// ──────────────────────── formatIssues 文本 ────────────────────────
describe("formatIssues", () => {
  it("renders clean message", () => {
    const r = validateDeck(deck([page([E("h", "heading", [64, 48, 200, 60], { text: "x" })])]));
    expect(formatIssues(r)).toContain("校验通过");
  });
  it("renders errors with location", () => {
    const r = validateDeck(deck([page([E("h", "heading", [1200, 48, 200, 60], { text: "x" })])]));
    expect(formatIssues(r)).toContain("out-of-bounds");
    expect(formatIssues(r)).toContain("#p1");
  });
});

describe("validatePage (standalone)", () => {
  it("works without deck", () => {
    const issues = validatePage(page([E("h", "heading", [1200, 48, 200, 60], { text: "x" })]));
    expect(issues.some((i) => i.rule === "out-of-bounds" && i.severity === "error")).toBe(true);
  });
});
