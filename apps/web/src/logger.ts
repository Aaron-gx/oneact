/**
 * @oneact/web — 日志系统（诊断 AI 生成失败等问题）
 *
 * · 环形缓冲（最近 600 条）+ 持久化到 localStorage（key=oneact-logs）
 * · 自动捕获：window error、未处理 Promise rejection、console.error/warn
 * · 显式埋点：log.info/warn/error(level, category, msg, data?, err?)，生成流程逐步记录
 * · 日志页 log.html 读取 getLogs() 渲染、过滤、导出、清空
 *
 * 安全：不记录完整 API Key；需要更详细的网络响应时，开启「详细模式」会置 oneact-debug=1，
 * provider 错误信息会包含截断的响应体（见 packages/ai/src/provider.ts 的 safeText）。
 */

// 在覆盖 console 前先保存原方法，避免递归
const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _err = console.error.bind(console);

export type LogLevel = "info" | "warn" | "error";
export type LogCategory = "gen" | "api" | "ui" | "runtime" | "promise" | "console" | "other";

export interface LogEntry {
  id: number;
  /** 毫秒时间戳 */
  t: number;
  level: LogLevel;
  cat: LogCategory;
  msg: string;
  /** 结构化附加数据（已脱敏，不含完整 key） */
  data?: unknown;
  /** 错误对象：message + stack */
  err?: { message: string; stack?: string; name?: string };
}

const KEY = "oneact-logs";
const MAX = 600;
let seq = 1;

function load(): LogEntry[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]") as LogEntry[];
    if (Array.isArray(arr) && arr.length) seq = (arr[arr.length - 1].id || 0) + 1;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
let buf: LogEntry[] = load();

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(buf));
  } catch {
    /* 配额满等：静默，保留内存缓冲 */
  }
}

function toErr(e: unknown): NonNullable<LogEntry["err"]> | undefined {
  if (!e) return undefined;
  if (e instanceof Error) return { message: e.message, stack: e.stack, name: e.name };
  if (typeof e === "string") return { message: e };
  if (e && typeof e === "object") {
    const m = e as { message?: string; stack?: string; name?: string };
    return { message: m.message || JSON.stringify(e), stack: m.stack, name: m.name };
  }
  return { message: String(e) };
}

export function log(level: LogLevel, cat: LogCategory, msg: string, data?: unknown, err?: unknown): void {
  const entry: LogEntry = { id: seq++, t: Date.now(), level, cat, msg, data, err: toErr(err) };
  buf.push(entry);
  if (buf.length > MAX) buf = buf.slice(-MAX);
  persist();
  // 同步打到控制台（用原方法，避免与下方的 console 拦截递归）
  const prefix = `[OneAct][${cat}]`;
  const args: unknown[] = [prefix, msg];
  if (data !== undefined) args.push(data);
  if (entry.err) args.push(entry.err);
  if (level === "error") _err(...args);
  else if (level === "warn") _warn(...args);
  else _log(...args);
}

export const logInfo = (cat: LogCategory, msg: string, data?: unknown) => log("info", cat, msg, data);
export const logWarn = (cat: LogCategory, msg: string, data?: unknown, err?: unknown) =>
  log("warn", cat, msg, data, err);
export const logError = (cat: LogCategory, msg: string, data?: unknown, err?: unknown) =>
  log("error", cat, msg, data, err);

export function getLogs(): LogEntry[] {
  return buf.slice();
}

export function clearLogs(): void {
  buf = [];
  persist();
}

export function exportLogs(): string {
  return JSON.stringify(buf, null, 2);
}

/** 详细模式开关：开启后 provider 错误会带上截断的 HTTP 响应体。 */
export function isDebugMode(): boolean {
  return localStorage.getItem("oneact-debug") === "1";
}
export function setDebugMode(on: boolean): void {
  if (on) localStorage.setItem("oneact-debug", "1");
  else localStorage.removeItem("oneact-debug");
}

// ── 全局自动捕获 ──
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    log("error", "runtime", e.message || "window error", { file: e.filename, line: e.lineno, col: e.colno }, e.error);
  });
  window.addEventListener("unhandledrejection", (e) => {
    log("error", "promise", "未处理的 Promise 拒绝", undefined, e.reason);
  });
  // 拦截 console.error / console.warn（用原方法输出 + 入日志）
  console.error = (...args: unknown[]) => {
    log("error", "console", args.map((a) => (typeof a === "string" ? a : safeStr(a))).join(" "));
    _err(...args);
  };
  console.warn = (...args: unknown[]) => {
    log("warn", "console", args.map((a) => (typeof a === "string" ? a : safeStr(a))).join(" "));
    _warn(...args);
  };
}

function safeStr(a: unknown): string {
  try {
    return a instanceof Error ? a.message : JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/** 脱敏：把配置里的 apiKey 截断为前4后4。 */
export function maskConfig(cfg: {
  kind?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}): Record<string, unknown> {
  const k = cfg.apiKey ?? "";
  return {
    kind: cfg.kind,
    model: cfg.model,
    baseUrl: cfg.baseUrl ?? "(默认)",
    apiKey: k ? `${k.slice(0, 4)}…${k.slice(-4)}（${k.length} 字符）` : "(空)",
    debug: isDebugMode(),
  };
}
