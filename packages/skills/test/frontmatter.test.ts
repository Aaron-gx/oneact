import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeSkill } from "../src/frontmatter.js";
import type { Skill } from "../src/types.js";

describe("parseFrontmatter · frontmatter 解析", () => {
  it("最小合法 doc（仅 frontmatter）", () => {
    const s = parseFrontmatter(`---
id: x
name: 测试
description: d
dimension: style
---`);
    expect(s.id).toBe("x");
    expect(s.dimension).toBe("style");
  });

  it("完整 doc 含骨架 / 风格 / 指令三段", () => {
    const s = parseFrontmatter(`---
id: pitch
name: 路演
description: d
dimension: structure
triggers: [路演, 融资]
preferredMood: elegant
pageCount: 10
---
## 骨架
cover: 项目名
closing: ASK
## 风格指引
每页一论点
## 专业指令
数据标来源`);
    expect(s.structure).toEqual([
      { layout: "cover", title: "项目名" },
      { layout: "closing", title: "ASK" },
    ]);
    expect(s.styleNotes).toBe("每页一论点");
    expect(s.directives).toBe("数据标来源");
    expect(s.triggers).toEqual(["路演", "融资"]);
    expect(s.preferredMood).toBe("elegant");
    expect(s.pageCount).toBe(10);
  });

  it("CRLF 换行兼容", () => {
    const s = parseFrontmatter("---\r\nid: x\r\nname: n\r\ndescription: d\r\ndimension: style\r\n---\r\n");
    expect(s.id).toBe("x");
  });

  it("BOM 剥离", () => {
    const s = parseFrontmatter("﻿---\nid: x\nname: n\ndescription: d\ndimension: style\n---");
    expect(s.id).toBe("x");
  });

  it("缺 frontmatter → throw", () => {
    expect(() => parseFrontmatter("# 只有正文\n无围栏")).toThrow(/frontmatter/);
  });

  it("dimension 非法 → throw", () => {
    expect(() => parseFrontmatter("---\nid: x\nname: n\ndescription: d\ndimension: unknown\n---")).toThrow(/dimension/);
  });

  it("缺必填字段 → throw", () => {
    expect(() => parseFrontmatter("---\nid: x\nname: n\ndimension: style\n---")).toThrow(/必填/);
  });

  it("标题含冒号（只 split 首冒号）", () => {
    const s = parseFrontmatter(`---
id: x
name: n
description: d
dimension: structure
---
## 骨架
cover: 痛点：现状`);
    expect(s.structure?.[0].title).toBe("痛点：现状");
  });

  it("hint 管道符分隔", () => {
    const s = parseFrontmatter(`---
id: x
name: n
description: d
dimension: structure
---
## 骨架
cover: 标题 | 这是提示`);
    expect(s.structure?.[0].title).toBe("标题");
    expect(s.structure?.[0].hint).toBe("这是提示");
  });

  it("未知 ## 段忽略（容错）", () => {
    const s = parseFrontmatter(`---
id: x
name: n
description: d
dimension: style
---
## 自定义段
内容
## 风格指引
正式`);
    expect(s.styleNotes).toBe("正式");
  });

  it("引号包裹的值（含空格）", () => {
    const s = parseFrontmatter(`---
id: x
name: "我的 路演"
description: "d"
dimension: style
---`);
    expect(s.name).toBe("我的 路演");
  });
});

describe("serializeSkill · 序列化往返", () => {
  it("序列化后能重新解析", () => {
    const original: Skill = {
      id: "rt",
      name: "往返",
      description: "测",
      dimension: "structure",
      pageCount: 8,
      structure: [{ layout: "cover", title: "封面", hint: "提示" }],
      styleNotes: "风格",
      directives: "指令",
      triggers: ["a", "b"],
    };
    const back = parseFrontmatter(serializeSkill(original));
    expect(back.id).toBe("rt");
    expect(back.structure?.[0]).toEqual({ layout: "cover", title: "封面", hint: "提示" });
    expect(back.styleNotes).toBe("风格");
    expect(back.directives).toBe("指令");
    expect(back.triggers).toEqual(["a", "b"]);
  });

  it("内置 skill 可往返序列化", async () => {
    const { BUILTIN_SKILLS } = await import("../src/builtin.js");
    const pitch = BUILTIN_SKILLS.find((s) => s.id === "startup-pitch")!;
    const back = parseFrontmatter(serializeSkill(pitch));
    expect(back.id).toBe("startup-pitch");
    expect(back.structure?.length).toBe(pitch.structure!.length);
  });
});
