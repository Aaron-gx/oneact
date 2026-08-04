import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sampleJson = readFileSync(resolve(here, "../../examples/self-intro.act.json"), "utf8");
const goldenJson = readFileSync(resolve(here, "../../examples/golden.act.json"), "utf8");
// 内联 player runtime.html，供编辑器「导出 HTML」生成自包含播放页
let playerRuntime = "<h1>player runtime.html 未构建，请先 build @oneact/player</h1>";
try {
  playerRuntime = readFileSync(resolve(here, "../../packages/player/dist/runtime.html"), "utf8");
} catch {
  console.warn("[web] 未找到 player/dist/runtime.html，导出 HTML 将不可用");
}

const define = {
  "process.env.NODE_ENV": '"production"',
  __SAMPLE_DECK__: JSON.stringify(sampleJson),
  __GOLDEN_DECK__: JSON.stringify(goldenJson),
  __PLAYER_RUNTIME__: JSON.stringify(playerRuntime),
};

// 浏览器 bundle：把 node:* 内置模块桩成空 Proxy
// （@oneact/exporter-deck 的 pack.ts 等仅在 node 端用 node:fs/path 打包 .actpack，
// 浏览器侧永不执行这些函数体；桩掉以避免 esbuild 解析失败）
const nodeStubPlugin = {
  name: "node-builtin-stub",
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path, namespace: "node-stub" }));
    b.onLoad({ filter: /.*/, namespace: "node-stub" }, () => ({
      contents: "module.exports = new Proxy({}, { get: () => () => undefined });",
      loader: "js",
    }));
  },
};

const commonOpts = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  charset: "utf8",
  write: false,
  loader: { ".ts": "ts" },
  define,
  plugins: [nodeStubPlugin],
};

mkdirSync(resolve(here, "dist"), { recursive: true });

// ── 构建编辑器 ──
const editorResult = await build({
  ...commonOpts,
  entryPoints: [resolve(here, "src/main.ts")],
});
const editorJs = editorResult.outputFiles[0].text.replace(/<\/(script)/gi, "<\/$1");
const editorTpl = readFileSync(resolve(here, "src/editor.template.html"), "utf8");
const editorHtml = editorTpl.replace("__EDITOR_JS__", () => editorJs);
writeFileSync(resolve(here, "dist/editor.html"), editorHtml);
console.log(`✓ built dist/editor.html — ${(editorHtml.length / 1024).toFixed(1)} KB`);

// ── 构建主页 ──
const homeResult = await build({
  ...commonOpts,
  entryPoints: [resolve(here, "src/home.ts")],
});
const homeJs = homeResult.outputFiles[0].text.replace(/<\/(script)/gi, "<\/$1");
const homeTpl = readFileSync(resolve(here, "src/home.template.html"), "utf8");
const homeHtml = homeTpl.replace("__HOME_JS__", () => homeJs);
writeFileSync(resolve(here, "dist/home.html"), homeHtml);
console.log(`✓ built dist/home.html — ${(homeHtml.length / 1024).toFixed(1)} KB`);
// Tauri 桌面端入口（默认加载 distDir/index.html）—— 同 home 内容
writeFileSync(resolve(here, "dist/index.html"), homeHtml);
console.log(`✓ built dist/index.html — Tauri 入口`);

// ── 构建日志页 ──
const logResult = await build({
  ...commonOpts,
  entryPoints: [resolve(here, "src/log.ts")],
});
const logJs = logResult.outputFiles[0].text.replace(/<\/(script)/gi, "<\/$1");
const logTpl = readFileSync(resolve(here, "src/log.template.html"), "utf8");
const logHtml = logTpl.replace("__LOG_JS__", () => logJs);
writeFileSync(resolve(here, "dist/log.html"), logHtml);
console.log(`✓ built dist/log.html — ${(logHtml.length / 1024).toFixed(1)} KB`);
