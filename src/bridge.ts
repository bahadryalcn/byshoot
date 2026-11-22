import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  Settings,
  Capture,
  HistoryEntry,
  CaptureAction,
} from "./contracts";
import { mergeSettings } from "./contracts";
export const native = isTauri();
export interface NativeStatus {
  shortcutError: string | null;
  settingsError?: string | null;
  nativeVersion?: string;
  executablePath?: string | null;
}
export interface UploadResult {
  url: string;
  copied: boolean;
  closed: boolean;
}
function readStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem("byshoot.settings");
    return mergeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeSettings(null);
  }
}
export const api = {
  status: () =>
    native
      ? invoke<NativeStatus>("get_native_status")
      : Promise.resolve<NativeStatus>({ shortcutError: null }),
  getSettings: async (): Promise<Settings> =>
    native
      ? mergeSettings(await invoke<unknown>("get_settings"))
      : readStoredSettings(),
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
  upload: (dataUrl: string) =>
    invoke<UploadResult>("upload_image", { dataUrl }),
  close: (captureId?: string) =>
    native
      ? invoke("close_capture", { captureId: captureId ?? null })
      : Promise.resolve(),
  abort: (captureId: string, message: string) =>
    invoke("abort_capture", { captureId, message }),
  history: () =>
    native ? invoke<HistoryEntry[]>("get_history") : Promise.resolve([]),
  deleteHistory: (id: string) =>
    native ? invoke<void>("delete_history_entry", { id }) : Promise.resolve(),
  clearHistory: () =>
    native ? invoke<void>("clear_history") : Promise.resolve(),
  open: (location: string) => invoke("open_location", { location }),
  quit: () => invoke("quit_app"),
};
