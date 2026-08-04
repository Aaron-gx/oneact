/**
 * @oneact/web — 编辑器入口
 *
 * 加载 deck（URL ?deck= / 内置示例）→ 启动 Editor → 绑定顶栏/键盘/AI 配置/导出。
 * 双击 dist/editor.html 即用（内置「一幕自荐」示例）。
 */
import { createProvider } from "@oneact/ai";
import { renderPage, getTheme, canvasSize } from "@oneact/core";
import { toStandaloneHtml } from "@oneact/exporter-deck";
import { exportPptx } from "@oneact/exporter-pptx";
import type { Deck, ElementType } from "@oneact/schema";
import { THEME_SWATCHES } from "@oneact/schema";
import { openBriefing } from "./briefing.js";
import { getDoc, saveDoc, updateThumb } from "./doc-store.js";
import {
  Editor,
  INSERTABLE,
  SMART_BLOCKS,
  ANIM_CHOICES,
  ANIM_LABELS,
  loadAiConfig,
  saveAiConfig,
  runGenerateDeck,
  type AiConfig,
} from "./editor.js";
import { logInfo, logError, maskConfig, getLogs } from "./logger.js";
import { openProvidersModal } from "./providers.js";

/** 打开专用日志页，并把最近日志通过 URL hash 传入（绕过 file:// 下 localStorage 跨文件隔离）。 */
function openLogPage(): void {
  const recent = getLogs().slice(-150);
  let hash = "";
  try {
    const json = JSON.stringify(recent);
    // UTF-8 安全的 base64
    hash = btoa(unescape(encodeURIComponent(json)));
  } catch {
    hash = "";
  }
  window.open("log.html" + (hash ? "#" + hash : ""), "_blank");
}

declare const __SAMPLE_DECK__: string;
declare const __GOLDEN_DECK__: string;
declare const __PLAYER_RUNTIME__: string;

/** 当前文档 id（localStorage 文档模式） */
let currentDocId: string | null = null;

/**
 * 安全审计修复（2026-08-02）：检测内网 IP / 云元数据端点（SSRF 防护）
 * 拦截 127.0.0.0/8、10.0.0.0/8、172.16.0.0/12、192.168.0.0/16、169.254.169.254 等
 */
function isPrivateOrMetadataIp(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // localhost 变体
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  // IPv4 检查
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // 云元数据端点
    if (a === 0) return true;
  }
  // IPv6 私有 / 链路本地
  if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // .local / .internal
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

async function loadDeck(): Promise<Deck> {
  const params = new URLSearchParams(location.search);
  // 优先从 localStorage 加载文档
  const docId = params.get("doc");
  if (docId) {
    const doc = getDoc(docId);
    if (doc) {
      currentDocId = docId;
      return doc.deck;
    }
    console.warn("[OneAct] 文档不存在，回退示例：", docId);
  }
  // URL ?deck= 加载远程
  let url = params.get("deck");
  if (!url && location.hash.length > 1) url = location.hash.slice(1);
  if (url) {
    // 安全审计修复（2026-08-02）：SSRF 防护（CWE-918）
    // 仅允许 https 协议，拒绝私有 IP 段和元数据端点
    try {
      const parsed = new URL(url, location.origin);
      if (parsed.protocol !== "https:" && parsed.protocol !== "data:") {
        console.warn("[OneAct] 拒绝非 HTTPS deck URL（安全策略）");
      } else if (isPrivateOrMetadataIp(parsed.hostname)) {
        console.warn("[OneAct] 拒绝内网/元数据 deck URL（SSRF 防护）");
      } else {
        const r = await fetch(parsed.href);
        if (r.ok) return (await r.json()) as Deck;
      }
    } catch (e) {
      console.warn("[OneAct] 加载 deck 失败，回退内置示例：", e);
    }
  }
  return JSON.parse(__SAMPLE_DECK__);
}

/** 自动保存到 localStorage（防抖） */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function autoSave(ed: Editor): void {
  if (!currentDocId || docGone) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (docGone) return;
    try {
      // 以 deck.meta.title 为准同步文档标题——AI 生成会改 deck.meta.title，
      // 这样主页文档列表与编辑器标题始终一致。
      saveDoc(currentDocId!, ed.deck, ed.deck.meta.title);
      // 更新缩略图
      const theme = getTheme(ed.deck.meta.theme);
      const cs = canvasSize(ed.deck.meta.size);
      const firstPage = ed.deck.pages[0];
      if (firstPage) {
        const thumb = renderPage(firstPage, theme, { canvasW: cs.width, canvasH: cs.height, interactive: false });
        updateThumb(currentDocId!, thumb);
      }
    } catch (e) {
      console.warn("[OneAct] 自动保存失败：", e);
    }
  }, 800);
}

/**
 * 跨标签页防护：若本文档在别处（如主页）被删除，停止自动保存，
 * 避免「主页删 → 编辑器标签 autoSave 又写回」造成的幽灵文档。
 */
