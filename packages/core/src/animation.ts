/**
 * @oneact/core — 动画引擎（声明式原语，兼容 Office / WPS 心智）
 *
 * 四类原语：entrance 进入 / emphasis 强调 / exit 退出 / motion 路径。
 * 编排：sequence（order 递延）/ 同时 / 错落（stagger 子项）。
 * 参数 duration / delay / easing / stagger / order——AI 几乎不可能写错。
 *
 * motion 路径用 CSS offset-path（现代浏览器支持），无需 GSAP。
 */
export interface AnimPreset {
  /** @keyframes 内容（不含 @keyframes 头）。 */
  keyframes: string;
  duration: number;
  easing: string;
}

const ease = "cubic-bezier(.22,1,.36,1)";

// ── 进入 entrance ──
const ENTRANCE: Record<string, AnimPreset> = {
  appear: { keyframes: "from{opacity:0}to{opacity:1}", duration: 300, easing: "linear" },
  "fade-in": { keyframes: "from{opacity:0}to{opacity:1}", duration: 500, easing: "ease-out" },
  "fly-in-left": {
    keyframes: "from{opacity:0;transform:translate3d(-48px,0,0)}to{opacity:1;transform:none}",
    duration: 600,
    easing: ease,
  },
  "fly-in-right": {
    keyframes: "from{opacity:0;transform:translate3d(48px,0,0)}to{opacity:1;transform:none}",
    duration: 600,
    easing: ease,
  },
  "fly-in-up": {
    keyframes: "from{opacity:0;transform:translate3d(0,48px,0)}to{opacity:1;transform:none}",
    duration: 600,
    easing: ease,
  },
  "fly-in-down": {
    keyframes: "from{opacity:0;transform:translate3d(0,-48px,0)}to{opacity:1;transform:none}",
    duration: 600,
    easing: ease,
  },
  "float-in": {
    keyframes: "from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}",
    duration: 600,
    easing: "ease-out",
  },
  "zoom-in": {
    keyframes: "from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}",
    duration: 500,
    easing: ease,
  },
  "wipe-left": {
    keyframes: "from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}",
    duration: 600,
    easing: "ease-out",
  },
  "wipe-right": {
    keyframes: "from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0 0 0 0)}",
    duration: 600,
    easing: "ease-out",
  },
  "wipe-up": {
    keyframes: "from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}",
    duration: 600,
    easing: "ease-out",
  },
  split: {
    keyframes: "from{clip-path:inset(50% 0 50% 0)}to{clip-path:inset(0 0 0 0)}",
    duration: 600,
    easing: "ease-out",
  },
  wheel: {
    keyframes: "from{clip-path:circle(0% at 50% 50%)}to{clip-path:circle(75% at 50% 50%)}",
    duration: 700,
    easing: "ease-out",
  },
  "random-bars": {
    keyframes: "from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}",
    duration: 600,
    easing: "cubic-bezier(.4,1.6,.5,1)",
  },
};

// ── 强调 emphasis（默认循环 2 次）──
const EMPHASIS: Record<string, AnimPreset> = {
  pulse: { keyframes: "0%,100%{transform:scale(1)}50%{transform:scale(1.05)}", duration: 800, easing: "ease-in-out" },
  teeter: {
    keyframes: "0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}",
    duration: 800,
    easing: "ease-in-out",
  },
  "grow-shrink": {
    keyframes: "0%,100%{transform:scale(1)}50%{transform:scale(1.12)}",
    duration: 700,
    easing: "ease-in-out",
  },
  "color-pulse": {
    keyframes: "0%,100%{filter:none}50%{filter:brightness(1.18)}",
    duration: 700,
    easing: "ease-in-out",
  },
  flash: { keyframes: "0%,50%,100%{opacity:1}25%,75%{opacity:.3}", duration: 600, easing: "linear" },
  spin: { keyframes: "from{transform:rotate(0)}to{transform:rotate(360deg)}", duration: 900, easing: "linear" },
};

