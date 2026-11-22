import "./region-picker.css";
import { invoke } from "@tauri-apps/api/core";
import { api } from "./bridge";
import { setLanguage, t } from "./i18n";

type Point = { x: number; y: number };
export function regionBetween(a: Point, b: Point) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function mountRegionPicker(root: HTMLElement, monitorId: number) {
  document.documentElement.classList.add("region-picker-mode");
  document.body.classList.add("region-picker-mode");
  root.innerHTML = `<div class="region-picker"><div class="region-picker-help">${t("region.help")}</div><div class="region-selection" hidden><span></span></div></div>`;
  // Separate webview: apply the saved language, then refresh the help text.
  void api.getSettings().then(
    (s) => {
      setLanguage(s.language);
      const help = root.querySelector(".region-picker-help");
      if (help) help.textContent = t("region.help");
    },
    () => {},
  );
  const overlay = root.querySelector<HTMLElement>(".region-picker")!;
  const selection = root.querySelector<HTMLElement>(".region-selection")!;
  const size = selection.querySelector("span")!;
  let start: Point | null = null;
  let region: ReturnType<typeof regionBetween> | null = null;
  let closing = false;
  function finish(value: typeof region) {
    if (closing) return;
    closing = true;
    void invoke("finish_recording_region", { monitorId, region: value }).catch((error) => {
      closing = false;
      size.textContent = String(error);
    });
  }
  function update(event: PointerEvent) {
    if (!start) return;
    region = regionBetween(start, { x: event.clientX, y: event.clientY });
    selection.hidden = false;
    Object.assign(selection.style, { left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`, height: `${region.height}px` });
    size.textContent = `${Math.round(region.width)} × ${Math.round(region.height)}`;
  }
  overlay.onpointerdown = (event) => {
    if (event.button !== 0) return;
    if (region && event.clientX >= region.x && event.clientX <= region.x + region.width && event.clientY >= region.y && event.clientY <= region.y + region.height) return;
    start = { x: event.clientX, y: event.clientY };
    overlay.setPointerCapture(event.pointerId);
    update(event);
  };
  overlay.onpointermove = update;
  overlay.onpointerup = (event) => { update(event); start = null; };
  overlay.ondblclick = () => { if (region && region.width >= 2 && region.height >= 2) finish(region); };
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") finish(null);
    if (event.key === "Enter" && region && region.width >= 2 && region.height >= 2) finish(region);
  });
}
