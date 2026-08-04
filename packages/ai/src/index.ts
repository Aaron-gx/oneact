/**
 * @oneact/ai — 一幕 OneAct AI 生成层
 *
 * 核心能力：
 *   · provider.ts       — 模型 provider 适配（用户自配 key，仅存本地）OpenAI/Anthropic/Gemini/国产
 *   · spec.ts           — 框架说明书（分档 spec，AI 生成的 system prompt）
 *   · generate.ts       — 生成协议（两段式 / 整页重写）+ 校验自愈循环
 *   · benchmark.ts      — 黄金测试集跑分器（v0.3 退出标准）
 *
 * 工程化补强：
 *   · router.ts         — 多模型分档路由（weak / standard / strong 自动选模型）
 *   · budget.ts         — Token 预算控制（会话级 + 日级双限熔断）
 *   · stream.ts         — SSE 流式 token 推送（打字机效果）
 *   · prompt-version.ts — Prompt 版本管理 + A/B 测试
 *   · guard.ts          — 内容安全护栏（输入注入检测 + 输出审核 + 逃逸块扫描）
 */
export * from "./provider.js";
export * from "./spec.js";
export * from "./generate.js";
export * from "./brief.js";
export * from "./benchmark.js";
export * from "./router.js";
export * from "./budget.js";
export * from "./stream.js";
export * from "./prompt-version.js";
export * from "./guard.js";
