/**
 * @oneact/web — 主页入口
 *
 * WPS 式主页：新建演示 / 模板库 / 最近文档 / 导入文件。
 * 文档存储在 localStorage，点击文档跳转 editor.html?doc=<id>。
 */
import { canvasSize, computeScale, getTheme, migrate, renderPage, runtimeCss } from "@oneact/core";
import "@oneact/components";
import type { Deck } from "@oneact/schema";
import { createBlankDeck, createDoc, deleteDoc, listDocs, renameDoc, saveDoc, type DocMeta } from "./doc-store.js";
import { openProvidersModal } from "./providers.js";
import { getUsage, summarizeUsage, clearUsage, type UsageEntry } from "./usage.js";
import { listAllSkills, loadUserSkills, addUserSkill, deleteUserSkill } from "./skill-store.js";
import { parseFrontmatter, serializeSkill } from "@oneact/skills";

declare const __SAMPLE_DECK__: string;
declare const __GOLDEN_DECK__: string;

// ── 工具函数 ──

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

/** 渲染单页缩略图 HTML */
function renderThumb(deck: Deck): string {
  const theme = getTheme(deck.meta.theme);
  const cs = canvasSize(deck.meta.size);
  const firstPage = deck.pages[0];
  if (!firstPage) return "";
  // 缩略图不交互，节省渲染
  return renderPage(firstPage, theme, { canvasW: cs.width, canvasH: cs.height, interactive: false });
}

// ── 主逻辑 ──

let currentView: "recent" | "templates" | "usage" | "skills" | "about" | "help" = "recent";
let searchQuery = "";
let batchMode = false;
const selectedDocs = new Set<string>();

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** 打开编辑器 */
function openEditor(docId: string): void {
  location.href = `editor.html?doc=${docId}`;
}

/** 打开 deck（创建新文档后跳转） */
function openDeckAsNewDoc(deck: Deck, title?: string): void {
  const id = createDoc(deck);
  openEditor(id);
}

