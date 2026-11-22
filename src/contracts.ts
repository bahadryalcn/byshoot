export type CaptureAction = "region" | "fullscreenSave" | "fullscreenUpload";
export interface Settings {
  autoCopyLink: boolean;
  closeAfterUpload: boolean;
  notifications: boolean;
  rememberRegion: boolean;
  showCursor: boolean;
  language: "tr" | "en";
  format: "png" | "jpeg";
  jpegQuality: number;
  saveDirectory: string;
  launchAtStartup: boolean;
  proxyUrl: string;
  uploadProvider: "custom";
  uploadEndpoint: string;
  shortcuts: Record<CaptureAction, string[]>;
}
export const defaultSettings: Settings = {
  autoCopyLink: true,
  closeAfterUpload: true,
  notifications: true,
  rememberRegion: false,
  showCursor: false,
  language: "tr",
  format: "png",
  jpegQuality: 90,
  saveDirectory: "",
  launchAtStartup: false,
  proxyUrl: "",
  uploadProvider: "custom",
  uploadEndpoint: "",
  shortcuts: {
    region: ["PrintScreen", "CommandOrControl+Shift+S"],
    fullscreenSave: ["Shift+PrintScreen"],
    fullscreenUpload: [],
  },
};
export interface Capture {
  id?: string;
  action?: CaptureAction;
  dataUrl: string;
  width: number;
  height: number;
  scaleFactor: number;
  activeMonitor?: number;
  monitors?: { x: number; y: number; width: number; height: number }[];
}
export interface HistoryEntry {
  id: string;
  createdAt: string;
  kind: "save" | "copy" | "upload";
  location: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Deep-merges untrusted stored settings over the defaults so missing or
 * wrongly typed fields never reach the UI. Legacy `lightshot` provider is
 * migrated to `custom`.
 */
export function mergeSettings(stored: unknown): Settings {
  const base = structuredClone(defaultSettings);
  if (!isRecord(stored)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, def] of Object.entries(base)) {
    if (key === "shortcuts") continue;
    const value = stored[key];
    if (value !== undefined && value !== null && typeof value === typeof def)
      out[key] = value;
  }
  const shortcuts = { ...base.shortcuts };
  if (isRecord(stored.shortcuts)) {
    for (const action of Object.keys(shortcuts) as CaptureAction[]) {
      const list = stored.shortcuts[action];
      if (Array.isArray(list))
        shortcuts[action] = list.filter(
          (item): item is string => typeof item === "string",
        );
    }
  }
  out.shortcuts = shortcuts;
  const merged = out as unknown as Settings;
  if (merged.language !== "tr" && merged.language !== "en")
    merged.language = base.language;
  if (merged.format !== "png" && merged.format !== "jpeg")
    merged.format = base.format;
  // Legacy "lightshot" (or anything unknown) migrates to the custom provider.
  merged.uploadProvider = "custom";
  return merged;
}
