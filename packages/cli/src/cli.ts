/**
 * @oneact/cli — 一幕 OneAct 命令行
 *
 * 命令：validate · init · from-md · from-pptx · export · serve · http · benchmark（共 9 个）。
 * 经 esbuild 打包为单文件 dist/cli.cjs，bin/oneact.cjs 调用，无运行时依赖。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createProvider, runBenchmark, formatReport, deckToPageCases, type GoldenCase } from "@oneact/ai";
import { readAct, toStandaloneHtml, writeAct } from "@oneact/exporter-deck";
import { exportPptx } from "@oneact/exporter-pptx";
import { LAYOUTS } from "@oneact/layouts";
import { FORMAT_VERSION, formatIssues, migrate, validateDeck, type Deck } from "@oneact/schema";
import { markdownToDeck } from "./md.js";
import { importPptx } from "./pptx-import.js";

// cjs 构建（pptxgenjs 需要）用 __dirname；esm 兜底用 import.meta.url
const here = typeof __dirname !== "undefined" && __dirname ? __dirname : dirname(fileURLToPath(import.meta.url));

function findRuntimeHtml(): string | undefined {
  const candidates = [
    resolve(here, "../../player/dist/runtime.html"), // packages/cli/dist → packages/player/dist
    resolve(here, "../packages/player/dist/runtime.html"),
  ];
  return candidates.find((p) => existsSync(p));
}

export function cmdValidate(actPath: string): number {
  if (!existsSync(actPath)) {
    console.error(`✗ 文件不存在：${actPath}`);
    return 1;
  }
  let deck: Deck;
  try {
    deck = readAct(actPath);
  } catch (e) {
    console.error(`✗ JSON 解析失败：${(e as Error).message}`);
    return 1;
  }
  const { deck: md } = migrate(deck);
  const r = validateDeck(md, { layouts: LAYOUTS });
  console.log(formatIssues(r));
  if (!r.ok) {
    console.error(`\n✗ ${r.errors.length} 个硬错误，校验未通过`);
    return 1;
  }
  console.log(`\n✓ 校验通过（${r.warnings.length} 个软警告）· formatVersion ${FORMAT_VERSION}`);
  return 0;
}

export function cmdInit(outPath: string): number {
  const sample: Deck = {
    formatVersion: 1,
    meta: { theme: "yuanshan-blue", title: "新演示" },
    pages: [
      {
        id: "p1",
        layout: "title",
        elements: [
          {
            id: "t1",
            type: "heading",
            rect: [64, 280, 1152, 110],
            slot: "title",
            props: { text: "标题", tone: "primary", align: "center" },
          },
        ],
      },
    ],
  };
  const res = writeAct(sample, outPath);
  console.log(`✓ 已创建 ${res.actFile}（同名 .assets 目录已就绪）`);
  return 0;
}

export async function cmdExport(actPath: string, outPath: string, runtimeHtml?: string): Promise<number> {
  if (!existsSync(actPath)) {
    console.error(`✗ 文件不存在：${actPath}`);
    return 1;
  }
  const deck = readAct(actPath);
  // 按扩展名自动选导出格式
  if (outPath.endsWith(".pptx")) {
    const { data, report } = await exportPptx(deck);
    writeFileSync(outPath, Buffer.from(await data.arrayBuffer()));
    console.log(`✓ pptx 已生成：${outPath}（${(data.size / 1024).toFixed(1)} KB）`);
    if (report.length) {
      console.log(`\n降级报告（${report.length} 项，明示丢失内容，不偷偷丢）：`);
      console.log(report.map((r) => `  · [${r.kind}] ${r.detail}`).join("\n"));
    }
    return 0;
  }
  const rt = runtimeHtml ?? findRuntimeHtml();
  if (!rt || !existsSync(rt)) {
    console.error("✗ 找不到 player runtime.html。请先 `npm run build:player`，或用 --runtime <path> 指定。");
    return 1;
  }
  const html = toStandaloneHtml(deck, readFileSync(rt, "utf8"));
  writeFileSync(outPath, html, "utf8");
  console.log(`✓ 自包含 HTML 已生成：${outPath}（${(html.length / 1024).toFixed(1)} KB，双击即播）`);
  return 0;
}

export function cmdFromMd(mdPath: string, outPath: string): number {
  if (!existsSync(mdPath)) {
    console.error(`✗ 文件不存在：${mdPath}`);
    return 1;
  }
  const deck = markdownToDeck(readFileSync(mdPath, "utf8"));
  const r = validateDeck(deck, { layouts: LAYOUTS });
  writeAct(deck, outPath);
  console.log(`✓ Markdown 已转换为：${outPath}（${deck.pages.length} 页）`);
  console.log(formatIssues(r));
  return 0;
}

export function cmdFromPptx(pptxPath: string, outPath: string): number {
  if (!existsSync(pptxPath)) {
    console.error(`✗ 文件不存在：${pptxPath}`);
    return 1;
  }
  const deck = importPptx(new Uint8Array(readFileSync(pptxPath)));
  const r = validateDeck(deck, { layouts: LAYOUTS });
  writeAct(deck, outPath);
  console.log(`✓ PPTX 已转换为：${outPath}（${deck.pages.length} 页，文本层提取）`);
  console.log(formatIssues(r));
  return 0;
}

export function cmdServe(actPath: string | undefined, port: number, runtimeHtml?: string): number {
  const rt = runtimeHtml ?? findRuntimeHtml();
  const deckContent = actPath && existsSync(actPath) ? readFileSync(actPath, "utf8") : null;
  if (!rt || !existsSync(rt)) {
    console.error("✗ 找不到 player runtime.html。请先 `npm run build:player`。");
    return 1;
  }
  const rtContent = readFileSync(rt, "utf8");
  const server: Server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    try {
      if (url === "/" || url === "/index.html") {
        const html = deckContent ? toStandaloneHtml(JSON.parse(deckContent) as Deck, rtContent) : rtContent;
        respond(res, 200, "text/html; charset=utf-8", html);
      } else if (url === "/deck" && deckContent) {
        respond(res, 200, "application/json; charset=utf-8", deckContent);
      } else {
        respond(res, 404, "text/plain; charset=utf-8", "Not found");
      }
    } catch (e) {
      respond(res, 500, "text/plain; charset=utf-8", String(e));
    }
  });
  server.listen(port, () => {
    console.log(`\n  一幕 OneAct 舞台服务 → http://localhost:${port}/\n`);
    console.log(deckContent ? `  deck：${actPath}` : `  （未指定 deck，播放内置示例）`);
    console.log(`  Ctrl+C 停止\n`);
  });
  return 0;
}

function respond(
  res: { writeHead: (c: number, h: Record<string, string>) => void; end: (b: string | Buffer) => void },
  code: number,
  type: string,
  body: string | Buffer,
): void {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c.toString("utf8")));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** HTTP 渲染服务（策划书 v3：POST slides.json → html/act/pptx）。 */
export function cmdHttp(port: number): number {
  const rt = findRuntimeHtml();
  const rtContent = rt && existsSync(rt) ? readFileSync(rt, "utf8") : "";
  const server = createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
    if (req.method === "POST" && (url === "/render" || url === "/")) {
      try {
        const { deck, format } = JSON.parse(await readBody(req)) as { deck: Deck; format?: string };
        if (format === "act") return respond(res, 200, "application/json; charset=utf-8", JSON.stringify(deck));
        if (format === "pptx") {
          const { data } = await exportPptx(deck);
          const buf = Buffer.from(await data.arrayBuffer());
          res.writeHead(200, {
            "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          });
          return res.end(buf);
        }
        return respond(res, 200, "text/html; charset=utf-8", toStandaloneHtml(deck, rtContent));
      } catch (e) {
        return respond(res, 400, "text/plain; charset=utf-8", "渲染失败：" + (e as Error).message);
      }
    }
    respond(
      res,
      404,
      "text/plain; charset=utf-8",
      "OneAct 渲染服务：POST /render  body={ deck, format: html|act|pptx }",
    );
  });
  server.listen(port, () => {
    console.log(
      `\n  OneAct HTTP 渲染服务 → http://localhost:${port}/render\n  POST { deck, format: "html"|"act"|"pptx" }\n`,
    );
  });
  return 0;
}

