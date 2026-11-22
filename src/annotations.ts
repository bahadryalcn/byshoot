import type { Point, Rect, Stroke } from "./drawing";
import { t } from "./i18n";

/** User-facing strings for annotation selection (resolved per current language). */
export const ANNOTATION_TEXT = {
  get editNoteTitle() {
    return t("annotation.editTitle");
  },
  get editNoteConfirm() {
    return t("annotation.editConfirm");
  },
  get addNoteTitle() {
    return t("annotation.addTitle");
  },
  get addNoteConfirm() {
    return t("annotation.addConfirm");
  },
};

export type TextMeasure = (text: string, font: string) => number;

const k = (s: Stroke) => (s.scale && s.scale > 0 ? s.scale : 1);
export const textFontSize = (s: Stroke) => Math.max(16, s.width * 5) * k(s);
export const textLineHeight = (s: Stroke) => Math.max(20, s.width * 6) * k(s);
export const textFont = (s: Stroke) =>
  `600 ${textFontSize(s)}px "Segoe UI", sans-serif`;
export const markerRadius = (s: Stroke) => Math.max(14, s.width * 4) * k(s);

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
  );
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p: Point, pts: Point[]): number {
  if (!pts.length) return Infinity;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
  return best;
}

function ends(s: Stroke): [Point, Point] | null {
  const a = s.points[0],
    b = s.points.at(-1);
  return a && b ? [a, b] : null;
}
function box(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Bounding box of a stroke in canvas pixels (text needs a measurer). */
export function strokeBounds(s: Stroke, measure: TextMeasure): Rect | null {
  const e = ends(s);
  if (!e) return null;
  const [a, b] = e;
  switch (s.tool) {
    case "text": {
      const lines = (s.text || "").split("\n"),
        font = textFont(s);
      const w = Math.max(1, ...lines.map((l) => measure(l, font)));
      return {
        x: a.x,
        y: a.y,
        width: w,
        height: Math.max(1, lines.length) * textLineHeight(s),
      };
    }
    case "marker": {
      const r = markerRadius(s);
      return { x: a.x - r, y: a.y - r, width: r * 2, height: r * 2 };
    }
    case "pen":
    case "highlight": {
      const xs = s.points.map((p) => p.x),
        ys = s.points.map((p) => p.y);
      const pad = (s.tool === "highlight" ? s.width * 5 : s.width) * k(s) / 2;
      const x = Math.min(...xs) - pad,
        y = Math.min(...ys) - pad;
      return {
        x,
        y,
        width: Math.max(...xs) + pad - x,
        height: Math.max(...ys) + pad - y,
      };
    }
    case "arrow": {
      const pad = (Math.max(12, s.width * 4) * k(s)) / 2 + (s.width * k(s)) / 2;
      const r = box(a, b);
      return {
        x: r.x - pad,
        y: r.y - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      };
    }
    default: {
      // rectangle, ellipse, pixelate
      const pad = s.tool === "pixelate" ? 0 : (s.width * k(s)) / 2;
      const r = box(a, b);
      return {
        x: r.x - pad,
        y: r.y - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      };
    }
  }
}

/** Does p (canvas px) hit stroke s? `slop` extra px of tolerance. */
export function hitStroke(
  s: Stroke,
  p: Point,
  slop: number,
  measure: TextMeasure,
): boolean {
  const e = ends(s);
  if (!e) return false;
  const [a, b] = e;
  const w = (s.width * k(s)) / 2;
  switch (s.tool) {
    case "pen":
      return distToPolyline(p, s.points) <= w + slop;
    case "highlight":
      return distToPolyline(p, s.points) <= (s.width * 5 * k(s)) / 2 + slop;
    case "arrow":
      return distToSegment(p, a, b) <= w + slop;
    case "marker":
      return Math.hypot(p.x - a.x, p.y - a.y) <= markerRadius(s) + slop;
    case "text": {
      const r = strokeBounds(s, measure)!;
      return inRect(p, r, slop);
    }
    case "pixelate":
      return inRect(p, box(a, b), slop);
    case "rectangle": {
      const r = box(a, b);
      if (!inRect(p, r, w + slop)) return false;
      const d = Math.min(
        Math.abs(p.x - r.x),
        Math.abs(p.x - (r.x + r.width)),
        Math.abs(p.y - r.y),
        Math.abs(p.y - (r.y + r.height)),
      );
      return d <= w + slop;
    }
    case "ellipse": {
      const r = box(a, b),
        rx = r.width / 2,
        ry = r.height / 2,
        cx = r.x + rx,
        cy = r.y + ry;
      const tol = w + slop;
      const outer = ellipseNorm(p, cx, cy, rx + tol, ry + tol);
      if (outer > 1) return false;
      const irx = rx - tol,
        iry = ry - tol;
      if (irx <= 0 || iry <= 0) return true;
      return ellipseNorm(p, cx, cy, irx, iry) >= 1;
    }
  }
  return false;
}

function ellipseNorm(
  p: Point,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  if (rx <= 0 || ry <= 0) return Infinity;
  return ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2;
}
function inRect(p: Point, r: Rect, pad: number): boolean {
  return (
    p.x >= r.x - pad &&
    p.x <= r.x + r.width + pad &&
    p.y >= r.y - pad &&
    p.y <= r.y + r.height + pad
  );
}

/** Index of the topmost stroke under p, or -1. */
export function hitTopmost(
  strokes: readonly Stroke[],
  p: Point,
  slop: number,
  measure: TextMeasure,
): number {
  for (let i = strokes.length - 1; i >= 0; i--)
    if (hitStroke(strokes[i], p, slop, measure)) return i;
  return -1;
}

/** New stroke translated by delta (original is untouched). */
export function translateStroke(s: Stroke, d: Point): Stroke {
  return {
    ...s,
    points: s.points.map((q) => ({ x: q.x + d.x, y: q.y + d.y })),
  };
}

/**
 * Snapshot-based undo/redo. Strokes are treated as immutable: every edit
 * commits a new array, so one drag / delete / text edit = one history entry.
 */
export class StrokeHistory {
  strokes: Stroke[] = [];
  private past: Stroke[][] = [];
  private future: Stroke[][] = [];
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  commit(next: Stroke[]) {
    this.past.push(this.strokes);
    this.strokes = next;
    this.future = [];
  }
  add(s: Stroke) {
    this.commit([...this.strokes, s]);
  }
  remove(index: number) {
    if (index < 0 || index >= this.strokes.length) return;
    this.commit(this.strokes.filter((_, i) => i !== index));
  }
  replace(index: number, s: Stroke) {
    if (index < 0 || index >= this.strokes.length) return;
    this.commit(this.strokes.map((o, i) => (i === index ? s : o)));
  }
  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) return false;
    this.future.push(this.strokes);
    this.strokes = prev;
    return true;
  }
  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.past.push(this.strokes);
    this.strokes = next;
    return true;
  }
  reset() {
    this.strokes = [];
    this.past = [];
    this.future = [];
  }
}
