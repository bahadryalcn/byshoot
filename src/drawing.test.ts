import { describe, it, expect, vi } from "vitest";
import {
  rectBetween,
  cropBounds,
  moveRect,
  screenPoint,
  arrowHead,
  paintStroke,
  isDegenerateStroke,
  hitHandle,
  resizeByHandle,
  handleCursor,
  contrastText,
  pixelateBlock,
  type Stroke,
} from "./drawing";
describe("capture geometry", () => {
  it("keeps a drag across three monitor boundaries in one crop at mixed renderer DPI", () => {
    const display = { x: 0, y: 0, width: 5120, height: 1440 };
    const start = screenPoint({ x: 240, y: 160 }, display, 7680, 2160);
    const end = screenPoint({ x: 4800, y: 1200 }, display, 7680, 2160);
    expect(cropBounds(rectBetween(start, end), 7680, 2160)).toEqual({
      x: 360,
      y: 240,
      width: 6840,
      height: 1560,
    });
    expect(cropBounds(rectBetween(end, start), 7680, 2160)).toEqual({
      x: 360,
      y: 240,
      width: 6840,
      height: 1560,
    });
  });
  it("normalizes reverse drag", () =>
    expect(rectBetween({ x: 80, y: 90 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 60,
      height: 60,
    }));
  it("maps Retina CSS coordinates to captured pixels without devicePixelRatio assumptions", () =>
    expect(
      screenPoint(
        { x: 250, y: 125 },
        { x: 0, y: 0, width: 1000, height: 500 },
        2000,
        1000,
      ),
    ).toEqual({ x: 500, y: 250 }));
  it("rounds outward and clips crop to valid pixels", () =>
    expect(
      cropBounds({ x: -1.5, y: 5.5, width: 10, height: 99 }, 100, 50),
    ).toEqual({ x: 0, y: 5, width: 9, height: 45 }));
  it("clamps selection moves without shrinking", () =>
    expect(
      moveRect(
        { x: 30, y: 20, width: 80, height: 50 },
        { x: 200, y: -90 },
        150,
        100,
      ),
    ).toEqual({ x: 70, y: 0, width: 80, height: 50 }));
  it("points arrow wings behind endpoint", () => {
    const h = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(h[0].x).toBeLessThan(100);
    expect(h[0].y).toBeLessThan(0);
    expect(h[1].y).toBeGreaterThan(0);
  });
});
function fakeCtx() {
  const calls = {
    arc: [] as number[][],
    fillText: [] as string[],
    fonts: [] as string[],
    widths: [] as number[],
  };
  const ctx: any = {
    canvas: { width: 1000, height: 1000 },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: (...a: number[]) => calls.arc.push(a),
    fillText: (t: string) => calls.fillText.push(t),
    set font(v: string) {
      calls.fonts.push(v);
    },
    set lineWidth(v: number) {
      calls.widths.push(v);
    },
  };
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}
const stroke = (over: Partial<Stroke>): Stroke => ({
  tool: "pen",
  points: [{ x: 10, y: 10 }],
  color: "#fa5f55",
  width: 4,
  ...over,
});
describe("high-DPI scaling", () => {
  it("scales marker radius, line width and font by scale", () => {
    const a = fakeCtx(),
      b = fakeCtx();
    paintStroke(a.ctx, stroke({ tool: "marker", number: 3 }));
    paintStroke(b.ctx, stroke({ tool: "marker", number: 3, scale: 2 }));
    expect(b.calls.arc[0][2]).toBe(a.calls.arc[0][2] * 2);
    expect(b.calls.widths[0]).toBe(a.calls.widths[0] * 2);
  });
  it("scales text size", () => {
    const b = fakeCtx();
    paintStroke(b.ctx, stroke({ tool: "text", text: "x", scale: 2 }));
    expect(b.calls.fonts[0]).toContain("40px");
  });
  it("pixelate block scales and grows with selection", () => {
    expect(pixelateBlock(4, 1, { width: 100, height: 100 })).toBe(16);
    expect(pixelateBlock(4, 2, { width: 100, height: 100 })).toBe(32);
    expect(pixelateBlock(4, 1, { width: 1600, height: 1000 })).toBe(63);
  });
  it("marker number contrasts with color", () => {
    expect(contrastText("#ffff00")).toBe("#000");
    expect(contrastText("#102030")).toBe("#fff");
  });
});
describe("zero-size strokes", () => {
  const two = (tool: Stroke["tool"], b: { x: number; y: number }) =>
    stroke({ tool, points: [{ x: 5, y: 5 }, b] });
  it("drops plain clicks for shapes", () => {
    for (const t of ["rectangle", "ellipse", "arrow", "pixelate"] as const)
      expect(isDegenerateStroke(two(t, { x: 6, y: 6 }))).toBe(true);
  });
  it("keeps real drags, markers, pen dots", () => {
    expect(isDegenerateStroke(two("rectangle", { x: 50, y: 40 }))).toBe(false);
    expect(isDegenerateStroke(two("arrow", { x: 50, y: 5 }))).toBe(false);
    expect(isDegenerateStroke(stroke({ tool: "marker" }))).toBe(false);
    expect(isDegenerateStroke(stroke({ tool: "pen" }))).toBe(false);
  });
});
describe("selection handles", () => {
  const r = { x: 100, y: 100, width: 200, height: 100 };
  it("hits corners and edges", () => {
    expect(hitHandle(r, { x: 101, y: 99 }, 12)).toBe("nw");
    expect(hitHandle(r, { x: 200, y: 101 }, 12)).toBe("n");
    expect(hitHandle(r, { x: 299, y: 150 }, 12)).toBe("e");
    expect(hitHandle(r, { x: 300, y: 200 }, 12)).toBe("se");
    expect(hitHandle(r, { x: 200, y: 150 }, 12)).toBeNull();
  });
  it("maps cursors", () => {
    expect(handleCursor("nw")).toBe("nwse-resize");
    expect(handleCursor("sw")).toBe("nesw-resize");
    expect(handleCursor("s")).toBe("ns-resize");
    expect(handleCursor("w")).toBe("ew-resize");
    expect(handleCursor("move")).toBe("move");
  });
  it("edge resize changes one axis only", () => {
    expect(resizeByHandle(r, "e", { x: 400, y: 999 })).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 100,
    });
    expect(resizeByHandle(r, "nw", { x: 50, y: 60 })).toEqual({
      x: 50,
      y: 60,
      width: 250,
      height: 140,
    });
  });
});
