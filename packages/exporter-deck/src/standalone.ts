/**
 * @oneact/exporter-deck — 自包含单 HTML 分发
 *
 * 把 deck 注入 player runtime.html → 单 HTML，发给任何人双击即播，动画交互全保真。
 * 这是 .act 的分发形态（分发场景无需 diff，故 deck 内联进 HTML）。
 */
import type { Deck } from "@oneact/schema";

/**
 * @param deck 要嵌入的演示
 * @param runtimeHtml player 的 runtime.html 内容（来自 @oneact/player 构建产物）
 */
export function toStandaloneHtml(deck: Deck, runtimeHtml: string): string {
  // 安全审计修复（2026-08-02）：
  // 1. 转义 </script 防止内联脚本被截断
  // 2. 转义 <!-- 防止 HTML 注释提前关闭
  // 3. 转义 U+2028 / U+2029（JavaScript 行终止符，JSON.stringify 不转义，但在 <script> 中会导致语法错误/注入）
  const deckLiteral = JSON.stringify(deck)
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  const inject = `<script>window.__ONEACT_DECK__=${deckLiteral};</script>`;
  // 注入到 body 开头（在播放器主脚本之前，确保 window.__ONEACT_DECK__ 已设）
  // 用函数替换：避免 inject/deck 内容里的 $& / $` / $' / $n 被 String.replace 当特殊模式
  if (/<body[^>]*>/.test(runtimeHtml)) {
    return runtimeHtml.replace(/(<body[^>]*>)/, (_m, body) => `${body}${inject}`);
  }
  return inject + runtimeHtml;
}
