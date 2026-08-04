/**
 * @oneact/schema — 格式常量与画布模型
 *
 * 固定逻辑坐标系（投影仪模型）：所有元素以绝对坐标定位，
 * 渲染时整个画布按窗口等比 scale + 居中，绝不流式重排。
 * 默认 16:9 → 1280×720。
 */

/** 当前格式版本。格式冻结后只新增迁移器，永不 breaking change。 */
export const FORMAT_VERSION = 1;

/** 逻辑画布基准宽度（所有尺寸预设共享，仅高度随比例变化）。 */
export const CANVAS_BASE_WIDTH = 1280;

export type DeckSize = "16:9" | "16:10" | "4:3";

export interface CanvasSize {
  width: number;
  height: number;
}

/** 尺寸预设：宽度恒为 1280，高度随宽高比变化。 */
export const SIZE_PRESETS: Record<DeckSize, CanvasSize> = {
  "16:9": { width: 1280, height: 720 },
  "16:10": { width: 1280, height: 800 },
  "4:3": { width: 1280, height: 960 },
};

/** 取某尺寸对应的逻辑画布大小（缺省 16:9）。 */
export function canvasSize(size?: DeckSize): CanvasSize {
  return SIZE_PRESETS[size ?? "16:9"];
}