/** Toast 提示 */
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string): void {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ── 渲染：最近文档 ──

function renderRecent(): void {
  const content = $("content");
  let docs = listDocs();

  // 搜索过滤
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    docs = docs.filter((d) => d.title.toLowerCase().includes(q));
  }

  if (docs.length === 0 && !searchQuery) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">📑</div>
        <div class="title">还没有文档</div>
        <div class="desc">点击左侧「新建演示」开始创建你的第一个 PPT</div>
      </div>
    `;
    return;
  }

  if (docs.length === 0 && searchQuery) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <div class="title">未找到匹配的文档</div>
        <div class="desc">试试其他关键词</div>
      </div>
    `;
    return;
  }

  const cards = docs
    .map((d) => {
      const thumbHtml = d.thumb || "";
      const sel = selectedDocs.has(d.id);
      return `
        <div class="doc-card${batchMode ? " batch" : ""}${sel ? " selected" : ""}" data-doc="${d.id}">
          ${batchMode ? `<div class="batch-check ${sel ? "on" : ""}">✓</div>` : ""}
          <div class="doc-actions">
            <div class="doc-action-btn" data-act="rename" title="重命名">✏</div>
            <div class="doc-action-btn del" data-act="delete" title="删除">🗑</div>
          </div>
          <div class="doc-thumb">
            ${thumbHtml ? `<div class="scaler">${thumbHtml}</div>` : `<div class="doc-thumb-empty">📄</div>`}
          </div>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(d.title)}</div>
            <div class="doc-meta">
              <span>${d.pageCount} 页</span>
              <span class="dot"></span>
              <span>${timeAgo(d.modifiedAt)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  const batchBar = batchMode
    ? `<div class="batch-bar">
        <label class="batch-all"><input type="checkbox" id="batch-all" ${
          docs.length > 0 && selectedDocs.size === docs.length ? "checked" : ""
        }> 全选</label>
        <span class="batch-count">已选 <b id="batch-num">${selectedDocs.size}</b> / ${docs.length} 项</span>
        <div class="spacer"></div>
        <button class="batch-btn danger" id="batch-del" ${selectedDocs.size === 0 ? "disabled" : ""}>🗑 删除所选</button>
        <button class="batch-btn" id="batch-cancel">取消</button>
      </div>`
    : "";

  content.innerHTML = `
    <div class="content-h">
      <h2>最近文档</h2>
      <span class="count">${docs.length} 个文档</span>
      <div class="spacer"></div>
      ${batchMode ? "" : `<span class="sort-btn" data-act="batch">☑ 批量操作</span>`}
      <span class="sort-btn" data-sort="modified">按修改时间</span>
    </div>
    ${batchBar}
    <div class="doc-grid">${cards}</div>
  `;
  requestAnimationFrame(fitThumbs);

  // 进入批量操作
  content.querySelector<HTMLElement>('[data-act="batch"]')?.addEventListener("click", () => {
    batchMode = true;
    selectedDocs.clear();
    renderRecent();
  });

  // 绑定卡片事件
  content.querySelectorAll<HTMLElement>(".doc-card").forEach((card) => {
    const docId = card.dataset.doc!;
    card.addEventListener("click", (e) => {
      // 批量模式：点击即切换选中
      if (batchMode) {
        if (selectedDocs.has(docId)) selectedDocs.delete(docId);
        else selectedDocs.add(docId);
        renderRecent();
        return;
      }
      const act = (e.target as HTMLElement).closest("[data-act]");
      if (act) {
        e.stopPropagation();
        const action = act.dataset.act;
        if (action === "rename") startRename(docId);
        else if (action === "delete") confirmDelete(docId);
        return;
      }
      openEditor(docId);
    });
  });

  // 批量操作栏
  if (batchMode) {
    $("batch-all")?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      selectedDocs.clear();
      if (checked) docs.forEach((d) => selectedDocs.add(d.id));
      renderRecent();
    });
    $("batch-cancel")?.addEventListener("click", () => {
      batchMode = false;
      selectedDocs.clear();
      renderRecent();
    });
    $("batch-del")?.addEventListener("click", () => {
      if (selectedDocs.size === 0) return;
      if (!confirm(`确定删除选中的 ${selectedDocs.size} 个文档？此操作不可撤销。`)) return;
      selectedDocs.forEach((id) => deleteDoc(id));
      const n = selectedDocs.size;
      selectedDocs.clear();
      batchMode = false;
      renderRecent();
      showToast(`已删除 ${n} 个文档`);
    });
  }
}

// ── 渲染：模板库 ──

function renderTemplates(): void {
  const content = $("content");
  const sampleDeck = JSON.parse(__SAMPLE_DECK__) as Deck;
  const goldenDeck = JSON.parse(__GOLDEN_DECK__) as Deck;

  const builtIn: { key: string; title: string; desc: string; deck: Deck }[] = [
    { key: "blank", title: "空白演示", desc: "从零开始", deck: createBlankDeck("空白演示") },
    { key: "sample", title: "一幕自荐", desc: "产品介绍模板", deck: sampleDeck },
    { key: "golden", title: "黄金测试集", desc: "全组件展示", deck: goldenDeck },
  ];

  const builtInCards = builtIn
    .map((t) => {
      const thumbHtml = renderThumb(t.deck);
      return `
        <div class="tpl-card" data-tpl="${t.key}">
          <div class="tpl-thumb">
            <div class="scaler">${thumbHtml}</div>
          </div>
          <div class="tpl-info">
            <div class="tpl-title">${t.title}</div>
            <div class="tpl-desc">${t.desc}</div>
          </div>
        </div>
      `;
    })
    .join("");

  // 用户文档也可在此删除
  const userDocs = listDocs();
  const userCards = userDocs
    .map((d) => {
      const thumbHtml = d.thumb || "";
      return `
        <div class="doc-card" data-doc="${d.id}">
          <div class="doc-actions">
            <div class="doc-action-btn" data-act="rename" title="重命名">✏</div>
            <div class="doc-action-btn del" data-act="delete" title="删除">🗑</div>
          </div>
          <div class="doc-thumb">
            ${thumbHtml ? `<div class="scaler">${thumbHtml}</div>` : `<div class="doc-thumb-empty">📄</div>`}
          </div>
          <div class="doc-info">
            <div class="doc-title">${escapeHtml(d.title)}</div>
            <div class="doc-meta">
              <span>${d.pageCount} 页</span>
              <span class="dot"></span>
              <span>${timeAgo(d.modifiedAt)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  content.innerHTML = `
    <div class="content-h">
      <h2>模板库</h2>
      <span class="count">${builtIn.length} 个内置模板</span>
    </div>
    <div class="doc-grid">${builtInCards}</div>
    ${
      userDocs.length > 0
        ? `
      <div class="content-h" style="margin-top:28px">
        <h2>我的文档</h2>
        <span class="count">${userDocs.length} 个</span>
      </div>
      <div class="doc-grid">${userCards}</div>
    `
        : ""
    }
  `;

  // 绑定内置模板点击
  content.querySelectorAll<HTMLElement>(".tpl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const key = card.dataset.tpl!;
      const tpl = builtIn.find((t) => t.key === key)!;
      const deck = JSON.parse(JSON.stringify(tpl.deck)) as Deck;
      deck.meta.title = tpl.title + " · 副本";
      openDeckAsNewDoc(deck, tpl.title + " · 副本");
    });
  });

  // 绑定用户文档卡片事件
  content.querySelectorAll<HTMLElement>(".doc-card").forEach((card) => {
    const docId = card.dataset.doc!;
    card.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("[data-act]");
      if (act) {
        e.stopPropagation();
        const action = act.dataset.act;
        if (action === "rename") startRename(docId);
        else if (action === "delete") confirmDelete(docId);
        return;
      }
      openEditor(docId);
    });
  });
}

