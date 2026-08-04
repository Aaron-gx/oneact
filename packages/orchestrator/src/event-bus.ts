/**
 * @oneact/orchestrator — 事件总线
 *
 * 轻量级发布/订阅：Orchestrator 发事件，外部（Web SSE / CLI 进度条 / 日志）订阅。
 * 不引入第三方库，零依赖。
 */
import type { PipelineEvent } from "./types.js";

type EventHandler = (event: PipelineEvent) => void;

export class EventBus {
  private handlers: EventHandler[] = [];
  /** 已发出的事件日志（调试用，默认保留最近 200 条）。 */
  private history: PipelineEvent[] = [];
  private readonly maxHistory: number = 200;

  /** 订阅事件。返回取消订阅函数。 */
  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** 订阅一次性事件（触发一次后自动取消）。 */
  once(filter: (event: PipelineEvent) => boolean, handler: EventHandler): () => void {
    const wrapper: EventHandler = (event) => {
      if (filter(event)) {
        this.off(wrapper);
        handler(event);
      }
    };
    return this.on(wrapper);
  }

  /** 取消订阅。 */
  off(handler: EventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  /** 发出事件。 */
  emit(event: PipelineEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    for (const h of this.handlers) {
      try {
        h(event);
      } catch {
        // 某个 handler 出错不应影响其他订阅者和主管线
      }
    }
  }

  /** 获取事件历史（调试用）。 */
  getHistory(): PipelineEvent[] {
    return [...this.history];
  }

  /** 清空历史。 */
  clear(): void {
    this.history = [];
  }
}
