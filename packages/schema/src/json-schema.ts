/**
 * @oneact/schema — slides.json 的 JSON Schema（供 AI 生成约束 / IDE 校验）
 *
 * 对外契约：AI 生成时以此为最低约束，组件 props 仅声明关键字段，
 * additionalProperties 适度放开（避免过度约束反而让模型困惑）。
 */
import { FORMAT_VERSION } from "./format.js";

const rect = {
  type: "array",
  items: { type: "number" },
  minItems: 4,
  maxItems: 4,
  description: "[x, y, w, h]，1280×720 逻辑像素",
};

const richText = {
  oneOf: [
    { type: "string", description: "纯文本（单一样式）" },
    {
      type: "array",
      description: "runs 数组（混排，每片可独立样式）",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          bold: { type: "boolean" },
          italic: { type: "boolean" },
          underline: { type: "boolean" },
          color: { type: "string" },
          fontSize: { type: "number" },
          href: { type: "string" },
        },
        required: ["text"],
      },
    },
  ],
};

const anim = {
  type: "object",
  properties: {
    name: { type: "string", description: "预设名，如 fly-in-left / pulse / fade-out" },
    duration: { type: "number", description: "ms" },
    delay: { type: "number", description: "ms" },
    easing: { type: "string" },
    stagger: { type: "number", description: "ms，列表/图表错落" },
    order: { type: "number" },
  },
  required: ["name"],
  additionalProperties: false,
};

function element(type: string, props: Record<string, unknown>, desc: string) {
  return {
    type: "object",
    description: desc,
    properties: {
      id: { type: "string" },
      type: { type: "string", const: type },
      rect,
      slot: { type: "string" },
      anim,
      props: { type: "object", properties: props, additionalProperties: true },
    },
    required: ["id", "type", "rect", "props"],
  };
}

export const SLIDES_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "OneAct slides.json",
  type: "object",
  properties: {
    formatVersion: { type: "number", const: FORMAT_VERSION },
    meta: {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: "string" },
        theme: { type: "string", description: "主题名，如 yuanshan-blue / ink-green / warm-orange" },
        size: { type: "string", enum: ["16:9", "16:10", "4:3"] },
      },
      required: ["theme"],
    },
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          layout: { type: "string", description: "版式名（参考），坐标仍为绝对值" },
          title: { type: "string" },
          notes: { type: "string", description: "演讲者备注" },
          background: {
            type: "object",
            properties: {
              color: { type: "string" },
              gradient: {
                type: "object",
                properties: { from: { type: "string" }, to: { type: "string" }, angle: { type: "number" } },
              },
            },
          },
          transition: {
            type: "object",
            properties: { name: { type: "string" }, duration: { type: "number" }, easing: { type: "string" } },
            required: ["name"],
          },
          elements: { type: "array", items: { type: "object" } },
        },
        required: ["id", "elements"],
      },
    },
  },
  required: ["formatVersion", "meta", "pages"],
  definitions: {
    element: {
      oneOf: [
        element(
          "heading",
          {
            text: richText,
            level: { type: "integer", enum: [1, 2, 3] },
            align: { type: "string", enum: ["left", "center", "right"] },
            tone: { enum: ["primary", "accent", "text"] },
          },
          "标题",
        ),
        element(
          "paragraph",
          { text: richText, align: { enum: ["left", "center", "right", "justify"] }, fontSize: { type: "number" } },
          "段落",
        ),
        element("bullet-list", { items: { type: "array", items: richText }, ordered: { type: "boolean" } }, "列表"),
        element(
          "image",
          { src: { type: "string" }, alt: { type: "string" }, fit: { enum: ["cover", "contain", "fill"] } },
          "图片",
        ),
        element(
          "chart",
          {
            chartType: { enum: ["bar", "line", "pie", "doughnut", "area"] },
            data: {
              type: "object",
              properties: {
                categories: { type: "array", items: { type: "string" } },
                series: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      values: { type: "array", items: { type: "number" } },
                      color: { type: "string" },
                    },
                    required: ["name", "values"],
                  },
                },
              },
              required: ["categories", "series"],
            },
            title: { type: "string" },
            summary: { type: "string", description: "无障碍文字摘要" },
          },
          "图表（语义层：AI 只写 类型+数据，渲染层翻译）",
        ),
        element(
          "table",
          {
            columns: { type: "array", items: { type: "number" } },
            head: { type: "array", items: richText },
            rows: { type: "array", items: { type: "array", items: richText } },
          },
          "表格（列宽比例）",
        ),
        element(
          "shape",
          {
            shape: { enum: ["rect", "ellipse", "line", "triangle", "diamond", "chevron"] },
            fill: { type: "string" },
            stroke: { type: "string" },
          },
          "形状",
        ),
        element("icon", { name: { type: "string" }, size: { type: "number" }, color: { type: "string" } }, "图标"),
        element(
          "custom-html",
          { html: { type: "string" }, trusted: { type: "boolean" } },
          "逃逸块 HTML（默认沙箱隔离）",
        ),
        element("custom-svg", { svg: { type: "string" } }, "逃逸块 SVG（消毒后渲染）"),
      ],
    },
  },
} as const;