// ── 渲染：AI 用量 ──

const TYPE_LABEL: Record<string, string> = {
  generate: "生成整套",
  rewrite: "改这页",
  test: "测试连接",
  brief: "简报",
};

function fmtMs(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 格式化 token 数：1.2k / 3.4M，缺省显示 —。 */
function fmtTok(n?: number): string {
  if (n == null || n === 0) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function renderUsage(): void {
  const content = document.getElementById("content")!;
  const entries = getUsage().slice().reverse(); // 最新在前
  const s = summarizeUsage(entries.slice().reverse()); // 汇总用全量（正序）
  if (entries.length === 0) {
    content.innerHTML = `
      <div class="content-h"><h2>AI 用量</h2><span class="count">暂无记录</span></div>
      <div class="empty-state"><div class="icon">📊</div><div class="title">还没有 AI 使用记录</div>
      <div class="desc">在编辑器里生成 PPT、改写页面或测试连接后，这里会详细记录每次调用。</div></div>`;
    return;
  }
  const rows = entries
    .map(
      (e: UsageEntry) => `<tr>
        <td class="mono" style="white-space:nowrap">${fmtTime(e.t)}</td>
        <td><span class="utype utype-${e.type}">${TYPE_LABEL[e.type] || e.type}</span></td>
        <td>${escapeHtml(e.label || e.model || "—")}${e.model && e.label ? `<div class="sub">${escapeHtml(e.model)}</div>` : ""}</td>
        <td class="mono tok">${e.totalTokens ? fmtTok(e.totalTokens) : "—"}${e.totalTokens ? `<div class="sub">${fmtTok(e.promptTokens)}↑ ${fmtTok(e.completionTokens)}↓</div>` : ""}</td>
        <td class="mono">${escapeHtml((e.topic || "").slice(0, 24))}${e.topic && e.topic.length > 24 ? "…" : ""}</td>
        <td>${e.ok ? '<span class="ok">成功</span>' : '<span class="fail">失败</span>'}</td>
        <td class="mono">${e.pages ?? "—"}</td>
        <td class="mono">${e.retries ?? "—"}</td>
        <td class="mono">${fmtMs(e.ms)}</td>
      </tr>`,
    )
    .join("");
  const byModelHtml = s.byModel
    .map(
      (m) =>
        `<div class="um-row"><span>${escapeHtml(m.model)}</span><b>${m.count} 次 · 成功 ${m.ok}</b><i>${fmtTok(m.tokens)} tok</i></div>`,
    )
    .join("");
  content.innerHTML = `
    <style>
      .usage-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
      .ucard{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
      .ucard.tok{background:linear-gradient(135deg,#5b5ef0,#7c3aed 60%,#c026d3);border:none;color:#fff;box-shadow:0 6px 20px rgba(124,58,237,.28)}
      .ucard.tok .lbl,.ucard.tok .val,.ucard.tok .sub2{color:#fff}
      .ucard.tok .lbl{opacity:.8}
      .ucard .lbl{font-size:11px;color:var(--text-3);font-weight:600;letter-spacing:.5px}
      .ucard .val{font-size:26px;font-weight:800;margin-top:6px;color:var(--text)}
      .ucard .val small{font-size:13px;font-weight:500;color:var(--text-3)}
      .ucard .val.ok{color:#16a34a}.ucard .val.fail{color:#dc2626}
      .ucard .sub2{font-size:11px;color:var(--text-3);margin-top:5px}
      .usage-table{width:100%;border-collapse:collapse;font-size:13px;background:var(--panel);border:1px solid var(--border);border-radius:12px;overflow:hidden}
      .usage-table th{text-align:left;padding:11px 14px;background:#f6f5f2;font-size:11px;color:var(--text-3);font-weight:600;border-bottom:1px solid var(--border);position:sticky;top:0}
      .usage-table td{padding:9px 14px;border-bottom:1px solid var(--border);vertical-align:top}
      .usage-table tr:last-child td{border-bottom:none}
      .usage-table .sub{font-size:11px;color:var(--text-3)}
      .usage-table td.tok{font-weight:700;color:var(--accent,#5b5ef0)}
      .utype{font-size:11px;font-weight:600;padding:2px 8px;border-radius:5px}
      .utype-generate{background:#eef0fe;color:#2f54eb}.utype-rewrite{background:#fef3e8;color:#c2410c}
      .utype-test{background:#e7f6ec;color:#15803d}.utype-brief{background:#f5f3ff;color:#7c3aed}
      .ok{color:#16a34a;font-weight:600}.fail{color:#dc2626;font-weight:600}
      .usage-side{display:flex;gap:22px;margin-bottom:18px;flex-wrap:wrap}
      .usage-side h4{font-size:12px;color:var(--text-3);margin:0 0 8px;font-weight:600}
      .um-row{display:flex;gap:8px;font-size:13px;padding:4px 0}.um-row span{flex:1}.um-row b{color:var(--text)}.um-row i{font-style:normal;color:var(--text-3)}
      .usage-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
      .usage-clear{margin-left:auto;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer;color:var(--text-2)}
      .usage-clear:hover{border-color:#dc2626;color:#dc2626}
    </style>
    <div class="usage-head"><h2 style="margin:0">AI 用量</h2><span class="count">${entries.length} 次请求 · ${fmtTok(s.totalTokens)} token</span>
      <button class="usage-clear" id="usage-clear">🗑 清空记录</button></div>
    <div class="usage-cards">
      <div class="ucard tok"><div class="lbl">累计 Token</div><div class="val">${fmtTok(s.totalTokens)}</div><div class="sub2">输入 ${fmtTok(s.promptTokens)} · 输出 ${fmtTok(s.completionTokens)}</div></div>
      <div class="ucard"><div class="lbl">输入 Token</div><div class="val">${fmtTok(s.promptTokens)}</div></div>
      <div class="ucard"><div class="lbl">输出 Token</div><div class="val">${fmtTok(s.completionTokens)}</div></div>
      <div class="ucard"><div class="lbl">请求总数</div><div class="val">${s.total}<small> 次</small></div><div class="sub2">成功率 ${s.successRate}%</div></div>
    </div>
    <div class="usage-side">
      <div style="flex:1;min-width:200px"><h4>按类型</h4>
        ${Object.entries(s.byType)
          .map(([k, v]) => `<div class="um-row"><span>${TYPE_LABEL[k] || k}</span><b>${v} 次</b></div>`)
          .join("") || '<div class="um-row"><span>—</span></div>'}</div>
      <div style="flex:1;min-width:200px"><h4>按模型 · Token</h4>${byModelHtml || '<div class="um-row"><span>—</span></div>'}</div>
    </div>
    <table class="usage-table">
      <thead><tr><th>时间</th><th>类型</th><th>模型</th><th>Token</th><th>主题/指令</th><th>结果</th><th>页数</th><th>重试</th><th>耗时</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById("usage-clear")?.addEventListener("click", () => {
    if (confirm("清空全部 AI 用量记录？")) {
      clearUsage();
      renderUsage();
    }
  });
}

// ── 渲染：关于 ──

function renderAbout(): void {
  document.getElementById("content")!.innerHTML = `
    <div class="content-h"><h2>关于一幕</h2><span class="count">OneAct · v0.5</span></div>
    <div class="static-page">
      <div class="about-hero">
        <div class="about-hero-glow"></div>
        <div class="hero-logo"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5 L21.5 12 L12 21.5 L2.5 12 Z" fill="#fff" fill-opacity=".3"/><path d="M10 8 L17 12 L10 16 Z" fill="#fff"/></svg></div>
        <div class="about-hero-txt">
          <h3>一幕 OneAct</h3>
          <p>AI 原生的开放演示框架 · 让任何模型都能成为内容生产者</p>
          <div class="about-badges"><span>v0.5</span><span>Apache-2.0</span><span>TypeScript 单仓</span></div>
        </div>
      </div>

      <div class="sp-card">
        <h4>这是什么</h4>
        <p>一幕是一个「AI 原生」的演示（PPT）框架。核心理念是用一份<b>声明式的 JSON</b>描述整套幻灯片——
          <code>LLM → slides.json（组件树）→ 渲染引擎</code>。模型只写结构化数据，渲染、动画、校验、导出全部交给框架，
          从而绕开传统办公软件「封闭格式 + AI 难接入」的僵局。</p>
      </div>

      <div class="sp-card">
        <h4>核心能力</h4>
        <div class="sp-grid">
          <div class="sp-item"><span class="sp-ic">🧩</span><div><b>25 种元素</b><p>13 种基础 + 12 种复合语义组件（KPI、时间线、对比、流程……）</p></div></div>
          <div class="sp-item"><span class="sp-ic">🎨</span><div><b>12 套主题</b><p>换肤即时生效，颜色永不硬编码</p></div></div>
          <div class="sp-item"><span class="sp-ic">🤖</span><div><b>多 Agent 协作</b><p>导演→架构→内容→设计→校验，逐页生成 + 自愈</p></div></div>
          <div class="sp-item"><span class="sp-ic">✅</span><div><b>声明式校验</b><p>自动检测越界 / 重叠 / 字号，问题即时可见</p></div></div>
          <div class="sp-item"><span class="sp-ic">⬇</span><div><b>多格式导出</b><p>自包含 HTML 播放页、PPTX（自动降级）、.act 源文件</p></div></div>
          <div class="sp-item"><span class="sp-ic">🔌</span><div><b>开放协议</b><p>OpenAI / Anthropic / Gemini / 任意兼容端点</p></div></div>
        </div>
      </div>

      <div class="sp-card">
        <h4>技术栈</h4>
        <div class="pills">
          <span>@oneact/schema</span><span>@oneact/core</span><span>@oneact/components</span><span>@oneact/layouts</span><span>@oneact/ai</span><span>@oneact/orchestrator</span><span>@oneact/skills</span><span>@oneact/player</span><span>@oneact/exporter-deck</span><span>@oneact/exporter-pptx</span><span>@oneact/web</span>
        </div>
      </div>

      <div class="sp-card muted">
        <p>文档全部保存在你浏览器的 localStorage，<b>不上传任何服务器</b>。API Key 也仅存本地。</p>
      </div>
    </div>`;
}

// ── 渲染：帮助 ──

function renderHelp(): void {
  document.getElementById("content")!.innerHTML = `
    <div class="content-h"><h2>帮助中心</h2><span class="count">快速上手</span></div>
    <div class="static-page">
      <div class="steps">
        <div class="step"><div class="step-n">1</div><div class="step-body">
          <h4>新建一份演示</h4>
          <p>点击左侧<b>「新建演示」</b>创建空白文档；或在<b>「模板库」</b>选用内置模板（空白 / 一幕自荐 / 黄金测试集）。也可用<b>「导入 .act 文件」</b>打开本地 JSON。</p>
        </div></div>
        <div class="step"><div class="step-n">2</div><div class="step-body">
          <h4>用 AI 生成整套</h4>
          <p>编辑器顶部 <b>✦ AI → 生成整套</b>，输入主题（如「2026 年度总结」）。先出大纲，再逐页生成，每页就绪即在缩略图「长出来」。顶部<b>灵动岛</b>显示当前 Agent 与进度。</p>
          <p class="sp-note">⚠ 生成需先在主页 <b>⚙ AI 设置</b> 填写服务商、模型名与 API Key（仅存本地）。</p>
        </div></div>
        <div class="step"><div class="step-n">3</div><div class="step-body">
          <h4>编辑元素</h4>
          <div class="sp-list">
            <div><b>选中</b>：单击画布元素，出现选中框与缩放手柄。</div>
            <div><b>移动 / 缩放</b>：拖动移动；拖手柄缩放；方向键微调（Shift = 10px）。</div>
            <div><b>改文字</b>：双击原地编辑，Ctrl+Enter 或失焦提交，Esc 取消。</div>
            <div><b>右键菜单</b>：复制 / 粘贴 / 图层排列 / 删除。</div>
            <div><b>属性面板</b>：右侧精确修改位置、文本、颜色、动画。</div>
            <div><b>让 AI 改这一页</b>：右栏输入指令（如「换成饼图」），仅重写当前页。</div>
          </div>
        </div></div>
        <div class="step"><div class="step-n">4</div><div class="step-body">
          <h4>插入与排版</h4>
          <p>顶部<b>「插入」</b>选项卡：常用组件一键插入；更多组件与<b>智能组合块</b>（KPI 卡、流程、对比等）在下拉菜单。滚轮可横向滚动工具带。</p>
        </div></div>
        <div class="step"><div class="step-n">5</div><div class="step-body">
          <h4>导出与放映</h4>
          <p><b>「放映」</b>选项卡：全屏放映（← → 翻页，Esc/P 退出）；导出为<b>网页</b>（自包含，可离线）、<b>PPTX</b>（复杂效果自动降级）或 <b>.act</b>（源文件，可重新导入）。</p>
        </div></div>
      </div>

      <div class="sp-card">
        <h4>⌨ 快捷键</h4>
        <div class="kbd-grid">
          <div><kbd>Ctrl+Z</kbd><span>撤销</span></div><div><kbd>Ctrl+Shift+Z</kbd><span>重做</span></div>
          <div><kbd>Ctrl+C / V</kbd><span>复制 / 粘贴</span></div><div><kbd>Ctrl+D</kbd><span>复制元素</span></div>
          <div><kbd>Ctrl+] / [</kbd><span>上 / 下移一层</span></div><div><kbd>Ctrl+Shift+] / [</kbd><span>置顶 / 置底</span></div>
          <div><kbd>Delete</kbd><span>删除选中</span></div><div><kbd>方向键</kbd><span>微调位置</span></div>
        </div>
      </div>
      <div class="sp-card">
        <h4>出问题了？看日志</h4>
        <p>左侧<b>「查看日志」</b>打开诊断页。生成失败时重点看 <code>error</code> 级记录：</p>
        <div class="sp-list">
          <div><code>401 / 403</code> → Key 无权限或余额不足</div>
          <div><code>404</code> → 模型名写错</div>
          <div><code>Failed to fetch</code> / CORS → 服务商不允许浏览器直连，换支持跨域的端点或本地代理</div>
          <div><code>429</code> → 触发限流，稍后再试</div>
        </div>
        <p class="sp-note">开启「详细模式」后重新生成，错误信息会带上 HTTP 响应体，定位更精准。</p>
      </div>
      <div class="sp-card">
        <h4>🧩 Skill 管理</h4>
        <p>主页<b>「Skill 管理」</b>可导入自定义 skill（粘贴 Markdown 或选 <code>.md</code> 文件），导入后在编辑器「生成简报」里选用。格式：frontmatter（<code>id / name / description / dimension</code>，dimension 须为 <b>structure / style / domain</b>）+ 骨架 / 范例。</p>
        <div class="sp-list">
          <div><b>内置</b> skill 不可删除；<b>自定义</b> skill 可删除。</div>
          <div>所有 skill 均可<b>导出为 .md</b>。</div>
        </div>
      </div>
    </div>`;
}

// ── 渲染路由 ──

// ── 渲染：Skill 管理 ──

const SKILL_DIM_LABEL: Record<string, string> = { structure: "结构", style: "风格", domain: "行业" };

function renderSkills(): void {
  const content = $("content");
  const all = listAllSkills();
  const userIds = new Set(loadUserSkills().map((s) => s.id));
  const sections = (["structure", "style", "domain"] as const)
    .map((dim) => {
      const skills = all.filter((s) => s.dimension === dim);
      const cards = skills
        .map((s) => {
          const isUser = userIds.has(s.id);
          return `<div class="sk-card${isUser ? "" : " builtin"}" data-id="${s.id}">
            <div class="sk-card-h"><span class="sk-nm">${escapeHtml(s.name)}</span>${isUser ? "" : '<span class="sk-bi">内置</span>'}</div>
            <div class="sk-desc">${escapeHtml(s.description)}</div>
            <div class="sk-card-a">
              <button class="sort-btn sk-export" data-id="${s.id}">⬇ 导出</button>
              ${isUser ? `<button class="sort-btn sk-del" data-id="${s.id}" style="color:var(--err);border-color:#f3c4c4">🗑 删除</button>` : ""}
            </div>
          </div>`;
        })
        .join("");
      return `<div class="content-h" style="margin-top:20px"><h3 style="font-size:15px;font-weight:700">${SKILL_DIM_LABEL[dim]}</h3><span class="count">${skills.length}</span></div>
        <div class="sk-grid">${cards}</div>`;
    })
    .join("");

  content.innerHTML = `
    <div class="content-h"><h2>Skill 管理</h2><span class="count">${all.length} 个</span></div>
    <div class="sp-card">
      <h4>导入 Skill</h4>
      <textarea id="sk-ta" class="sk-ta" placeholder="---\nid: my-skill\nname: 我的技能\ndescription: 一句话说明\ndimension: structure\n---\n## 骨架\ncover: 标题\n## 范例\n..."></textarea>
      <div style="display:flex;gap:10px;align-items:center;margin-top:11px;flex-wrap:wrap">
        <button class="btn save" id="sk-import">📥 导入</button>
        <input type="file" id="sk-file" accept=".md,.txt" style="font-size:12px">
      </div>
    </div>
    ${sections}`;

  const ta = $("sk-ta") as HTMLTextAreaElement;
  const doImport = (text: string): void => {
    try {
      const sk = parseFrontmatter(text);
      addUserSkill(sk);
      showToast(`已导入 skill：${sk.name}`);
      renderSkills();
    } catch (e) {
      showToast("导入失败：" + (e as Error).message);
    }
  };
  $("sk-import").addEventListener("click", () => {
    const v = ta.value.trim();
    if (v) doImport(v);
  });
  ($("sk-file") as HTMLInputElement).addEventListener("change", () => {
    const inp = $("sk-file") as HTMLInputElement;
    const f = inp.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => doImport(String(r.result ?? ""));
    r.readAsText(f);
    inp.value = "";
  });
  content.querySelectorAll<HTMLElement>(".sk-del").forEach((b) =>
    b.addEventListener("click", () => {
      deleteUserSkill(b.dataset.id!);
      showToast("已删除 skill");
      renderSkills();
    }),
  );
  content.querySelectorAll<HTMLElement>(".sk-export").forEach((b) =>
    b.addEventListener("click", () => {
      const s = all.find((x) => x.id === b.dataset.id);
      if (!s) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([serializeSkill(s)], { type: "text/markdown" }));
      a.download = `${s.id}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    }),
  );
}

