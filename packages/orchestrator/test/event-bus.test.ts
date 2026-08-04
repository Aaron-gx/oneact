/**
 * @oneact/orchestrator — 事件总线测试
 */
import { describe, it, expect } from "vitest";
import { EventBus } from "../src/event-bus.js";
import type { PipelineEvent } from "../src/types.js";

describe("EventBus", () => {
  it("on/emit: 订阅并接收事件", () => {
    const bus = new EventBus();
    const received: PipelineEvent[] = [];
    bus.on((e) => received.push(e));

    const event: PipelineEvent = { type: "pipeline:start", taskId: "t1", topic: "测试", timestamp: Date.now() };
    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("pipeline:start");
  });

  it("on 返回取消订阅函数", () => {
    const bus = new EventBus();
    const received: PipelineEvent[] = [];
    const unsub = bus.on((e) => received.push(e));

    bus.emit({ type: "pipeline:start", taskId: "t1", topic: "a", timestamp: 0 });
    unsub();
    bus.emit({ type: "pipeline:start", taskId: "t2", topic: "b", timestamp: 0 });

    expect(received).toHaveLength(1);
  });

  it("多个 handler 独立接收", () => {
    const bus = new EventBus();
    let count1 = 0;
    let count2 = 0;
    bus.on(() => count1++);
    bus.on(() => count2++);

    bus.emit({ type: "pipeline:start", taskId: "t", topic: "x", timestamp: 0 });
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });

  it("handler 出错不影响其他订阅者", () => {
    const bus = new EventBus();
    let received = false;
    bus.on(() => {
      throw new Error("boom");
    });
    bus.on(() => {
      received = true;
    });

    bus.emit({ type: "pipeline:start", taskId: "t", topic: "x", timestamp: 0 });
    expect(received).toBe(true);
  });

  it("once: 只触发一次", () => {
    const bus = new EventBus();
    let count = 0;

    bus.once(
      (e) => e.type === "gate:pass",
      () => count++,
    );

    bus.emit({ type: "gate:pass", gate: "G1-structure", details: "ok" });
    bus.emit({ type: "gate:pass", gate: "G2-validation", details: "ok" });

    expect(count).toBe(1);
  });

  it("getHistory: 保留事件历史并自动裁剪", () => {
    const bus = new EventBus();
    for (let i = 0; i < 250; i++) {
      bus.emit({ type: "pipeline:start", taskId: `t${i}`, topic: `x${i}`, timestamp: i });
    }

    const history = bus.getHistory();
    expect(history.length).toBeLessThanOrEqual(200);
    expect(history.length).toBeGreaterThanOrEqual(199);
  });

  it("clear: 清空历史", () => {
    const bus = new EventBus();
    bus.emit({ type: "pipeline:start", taskId: "t", topic: "x", timestamp: 0 });
    expect(bus.getHistory()).toHaveLength(1);

    bus.clear();
    expect(bus.getHistory()).toHaveLength(0);
  });
});
