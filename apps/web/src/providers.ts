/**
 * @oneact/web — 多供应商管理（providers.ts）
 *
 * 取代旧的单供应商配置（oneact-ai-config）。支持配置任意多个 AI 供应商，每个独立「启用/停用」，
 * 并指定一个「默认」。生成 / 改写 / 测试使用「默认且启用」的供应商；都没有则回退第一个启用的。
 *
 * 存储：localStorage key = oneact-ai-providers（数组）。首次加载自动迁移旧 oneact-ai-config。
 */
import { createProvider } from "@oneact/ai";
import type { ChatMessage, GenerateOptions, LLMProvider, TokenUsage } from "@oneact/ai";
import { logInfo, logError } from "./logger.js";
import { recordUsage } from "./usage.js";

export type ProviderKind = "openai" | "openai-compatible" | "anthropic" | "gemini";

export interface ProviderEntry {
  id: string;
  /** 显示名（如「通义千问」「DeepSeek」） */
  label: string;
  kind: ProviderKind;
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** 启用/停用开关 */
  enabled: boolean;
  /** 是否默认（生成时优先用） */
  isDefault: boolean;
}

const KEY = "oneact-ai-providers";
const OLD_KEY = "oneact-ai-config";

function uid(): string {
  return "p_" + Math.random().toString(36).slice(2, 9);
}

function defaultLabel(kind: ProviderKind): string {
  switch (kind) {
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    case "openai":
      return "OpenAI";
    default:
      return "OpenAI 兼容";
  }
}

/** 读取全部供应商（首次自动迁移旧单配置）。 */
export function loadProviders(): ProviderEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    /* fall through */
  }
  // 迁移旧的单供应商配置
  try {
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || "null");
    if (old?.apiKey && old.model) {
      const e: ProviderEntry = {
        id: uid(),
        label: defaultLabel(old.kind ?? "openai-compatible"),
        kind: old.kind ?? "openai-compatible",
        model: old.model,
        apiKey: old.apiKey,
        baseUrl: old.baseUrl,
        enabled: true,
        isDefault: true,
      };
      saveProviders([e]);
      return [e];
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** 保存（保证恰好一个默认）。 */
export function saveProviders(list: ProviderEntry[]): void {
  const enabled = list.filter((p) => p.enabled);
  const defs = list.filter((p) => p.isDefault);
  // 默认必须是启用的；若默认未启用或无默认，取第一个启用的
  let def = defs.find((p) => p.enabled);
  if (!def) def = enabled[0];
  list.forEach((p) => (p.isDefault = !!def && p.id === def.id));
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 配额满等：静默 */
  }
}

/** 当前生效的供应商：默认且启用 → 否则第一个启用 → 否则 null。 */
export function getActiveProvider(): ProviderEntry | null {
  const list = loadProviders();
  return list.find((p) => p.isDefault && p.enabled) || list.find((p) => p.enabled) || null;
}

/** 供 createProvider 使用：返回活跃供应商的配置。 */
export function activeConfig(): { kind: ProviderKind; apiKey: string; model: string; baseUrl?: string } | null {
  const p = getActiveProvider();
  return p ? { kind: p.kind, apiKey: p.apiKey, model: p.model, baseUrl: p.baseUrl } : null;
}

export interface RecordingCtx {
  type: "generate" | "rewrite" | "test";
  /** 主题（生成）或指令（改这页），用于用量页展示 */
  topic?: string;
  /** 供应商显示名 */
  label?: string;
}

/**
 * 包装 provider：每次 generate 调用都**即时**记录一条用量（含真实 token），
 * 而不是等整次生成/重写结束才记一条聚合记录。
 * 这样用量页能看到每一次 AI 请求，长任务中也能实时看到进度与 token 消耗。
 * 失败的调用也会被记录（ok:false + error）。
 */
