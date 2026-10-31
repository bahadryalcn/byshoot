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
  ctx.lineWidth = s.width;
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
      block = Math.max(12, Math.round(s.width * 4));
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
    ctx.font = `600 ${Math.max(16, s.width * 5)}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    (s.text || "")
      .split("\n")
      .forEach((line, i) =>
        ctx.fillText(line, a.x, a.y + i * Math.max(20, s.width * 6)),
      );
  } else if (s.tool === "marker") {
    const radius = Math.max(14, s.width * 4);
    ctx.beginPath();
    ctx.arc(a.x, a.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
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
        ctx.lineWidth = s.width * 5;
      }
      ctx.moveTo(a.x, a.y);
      s.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      if (s.points.length === 1) ctx.lineTo(a.x + 0.01, a.y);
      if (s.tool === "arrow") {
        const h = arrowHead(a, b, Math.max(12, s.width * 4));
        ctx.moveTo(h[0].x, h[0].y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(h[1].x, h[1].y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