function render(): void {
  if (currentView === "recent") renderRecent();
  else if (currentView === "templates") renderTemplates();
  else if (currentView === "skills") renderSkills();
  else if (currentView === "about") renderAbout();
  else if (currentView === "help") renderHelp();
  else renderUsage();
  requestAnimationFrame(fitThumbs);
}

/** 按各自容器宽度自适应缩略图缩放，避免固定 scale 导致的右侧留白 / 不居中。 */
function fitThumbs(): void {
  document.querySelectorAll<HTMLElement>(".doc-thumb .scaler, .tpl-thumb .scaler").forEach((scaler) => {
    const parent = scaler.parentElement;
    if (!parent?.clientWidth) return;
    scaler.style.transform = `scale(${parent.clientWidth / 1280})`;
  });
}

// ── 重命名 ──

let renameId: string | null = null;

function startRename(docId: string): void {
  const docs = listDocs();
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return;
  renameId = docId;
  const modal = $("rename-modal");
  const input = $("rename-input") as HTMLInputElement;
  input.value = doc.title;
  modal.classList.remove("hidden");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

function confirmRename(): void {
  if (!renameId) return;
  const input = $("rename-input") as HTMLInputElement;
  const title = input.value.trim() || "未命名演示";
  renameDoc(renameId, title);
  renameId = null;
  $("rename-modal").classList.add("hidden");
  render();
  showToast("已重命名");
}

function cancelRename(): void {
  renameId = null;
  $("rename-modal").classList.add("hidden");
}

// ── 删除 ──

let deleteId: string | null = null;

function confirmDelete(docId: string): void {
  const docs = listDocs();
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return;
  deleteId = docId;
  const modal = $("delete-modal");
  const msg = $("delete-msg");
  msg.textContent = `确定删除「${doc.title}」吗？此操作不可撤销。`;
  modal.classList.remove("hidden");
}

function doDelete(): void {
  if (!deleteId) return;
  deleteDoc(deleteId);
  deleteId = null;
  $("delete-modal").classList.add("hidden");
  render();
  showToast("已删除");
}

function cancelDelete(): void {
  deleteId = null;
  $("delete-modal").classList.add("hidden");
}

// ── 导入文件 ──

function importFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const deck = JSON.parse(reader.result as string) as Deck;
      if (!deck.pages || !deck.meta) throw new Error("格式不正确");
      const migrated = migrate(deck).deck;
      openDeckAsNewDoc(migrated, deck.meta.title ?? "导入的演示");
    } catch (e) {
      showToast("导入失败：" + (e as Error).message);
    }
  };
  reader.readAsText(file);
}

