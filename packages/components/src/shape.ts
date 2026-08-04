/**
 * @oneact/components — 形状组件（rect / ellipse / line / triangle / diamond / chevron）
 */
import type { AnyElement, ShapeKind } from "@oneact/schema";

export function shape(el: AnyElement): string {
  if (el.type !== "shape") return "";
  const p = el.props;
  const fill = p.fill ?? "var(--oa-color-primary)";
  const stroke = p.stroke;
  const sw = p.strokeWidth ?? 0;
  const radius = p.radius ?? 0;
  const strokeStyle = stroke ? `border:${sw}px solid ${stroke};` : "";

  switch (p.shape) {
    case "rect":
      return `<div style="width:100%;height:100%;background:${fill};border-radius:${radius}px;${strokeStyle}"></div>`;
    case "ellipse":
      return `<div style="width:100%;height:100%;background:${fill};border-radius:50%;${strokeStyle}"></div>`;
    case "line": {
      const c = stroke ?? fill;
      return `<div style="width:100%;height:100%;display:flex;align-items:center;"><div style="width:100%;height:${Math.max(sw, 2)}px;background:${c};border-radius:2px;"></div></div>`;
    }
    case "triangle":
      return `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block"><polygon points="50,8 94,92 6,92" fill="${fill}" stroke="${stroke ?? "none"}" stroke-width="${sw}"/></svg>`;
    case "diamond":
      return `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block"><polygon points="50,4 96,50 50,96 4,50" fill="${fill}" stroke="${stroke ?? "none"}" stroke-width="${sw}"/></svg>`;
    case "chevron":
      return `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block"><polygon points="${chevronPts(p.direction ?? "right")}" fill="${fill}"/></svg>`;
    default:
      return `<div style="width:100%;height:100%;background:${fill}"></div>`;
  }
}

function chevronPts(dir: string): string {
  switch (dir) {
    case "left":
      return "92,8 42,50 92,92 72,92 22,50 72,8";
    case "up":
      return "8,92 50,42 92,92 92,72 50,22 8,72";
    case "down":
      return "8,8 50,58 92,8 92,28 50,78 8,28";
    case "right":
    default:
      return "8,8 58,50 8,92 28,92 78,50 28,8";
  }
}
