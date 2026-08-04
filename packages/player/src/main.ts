/**
 * @oneact/player — runtime.html 入口脚本（舞台）
 *
 * 加载 deck（URL ?deck= / hash / 内置示例）→ 构建 UI → 启动 Player。
 * 双击 dist/runtime.html 即播内置「一幕自荐」示例（30 秒可体验）。
 */
import "@oneact/components"; // 导入即注册全部内置组件
import type { Deck } from "@oneact/schema";
import { Player } from "./player.js";

// 构建时由 build.mjs 经 esbuild define 注入完整示例 deck 字符串
// （避免 JSON import 被按属性 tree-shake，导致示例内容丢失）
declare const __SAMPLE_DECK__: string;

interface UI {
  stage: HTMLElement;
  thumbs: HTMLElement;
  counter: HTMLElement;
  notes: HTMLElement;
  title: HTMLElement;
  pageTitle: HTMLElement;
  progressFill: HTMLElement;
  prev: HTMLElement;
  next: HTMLElement;
  first: HTMLElement;
  last: HTMLElement;
  theme: HTMLSelectElement;
  present: HTMLElement;
}

async function loadDeck(): Promise<Deck> {
  // 优先级：自包含 HTML 注入（window.__ONEACT_DECK__）> ?deck=URL / hash > 内置示例
  const injected = (window as unknown as { __ONEACT_DECK__?: Deck }).__ONEACT_DECK__;
  let deck: Deck | undefined = injected;
  if (!deck) {
    const params = new URLSearchParams(location.search);
    let url = params.get("deck");
    if (!url && location.hash.length > 1) url = location.hash.slice(1);
    if (url) {
      try {
        const res = await fetch(url);
        if (res.ok) deck = (await res.json()) as Deck;
        else console.warn("[OneAct] deck 请求未成功，回退内置示例");
      } catch (e) {
        console.warn("[OneAct] 加载 deck 失败，回退内置示例：", e);
      }
    }
  }
  const final: Deck = deck ?? JSON.parse(__SAMPLE_DECK__);
  // 应用用户上次选中的主题（运行时换肤，不动内容）
  try {
    const t = localStorage.getItem("oneact-theme");
    if (t) final.meta.theme = t;
  } catch {
    /* 无痕模式忽略 */
  }
  return final;
}

