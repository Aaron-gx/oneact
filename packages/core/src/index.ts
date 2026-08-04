/**
 * @oneact/core — 一幕 OneAct 渲染引擎核心
 *
 * 组件注册表 + 主题引擎 + 动画引擎 + 切换引擎 + 渲染引擎。
 * 一并重新导出 @oneact/schema，使用者 `import { ... } from "@oneact/core"` 即可。
 */
export * from "./registry.js";
export * from "./theme.js";
export * from "./animation.js";
export * from "./transitions.js";
export * from "./render.js";
export * from "./measure.js";
export * from "./exporter-registry.js";
export * from "./plugin.js";
export * from "@oneact/schema";