export function createRecordingProvider(
  config: { kind: ProviderKind; apiKey: string; model: string; baseUrl?: string },
  ctx: RecordingCtx,
): LLMProvider {
  const inner = createProvider(config);
  return {
    config: inner.config,
    generate: async (messages: ChatMessage[], opts?: GenerateOptions) => {
      let usage: TokenUsage | undefined;
      const t0 = performance.now();
      try {
        const text = await inner.generate(messages, { ...opts, onUsage: (u: TokenUsage) => { usage = u; } });
        recordUsage({
          type: ctx.type,
          model: config.model,
          kind: config.kind,
          label: ctx.label,
          topic: ctx.topic,
          ok: true,
          ms: Math.round(performance.now() - t0),
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
        });
        return text;
      } catch (e) {
        recordUsage({
          type: ctx.type,
          model: config.model,
          kind: config.kind,
          label: ctx.label,
          topic: ctx.topic,
          ok: false,
          ms: Math.round(performance.now() - t0),
          error: (e as Error).message,
        });
        throw e;
      }
    },
  };
}

// ──────────────────────────────── 模态 UI（自包含）────────────────────────────────

const STYLE_ID = "providers-style";
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.pv-overlay{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;animation:pvIn .18s ease}
@keyframes pvIn{from{opacity:0}to{opacity:1}}
.pv-modal{background:#fff;border-radius:16px;width:100%;max-width:620px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.3)}
.pv-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #eee}
.pv-head .mk{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;display:grid;place-items:center;font-size:17px;flex:none}
.pv-head h3{margin:0;font-size:16px;font-weight:700}
.pv-head .sub{font-size:11px;color:#999;margin-top:2px}
.pv-head .close{margin-left:auto;cursor:pointer;color:#999;font-size:22px;width:30px;height:30px;display:grid;place-items:center;border-radius:8px}
.pv-head .close:hover{background:#f3f3f3}
.pv-body{padding:16px 20px;overflow:auto;flex:1;min-height:0}
.pv-list{display:flex;flex-direction:column;gap:10px}
.pv-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #e7e7eb;border-radius:12px;background:#fafafa;transition:border-color .12s}
.pv-row.active{border-color:#4f46e5;background:#f5f4ff}
.pv-row.disabled{opacity:.55}
.pv-toggle{width:38px;height:22px;border-radius:999px;background:#d8d8de;position:relative;cursor:pointer;flex:none;transition:background .15s}
.pv-toggle.on{background:#22c55e}
.pv-toggle i{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}
.pv-toggle.on i{left:18px}
.pv-meta{flex:1;min-width:0}
.pv-meta .name{font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:7px}
.pv-meta .name .active-tag{font-size:9.5px;font-weight:700;color:#fff;background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:1px 7px;border-radius:999px}
.pv-meta .sub{font-size:11.5px;color:#888;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-kind{font-size:10px;color:#666;background:#eeeaf6;padding:2px 7px;border-radius:5px;flex:none}
.pv-def{display:flex;align-items:center;gap:4px;font-size:11px;color:#888;cursor:pointer;user-select:none;flex:none}
.pv-def i{width:14px;height:14px;border-radius:50%;border:2px solid #bbb;display:inline-block}
.pv-def.on i{border-color:#4f46e5;background:radial-gradient(#4f46e5 40%,#fff 45%)}
.pv-iconbtn{flex:none;width:30px;height:30px;border-radius:8px;border:1px solid #e0e0e6;background:#fff;cursor:pointer;font-size:14px;color:#666;display:grid;place-items:center}
.pv-iconbtn:hover{border-color:#4f46e5;color:#4f46e5}
.pv-iconbtn.del:hover{border-color:#ef4444;color:#ef4444}
.pv-add{margin-top:14px;width:100%;padding:11px;border:1.5px dashed #cfd0d8;border-radius:12px;background:transparent;color:#666;font-size:13px;cursor:pointer;font-weight:500}
.pv-add:hover{border-color:#4f46e5;color:#4f46e5;background:#f6f5ff}
.pv-empty{text-align:center;color:#aaa;padding:30px 10px;font-size:13px}
.pv-field{margin-top:12px}
.pv-field:first-child{margin-top:0}
.pv-field label{display:block;font-size:11px;color:#777;margin-bottom:5px;font-weight:600}
.pv-field input,.pv-field select{width:100%;border:1px solid #ddd;border-radius:9px;padding:9px 11px;font:inherit;font-size:13px;outline:none;box-sizing:border-box}
.pv-field input:focus,.pv-field select:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.pv-keyrow{display:flex;gap:8px}
.pv-keyrow input{flex:1}
.pv-eye{flex:none;width:40px;border:1px solid #ddd;background:#f5f5f7;border-radius:9px;cursor:pointer;font-size:15px;color:#777}
.pv-eye:hover{border-color:#4f46e5;color:#4f46e5}
.pv-test{margin-top:14px;padding:12px;border:1px dashed #e0e0e6;border-radius:10px;background:#fafafa}
.pv-test .row{display:flex;gap:8px;align-items:center}
.pv-testbtn{border:1px solid #ddd;background:#fff;border-radius:9px;padding:8px 14px;cursor:pointer;font-size:12.5px;color:#555;font-weight:500}
.pv-testbtn:hover{border-color:#4f46e5;color:#4f46e5}
.pv-testbtn:disabled{opacity:.5}
.pv-testres{font-size:11.5px;margin-top:8px;padding:7px 10px;border-radius:7px;line-height:1.5}
.pv-testres.idle{color:#999}
.pv-testres.loading{color:#4f46e5;background:#eef0fe}
.pv-testres.ok{color:#15803d;background:#e7f6ec}
.pv-testres.err{color:#dc2626;background:#fdeaea}
.pv-testres code{font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all}
.pv-foot{display:flex;gap:10px;padding:14px 20px;border-top:1px solid #eee;background:#fff}
.pv-foot .sp{flex:1}
.pv-btn{border:none;border-radius:10px;padding:10px 18px;font-size:13.5px;cursor:pointer;font-weight:600;font-family:inherit}
.pv-btn.ghost{background:#f0f0f3;color:#666}
.pv-btn.save{background:#111;color:#fff}
.pv-btn:disabled{opacity:.5}
`;
  document.head.appendChild(s);
}

function maskKey(k: string): string {
  return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "(空)";
}

export function openProvidersModal(): void {
  injectStyle();
  let providers = loadProviders();

  const overlay = document.createElement("div");
  overlay.className = "pv-overlay";
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  // ── 列表视图 ──
  function renderList(): void {
    const activeId = getActiveProvider()?.id;
    overlay.querySelector(".pv-modal")?.remove();
    const modal = document.createElement("div");
    modal.className = "pv-modal";
    modal.innerHTML = `
      <div class="pv-head">
        <div class="mk">✦</div>
        <div><h3>配置 AI 供应商</h3><div class="sub">可配置多个，各自启用/停用；生成使用「默认且启用」的那个</div></div>
        <div class="close" title="关闭">×</div>
      </div>
      <div class="pv-body">
        <div class="pv-list"></div>
        <button class="pv-add">＋ 新增供应商</button>
      </div>`;
    overlay.appendChild(modal);
    modal.querySelector(".close")!.addEventListener("click", close);
    overlay.addEventListener(
      "mousedown",
      (e) => {
        if (e.target === overlay) close();
      },
      { once: true },
    );

    const listEl = modal.querySelector(".pv-list")!;
    if (providers.length === 0) {
      listEl.innerHTML = `<div class="pv-empty">还没有供应商，点下方「新增供应商」开始配置。</div>`;
    }
    providers.forEach((p) => {
      const row = document.createElement("div");
      row.className = "pv-row" + (p.id === activeId ? " active" : "") + (p.enabled ? "" : " disabled");
      row.innerHTML = `
        <div class="pv-toggle ${p.enabled ? "on" : ""}" data-act="toggle" title="${p.enabled ? "已启用" : "已停用"}"><i></i></div>
        <div class="pv-meta">
          <div class="name">${esc(p.label || "未命名")} ${p.id === activeId ? '<span class="active-tag">使用中</span>' : ""}</div>
          <div class="pv-sub">${esc(p.model)}${p.baseUrl ? " · " + esc(p.baseUrl) : ""} · key ${maskKey(p.apiKey)}</div>
        </div>
        <span class="pv-kind">${esc(p.kind)}</span>
        <label class="pv-def ${p.isDefault ? "on" : ""}" data-act="def" title="设为默认（生成时优先使用）"><i></i>默认</label>
        <button class="pv-iconbtn" data-act="edit" title="编辑">✎</button>
        <button class="pv-iconbtn del" data-act="del" title="删除">🗑</button>`;
      row.querySelectorAll<HTMLElement>("[data-act]").forEach((el) =>
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const act = el.dataset.act;
          const target = providers.find((x) => x.id === p.id);
          if (!target) return;
          if (act === "toggle") {
            target.enabled = !target.enabled;
            saveProviders(providers);
            renderList();
          } else if (act === "def") {
            providers.forEach((x) => (x.isDefault = x.id === p.id));
            // 设为默认时自动启用
            target.enabled = true;
            saveProviders(providers);
            renderList();
          } else if (act === "edit") {
            renderEdit(target);
          } else if (act === "del") {
            if (confirm(`删除供应商「${target.label || target.model}」？`)) {
              providers = providers.filter((x) => x.id !== p.id);
              saveProviders(providers);
              renderList();
            }
          }
        }),
      );
      listEl.appendChild(row);
    });

    modal.querySelector(".pv-add")!.addEventListener("click", () => {
      renderEdit({ id: uid(), label: "", kind: "openai-compatible", model: "", apiKey: "", baseUrl: undefined, enabled: true, isDefault: providers.length === 0 });
    });
  }

  // ── 编辑视图 ──
  function renderEdit(entry: ProviderEntry): void {
    overlay.querySelector(".pv-modal")?.remove();
    const modal = document.createElement("div");
    modal.className = "pv-modal";
    const isNew = !providers.some((p) => p.id === entry.id);
    modal.innerHTML = `
      <div class="pv-head">
        <div class="mk">✎</div>
        <div><h3>${isNew ? "新增供应商" : "编辑供应商"}</h3><div class="sub">API Key 仅存本地浏览器</div></div>
        <div class="close" title="关闭">×</div>
      </div>
      <div class="pv-body">
        <div class="pv-field"><label>显示名（便于区分）</label><input id="pv-label" placeholder="如：通义千问 / DeepSeek / GPT" value="${esc(entry.label)}"></div>
        <div class="pv-field"><label>服务商</label><select id="pv-kind">
          <option value="openai-compatible">openai-compatible（OpenAI 兼容 / 国产 / Ollama）</option>
          <option value="openai">openai</option>
          <option value="anthropic">anthropic</option>
          <option value="gemini">gemini</option>
        </select></div>
        <div class="pv-field"><label>模型 Model</label><input id="pv-model" placeholder="qwen-plus / deepseek-chat / gpt-4o-mini" value="${esc(entry.model)}"></div>
        <div class="pv-field"><label>API Key</label><div class="pv-keyrow"><input id="pv-key" type="password" placeholder="sk-..." value="${esc(entry.apiKey)}"><button type="button" class="pv-eye" id="pv-eye" title="显示/隐藏">👁</button></div></div>
        <div class="pv-field"><label>Base URL（可选，OpenAI 兼容端点）</label><input id="pv-base" placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" value="${esc(entry.baseUrl ?? "")}"></div>
        <div class="pv-test">
          <div class="row"><button type="button" class="pv-testbtn" id="pv-test">🔌 测试此供应商</button></div>
          <div class="pv-testres idle" id="pv-testres">填好后点此验证该供应商是否可用</div>
        </div>
      </div>
      <div class="pv-foot"><div class="sp"></div><button class="pv-btn ghost" id="pv-cancel">取消</button><button class="pv-btn save" id="pv-save">保存</button></div>`;
    overlay.appendChild(modal);
    const kindSel = modal.querySelector("#pv-kind")!;
    kindSel.value = entry.kind;
    modal.querySelector(".close")!.addEventListener("click", close);
    modal.querySelector("#pv-cancel")!.addEventListener("click", () => renderList());
    (modal.querySelector("#pv-eye")!).addEventListener("click", () => {
      const inp = modal.querySelector("#pv-key")!;
      inp.type = inp.type === "password" ? "text" : "password";
    });

    const readForm = (): ProviderEntry => ({
      id: entry.id,
      label: (modal.querySelector("#pv-label")!).value.trim() || defaultLabel(kindSel.value as ProviderKind),
      kind: kindSel.value as ProviderKind,
      model: (modal.querySelector("#pv-model")!).value.trim(),
      apiKey: (modal.querySelector("#pv-key")!).value.trim(),
      baseUrl: (modal.querySelector("#pv-base")!).value.trim() || undefined,
      enabled: entry.enabled,
      isDefault: entry.isDefault,
    });

    // 测试此供应商（用表单当前值，不保存）
    modal.querySelector("#pv-test")!.addEventListener("click", async () => {
      const f = readForm();
      const res = modal.querySelector("#pv-testres")!;
      const btn = modal.querySelector("#pv-test");
      if (!f.model || !f.apiKey) {
        res.className = "pv-testres err";
        res.textContent = "请先填写模型名和 API Key";
        return;
      }
      if (btn) btn.disabled = true;
      res.className = "pv-testres loading";
      res.textContent = "正在连接测试…";
      const t0 = performance.now();
      logInfo("api", "测试供应商", { label: f.label, kind: f.kind, model: f.model, baseUrl: f.baseUrl, apiKey: maskKey(f.apiKey) });
      try {
        const reply = await createProvider({ kind: f.kind, apiKey: f.apiKey, model: f.model, baseUrl: f.baseUrl }).generate(
          [{ role: "user", content: "请只回复两个字符：OK" }],
          { maxTokens: 16, temperature: 0 },
        );
        const ms = Math.round(performance.now() - t0);
        const sample = (reply || "").trim().slice(0, 48) || "（空回复）";
        logInfo("api", "供应商测试成功", { label: f.label, model: f.model, ms });
        recordUsage({ type: "test", model: f.model, kind: f.kind, label: f.label, ok: true, ms });
        res.className = "pv-testres ok";
        res.innerHTML = `✓ 连接成功 · <code>${esc(f.model)}</code> · ${ms}ms<br>回复：${esc(sample)}`;
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        logError("api", "供应商测试失败", { label: f.label, model: f.model, ms }, e);
        recordUsage({ type: "test", model: f.model, kind: f.kind, label: f.label, ok: false, ms, error: (e as Error).message });
        res.className = "pv-testres err";
        res.innerHTML = `✕ 失败（${ms}ms）· <code>${esc((e as Error).message || String(e))}</code>`;
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // 保存
    modal.querySelector("#pv-save")!.addEventListener("click", () => {
      const f = readForm();
      if (!f.model || !f.apiKey) {
        (modal.querySelector("#pv-model")!).focus();
        return;
      }
      const idx = providers.findIndex((p) => p.id === f.id);
      if (idx >= 0) providers[idx] = f;
      else providers.push(f);
      saveProviders(providers);
      renderList();
    });
  }

  renderList();
}

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
