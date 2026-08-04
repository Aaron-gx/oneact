import { describe, it, expect } from "vitest";
import {
  registerComponent,
  renderPage,
  renderDeck,
  themeToCssVars,
  animKeyframesCss,
  animInlineStyle,
  transitionStyle,
  transitionKeyframesCss,
  computeScale,
  getTheme,
  isKnownAnim,
  isKnownTransition,
  ENTRANCE_NAMES,
  MOTION_NAMES,
  measurePage,
  validateDeckMeasured,
} from "../src/index.js";

describe("theme engine", () => {
  it("themeToCssVars exposes all tokens", () => {
    const v = themeToCssVars(getTheme("yuanshan-blue"));
    expect(v).toContain("--oa-color-primary:#2f54eb");
    expect(v).toContain("--oa-color-accent:#7c3aed");
    expect(v).toContain("--oa-fs-h1:48px");
    expect(v).toContain("--oa-fs-body:19px");
    expect(v).toContain("--oa-chart:");
    expect(v).toContain("--oa-radius:12px");
  });
});

describe("animation engine", () => {
  it("keyframes cover entrance/emphasis/exit", () => {
    const css = animKeyframesCss();
    expect(css).toContain("@keyframes oa-fade-in");
    expect(css).toContain("@keyframes oa-fly-in-left");
    expect(css).toContain("@keyframes oa-pulse");
    expect(css).toContain("@keyframes oa-fade-out");
  });
  it("inline style for known anim", () => {
    const s = animInlineStyle({ name: "fly-in-left", duration: 800 });
    expect(s).toContain("oa-fly-in-left");
    expect(s).toContain("800ms");
  });
  it("unknown anim -> empty string", () => {
    expect(animInlineStyle({ name: "does-not-exist" })).toBe("");
    expect(animInlineStyle(undefined)).toBe("");
  });
  it("stagger expands by index", () => {
    expect(animInlineStyle({ name: "fade-in", stagger: 120 }, 2)).toContain("240ms");
    expect(animInlineStyle({ name: "fade-in", stagger: 120 }, 0)).toContain("0ms");
  });
  it("isKnownAnim / names", () => {
    expect(isKnownAnim("fade-in")).toBe(true);
    expect(isKnownAnim("zzz")).toBe(false);
    expect(ENTRANCE_NAMES).toContain("fly-in-left");
  });
  it("covers new entrance/exit/motion presets", () => {
    const css = animKeyframesCss();
    expect(css).toContain("@keyframes oa-wheel");
    expect(css).toContain("@keyframes oa-random-bars");
    expect(css).toContain("@keyframes oa-split");
    expect(css).toContain("@keyframes oa-wipe-out-left");
    expect(css).toContain("@keyframes oa-motion-line");
    expect(isKnownAnim("motion-custom")).toBe(true);
    expect(MOTION_NAMES).toContain("motion-arc");
  });
  it("sequence order defers by stagger", () => {
    // order=2, stagger=100 → 递延 200ms
    expect(animInlineStyle({ name: "fade-in", order: 2, stagger: 100 })).toContain("200ms");
  });
  it("sequence order uses default 200ms gap when no stagger", () => {
    expect(animInlineStyle({ name: "fade-in", order: 1 })).toContain("200ms");
  });
  it("motion returns offset-path + custom path", () => {
    expect(animInlineStyle({ name: "motion-line" })).toContain("offset-path:");
    expect(animInlineStyle({ name: "motion-custom", path: 'path("M0 0 L 9 9")' })).toContain("M0 0 L 9 9");
  });
});

describe("offscreen measure (策划书 4.4 终审)", () => {
  it("skips gracefully in non-DOM (node) environment", () => {
    expect(measurePage({ id: "p1", elements: [] }, getTheme())).toEqual([]);
  });
  it("validateDeckMeasured falls back to pure validate in node", () => {
    const r = validateDeckMeasured({
      formatVersion: 1,
      meta: { theme: "yuanshan-blue" },
      pages: [{ id: "p1", elements: [{ id: "h", type: "heading", rect: [64, 48, 200, 60], props: { text: "x" } }] }],
    });
    expect(r.ok).toBe(true);
  });
});

describe("transition engine", () => {
  it("keyframes cover transitions", () => {
    expect(transitionKeyframesCss()).toContain("@keyframes oa-tr-push-left-enter");
    expect(transitionKeyframesCss()).toContain("@keyframes oa-tr-fade-exit");
  });
  it("style for known/unknown", () => {
    expect(transitionStyle("fade", "enter", 400)).toContain("oa-tr-fade-enter");
    expect(transitionStyle("zzz", "enter")).toContain("oa-tr-fade-enter");
  });
  it("isKnownTransition", () => {
    expect(isKnownTransition("morph")).toBe(true);
    expect(isKnownTransition("zzz")).toBe(false);
  });
});

describe("render engine", () => {
  it("renderPage positions element + emits data-id", () => {
    registerComponent("heading", (el) => `<h1>${String((el.props as { text: unknown }).text)}</h1>`);
    const html = renderPage(
      { id: "p1", elements: [{ id: "h1", type: "heading", rect: [64, 48, 200, 60], props: { text: "Hi" } }] },
      getTheme("yuanshan-blue"),
    );
    expect(html).toContain("left:64px");
    expect(html).toContain("top:48px");
    expect(html).toContain('data-id="h1"');
    expect(html).toContain(">Hi<");
    expect(html).toContain('class="oa-canvas"');
  });

  it("renderDeck injects theme vars + formatVersion", () => {
    const html = renderDeck({ formatVersion: 1, meta: { theme: "ink-green" }, pages: [{ id: "p1", elements: [] }] });
    expect(html).toContain('class="oa-deck"');
    expect(html).toContain("--oa-color-primary:#0f766e");
    expect(html).toContain('data-format-version="1"');
  });

  it("non-interactive mode omits data-id", () => {
    registerComponent("heading", () => `<h1>x</h1>`);
    const html = renderPage(
      { id: "p1", elements: [{ id: "h1", type: "heading", rect: [0, 0, 10, 10], props: { text: "x" } }] },
      getTheme(),
      { interactive: false },
    );
    expect(html).not.toContain("data-id");
  });

  it("renderPage injects theme vars (single-page render must have colors)", () => {
    const html = renderPage({ id: "p1", elements: [] }, getTheme("yuanshan-blue"));
    expect(html).toContain("--oa-color-primary:#2f54eb");
    expect(html).toContain("--oa-color-text:");
    expect(html).toContain("--oa-color-bg:");
  });

  it("computeScale is uniform shrink", () => {
    expect(computeScale(640, 360, 1280, 720)).toBeCloseTo(0.5, 5);
    expect(computeScale(2560, 1440, 1280, 720)).toBeCloseTo(2, 5);
    // 高度受限时以高度为准
    expect(computeScale(2000, 360, 1280, 720)).toBeCloseTo(0.5, 5);
  });
});
