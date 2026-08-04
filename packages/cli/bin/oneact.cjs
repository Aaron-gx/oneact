#!/usr/bin/env node
// 一幕 OneAct CLI 入口（CJS：兼容 pptxgenjs 等含动态 require 的依赖）
const { run } = require("../dist/cli.cjs");
const result = run(process.argv.slice(2));
Promise.resolve(result).then((code) => {
  // serve 等长驻命令返回 0 但需保持事件循环；仅非零退出码强制退出
  if (code !== 0) process.exit(code);
});
