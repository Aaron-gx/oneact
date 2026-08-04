/**
 * @oneact/exporter-deck — .act 打包 / 解包
 *
 * .act 物理格式（v0）：单文件 UTF-8 JSON + 同名 .assets 目录约定
 * （demo.act 配 demo.assets/，图片 src 用相对路径）。
 * 文本 git 可 diff；图片不做 base64（base64 会让 diff 爆炸）。
 * base64 仅用于自包含单 HTML 分发产物（见 standalone.ts）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Deck } from "@oneact/schema";

export interface ActWriteResult {
  actFile: string;
  assetsDir: string;
}

/** 写 .act 文件并创建同名 .assets 目录（约定）。 */
export function writeAct(deck: Deck, actPath: string): ActWriteResult {
  writeFileSync(actPath, JSON.stringify(deck, null, 2) + "\n", "utf8");
  const assetsDir = actPath.replace(/\.(act|json)$/i, ".assets");
  mkdirSync(assetsDir, { recursive: true });
  return { actFile: actPath, assetsDir };
}

/** 读取 .act 文件为 Deck。 */
export function readAct(actPath: string): Deck {
  return JSON.parse(readFileSync(actPath, "utf8")) as Deck;
}

// ──────────────────────────── .actpack（v2：zip 包：content.json + assets/）────────────────────────────
// 与「单文件 JSON + .assets 目录」约定天然同构、零迁移成本。用 fflate（零依赖，node + 浏览器通用）。
import { strToU8, unzipSync, zipSync } from "fflate";

export interface ActpackAssets {
  /** 相对路径 → 二进制（如 "logo.png" → Uint8Array）。 */
  [path: string]: Uint8Array;
}

/** 把 deck + 资源打包成 .actpack（zip）。 */
export function packActpack(deck: Deck, assets: ActpackAssets = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { "content.json": strToU8(JSON.stringify(deck, null, 2)) };
  for (const [name, data] of Object.entries(assets)) files["assets/" + name] = data;
  return zipSync(files);
}

/** 解包 .actpack → { deck, assets }。 */
export function unpackActpack(zipData: Uint8Array): { deck: Deck; assets: ActpackAssets } {
  const files = unzipSync(zipData);
  const contentKey = Object.keys(files).find((k) => k.endsWith("content.json")) ?? "content.json";
  const deck = JSON.parse(new TextDecoder().decode(files[contentKey])) as Deck;
  const assets: ActpackAssets = {};
  for (const [k, v] of Object.entries(files)) {
    const rel = k.replace(/^.*assets\//, "");
    if (rel !== k && rel !== "content.json") assets[rel] = v;
  }
  return { deck, assets };
}
