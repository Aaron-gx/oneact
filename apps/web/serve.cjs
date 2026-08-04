const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "dist");
const PORT = 5190;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

// ── 同源代理（仅 dev）：让浏览器能调用不开 CORS 的第三方 API（如智谱 BigModel）──
// 用法：供应商 baseUrl 填  http://localhost:5190/__proxy/<真实 upstream 绝对地址>
//   例：http://localhost:5190/__proxy/https://open.bigmodel.cn/api/anthropic
//   代码里 anthropicChat 会拼成 .../__proxy/https://open.bigmodel.cn/api/anthropic/v1/messages
// 服务端 fetch 不受 CORS 限制；key 仍在浏览器本地 localStorage，仅经本机回环转发，不落盘、不外发。
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}
// 仅放行本机回环来源（Host=localhost / 127.0.0.1），避免被局域网或 DNS 重绑定滥用成开放代理
function isLocalHost(req) {
  const h = (req.headers.host || "").toLowerCase();
  return h.startsWith("localhost") || h.startsWith("127.0.0.1");
}
async function handleProxy(req, res) {
  if (!isLocalHost(req)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 — proxy 仅限本机访问");
    return;
  }
  const target = req.url.slice("/__proxy/".length);
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
    res.end(JSON.stringify({ error: "proxy upstream failed", detail: String((e && e.message) || e) }));
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/__proxy/")) {
    handleProxy(req, res).catch((e) => {
      try {
        res.writeHead(500);
        res.end(String(e));
      } catch (_) {
        /* 已销毁 */
      }
    });
    return;
  }
  let url = req.url.split("?")[0];
  if (url === "/") url = "/home.html";

  const filePath = path.join(root, url);
  // 防止路径穿越
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found: " + url);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Cache-Control", "no-cache");
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("OneAct preview server running:");
  console.log("  Home:   http://localhost:" + PORT + "/home.html");
  console.log("  Editor: http://localhost:" + PORT + "/editor.html");
  console.log("  Log:    http://localhost:" + PORT + "/log.html");
  console.log("  Proxy:  http://localhost:" + PORT + "/__proxy/<upstream>  (中转不开 CORS 的 API，如智谱 BigModel)");
});