let docGone = false;
function checkDocAlive(): void {
  if (!currentDocId || docGone) return;
  if (!getDoc(currentDocId)) {
    docGone = true;
    document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "此文档已在主页被删除，编辑将不再保存" }));
    setTimeout(() => {
      if (!document.body.classList.contains("present")) location.href = "home.html";
    }, 2500);
  }
}
window.addEventListener("storage", (e) => {
  if (e.key === "oneact-docs-meta" || (currentDocId && e.key === `oneact-docs:${currentDocId}`)) checkDocAlive();
});

function exportHtml(deck: Deck): void {
  // 安全审计修复（2026-08-02）：统一使用 @oneact/exporter-deck 的 toStandaloneHtml
  // 修复了旧版直接 JSON.stringify 未转义 </ 和 U+2028/U+2029 的注入风险
  const html = toStandaloneHtml(deck, __PLAYER_RUNTIME__);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (deck.meta.title || "oneact-deck") + ".html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** 导出为 .act 文件（= Deck JSON，可被主页「导入」重新打开，完整无损）。 */
function exportAct(deck: Deck): void {
  const json = JSON.stringify(deck, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (deck.meta.title || "oneact-deck") + ".act";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

async function exportPptxDownload(deck: Deck): Promise<void> {
  const { data, filename, report } = await exportPptx(deck);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  if (report.length) {
    alert(
      `pptx 已导出（降级导出）。\n\n降级报告（${report.length} 项，明示丢失内容）：\n` +
        report.map((r) => `· [${r.kind}] ${r.detail}`).join("\n"),
    );
  }
}

let apiModalReturnFocus: HTMLElement | null = null;
function openApiModal(): void {
  const modal = document.getElementById("api-modal")!;
  modal.classList.remove("hidden");
  apiModalReturnFocus = document.activeElement as HTMLElement;
  const cfg = loadAiConfig();
  const k = document.getElementById("m-kind") as HTMLSelectElement;
  const m = document.getElementById("m-model") as HTMLInputElement;
  const key = document.getElementById("m-key") as HTMLInputElement;
  const base = document.getElementById("m-base") as HTMLInputElement;
  if (cfg) {
    k.value = cfg.kind;
    m.value = cfg.model;
    key.value = cfg.apiKey;
    base.value = cfg.baseUrl ?? "";
  }
  setTimeout(() => m.focus(), 0); // 打开后聚焦首个输入框
}
function closeApiModal(): void {
  document.getElementById("api-modal")!.classList.add("hidden");
  apiModalReturnFocus?.focus?.();
  apiModalReturnFocus = null;
}
function saveApiFromModal(): void {
  const model = (document.getElementById("m-model") as HTMLInputElement).value.trim();
  const apiKey = (document.getElementById("m-key") as HTMLInputElement).value.trim();
  if (!model || !apiKey) {
    document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "模型名和 API Key 不能为空" }));
    return;
  }
  const cfg: AiConfig = {
    kind: (document.getElementById("m-kind") as HTMLSelectElement).value as AiConfig["kind"],
    model,
    apiKey,
    baseUrl: (document.getElementById("m-base") as HTMLInputElement).value.trim() || undefined,
  };
  saveAiConfig(cfg);
  closeApiModal();
}

/** 切换 API Key 明文/密文显示。 */
function toggleKeyVisible(): void {
  const input = document.getElementById("m-key") as HTMLInputElement;
  input.type = input.type === "password" ? "text" : "password";
}

/** 用当前模态框里的（未保存）配置发一个最小请求，验证模型可用性。 */
async function testApiConnection(): Promise<void> {
  const result = document.getElementById("api-test-result")!;
  const model = (document.getElementById("m-model") as HTMLInputElement).value.trim();
  const apiKey = (document.getElementById("m-key") as HTMLInputElement).value.trim();
  const kind = (document.getElementById("m-kind") as HTMLSelectElement).value as AiConfig["kind"];
  const baseUrl = (document.getElementById("m-base") as HTMLInputElement).value.trim() || undefined;
  if (!model || !apiKey) {
    result.className = "api-test-result err";
    result.textContent = "请先填写模型名和 API Key";
    return;
  }
  const btn = document.getElementById("m-test") as HTMLButtonElement;
  btn.disabled = true;
  result.className = "api-test-result loading";
  result.textContent = "正在连接测试…";
  const t0 = performance.now();
  logInfo("api", "测试连接", { config: maskConfig({ kind, model, apiKey, baseUrl }) });
  try {
    const provider = createProvider({ kind, apiKey, model, baseUrl });
    const reply = await provider.generate([{ role: "user", content: "请只回复两个字符：OK" }], {
      maxTokens: 16,
      temperature: 0,
    });
    const ms = Math.round(performance.now() - t0);
    const sample = (reply || "").trim().slice(0, 48) || "（空回复）";
    logInfo("api", "测试连接成功", { model, ms, reply: sample });
    result.className = "api-test-result ok";
    result.innerHTML = `✓ 连接成功 · <code>${model}</code> · ${ms}ms<br>回复：${sample}`;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    logError("api", "测试连接失败", { config: maskConfig({ kind, model, apiKey, baseUrl }), ms }, e);
    result.className = "api-test-result err";
    result.innerHTML = `✕ 连接失败（${ms}ms）· <code>${(e as Error).message || String(e)}</code>`;
  } finally {
    btn.disabled = false;
  }
}

