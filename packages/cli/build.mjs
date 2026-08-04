/**
 * @oneact/cli — 构建脚本：esbuild 把 cli.ts + 全部 @oneact/* 依赖打包为单文件 dist/cli.mjs。
 */
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, "src/cli.ts")],
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  outfile: resolve(here, "dist/cli.cjs"),
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
console.log("✓ built dist/cli.cjs");
