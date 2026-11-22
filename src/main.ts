import "./style.css";
import {
  createIcons,
  Scan,
  History,
  SlidersHorizontal,
  Video,
  Images,
  Monitor,
  ArrowUpRight,
  ArrowRight,
  Copy,
  FileImage,
  Link,
  RefreshCw,
  X,
  Trash2,
} from "lucide";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { api, native } from "./bridge";
import {
  defaultSettings,
  type Settings,
  type CaptureAction,
} from "./contracts";
import {
  mountSettings,
  hasUnsavedSettings,
  discardSettingsDraft,
} from "./settings";

declare const __APP_VERSION__: string;
import { mountEditor } from "./editor";
import { mountRecording } from "./recording";
import { mountRegionPicker } from "./region-picker";

import { t, setLanguage, dateLocale } from "./i18n";

type Page = "capture" | "recording" | "history" | "settings";
const pageName = (page: Page) => t(`nav.${page}`);
const icons = {
  Scan,
  History,
  SlidersHorizontal,
  Video,
  Images,
  Monitor,
  ArrowUpRight,
  ArrowRight,
  Copy,
  FileImage,
  Link,
  RefreshCw,
  X,
  Trash2,
};
const app = document.querySelector<HTMLDivElement>("#app")!;
const query = new URLSearchParams(location.search);

if (query.has("pickRegion")) {
  mountRegionPicker(app, Number(query.get("pickRegion")));
} else if (query.has("capture") || query.has("demo")) {
  document.body.classList.add("capture-mode");
  document.documentElement.classList.add("capture-mode");
  void mountEditor(app, { demo: query.has("demo") });
} else {
  void start();
}

function icon(name: string) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}
function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function refreshIcons() {
  createIcons({ icons, attrs: { "stroke-width": 1.7 } });
}

