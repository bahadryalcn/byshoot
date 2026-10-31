import { describe, it, expect } from "vitest";
import { elapsedLabel } from "./recording";
describe("recording clock", () => {
  it("keeps elapsed recording duration readable across minute and hour boundaries", () => {
    expect(elapsedLabel(0)).toBe("00:00");
    expect(elapsedLabel(65)).toBe("01:05");
    expect(elapsedLabel(3601)).toBe("60:01");
  });
});
