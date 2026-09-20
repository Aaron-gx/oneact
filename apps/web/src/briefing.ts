/**
 * @oneact/web — 灵动岛式需求澄清面板（WS3）
 *
 * 生成前的「策划导演」入口。两种形态可切换：
 *   · 默认：分步问卷（主题/受众/目的/风格/长度/要点）→ 实时预览简报 → 「✦ AI 生成创意简报」或「直接生成」
 *   · 对话模式：与 AI 多轮对话微调简报（reviseBriefWithAi）
 * 确认后产出 Brief，交给 runGenerateDeck 驱动 brief→大纲→逐页生成。
 */
import {
  applySkill,
  buildBriefFromAnswers,
  draftBriefWithAi,
  reviseBriefWithAi,
  moodLabel,
  type Brief,
  type BriefAnswers,
  type Mood,
} from "@oneact/ai";
import { createProvider } from "@oneact/ai";
import { composeSkills, type ComposedSkill, type Skill } from "@oneact/skills";
import { loadAiConfig } from "./editor.js";
import { listAllSkills } from "./skill-store.js";

const AUDIENCES = ["学生", "职场人士", "学术评审", "客户/投资人", "公众", "技术同行", "管理层"];
const PURPOSES = ["工作汇报", "教学/培训", "产品路演", "项目总结", "科普分享", "方案评审"];
const MOODS: { k: Mood | "auto"; label: string }[] = [
  { k: "auto", label: "✦ AI 智选" },
  { k: "tech", label: "科技深色" },
  { k: "business", label: "商务蓝" },
  { k: "academic", label: "学术墨绿" },
  { k: "vibrant", label: "活力暖橙" },
  { k: "elegant", label: "极光紫" },
  { k: "traditional", label: "赤金中国风" },
  { k: "nature", label: "森林青" },
  { k: "ocean", label: "深海蓝" },
  { k: "medical", label: "医疗薄荷" },
  { k: "minimal", label: "极简灰" },
  { k: "sunset", label: "日落" },
  { k: "sakura", label: "樱粉" },
];
const LENGTHS: { k: NonNullable<BriefAnswers["length"]>; label: string }[] = [
  { k: "auto", label: "自动" },
  { k: "short", label: "精简 · 6-8 页" },
  { k: "standard", label: "标准 · 10-12 页" },
  { k: "detailed", label: "详尽 · 14-18 页" },
];