// ── 放映模式：HUD（页码+计时器，鼠标静止自动隐藏）+ B/W 黑白屏 ──
let presentTimer: ReturnType<typeof setInterval> | null = null;
let presentHudTimer: ReturnType<typeof setTimeout> | null = null;
let presentStart = 0;
function presentHudUpdate(ed: Editor): void {
  const pg = document.getElementById("present-page");
  const tm = document.getElementById("present-time");
  if (pg) pg.textContent = `${ed.index + 1} / ${ed.deck.pages.length}`;
  if (tm) {
    const el = Math.floor((Date.now() - presentStart) / 1000);
    const m = String(Math.floor(el / 60)).padStart(2, "0");
    const s = String(el % 60).padStart(2, "0");
    tm.textContent = `${m}:${s}`;
  }
}
function presentHudShow(): void {
  document.body.classList.remove("hud-hide");
  if (presentHudTimer) clearTimeout(presentHudTimer);
  presentHudTimer = setTimeout(() => document.body.classList.add("hud-hide"), 2500);
}
function presentClearBlank(): void {
  document.body.classList.remove("blank-black", "blank-white");
}
function togglePresent(ed: Editor): void {
  const on = !document.body.classList.contains("present");
  document.body.classList.toggle("present", on);
  presentClearBlank();
  document.body.classList.remove("hud-hide");
  if (on) {
    ed.goTo(ed.index);
    presentStart = Date.now();
    presentHudUpdate(ed);
    presentHudShow();
    if (presentTimer) clearInterval(presentTimer);
    presentTimer = setInterval(() => presentHudUpdate(ed), 1000);
    const fsEl = document.documentElement;
    if (fsEl.requestFullscreen) {
      fsEl
        .requestFullscreen()
        .catch(() => {})
        .then(() => requestAnimationFrame(() => ed.fit()));
    } else {
      requestAnimationFrame(() => ed.fit());
    }
  } else {
    if (presentTimer) {
      clearInterval(presentTimer);
      presentTimer = null;
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => ed.fit());
  }
}

