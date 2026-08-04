/**
 * @oneact/layouts — 一幕 OneAct 版式原语 + 布局引擎
 *
 * 版式是"编译时脚手架"：layout 只记录参考来源，坐标永远是绝对值。
 * AI 先选版式再填内容，不允许自由发挥坐标（约束模式）。
 */
export * from "./layouts.js";
export * from "./engine.js";
