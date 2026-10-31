import { describe, it, expect } from "vitest";
import {
  rectBetween,
  cropBounds,
  moveRect,
  screenPoint,
  arrowHead,
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
