import { describe, it, expect } from "vitest";
import {
  placeEditorPanels,
  overlaps,
  guideMonitor,
  interactionMonitor,
  placeMonitorPanel,
} from "./editor-layout";
describe("dialogs and feedback on multiple monitors", () => {
  const screens = [
    { x: 0, y: 1080, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 1077, width: 1920, height: 1080 },
  ];
  const viewport = { width: 3840, height: 2160 };
  it("uses the note click monitor even when the selection covers all three screens", () => {
    expect(
      interactionMonitor(
        screens,
        { x: 2500, y: 1500 },
        { x: 0, y: 0, ...viewport },
        0,
        viewport,
      ),
    ).toEqual(screens[2]);
  });
  it("uses the selection monitor for keyboard actions without a pointer", () => {
    expect(
      interactionMonitor(
        screens,
        undefined,
        { x: 200, y: 100, width: 500, height: 500 },
        0,
        viewport,
      ),
    ).toEqual(screens[1]);
    expect(interactionMonitor(screens, undefined, null, 2, viewport)).toEqual(
      screens[2],
    );
  });
  it("never centers dialogs or bottom feedback in a desktop gap", () => {
    for (const screen of screens)
      for (const edge of ["center", "bottom"] as const) {
        const r = placeMonitorPanel(screen, { width: 388, height: 280 }, edge);
        expect(r.x).toBeGreaterThanOrEqual(screen.x + 16);
        expect(r.y).toBeGreaterThanOrEqual(screen.y + 16);
        expect(r.x + r.width).toBeLessThanOrEqual(screen.x + screen.width - 16);
        expect(r.y + r.height).toBeLessThanOrEqual(
          screen.y + screen.height - 16,
        );
      }
  });
  it("fits large dialogs on narrow monitors after CSS scaling or resizing", () => {
    expect(
      placeMonitorPanel(
        { x: 1200, y: 0, width: 320, height: 240 },
        { width: 388, height: 600 },
      ),
    ).toEqual({ x: 1216, y: 16, width: 288, height: 208 });
  });
});
describe("editor panel placement", () => {
  it("puts the guide on the initial cursor monitor and follows monitor changes", () => {
    const screens = [
      { x: 0, y: 1080, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 1077, width: 1920, height: 1080 },
    ];
    const viewport = { width: 3840, height: 2160 };
    expect(guideMonitor(screens, undefined, 2, viewport)).toEqual(screens[2]);
    expect(guideMonitor(screens, { x: 900, y: 50 }, 2, viewport)).toEqual(
      screens[1],
    );
    expect(guideMonitor(screens, { x: 900, y: 1800 }, 2, viewport)).toEqual(
      screens[0],
    );
    expect(guideMonitor([], undefined, undefined, viewport)).toEqual({
      x: 0,
      y: 0,
      ...viewport,
    });
  });
  const dock = { width: 426, height: 88 },
    badge = { width: 110, height: 22 };
  it("keeps controls on a real monitor instead of an empty desktop gap", () => {
    const p = placeEditorPanels(
      { x: 500, y: 970, width: 200, height: 100 },
      { width: 3840, height: 1440 },
      dock,
      badge,
      [
        { x: 0, y: 0, width: 1920, height: 1080 },
        { x: 1920, y: 0, width: 1920, height: 1440 },
      ],
    );
    for (const r of [p.dock, p.badge]) {
      expect(r.x + r.width).toBeLessThanOrEqual(1912);
      expect(r.y + r.height).toBeLessThanOrEqual(1072);
    }
    expect(overlaps(p.dock, p.badge)).toBe(false);
  });
  it("moves the entire dock above a selection at the bottom edge", () => {
    const p = placeEditorPanels(
      { x: 700, y: 970, width: 200, height: 100 },
      { width: 1920, height: 1080 },
      dock,
      badge,
    );
    expect(p.dock.y + p.dock.height).toBeLessThanOrEqual(962);
    expect(overlaps(p.dock, p.badge)).toBe(false);
  });
  it("keeps wrapped toolbar rows together on a narrow viewport", () => {
    const p = placeEditorPanels(
      { x: 280, y: 185, width: 35, height: 50 },
      { width: 320, height: 240 },
      { width: 304, height: 150 },
      badge,
    );
    expect(p.dock.x + p.dock.width).toBeLessThanOrEqual(312);
    expect(p.dock.y + p.dock.height).toBeLessThanOrEqual(232);
    expect(overlaps(p.dock, p.badge)).toBe(false);
  });
  it("keeps panels inside all screen edges without mutual intersections", () => {
    for (const viewport of [
      { width: 740, height: 570 },
      { width: 1920, height: 1080 },
      { width: 320, height: 240 },
    ]) {
      for (const x of [0, viewport.width / 2, viewport.width - 3])
        for (const y of [0, viewport.height / 2, viewport.height - 3]) {
          for (const selection of [
            { x, y, width: 3, height: 3 },
            { x: 0, y: 0, ...viewport },
          ]) {
            const p = placeEditorPanels(
              selection,
              viewport,
              { width: Math.min(426, viewport.width - 16), height: 88 },
              badge,
            );
            for (const r of [p.dock, p.badge]) {
              expect(r.x).toBeGreaterThanOrEqual(8);
              expect(r.y).toBeGreaterThanOrEqual(8);
              expect(r.x + r.width).toBeLessThanOrEqual(viewport.width - 8);
              expect(r.y + r.height).toBeLessThanOrEqual(viewport.height - 8);
            }
            expect(overlaps(p.dock, p.badge)).toBe(false);
          }
        }
    }
  });
});
