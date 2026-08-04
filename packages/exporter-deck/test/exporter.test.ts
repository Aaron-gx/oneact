import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { toStandaloneHtml, readAct, writeAct, packActpack, unpackActpack } from "../src/index.js";
import type { Deck } from "@oneact/schema";

describe("toStandaloneHtml", () => {
  it("injects deck into body before app", () => {
    const deck = { formatVersion: 1, meta: { theme: "yuanshan-blue" }, pages: [] } as unknown as Deck;
    const html = toStandaloneHtml(deck, '<html><body><div id="app"></div><script>1</script></body></html>');
    expect(html).toContain("window.__ONEACT_DECK__=");
    expect(html.indexOf("window.__ONEACT_DECK__")).toBeLessThan(html.indexOf('<div id="app">'));
  });
  it("escapes </script to avoid truncation", () => {
    const deck = {
      formatVersion: 1,
      meta: { theme: "x" },
      pages: [
        {
          id: "p",
          elements: [{ id: "e", type: "custom-html", rect: [0, 0, 1, 1], props: { html: "</script><script>x" } }],
        },
      ],
    } as unknown as Deck;
    const html = toStandaloneHtml(deck, "<body></body>");
    // 注入点不应出现裸 </script>（应为 <\/script）
    const inject = html.slice(html.indexOf("window.__ONEACT_DECK__"), html.indexOf(";</script>"));
    expect(inject).not.toContain("</script>");
  });

  it("deck 含 $ 特殊字符不破坏注入（String.replace $ 模式回归）", () => {
    const deck = { formatVersion: 1, meta: { theme: "x", title: "a$&b$`c$'d$1e" }, pages: [] } as unknown as Deck;
    const html = toStandaloneHtml(deck, "<body></body>");
    expect(html).toContain("a$&b$`c$'d$1e"); // 原样保留，未被 $ 模式吞掉
  });
});

describe("act read/write", () => {
  it("writes .act + .assets dir and reads back", () => {
    const dir = mkdtempSync(join(tmpdir(), "oneact-"));
    const actPath = join(dir, "demo.act");
    const deck: Deck = { formatVersion: 1, meta: { theme: "yuanshan-blue" }, pages: [] };
    const res = writeAct(deck, actPath);
    expect(existsSync(actPath)).toBe(true);
    expect(existsSync(res.assetsDir)).toBe(true);
    expect(res.assetsDir.endsWith("demo.assets")).toBe(true);
    const back = readAct(actPath);
    expect(back.meta.theme).toBe("yuanshan-blue");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("actpack（v2 zip 包）", () => {
  it("pack → unpack roundtrip（含 assets）", () => {
    const deck: Deck = { formatVersion: 1, meta: { theme: "yuanshan-blue", title: "打包子" }, pages: [] };
    const assets = { "logo.png": new Uint8Array([1, 2, 3, 4]), "img/a.jpg": new Uint8Array([9, 9]) };
    const zip = packActpack(deck, assets);
    expect(zip.length).toBeGreaterThan(50);
    const { deck: back, assets: backAssets } = unpackActpack(zip);
    expect(back.meta.title).toBe("打包子");
    expect(backAssets["logo.png"]).toEqual(assets["logo.png"]);
    expect(backAssets["img/a.jpg"]).toEqual(assets["img/a.jpg"]);
  });
});
