export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export type Tool =
  | "select"
  | "pen"
  | "highlight"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"
  | "marker"
  | "pixelate";
export interface Stroke {
  tool: Exclude<Tool, "select">;
  points: Point[];
  color: string;
  width: number;
  text?: string;
  number?: number;
  /** Capture scaleFactor (device pixels per CSS pixel); sizes below are CSS px. */
  scale?: number;
}
export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLE_ORDER: HandleId[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export function selectionHandles(r: Rect): Array<Point & { id: HandleId }> {
  const cx = r.x + r.width / 2,
    cy = r.y + r.height / 2,
    x2 = r.x + r.width,
    y2 = r.y + r.height;
  const pts: Record<HandleId, Point> = {
    nw: { x: r.x, y: r.y },
    n: { x: cx, y: r.y },
    ne: { x: x2, y: r.y },
    e: { x: x2, y: cy },
    se: { x: x2, y: y2 },
    s: { x: cx, y: y2 },
    sw: { x: r.x, y: y2 },
    w: { x: r.x, y: cy },
  };
  return HANDLE_ORDER.map((id) => ({ id, ...pts[id] }));
}
/** Hit-test the 8 handles; corners win over edges. threshold in same units as p. */
export function hitHandle(
  r: Rect,
  p: Point,
  threshold: number,
): HandleId | null {
  let best: HandleId | null = null,
    bestDist = Infinity;
  for (const h of selectionHandles(r)) {
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < threshold && d < bestDist) {
      best = h.id;
      bestDist = d;
    }
  }
  return best;
}
/** New rect after dragging handle `id` to point p (normalized, may flip). */
export function resizeByHandle(r: Rect, id: HandleId, p: Point): Rect {
  let x1 = r.x,
    y1 = r.y,
    x2 = r.x + r.width,
    y2 = r.y + r.height;
  if (id.includes("w")) x1 = p.x;
  if (id.includes("e")) x2 = p.x;
  if (id.includes("n")) y1 = p.y;
  if (id.includes("s")) y2 = p.y;
  return rectBetween({ x: x1, y: y1 }, { x: x2, y: y2 });
}
export function handleCursor(id: HandleId | "move" | null): string {
  if (id === "nw" || id === "se") return "nwse-resize";
  if (id === "ne" || id === "sw") return "nesw-resize";
  if (id === "n" || id === "s") return "ns-resize";
  if (id === "e" || id === "w") return "ew-resize";
  if (id === "move") return "move";
  return "crosshair";
}
/** Drag-to-draw strokes with a tiny bbox (plain click) are not worth keeping. */
export function isDegenerateStroke(s: Stroke, min = 3): boolean {
  if (s.tool === "text" || s.tool === "marker") return false;
  const xs = s.points.map((p) => p.x),
    ys = s.points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs),
    h = Math.max(...ys) - Math.min(...ys);
  if (s.tool === "pen" || s.tool === "highlight") return false;
  if (s.tool === "arrow") return Math.hypot(w, h) < min;
  return w < min || h < min;
}
export function pixelateBlock(
  width: number,
  scale: number,
  bounds: { width: number; height: number },
): number {
  const base = Math.max(12 * scale, Math.round(width * 4 * scale));
  const grow = Math.round(Math.min(bounds.width, bounds.height) / 16);
  return Math.max(2, Math.max(base, grow));
}
/** Black or white, whichever contrasts better with the hex color. */
export function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return l > 0.179 ? "#000" : "#fff";
}
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
export function cropBounds(r: Rect, width: number, height: number): Rect {
  const x = clamp(Math.floor(r.x), 0, width),
    y = clamp(Math.floor(r.y), 0, height);
  return {
    x,
    y,
    width: Math.max(0, clamp(Math.ceil(r.x + r.width), 0, width) - x),
    height: Math.max(0, clamp(Math.ceil(r.y + r.height), 0, height) - y),
  };
}
export function moveRect(
  r: Rect,
  delta: Point,
  width: number,
  height: number,
): Rect {
  return {
    ...r,
    x: clamp(r.x + delta.x, 0, Math.max(0, width - r.width)),
    y: clamp(r.y + delta.y, 0, Math.max(0, height - r.height)),
  };
}
export function screenPoint(
  p: Point,
  display: Rect,
  width: number,
  height: number,
): Point {
  return {
    x: clamp(((p.x - display.x) * width) / display.width, 0, width),
    y: clamp(((p.y - display.y) * height) / display.height, 0, height),
  };
}
export function arrowHead(a: Point, b: Point, size: number): Point[] {
  const theta = Math.atan2(b.y - a.y, b.x - a.x);
  return [0.45, -0.45].map((offset) => ({
    x: b.x - size * Math.cos(theta + offset),
    y: b.y - size * Math.sin(theta + offset),
  }));
}
export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const a = s.points[0],
    b = s.points.at(-1);
  if (!a || !b) return;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  const k = s.scale && s.scale > 0 ? s.scale : 1;
  ctx.lineWidth = s.width * k;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const r = rectBetween(a, b);
  if (s.tool === "pixelate") {
    const bounds = cropBounds(r, ctx.canvas.width, ctx.canvas.height);
    if (!bounds.width || !bounds.height) {
      ctx.restore();
      return;
    }
    // Pixelate the actual composed pixels; export and preview use this same operation.
    const small = document.createElement("canvas"),
      block = pixelateBlock(s.width, k, bounds);
    small.width = Math.max(1, Math.ceil(bounds.width / block));
    small.height = Math.max(1, Math.ceil(bounds.height / block));
    const sc = small.getContext("2d")!;
    sc.drawImage(
      ctx.canvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      0,
      0,
      small.width,
      small.height,
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      small,
      0,
      0,
      small.width,
      small.height,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
    );
  } else if (s.tool === "text") {
    ctx.font = `600 ${Math.max(16, s.width * 5) * k}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    (s.text || "")
      .split("\n")
      .forEach((line, i) =>
        ctx.fillText(line, a.x, a.y + i * Math.max(20, s.width * 6) * k),
      );
  } else if (s.tool === "marker") {
    const radius = Math.max(14, s.width * 4) * k;
    ctx.beginPath();
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = contrastText(s.color);
    ctx.font = `700 ${radius}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(s.number || 1), a.x, a.y);
  } else {
    ctx.beginPath();
    if (s.tool === "rectangle") ctx.rect(r.x, r.y, r.width, r.height);
    else if (s.tool === "ellipse")
      ctx.ellipse(
        r.x + r.width / 2,
        r.y + r.height / 2,
        r.width / 2,
        r.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    else {
      if (s.tool === "highlight") {
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = s.width * 5 * k;
      }
      ctx.moveTo(a.x, a.y);
      s.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      if (s.points.length === 1) ctx.lineTo(a.x + 0.01, a.y);
      if (s.tool === "arrow" && Math.hypot(b.x - a.x, b.y - a.y) > 0.5) {
        const h = arrowHead(a, b, Math.max(12, s.width * 4) * k);
        ctx.moveTo(h[0].x, h[0].y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(h[1].x, h[1].y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