const STYLE_ID = "briefing-style";
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.bf-overlay{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;animation:bfIn .18s ease}
@keyframes bfIn{from{opacity:0}to{opacity:1}}
.bf-modal{background:#fff;border-radius:16px;width:100%;max-width:920px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.3)}
.bf-head{display:flex;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid #eee;font-size:16px;font-weight:700}
.bf-head .mk{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#4f46e5,#7c3aed);display:grid;place-items:center;color:#fff;font-size:14px}
.bf-head .close{margin-left:auto;cursor:pointer;color:#999;font-size:20px;width:30px;height:30px;display:grid;place-items:center;border-radius:8px}
.bf-head .close:hover{background:#f3f3f3}
.bf-body{display:flex;gap:0;overflow:auto;flex:1;min-height:0}
.bf-form{flex:1.3;padding:20px 22px;border-right:1px solid #f0f0f0;min-width:0}
.bf-side{flex:1;padding:20px 22px;background:#fafafb;display:flex;flex-direction:column;gap:14px;min-width:0}
.bf-sec{margin-bottom:16px}
.bf-sec label{display:block;font-size:12px;font-weight:600;color:#666;margin-bottom:7px;letter-spacing:.02em}
.bf-sec label .hint{font-weight:400;color:#aaa;margin-left:6px}
.bf-topic{width:100%;border:1px solid #ddd;border-radius:10px;padding:11px 14px;font-size:15px;outline:none}
.bf-topic:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.bf-chips{display:flex;flex-wrap:wrap;gap:7px}
.bf-chip{padding:6px 13px;border-radius:999px;border:1px solid #ddd;background:#fff;font-size:13px;cursor:pointer;color:#444;transition:all .12s}
.bf-chip:hover{border-color:#4f46e5}
.bf-chip.on{background:#4f46e5;border-color:#4f46e5;color:#fff}
.bf-points{display:flex;gap:8px;margin-bottom:8px}
.bf-points input{flex:1;border:1px solid #ddd;border-radius:10px;padding:9px 12px;font-size:13px;outline:none}
.bf-points button{border:none;background:#4f46e5;color:#fff;border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px}
.bf-ptlist{display:flex;flex-direction:column;gap:5px}
.bf-pt{display:flex;align-items:center;gap:8px;font-size:13px;color:#444;background:#f6f5f2;padding:7px 10px;border-radius:8px}
.bf-pt .del{margin-left:auto;cursor:pointer;color:#c00;font-size:15px}
.bf-preview{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px}
.bf-preview h4{margin:0 0 4px;font-size:15px}
.bf-preview .sub{font-size:12px;color:#999;margin-bottom:12px}
.bf-pvrow{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-top:1px dashed #eee}
.bf-pvrow b{color:#4f46e5}
.bf-pvstruct{font-size:12px;color:#777;line-height:1.7;margin-top:8px}
.bf-chat{display:flex;flex-direction:column;gap:8px;max-height:200px;overflow:auto}
.bf-msg{font-size:13px;padding:8px 11px;border-radius:10px;max-width:88%}
.bf-msg.ai{background:#eef0fe;align-self:flex-start}
.bf-msg.me{background:#4f46e5;color:#fff;align-self:flex-end}
.bf-chatinput{display:flex;gap:8px}
.bf-chatinput input{flex:1;border:1px solid #ddd;border-radius:10px;padding:9px 12px;font-size:13px;outline:none}
.bf-chatinput button{border:none;background:#7c3aed;color:#fff;border-radius:10px;padding:0 14px;cursor:pointer;font-size:13px}
.bf-foot{display:flex;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid #eee;background:#fff}
.bf-foot .sp{flex:1}
.bf-btn{border:none;border-radius:10px;padding:10px 18px;font-size:14px;cursor:pointer;font-weight:600}
.bf-btn.ghost{background:#f3f3f3;color:#555}
.bf-btn.ai{background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff}
.bf-btn.go{background:#111;color:#fff}
.bf-btn:disabled{opacity:.5;cursor:default}
.bf-aihint{font-size:11px;color:#999}
.bf-skilldim{font-size:11px;color:#999;margin:7px 0 4px}
.bf-skmgr{margin-top:10px;border:1px dashed #c7c5e0;background:#f6f5ff;color:#4f46e5;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer}
.bf-skmgr:hover{background:#eef0fe}
@media(max-width:720px){.bf-body{flex-direction:column}.bf-form{border-right:none;border-bottom:1px solid #f0f0f0}.bf-side{background:#fff}}
`;
  document.head.appendChild(s);
}

export interface BriefingOptions {
  topic?: string;
  onConfirm: (brief: Brief, skills?: ComposedSkill) => void;
  onCancel?: () => void;
}

export function openBriefing(opts: BriefingOptions): void {
  injectStyle();
  const answers: BriefAnswers = { topic: opts.topic ?? "", mood: "auto", length: "auto", points: [] };
  let brief: Brief = buildBriefFromAnswers(answers);
  let chatMode = false;
  /** 用户选定的 skill（每维至多一个 id；undefined = 不约束）。 */
  const skillSel: { structure?: string; style?: string; domain?: string } = {};
  /** 当前 compose 结果（onConfirm 时透传给生成层，注入 buildSpec §12）。 */
  let pendingComposed: ComposedSkill | undefined;
  const allSkills: Skill[] = listAllSkills();
  /** topic 关键词自动推荐的 skill（每维度至多一个 id；仅 UI 提示，不自动选）。 */
  let recommended: { structure?: string; style?: string; domain?: string } = {};
  const chatMsgs: { role: "ai" | "me"; text: string }[] = [];

  const overlay = document.createElement("div");
  overlay.className = "bf-overlay";
  const hasAi = () => {
    const c = loadAiConfig();
    return !!(c && c.apiKey && c.model);
  };
  const provider = () => {
    const c = loadAiConfig();
    if (!c) return null;
    return createProvider({ kind: c.kind, apiKey: c.apiKey, model: c.model, baseUrl: c.baseUrl });
  };

  overlay.innerHTML = `
    <div class="bf-modal">
      <div class="bf-head"><span class="mk">✦</span> AI 制作演示 <span style="font-weight:400;color:#999;font-size:13px">· 策划导演</span><span class="close" title="关闭">×</span></div>
      <div class="bf-body">
        <div class="bf-form">
          <div class="bf-sec"><label>演示主题</label><input class="bf-topic" placeholder="例：Python 数学建模实战 / Q3 产品复盘 / 中医文化"></div>
          <div class="bf-sec"><label>受众 <span class="hint">可选</span></label><div class="bf-chips" data-group="audience"></div></div>
          <div class="bf-sec"><label>目的 <span class="hint">可选</span></label><div class="bf-chips" data-group="purpose"></div></div>
          <div class="bf-sec"><label>风格</label><div class="bf-chips" data-group="mood"></div></div>
          <div class="bf-sec"><label>长度</label><div class="bf-chips" data-group="length"></div></div>
          <div class="bf-sec"><label>必含要点 <span class="hint">可选，按回车添加</span></label>
            <div class="bf-points"><input class="bf-ptinp" placeholder="如：市场规模 / 技术架构 / 竞品对比"><button class="bf-ptadd">添加</button></div>
            <div class="bf-ptlist"></div>
          </div>
          <div class="bf-sec"><label>场景 Skill <span class="hint">可选·三维度叠加提升质量 · 管理请在主页「Skill 管理」</span></label>
            <div class="bf-skilldim">结构</div><div class="bf-chips" data-group="skill-structure"></div>
            <div class="bf-skilldim">风格</div><div class="bf-chips" data-group="skill-style"></div>
            <div class="bf-skilldim">行业</div><div class="bf-chips" data-group="skill-domain"></div>
          </div>
        </div>
        <div class="bf-side">
          <div class="bf-preview">
            <h4>创意简报预览</h4>
            <div class="sub">将据此驱动主题、页数与逐页风格</div>
            <div class="bf-pvbox"></div>
          </div>
          <div class="bf-chatwrap" style="display:none;flex-direction:column;gap:8px">
            <label style="font-size:12px;font-weight:600;color:#666">对话模式 · 告诉 AI 怎么调整</label>
            <div class="bf-chat"></div>
            <div class="bf-chatinput"><input class="bf-cinp" placeholder="如：再加 2 页讲案例 / 配色更活泼"><button class="bf-csend">发送</button></div>
          </div>
        </div>
      </div>
      <div class="bf-foot">
        <span class="bf-aihint"></span>
        <span class="sp"></span>
        <button class="bf-btn ghost" data-act="chat">💬 对话模式</button>
        <button class="bf-btn ai" data-act="draft">✦ AI 生成创意简报</button>
        <button class="bf-btn go" data-act="go">直接生成 →</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // ── 元素引用 ──
  const $ = (sel: string) => overlay.querySelector<HTMLElement>(sel)!;
  const topicIn = $(".bf-topic") as HTMLInputElement;
  const moodBox = $('[data-group="mood"]');
  const audBox = $('[data-group="audience"]');
  const purpBox = $('[data-group="purpose"]');
  const lenBox = $('[data-group="length"]');
  const skStructBox = $('[data-group="skill-structure"]');
  const skStyleBox = $('[data-group="skill-style"]');
  const skDomainBox = $('[data-group="skill-domain"]');
  const skMgr = $(".bf-skmgr");
  const ptIn = $(".bf-ptinp") as HTMLInputElement;
  const pvBox = $(".bf-pvbox");
  const ptList = $(".bf-ptlist");
  const chatWrap = $(".bf-chatwrap");
  const chatEl = $(".bf-chat");
  const cinp = $(".bf-cinp") as HTMLInputElement;
  const aiHint = $(".bf-aihint");
  const draftBtn = $('[data-act="draft"]') as HTMLButtonElement;
  const chatToggle = $('[data-act="chat"]');

  topicIn.value = answers.topic;

  // ── 渲染 chips（泛化回调式：onPick 决定如何写状态）──
  function renderChips(
    box: HTMLElement,
    items: { k: string; label: string }[],
    selected: string | undefined,
    onPick: (k: string) => void,
  ): void {
    box.innerHTML = items
      .map((it) => `<span class="bf-chip${it.k === selected ? " on" : ""}" data-k="${it.k}">${it.label}</span>`)
      .join("");
    box
      .querySelectorAll<HTMLElement>(".bf-chip")
      .forEach((c) => c.addEventListener("click", () => onPick(c.dataset.k!)));
  }
  function renderAllChips(): void {
    renderChips(
      audBox,
      AUDIENCES.map((k) => ({ k, label: k })),
      answers.audience,
      (k) => {
        answers.audience = k === answers.audience ? undefined : k;
        recompute();
        renderAllChips();
      },
    );
    renderChips(
      purpBox,
      PURPOSES.map((k) => ({ k, label: k })),
      answers.purpose,
      (k) => {
        answers.purpose = k === answers.purpose ? undefined : k;
        recompute();
        renderAllChips();
      },
    );
    renderChips(
      moodBox,
      MOODS.map((m) => ({ k: m.k, label: m.label })),
      answers.mood,
      (k) => {
        answers.mood = (k === answers.mood ? "auto" : k) as Mood | "auto";
        recompute();
        renderAllChips();
      },
    );
    renderChips(
      lenBox,
      LENGTHS.map((l) => ({ k: l.k, label: l.label })),
      answers.length,
      (k) => {
        answers.length = k as NonNullable<BriefAnswers["length"]>;
        recompute();
        renderAllChips();
      },
    );
  }
  /** 按 topic 关键词推荐每维度的 skill（未手选时；仅 UI 提示）。 */
  function updateRecommended(): void {
    recommended = {};
    const topic = answers.topic;
    if (!topic) return;
    for (const s of allSkills) {
      if (skillSel[s.dimension]) continue; // 已手选的不标
      if (s.triggers?.some((t) => topic.includes(t))) recommended[s.dimension] = s.id;
    }
  }
  // ── skill 三维度 chips（每维单选；「✦ 通用」= 不约束；命中 triggers 标 ✦荐）──
  function renderSkillChips(): void {
    const dims: { box: HTMLElement; key: "structure" | "style" | "domain" }[] = [
      { box: skStructBox, key: "structure" },
      { box: skStyleBox, key: "style" },
      { box: skDomainBox, key: "domain" },
    ];
    for (const { box, key } of dims) {
      const items = [
        { k: "", label: "✦ 通用" },
        ...allSkills
          .filter((s) => s.dimension === key)
          .map((s) => ({
            k: s.id,
            label: recommended[key] === s.id && skillSel[key] !== s.id ? `${s.name} ✦荐` : s.name,
          })),
      ];
      renderChips(box, items, skillSel[key], (k) => {
        skillSel[key] = k === "" || k === skillSel[key] ? undefined : k;
        recompute();
        renderSkillChips();
      });
    }
  }

  function renderPoints(): void {
    ptList.innerHTML = (answers.points ?? [])
      .map((p, i) => `<div class="bf-pt"><span>${escapeHtml(p)}</span><span class="del" data-i="${i}">×</span></div>`)
      .join("");
    ptList.querySelectorAll<HTMLElement>(".del").forEach((d) =>
      d.addEventListener("click", () => {
        const i = Number(d.dataset.i);
        answers.points = (answers.points ?? []).filter((_, j) => j !== i);
        recompute();
        renderPoints();
      }),
    );
  }

  function renderPreview(): void {
    const moodTxt = moodLabel(brief.mood);
    pvBox.innerHTML = `
      <div class="bf-pvrow"><span>标题</span><b>${escapeHtml(brief.title || "（待填主题）")}</b></div>
      <div class="bf-pvrow"><span>主题风格</span><b>${escapeHtml(moodTxt)}</b></div>
      <div class="bf-pvrow"><span>页数</span><b>约 ${brief.pageCount} 页</b></div>
      ${brief.audience ? `<div class="bf-pvrow"><span>受众</span><b>${escapeHtml(brief.audience)}</b></div>` : ""}
      <div class="bf-pvstruct">${brief.sections.map((s) => `· [${s.layout}] ${s.title || s.hint || ""}`).join("<br>")}</div>
      ${pendingComposed ? `<div class="bf-pvrow" style="margin-top:8px"><span>Skill</span><b>${escapeHtml(pendingComposed.sourceNames.join(" + "))}</b></div>` : ""}`;
  }

  /** 取当前选中 skills 叠加结果（无选择 → undefined），并刷新 pendingComposed。 */
  function currentComposed(): ComposedSkill | undefined {
    const sel = ([skillSel.structure, skillSel.style, skillSel.domain] as (string | undefined)[])
      .filter(Boolean)
      .map((id) => allSkills.find((s) => s.id === id))
      .filter(Boolean) as Skill[];
    pendingComposed = sel.length ? composeSkills(sel) : undefined;
    return pendingComposed;
  }
  /** 对 brief 应用 skill（若有选择）。 */
  function applyComposed(b: Brief): Brief {
    const composed = currentComposed();
    return composed ? applySkill(answers, b, composed) : b;
  }
  function recompute(): void {
    answers.topic = topicIn.value.trim();
    updateRecommended();
    brief = applyComposed(buildBriefFromAnswers(answers));
    renderPreview();
    renderSkillChips();
  }

  function renderChat(): void {
    chatEl.innerHTML = chatMsgs.map((m) => `<div class="bf-msg ${m.role}">${escapeHtml(m.text)}</div>`).join("");
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function setChatMode(on: boolean): void {
    chatMode = on;
    chatWrap.style.display = on ? "flex" : "none";
    chatToggle.textContent = on ? "← 回到表单" : "💬 对话模式";
    if (on && chatMsgs.length === 0) {
      chatMsgs.push({
        role: "ai",
        text: `我来帮你微调。当前计划：${moodLabel(brief.mood)}风格，约 ${brief.pageCount} 页。你想怎么调整？比如「加几页案例」「换个更活泼的配色」「聚焦数据」。`,
      });
      renderChat();
    }
  }

  // ── 事件 ──
  topicIn.addEventListener("input", recompute);
  $(".bf-ptadd").addEventListener("click", addPoint);
  ptIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPoint();
    }
  });
  function addPoint(): void {
    const v = ptIn.value.trim();
    if (!v) return;
    answers.points = [...(answers.points ?? []), v];
    ptIn.value = "";
    recompute();
    renderPoints();
  }

  chatToggle.addEventListener("click", () => setChatMode(!chatMode));

  async function sendChat(): Promise<void> {
    const msg = cinp.value.trim();
    if (!msg) return;
    if (!hasAi()) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "对话模式需先配置 AI 模型" }));
      document.dispatchEvent(new CustomEvent("oneact:open-api"));
      return;
    }
    chatMsgs.push({ role: "me", text: msg });
    cinp.value = "";
    renderChat();
    const p = provider();
    if (!p) return;
    try {
      brief = applyComposed(await reviseBriefWithAi(p, brief, msg));
      chatMsgs.push({
        role: "ai",
        text: `已调整：${moodLabel(brief.mood)}风格，约 ${brief.pageCount} 页，结构 ${brief.sections.length} 节。继续说，或点「直接生成」。`,
      });
    } catch {
      chatMsgs.push({ role: "ai", text: "出错了，保留原计划。可直接生成或重试。" });
    }
    renderChat();
    renderPreview();
  }
  $(".bf-csend").addEventListener("click", sendChat);
  cinp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void sendChat();
    }
  });

  draftBtn.addEventListener("click", async () => {
    answers.topic = topicIn.value.trim();
    if (!answers.topic) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "请先输入主题" }));
      topicIn.focus();
      return;
    }
    if (!hasAi()) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "AI 生成简报需先配置模型" }));
      document.dispatchEvent(new CustomEvent("oneact:open-api"));
      return;
    }
    draftBtn.disabled = true;
    draftBtn.textContent = "✦ AI 构思中…";
    const p = provider();
    if (p) {
      try {
        brief = applyComposed(await draftBriefWithAi(p, answers));
        document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "已生成创意简报，可在右侧预览/对话微调" }));
      } catch {
        brief = applyComposed(buildBriefFromAnswers(answers));
      }
    }
    draftBtn.disabled = false;
    draftBtn.textContent = "✦ AI 生成创意简报";
    renderPreview();
  });

  $('[data-act="go"]').addEventListener("click", () => {
    answers.topic = topicIn.value.trim();
    if (!answers.topic) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "请先输入主题" }));
      topicIn.focus();
      return;
    }
    // 若用户刚改过表单（未点 AI），用确定性 brief；否则用当前（可能 AI 修订过）的 brief
    const base =
      brief.topic === answers.topic
        ? { ...brief, topic: answers.topic, title: brief.title || answers.topic }
        : buildBriefFromAnswers(answers);
    const finalBrief = applyComposed(base);
    close();
    opts.onConfirm(finalBrief, pendingComposed);
  });

  $(".close").addEventListener("click", () => {
    close();
    opts.onCancel?.();
  });
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      close();
      opts.onCancel?.();
    }
  });

  function close(): void {
    overlay.remove();
  }

  // ── 初始渲染 ──
  updateRecommended();
  renderAllChips();
  renderSkillChips();
  renderPoints();
  aiHint.textContent = hasAi() ? "" : "提示：未配置 AI，「直接生成」仍可用（确定性简报）";
  recompute();
  setTimeout(() => topicIn.focus(), 50);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
