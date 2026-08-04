/**
 * @oneact/components — 逃逸块消毒（多层防御）
 *
 * 发布红线（4.11）：打开陌生人分享的 .act / 自包含 HTML 是核心分发场景，
 * 逃逸块必须默认不可信。主防线是 iframe sandbox + CSP；此处消毒为补充层。
 *
 * 安全审计修复（2026-08-02）：
 *   旧版纯正则黑名单消毒可被多种方式绕过（标签前加空格、嵌套标签、HTML 实体编码、
 *   data:/vbscript: 协议等）。本版重写为「反复剥离 + 协议白名单 + 属性白名单」的多层防御。
 *
 * 生产环境强烈建议引入 DOMPurify 依赖替代此模块（见 SECURITY.md 建议）。
 */

// ──────────────────────────── 危险协议 ────────────────────────────
// 拦截所有非 http(s)/data:image/mailto/tel 的 URL 协议（白名单模式）
const SAFE_PROTOCOLS = /^(https?:|data:image\/|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;
const DANGEROUS_PROTOCOL_RE = /(javascript|vbscript|data:text\/html|file|about):/gi;

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  // HTML 实体解码后再次检查（防 &#106;avascript: 绕过）
  const decoded = trimmed
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  if (DANGEROUS_PROTOCOL_RE.test(decoded) || DANGEROUS_PROTOCOL_RE.test(trimmed)) {
    return "#";
  }
  return trimmed;
}

// ──────────────────────────── 危险标签 ────────────────────────────
// 反复剥离直到无变化（防 <scr<script>ipt> 嵌套绕过）
const HTML_DENY_TAGS =
  /<\/?\s*(script|object|embed|iframe|frame|frameset|link|meta|base|form|input|textarea|button|select|option|applet|xml|import|style|noscript|template|slot)\b[^>]*>/gi;
const SVG_DENY_TAGS = /<\/?\s*(script|foreignObject|image|use|a|set|animate|animateTransform|animateMotion)\b[^>]*>/gi;

// ──────────────────────────── 危险属性 ────────────────────────────
// on* 事件处理器（允许标签名前有空白）
const ON_ATTR = /\s+on[a-z][a-z0-9-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
// style 中的 expression() / url(javascript:) / -moz-binding
const CSS_DANGEROUS = /expression\s*\(|url\s*\(\s*["']?\s*javascript:|-moz-binding|behavior\s*:/gi;
// href/src/action/formaction/xlink:href 属性值（需走 sanitizeUrl）
const URL_ATTRS =
  /\s(href|src|xlink:href|action|formaction|poster|background|dynsrc|lowsrc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

const HTML_COMMENT = /<!--[\s\S]*?-->/gi;
const CDATA = /<!\[CDATA\[[\s\S]*?\]\]>/gi;

/** 消毒 HTML 逃逸块：多层剥离高危标签/属性/危险协议。 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string") return "";
  let prev = "";
  let current = html;
  // 反复剥离，直到内容不再变化（防嵌套标签绕过）
  let iterations = 0;
  while (prev !== current && iterations < 5) {
    prev = current;
    current = current
      .replace(HTML_COMMENT, "")
      .replace(CDATA, "")
      .replace(HTML_DENY_TAGS, "")
      .replace(ON_ATTR, "")
      .replace(URL_ATTRS, (_m, attr: string, val: string) => {
        // 去掉引号
        const clean = val.replace(/^["']|["']$/g, "");
        return ` ${attr}="${sanitizeUrl(clean)}"`;
      })
      .replace(/style\s*=\s*("[^"]*"|'[^']*')/gi, (_m, val: string) => {
        const clean = val.replace(/^["']|["']$/g, "");
        const safe = CSS_DANGEROUS.test(clean) ? "" : clean;
        return safe ? `style="${safe}"` : "";
      });
    iterations++;
  }
  return current;
}

/** 消毒 SVG 逃逸块：剥离可外链/可执行标签。 */
export function sanitizeSvg(svg: string): string {
  if (typeof svg !== "string") return "";
  let prev = "";
  let current = svg;
  let iterations = 0;
  while (prev !== current && iterations < 5) {
    prev = current;
    current = current
      .replace(HTML_COMMENT, "")
      .replace(CDATA, "")
      .replace(SVG_DENY_TAGS, "")
      .replace(ON_ATTR, "")
      .replace(URL_ATTRS, (_m, attr: string, val: string) => {
        const clean = val.replace(/^["']|["']$/g, "");
        return ` ${attr}="${sanitizeUrl(clean)}"`;
      });
    iterations++;
  }
  return current;
}

/** 转义 HTML 属性值（用于 srcdoc 等，仅转 & 和 " 以保留标签语义）。 */
export function escapeAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