async function main(): Promise<void> {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const deck = await loadDeck();
  let ed = new Editor(deck, {
    stage: $("stage"),
    thumbs: $("thumbs"),
    props: $("props"),
    pageCount: $("page-count"),
    validator: $("validator"),
    zoom: $("zoom"),
    docTitle: $("doc-title"),
  });
  (window as unknown as { __ed: Editor }).__ed = ed;

  // 自动保存：拦截 snapshot 调用，每次编辑后自动保存到 localStorage
  if (currentDocId) {
    const origSnapshot = ed.snapshot.bind(ed);
    ed.snapshot = () => {
      origSnapshot();
      autoSave(ed);
    };
    // 页面离开前保存
    window.addEventListener("beforeunload", () => {
      if (docGone) return;
      if (saveTimer) clearTimeout(saveTimer);
      try {
        saveDoc(currentDocId!, ed.deck, ed.deck.meta.title);
      } catch {}
    });
  }

  $("add-page").addEventListener("click", () => ed.addPage());
  $("play-btn").addEventListener("click", () => togglePresent(ed));
  $("home-btn")?.addEventListener("click", () => {
    location.href = "home.html";
  });
  $("zoom-in")?.addEventListener("click", () => ed.zoomBy(1));

  // ── 右侧属性栏可拖动分隔条：调整 .props 宽度（持久化），并重算画布缩放 ──
  const propsEl = $("props");
  const resizer = $("props-resizer");
  const PROPS_W_KEY = "oneact-props-width";
  const applyPropsWidth = (w: number) => {
    propsEl.style.width = `${Math.max(280, Math.min(640, w))}px`;
  };
  const savedW = Number(localStorage.getItem(PROPS_W_KEY));
  if (Number.isFinite(savedW) && savedW > 0) applyPropsWidth(savedW);
  if (resizer) {
    let startX = 0,
      startW = 0,
      rafId = 0;
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = propsEl.getBoundingClientRect().width;
      document.body.classList.add("props-resizing");
      const onMove = (ev: MouseEvent) => {
        const w = startW - (ev.clientX - startX); // 向左拖 → 面板变宽
        applyPropsWidth(w);
        if (!rafId)
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            ed.fit();
          });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.classList.remove("props-resizing");
        localStorage.setItem(PROPS_W_KEY, String(Math.round(propsEl.getBoundingClientRect().width)));
        ed.fit();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  // 双击分隔条 → 重置为默认宽度
  resizer?.addEventListener("dblclick", () => {
    applyPropsWidth(380);
    localStorage.setItem(PROPS_W_KEY, "380");
    ed.fit();
  });
  $("zoom-out")?.addEventListener("click", () => ed.zoomBy(-1));

  // Ribbon 工具带（功能下放：开始 / 插入组件 / 设计主题 / 动画 / 放映导出 / AI）
  const THEMES = THEME_SWATCHES.map((t) => ({
    k: t.name,
    label: t.label,
    primary: t.primary,
    accent: t.accent,
    dark: t.dark,
  }));
  const TONES = [
    { k: "text", c: "#1d1c1a" },
    { k: "primary", c: "#2f54eb" },
    { k: "accent", c: "#7c3aed" },
    { k: "text-secondary", c: "#5b5a55" },
  ];
  const RIBBON: Record<string, string> = {
    home: `<div class="rg"><div class="rg-tools">
      <button class="rbtn fmt" data-fmt="bold" title="加粗" style="font-weight:800;font-size:14px">B</button>
      <button class="rbtn fmt" data-fmt="italic" title="斜体" style="font-style:italic;font-family:Georgia,serif;font-size:14px">I</button>
      <button class="rbtn fmt" data-fmt="underline" title="下划线" style="text-decoration:underline;font-size:14px">U</button>
      </div><div class="rg-name">字体</div></div>
      <div class="rg"><div class="rg-tools">
      <button class="rbtn fmt" data-level="1" title="大标题字号" style="font-weight:700">H1</button>
      <button class="rbtn fmt" data-level="2" title="中标题字号" style="font-weight:600">H2</button>
      <button class="rbtn fmt" data-level="3" title="小标题字号" style="font-weight:500">H3</button>
      <span style="width:1px;align-self:stretch;background:var(--border-2,rgba(0,0,0,.12));margin:4px 2px"></span>
      <button class="rbtn fmt" data-fz="-2" title="字号 −">A−</button>
      <button class="rbtn fmt" data-fz="2" title="字号 +">A+</button>
      </div><div class="rg-name">字号</div></div>
      <div class="rg"><div class="rg-tools">
      <button class="rbtn fmt" data-align="left" title="左对齐">⬅</button>
      <button class="rbtn fmt" data-align="center" title="居中">≡</button>
      <button class="rbtn fmt" data-align="right" title="右对齐">➡</button>
      </div><div class="rg-name">对齐</div></div>
      <div class="rg"><div class="rg-tools">${TONES.map((t) => `<button class="rbtn fmt" data-tone="${t.k}" title="${t.k}"><i style="display:block;width:16px;height:16px;border-radius:4px;background:${t.c};border:1px solid rgba(0,0,0,.15)"></i></button>`).join("")}</div><div class="rg-name">颜色</div></div>
      <div class="rg"><div class="rg-tools"><button class="rbtn lg" data-act="newpage"><span class="gi">＋</span><p>新页面</p></button></div><div class="rg-name">幻灯片</div></div>
      <div class="rg"><div class="rg-tools"><button class="rbtn" data-act="validate">重新校验</button></div><div class="rg-name">校验</div></div>`,
    insert: `<div class="rg"><div class="rg-tools" style="gap:4px">
      <button class="rbtn" data-type="heading">＋ 标题</button>
      <button class="rbtn" data-type="paragraph">＋ 段落</button>
      <button class="rbtn" data-type="bullet-list">＋ 列表</button>
      <button class="rbtn" data-type="image">＋ 图片</button>
      <button class="rbtn" data-type="chart">＋ 图表</button>
      <button class="rbtn" data-type="table">＋ 表格</button>
      </div><div class="rg-name">常用组件</div></div>
      <div class="rg"><div class="rg-tools">
      <div class="dropdown" data-sel="insert-base"><button class="sel-trigger">▦ 全部基础组件</button><div class="sel-menu">${INSERTABLE.map((c) => `<div class="sel-opt" data-type="${c.type}">${c.label}</div>`).join("")}</div></div>
      <div class="dropdown" data-sel="insert-smart"><button class="sel-trigger">✨ 智能组合块</button><div class="sel-menu">${SMART_BLOCKS.map((b) => `<div class="sel-opt" data-smart="${b.key}">${b.icon} ${b.label}</div>`).join("")}</div></div>
      </div><div class="rg-name">更多</div></div>`,
    design: `<div class="rg" style="flex:1"><div class="rg-tools" style="flex-wrap:wrap;gap:6px">${THEMES.map((t) => `<button class="rbtn" data-theme="${t.k}" title="${t.label}" style="flex-direction:column;gap:4px;padding:4px 6px 0"><span class="gi" style="background:${t.dark ? "#0b1020" : "#fff"};border:1px solid rgba(0,0,0,.1);display:flex;align-items:center;gap:2px;padding:3px;border-radius:7px"><i style="display:block;width:16px;height:16px;border-radius:4px;background:linear-gradient(135deg,${t.primary},${t.accent})"></i></span><p style="font-size:10px">${t.label}</p></button>`).join("")}</div><div class="rg-name">主题（${THEMES.length} 套）</div></div>`,
    anim: `<div class="rg"><div class="rg-tools" style="flex-wrap:wrap;gap:4px">${ANIM_CHOICES.map((a) => `<button class="rbtn" data-anim="${a}">${ANIM_LABELS[a] ?? a}</button>`).join("")}</div><div class="rg-name">进入动画（选中元素后点选）</div></div>`,
    show: `<div class="rg"><div class="rg-tools"><button class="rbtn lg" data-act="play"><span class="gi">▶</span><p>放映</p></button></div><div class="rg-name">放映</div></div><div class="rg"><div class="rg-tools"><button class="rbtn" data-act="export-html">⬇ 网页</button><button class="rbtn" data-act="export-pptx">⬇ PPTX</button><button class="rbtn" data-act="export-act">⬇ .act</button></div><div class="rg-name">导出</div></div>`,
    ai: `<div class="rg"><div class="rg-tools"><button class="rbtn lg ai" data-act="gen-deck"><span class="gi">✦</span><p>生成整套</p></button><button class="rbtn lg" data-act="focus-ai"><span class="gi">✎</span><p>改这一页</p></button></div><div class="rg-name">AI 生成</div></div><div class="rg"><div class="rg-tools"><span class="rg-hint">模型配置已移至主页「⚙ AI 设置」</span></div><div class="rg-name">设置</div></div>`,
  };
  const renderRibbon = (tab: string) => {
    $("ribbon").innerHTML = RIBBON[tab] ?? RIBBON.home;
    if (tab === "anim") refreshAnimHighlight();
    if (tab === "home") refreshHomeRibbon();
    if (tab === "design") refreshDesignHighlight();
  };
  /** 「开始」工具栏：按当前选中元素状态高亮 B/I/U/对齐/颜色/字号级。 */
  const refreshHomeRibbon = () => {
    const f = ed.currentFormat();
    $("ribbon").querySelectorAll<HTMLElement>(".fmt").forEach((b) => {
      const on =
        (b.dataset.fmt && !!f[b.dataset.fmt as "bold" | "italic" | "underline"]) ||
        (b.dataset.align && f.align === b.dataset.align) ||
        (b.dataset.tone && f.tone === b.dataset.tone) ||
        (b.dataset.level && String(f.level) === b.dataset.level);
      b.classList.toggle("on", !!on);
      // 非文本元素时，仅字号/格式按钮置灰提示
      const needsText = !!(b.dataset.fmt || b.dataset.level || b.dataset.fz || b.dataset.align || b.dataset.tone);
      b.style.opacity = needsText && !f.type ? ".45" : "";
    });
  };
  document.addEventListener("oneact:selection-change", refreshHomeRibbon);
  /** 「设计」工具栏：高亮当前选中主题（与 hover 中性灰区分）。 */
  const refreshDesignHighlight = () => {
    const cur = ed.theme.name;
    $("ribbon").querySelectorAll<HTMLElement>("[data-theme]").forEach((b) => {
      b.classList.toggle("on", b.dataset.theme === cur);
    });
  };
  renderRibbon("home");
  document.querySelectorAll(".rtab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".rtab").forEach((x) => x.classList.remove("on"));
      t.classList.add("on");
      renderRibbon((t as HTMLElement).dataset.tab || "home");
    }),
  );
  $("ribbon").addEventListener("click", (e) => {
    // 自定义下拉菜单：点击 trigger 切换
    const trigger = (e.target as HTMLElement).closest<HTMLElement>(".sel-trigger");
    if (trigger) {
      const menu = trigger.nextElementSibling as HTMLElement | null;
      const isOpen = trigger.classList.contains("open");
      document.querySelectorAll(".sel-trigger.open").forEach((t) => t.classList.remove("open"));
      document.querySelectorAll(".sel-menu.open").forEach((m) => m.classList.remove("open"));
      if (!isOpen && menu) {
        trigger.classList.add("open");
        menu.classList.add("open");
        // 用 fixed 定位，避免被 ribbon 的 overflow 裁剪
        const r = trigger.getBoundingClientRect();
        menu.style.left = `${r.left}px`;
        menu.style.top = `${r.bottom + 4}px`;
      }
      return;
    }
    // 自定义下拉菜单：点击选项
    const opt = (e.target as HTMLElement).closest<HTMLElement>(".sel-opt");
    if (opt) {
      const dropdown = opt.closest(".dropdown");
      if (dropdown) {
        const sel = dropdown.getAttribute("data-sel") || "";
        const triggerBtn = dropdown.querySelector<HTMLElement>(".sel-trigger")!;
        // 统一关闭菜单
        triggerBtn.classList.remove("open");
        opt.parentElement?.classList.remove("open");
        if (sel === "insert-base") {
          // 插入基础组件：不改变触发按钮文案，直接插入后收起
          const tp = opt.dataset.type;
          if (tp) ed.addElement(tp as ElementType);
        } else if (sel === "insert-smart") {
          const sm = opt.dataset.smart;
          if (sm) ed.addSmartBlock(sm);
        } else {
          // 通用单选下拉：更新触发按钮文案 + 选中态
          const oldValue = triggerBtn.dataset.value;
          const newValue = opt.dataset.value!;
          triggerBtn.textContent = opt.textContent;
          triggerBtn.dataset.value = newValue;
          opt.parentElement?.querySelectorAll(".sel-opt").forEach((o) => o.classList.remove("selected"));
          opt.classList.add("selected");
          if (sel === "deck" && newValue !== oldValue) {
            const d = (newValue === "golden" ? JSON.parse(__GOLDEN_DECK__) : JSON.parse(__SAMPLE_DECK__)) as Deck;
            document.body.classList.remove("present");
            currentDocId = null; // 切换到内置示例，不自动保存
            ed = new Editor(d, {
              stage: $("stage"),
              thumbs: $("thumbs"),
              props: $("props"),
              pageCount: $("page-count"),
              validator: $("validator"),
              zoom: $("zoom"),
              docTitle: $("doc-title"),
            });
          }
        }
      }
      return;
    }
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-act],[data-type],[data-theme],[data-smart],[data-anim],[data-fmt],[data-level],[data-fz],[data-align],[data-tone]",
    );
    if (!t) return;
    if (t.dataset.type) {
      ed.addElement(t.dataset.type as ElementType);
      return;
    }
    if (t.dataset.smart) {
      ed.addSmartBlock(t.dataset.smart);
      return;
    }
    if (t.dataset.theme) {
      ed.setTheme(t.dataset.theme);
      refreshDesignHighlight();
      return;
    }
    if (t.dataset.anim !== undefined) {
      if (!ed.selectedId) {
        document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "请先在画布上选中一个元素" }));
      } else {
        ed.setElementAnim(t.dataset.anim);
        refreshAnimHighlight();
      }
      return;
    }
    // ── 「开始」工具栏：文本格式化（需先选中元素）──
    if (t.dataset.fmt || t.dataset.align || t.dataset.tone || t.dataset.fz || t.dataset.level) {
      if (!ed.selectedId) {
        document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "请先在画布上选中一个文本元素" }));
        return;
      }
    }
    if (t.dataset.fmt) {
      ed.toggleFormat(t.dataset.fmt as "bold" | "italic" | "underline");
      return;
    }
    if (t.dataset.level) {
      ed.setHeadingLevel(Number(t.dataset.level) as 1 | 2 | 3);
      return;
    }
    if (t.dataset.fz) {
      ed.bumpFontSize(Number(t.dataset.fz));
      return;
    }
    if (t.dataset.align) {
      ed.setAlign(t.dataset.align as "left" | "center" | "right");
      return;
    }
    if (t.dataset.tone) {
      ed.setTone(t.dataset.tone);
      return;
    }
    switch (t.dataset.act) {
      case "newpage":
        ed.addPage();
        break;
      case "play":
        togglePresent(ed);
        break;
      case "validate":
        ed.validate();
        break;
      case "export-html":
        exportHtml(ed.deck);
        break;
      case "export-pptx":
        void exportPptxDownload(ed.deck);
        break;
      case "export-act":
        exportAct(ed.deck);
        break;
      case "focus-ai":
        document.dispatchEvent(new CustomEvent("oneact:focus-ai"));
        break;
      case "gen-deck":
        openBriefing({
          onConfirm: (brief, skills) => {
            void runGenerateDeck(ed, brief.title || brief.topic, brief, skills);
          },
        });
        break;
      case "open-api":
        openProvidersModal();
        break;
    }
  });
  // 点击外部关闭下拉菜单
  document.addEventListener("click", (e) => {
    if (!(e.target as HTMLElement).closest(".dropdown")) {
      document.querySelectorAll(".sel-trigger.open").forEach((t) => t.classList.remove("open"));
      document.querySelectorAll(".sel-menu.open").forEach((m) => m.classList.remove("open"));
    }
  });
  document.addEventListener("oneact:open-api", openProvidersModal);

  // 让顶部 Ribbon 在横向溢出时支持鼠标滚轮横向滚动（设计/动画 tab 按钮较多）
  const ribbonEl = $("ribbon");
  ribbonEl.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      const canH = ribbonEl.scrollWidth > ribbonEl.clientWidth + 1;
      if (!canH) return; // 没溢出就不拦截，避免影响页面纵向滚动
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        ribbonEl.scrollLeft += e.deltaY;
      }
    },
    { passive: false },
  );
  document.addEventListener("oneact:focus-ai", () => {
    const ai = document.querySelector<HTMLTextAreaElement>("#ai-input");
    ai?.focus();
    ai?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("m-cancel").addEventListener("click", closeApiModal);
  $("m-save").addEventListener("click", saveApiFromModal);
  $("m-eye").addEventListener("click", toggleKeyVisible);
  $("m-test").addEventListener("click", () => void testApiConnection());
  $("api-modal").addEventListener("click", (e) => {
    if (e.target === $("api-modal")) closeApiModal();
  });

  // ── AI 生成整套：主题输入 modal ──
  const genModal = $("gen-modal");
  const openGenModal = () => {
    genModal.classList.remove("hidden");
    setTimeout(() => $("g-topic").focus(), 0);
  };
  const closeGenModal = () => genModal.classList.add("hidden");
  $("g-cancel").addEventListener("click", closeGenModal);
  genModal.addEventListener("click", (e) => {
    if (e.target === genModal) closeGenModal();
  });
  $("g-go").addEventListener("click", async () => {
    const topic = $("g-topic").value.trim();
    if (!topic) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "请输入演示主题" }));
      return;
    }
    closeGenModal();
    await runGenerateDeck(ed, topic);
  });
  genModal.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.target as HTMLElement).id === "g-topic") {
      e.preventDefault();
      $("g-go").click();
    }
  });

  // ── 顶部撤销/重做 ──
  const refreshUndoRedo = () => {
    $("btn-undo")?.classList.toggle("disabled", !ed.canUndo());
    $("btn-redo")?.classList.toggle("disabled", !ed.canRedo());
  };
  $("btn-undo")?.addEventListener("click", () => {
    if (ed.canUndo()) {
      ed.undo();
      refreshUndoRedo();
    }
  });
  $("btn-redo")?.addEventListener("click", () => {
    if (ed.canRedo()) {
      ed.redo();
      refreshUndoRedo();
    }
  });
  document.addEventListener("oneact:history-change", refreshUndoRedo);
  refreshUndoRedo();

  // 顶部「动画」tab：高亮当前选中元素的动画预设
  const refreshAnimHighlight = () => {
    const cur = ed.currentElementAnim();
    document.querySelectorAll<HTMLElement>("#ribbon .rbtn[data-anim]").forEach((b) => {
      b.classList.toggle("on", b.dataset.anim === cur);
    });
  };

  // ── AI 生成进度灵动岛（多 Agent 协作可视化）──
  // 管线对应 5 个 Agent 职责：导演(主题)→架构(大纲)→内容(逐页)→设计(精修)→校验(检查)。
  // 灵动岛用「发光球 + Agent 圆点 + 轮换提示」表达「现在谁在做什么」，告别单调的转圈。
  const AGENTS: { key: string; name: string; icon: string }[] = [
    { key: "director", name: "导演", icon: "✦" },
    { key: "architect", name: "架构", icon: "▤" },
    { key: "writer", name: "内容", icon: "✎" },
    { key: "designer", name: "设计", icon: "◈" },
    { key: "validator", name: "校验", icon: "✓" },
  ];
  const dotsHtml = (active: string[]): string =>
    `<span class="is-dots">${AGENTS.map(
      (a) => `<span class="is-dot ${active.includes(a.key) ? "on" : ""}" title="${a.name} Agent">${a.icon}</span>`,
    ).join("")}</span>`;

  const island = $("ai-island");
  let islandTimer: ReturnType<typeof setTimeout> | null = null;
  let hintTimer: ReturnType<typeof setInterval> | null = null;
  const stopHint = () => {
    if (hintTimer) {
      clearInterval(hintTimer);
      hintTimer = null;
    }
  };
  const rollHints = (list: string[]): void => {
    stopHint();
    if (list.length <= 1) return;
    let i = 0;
    hintTimer = setInterval(() => {
      i = (i + 1) % list.length;
      const node = island?.querySelector<HTMLElement>(".is-hint");
      if (node) node.textContent = list[i];
    }, 1900);
  };

  document.addEventListener("oneact:gen-state", (ev) => {
    if (!island) return;
    const d = (ev as CustomEvent).detail || {} as { phase?: string; total?: number; index?: number; pages?: number; ok?: boolean; message?: string };
    if (islandTimer) {
      clearTimeout(islandTimer);
      islandTimer = null;
    }
    island.style.cursor = "";
    island.classList.add("show");
    if (d.phase === "outline") {
      const totalTag = d.total ? `（目标 ${d.total} 页）` : "";
      island.className = "ai-island show shimmer";
      island.innerHTML = `<span class="is-orb"></span>${dotsHtml(["director", "architect"])}<span class="is-title">构思大纲${totalTag}</span><span class="is-hint">导演正在理解你的主题…</span>`;
      rollHints(["导演正在理解你的主题…", "架构师搭建全篇大纲…", "规划页面顺序与节奏…"]);
    } else if (d.phase === "pages" && d.total && d.index != null) {
      const n = d.index + 1;
      const pct = Math.round((n / d.total) * 100);
      island.className = "ai-island show";
      island.innerHTML = `<span class="is-orb"></span>${dotsHtml(["writer", "designer", "validator"])}<span class="is-title">生成中 ${n}/${d.total}</span><span class="is-hint">✎ 内容作者撰写第 ${n} 页…</span><i class="is-bar"><i style="width:${pct}%"></i></i>`;
      rollHints([`✎ 内容作者撰写第 ${n} 页…`, `◈ 设计师为第 ${n} 页配色…`, `✓ 校验员检查越界与重叠…`]);
    } else if (d.phase === "done") {
      stopHint();
      island.className = "ai-island show " + (d.ok !== false ? "ok" : "warn");
      const txt = d.ok !== false ? `✓ 已生成 ${d.pages} 页` : `⚠ 已生成 ${d.pages} 页（有校验问题）`;
      island.innerHTML = `<span class="is-orb"></span>${dotsHtml(["validator"])}<span class="is-title">${txt}</span>`;
      islandTimer = setTimeout(() => {
        island.classList.remove("show");
        stopHint();
      }, 3600);
    } else if (d.phase === "error") {
      stopHint();
      island.className = "ai-island show err";
      island.title = d.message || "生成失败";
      const m = (d.message || "未知原因").slice(0, 60);
      island.innerHTML = `<span class="is-orb"></span><span class="is-title">✕ 生成失败</span><span class="is-hint">${m}</span><a href="#" id="island-log">查看日志</a>`;
      island.querySelector("#island-log")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        openLogPage();
      });
      island.style.cursor = "default";
      islandTimer = setTimeout(() => island.classList.remove("show"), 8000);
    }
  });

  // 注：日志页常驻入口在主页（home）侧栏「查看日志」。编辑器内仅保留
  // 「生成失败」时灵动岛的「查看日志」链接（见下方 gen-state error 分支），带数据打开、file:// 也可诊断。

  // ── toast 通知 ──
  const toast = $("toast");
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener("oneact:notify", (ev) => {
    if (!toast) return;
    toast.textContent = (ev as CustomEvent).detail || "";
    toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  });

  // ── 全屏退出 → 同步退出播放态（用户按 Esc 退全屏时）──
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.body.classList.contains("present")) {
      document.body.classList.remove("present");
      if (presentTimer) {
        clearInterval(presentTimer);
        presentTimer = null;
      }
      requestAnimationFrame(() => ed.fit());
    }
  });
  // 放映时移动鼠标 → 唤醒 HUD（静止 2.5s 后自动隐藏）
  window.addEventListener("mousemove", () => {
    if (document.body.classList.contains("present")) presentHudShow();
  });

  // 放映模式：鼠标滚轮 / 触控板翻页（节流 600ms，避免一次滑动连翻多页）
  let presentWheelAt = 0;
  window.addEventListener(
    "wheel",
    (e) => {
      if (!document.body.classList.contains("present")) return;
      if (Math.abs(e.deltaY) < 8) return;
      const now = (performance && performance.now()) || Date.now();
      if (now - presentWheelAt < 600) return;
      presentWheelAt = now;
      if (e.deltaY > 0) ed.next();
      else ed.prev();
      presentClearBlank();
      presentHudUpdate(ed);
      presentHudShow();
    },
    { passive: true },
  );

  window.addEventListener("keydown", (e) => {
    const inField = ["TEXTAREA", "INPUT", "SELECT"].includes((e.target as HTMLElement).tagName);
    if (document.body.classList.contains("present")) {
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          presentClearBlank();
          ed.next();
          presentHudUpdate(ed);
          presentHudShow();
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          presentClearBlank();
          ed.prev();
          presentHudUpdate(ed);
          presentHudShow();
          break;
        case "b":
        case "B":
          document.body.classList.toggle("blank-black");
          document.body.classList.remove("blank-white");
          break;
        case "w":
        case "W":
          document.body.classList.toggle("blank-white");
          document.body.classList.remove("blank-black");
          break;
        case "Escape":
        case "p":
        case "P":
          // 黑屏时第一次 Esc 只取消黑屏（仿 WPS），再按才退出放映
          if (document.body.classList.contains("blank-black") || document.body.classList.contains("blank-white")) {
            presentClearBlank();
          } else {
            document.body.classList.remove("present");
            if (presentTimer) {
              clearInterval(presentTimer);
              presentTimer = null;
            }
            requestAnimationFrame(() => ed.fit());
          }
          break;
      }
      return;
    }
    // Ctrl+Z 撤销 / Ctrl+Y 或 Ctrl+Shift+Z 重做
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
      e.preventDefault();
      if (e.shiftKey) ed.redo();
      else ed.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y" && !inField) {
      e.preventDefault();
      ed.redo();
      return;
    }
    // Ctrl+C 复制 / Ctrl+V 粘贴
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !inField) {
      ed.copySelected();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !inField) {
      e.preventDefault();
      ed.paste();
      return;
    }
    // Ctrl+D 复制元素
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && !inField) {
      e.preventDefault();
      ed.copySelected();
      ed.paste();
      return;
    }
    // 图层排序 Ctrl+] 上移 Ctrl+[ 下移 Ctrl+Shift+] 置顶 Ctrl+Shift+[ 置底
    if ((e.ctrlKey || e.metaKey) && !inField && ed.selectedId) {
      if (e.key === "]") {
        e.preventDefault();
        if (e.shiftKey) ed.bringToFront();
        else ed.moveForward();
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        if (e.shiftKey) ed.sendToBack();
        else ed.moveBackward();
        return;
      }
    }
    if (e.key === "Escape") ed.selectElement(null);
    if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
      e.preventDefault();
      ed.deleteSelected();
    }
    // 方向键微调
    if (!inField && ed.selectedId) {
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          ed.nudge(-step, 0);
          break;
        case "ArrowRight":
          e.preventDefault();
          ed.nudge(step, 0);
          break;
        case "ArrowUp":
          e.preventDefault();
          ed.nudge(0, -step);
          break;
        case "ArrowDown":
          e.preventDefault();
          ed.nudge(0, step);
          break;
      }
    }
  });
}

void main();
