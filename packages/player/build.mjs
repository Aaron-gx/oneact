/**
 * @oneact/player — 单文件 runtime.html 构建脚本
 *
 * 用 esbuild 把 main.ts（含 @oneact/core/components/layouts/schema + 内置示例 deck）
 * 打包成 IIFE，内联进 runtime.template.html，输出可双击播放的单文件 dist/runtime.html。
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// 读取内置示例 deck（构建时整体注入，避免 esbuild 按属性 tree-shake JSON import）
const sampleJson = readFileSync(resolve(here, "../../examples/self-intro.act.json"), "utf8");

const result = await build({
  entryPoints: [resolve(here, "src/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  charset: "utf8",
  write: false,
  sourcemap: false,
  logLevel: "info",
  loader: { ".json": "json", ".ts": "ts" },
  define: {
    "process.env.NODE_ENV": '"production"',
    __SAMPLE_DECK__: JSON.stringify(sampleJson),
  },
});

const js = result.outputFiles[0].text;
const tpl = readFileSync(resolve(here, "src/runtime.template.html"), "utf8");
// 防止 JS 中潜在的 </script> 截断内联脚本
const safeJs = js.replace(/<\/(script)/gi, "<\\/$1");
// 用函数替换：safeJs 含 $& / $` / $' / $n 时，String.replace 会当特殊模式注入 template 片段 → 语法错误
const html = tpl.replace("__ONEACT_PLAYER_JS__", () => safeJs);

mkdirSync(resolve(here, "dist"), { recursive: true });
writeFileSync(resolve(here, "dist/runtime.html"), html);
console.log(`\n✓ built dist/runtime.html — ${(html.length / 1024).toFixed(1)} KB`);