function buildUI(root: HTMLElement): UI {
  root.innerHTML = `
    <header class="oa-topbar">
      <div class="oa-brand"><span class="oa-mark">幕</span><div><div class="oa-brand-name">一幕 OneAct</div><div class="oa-brand-sub" data-role="title">舞台</div></div></div>
      <div class="oa-counter" data-role="counter">1 / 1</div>
      <select class="oa-theme" data-role="theme" title="切换主题">
        <option value="yuanshan-blue">远山蓝</option>
        <option value="ink-green">墨绿</option>
        <option value="warm-orange">暖橙</option>
      </select>
      <button class="oa-btn" data-role="present" title="放映模式 (P)">▶ 放映</button>
      <button class="oa-btn" data-role="fullscreen" title="全屏 (F)">⛶ 全屏</button>
    </header>
    <div class="oa-progress"><i data-role="progress-fill"></i></div>
    <main class="oa-main">
      <aside class="oa-thumbs" data-role="thumbs"></aside>
      <section class="oa-stage-wrap">
        <div class="oa-stage" data-role="stage"></div>
        <button class="oa-nav oa-nav-prev" data-role="prev" title="上一页 (←)">‹</button>
        <button class="oa-nav oa-nav-next" data-role="next" title="下一页 (→)">›</button>
      </section>
    </main>
    <footer class="oa-statusbar">
      <span class="oa-page-title" data-role="page-title"></span>
      <span data-role="notes"></span>
      <span class="oa-tips">← → / 点击翻页 · F 全屏 · Home/End 首末页 · P 放映</span>
      <span class="oa-pageops">
        <button class="oa-mini" data-role="first" title="首页">⏮</button>
        <button class="oa-mini" data-role="last" title="末页">⏭</button>
      </span>
    </footer>`;
  const $ = <T extends HTMLElement>(role: string) => root.querySelector<T>(`[data-role="${role}"]`)!;
  return {
    stage: $("stage"),
    thumbs: $("thumbs"),
    counter: $("counter"),
    notes: $("notes"),
    title: $("title"),
    pageTitle: $("page-title"),
    progressFill: $("progress-fill"),
    prev: $("prev"),
    next: $("next"),
    first: $("first"),
    last: $("last"),
    theme: root.querySelector<HTMLSelectElement>('[data-role="theme"]')!,
    present: $("present"),
  };
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app 容器缺失");
  const ui = buildUI(root);
  const deck = await loadDeck();

  // ⚠ bc / fromRemote 必须在 new Player 之前声明：Player 构造函数会同步触发 onChange，
  // 若在此处之后声明，onChange 访问 bc 会命中 TDZ → main() 中断 → 键盘/按钮/点击都无法绑定，
  // 表现为「导出的 HTML 只显示第一页、翻页等基本功能失效」。
  const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("oneact-stage") : null;
  let fromRemote = false;

  // 更新播放器外壳：进度条 + 当前页标题。初始化与每次翻页都会调用。
  const updateChrome = (i: number, total: number): void => {
    ui.progressFill.style.width = `${total ? ((i + 1) / total) * 100 : 0}%`;
    ui.pageTitle.textContent = deck.pages[i]?.title ?? "";
  };

  const player = new Player(
    deck,
    { stage: ui.stage, thumbs: ui.thumbs, counter: ui.counter, notes: ui.notes, title: ui.title },
    {
      // 演讲者视图 / 多窗口同步（策划书 v3 BroadcastChannel）：翻页广播给同源其它窗口
      onChange: (i, total) => {
        updateChrome(i, total);
        if (bc && !fromRemote) bc.postMessage({ type: "page", index: i });
      },
    },
  );
  if (bc) {
    bc.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "page" && typeof e.data.index === "number") {
        fromRemote = true;
        player.goTo(e.data.index);
        queueMicrotask(() => {
          fromRemote = false;
        });
      }
    };
  }

  // 翻页按钮
  ui.prev.addEventListener("click", () => player.prev());
  ui.next.addEventListener("click", () => player.next());
  ui.first.addEventListener("click", () => player.first());
  ui.last.addEventListener("click", () => player.last());
  // 点击画布翻页（左 40% 上一页，右 60% 下一页）—— 演示常见交互
  ui.stage.addEventListener("click", (e) => {
    const rect = ui.stage.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.4) player.prev();
    else player.next();
  });
  root.querySelector<HTMLElement>('[data-role="fullscreen"]')!.addEventListener("click", toggleFullscreen);

  // 放映模式：隐藏顶栏/缩略图栏/底栏/翻页键，只留纯净画布
  const togglePresent = (): void => {
    document.body.classList.toggle("oa-present");
    requestAnimationFrame(() => player.fit());
  };
  ui.present.addEventListener("click", togglePresent);

  // 主题切换：存 localStorage 后重载，渲染层用新主题变量（内容不动）
  ui.theme.value = deck.meta.theme ?? "yuanshan-blue";
  ui.theme.addEventListener("change", () => {
    try {
      localStorage.setItem("oneact-theme", ui.theme.value);
    } catch {
      /* 无痕模式忽略 */
    }
    location.reload();
  });

  // 键盘
  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        e.preventDefault();
        player.next();
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        player.prev();
        break;
      case "Home":
        player.first();
        break;
      case "End":
        player.last();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "p":
      case "P":
        togglePresent();
        break;
      case "Escape":
        if (document.body.classList.contains("oa-present")) {
          document.body.classList.remove("oa-present");
          requestAnimationFrame(() => player.fit());
        }
        break;
    }
  });

  // 缩放：窗口/全屏变化时重拟合
  window.addEventListener("resize", () => player.fit());
  document.addEventListener("fullscreenchange", () => player.fit());
}

void main();
