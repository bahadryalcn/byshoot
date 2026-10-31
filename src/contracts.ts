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
  uploadProvider: "lightshot" | "custom";
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
  uploadProvider: "lightshot",
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
