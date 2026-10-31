import type { Rect, Point } from "./drawing";

export function guideMonitor(
  screens: Rect[],
  pointer: Point | undefined,
  initial: number | undefined,
  viewport: Size,
): Rect {
  return (
    screens.find(
      (r) =>
        pointer &&
        pointer.x >= r.x &&
        pointer.x < r.x + r.width &&
        pointer.y >= r.y &&
        pointer.y < r.y + r.height,
    ) ??
    screens[initial ?? 0] ?? { x: 0, y: 0, ...viewport }
  );
}

export interface Size {
  width: number;
  height: number;
}
// All inputs use one coordinate space (capture pixels or CSS pixels).
export function interactionMonitor(
  screens: Rect[],
  pointer: Point | undefined,
  selection: Rect | null,
  initial: number | undefined,
  viewport: Size,
): Rect {
  const hit = screens.find(
    (r) =>
      pointer &&
      pointer.x >= r.x &&
      pointer.x < r.x + r.width &&
      pointer.y >= r.y &&
      pointer.y < r.y + r.height,
  );
  if (hit) return hit;
  if (selection && screens.length) {
    const area = (r: Rect) =>
      Math.max(
        0,
        Math.min(selection.x + selection.width, r.x + r.width) -
          Math.max(selection.x, r.x),
      ) *
      Math.max(
        0,
        Math.min(selection.y + selection.height, r.y + r.height) -
          Math.max(selection.y, r.y),
      );
    const best = screens.reduce((a, b) => (area(b) > area(a) ? b : a));
    if (area(best) > 0) return best;
  }
  return guideMonitor(screens, undefined, initial, viewport);
}
export function placeMonitorPanel(
  monitor: Rect,
  size: Size,
  edge: "center" | "bottom" = "center",
  margin = 16,
): Rect {
  const width = Math.min(size.width, Math.max(0, monitor.width - 2 * margin)),
    height = Math.min(size.height, Math.max(0, monitor.height - 2 * margin));
  return {
    x: monitor.x + (monitor.width - width) / 2,
    y:
      edge === "bottom"
        ? monitor.y + monitor.height - height - margin
        : monitor.y + (monitor.height - height) / 2,
    width,
    height,
  };
}
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
const clamp = (v: number, max: number) =>
  Math.max(8, Math.min(v, Math.max(8, max)));
export function placeEditorPanels(
  selection: Rect,
  viewport: Size,
  dockSize: Size,
  badgeSize: Size,
  screens?: Rect[],
): { dock: Rect; badge: Rect } {
  if (screens?.length) {
    const area = (r: Rect) =>
      Math.max(
        0,
        Math.min(selection.x + selection.width, r.x + r.width) -
          Math.max(selection.x, r.x),
      ) *
      Math.max(
        0,
        Math.min(selection.y + selection.height, r.y + r.height) -
          Math.max(selection.y, r.y),
      );
    const screen = screens.reduce((best, r) =>
      area(r) > area(best) ? r : best,
    );
    const local = placeEditorPanels(
      { ...selection, x: selection.x - screen.x, y: selection.y - screen.y },
      screen,
      dockSize,
      badgeSize,
    );
    return {
      dock: {
        ...local.dock,
        x: local.dock.x + screen.x,
        y: local.dock.y + screen.y,
      },
      badge: {
        ...local.badge,
        x: local.badge.x + screen.x,
        y: local.badge.y + screen.y,
      },
    };
  }
  const dock = {
    width: Math.min(dockSize.width, Math.max(0, viewport.width - 16)),
    height: dockSize.height,
  };
  const badge = {
    width: Math.min(badgeSize.width, Math.max(0, viewport.width - 16)),
    height: badgeSize.height,
  };
  const inside = (r: Rect) =>
    r.x >= 8 &&
    r.y >= 8 &&
    r.x + r.width <= viewport.width - 8 &&
    r.y + r.height <= viewport.height - 8;
  const at = (x: number, y: number, size: Size): Rect => ({ x, y, ...size });
  const x = clamp(selection.x, viewport.width - dock.width - 8);
  const candidates = [
    at(x, selection.y + selection.height + 8, dock),
    at(x, selection.y - dock.height - 8, dock),
    at(
      selection.x + selection.width + 8,
      clamp(selection.y, viewport.height - dock.height - 8),
      dock,
    ),
    at(
      selection.x - dock.width - 8,
      clamp(selection.y, viewport.height - dock.height - 8),
      dock,
    ),
  ];
  const dockRect =
    candidates.find(inside) ??
    at(
      x,
      clamp(
        selection.y + selection.height - dock.height - 8,
        viewport.height - dock.height - 8,
      ),
      dock,
    );
  const badgeX = clamp(selection.x, viewport.width - badge.width - 8);
  const badgeCandidates = [
    at(badgeX, selection.y - badge.height - 6, badge),
    at(badgeX, selection.y + 6, badge),
    at(
      clamp(
        selection.x + selection.width - badge.width,
        viewport.width - badge.width - 8,
      ),
      selection.y + 6,
      badge,
    ),
    at(8, 8, badge),
    at(viewport.width - badge.width - 8, 8, badge),
    at(8, viewport.height - badge.height - 8, badge),
    at(
      viewport.width - badge.width - 8,
      viewport.height - badge.height - 8,
      badge,
    ),
  ];
  const badgeRect =
    badgeCandidates.find((r) => inside(r) && !overlaps(r, dockRect)) ??
    at(badgeX, 8, badge);
  return { dock: dockRect, badge: badgeRect };
}
