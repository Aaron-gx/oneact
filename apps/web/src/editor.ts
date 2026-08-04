/**
 * @oneact/web — 编辑器核心（Editor 类）
 *
 * 类 WPS 三栏：缩略图 / 画布点选 / 属性面板。
 * 点选元素 → 属性面板编辑（位置/文本/颜色/动画）→ 实时重渲染 + 校验。
 * 「让 AI 改这一页」→ 调 @oneact/ai rewritePage（整页重写 + 校验自愈）。
 */
import { type createProvider, rewritePage, generateDeckStream } from "@oneact/ai";
import type { Brief } from "@oneact/ai";
import type { ComposedSkill } from "@oneact/skills";
import { canvasSize, computeScale, getTheme, migrate, renderPage, runtimeCss, validateDeck } from "@oneact/core";
import { LAYOUTS } from "@oneact/layouts";
import "@oneact/components";
import type { AnyElement, CanvasSize, Deck, ElementType, Page, Rect, Theme } from "@oneact/schema";
import { logInfo, logWarn, logError, maskConfig } from "./logger.js";
import { activeConfig, getActiveProvider, createRecordingProvider } from "./providers.js";

export interface EditorHost {
  stage: HTMLElement;
  thumbs: HTMLElement;
  props: HTMLElement;
  pageCount: HTMLElement;
  validator: HTMLElement;
  zoom: HTMLElement;
  docTitle: HTMLElement;
}

export const ANIM_CHOICES = ["", "fade-in", "fly-in-left", "fly-in-up", "zoom-in", "wipe-left", "float-in", "pulse"];
export const ANIM_LABELS: Record<string, string> = {
  "": "无",
  "fade-in": "淡入",
  "fly-in-left": "飞入·左",
  "fly-in-up": "飞入·上",
  "zoom-in": "缩放",
  "wipe-left": "擦除",
  "float-in": "浮入",
  pulse: "脉冲",
};
const TONES: { k: string; c: string }[] = [
  { k: "text", c: "var(--oa-color-text)" },
  { k: "primary", c: "var(--oa-color-primary)" },
  { k: "accent", c: "var(--oa-color-accent)" },
  { k: "text-secondary", c: "var(--oa-color-text-secondary)" },
];

export class Editor {
  deck: Deck;
  theme: Theme;
  canvas: CanvasSize;
  index = 0;
  selectedId: string | null = null;
  private host: EditorHost;
  private scale = 1;
  private manualScale = 0;
  private history: string[] = [];
  private historyIdx = -1;
  private clipboard: AnyElement | null = null;
  private isDragging = false;
  /** 最近一次生成使用的 skill 组合（供「AI 改这一页」rewritePage 复用）。 */
  lastSkills?: ComposedSkill;

  constructor(deck: Deck, host: EditorHost) {
    this.deck = migrate(deck).deck;
    this.theme = getTheme(this.deck.meta.theme);
    this.canvas = canvasSize(this.deck.meta.size);
    this.host = host;
    this.injectCss();
    this.host.docTitle.textContent = this.deck.meta.title ?? "未命名";
    this.renderThumbs();
    this.goTo(0);
    this.snapshot(); // 初始快照
    window.addEventListener("resize", () => {
      this.fit();
      this.fitThumbs();
    });
    this.host.validator.addEventListener("click", () => this.toggleValidatorDetails());
    // 确保布局完成后重新计算尺寸
    requestAnimationFrame(() => {
      this.fit();
      this.renderCanvas();
    });
    setTimeout(() => {
      this.fit();
      this.renderCanvas();
    }, 200);
  }

  get currentPage(): Page {
    return this.deck.pages[this.index];
  }

  private injectCss(): void {
    const id = "oneact-runtime-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = runtimeCss();
    document.head.appendChild(style);
  }

  // ── 翻页 ──
  goTo(i: number): void {
    this.index = Math.max(0, Math.min(i, this.deck.pages.length - 1));
    this.selectedId = null;
    this.renderCanvas();
    this.renderProps();
    this.validate();
    this.highlightThumb();
    this.host.pageCount.textContent = `${this.index + 1} / ${this.deck.pages.length}`;
  }
  next(): void {
    this.goTo(this.index + 1);
  }
  prev(): void {
    this.goTo(this.index - 1);
  }

  // ── 画布渲染 + 点选 + 拖拽 ──
  private renderCanvas(): void {
    this.host.stage.innerHTML = renderPage(this.currentPage, this.theme, {
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
      interactive: true,
    });
    const canvas = this.host.stage.querySelector(".oa-canvas");
    if (!canvas) return;
    // 不强制白底：renderPage 已按 page.background 或主题色（var(--oa-color-bg)）设好 canvas 背景，
    // 这里覆盖反而会把缩略图里看得到的背景色抹掉，造成「中间和左侧预览不一致」。

    // 点击空白处取消选中
    canvas.addEventListener("mousedown", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (!t) {
        // 点击空白 → 取消选中
        this.selectElement(null);
      }
    });