// ── 初始化 ──

function main(): void {
  // 注入运行时 CSS（缩略图需要）
  const styleId = "oneact-runtime-css";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = runtimeCss();
    document.head.appendChild(style);
  }

  // 新建按钮
  $("new-blank").addEventListener("click", () => {
    const deck = createBlankDeck();
    openDeckAsNewDoc(deck);
  });

  // 侧栏导航
  document.querySelectorAll<HTMLElement>(".nav-item[data-view]").forEach((item) => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach((x) => x.classList.remove("on"));
      item.classList.add("on");
      currentView = item.dataset.view as "recent" | "templates" | "usage" | "about" | "help";
      batchMode = false;
      selectedDocs.clear();
      render();
    });
  });

  // 快捷操作
  document.querySelectorAll<HTMLElement>(".nav-item[data-action]").forEach((item) => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      if (action === "import") {
        ($("file-input") as HTMLInputElement).click();
      } else if (action === "open-sample") {
        const sampleDeck = JSON.parse(__SAMPLE_DECK__) as Deck;
        openDeckAsNewDoc(JSON.parse(JSON.stringify(sampleDeck)), "一幕自荐 · 副本");
      } else if (action === "open-logs") {
        // 打开日志页。走 http（serve.mjs）时与编辑器共享 localStorage，可看到生成日志；
        // 双击 file:// 打开时各文件 localStorage 隔离，此处仅显示本页记录。
        window.open("log.html", "_blank");
      } else if (action === "settings") {
        // 全局 AI 供应商设置（弹窗）。集中配置，不必进入单个 PPT 里设置——符合「设置应在全局」的设计规范。
        openProvidersModal();
      }
    });
  });

  // 文件导入
  $("file-input").addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) importFile(input.files[0]);
    input.value = "";
  });

  // 搜索
  $("search-input").addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value.trim();
    if (currentView === "recent") render();
  });

  // 重命名弹窗
  $("rename-cancel").addEventListener("click", cancelRename);
  $("rename-confirm").addEventListener("click", confirmRename);
  $("rename-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmRename();
    else if (e.key === "Escape") cancelRename();
  });
  $("rename-modal").addEventListener("click", (e) => {
    if (e.target === $("rename-modal")) cancelRename();
  });

  // 删除弹窗
  $("delete-cancel").addEventListener("click", cancelDelete);
  $("delete-confirm").addEventListener("click", doDelete);
  $("delete-modal").addEventListener("click", (e) => {
    if (e.target === $("delete-modal")) cancelDelete();
  });

  window.addEventListener("resize", fitThumbs);
  render();
}

main();
