/**
 * @oneact/web — 文档存储（localStorage）
 *
 * 多文档管理：创建、列表、读取、保存、删除、重命名。
 * 主页和编辑器共享此模块。
 */
import type { Deck } from "@oneact/schema";

const STORAGE_KEY = "oneact-docs";
const META_KEY = "oneact-docs-meta";

export interface DocMeta {
  id: string;
  title: string;
  createdAt: number;
  modifiedAt: number;
  pageCount: number;
  thumb: string; // 第一页缩略图 HTML
}

/** 生成唯一 id */
export function genId(): string {
  return "doc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

/** 读取全部文档元信息（不含 deck 数据，避免大对象拷贝） */
export function listDocs(): DocMeta[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DocMeta[];
    return arr.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [];
  }
}

/** 读取单个文档完整数据（含 deck） */
export function getDoc(id: string): { meta: DocMeta; deck: Deck } | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (!raw) return null;
    const deck = JSON.parse(raw) as Deck;
    const metas = listDocs();
    const meta = metas.find((m) => m.id === id);
    if (!meta) return null;
    return { meta, deck };
  } catch {
    return null;
  }
}

/** 保存文档（deck + 元信息），返回元信息 */
export function saveDoc(id: string, deck: Deck, title?: string): DocMeta {
  const metas = listDocs();
  const existing = metas.find((m) => m.id === id);
  const now = Date.now();
  const meta: DocMeta = {
    id,
    title: title ?? existing?.title ?? deck.meta.title ?? "未命名演示",
    createdAt: existing?.createdAt ?? now,
    modifiedAt: now,
    pageCount: deck.pages.length,
    thumb: existing?.thumb ?? "",
  };
  // 存储 deck
  localStorage.setItem(`${STORAGE_KEY}:${id}`, JSON.stringify(deck));
  // 更新元信息
  const idx = metas.findIndex((m) => m.id === id);
  if (idx >= 0) metas[idx] = meta;
  else metas.push(meta);
  localStorage.setItem(META_KEY, JSON.stringify(metas));
  return meta;
}

/** 更新缩略图 */
export function updateThumb(id: string, thumb: string): void {
  const metas = listDocs();
  const idx = metas.findIndex((m) => m.id === id);
  if (idx >= 0) {
    metas[idx].thumb = thumb;
    localStorage.setItem(META_KEY, JSON.stringify(metas));
  }
}

/** 创建新文档，返回 id */
export function createDoc(deck: Deck): string {
  const id = genId();
  saveDoc(id, deck);
  return id;
}

/** 删除文档 */
export function deleteDoc(id: string): void {
  localStorage.removeItem(`${STORAGE_KEY}:${id}`);
  const metas = listDocs().filter((m) => m.id !== id);
  localStorage.setItem(META_KEY, JSON.stringify(metas));
}

/** 重命名文档（同步更新存储的 deck.meta.title，使编辑器打开时标题一致，避免被 autoSave 回写覆盖） */
export function renameDoc(id: string, title: string): void {
  const metas = listDocs();
  const idx = metas.findIndex((m) => m.id === id);
  if (idx >= 0) {
    metas[idx].title = title;
    metas[idx].modifiedAt = Date.now();
    localStorage.setItem(META_KEY, JSON.stringify(metas));
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${id}`);
    if (raw) {
      const deck = JSON.parse(raw) as Deck;
      if (deck && deck.meta) {
        deck.meta.title = title;
        localStorage.setItem(`${STORAGE_KEY}:${id}`, JSON.stringify(deck));
      }
    }
  } catch {
    /* deck 数据损坏时忽略，仅改元信息 */
  }
}

/** 创建空白演示 deck */
export function createBlankDeck(title?: string): Deck {
  return {
    formatVersion: 1,
    meta: {
      title: title ?? "未命名演示",
      theme: "yuanshan-blue",
      size: "16:9",
    },
    pages: [
      {
        id: "p1",
        layout: "title",
        title: "标题页",
        elements: [
          {
            id: "t1",
            type: "heading",
            slot: "title",
            rect: [64, 280, 1152, 110],
            props: { text: "点击编辑标题", level: 1, align: "center", tone: "primary" },
          },
          {
            id: "t2",
            type: "paragraph",
            slot: "subtitle",
            rect: [64, 410, 1152, 44],
            props: { text: "双击编辑副标题", align: "center", tone: "text-secondary", fontSize: 22 },
          },
        ],
      },
    ],
  };
}
