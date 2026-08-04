import type { Skill } from "../types.js";

/** 产品发布会 — 大屏视觉冲击、产品揭示节奏、特性 / 数据 / 路线图。 */
export const productLaunch: Skill = {
  id: "product-launch",
  name: "产品发布会",
  description: "新品发布 Keynote，痛点→产品揭示→特性→数据→路线图，强视觉冲击",
  dimension: "structure",
  version: "0.1.0",
  builtin: true,
  triggers: ["发布会", "产品发布", "新品", "旗舰", "上市", "Keynote", "launch"],
  pageCount: 11,
  structure: [
    { layout: "cover", title: "产品名 · 发布会主题", hint: "大标题 + 日期" },
    { layout: "section-divider", title: "旧时代的痛点", hint: "制造共鸣" },
    { layout: "hero", title: "产品揭示", hint: "一句话定位 + 大图" },
    { layout: "feature-list", title: "核心特性", hint: "3-5 个亮点" },
    { layout: "comparison", title: "对比上一代 / 竞品", hint: "量化提升" },
    { layout: "dashboard", title: "性能数据", hint: "跑分 / 续航 / 速度等大数字" },
    { layout: "process", title: "上手体验", hint: "使用流程 / 场景" },
    { layout: "timeline", title: "产品路线图", hint: "发布节奏 / 未来更新" },
    { layout: "team", title: "幕后团队", hint: "致谢研发" },
    { layout: "data", title: "价格与发售", hint: "版本 / 价格 / 开售日期" },
    { layout: "closing", title: "立即体验", hint: "CTA + 官网 / 渠道" },
  ],
  styleNotes:
    "发布会重视觉冲击：大图大字、强对比、每页一个核心信息；产品揭示页要有仪式感（居中 / 渐变 / 留白）；" +
    "数据页用超大数字 + 单位 + 一句注解；节奏分明（痛点铺垫 → 揭示高潮 → 特性展开 → 数据佐证 → 行动收尾）。",
};
