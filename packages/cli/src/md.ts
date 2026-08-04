/**
 * @oneact/cli — md2act：Markdown → .act（策划书 v2 导入）
 *
 * 约定：
 *   # 标题        → deck 标题（首个）或新页（后续）
 *   ## 标题       → 新页标题
 *   段落          → paragraph
 *   - / * 列表    → bullet-list（连续合并）
 *   ![alt](src)   → image
 *   > 引用        → paragraph（primary 强调）
 *   ```代码```    → custom-html 代码块
 * 元素垂直堆叠（y 游标），超出画布由校验器报告，用户可再编辑。
 */
import type { Deck, Page } from "@oneact/schema";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToDeck(md: string, opts: { theme?: string; title?: string } = {}): Deck {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const pages: Page[] = [];
  let deckTitle = opts.title ?? "Markdown 导入";
  const theme = opts.theme ?? "yuanshan-blue";
  let page: Page | null = null;
  let y = 150;
  let bullets: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];

  const flushBullets = (): void => {
    const p = page;
    if (p && bullets.length) {
      const h = bullets.length * 36 + 16;
      p.elements.push({
        id: `${p.id}-bl`,
        type: "bullet-list",
        rect: [64, y, 1152, h],
        props: { items: [...bullets], fontSize: 20 },
      });
      y += h + 20;
      bullets = [];
    }
  };

  const newPage = (title: string): void => {
    flushBullets();
    const prev = page;
    if (prev && prev.elements.length) pages.push(prev);
    const id = `p${pages.length + 1}`;
    page = {
      id,
      layout: "two-column",
      elements: [{ id: `${id}-h`, type: "heading", rect: [64, 48, 1152, 60], props: { text: title, tone: "primary" } }],
    };
    y = 150;
  };

  /** 取当前页（调用方已确保 page 非空）。 */
  const cur = (): Page => page!;

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) {
        if (page) {
          const h = Math.max(60, codeBuf.length * 22 + 28);
          cur().elements.push({
            id: `${cur().id}-code`,
            type: "custom-html",
            rect: [64, y, 1152, h],
            props: {
              html: `<pre style="margin:0;padding:12px;background:#16151a;color:#e6e6e6;border-radius:8px;font-size:13px;line-height:1.6;overflow:hidden">${esc(codeBuf.join("\n"))}</pre>`,
            },
          });
          y += h + 20;
        }
        codeBuf = [];
        inCode = false;
      } else {
        flushBullets();
        inCode = true;
        codeBuf = [];
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    const t = raw.trim();
    if (!t) {
      flushBullets();
      continue;
    }
    if (t.startsWith("# ") && !page && pages.length === 0) {
      deckTitle = t.slice(2).trim();
    } else if (t.startsWith("## ") || t.startsWith("# ")) {
      newPage(t.replace(/^#+\s/, ""));
    } else if (/^[-*]\s+/.test(t)) {
      if (!page) newPage(deckTitle);
      bullets.push(t.replace(/^[-*]\s+/, ""));
    } else if (/^>\s?/.test(t)) {
      if (!page) newPage(deckTitle);
      flushBullets();
      cur().elements.push({
        id: `${cur().id}-q`,
        type: "paragraph",
        rect: [64, y, 1152, 80],
        props: { text: t.replace(/^>\s?/, ""), tone: "primary", fontSize: 22 },
      });
      y += 100;
    } else if (/^!\[([^\]]*)\]\(([^)]+)\)$/.test(t)) {
      if (!page) newPage(deckTitle);
      flushBullets();
      const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(t)!;
      cur().elements.push({
        id: `${cur().id}-img`,
        type: "image",
        rect: [200, y, 880, 360],
        props: { src: m[2], alt: m[1] || "图片" },
      });
      y += 380;
    } else {
      if (!page) newPage(deckTitle);
      flushBullets();
      cur().elements.push({
        id: `${cur().id}-p${cur().elements.length}`,
        type: "paragraph",
        rect: [64, y, 1152, 80],
        props: { text: t, fontSize: 20 },
      });
      y += 100;
    }
  }
  flushBullets();
  if (page && cur().elements.length) pages.push(page);
  if (pages.length === 0) {
    newPage(deckTitle);
    pages.push(page!);
  }
  return { formatVersion: 1, meta: { title: deckTitle, theme }, pages };
}
