/**
 * @oneact/player — 播放器（舞台）
 *
 * 固定画布等比缩放（投影仪模型）· 键盘翻页 · 声明式切换 · 缩略图栏。
 * Player 操作 DOM，运行于浏览器；纯工具函数（clamp）可在 node 测试。
 */
import { canvasSize, computeScale, getTheme, migrate, renderPage, runtimeCss, transitionStyle } from "@oneact/core";
import type { CanvasSize, Deck, Page, Theme } from "@oneact/schema";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export interface PlayerHost {
  /** 画布舞台容器（应用 scale，画布在其中居中）。 */
  stage: HTMLElement;
  thumbs?: HTMLElement | null;
  counter?: HTMLElement | null;
  notes?: HTMLElement | null;
  title?: HTMLElement | null;
}

export interface PlayerOptions {
  start?: number;
  onChange?: (index: number, total: number) => void;
}

export class Player {
  readonly deck: Deck;
  readonly theme: Theme;
  readonly canvas: CanvasSize;
  private host: PlayerHost;
  private index = 0;
  private opts: PlayerOptions;
  private scale = 1;

  constructor(deck: Deck, host: PlayerHost, opts: PlayerOptions = {}) {
    this.deck = migrate(deck).deck;
    this.theme = getTheme(this.deck.meta.theme);
    this.canvas = canvasSize(this.deck.meta.size);
    this.host = host;
    this.opts = opts;
    this.injectCss();
    this.renderThumbs();
    this.goTo(opts.start ?? 0);
  }

  get current(): number {
    return this.index;
  }
  get total(): number {
    return this.deck.pages.length;
  }
  get scaleFactor(): number {
    return this.scale;
  }

  private injectCss(): void {
    const id = "oneact-runtime-css";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = runtimeCss();
    document.head.appendChild(style);
  }

  goTo(i: number): void {
    this.index = clamp(i, 0, this.total - 1);
    this.renderCurrent();
    this.highlightThumb();
    this.updateMeta();
    this.opts.onChange?.(this.index, this.total);
  }

  next(): void {
    this.goTo(this.index + 1);
  }
  prev(): void {
    this.goTo(this.index - 1);
  }
  first(): void {
    this.goTo(0);
  }
  last(): void {
    this.goTo(this.total - 1);
  }

  private renderCurrent(): void {
    const page: Page = this.deck.pages[this.index];
    const trans = page.transition;
    const isMorph = trans?.name === "morph";

    // FLIP·First：morph 时先记录旧页元素视觉位置
    let firstRects: Map<string, DOMRect> | null = null;
    if (isMorph) {
      firstRects = new Map();
      this.host.stage.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
        if (el.dataset.id) firstRects!.set(el.dataset.id, el.getBoundingClientRect());
      });
    }

    const html = renderPage(page, this.theme, {
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
      interactive: false,
    });
    this.host.stage.innerHTML = html;
    const canvasEl = this.host.stage.firstElementChild as HTMLElement | null;

    if (canvasEl && trans && !isMorph) {
      // 非 morph：canvas 进入动画
      const cur = canvasEl.getAttribute("style") || "";
      canvasEl.setAttribute("style", cur + ";" + transitionStyle(trans.name, "enter", trans.duration, trans.easing));
    }

    // FLIP·Invert+Play：同名 id 元素从旧位置平滑过渡到新位置（对标 PPT 平滑切换）
    if (isMorph && firstRects && canvasEl) {
      const scale = this.scale || 1;
      canvasEl.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => {
        const id = el.dataset.id || "";
        const first = firstRects.get(id);
        if (!first) return;
        const last = el.getBoundingClientRect();
        const dx = (first.left - last.left) / scale;
        const dy = (first.top - last.top) / scale;
        const sw = last.width ? first.width / last.width : 1;
        const sh = last.height ? first.height / last.height : 1;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sw - 1) < 0.02 && Math.abs(sh - 1) < 0.02) return;
        el.style.transformOrigin = "top left";
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px,${dy}px) scale(${sw},${sh})`;
        requestAnimationFrame(() => {
          el.style.transition = `transform ${trans?.duration ?? 600}ms ${trans?.easing ?? "cubic-bezier(.22,1,.36,1)"}`;
          el.style.transform = "";
        });
      });
    }
    this.fit();
  }

  /** 按舞台可用尺寸等比缩放画布并居中。 */
  fit(): void {
    const availW = this.host.stage.clientWidth;
    const availH = this.host.stage.clientHeight;
    if (availW === 0 || availH === 0) return;
    this.scale = computeScale(availW, availH, this.canvas.width, this.canvas.height);
    const canvasEl = this.host.stage.firstElementChild as HTMLElement | null;
    if (canvasEl) {
      canvasEl.style.position = "absolute";
      canvasEl.style.transformOrigin = "top left";
      canvasEl.style.left = (availW - this.canvas.width * this.scale) / 2 + "px";
      canvasEl.style.top = (availH - this.canvas.height * this.scale) / 2 + "px";
      canvasEl.style.transform = `scale(${this.scale})`;
    }
  }

  private renderThumbs(): void {
    if (!this.host.thumbs) return;
    this.host.thumbs.innerHTML = "";
    this.deck.pages.forEach((page, i) => {
      const wrap = document.createElement("button");
      wrap.className = "oa-thumb";
      wrap.type = "button";
      wrap.dataset.index = String(i);
      wrap.title = page.title ?? `第 ${i + 1} 页`;
      const scaler = document.createElement("div");
      scaler.className = "oa-thumb-scaler";
      scaler.innerHTML = renderPage(page, this.theme, {
        canvasW: this.canvas.width,
        canvasH: this.canvas.height,
        interactive: false,
      });
      const label = document.createElement("span");
      label.className = "oa-thumb-label";
      label.textContent = String(i + 1);
      wrap.appendChild(scaler);
      wrap.appendChild(label);
      wrap.addEventListener("click", () => this.goTo(i));
      this.host.thumbs!.appendChild(wrap);
    });
  }

  private highlightThumb(): void {
    if (!this.host.thumbs) return;
    this.host.thumbs.querySelectorAll<HTMLElement>(".oa-thumb").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.index) === this.index);
    });
    const active = this.host.thumbs.querySelector<HTMLElement>(".oa-thumb.active");
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  private updateMeta(): void {
    if (this.host.counter) this.host.counter.textContent = `${this.index + 1} / ${this.total}`;
    if (this.host.notes) this.host.notes.textContent = this.deck.pages[this.index]?.notes ?? "";
    if (this.host.title) this.host.title.textContent = this.deck.meta.title ?? "";
  }
}
