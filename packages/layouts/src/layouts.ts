/**
 * @oneact/layouts — 版式原语（8 套，16:9 / 1280×720）+ slot 坐标模板
 *
 * AI 只需"选版式 → 选 slot → 填内容"，零坐标计算（约束模式）。
 * 每套版式携带具名 slot：rect（绝对坐标）+ accepts（接受的组件类型，校验器硬校验）。
 */
import type { LayoutDef } from "@oneact/schema";

export const LAYOUTS: Record<string, LayoutDef> = {
  // ── 标题页 ──
  title: {
    name: "title",
    title: "标题页",
    slots: {
      title: { rect: [64, 280, 1152, 110], accepts: ["heading"] },
      subtitle: { rect: [64, 410, 1152, 44], accepts: ["paragraph"] },
    },
  },

  // ── 目录页 ──
  toc: {
    name: "toc",
    title: "目录页",
    slots: {
      title: { rect: [64, 56, 1152, 64], accepts: ["heading"] },
      list: { rect: [64, 170, 1152, 490], accepts: ["bullet-list", "paragraph"] },
    },
  },

  // ── 左右分栏 ──
  "two-column": {
    name: "two-column",
    title: "左右分栏",
    slots: {
      title: { rect: [64, 48, 1152, 60], accepts: ["heading"] },
      subtitle: { rect: [64, 124, 700, 32], accepts: ["paragraph"] },
      left: { rect: [64, 180, 560, 480], accepts: ["bullet-list", "paragraph", "image", "table"] },
      right: { rect: [656, 180, 560, 480], accepts: ["chart", "image", "table", "bullet-list", "paragraph"] },
    },
  },

  // ── 三卡片 ──
  "three-card": {
    name: "three-card",
    title: "三卡片",
    slots: {
      title: { rect: [64, 48, 1152, 60], accepts: ["heading", "section-title"] },
      card1: {
        rect: [64, 160, 360, 500],
        accepts: ["feature-card", "kpi", "heading", "paragraph", "bullet-list", "image", "shape"],
      },
      card2: {
        rect: [460, 160, 360, 500],
        accepts: ["feature-card", "kpi", "heading", "paragraph", "bullet-list", "image", "shape"],
      },
      card3: {
        rect: [856, 160, 360, 500],
        accepts: ["feature-card", "kpi", "heading", "paragraph", "bullet-list", "image", "shape"],
      },
    },
  },

  // ── 大图页 ──
  "big-image": {
    name: "big-image",
    title: "大图页",
    slots: {
      title: { rect: [64, 48, 1152, 60], accepts: ["heading"] },
      image: { rect: [64, 140, 1152, 500], accepts: ["image"] },
    },
  },

  // ── 数据页 ──
  data: {
    name: "data",
    title: "数据页",
    slots: {
      title: { rect: [64, 48, 1152, 60], accepts: ["heading", "section-title"] },
      metric1: { rect: [64, 150, 360, 180], accepts: ["kpi", "heading", "paragraph"] },
      metric2: { rect: [460, 150, 360, 180], accepts: ["kpi", "heading", "paragraph"] },
      metric3: { rect: [856, 150, 360, 180], accepts: ["kpi", "heading", "paragraph"] },
      chart: { rect: [64, 360, 1152, 300], accepts: ["chart"] },
    },
  },

  // ── 引用页 ──
  quote: {
    name: "quote",
    title: "引用页",
    slots: {
      quote: { rect: [140, 210, 1000, 240], accepts: ["paragraph", "heading"] },
      author: { rect: [140, 470, 1000, 40], accepts: ["paragraph"] },
    },
  },

  // ── 结束页 ──
  end: {
    name: "end",
    title: "结束页",
    slots: {
      title: { rect: [64, 300, 1152, 90], accepts: ["heading"] },
      subtitle: { rect: [64, 410, 1152, 40], accepts: ["paragraph"] },
    },
  },

  // ── 高级版式（spec §4 推荐；区域 slot 内可叠加多元素：shape 底 → heading/paragraph 内容）──
  cover: {
    name: "cover",
    title: "封面页",
    slots: {
      deco: { rect: [0, 0, 1280, 720], accepts: ["shape"] },
      title: { rect: [120, 260, 1040, 100], accepts: ["heading"] },
      subtitle: { rect: [120, 380, 1040, 44], accepts: ["paragraph"] },
      meta: { rect: [120, 450, 1040, 30], accepts: ["paragraph"] },
    },
  },
  "section-divider": {
    name: "section-divider",
    title: "章节分隔页",
    slots: {
      bar: { rect: [120, 320, 80, 6], accepts: ["shape"] },
      title: { rect: [120, 340, 1040, 80], accepts: ["heading"] },
      subtitle: { rect: [120, 430, 1040, 36], accepts: ["paragraph"] },
    },
  },
  dashboard: {
    name: "dashboard",
    title: "仪表盘页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading", "section-title"] },
      kpi1: { rect: [64, 112, 360, 130], accepts: ["kpi", "shape", "heading", "paragraph"] },
      kpi2: { rect: [460, 112, 360, 130], accepts: ["kpi", "shape", "heading", "paragraph"] },
      kpi3: { rect: [856, 112, 360, 130], accepts: ["kpi", "shape", "heading", "paragraph"] },
      chart: { rect: [64, 262, 752, 400], accepts: ["chart", "shape"] },
      side: {
        rect: [840, 262, 376, 400],
        accepts: ["feature-list", "callout", "shape", "heading", "paragraph", "bullet-list", "table"],
      },
    },
  },
  comparison: {
    name: "comparison",
    title: "对比页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading"] },
      leftBg: { rect: [64, 120, 560, 520], accepts: ["shape"] },
      leftTitle: { rect: [96, 140, 496, 40], accepts: ["heading"] },
      leftContent: { rect: [96, 195, 496, 420], accepts: ["bullet-list", "paragraph", "shape", "icon"] },
      rightBg: { rect: [656, 120, 560, 520], accepts: ["shape"] },
      rightTitle: { rect: [688, 140, 496, 40], accepts: ["heading"] },
      rightContent: { rect: [688, 195, 496, 420], accepts: ["bullet-list", "paragraph", "shape", "icon"] },
    },
  },
  timeline: {
    name: "timeline",
    title: "时间线页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading"] },
      line: { rect: [120, 200, 1040, 4], accepts: ["shape"] },
      item1: { rect: [80, 180, 240, 320], accepts: ["shape", "heading", "paragraph"] },
      item2: { rect: [360, 180, 240, 320], accepts: ["shape", "heading", "paragraph"] },
      item3: { rect: [640, 180, 240, 320], accepts: ["shape", "heading", "paragraph"] },
      item4: { rect: [920, 180, 240, 320], accepts: ["shape", "heading", "paragraph"] },
    },
  },
  process: {
    name: "process",
    title: "流程页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading"] },
      step1: { rect: [64, 140, 280, 400], accepts: ["shape", "heading", "paragraph"] },
      step2: { rect: [376, 140, 280, 400], accepts: ["shape", "heading", "paragraph"] },
      step3: { rect: [688, 140, 280, 400], accepts: ["shape", "heading", "paragraph"] },
      arrow1: { rect: [344, 300, 32, 32], accepts: ["shape", "icon"] },
      arrow2: { rect: [656, 300, 32, 32], accepts: ["shape", "icon"] },
    },
  },
  "stats-grid": {
    name: "stats-grid",
    title: "统计网格页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading", "section-title"] },
      cell1: { rect: [64, 120, 560, 240], accepts: ["kpi", "feature-card", "shape", "heading", "paragraph", "icon"] },
      cell2: { rect: [656, 120, 560, 240], accepts: ["kpi", "feature-card", "shape", "heading", "paragraph", "icon"] },
      cell3: { rect: [64, 380, 560, 240], accepts: ["kpi", "feature-card", "shape", "heading", "paragraph", "icon"] },
      cell4: { rect: [656, 380, 560, 240], accepts: ["kpi", "feature-card", "shape", "heading", "paragraph", "icon"] },
    },
  },
  "feature-list": {
    name: "feature-list",
    title: "特性列表页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading"] },
      subtitle: { rect: [64, 108, 1152, 32], accepts: ["paragraph"] },
      row1: { rect: [64, 170, 1152, 100], accepts: ["shape", "icon", "heading", "paragraph"] },
      row2: { rect: [64, 290, 1152, 100], accepts: ["shape", "icon", "heading", "paragraph"] },
      row3: { rect: [64, 410, 1152, 100], accepts: ["shape", "icon", "heading", "paragraph"] },
      row4: { rect: [64, 530, 1152, 100], accepts: ["shape", "icon", "heading", "paragraph"] },
    },
  },
  team: {
    name: "team",
    title: "团队页",
    slots: {
      title: { rect: [64, 40, 1152, 52], accepts: ["heading", "section-title"] },
      member1: {
        rect: [64, 130, 360, 500],
        accepts: ["avatar", "feature-card", "shape", "image", "heading", "paragraph"],
      },
      member2: {
        rect: [460, 130, 360, 500],
        accepts: ["avatar", "feature-card", "shape", "image", "heading", "paragraph"],
      },
      member3: {
        rect: [856, 130, 360, 500],
        accepts: ["avatar", "feature-card", "shape", "image", "heading", "paragraph"],
      },
    },
  },
  closing: {
    name: "closing",
    title: "结尾行动页",
    slots: {
      bg: { rect: [0, 0, 1280, 720], accepts: ["shape"] },
      title: { rect: [120, 260, 1040, 80], accepts: ["heading"] },
      subtitle: { rect: [120, 360, 1040, 44], accepts: ["paragraph"] },
      cta: { rect: [120, 440, 400, 56], accepts: ["shape", "heading"] },
    },
  },

  // ── 容器版式（WS1）：承接复合语义组件，单元素占满内容区 ──
  hero: {
    name: "hero",
    title: "单内容页",
    slots: {
      bg: { rect: [0, 0, 1280, 720], accepts: ["shape"] },
      body: {
        rect: [80, 110, 1120, 500],
        accepts: [
          "section-title",
          "kpi",
          "stat-grid",
          "feature-card",
          "feature-list",
          "timeline",
          "process",
          "comparison",
          "callout",
          "chart",
          "image",
          "table",
          "bullet-list",
          "heading",
          "paragraph",
        ],
      },
    },
  },
  content: {
    name: "content",
    title: "标题+内容页",
    slots: {
      title: { rect: [64, 44, 1152, 60], accepts: ["heading", "section-title"] },
      body: {
        rect: [64, 130, 1152, 550],
        accepts: [
          "section-title",
          "kpi",
          "stat-grid",
          "feature-card",
          "feature-list",
          "timeline",
          "process",
          "comparison",
          "callout",
          "badge",
          "divider",
          "chart",
          "image",
          "table",
          "bullet-list",
          "heading",
          "paragraph",
        ],
      },
    },
  },
};

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

export function getLayout(name: string): LayoutDef | undefined {
  return LAYOUTS[name];
}

/** 注册自定义版式（插件注册点，策划书第 10 节）。 */
export function registerLayout(def: LayoutDef): void {
  LAYOUTS[def.name] = def;
}