// ── 退出 exit ──
const EXIT: Record<string, AnimPreset> = {
  "fade-out": { keyframes: "from{opacity:1}to{opacity:0}", duration: 400, easing: "ease-in" },
  "fly-out-left": {
    keyframes: "from{opacity:1;transform:none}to{opacity:0;transform:translate3d(-48px,0,0)}",
    duration: 500,
    easing: "ease-in",
  },
  "fly-out-right": {
    keyframes: "from{opacity:1;transform:none}to{opacity:0;transform:translate3d(48px,0,0)}",
    duration: 500,
    easing: "ease-in",
  },
  "fly-out-up": {
    keyframes: "from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,-48px,0)}",
    duration: 500,
    easing: "ease-in",
  },
  "fly-out-down": {
    keyframes: "from{opacity:1;transform:none}to{opacity:0;transform:translate3d(0,48px,0)}",
    duration: 500,
    easing: "ease-in",
  },
  "wipe-out-left": {
    keyframes: "from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 100% 0 0)}",
    duration: 500,
    easing: "ease-in",
  },
  "wipe-out-right": {
    keyframes: "from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 0 100%)}",
    duration: 500,
    easing: "ease-in",
  },
  "wipe-out-up": {
    keyframes: "from{clip-path:inset(0 0 0 0)}to{clip-path:inset(100% 0 0 0)}",
    duration: 500,
    easing: "ease-in",
  },
  "wipe-out-down": {
    keyframes: "from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 100% 0)}",
    duration: 500,
    easing: "ease-in",
  },
  disappear: { keyframes: "from{opacity:1}to{opacity:0}", duration: 1, easing: "linear" },
};

// ── 路径 motion（CSS offset-path，无 GSAP 依赖）──
const MOTION: Record<string, AnimPreset> = {
  "motion-line": { keyframes: "from{offset-distance:0%}to{offset-distance:100%}", duration: 1200, easing: "linear" },
  "motion-arc": {
    keyframes: "from{offset-distance:0%}to{offset-distance:100%}",
    duration: 1400,
    easing: "ease-in-out",
  },
  "motion-custom": { keyframes: "from{offset-distance:0%}to{offset-distance:100%}", duration: 1500, easing: "linear" },
};
/** motion 预设的默认 offset-path（相对元素盒中心）。 */
const MOTION_PATH: Record<string, string> = {
  "motion-line": 'path("M -140,0 L 140,0")',
  "motion-arc": 'path("M -140,40 Q 0,-140 140,40")',
};

export const ANIM_PRESETS: Record<string, AnimPreset> = { ...ENTRANCE, ...EMPHASIS, ...EXIT, ...MOTION };
export const ENTRANCE_NAMES = Object.keys(ENTRANCE);
export const EMPHASIS_NAMES = Object.keys(EMPHASIS);
export const EXIT_NAMES = Object.keys(EXIT);
export const MOTION_NAMES = Object.keys(MOTION);

/** 生成全部预设的 @keyframes（注入一次）。 */
export function animKeyframesCss(): string {
  return Object.entries(ANIM_PRESETS)
    .map(([name, p]) => `@keyframes oa-${name}{${p.keyframes}}`)
    .join("\n");
}

export interface AnimInput {
  name: string;
  duration?: number;
  delay?: number;
  easing?: string;
  stagger?: number;
  order?: number;
  /** motion-custom 自定义路径（SVG path 字符串）。 */
  path?: string;
}

/**
 * 生成元素动画的内联样式。
 *  - index：列表/图表子项错落（stagger）
 *  - order：sequence 编序（元素级，order 递增则递延）
 *  - motion-*：返回 offset-path + 路径动画
 */
export function animInlineStyle(anim: AnimInput | undefined, index = 0): string {
  if (!anim?.name || !ANIM_PRESETS[anim.name]) return "";
  const p = ANIM_PRESETS[anim.name];
  const dur = anim.duration ?? p.duration;
  const stagger = anim.stagger ?? 0;
  // 序列递延：有 stagger 用 stagger，否则默认 200ms 间隔
  const seqGap = anim.order ? stagger || 200 : 0;
  const delay = (anim.delay ?? 0) + index * stagger + (anim.order ?? 0) * seqGap;
  const easing = anim.easing ?? p.easing;
  const iters = anim.name in EMPHASIS ? "2" : "1";

  if (anim.name.startsWith("motion-")) {
    const path = anim.path ?? MOTION_PATH[anim.name] ?? 'path("M 0,0 L 200,0")';
    return `offset-path:${path};offset-rotate:0deg;animation:oa-${anim.name} ${dur}ms ${easing} ${delay}ms ${iters} both;`;
  }
  return `animation:oa-${anim.name} ${dur}ms ${easing} ${delay}ms ${iters} both;`;
}

/** 校验动画名是否已知。 */
export function isKnownAnim(name: string): boolean {
  return name in ANIM_PRESETS;
}
