import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Settings,
  Capture,
  HistoryEntry,
  CaptureAction,
} from "./contracts";
import { defaultSettings } from "./contracts";
export const native = isTauri();
export const api = {
  status: () =>
    native
      ? invoke<{ shortcutError: string | null }>("get_native_status")
      : Promise.resolve({ shortcutError: null }),
  getSettings: () =>
    native
      ? invoke<Settings>("get_settings")
      : Promise.resolve(
          JSON.parse(
            localStorage.getItem("byshoot.settings") ||
              JSON.stringify(defaultSettings),
          ),
        ),
  saveSettings: async (settings: Settings) => {
    if (native) await invoke("save_settings", { settings });
    else localStorage.setItem("byshoot.settings", JSON.stringify(settings));
  },
  capture: (action: CaptureAction = "region") =>
    invoke("start_capture", { action }),
  getCapture: () => invoke<Capture>("get_capture"),
  present: (captureId: string) => invoke("present_capture", { captureId }),
  copy: (dataUrl: string) => invoke("copy_image", { dataUrl }),
  save: (dataUrl: string) => invoke<string | null>("save_image", { dataUrl }),
  upload: (dataUrl: string) => invoke<string>("upload_image", { dataUrl }),
  close: (captureId?: string) =>
    native
      ? invoke("close_capture", { captureId: captureId ?? null })
      : Promise.resolve(),
  abort: (captureId: string, message: string) =>
    invoke("abort_capture", { captureId, message }),
  history: () =>
    native ? invoke<HistoryEntry[]>("get_history") : Promise.resolve([]),
  open: (location: string) => invoke("open_location", { location }),
  quit: () => invoke("quit_app"),
};
