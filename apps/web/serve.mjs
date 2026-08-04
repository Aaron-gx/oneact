import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, normalize } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("./dist/", import.meta.url);
const rootPath = normalize(new URL("./dist/", import.meta.url).pathname || new URL("./dist/", import.meta.url).pathname);
const MIME = { ".html": "text/html;charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

// ── 同源代理（仅 dev）：让浏览器能调用不开放 CORS 的第三方 API（如智谱 BigModel）──
// 用法：供应商 baseUrl 填  http://localhost:5190/__proxy/<真实 upstream 绝对地址>
//   例：http://localhost:5190/__proxy/https://open.bigmodel.cn/api/anthropic
//   代码里 anthropicChat 会拼成 .../__proxy/https://open.bigmodel.cn/api/anthropic/v1/messages
// 服务端 fetch 不受 CORS 限制；key 仍在本地 localStorage，仅经本机回环转发，不落盘、不外发。
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
async function handleProxy(req, res) {
  const target = (req.url || "").slice("/__proxy/".length);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (!/^https?:\/\//.test(target)) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders() });
    res.end("400 — 代理目标须为 http(s) 绝对地址，如 /__proxy/https://open.bigmodel.cn/api/anthropic");
    return;
  }
  const body = await new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
  // 拷贝请求头（含 x-api-key / Authorization），去掉逐跳头与 accept-encoding（让上游返回未压缩体）
  const headers = { ...req.headers };
  for (const h of ["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]) delete headers[h];
  try {
    const up = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const buf = Buffer.from(await up.arrayBuffer());
    // 回传上游全部响应头（保留 content-type 等），再用本端宽松 CORS 头覆盖
    const respHeaders = {};
    up.headers.forEach((v, k) => {
      if (!["transfer-encoding", "connection", "content-length", "keep-alive"].includes(k.toLowerCase())) respHeaders[k] = v;
    });
    Object.assign(respHeaders, corsHeaders());
    res.writeHead(up.status, respHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() });
    res.end(JSON.stringify({ error: "proxy upstream failed", detail: String(e?.message || e) }));
  }
}

const server = createServer((req, res) => {
  if ((req.url || "").startsWith("/__proxy/")) {
    handleProxy(req, res).catch((e) => {
      try {
        res.writeHead(500);
        res.end(String(e));
      } catch {
        /* 已销毁 */
      }
    });
    return;
  }
  let p = decodeURIComponent((req.url || "/").split("?")[0]);

  // 安全审计修复（2026-08-02）：防止路径穿越（CWE-22）
  // 1. 拒绝包含 .. 的路径（最直接的穿越尝试）
  // 2. 规范化后验证最终路径在 root 目录内
  if (p.includes("..") || p.includes("%2e%2e") || p.includes("\\")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  if (p === "/") p = "/home.html";
  const file = new URL("." + p, root);

  // 二次验证：解析后的实际路径必须在 root 目录下
  const resolvedPath = normalize(file.pathname || file.href.replace("file://", ""));
  if (!resolvedPath.startsWith(rootPath)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  try {
    const body = readFileSync(file);
    res.writeHead(200, {
      "Content-Type": MIME[extname(p)] || "application/octet-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      // 安全审计修复：增加安全响应头
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-XSS-Protection": "1; mode=block",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 — 请先 npm run build (在 apps/web)");
  }
});
// 绑定 127.0.0.1：避免局域网其他机器访问到这个开放代理（仅本机 dev 用）
server.listen(5190, "127.0.0.1", () => {
  console.log("\n  一幕 OneAct 编辑器 → http://localhost:5190/");
  console.log("  同源代理已启用 → 供应商 baseUrl 填 http://localhost:5190/__proxy/<upstream>\n");
});
