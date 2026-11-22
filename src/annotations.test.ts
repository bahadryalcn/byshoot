import { describe, expect, it } from "vitest";
import {
  StrokeHistory,
  distToSegment,
  hitStroke,
  hitTopmost,
  strokeBounds,
  translateStroke,
} from "./annotations";
import type { Stroke } from "./drawing";

const measure = (t: string) => t.length * 10;
const mk = (s: Partial<Stroke> & Pick<Stroke, "tool" | "points">): Stroke => ({
  color: "#f00",
  width: 4,
  ...s,
});

describe("hit-testing", () => {
  it("distToSegment clamps to endpoints", () => {
    expect(distToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(distToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
  it("arrow hits near the line only", () => {
    const s = mk({ tool: "arrow", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    expect(hitStroke(s, { x: 50, y: 4 }, 3, measure)).toBe(true);
    expect(hitStroke(s, { x: 50, y: 20 }, 3, measure)).toBe(false);
  });
  it("pen and highlight follow polyline", () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
    expect(hitStroke(mk({ tool: "pen", points: pts }), { x: 50, y: 25 }, 2, measure)).toBe(true);
    expect(hitStroke(mk({ tool: "pen", points: pts }), { x: 10, y: 40 }, 2, measure)).toBe(false);
    // highlight is 5x wider
    expect(hitStroke(mk({ tool: "highlight", points: pts }), { x: 55, y: 25 }, 0, measure)).toBe(true);
  });
  it("rectangle is outline only", () => {
    const s = mk({ tool: "rectangle", points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] });
    expect(hitStroke(s, { x: 1, y: 50 }, 2, measure)).toBe(true);
    expect(hitStroke(s, { x: 50, y: 50 }, 2, measure)).toBe(false);
    expect(hitStroke(s, { x: 150, y: 50 }, 2, measure)).toBe(false);
  });
  it("ellipse is outline only", () => {
    const s = mk({ tool: "ellipse", points: [{ x: 0, y: 0 }, { x: 100, y: 60 }] });
    expect(hitStroke(s, { x: 100, y: 30 }, 2, measure)).toBe(true);
    expect(hitStroke(s, { x: 50, y: 30 }, 2, measure)).toBe(false);
    expect(hitStroke(s, { x: 5, y: 5 }, 2, measure)).toBe(false); // bbox corner
  });
  it("text uses measured bbox", () => {
    const s = mk({ tool: "text", points: [{ x: 10, y: 10 }], text: "abc\nde" });
    const b = strokeBounds(s, measure)!;
    expect(b).toMatchObject({ x: 10, y: 10, width: 30 });
    expect(b.height).toBe(2 * 24);
    expect(hitStroke(s, { x: 20, y: 30 }, 0, measure)).toBe(true);
    expect(hitStroke(s, { x: 60, y: 30 }, 0, measure)).toBe(false);
  });
  it("marker circle and pixelate rect", () => {
    const m = mk({ tool: "marker", points: [{ x: 50, y: 50 }], number: 1 });
    expect(hitStroke(m, { x: 50, y: 50 + 15 }, 0, measure)).toBe(true);
    expect(hitStroke(m, { x: 50, y: 50 + 17 }, 0, measure)).toBe(false);
    const px = mk({ tool: "pixelate", points: [{ x: 0, y: 0 }, { x: 20, y: 20 }] });
    expect(hitStroke(px, { x: 10, y: 10 }, 0, measure)).toBe(true);
    expect(hitStroke(px, { x: 30, y: 10 }, 0, measure)).toBe(false);
  });
  it("scale grows hit area", () => {
    const s = mk({ tool: "marker", points: [{ x: 0, y: 0 }], scale: 2 });
    expect(hitStroke(s, { x: 30, y: 0 }, 0, measure)).toBe(true);
  });
  it("topmost wins", () => {
    const a = mk({ tool: "pixelate", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] });
    const b = mk({ tool: "pixelate", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] });
    expect(hitTopmost([a, b], { x: 10, y: 10 }, 0, measure)).toBe(1);
    expect(hitTopmost([a, b], { x: 90, y: 10 }, 0, measure)).toBe(-1);
  });
});

describe("move + history", () => {
  const rect = mk({ tool: "rectangle", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] });
  it("translateStroke does not mutate", () => {
    const t = translateStroke(rect, { x: 5, y: -2 });
    expect(t.points).toEqual([{ x: 5, y: -2 }, { x: 15, y: 8 }]);
    expect(rect.points[0]).toEqual({ x: 0, y: 0 });
  });
  it("one drag = one undo entry, redo restores", () => {
    const h = new StrokeHistory();
    h.add(rect);
    const moved = translateStroke(rect, { x: 7, y: 7 });
    h.replace(0, moved);
    expect(h.strokes[0]).toBe(moved);
    h.undo();
    expect(h.strokes[0]).toBe(rect);
    h.redo();
    expect(h.strokes[0]).toBe(moved);
  });
  it("delete and text edit are undoable; new commit clears redo", () => {
    const h = new StrokeHistory();
    const t = mk({ tool: "text", points: [{ x: 0, y: 0 }], text: "a" });
    h.add(t);
    h.replace(0, { ...t, text: "b" });
    h.remove(0);
    expect(h.strokes).toEqual([]);
    h.undo();
    expect(h.strokes[0].text).toBe("b");
    h.undo();
    expect(h.strokes[0]).toBe(t);
    expect(h.canRedo).toBe(true);
    h.add(rect);
    expect(h.canRedo).toBe(false);
    h.reset();
    expect(h.canUndo).toBe(false);
  });
});