    // 为每个元素绑定直接拖拽
    canvas.querySelectorAll<HTMLElement>("[data-id]").forEach((elNode) => {
      const id = elNode.dataset.id!;
      // 鼠标按下 → 选中 + 准备拖拽
      elNode.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        // 先选中
        if (this.selectedId !== id) this.selectElement(id);
        // 启动拖拽追踪
        this.startDrag(e, id);
      });
      // click 备选选中（兼容只触发 click 的环境）
      elNode.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.selectedId !== id) this.selectElement(id);
      });
      // 双击 → 内联编辑
      elNode.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (this.selectedId !== id) this.selectElement(id);
        this.startInlineEdit(id, e.target as HTMLElement);
      });
      // 右键 → 上下文菜单
      elNode.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.selectedId !== id) this.selectElement(id);
        this.showContextMenu(e.clientX, e.clientY);
      });
    });

    // 画布右键 → 粘贴菜单
    canvas.addEventListener("contextmenu", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
      if (t) return; // 元素的 contextmenu 已处理
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY, true);
    });

    this.fit();
  }

  /** 直接拖拽元素（WPS 式：按下即选中，移动即拖拽） */
  private startDrag(e: MouseEvent, id: string): void {
    const el = this.currentPage.elements.find((x) => x.id === id);
    if (!el) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const [ox, oy] = el.rect;
    const sc = this.scale || 0.5;
    let moved = false;
    let guideH = -1,
      guideV = -1;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / sc;
      const dy = (ev.clientY - startY) / sc;
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      moved = true;
      this.isDragging = true;
      document.body.classList.add("oa-dragging");
      el.rect[0] = Math.round(ox + dx);
      el.rect[1] = Math.round(oy + dy);
      // 对齐辅助线
      const guides = this.computeAlignGuides(el.rect);
      guideH = guides.h;
      guideV = guides.v;
      if (guideH >= 0) el.rect[1] = guideH;
      if (guideV >= 0) el.rect[0] = guideV;
      this.updateSelVisual(el.rect);
      this.showAlignGuides(guideH, guideV, el.rect);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this.hideAlignGuides();
      this.isDragging = false;
      document.body.classList.remove("oa-dragging");
      if (moved) {
        this.snapshot();
        // 位置变化无需完整重渲染，更新选中框 + 属性面板 + 缩略图即可
        this.selectElement(id);
        this.validate();
        this.touchThumb(this.index);
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  /** 计算对齐辅助线（与画布中心/其他元素对齐） */
  private computeAlignGuides(rect: Rect): { h: number; v: number } {
    const [x, y, w, h] = rect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const canvasCx = this.canvas.width / 2;
    const canvasCy = this.canvas.height / 2;
    let bestV = -1,
      bestH = -1;
    let minDistV = 5,
      minDistH = 5;
    // 画布中心
    if (Math.abs(cx - canvasCx) < minDistV) {
      minDistV = Math.abs(cx - canvasCx);
      bestV = canvasCx - w / 2;
    }
    if (Math.abs(cy - canvasCy) < minDistH) {
      minDistH = Math.abs(cy - canvasCy);
      bestH = canvasCy - h / 2;
    }
    // 其他元素
    for (const other of this.currentPage.elements) {
      if (other.id === this.selectedId) continue;
      const [ox, oy, ow, oh] = other.rect;
      const ocx = ox + ow / 2;
      const ocy = oy + oh / 2;
      if (Math.abs(cx - ocx) < minDistV) {
        minDistV = Math.abs(cx - ocx);
        bestV = ocx - w / 2;
      }
      if (Math.abs(cy - ocy) < minDistH) {
        minDistH = Math.abs(cy - ocy);
        bestH = ocy - h / 2;
      }
      // 左边对齐
      if (Math.abs(x - ox) < minDistV) {
        minDistV = Math.abs(x - ox);
        bestV = ox;
      }
      if (Math.abs(y - oy) < minDistH) {
        minDistH = Math.abs(y - oy);
        bestH = oy;
      }
      // 右边对齐
      if (Math.abs(x + w - ox - ow) < minDistV) {
        minDistV = Math.abs(x + w - ox - ow);
        bestV = ox + ow - w;
      }
      if (Math.abs(y + h - oy - oh) < minDistH) {
        minDistH = Math.abs(y + h - oy - oh);
        bestH = oy + oh - h;
      }
    }
    return { h: bestH, v: bestV };
  }

  /** 显示对齐辅助线 */
  private showAlignGuides(h: number, v: number, rect: Rect): void {
    const canvas = this.host.stage.querySelector(".oa-canvas")!;
    if (!canvas) return;
    this.hideAlignGuides();
    if (v >= 0) {
      const line = document.createElement("div");
      line.className = "align-guide v";
      line.style.cssText = `position:absolute;left:${v + rect[2] / 2}px;top:0;width:0;height:100%;border-left:1px dashed #ef4444;z-index:9;pointer-events:none;`;
      canvas.appendChild(line);
    }
    if (h >= 0) {
      const line = document.createElement("div");
      line.className = "align-guide h";
      line.style.cssText = `position:absolute;left:0;top:${h + rect[3] / 2}px;width:100%;height:0;border-top:1px dashed #ef4444;z-index:9;pointer-events:none;`;
      canvas.appendChild(line);
    }
  }

  /** 隐藏对齐辅助线 */
  private hideAlignGuides(): void {
    this.host.stage.querySelectorAll(".align-guide").forEach((n) => n.remove());
  }

  /** 右键上下文菜单 */
  private showContextMenu(clientX: number, clientY: number, pasteOnly = false): void {
    this.hideContextMenu();
    const el = this.currentElement();
    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctx-menu";
    const items: { label: string; act: string; icon: string; disabled?: boolean }[] = [];
    if (!pasteOnly && el) {
      items.push({ label: "复制", act: "copy", icon: "📋" });
      items.push({ label: "粘贴", act: "paste", icon: "📌", disabled: !this.clipboard });
      items.push({ label: "—", act: "", icon: "" });
      items.push({ label: "置于顶层", act: "front", icon: "⬆" });
      items.push({ label: "上移一层", act: "forward", icon: "🔼" });
      items.push({ label: "下移一层", act: "backward", icon: "🔽" });
      items.push({ label: "置于底层", act: "back", icon: "⬇" });
      items.push({ label: "—", act: "", icon: "" });
      items.push({ label: "删除", act: "delete", icon: "🗑" });
    } else {
      items.push({ label: "粘贴", act: "paste", icon: "📌", disabled: !this.clipboard });
    }
    menu.innerHTML = items
      .map((it) =>
        it.act === ""
          ? `<div class="ctx-sep"></div>`
          : `<div class="ctx-item${it.disabled ? " disabled" : ""}" data-act="${it.act}"><span class="ctx-icon">${it.icon}</span>${it.label}</div>`,
      )
      .join("");
    document.body.appendChild(menu);
    // 定位
    const rect = menu.getBoundingClientRect();
    let left = clientX;
    let top = clientY;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    // 绑定点击
    menu.querySelectorAll<HTMLElement>(".ctx-item:not(.disabled)").forEach((item) => {
      item.addEventListener("click", () => {
        const act = item.dataset.act!;
        this.hideContextMenu();
        switch (act) {
          case "copy":
            this.copySelected();
            break;
          case "paste":
            this.paste();
            break;
          case "front":
            this.bringToFront();
            break;
          case "forward":
            this.moveForward();
            break;
          case "backward":
            this.moveBackward();
            break;
          case "back":
            this.sendToBack();
            break;
          case "delete":
            this.deleteSelected();
            break;
        }
      });
    });
    // 点击外部关闭
    setTimeout(() => {
      const close = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
          this.hideContextMenu();
          document.removeEventListener("mousedown", close);
        }
      };
      document.addEventListener("mousedown", close);
    }, 0);
  }

  private hideContextMenu(): void {
    document.getElementById("ctx-menu")?.remove();
  }

  /** 双击内联编辑文字（原地 contenteditable，所见即所得，无悬浮层缩放/失焦问题） */
  private startInlineEdit(id: string, clickTarget: HTMLElement): void {
    const el = this.currentPage.elements.find((x) => x.id === id);
    if (!el) return;
    const canvas = this.host.stage.querySelector(".oa-canvas")!;
    if (!canvas) return;
    const elNode = canvas.querySelector(`[data-id="${id}"]`)!;
    if (!elNode) return;
    // 定位到双击处最近的可编辑文本节点；找不到则取元素内首个；再没有则提示去右侧面板
    let target = (clickTarget.closest && clickTarget.closest<HTMLElement>("[data-oa-edit]")) || null;
    if (!target || !elNode.contains(target)) target = elNode.querySelector<HTMLElement>("[data-oa-edit]");
    if (!target) {
      document.dispatchEvent(new CustomEvent("oneact:focus-ai"));
      document.dispatchEvent(
        new CustomEvent("oneact:notify", { detail: `${typeName(el.type)} 暂不支持双击编辑，请在右侧面板修改` }),
      );
      return;
    }
    const field = target.dataset.oaEdit ?? "text";
    const multiline =
      field === "items" || field === "desc" || (field === "text" && (el.type === "paragraph" || el.type === "callout"));

    // 进入编辑态
    target.setAttribute("contenteditable", "true");
    target.style.outline = "2px solid var(--accent)";
    target.style.outlineOffset = "2px";
    target.style.cursor = "text";
    // 隔离事件：编辑节点上的 mousedown/keydown 不冒泡到元素拖拽 / 全局删除
    const stop = (e: Event) => e.stopPropagation();
    target.addEventListener("mousedown", stop);
    target.addEventListener("keydown", stop);

    requestAnimationFrame(() => {
      target.focus();
      // 全选当前文本
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      sel?.removeAllRanges();
      sel?.addRange(range);
    });

    let committed = false;
    const finish = () => {
      if (committed) return;
      committed = true;
      const val = target.innerText.replace(/ /g, " ");
      this.snapshot();
      const p = el.props as unknown as Record<string, unknown>;
      if (field === "items") {
        p.items = val
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        p[field] = val;
      }
      this.renderCanvas();
      this.selectElement(id);
      this.validate();
      this.touchThumb(this.index);
      this.renderProps();
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      this.renderCanvas();
      this.selectElement(id);
    };

    target.addEventListener("blur", finish, { once: true });
    target.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        target.blur();
      } else if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        target.blur();
      }
      // multiline: Enter 默认换行（contenteditable 原生）
    });
  }

  // ── 图层排序 ──
  bringToFront(): void {
    const el = this.currentElement();
    if (!el) return;
    const arr = this.currentPage.elements;
    const idx = arr.indexOf(el);
    if (idx === arr.length - 1) return;
    arr.splice(idx, 1);
    arr.push(el);
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.touchThumb(this.index);
  }
  sendToBack(): void {
    const el = this.currentElement();
    if (!el) return;
    const arr = this.currentPage.elements;
    const idx = arr.indexOf(el);
    if (idx === 0) return;
    arr.splice(idx, 1);
    arr.unshift(el);
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.touchThumb(this.index);
  }
  moveForward(): void {
    const el = this.currentElement();
    if (!el) return;
    const arr = this.currentPage.elements;
    const idx = arr.indexOf(el);
    if (idx === arr.length - 1) return;
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.touchThumb(this.index);
  }
  moveBackward(): void {
    const el = this.currentElement();
    if (!el) return;
    const arr = this.currentPage.elements;
    const idx = arr.indexOf(el);
    if (idx === 0) return;
    [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.touchThumb(this.index);
  }

  /** 选中元素：画选中框 + 缩放手柄 + 浮动条 + 填充属性面板。 */
  selectElement(id: string | null): void {
    this.selectedId = id;
    this.host.stage.querySelectorAll(".sel-box,.sel-tag,.sel-handle").forEach((n) => n.remove());
    const el = this.currentElement();
    if (el) {
      const canvas = this.host.stage.querySelector(".oa-canvas")!;
      if (!canvas) {
        this.renderProps();
        return;
      }
      const [x, y, w, h] = el.rect;
      // 选中框
      const box = document.createElement("div");
      box.className = "sel-box";
      box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
      canvas.appendChild(box);
      // 8 个缩放手柄
      const dirs = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
      for (const dir of dirs) {
        const handle = document.createElement("div");
        handle.className = `sel-handle h-${dir}`;
        handle.dataset.dir = dir;
        this.positionHandle(handle, x, y, w, h, dir);
        canvas.appendChild(handle);
        this.bindResize(handle, dir);
      }
      // 浮动标签
      const tag = document.createElement("div");
      tag.className = "sel-tag";
      tag.style.left = `${x}px`;
      tag.style.top = `${y - 26}px`;
      tag.innerHTML = `<span class="fid">#${el.id} · ${typeName(el.type)}</span><span class="b" data-ai="1">✦ AI 改</span>`;
      tag.querySelector<HTMLElement>("[data-ai]")!.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("oneact:focus-ai"));
      });
      canvas.appendChild(tag);
      // 绑定拖拽
      this.bindDrag(box);
    }
    this.renderProps();
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  /** 定位缩放手柄 */
  private positionHandle(handle: HTMLElement, x: number, y: number, w: number, h: number, dir: string): void {
    const o = -6; // 偏移量使手柄中心对准边缘
    switch (dir) {
      case "nw":
        handle.style.left = `${x + o}px`;
        handle.style.top = `${y + o}px`;
        break;
      case "n":
        handle.style.left = `${x + w / 2 + o}px`;
        handle.style.top = `${y + o}px`;
        break;
      case "ne":
        handle.style.left = `${x + w + o}px`;
        handle.style.top = `${y + o}px`;
        break;
      case "e":
        handle.style.left = `${x + w + o}px`;
        handle.style.top = `${y + h / 2 + o}px`;
        break;
      case "se":
        handle.style.left = `${x + w + o}px`;
        handle.style.top = `${y + h + o}px`;
        break;
      case "s":
        handle.style.left = `${x + w / 2 + o}px`;
        handle.style.top = `${y + h + o}px`;
        break;
      case "sw":
        handle.style.left = `${x + o}px`;
        handle.style.top = `${y + h + o}px`;
        break;
      case "w":
        handle.style.left = `${x + o}px`;
        handle.style.top = `${y + h / 2 + o}px`;
        break;
    }
  }

  /** 更新选中框 + 手柄 + 标签的视觉位置（拖拽/缩放过程中实时调用，不做完整重渲染） */
  private updateSelVisual(rect: Rect): void {
    const canvas = this.host.stage.querySelector(".oa-canvas")!;
    if (!canvas) return;
    const [x, y, w, h] = rect;
    const box = canvas.querySelector(".sel-box")!;
    if (box) {
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    }
    const tag = canvas.querySelector(".sel-tag")!;
    if (tag) {
      tag.style.left = `${x}px`;
      tag.style.top = `${y - 26}px`;
    }
    canvas.querySelectorAll<HTMLElement>(".sel-handle").forEach((hd) => {
      this.positionHandle(hd, x, y, w, h, hd.dataset.dir || "");
    });
    // 同时移动实际元素的 DOM 节点
    const el = this.currentElement();
    if (el) {
      const elNode = canvas.querySelector(`[data-id="${el.id}"]`)!;
      if (elNode) {
        elNode.style.left = `${x}px`;
        elNode.style.top = `${y}px`;
        elNode.style.width = `${w}px`;
        elNode.style.height = `${h}px`;
      }
    }
  }

  /** 绑定拖拽移动（委托给 startDrag，保持与元素直接拖拽一致的行为） */
  private bindDrag(box: HTMLElement): void {
    box.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).classList.contains("sel-handle")) return;
      e.preventDefault();
      e.stopPropagation();
      const el = this.currentElement();
      if (!el) return;
      this.startDrag(e, el.id);
    });
  }

  /** 绑定缩放手柄 */
  private bindResize(handle: HTMLElement, dir: string): void {
    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const el = this.currentElement();
      if (!el) return;
      this.isDragging = true;
      document.body.classList.add("oa-dragging");
      const startX = e.clientX;
      const startY = e.clientY;
      const [ox, oy, ow, oh] = el.rect;
      const sc = this.scale || 0.5;
      const MIN = 20;
      const onMove = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / sc;
        const dy = (ev.clientY - startY) / sc;
        let [x, y, w, h] = [ox, oy, ow, oh];
        if (dir.includes("w")) {
          x = ox + dx;
          w = ow - dx;
          if (w < MIN) {
            x = ox + ow - MIN;
            w = MIN;
          }
        }
        if (dir.includes("e")) {
          w = ow + dx;
          if (w < MIN) w = MIN;
        }
        if (dir.includes("n")) {
          y = oy + dy;
          h = oh - dy;
          if (h < MIN) {
            y = oy + oh - MIN;
            h = MIN;
          }
        }
        if (dir.includes("s")) {
          h = oh + dy;
          if (h < MIN) h = MIN;
        }
        el.rect = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
        this.updateSelVisual(el.rect);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        this.isDragging = false;
        document.body.classList.remove("oa-dragging");
        this.snapshot();
        this.renderCanvas();
        this.selectElement(el.id);
        this.validate();
        this.touchThumb(this.index);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  private currentElement(): AnyElement | null {
    if (!this.selectedId) return null;
    return this.currentPage.elements.find((e) => e.id === this.selectedId) ?? null;
  }

  /** 修改当前选中元素的某个字段，重渲染 + 校验。 */
  updateElement(mut: (el: AnyElement) => void): void {
    const el = this.currentElement();
    if (!el) return;
    mut(el);
    this.snapshot();
    this.renderCanvas();
    this.selectElement(this.selectedId);
    this.validate();
    this.touchThumb(this.index);
  }

  /** 给当前选中元素设置进入动画（供顶部「动画」tab 调用）。name 为空串表示清除。 */
  setElementAnim(name: string): boolean {
    const el = this.currentElement();
    if (!el) return false;
    this.updateElement((e) => {
      if (!name) e.anim = undefined;
      else e.anim = { name, duration: 600, stagger: name.startsWith("fly") || name === "fade-in" ? 120 : 0 };
    });
    return true;
  }

  /** 当前选中元素的动画名（供顶部高亮当前预设）。 */
  currentElementAnim(): string {
    return this.currentElement()?.anim?.name ?? "";
  }

  /** 当前选中元素的可格式化状态（供「开始」工具栏高亮）。 */
  currentFormat(): {
    type?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    align?: string;
    tone?: string;
    fontSize?: number;
    level?: number;
  } {
    const el = this.currentElement();
    if (!el) return {};
    const p = el.props as Record<string, unknown>;
    return {
      type: el.type,
      bold: !!p.bold,
      italic: !!p.italic,
      underline: !!p.underline,
      align: p.align as string | undefined,
      tone: p.tone as string | undefined,
      fontSize: p.fontSize as number | undefined,
      level: p.level as number | undefined,
    };
  }

  private isTextEl(t: string): boolean {
    return t === "heading" || t === "paragraph" || t === "bullet-list";
  }

  /** 切换 加粗 / 斜体 / 下划线（元素级，仅文本元素）。 */
  toggleFormat(fmt: "bold" | "italic" | "underline"): void {
    const el = this.currentElement();
    if (!el || !this.isTextEl(el.type)) return;
    this.updateElement((e) => {
      const p = e.props as Record<string, unknown>;
      p[fmt] = !p[fmt];
    });
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  /** 设置对齐（左/中/右）。 */
  setAlign(align: "left" | "center" | "right"): void {
    const el = this.currentElement();
    if (!el || (el.type !== "heading" && el.type !== "paragraph")) return;
    this.updateElement((e) => {
      (e.props as Record<string, unknown>).align = align;
    });
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  /** 设置主题色 tone。 */
  setTone(tone: string): void {
    const el = this.currentElement();
    if (!el || (el.type !== "heading" && el.type !== "paragraph")) return;
    this.updateElement((e) => {
      (e.props as Record<string, unknown>).tone = tone;
    });
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  /** 微调正文字号（段落/列表）。 */
  bumpFontSize(delta: number): void {
    const el = this.currentElement();
    if (!el || (el.type !== "paragraph" && el.type !== "bullet-list")) return;
    this.updateElement((e) => {
      const p = e.props as { fontSize?: number };
      p.fontSize = Math.max(12, Math.min(72, (p.fontSize ?? 19) + delta));
    });
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  /** 设置标题层级（heading 字号阶梯）。 */
  setHeadingLevel(level: 1 | 2 | 3): void {
    const el = this.currentElement();
    if (!el || el.type !== "heading") return;
    this.updateElement((e) => {
      (e.props as { level?: 1 | 2 | 3 }).level = level;
    });
    document.dispatchEvent(new CustomEvent("oneact:selection-change"));
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    this.currentPage.elements = this.currentPage.elements.filter((e) => e.id !== this.selectedId);
    this.selectedId = null;
    this.snapshot();
    this.renderCanvas();
    this.renderProps();
    this.validate();
    this.touchThumb(this.index);
  }

  // ── 撤销 / 重做 ──
  /** 记录快照入历史（main.ts 的自动保存会包装它，故公开）。 */
  snapshot(): void {
    this.history = this.history.slice(0, this.historyIdx + 1);
    this.history.push(JSON.stringify(this.deck));
    if (this.history.length > 50) this.history.shift();
    this.historyIdx = this.history.length - 1;
    document.dispatchEvent(new CustomEvent("oneact:history-change"));
  }
  undo(): void {
    if (this.historyIdx <= 0) return;
    this.historyIdx--;
    this.deck = JSON.parse(this.history[this.historyIdx]);
    this.index = Math.min(this.index, Math.max(0, this.deck.pages.length - 1));
    this.theme = getTheme(this.deck.meta.theme);
    this.selectedId = null;
    this.renderCanvas();
    this.renderProps();
    this.renderThumbs();
    this.validate();
    document.dispatchEvent(new CustomEvent("oneact:history-change"));
  }
  redo(): void {
    if (this.historyIdx >= this.history.length - 1) return;
    this.historyIdx++;
    this.deck = JSON.parse(this.history[this.historyIdx]);
    this.index = Math.min(this.index, Math.max(0, this.deck.pages.length - 1));
    this.theme = getTheme(this.deck.meta.theme);
    this.selectedId = null;
    this.renderCanvas();
    this.renderProps();
    this.renderThumbs();
    this.validate();
    document.dispatchEvent(new CustomEvent("oneact:history-change"));
  }
  /** 历史指针状态，供 UI 按钮 disabled 态使用。 */
  canUndo(): boolean {
    return this.historyIdx > 0;
  }
  canRedo(): boolean {
    return this.historyIdx < this.history.length - 1;
  }

  // ── 复制 / 粘贴 ──
  copySelected(): void {
    const el = this.currentElement();
    if (!el) return;
    this.clipboard = JSON.parse(JSON.stringify(el));
  }
  paste(): void {
    if (!this.clipboard) return;
    this.idSeq += 1;
    const el = JSON.parse(JSON.stringify(this.clipboard)) as AnyElement;
    el.id = `${el.type}-paste-${this.idSeq}`;
    el.rect = [el.rect[0] + 24, el.rect[1] + 24, el.rect[2], el.rect[3]];
    this.currentPage.elements.push(el);
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.validate();
    this.touchThumb(this.index);
  }

  /** 键盘方向键微调位置 */
  nudge(dx: number, dy: number): void {
    const el = this.currentElement();
    if (!el) return;
    el.rect[0] += dx;
    el.rect[1] += dy;
    this.snapshot();
    this.renderCanvas();
    this.selectElement(el.id);
    this.validate();
    this.touchThumb(this.index);
  }

  // ── 缩略图 ──
  private renderThumbs(): void {
    this.host.thumbs.innerHTML = "";
    this.deck.pages.forEach((page, i) => {
      const wrap = document.createElement("div");
      wrap.className = "thumb" + (i === this.index ? " active" : "");
      wrap.dataset.index = String(i);
      const scaler = document.createElement("div");
      scaler.className = "scaler";
      scaler.innerHTML = renderPage(page, this.theme, {
        canvasW: this.canvas.width,
        canvasH: this.canvas.height,
        interactive: false,
      });
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = String(i + 1);
      const del = document.createElement("span");
      del.className = "del";
      del.textContent = "×";
      del.title = "删除该页";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deletePage(i);
      });
      wrap.append(scaler, num, del);
      wrap.addEventListener("click", () => this.goTo(i));
      this.host.thumbs.appendChild(wrap);
    });
    // 布局落定后按各自容器宽度缩放，避免固定 scale 造成右侧/底部留白
    requestAnimationFrame(() => this.fitThumbs());
  }

  /** 按各自 .thumb 的实际宽度缩放 .scaler，让缩略图铺满、居中、不留白。 */
  private fitThumbs(): void {
    this.host.thumbs.querySelectorAll<HTMLElement>(".thumb").forEach((thumb) => {
      const scaler = thumb.querySelector<HTMLElement>(".scaler");
      if (!scaler) return;
      const w = thumb.clientWidth;
      if (!w) return;
      scaler.style.transform = `scale(${w / 1280})`;
    });
  }
  private highlightThumb(): void {
    this.host.thumbs
      .querySelectorAll<HTMLElement>(".thumb")
      .forEach((t) => t.classList.toggle("active", Number(t.dataset.index) === this.index));
  }
  private touchThumb(i: number): void {
    const scaler = this.host.thumbs.querySelector<HTMLElement>(`.thumb[data-index="${i}"] .scaler`);
    if (scaler)
      scaler.innerHTML = renderPage(this.deck.pages[i], this.theme, {
        canvasW: this.canvas.width,
        canvasH: this.canvas.height,
        interactive: false,
      });
  }

  addPage(): void {
    const maxN = this.deck.pages.reduce((m, p) => {
      const n = parseInt(String(p.id || "").replace(/^p/, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const id = `p${maxN + 1}`;
    this.deck.pages.push({
      id,
      layout: "title",
      elements: [
        {
          id: `${id}-t`,
          type: "heading",
          rect: [64, 280, 1152, 110],
          slot: "title",
          props: { text: "新页面", tone: "primary", align: "center" },
        },
      ],
    });
    this.snapshot();
    this.renderThumbs();
    this.goTo(this.deck.pages.length - 1);
  }
  private deletePage(i: number): void {
    if (this.deck.pages.length <= 1) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "至少保留一页，无法删除" }));
      return;
    }
    this.deck.pages.splice(i, 1);
    this.snapshot();
    this.renderThumbs();
    this.goTo(Math.min(i, this.deck.pages.length - 1));
  }

  /** 插入组件（策划书 6.1 插入）：在当前页加一个模板元素并选中。 */
  private idSeq = 0;
  addElement(type: ElementType): void {
    this.idSeq += 1;
    const id = `${type}-${this.idSeq}`;
    const el = createTemplate(type, id);
    this.currentPage.elements.push(el);
    this.snapshot();
    this.renderCanvas();
    this.selectElement(id);
    this.validate();
    this.touchThumb(this.index);
  }

  /** 插入智能组合块（多元素预设，一键插入高级排版）。 */
  addSmartBlock(key: string): void {
    this.idSeq += 1;
    const baseId = `smart-${this.idSeq}`;
    const els = createSmartBlock(key, baseId);
    if (els.length === 0) return;
    els.forEach((el) => this.currentPage.elements.push(el));
    this.snapshot();
    this.renderCanvas();
    // 选中组合块第一个元素
    this.selectElement(els[0].id);
    this.validate();
    this.touchThumb(this.index);
  }

  setTheme(name: string): void {
    this.deck.meta.theme = name;
    this.theme = getTheme(name);
    this.renderCanvas();
    this.renderThumbs();
    this.renderProps();
    this.validate();
  }

  /** 应用 AI 整页重写结果。 */
  applyRewrittenPage(page: Page): void {
    page.id = this.currentPage.id;
    this.deck.pages[this.index] = page;
    this.selectedId = null;
    this.renderCanvas();
    this.renderProps();
    this.validate();
    this.touchThumb(this.index);
    this.snapshot(); // 入撤销/重做历史 + 触发自动保存
  }

  /** 用一份新 deck 整体替换当前文档（migrate + 全量渲染 + 快照）。 */
  applyDeck(deck: Deck): void {
    this.deck = migrate(deck).deck;
    this.theme = getTheme(this.deck.meta.theme);
    this.canvas = canvasSize(this.deck.meta.size);
    this.selectedId = null;
    this.index = 0;
    this.renderThumbs();
    this.renderCanvas();
    this.renderProps();
    this.validate();
    this.snapshot();
    requestAnimationFrame(() => this.fit());
  }

  /**
   * AI 根据题目流式生成整套并替换当前 deck（先大纲 → 逐页，每页就绪即追加缩略图并跳转预览）。
   * 失败自动还原到调用前的 deck（不入历史）。onProgress 在每页就绪时回调（0-based）。
   */
  async generateDeckWithAi(
    provider: ReturnType<typeof createProvider>,
    topic: string,
    onOutline?: (totalPages: number) => void,
    onProgress?: (pageIndex: number, total: number) => void,
    brief?: Brief,
    skills?: ComposedSkill,
  ): Promise<{ ok: boolean; retries: number; pages: number; errorCount: number; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    this.lastSkills = skills; // 记录本次 skill，供「AI 改这一页」rewritePage 复用
    const backup = this.deck;
    // 先进入「生成中」状态：保留主题/尺寸，放一个占位页（避免空 pages 时 renderCanvas 访问 currentPage.elements 抛错）
    this.deck = {
      formatVersion: 1,
      meta: { ...backup.meta, title: topic || backup.meta.title || "未命名" },
      pages: [
        {
          id: "p-loading",
          layout: "title",
          elements: [
            {
              id: "p-loading-t",
              type: "heading",
              rect: [64, 280, 1152, 110],
              slot: "title",
              props: { text: "✦ AI 正在生成整套…", tone: "primary", align: "center" },
            },
          ],
        },
      ],
    };
    this.selectedId = null;
    this.index = 0;
    this.renderThumbs();
    this.renderCanvas();
    this.renderProps();
    try {
      const { deck, result, retries, usage } = await generateDeckStream({
        provider,
        topic,
        theme: this.deck.meta.theme,
        layouts: LAYOUTS,
        brief,
        skills,
        onOutline: (total) => onOutline?.(total),
        onPage: (page, i, total) => {
          this.deck.pages[i] = page;
          this.renderThumbs();
          this.goTo(Math.min(i, Math.max(0, this.deck.pages.length - 1)));
          // 给新生成的缩略图加入场光晕动画
          const thumb = this.host.thumbs.querySelector(`.thumb[data-index="${i}"]`);
          thumb?.classList.add("just-generated");
          // 逐页进度写入日志：让日志页「刷新」能看到生成过程（而非只能等整包完成）
          logInfo("gen", `第 ${i + 1}/${total} 页就绪`, {
            pageId: page.id,
            layout: page.layout,
            elements: page.elements.length,
          });
          onProgress?.(i, total);
        },
      });
      if (deck) {
        this.applyDeck(deck); // migrate + 全量渲染 + snapshot
        return { ok: result.ok, retries, pages: deck.pages.length, errorCount: result.errors.length, usage };
      }
      throw new Error("AI 未返回有效内容");
    } catch (e) {
      logError("gen", "逐页生成抛出异常", { topic, phase: "generateDeckStream", theme: this.deck.meta.theme }, e);
      // 失败：还原原 deck（手动恢复，不写历史）
      this.deck = backup;
      this.theme = getTheme(backup.meta.theme);
      this.canvas = canvasSize(backup.meta.size);
      this.index = Math.min(this.index, Math.max(0, backup.pages.length - 1));
      this.selectedId = null;
      this.renderThumbs();
      this.renderCanvas();
      this.renderProps();
      this.validate();
      throw e;
    }
  }

  /** 缩放画布到舞台可用尺寸。 */
  fit(): void {
    const stage = this.host.stage.parentElement!;
    // 放映态铺满全屏（边距 0）；编辑态留 40px 边距让白色画板四周透气
    const present = typeof document !== "undefined" && document.body.classList.contains("present");
    const margin = present ? 0 : 40;
    const availW = stage.clientWidth - margin;
    const availH = stage.clientHeight - margin;
    if (availW <= 0 || availH <= 0) {
      // 布局未就绪，使用默认缩放
      this.scale = this.manualScale > 0 ? this.manualScale : 0.5;
    } else {
      const auto = computeScale(availW, availH, this.canvas.width, this.canvas.height);
      this.scale = this.manualScale > 0 ? this.manualScale : auto;
    }
    const canvasEl = this.host.stage.firstElementChild as HTMLElement | null;
    if (canvasEl) {
      canvasEl.style.transformOrigin = "top left";
      canvasEl.style.position = "absolute";
      canvasEl.style.left = "0px";
      canvasEl.style.top = "0px";
      canvasEl.style.transform = `scale(${this.scale})`;
    }
    // #stage 按画板缩放后尺寸居中放置（绝对定位 + translate 居中，不受外层 flex 布局影响）
    const sw = this.canvas.width * this.scale;
    const sh = this.canvas.height * this.scale;
    this.host.stage.style.width = `${sw}px`;
    this.host.stage.style.height = `${sh}px`;
    this.host.stage.style.position = "absolute";
    this.host.stage.style.left = "50%";
    this.host.stage.style.top = "50%";
    this.host.stage.style.margin = "0";
    this.host.stage.style.transform = "translate(-50%, -50%)";
    this.host.zoom.textContent = `${Math.round(this.scale * 100)}%`;
  }

  /** 手动缩放（delta 正=放大，负=缩小），0=重置自适应。 */
  zoomBy(delta: number): void {
    if (delta === 0) {
      this.manualScale = 0;
      this.fit();
      return;
    }
    const cur = this.manualScale > 0 ? this.manualScale : this.scale;
    this.manualScale = Math.max(0.1, Math.min(2, cur + delta * 0.1));
    this.fit();
  }

  // ── 校验器状态 ──
  private lastValidation: {
    errors: { rule: string; message: string; pageId?: string; elementId?: string }[];
    warnings: { rule: string; message: string; pageId?: string; elementId?: string }[];
  } = { errors: [], warnings: [] };

  validate(): void {
    const r = validateDeck(this.deck, { layouts: LAYOUTS });
    this.lastValidation = { errors: r.errors, warnings: r.warnings };
    const b = this.host.validator;
    const errs = r.errors.length;
    const warns = r.warnings.length;
    b.className = "badge " + (errs ? "err" : warns ? "warn" : "ok");
    b.innerHTML = `<i></i>${errs ? `${errs} 个硬错误` : warns ? `${warns} 个软警告` : "校验通过 · 无越界/无重叠"}`;
    const allIssues = [...r.errors, ...r.warnings];
    const detailText = allIssues.length
      ? allIssues
          .map((i) => {
            const loc = [i.pageId, i.elementId]
              .filter(Boolean)
              .map((x) => `#${x}`)
              .join(" ");
            return `⚠ [${i.rule}] ${loc} ${i.message}`;
          })
          .join("\n")
      : "校验通过，无问题";
    b.title = detailText;
    b.style.cursor = "pointer";
  }

  private toggleValidatorDetails(): void {
    const existing = document.getElementById("validator-popup");
    if (existing) {
      existing.remove();
      return;
    }
    const { errors, warnings } = this.lastValidation;
    if (!errors.length && !warnings.length) return;
    const popup = document.createElement("div");
    popup.id = "validator-popup";
    popup.className = "validator-popup";
    const items = [
      ...errors.map(
        (i) =>
          `<div class="vp-item err"><span class="vp-rule">${i.rule}</span><span class="vp-loc">${[i.pageId, i.elementId]
            .filter(Boolean)
            .map((x) => `#${x}`)
            .join(" ")}</span><span class="vp-msg">${esc(i.message)}</span></div>`,
      ),
      ...warnings.map(
        (i) =>
          `<div class="vp-item warn"><span class="vp-rule">${i.rule}</span><span class="vp-loc">${[
            i.pageId,
            i.elementId,
          ]
            .filter(Boolean)
            .map((x) => `#${x}`)
            .join(" ")}</span><span class="vp-msg">${esc(i.message)}</span></div>`,
      ),
    ];
    popup.innerHTML = `<div class="vp-header">校验详情</div>${items.join("")}`;
    document.body.appendChild(popup);
    const rect = this.host.validator.getBoundingClientRect();
    const popupW = popup.offsetWidth;
    const popupH = popup.offsetHeight;
    let left = rect.left;
    if (left + popupW > window.innerWidth - 12) left = window.innerWidth - popupW - 12;
    if (left < 12) left = 12;
    popup.style.left = `${left}px`;
    popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    setTimeout(() => {
      const close = (e: MouseEvent) => {
        const t = e.target as Node;
        if (!popup.contains(t) && !this.host.validator.contains(t)) {
          popup.remove();
          document.removeEventListener("click", close);
        }
      };
      document.addEventListener("click", close);
    }, 0);
  }

  // ── 属性面板 ──
  private renderProps(): void {
    const el = this.currentElement();
    const p = this.host.props;
    if (!el) {
      p.innerHTML = `<div class="card"><div class="card-h"><span class="ic"></span>属性</div><div class="card-body"><div class="empty">点击画布上的元素<br>即可在此编辑</div></div></div>${aiCard(this.index + 1)}`;
      bindAiCard(p, this);
      return;
    }
    const [x, y, w, h] = el.rect;
    const props = el.props as unknown as Record<string, unknown>;
    const hasText = "text" in props;
    const hasItems = el.type === "bullet-list";
    const text = hasText ? (typeof props.text === "string" ? props.text : JSON.stringify(props.text)) : "";
    const items = hasItems
      ? (props.items as string[]).map((i) => (typeof i === "string" ? i : JSON.stringify(i))).join("\n")
      : "";
    const tone = (props.tone as string) ?? "";
    const animName = el.anim?.name ?? "";

    p.innerHTML = `
      <div class="card"><div class="who"><div class="who-ic"><div></div></div><div><div class="n">${typeName(el.type)}</div><div class="i">#${el.id}</div></div></div></div>
      <div class="card">
        <div class="card-h"><span class="ic"></span>位置 & 尺寸<span class="arrow"></span></div>
        <div class="card-body">
          <div class="grid4">
            ${numIn("X", x)}${numIn("Y", y)}${numIn("W", w)}${numIn("H", h)}
          </div>
        </div>
      </div>
      ${
        hasText
          ? `<div class="card"><div class="card-h"><span class="ic"></span>文本<span class="arrow"></span></div><div class="card-body">
        <textarea class="inp-ta" data-p="text">${esc(text)}</textarea>
        ${el.type === "paragraph" ? rangeRow("fontSize", (props.fontSize as number) ?? 18, 12, 40) : ""}
      </div></div>`
          : ""
      }
      ${
        hasItems
          ? `<div class="card"><div class="card-h"><span class="ic"></span>要点（每行一条）<span class="arrow"></span></div><div class="card-body">
        <textarea class="inp-ta" data-p="items">${esc(items)}</textarea>
        ${rangeRow("fontSize", (props.fontSize as number) ?? 18, 12, 40)}
      </div></div>`
          : ""
      }
      ${compositeTextCard(el)}
      ${
        el.type === "heading" || el.type === "paragraph"
          ? `<div class="card collapsed"><div class="card-h"><span class="ic"></span>颜色<span class="arrow"></span></div><div class="card-body">
        <div class="color-row">${TONES.map((t) => `<i data-tone="${t.k}" class="${tone === t.k ? "on" : ""}" style="background:${t.c}"></i>`).join("")}</div>
      </div></div>`
          : ""
      }
      <div class="card collapsed">
        <div class="card-h"><span class="ic"></span>图层排列<span class="arrow"></span></div>
        <div class="card-body">
          <div class="layer-grid">
            <button class="rbtn layer-btn" data-act="front">⬆ 置顶</button>
            <button class="rbtn layer-btn" data-act="forward">🔼 上移</button>
            <button class="rbtn layer-btn" data-act="backward">🔽 下移</button>
            <button class="rbtn layer-btn" data-act="back">⬇ 置底</button>
          </div>
        </div>
      </div>
      <button class="btn danger" data-act="del">删除该元素</button>
      ${aiCard(this.index + 1)}
    `;
    bindPropInputs(p, this);
    bindAiCard(p, this);
    // 卡片折叠/展开
    p.querySelectorAll<HTMLElement>(".card-h").forEach((h) => {
      h.addEventListener("click", () => {
        const card = h.parentElement;
        if (card) card.classList.toggle("collapsed");
      });
    });
    // 图层排序按钮
    p.querySelectorAll<HTMLElement>("[data-act]").forEach((b) => {
      b.addEventListener("click", () => {
        switch (b.dataset.act) {
          case "front":
            this.bringToFront();
            break;
          case "forward":
            this.moveForward();
            break;
          case "backward":
            this.moveBackward();
            break;
          case "back":
            this.sendToBack();
            break;
          case "del":
            this.deleteSelected();
            break;
        }
      });
    });
  }
}

// ── 属性面板辅助 ──
function numIn(label: string, val: number): string {
  return `<div class="inp"><label>${label}</label><input type="number" data-rect="${label}" value="${Math.round(val)}"></div>`;
}
function rangeRow(label: string, val: number, min: number, max: number): string {
  return `<div class="field"><label>${label}</label><div class="seg"><button data-num="${label}" data-d="-2">−</button><button style="flex:0;padding:4px 10px" class="on">${val}px</button><button data-num="${label}" data-d="2">＋</button></div></div>`;
}
function typeName(t: string): string {
  const m: Record<string, string> = {
    heading: "标题",
    paragraph: "段落",
    "bullet-list": "列表",
    image: "图片",
    chart: "图表",
    table: "表格",
    shape: "形状",
    icon: "图标",
    "custom-html": "HTML 逃逸块",
    "custom-svg": "SVG 逃逸块",
    formula: "公式",
    video: "视频",
    audio: "音频",
    // 复合语义组件（WS1）
    kpi: "指标卡",
    "stat-grid": "统计网格",
    "feature-card": "特性卡片",
    "feature-list": "特性列表",
    timeline: "时间线",
    process: "流程",
    comparison: "对比",
    "section-title": "章节标题",
    callout: "提示框",
    badge: "徽标",
    divider: "分隔线",
    avatar: "头像",
  };
  return m[t] ?? t;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** RichText → 可编辑纯字符串（runs 退化为其拼接文本）。 */
function rtToStr(t: unknown): string {
  if (typeof t === "string") return t;
  if (Array.isArray(t)) return t.map((r: { text?: string }) => r?.text ?? "").join("");
  return String(t ?? "");
}

/** 可双击内联编辑的文本字段（返回 null 表示该元素不可内联编辑）。 */
function editableText(el: AnyElement): { field: string; value: string } | null {
  const p = el.props as unknown as Record<string, unknown>;
  switch (el.type) {
    case "heading":
    case "paragraph":
      return { field: "text", value: rtToStr(p.text) };
    case "bullet-list":
      return { field: "items", value: ((p.items as unknown[]) ?? []).map((i) => rtToStr(i)).join("\n") };
    case "kpi":
      return { field: "value", value: rtToStr(p.value) };
    case "section-title":
      return { field: "title", value: rtToStr(p.title) };
    case "callout":
      return { field: "text", value: rtToStr(p.text) };
    case "badge":
      return { field: "text", value: rtToStr(p.text) };
    case "avatar":
      return { field: "name", value: rtToStr(p.name) };
    case "feature-card":
      return { field: "title", value: rtToStr(p.title) };
    default:
      return null;
  }
}

/** 复合组件的主文本编辑卡片（kpi.value / section-title.title / callout.text / avatar.name 等）。 */
function compositeTextCard(el: AnyElement): string {
  const et = editableText(el);
  if (!et || et.field === "text" || et.field === "items") return ""; // 已由 hasText/hasItems 覆盖
  const labelMap: Record<string, string> = { value: "数值", title: "标题", name: "姓名", text: "文本" };
  return `<div class="card"><div class="card-h"><span class="ic"></span>${labelMap[et.field] ?? "文本"}<span class="arrow"></span></div><div class="card-body">
    <textarea class="inp-ta" data-p="${et.field}">${esc(et.value)}</textarea>
  </div></div>`;
}

function aiCard(pageNo: number): string {
  return `<div class="ai-card"><div class="ai-inner">
    <h4><span class="sp"></span>让 AI 改这一页</h4>
    <textarea id="ai-input" placeholder="例：把右侧图表换成饼图 / 标题改得更短 / 增加一条要点"></textarea>
    <div class="chips"><span>换个版式</span><span>配色更醒目</span><span>精简文字</span><span>加个图表</span></div>
    <button class="ai-send" id="ai-send">✦ 重写第 ${pageNo} 页</button>
    <div class="ai-scope">仅重写当前页 · 自动校验自愈 · 生成整套请点顶部「✦ AI」</div>
    <div class="ai-status info" id="ai-status"></div>
  </div></div>`;
}

function bindPropInputs(root: HTMLElement, ed: Editor): void {
  root.querySelectorAll<HTMLInputElement>("input[data-rect]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const k = inp.dataset.rect as "X" | "Y" | "W" | "H";
      const v = Number(inp.value) || 0;
      ed.updateElement((el) => {
        const idx = ["X", "Y", "W", "H"].indexOf(k);
        el.rect[idx] = v;
      });
    });
  });
  root.querySelectorAll<HTMLTextAreaElement>("textarea[data-p]").forEach((ta) => {
    ta.addEventListener("change", () => {
      const field = ta.dataset.p!;
      ed.updateElement((el) => {
        const p = el.props as unknown as Record<string, unknown>;
        if (field === "items")
          p.items = ta.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        else p[field] = ta.value;
      });
    });
  });
  root.querySelectorAll<HTMLButtonElement>("button[data-num]").forEach((b) => {
    b.addEventListener("click", () => {
      const field = b.dataset.num!;
      const d = Number(b.dataset.d);
      ed.updateElement((el) => {
        const p = el.props as unknown as { fontSize?: number };
        p.fontSize = Math.max(12, Math.min(40, (p.fontSize ?? 18) + d));
      });
    });
  });
  root.querySelectorAll<HTMLElement>(".color-row i[data-tone]").forEach((i) => {
    i.addEventListener("click", () => {
      const tone = i.dataset.tone!;
      ed.updateElement((el) => {
        (el.props as { tone?: string }).tone = tone;
      });
    });
  });
  // 动画设置已移至顶部「动画」tab（见 main.ts RIBBON.anim + Editor.setElementAnim）
}

function bindAiCard(root: HTMLElement, ed: Editor): void {
  const input = root.querySelector<HTMLTextAreaElement>("#ai-input");
  const send = root.querySelector<HTMLButtonElement>("#ai-send");
  const status = root.querySelector<HTMLElement>("#ai-status");
  root.querySelectorAll<HTMLElement>(".chips span").forEach((c) =>
    c.addEventListener("click", () => {
      if (input) input.value = c.textContent!;
    }),
  );
  send?.addEventListener("click", async () => {
    const instruction = input?.value.trim();
    if (!instruction) {
      if (status) {
        status.className = "ai-status err";
        status.textContent = "请输入修改指令";
      }
      return;
    }
    const cfg = loadAiConfig();
    if (!cfg?.apiKey || !cfg.model) {
      if (status) {
        status.className = "ai-status err";
        status.textContent = "未配置模型，请先点「✦ 配置 AI」";
      }
      document.dispatchEvent(new CustomEvent("oneact:open-api"));
      return;
    }
    const sendText = send?.innerHTML ?? "";
    if (send) {
      send.disabled = true;
      send.innerHTML = '<span class="spin"></span> AI 重写中…';
    }
    if (status) {
      status.className = "ai-status info";
      status.textContent = "正在调用模型 · 整页重写 · 校验自愈…";
    }
    const provider = createRecordingProvider(
      { kind: cfg.kind, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl },
      { type: "rewrite", topic: instruction, label: getActiveProvider()?.label },
    );
    try {
      const { page, result, retries } = await rewritePage({
        provider,
        page: ed.currentPage,
        instruction,
        layouts: LAYOUTS,
        skills: ed.lastSkills,
      });
      if (page && result.ok) {
        ed.applyRewrittenPage(page);
        if (status) {
          status.className = "ai-status ok";
          status.textContent = `已重写（校验通过，重试 ${retries} 次）`;
        }
      } else {
        if (status) {
          status.className = "ai-status err";
          status.textContent = `校验未通过：${result.errors.length} 个错误，已保留原页`;
        }
      }
    } catch (e) {
      if (status) {
        status.className = "ai-status err";
        status.textContent = "调用失败：" + (e as Error).message;
      }
    } finally {
      if (send) {
        send.disabled = false;
        send.innerHTML = sendText;
      }
    }
  });
}

/**
 * 触发 AI 整套生成（供顶部 AI 栏调用）：config 检查 → 替换确认 → 光晕 → 流式生成。
 * 进度通过 `oneact:gen-state` 事件派发（main.ts 订阅以更新顶部灵动岛），同时同步右栏 #ai-status。
 */
export async function runGenerateDeck(ed: Editor, topic: string, brief?: Brief, skills?: ComposedSkill): Promise<boolean> {
  const status = document.getElementById("ai-status");
  const aiCardEl = document.querySelector<HTMLElement>(".ai-card");
  const cfg = loadAiConfig();
  if (!cfg?.apiKey || !cfg.model) {
    document.dispatchEvent(new CustomEvent("oneact:open-api"));
    document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "未配置模型，请先填写 API Key 与模型名" }));
    return false;
  }
  const cur = ed.deck;
  const hasContent = cur.pages.length > 1 || (cur.pages[0] && cur.pages[0].elements.length > 1);
  if (hasContent && !confirm("将用 AI 生成的整套替换当前 PPT 的全部页面，确定？")) return false;

  aiCardEl?.classList.add("generating");
  document.body.classList.add("oa-generating");
  document.dispatchEvent(new CustomEvent("oneact:gen-state", { detail: { phase: "outline" } }));
  if (status) {
    status.className = "ai-status info";
    status.textContent = "正在生成大纲…";
  }
  const provider = createRecordingProvider(
    { kind: cfg.kind, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl },
    { type: "generate", topic, label: getActiveProvider()?.label },
  );
  logInfo("gen", "开始生成整套", {
    topic,
    config: maskConfig(cfg),
    brief: brief
      ? {
          theme: brief.theme,
          mood: brief.mood,
          pageCount: brief.pageCount,
          audience: brief.audience,
          purpose: brief.purpose,
        }
      : "(无 brief，老路径)",
  });
  try {
    const t0g = performance.now();
    const res = await ed.generateDeckWithAi(
      provider,
      topic,
      (total) => {
        logInfo("gen", `大纲就绪：共 ${total} 页`);
        document.dispatchEvent(new CustomEvent("oneact:gen-state", { detail: { phase: "outline", total } }));
      },
      (i, total) => {
        document.dispatchEvent(new CustomEvent("oneact:gen-state", { detail: { phase: "pages", index: i, total } }));
        if (status) {
          status.className = "ai-status info";
          status.textContent = `正在生成第 ${i + 1}/${total} 页…`;
        }
      },
      brief,
      skills,
    );
    // 用量已由 createRecordingProvider 按每次请求即时记录（含真实 token），此处不再聚合记录。
    if (res.ok) {
      logInfo("gen", `生成成功：${res.pages} 页，自愈重试 ${res.retries} 次`);
      if (status) {
        status.className = "ai-status ok";
        status.textContent = `已生成 ${res.pages} 页（校验通过，重试 ${res.retries} 次）`;
      }
    } else {
      logWarn("gen", `生成完成但有 ${res.errorCount} 个校验问题`, { pages: res.pages, retries: res.retries });
      if (status) {
        status.className = "ai-status err";
        status.textContent = `已生成 ${res.pages} 页，但有 ${res.errorCount} 个校验问题（可手动修正）`;
      }
    }
    document.dispatchEvent(
      new CustomEvent("oneact:gen-state", { detail: { phase: "done", pages: res.pages, ok: res.ok } }),
    );
    return res.ok;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    logError("gen", "生成失败（已还原）", { topic, config: maskConfig(cfg), statusText: msg }, e);
    if (status) {
      status.className = "ai-status err";
      status.textContent = "生成失败（已还原）：" + msg;
    }
    document.dispatchEvent(new CustomEvent("oneact:notify", { detail: `生成失败：${msg}（详见日志页）` }));
    document.dispatchEvent(new CustomEvent("oneact:gen-state", { detail: { phase: "error", message: msg } }));
    return false;
  } finally {
    aiCardEl?.classList.remove("generating");
    document.body.classList.remove("oa-generating");
  }
}

export interface AiConfig {
  kind: "openai" | "openai-compatible" | "anthropic" | "gemini";
  apiKey: string;
  model: string;
  baseUrl?: string;
}
export function loadAiConfig(): AiConfig | null {
  // 多供应商：返回当前「默认且启用」的供应商配置（见 providers.ts）
  return activeConfig();
}
export function saveAiConfig(cfg: AiConfig): void {
  // 安全审计修复（2026-08-02）：API Key 存储加固
  // 注意：localStorage 无法做到完全安全（任何同源 JS 可读），核心防线是防止 XSS
  // 此处增加 Key 格式校验，拒绝存储明显无效的值，减少误泄露风险
  const sanitized: AiConfig = {
    kind: cfg.kind,
    // 去除首尾空白，拒绝空值
    apiKey: cfg.apiKey.trim(),
    model: cfg.model.trim(),
    baseUrl: cfg.baseUrl?.trim() || undefined,
  };
  if (!sanitized.apiKey || !sanitized.model) {
    throw new Error("API Key 和模型名不能为空");
  }
  localStorage.setItem("oneact-ai-config", JSON.stringify(sanitized));
}

/** 可插入的组件清单（策划书 6.1 插入）。 */
export const INSERTABLE: { type: ElementType; label: string }[] = [
  { type: "heading", label: "标题" },
  { type: "paragraph", label: "段落" },
  { type: "bullet-list", label: "列表" },
  { type: "image", label: "图片" },
  { type: "chart", label: "图表" },
  { type: "table", label: "表格" },
  { type: "shape", label: "形状" },
  { type: "icon", label: "图标" },
  { type: "formula", label: "公式" },
  { type: "video", label: "视频" },
  { type: "audio", label: "音频" },
  { type: "custom-html", label: "HTML" },
  { type: "custom-svg", label: "SVG" },
  // 复合语义组件（WS1）：一键插入高级排版，AI 也会优先使用
  { type: "kpi", label: "指标卡" },
  { type: "stat-grid", label: "统计网格" },
  { type: "feature-card", label: "特性卡片" },
  { type: "feature-list", label: "特性列表" },
  { type: "timeline", label: "时间线" },
  { type: "process", label: "流程" },
  { type: "comparison", label: "对比" },
  { type: "section-title", label: "章节标题" },
  { type: "callout", label: "提示框" },
  { type: "badge", label: "徽标" },
  { type: "divider", label: "分隔线" },
  { type: "avatar", label: "头像" },
  { type: "pyramid", label: "金字塔" },
  { type: "funnel", label: "漏斗" },
  { type: "stat-highlight", label: "数据高亮" },
  { type: "org-chart", label: "组织架构" },
  { type: "gantt", label: "甘特图" },
  { type: "mindmap", label: "思维导图" },
  { type: "ai-card", label: "AI 动效卡" },
];

/** 智能组合块（多元素预设，一键插入高级排版）。 */
export const SMART_BLOCKS: { key: string; label: string; icon: string }[] = [
  { key: "kpi-card", label: "KPI 指标卡", icon: "📊" },
  { key: "stat-row", label: "数据统计行", icon: "📈" },
  { key: "feature-card", label: "特性卡片", icon: "✨" },
  { key: "timeline-item", label: "时间线节点", icon: "🕐" },
  { key: "process-step", label: "流程步骤", icon: "→" },
  { key: "quote-card", label: "引用卡片", icon: "❝" },
  { key: "comparison", label: "对比框", icon: "⇄" },
  { key: "section-title", label: "章节标题", icon: "§" },
];

/** 组件模板（插入时默认内容 + 安全坐标）。 */
function createTemplate(type: ElementType, id: string): AnyElement {
  const mk = (rect: Rect, props: Record<string, unknown>): AnyElement =>
    ({ id, type, rect, props }) as unknown as AnyElement;
  switch (type) {
    case "heading":
      return mk([200, 270, 600, 70], { text: "新标题", tone: "primary" });
    case "paragraph":
      return mk([200, 270, 600, 140], { text: "新建段落" });
    case "bullet-list":
      return mk([200, 260, 600, 200], { items: ["要点一", "要点二"] });
    case "image":
      return mk([300, 230, 480, 300], { src: "placeholder:新图片", alt: "" });
    case "chart":
      return mk([180, 200, 680, 360], {
        chartType: "bar",
        title: "新图表",
        summary: "图表摘要",
        data: { categories: ["A", "B", "C"], series: [{ name: "系列", values: [3, 5, 2] }] },
      });
    case "table":
      return mk([200, 270, 720, 180], { columns: [2, 1], head: ["列 A", "列 B"], rows: [["", ""]] });
    case "shape":
      return mk([420, 290, 220, 140], {
        shape: "rect",
        fill: "var(--oa-color-primary-soft)",
        stroke: "var(--oa-color-primary)",
        strokeWidth: 2,
      });
    case "icon":
      return mk([460, 290, 100, 100], { name: "star", size: 64 });
    case "formula":
      return mk([240, 290, 560, 100], { latex: "E = mc^2" });
    case "video":
      return mk([300, 220, 560, 300], { src: "placeholder:视频" });
    case "audio":
      return mk([300, 300, 560, 90], { src: "placeholder:音频" });
    case "custom-html":
      return mk([300, 250, 480, 200], {
        html: '<div style="padding:14px;background:#eef0fe;border-radius:8px;font-size:14px">自定义 HTML</div>',
      });
    case "custom-svg":
      return mk([380, 270, 300, 180], {
        svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#7c3aed"/></svg>',
      });
    // 复合语义组件（WS1）默认模板
    case "kpi":
      return mk([200, 220, 320, 200], { value: "98.5%", label: "满意度", trend: { text: "↑ 3.2%", dir: "up" } });
    case "stat-grid":
      return mk([64, 220, 1152, 200], {
        cells: [
          { value: "1,234", label: "活跃用户" },
          { value: "56%", label: "转化率" },
          { value: "¥89万", label: "月营收" },
        ],
      });
    case "feature-card":
      return mk([64, 180, 360, 420], { icon: "rocket", title: "极速渲染", desc: "毫秒级响应编辑操作，流畅自如。" });
    case "feature-list":
      return mk([64, 160, 1152, 420], {
        items: [
          { icon: "zap", title: "极速", desc: "增量渲染引擎" },
          { icon: "code", title: "开放", desc: "JSON 原生格式" },
          { icon: "sparkles", title: "AI 驱动", desc: "一键生成" },
        ],
      });
    case "timeline":
      return mk([64, 220, 1152, 280], {
        items: [
          { time: "Q1", title: "启动" },
          { time: "Q2", title: "增长" },
          { time: "Q3", title: "规模" },
        ],
      });
    case "process":
      return mk([64, 220, 1152, 320], {
        steps: [
          { title: "需求分析", desc: "明确目标" },
          { title: "方案设计", desc: "技术选型" },
          { title: "开发上线", desc: "迭代交付" },
        ],
      });
    case "comparison":
      return mk([64, 160, 1152, 420], {
        left: { title: "传统方案", items: ["封闭格式", "AI 难接入"], tone: "negative" },
        right: { title: "OneAct", items: ["开放 JSON", "AI 原生"], tone: "positive" },
      });
    case "section-title":
      return mk([64, 280, 900, 160], { kicker: "CHAPTER 01", title: "核心优势", subtitle: "Three key advantages" });
    case "callout":
      return mk([64, 300, 900, 120], { variant: "info", title: "提示", text: "这是一条重要的说明信息。" });
    case "badge":
      return mk([64, 300, 160, 40], { text: "NEW", tone: "primary" });
    case "divider":
      return mk([64, 360, 1152, 20], { variant: "solid" });
    case "avatar":
      return mk([200, 180, 360, 420], { name: "张三", role: "首席工程师" });
    case "pyramid":
      return mk([300, 160, 680, 420], {
        layers: [
          { label: "战略愿景", desc: "使命与方向" },
          { label: "核心目标", desc: "年度关键结果" },
          { label: "执行动作", desc: "季度举措落地" },
        ],
      });
    case "funnel":
      return mk([300, 160, 680, 420], {
        stages: [
          { label: "曝光", value: 100000 },
          { label: "点击", value: 25000 },
          { label: "购买", value: 6000 },
        ],
      });
    case "stat-highlight":
      return mk([64, 220, 600, 320], {
        value: "¥1.28亿",
        label: "季度营收",
        delta: { text: "18.2%", dir: "up", period: "同比" },
        caption: "创历史新高，连续 4 个季度增长",
        icon: "trending-up",
      });
    case "org-chart":
      return mk([160, 130, 960, 440], {
        root: { name: "CEO", role: "首席执行官" },
        branches: [
          { node: { name: "技术部", role: "CTO" }, children: [{ name: "前端", role: "工程" }, { name: "后端", role: "工程" }] },
          { node: { name: "产品部", role: "CPO" }, children: [{ name: "设计", role: "设计" }] },
          { node: { name: "运营部", role: "COO" } },
        ],
      });
    case "gantt":
      return mk([100, 150, 1080, 400], {
        timeline: ["Q1", "Q2", "Q3", "Q4"],
        tasks: [
          { name: "需求调研", start: 0, end: 1, progress: 100 },
          { name: "方案设计", start: 0.5, end: 2, progress: 60 },
          { name: "开发实现", start: 1.5, end: 3, progress: 30 },
          { name: "测试上线", start: 2.5, end: 4, progress: 0 },
        ],
      });
    case "mindmap":
      return mk([100, 150, 1080, 420], {
        center: "产品增长",
        branches: [
          { label: "获客", items: ["内容营销", "渠道合作"] },
          { label: "激活", items: ["新手引导", "首单补贴"] },
          { label: "留存", items: ["推送", "会员体系"] },
          { label: "变现", items: ["增值服务", "广告"] },
        ],
      });
    case "ai-card":
      return mk([100, 180, 520, 360], {
        title: "智能生成",
        desc: "自然语言一键产出专业演示，AI 原生 JSON 格式可读可改。",
        icon: "sparkles",
        effect: "glow-pulse",
        badge: "AI",
      });
    default:
      return mk([300, 300, 300, 150], {});
  }
}

/** 智能组合块模板（返回多个元素，一键插入高级排版）。 */
function createSmartBlock(key: string, baseId: string): AnyElement[] {
  const mk = (id: string, type: string, rect: Rect, props: Record<string, unknown>, anim?: unknown): AnyElement =>
    ({ id: `${baseId}-${id}`, type, rect, props, anim }) as unknown as AnyElement;
  switch (key) {
    // KPI 指标卡：大数字 + 标签 + 趋势
    case "kpi-card":
      return [
        mk("bg", "shape", [100, 200, 280, 180], {
          shape: "rect",
          fill: "var(--oa-color-primary-soft)",
          stroke: "var(--oa-color-primary)",
          strokeWidth: 0,
        }),
        mk("num", "heading", [120, 220, 240, 70], { text: "98.5%", level: 1, align: "center", tone: "primary" }),
        mk("label", "paragraph", [120, 300, 240, 28], {
          text: "客户满意度",
          align: "center",
          tone: "text-secondary",
          fontSize: 16,
        }),
        mk("trend", "paragraph", [120, 335, 240, 28], { text: "↑ 较上月 +3.2%", align: "center", fontSize: 14 }),
      ];
    // 数据统计行：三个并排指标
    case "stat-row":
      return [
        mk("s1n", "heading", [100, 220, 340, 56], { text: "1,234", level: 2, align: "center", tone: "primary" }),
        mk("s1l", "paragraph", [100, 280, 340, 24], {
          text: "活跃用户",
          align: "center",
          tone: "text-secondary",
          fontSize: 14,
        }),
        mk("s2n", "heading", [470, 220, 340, 56], { text: "56.7%", level: 2, align: "center", tone: "primary" }),
        mk("s2l", "paragraph", [470, 280, 340, 24], {
          text: "转化率",
          align: "center",
          tone: "text-secondary",
          fontSize: 14,
        }),
        mk("s3n", "heading", [840, 220, 340, 56], { text: "¥89万", level: 2, align: "center", tone: "primary" }),
        mk("s3l", "paragraph", [840, 280, 340, 24], {
          text: "月收入",
          align: "center",
          tone: "text-secondary",
          fontSize: 14,
        }),
        mk("sep1", "shape", [440, 215, 1, 80], { shape: "line", fill: "var(--oa-color-border)" }),
        mk("sep2", "shape", [810, 215, 1, 80], { shape: "line", fill: "var(--oa-color-border)" }),
      ];
    // 特性卡片：图标 + 标题 + 描述
    case "feature-card":
      return [
        mk("bg", "shape", [100, 180, 360, 400], {
          shape: "rect",
          fill: "var(--oa-color-surface)",
          stroke: "var(--oa-color-border)",
          strokeWidth: 1,
        }),
        mk("ic", "icon", [130, 210, 60, 60], { name: "rocket", size: 48 }),
        mk("title", "heading", [130, 285, 300, 40], { text: "极速渲染", level: 3, tone: "primary" }),
        mk("desc", "paragraph", [130, 335, 300, 120], {
          text: "基于虚拟 DOM 的增量渲染引擎，毫秒级响应所有编辑操作，流畅自如。",
          fontSize: 15,
          lineHeight: 1.7,
        }),
      ];
    // 时间线节点：圆点 + 连线 + 内容
    case "timeline-item":
      return [
        mk("dot", "shape", [180, 220, 24, 24], { shape: "ellipse", fill: "var(--oa-color-primary)" }),
        mk("line", "shape", [190, 248, 4, 120], { shape: "rect", fill: "var(--oa-color-border)" }),
        mk("time", "paragraph", [230, 215, 300, 24], { text: "2026 Q1", fontSize: 14, tone: "text-secondary" }),
        mk("title", "heading", [230, 245, 600, 36], { text: "项目启动", level: 3, tone: "primary" }),
        mk("desc", "paragraph", [230, 285, 600, 60], {
          text: "完成需求调研与技术选型，组建核心团队。",
          fontSize: 15,
          lineHeight: 1.6,
        }),
      ];
    // 流程步骤：编号圆 + 标题 + 箭头
    case "process-step":
      return [
        mk("circle", "shape", [150, 260, 80, 80], { shape: "ellipse", fill: "var(--oa-color-primary)" }),
        mk("num", "heading", [165, 272, 50, 56], { text: "1", level: 2, align: "center", tone: "text" }),
        mk("title", "heading", [260, 270, 400, 36], { text: "分析需求", level: 3, tone: "primary" }),
        mk("desc", "paragraph", [260, 310, 400, 56], {
          text: "收集用户需求，明确目标与约束。",
          fontSize: 15,
          lineHeight: 1.6,
        }),
        mk("arrow", "shape", [700, 285, 80, 30], { shape: "chevron", fill: "var(--oa-color-primary-soft)" }),
      ];
    // 引用卡片：引号 + 文本 + 作者
    case "quote-card":
      return [
        mk("bg", "shape", [100, 200, 1080, 260], {
          shape: "rect",
          fill: "var(--oa-color-primary-soft)",
          stroke: "transparent",
          strokeWidth: 0,
        }),
        mk("quote", "heading", [140, 220, 1000, 120], {
          text: "设计不是产品看起来怎样，而是它如何运作。",
          level: 2,
          align: "center",
          tone: "primary",
        }),
        mk("author", "paragraph", [140, 370, 1000, 30], {
          text: "— Steve Jobs",
          align: "center",
          tone: "text-secondary",
          fontSize: 16,
        }),
      ];
    // 对比框：左右两栏对比
    case "comparison":
      return [
        mk("lbg", "shape", [100, 180, 530, 360], { shape: "rect", fill: "#fef2f2", stroke: "#fecaca", strokeWidth: 1 }),
        mk("ltitle", "heading", [130, 200, 470, 40], { text: "传统方案", level: 3, tone: "text" }),
        mk("litems", "bullet-list", [130, 250, 470, 260], {
          items: ["封闭格式，不可编程", "AI 接入困难", "无法本地嵌入", "协作受限"],
          fontSize: 15,
        }),
        mk("rbg", "shape", [650, 180, 530, 360], { shape: "rect", fill: "#f0fdf4", stroke: "#bbf7d0", strokeWidth: 1 }),
        mk("rtitle", "heading", [680, 200, 470, 40], { text: "OneAct", level: 3, tone: "primary" }),
        mk("ritems", "bullet-list", [680, 250, 470, 260], {
          items: ["开放 JSON 格式", "AI 原生设计", "本地嵌入零依赖", "实时协作就绪"],
          fontSize: 15,
        }),
      ];
    // 章节标题：装饰线 + 标题 + 副标题
    case "section-title":
      return [
        mk("bar", "shape", [100, 240, 6, 56], { shape: "rect", fill: "var(--oa-color-primary)" }),
        mk("title", "heading", [124, 240, 800, 48], { text: "核心优势", level: 2, tone: "primary" }),
        mk("subtitle", "paragraph", [124, 295, 800, 28], {
          text: "Three key advantages of OneAct",
          fontSize: 15,
          tone: "text-secondary",
        }),
      ];
    default:
      return [];
  }
}
