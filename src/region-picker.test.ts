import { describe, expect, it } from "vitest";
import { regionBetween } from "./region-picker";

describe("regionBetween", () => {
  it("normalizes a drag in either direction", () => {
    expect(regionBetween({ x: 80, y: 70 }, { x: 20, y: 10 })).toEqual({ x: 20, y: 10, width: 60, height: 60 });
  });
});