/** 黄金测试集跑分（策划书 v0.3 退出标准：量化首次通过率 / 收敛率 / ≥3 档模型）。 */
export async function cmdBenchmark(args: string[], flags: Record<string, string>): Promise<number> {
  const goldenPath = args[0] ?? resolve(here, "../../examples/golden.act.json");
  const apiKey = process.env.ONEACT_API_KEY ?? "";
  const model = flags.model ?? process.env.ONEACT_MODEL ?? "";
  const baseUrl = flags.baseUrl ?? process.env.ONEACT_BASE_URL;
  const kind = (flags.provider ?? process.env.ONEACT_PROVIDER ?? "openai-compatible") as
    "openai" | "openai-compatible" | "anthropic" | "gemini";
  const tier = (flags.tier ?? "standard") as "weak" | "standard" | "strong";
  const mode = (flags.mode ?? "deck") as "deck" | "stream";
  const outPath = flags.out;

  if (!apiKey || !model) {
    console.error("✗ 需要配置 LLM（key 仅存本地，不经过服务器）：");
    console.error("  环境变量: ONEACT_API_KEY=sk-xxx ONEACT_MODEL=glm-4-plus");
    console.error("  或参数:   --api-key sk-xxx --model glm-4-plus");
    console.error("  可选:     --provider openai-compatible --base-url https://... --tier weak|standard|strong");
    return 1;
  }
  if (!existsSync(goldenPath)) {
    console.error(`✗ 黄金测试集不存在：${goldenPath}`);
    return 1;
  }

  const goldenDeck = JSON.parse(readFileSync(goldenPath, "utf8")) as Deck;
  const cases: GoldenCase[] = deckToPageCases("golden", goldenDeck);
  console.log(`\n  OneAct 黄金测试集跑分`);
  console.log(`  模型: ${model} (${kind}, tier=${tier})`);
  console.log(`  用例: ${cases.length} 条（来自 ${goldenPath}）\n`);

  const provider = createProvider({ kind, apiKey, model, baseUrl });
  const report = await runBenchmark({
    provider,
    cases,
    modelTier: tier,
    mode,
    maxRetries: Number(flags.retries ?? 2),
    throttleMs: Number(flags.throttle ?? 1000),
    onProgress: (cur, total, id) => {
      console.log(`  [${cur}/${total}] ${id} ...`);
    },
  });

  const text = formatReport(report);
  console.log("\n" + text);

  if (outPath) {
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n  报告已保存：${outPath}`);
  }
  return report.summary.passRate >= 0.8 ? 0 : 1;
}

function parseFlags(args: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) f[a.slice(2)] = args[++i] ?? "true";
  }
  return f;
}

function printHelp(): void {
  console.log(`一幕 OneAct CLI

用法：
  oneact validate <file.act>              校验（硬错误 / 软警告）
  oneact init [out.act]                   创建新 .act 骨架（含 .assets 目录）
  oneact from-md <in.md> [out.act]        Markdown → .act
  oneact from-pptx <in.pptx> [out.act]    PPTX → .act（文本提取，80% 还原）
  oneact export <in.act> [out.html|.pptx] 导出（按扩展名：.html 自包含播放 / .pptx 降级+报告）
  oneact serve [file.act] [--port N]      启动舞台服务预览
  oneact http [--port N]                  HTTP 渲染服务（POST /render → html/act/pptx）
  oneact benchmark [golden.act] [opts]    黄金测试集跑分（首次通过率/收敛率/覆盖率）
    环境变量: ONEACT_API_KEY / ONEACT_MODEL / ONEACT_BASE_URL / ONEACT_PROVIDER
    可选参数: --tier weak|standard|strong  --mode deck|stream  --retries N  --out report.json
  oneact help                             显示本帮助`);
}

export async function run(argv: string[]): Promise<number> {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = parseFlags(argv);
  const [cmd, ...rest] = positional;
  switch (cmd) {
    case "validate":
      return cmdValidate(rest[0]);
    case "init":
      return cmdInit(rest[0] ?? "deck.act");
    case "export":
      return await cmdExport(rest[0], rest[1] ?? "deck.html", flags.runtime);
    case "from-md":
      return cmdFromMd(rest[0], rest[1] ?? "deck.act");
    case "from-pptx":
      return cmdFromPptx(rest[0], rest[1] ?? "deck.act");
    case "serve":
      return cmdServe(rest[0], Number(flags.port ?? 5173), flags.runtime);
    case "http":
      return cmdHttp(Number(flags.port ?? 5200));
    case "benchmark":
      return await cmdBenchmark(rest, flags);
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;
    default:
      console.error(`✗ 未知命令：${cmd}\n`);
      printHelp();
      return 1;
  }
}
