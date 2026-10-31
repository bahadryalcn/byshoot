import { it, expect } from "vitest";
import {
  captureViewportSize,
  captureViewportMatches,
} from "./capture-viewport";
it("maps physical screenshots to matching logical viewports at common display scales", () => {
  for (const [scale, width, height] of [
    [1, 1920, 1080],
    [1.25, 1536, 864],
    [1.5, 1280, 720],
    [2, 960, 540],
  ]) {
    const capture = { width: 1920, height: 1080, scaleFactor: scale };
    expect(captureViewportSize(capture)).toEqual({ width, height });
    expect(captureViewportMatches(capture, { width, height })).toBe(true);
  }
});
it("rejects the prewarmed window size before fullscreen viewport resize completes", () => {
  expect(
    captureViewportMatches(
      { width: 1920, height: 1080, scaleFactor: 1.25 },
      { width: 800, height: 600 },
    ),
  ).toBe(false);
});
it("allows browser rounding of fractional CSS display pixels", () => {
  expect(
    captureViewportSize({ width: 1366, height: 768, scaleFactor: 1.25 }),
  ).toEqual({ width: 1092.8, height: 614.4 });
  expect(
    captureViewportMatches(
      { width: 1366, height: 768, scaleFactor: 1.25 },
      { width: 1093, height: 614 },
    ),
  ).toBe(true);
});
