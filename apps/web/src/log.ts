/**
 * @oneact/web — 日志查看页（log.html）
 *
 * 读取 logger 模块持久化的日志，按级别/关键词过滤，支持复制/导出/清空、自动刷新、详细模式开关。
 * 用于诊断「AI 生成失败（已还原）」等问题：直接查看 error 级记录的 provider 状态码与堆栈。
 */
import { getLogs, clearLogs, exportLogs, isDebugMode, setDebugMode, type LogEntry, type LogLevel } from "./logger.js";

const $ = <T extends HTMLElement>(sel: string): T => {
  // 兼容 $("id") 与 $("#id") 两种写法
  const el = sel.startsWith("#") ? document.querySelector(sel) : document.getElementById(sel);
  return el as T;
};

let levelFilter: LogLevel | "all" = "all";
let query = "";

// file:// 下每个文件是独立 opaque origin，localStorage 跨文件隔离；
// 因此编辑器把最近日志经 URL hash 传入。hash 模式 = 只读快照；无 hash = 走 localStorage（http 部署或同源）。
function loadFromHash(): LogEntry[] | null {
  const h = location.hash.slice(1);
  if (!h) return null;
  try {
    const json = decodeURIComponent(escape(atob(h)));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}
const hashPayload = loadFromHash();
const payloadMode = hashPayload !== null;
function getEntries(): LogEntry[] {
  return hashPayload ?? getLogs();
}

function fmtTime(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function entryHtml(e: LogEntry): string {
  const dataPre = e.data !== undefined ? `<pre>${esc(JSON.stringify(e.data, null, 2))}</pre>` : "";
  const errPre = e.err
    ? `<pre class="errstack">${esc(e.err.name ? e.err.name + ": " : "")}${esc(e.err.message)}${e.err.stack ? "\n\n" + esc(e.err.stack) : ""}</pre>`
    : "";
  return `<div class="entry ${e.level}">
    <div class="head">
      <span class="time">${fmtTime(e.t)}</span>
      <span class="lv">${e.level}</span>
      <span class="cat">${esc(e.cat)}</span>
      <span class="msg">${esc(e.msg)}</span>
    </div>
    ${dataPre}${errPre}
  </div>`;
}

function render(): void {
  const all = getEntries();
  const list = $("list");
  // 统计
  const errs = all.filter((e) => e.level === "error").length;
  const warns = all.filter((e) => e.level === "warn").length;
  $("count").textContent = `${all.length} 条`;
  $("stat").innerHTML =
    `<span class="e">✗ ${errs}</span><span class="w">⚠ ${warns}</span><b>ℹ ${all.length - errs - warns}</b>`;

  let filtered = all;
  if (levelFilter !== "all") filtered = filtered.filter((e) => e.level === levelFilter);
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.msg.toLowerCase().includes(q) ||
        e.cat.toLowerCase().includes(q) ||
        (e.err?.message || "").toLowerCase().includes(q) ||
        (e.err?.stack || "").toLowerCase().includes(q) ||
        JSON.stringify(e.data || "")
          .toLowerCase()
          .includes(q),
    );
  }
  filtered = filtered.slice().reverse(); // 最新在上

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${all.length === 0 ? "暂无日志记录。在编辑器里操作（生成/测试连接）后，记录会出现在这里。" : "没有匹配的记录。"}</div>`;
    return;
  }
  list.innerHTML = filtered.map(entryHtml).join("");
}

// ── 事件 ──
$("#lv-seg").addEventListener("click", (ev) => {
  const b = (ev.target as HTMLElement).closest("button");
  if (!b) return;
  levelFilter = (b.dataset.lv as LogLevel | "all") ?? "all";
  $("#lv-seg")
    .querySelectorAll("button")
    .forEach((x) => x.classList.remove("on"));
  b.classList.add("on");
  render();
});

$("#search").addEventListener("input", (ev) => {
  query = (ev.target as HTMLInputElement).value.trim();
  render();
});

$("#back-btn").addEventListener("click", () => {
  // 本页通常由 home/editor 用 window.open 在新标签打开；优先回到主页。
  if (history.length > 1 && document.referrer) history.back();
  else location.href = "home.html";
});

$("#refresh").addEventListener("click", () => {
  const btn = $("#refresh");
  btn.classList.add("spinning");
  render();
  // 刷新「手感」：即便没有新日志，也让按钮转一下、更新时间戳，明确反馈点击生效
  setTimeout(() => btn.classList.remove("spinning"), 480);
  const ts = document.getElementById("refresh-ts");
  if (ts) {
    const d2 = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    ts.textContent = `已刷新 ${p2(d2.getHours())}:${p2(d2.getMinutes())}:${p2(d2.getSeconds())}`;
  }
});

$("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(getEntries(), null, 2));
    $("#copy").textContent = "✓ 已复制";
    setTimeout(() => ($("#copy").textContent = "📋 复制"), 1400);
  } catch {
    alert("复制失败，请用「导出 JSON」");
  }
});

$("#export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(getEntries(), null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `oneact-logs-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

if (payloadMode) {
  // 快照模式（file:// 跨文件）：清空/自动刷新/详细模式无意义，禁用并提示
  ($("#clear")).disabled = true;
  ($("#auto")).disabled = true;
  ($("#dbg")).disabled = true;
  const banner = document.createElement("div");
  banner.className = "hint";
  banner.textContent = "📎 快照模式：显示从编辑器传入的最近 150 条日志（file:// 跨文件隔离所致）。如需实时刷新，请用 serve.mjs 以 http 提供服务。";
  document.querySelector(".toolbar")?.before(banner);
} else {
  $("#clear").addEventListener("click", () => {
    if (confirm("确定清空全部日志记录吗？此操作不可撤销。")) {
      clearLogs();
      render();
    }
  });
}

const dbg = document.getElementById("dbg") as HTMLInputElement;
dbg.checked = isDebugMode();
// live（非快照）模式：显示「实时同步」标识，明确告知本页会随编辑器自动刷新
if (!payloadMode) {
  const head = document.querySelector("header");
  if (head) {
    const tag = document.createElement("span");
    tag.className = "live-tag";
    tag.innerHTML = "<i></i> 实时同步";
    tag.title = "编辑器写日志时本页自动刷新（同源 http 部署生效；file:// 跨文件隔离无法实时）";
    head.appendChild(tag);
  }
}
dbg.addEventListener("change", () => {
  setDebugMode(dbg.checked);
  render();
});

// 自动刷新：定时 + 跨页 storage 事件
let autoTimer: ReturnType<typeof setInterval> | null = null;
const auto = document.getElementById("auto") as HTMLInputElement;
auto.addEventListener("change", () => {
  if (autoTimer) {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  if (auto.checked) autoTimer = setInterval(render, 1200);
});
window.addEventListener("storage", (e) => {
  if (e.key === "oneact-logs") render();
});

render();
