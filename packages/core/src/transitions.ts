/**
 * @oneact/core — 页面切换 transition（兼容 PPT/WPS 心智）
 *
 * 翻页时：旧页加 -exit 动画，新页加 -enter 动画。
 * morph 平滑切换：此处给降级（淡入），真正 FLIP 由 player 在浏览器侧增强。
 */
interface TrDef {
  enter: string;
  exit: string;
}

const TRANSITIONS: Record<string, TrDef> = {
  fade: { enter: "from{opacity:0}to{opacity:1}", exit: "from{opacity:1}to{opacity:0}" },
  "push-left": {
    enter: "from{transform:translateX(100%)}to{transform:translateX(0)}",
    exit: "from{transform:translateX(0)}to{transform:translateX(-100%)}",
  },
  "push-right": {
    enter: "from{transform:translateX(-100%)}to{transform:translateX(0)}",
    exit: "from{transform:translateX(0)}to{transform:translateX(100%)}",
  },
  "push-up": {
    enter: "from{transform:translateY(100%)}to{transform:translateY(0)}",
    exit: "from{transform:translateY(0)}to{transform:translateY(-100%)}",
  },
  "push-down": {
    enter: "from{transform:translateY(-100%)}to{transform:translateY(0)}",
    exit: "from{transform:translateY(0)}to{transform:translateY(100%)}",
  },
  "wipe-left": {
    enter: "from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}",
    exit: "from{opacity:1}to{opacity:1}",
  },
  "wipe-right": {
    enter: "from{clip-path:inset(0 0 0 100%)}to{clip-path:inset(0 0 0 0)}",
    exit: "from{opacity:1}to{opacity:1}",
  },
  "cover-left": {
    enter: "from{transform:translateX(100%)}to{transform:translateX(0)}",
    exit: "from{opacity:1}to{opacity:1}",
  },
  "cover-right": {
    enter: "from{transform:translateX(-100%)}to{transform:translateX(0)}",
    exit: "from{opacity:1}to{opacity:1}",
  },
  "uncover-left": {
    enter: "from{opacity:1}to{opacity:1}",
    exit: "from{transform:translateX(0)}to{transform:translateX(-100%)}",
  },
  zoom: {
    enter: "from{opacity:0;transform:scale(1.12)}to{opacity:1;transform:scale(1)}",
    exit: "from{opacity:1}to{opacity:0}",
  },
  blinds: {
    enter: "from{clip-path:inset(0 0 100% 0)}to{clip-path:inset(0 0 0 0)}",
    exit: "from{opacity:1}to{opacity:0}",
  },
  checkerboard: {
    enter: "from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}",
    exit: "from{opacity:1}to{opacity:0}",
  },
  morph: { enter: "from{opacity:.4}to{opacity:1}", exit: "from{opacity:1}to{opacity:.4}" },
};

export const TRANSITION_NAMES = Object.keys(TRANSITIONS);

export function isKnownTransition(name: string): boolean {
  return name in TRANSITIONS;
}

/** 生成全部切换预设的 enter/exit @keyframes（注入一次）。 */
export function transitionKeyframesCss(): string {
  return Object.entries(TRANSITIONS)
    .map(([name, d]) => `@keyframes oa-tr-${name}-enter{${d.enter}}\n@keyframes oa-tr-${name}-exit{${d.exit}}`)
    .join("\n");
}

/** 取切换的页面内联 animation 样式。未知名称降级 fade。 */
export function transitionStyle(name: string, dir: "enter" | "exit", duration?: number, easing?: string): string {
  const n = isKnownTransition(name) ? name : "fade";
  const dur = duration ?? 500;
  const e = easing ?? "ease";
  return `animation:oa-tr-${n}-${dir} ${dur}ms ${e} both;`;
}