async function start() {
  let settings: Settings = structuredClone(defaultSettings);
  let startupError = "";
  // Set when the stored settings could not be read; saving would overwrite them.
  let settingsProblem = "";
  try {
    settings = await api.getSettings();
  } catch (error) {
    setLanguage(settings.language);
    startupError = t("app.settingsReadFailed", { error: String(error) });
    settingsProblem = String(error);
  }
  setLanguage(settings.language);
  app.innerHTML = `<div class="shell">
    <header class="app-header">
      <button class="brand" type="button"><img src="/brand/byshoot-mark.png" width="26" height="26" alt=""><span>byshoot<span class="brand-dot">.</span></span></button>
      <nav>
        <button class="nav-item" data-page="capture">${icon("scan")}<span></span></button>
        <button class="nav-item" data-page="recording">${icon("video")}<span></span></button>
        <button class="nav-item" data-page="history">${icon("history")}<span></span></button>
        <button class="nav-item" data-page="settings">${icon("sliders-horizontal")}<span></span></button>
      </nav>
    </header>
    <main class="workspace" aria-labelledby="page-label"><span id="page-label" class="sr-only"></span>
      <div id="recording-banner" role="status" hidden></div><div id="content"></div>
      <div id="app-status" role="status" aria-live="polite" hidden><span></span><button type="button">${icon("x")}</button></div>
    </main>
    <footer class="app-footer"><span class="status-dot"></span><span class="footer-text"></span><span class="version">${__APP_VERSION__}</span></footer>
  </div>`;
  /** Applies the active language to the static shell (header, footer, labels). */
  function applyChrome() {
    app.querySelector(".brand")!.setAttribute("aria-label", t("app.brandLabel"));
    app.querySelector("nav")!.setAttribute("aria-label", t("nav.main"));
    app.querySelectorAll<HTMLElement>("[data-page]").forEach((button) => {
      button.querySelector("span")!.textContent = pageName(
        button.dataset.page as Page,
      );
    });
    app.querySelector("#page-label")!.textContent = pageName(page);
    app
      .querySelector("#app-status button")!
      .setAttribute("aria-label", t("app.dismiss"));
    app.querySelector(".footer-text")!.textContent = native
      ? t("app.footerNative")
      : t("app.footerBrowser");
  }
  let onLanguageChange: (() => void) | undefined;
  const content = app.querySelector<HTMLElement>("#content")!;
  const status = app.querySelector<HTMLElement>("#app-status")!;
  let page: Page = "capture";
  let pageGeneration = 0;
  let disposePage: (() => void) | undefined;
  function notice(message: string, error = false) {
    status.querySelector("span")!.textContent = message;
    status.classList.toggle("is-error", error);
    status.hidden = false;
  }
  const showError = (error: unknown) => notice(String(error), true);
  status.querySelector("button")!.onclick = () => {
    status.hidden = true;
  };

  function changePage(next: Page) {
    if (next === page && content.childElementCount) return;
    if (page === "settings" && content.childElementCount) {
      if (hasUnsavedSettings(content)) {
        if (!confirm(t("app.unsavedConfirm"))) return;
      }
      discardSettingsDraft(content);
      setLanguage(settings.language);
    }
    disposePage?.();
    disposePage = undefined;
    page = next;
    pageGeneration++;
    status.hidden = true;
    app.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((button) => {
      const selected = button.dataset.page === page;
      button.classList.toggle("selected", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    app.querySelector("#page-label")!.textContent = pageName(page);
    content.scrollTop = 0;
    if (page === "settings")
      mountSettings(content, settings, async (nextSettings) => {
        if (
          settingsProblem &&
          !confirm(t("app.overwriteConfirm", { error: settingsProblem }))
        )
          throw new Error(t("app.saveCancelled"));
        await api.saveSettings(nextSettings);
        const languageChanged = nextSettings.language !== settings.language;
        settings = nextSettings;
        settingsProblem = "";
        if (languageChanged) {
          setLanguage(settings.language);
          applyChrome();
          onLanguageChange?.();
          status.hidden = true;
        }
      });
    else if (page === "recording") disposePage = mountRecording(content);
    else if (page === "history") void renderHistory();
    else renderCapture();
    refreshIcons();
  }

  function renderCapture() {
    const shortcuts = settings.shortcuts.region
      .map(
        (key) =>
          `<kbd>${escapeText(
            key
              .replace(
                "CommandOrControl",
                /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl",
              )
              .replace("PrintScreen", "PrtSc")
              .replace(/\+/g, " + "),
          )}</kbd>`,
      )
      .join("");
    content.innerHTML = `<div class="capture-home"><section class="capture-ready" aria-labelledby="capture-title">
      <div class="capture-symbol">${icon("scan")}</div><h1 id="capture-title">${t("capture.title")}</h1>
      <p>${t("capture.subtitle")}</p>
      <button class="primary" id="capture-now">${icon("scan")}<span>${native ? t("capture.selectArea") : t("capture.openDemo")}</span></button>
      <div class="shortcut-chips">${native ? shortcuts || `<span>${t("capture.noShortcut")}</span>` : `<span>${t("capture.demoHint")}</span>`}</div>
      </section><div class="quick-actions" aria-label="${t("capture.otherActions")}">
      <button id="fullscreen">${icon("monitor")}<span>${t("capture.fullscreen")}<small>${t("capture.fullscreenHint")}</small></span>${icon("arrow-up-right")}</button>
      <button id="record-now">${icon("video")}<span>${t("capture.record")}<small>${t("capture.recordHint")}</small></span>${icon("arrow-right")}</button></div></div>`;
    function captureButton(id: string, action: CaptureAction) {
      const button = content.querySelector<HTMLButtonElement>(id)!;
      button.onclick = async () => {
        if (!native) {
          location.search = "?demo=1";
          return;
        }
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        try {
          await api.capture(action);
        } catch (error) {
          showError(error);
        } finally {
          button.disabled = false;
          button.removeAttribute("aria-busy");
        }
      };
    }
    captureButton("#capture-now", "region");
    captureButton("#fullscreen", "fullscreenSave");
    content.querySelector<HTMLButtonElement>("#record-now")!.onclick = () =>
      changePage("recording");
  }

  async function renderHistory() {
    const generation = pageGeneration;
    content.innerHTML = `<section class="page-head history-head"><div><h1>${t("history.title")}</h1><p>${t("history.subtitle")}</p></div><div class="history-tools"><button class="secondary" id="history-clear" hidden>${icon("trash-2")}<span>${t("history.clear")}</span></button><button class="icon-button" id="history-refresh" aria-label="${t("history.refresh")}" title="${t("history.refresh")}">${icon("refresh-cw")}</button></div></section><div class="history-list" aria-busy="true"><p class="list-loading" role="status">${t("history.loading")}</p></div>`;
    const list = content.querySelector<HTMLElement>(".history-list")!;
    const refresh =
      content.querySelector<HTMLButtonElement>("#history-refresh")!;
    const clear = content.querySelector<HTMLButtonElement>("#history-clear")!;
    refresh.disabled = true;
    refresh.onclick = () => void renderHistory();
    clear.onclick = async () => {
      if (!confirm(t("history.clearConfirm"))) return;
      clear.disabled = true;
      try {
        await api.clearHistory();
        void renderHistory();
      } catch (error) {
        clear.disabled = false;
        showError(error);
      }
    };
    refreshIcons();
    try {
      const rows = await api.history();
      if (generation !== pageGeneration || page !== "history") return;
      list.replaceChildren();
      clear.hidden = !rows.length;
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">${icon("images")}<h2>${t("history.emptyTitle")}</h2><p>${t("history.emptyBody")}</p><button class="secondary">${t("capture.selectArea")}</button></div>`;
        list.querySelector<HTMLButtonElement>("button")!.onclick = () => {
          changePage("capture");
          content.querySelector<HTMLButtonElement>("#capture-now")!.click();
        };
      }
      for (const row of rows) {
        const item = document.createElement("div");
        item.className = "history-row";
        const main = document.createElement(row.location ? "button" : "div");
        main.className = "history-main";
        const symbol =
          row.kind === "save"
            ? "file-image"
            : row.kind === "copy"
              ? "copy"
              : "link";
        main.innerHTML = `${icon(symbol)}<span class="history-detail"><strong></strong><small></small></span><time></time>${row.location ? icon("arrow-up-right") : ""}`;
        main.querySelector("strong")!.textContent =
          row.kind === "save"
            ? t("history.saved")
            : row.kind === "copy"
              ? t("history.copied")
              : t("history.linkCreated");
        main.querySelector("small")!.textContent =
          row.location || t("history.pixelsCopied");
        const date = new Date(row.createdAt),
          time = main.querySelector("time")!;
        if (Number.isFinite(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = date.toLocaleString(dateLocale(), {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        if (main instanceof HTMLButtonElement)
          main.onclick = () => void api.open(row.location).catch(showError);
        item.append(main);
        const actions = document.createElement("div");
        actions.className = "history-actions";
        if (row.kind === "upload" && row.location) {
          const copyLink = document.createElement("button");
          copyLink.type = "button";
          copyLink.className = "icon-button";
          copyLink.setAttribute("aria-label", t("history.copyLink"));
          copyLink.title = t("history.copyLink");
          copyLink.innerHTML = icon("copy");
          copyLink.onclick = () =>
            void navigator.clipboard
              .writeText(row.location)
              .then(() => notice(t("history.linkCopied")))
              .catch(showError);
          actions.append(copyLink);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "icon-button";
        remove.setAttribute("aria-label", t("history.delete"));
        remove.title = t("history.delete");
        remove.innerHTML = icon("trash-2");
        remove.onclick = async () => {
          remove.disabled = true;
          try {
            await api.deleteHistory(row.id);
            void renderHistory();
          } catch (error) {
            remove.disabled = false;
            showError(error);
          }
        };
        actions.append(remove);
        item.append(actions);
        list.append(item);
      }
      refreshIcons();
    } catch (error) {
      if (generation !== pageGeneration || page !== "history") return;
      list.textContent = t("history.loadFailed");
      showError(error);
    } finally {
      list.removeAttribute("aria-busy");
      refresh.disabled = false;
    }
  }

  app.querySelector<HTMLButtonElement>(".brand")!.onclick = () =>
    changePage("capture");
  app.querySelectorAll<HTMLButtonElement>("[data-page]").forEach((button) => {
    button.onclick = () => changePage(button.dataset.page as Page);
  });
  applyChrome();
  changePage("capture");
  if (startupError) showError(startupError);
  if (native) {
    const banner = app.querySelector<HTMLElement>("#recording-banner")!;
    banner.innerHTML =
      '<span class="recording-dot" aria-hidden="true"></span><span class="banner-label"></span><button type="button" data-pause></button><button type="button" data-stop></button><button type="button" data-open></button>';
    const label = banner.querySelector<HTMLElement>(".banner-label")!,
      pause = banner.querySelector<HTMLButtonElement>("[data-pause]")!,
      stop = banner.querySelector<HTMLButtonElement>("[data-stop]")!;
    let lastPollError = "",
      checking = false,
      stopping = false;
    let paused = false;
    type BannerState = {
      recording: boolean;
      paused: boolean;
      pendingPath: string | null;
      elapsedSeconds: number;
      error: string | null;
    };
    let lastState: BannerState | undefined;
    function renderBannerLabels() {
      banner.querySelector<HTMLElement>("[data-open]")!.textContent =
        t("banner.open");
      const state = lastState;
      const time = state
        ? `${Math.floor(state.elapsedSeconds / 60)}:${String(state.elapsedSeconds % 60).padStart(2, "0")}`
        : "";
      label.textContent = !state
        ? ""
        : state.recording
          ? t(state.paused ? "banner.paused" : "banner.recording", { time })
          : state.pendingPath
            ? t("banner.ready")
            : t("banner.stopped");
      pause.textContent = paused ? t("banner.resume") : t("banner.pause");
      stop.textContent = stopping ? t("banner.stopping") : t("banner.stop");
    }
    onLanguageChange = renderBannerLabels;
    async function checkRecording() {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const state = await invoke<BannerState>("recording_status");
        lastState = state;
        banner.hidden = !state.recording && !state.pendingPath && !state.error;
        paused = state.paused;
        banner.dataset.state = state.recording
          ? "recording"
          : state.error
            ? "error"
            : "pending";
        renderBannerLabels();
        stop.hidden = !state.recording;
        stop.disabled = stopping;
        pause.hidden = !state.recording;
        pause.disabled = stopping;
        lastPollError = "";
      } catch (error) {
        // Poll runs every 1.5s: surface each distinct failure only once.
        const text = String(error);
        if (text !== lastPollError) {
          lastPollError = text;
          showError(error);
        }
      } finally {
        checking = false;
      }
    }
    banner.querySelector<HTMLButtonElement>("[data-open]")!.onclick = () =>
      changePage("recording");
    pause.onclick = () => {
      if (stopping) return;
      stopping = true;
      pause.disabled = stop.disabled = true;
      void invoke(paused ? "resume_recording" : "pause_recording").catch(showError).finally(() => {
        stopping = false;
        void checkRecording();
      });
    };
    stop.onclick = () => {
      if (stopping) return;
      stopping = true;
      stop.disabled = true;
      pause.disabled = true;
      stop.textContent = t("banner.stopping");
      void invoke("stop_recording")
        .catch(showError)
        .finally(() => {
          stopping = false;
          stop.textContent = t("banner.stop");
          changePage("recording");
          void checkRecording();
        });
    };
    void checkRecording();
    const timer = setInterval(() => void checkRecording(), 1500);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void checkRecording();
    });
    window.addEventListener("beforeunload", () => clearInterval(timer), {
      once: true,
    });
    await listen("settings-requested", () => changePage("settings"));
    await listen<string>("capture-error", (event) => showError(event.payload));
    await listen<string>("history-error", (event) =>
      showError(t("app.historyUpdateFailed", { error: event.payload })),
    );
    await listen("history-changed", () => {
      if (page === "history") void renderHistory();
    });
  }
  try {
    const diagnostic = await api.status();
    if (diagnostic.nativeVersion) {
      const version = app.querySelector<HTMLElement>(".version")!;
      version.textContent = diagnostic.nativeVersion;
      version.title = diagnostic.executablePath ?? "";
    }
    if (diagnostic.settingsError) {
      settingsProblem ||= diagnostic.settingsError;
      showError(
        t("app.settingsLoadFailed", { error: diagnostic.settingsError }),
      );
    }
    if (diagnostic.shortcutError)
      showError(
        t("app.shortcutFailed", { error: diagnostic.shortcutError }),
      );
  } catch (error) {
    showError(error);
  }
}
