/**
 * @oneact/web — skill 管理器（导入 / 列出 / 删除 / 导出）
 *
 * 弹窗：粘贴 .md 或选文件导入 skill；列出内置 + 用户 skill；
 * 用户 skill 可删除，所有 skill 可导出 .md（serializeSkill）。
 */
import { parseFrontmatter, serializeSkill, type Skill } from "@oneact/skills";
import { loadUserSkills, addUserSkill, deleteUserSkill, listAllSkills } from "./skill-store.js";

const STYLE_ID = "skill-manager-style";
function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = `
.sk-overlay{position:fixed;inset:0;background:rgba(15,18,30,.5);backdrop-filter:blur(3px);z-index:1100;display:flex;align-items:center;justify-content:center;padding:24px;animation:skIn .18s ease}
@keyframes skIn{from{opacity:0}to{opacity:1}}
.sk-modal{background:#fff;border-radius:16px;width:100%;max-width:760px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.3)}
.sk-head{display:flex;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid #eee;font-size:16px;font-weight:700}
.sk-head .close{margin-left:auto;cursor:pointer;color:#999;font-size:20px;width:30px;height:30px;display:grid;place-items:center;border-radius:8px}
.sk-head .close:hover{background:#f3f3f3}
.sk-body{padding:18px 22px;overflow:auto;flex:1}
.sk-sec{margin-bottom:18px}
.sk-sec label{display:block;font-size:12px;font-weight:600;color:#666;margin-bottom:7px}
.sk-ta{width:100%;border:1px solid #ddd;border-radius:10px;padding:10px 12px;font-size:13px;font-family:ui-monospace,monospace;min-height:130px;resize:vertical;outline:none;box-sizing:border-box}
.sk-ta:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
.sk-row{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.sk-btn{border:none;border-radius:10px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600}
.sk-btn.go{background:#4f46e5;color:#fff}
.sk-btn.ghost{background:#f3f3f3;color:#555}
.sk-btn.sm{padding:4px 10px;font-size:12px;border-radius:8px}
.sk-list{display:flex;flex-direction:column;gap:6px}
.sk-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #eee;border-radius:10px;font-size:13px}
.sk-item .nm{font-weight:600}
.sk-item .dim{font-size:11px;color:#999;background:#f3f3f2;padding:2px 7px;border-radius:6px}
.sk-item .desc{color:#888;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sk-item .bi{font-size:10px;color:#4f46e5;border:1px solid #ddd;padding:1px 6px;border-radius:6px}
.sk-hint{font-size:11px;color:#999}`;
  document.head.appendChild(s);
}

const DIM_LABEL: Record<Skill["dimension"], string> = { structure: "结构", style: "风格", domain: "行业" };

/** 打开 skill 管理器。onChange 在导入/删除后回调（调用方刷新 chips）。 */
export function openSkillManager(onChange?: () => void): void {
  injectStyle();
  const overlay = document.createElement("div");
  overlay.className = "sk-overlay";
  overlay.innerHTML = `
    <div class="sk-modal">
      <div class="sk-head">🧩 Skill 管理 <span style="font-weight:400;color:#999;font-size:13px">· 导入 / 删除 / 导出</span><span class="close" title="关闭">×</span></div>
      <div class="sk-body">
        <div class="sk-sec">
          <label>导入 Skill（粘贴 Markdown，或选择 .md 文件）</label>
          <textarea class="sk-ta" placeholder="---\nid: my-skill\nname: ...\ndescription: ...\ndimension: structure\n---\n## 骨架\ncover: 标题"></textarea>
          <div class="sk-row">
            <button class="sk-btn go sk-import">导入</button>
            <input type="file" accept=".md,.txt" class="sk-file" style="font-size:12px">
            <span class="sk-hint">dimension 须为 structure / style / domain</span>
          </div>
        </div>
        <div class="sk-sec">
          <label>已有 Skill（内置不可删；用户可删 / 所有可导出）</label>
          <div class="sk-list"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const $ = (sel: string) => overlay.querySelector<HTMLElement>(sel)!;
  const ta = $(".sk-ta") as HTMLTextAreaElement;
  const listBox = $(".sk-list");
  const fileInput = $(".sk-file") as HTMLInputElement;

  function renderList(): void {
    const all = listAllSkills();
    const userIds = new Set(loadUserSkills().map((s) => s.id));
    listBox.innerHTML = all
      .map((s) => {
        const isUser = userIds.has(s.id);
        return `<div class="sk-item" data-id="${s.id}">
          <span class="nm">${escapeHtml(s.name)}</span>
          <span class="dim">${DIM_LABEL[s.dimension]}</span>
          ${isUser ? "" : '<span class="bi">内置</span>'}
          <span class="desc">${escapeHtml(s.description)}</span>
          <button class="sk-btn sm ghost sk-export" data-id="${s.id}">导出</button>
          ${isUser ? `<button class="sk-btn sm ghost sk-del" data-id="${s.id}" style="color:#c00">删除</button>` : ""}
        </div>`;
      })
      .join("");
    listBox.querySelectorAll<HTMLElement>(".sk-del").forEach((b) =>
      b.addEventListener("click", () => {
        deleteUserSkill(b.dataset.id!);
        document.dispatchEvent(new CustomEvent("oneact:notify", { detail: "已删除 skill" }));
        renderList();
        onChange?.();
      }),
    );
    listBox.querySelectorAll<HTMLElement>(".sk-export").forEach((b) =>
      b.addEventListener("click", () => {
        const s = all.find((x) => x.id === b.dataset.id);
        if (s) downloadMd(s);
      }),
    );
  }

  function doImport(text: string): void {
    try {
      const skill = parseFrontmatter(text);
      addUserSkill(skill);
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: `已导入 skill：${skill.name}` }));
      ta.value = "";
      renderList();
      onChange?.();
    } catch (e) {
      document.dispatchEvent(new CustomEvent("oneact:notify", { detail: `导入失败：${(e as Error).message}` }));
    }
  }

  $(".sk-import").addEventListener("click", () => {
    const v = ta.value.trim();
    if (v) doImport(v);
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => doImport(String(r.result ?? ""));
    r.readAsText(f);
    fileInput.value = "";
  });
  overlay.querySelector(".close")!.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  renderList();
}

function downloadMd(skill: Skill): void {
  const blob = new Blob([serializeSkill(skill)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${skill.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
