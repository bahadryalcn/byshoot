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
} from "lucide";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { api, native } from "./bridge";
import {
  defaultSettings,
  type Settings,
  type CaptureAction,
} from "./contracts";
import { mountSettings } from "./settings";
import { mountEditor } from "./editor";
import { mountRecording } from "./recording";

type Page = "capture" | "recording" | "history" | "settings";
const pageNames: Record<Page, string> = {
  capture: "Yakalama",
  recording: "Kayıt",
  history: "Geçmiş",
  settings: "Ayarlar",
};
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
};
const app = document.querySelector<HTMLDivElement>("#app")!;
const query = new URLSearchParams(location.search);

if (query.has("capture") || query.has("demo")) {
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
  try {
    settings = await api.getSettings();
  } catch (error) {
    startupError = String(error);
  }
  app.innerHTML = `<div class="shell">
    <header class="app-header">
      <button class="brand" type="button" aria-label="ByShoot · Yakalamaya dön"><img src="/brand/byshoot-mark.png" width="26" height="26" alt=""><span>byshoot<span class="brand-dot">.</span></span></button>
      <nav aria-label="Ana gezinme">
        <button class="nav-item" data-page="capture">${icon("scan")}<span>Yakalama</span></button>
        <button class="nav-item" data-page="recording">${icon("video")}<span>Kayıt</span></button>
        <button class="nav-item" data-page="history">${icon("history")}<span>Geçmiş</span></button>
        <button class="nav-item" data-page="settings">${icon("sliders-horizontal")}<span>Ayarlar</span></button>
      </nav>
    </header>
    <main class="workspace" aria-labelledby="page-label"><span id="page-label" class="sr-only">Yakalama</span>
      <div id="recording-banner" role="status" hidden></div><div id="content"></div>
      <div id="app-status" role="status" aria-live="polite" hidden><span></span><button type="button" aria-label="Bildirimi kapat">${icon("x")}</button></div>
    </main>
    <footer class="app-footer"><span class="status-dot"></span><span>${native ? "Kısayoldan veya sistem tepsisinden hazır" : "Tarayıcı önizlemesi"}</span><span class="version">0.1.8</span></footer>
  </div>`;
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
    app.querySelector("#page-label")!.textContent = pageNames[page];
    content.scrollTop = 0;
    if (page === "settings")
      mountSettings(content, settings, async (nextSettings) => {
        await api.saveSettings(nextSettings);
        settings = nextSettings;
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
      <div class="capture-symbol">${icon("scan")}</div><h1 id="capture-title">Ekran görüntüsü al</h1>
      <p>Ekran görüntüsüne not ekle, çiz veya hassas bilgileri gizle.</p>
      <button class="primary" id="capture-now">${icon("scan")}<span>${native ? "Alan seç" : "Demoyu aç"}</span></button>
      <div class="shortcut-chips">${native ? shortcuts || "<span>Kısayol eklemek için Ayarlar’a git.</span>" : "<span>Örnek görüntü üzerinde dene · Masaüstünü yakalamaz.</span>"}</div>
      </section><div class="quick-actions" aria-label="Diğer yakalama işlemleri">
      <button id="fullscreen">${icon("monitor")}<span>Tam ekranı kaydet<small>İşaretçinin bulunduğu ekran</small></span>${icon("arrow-up-right")}</button>
      <button id="record-now">${icon("video")}<span>Ses veya video kaydı<small>Ekranını ya da ses girişini kaydet</small></span>${icon("arrow-right")}</button></div></div>`;
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
    content.innerHTML = `<section class="page-head history-head"><div><h1>Son işlemler</h1><p>Kaydettiğin dosyalar ve paylaştığın bağlantılar.</p></div><button class="icon-button" aria-label="Geçmişi yenile" title="Geçmişi yenile">${icon("refresh-cw")}</button></section><div class="history-list" aria-busy="true"><p class="list-loading" role="status">Geçmiş yükleniyor…</p></div>`;
    const list = content.querySelector<HTMLElement>(".history-list")!;
    const refresh = content.querySelector<HTMLButtonElement>(
      ".history-head button",
    )!;
    refresh.disabled = true;
    refresh.onclick = () => void renderHistory();
    refreshIcons();
    try {
      const rows = await api.history();
      if (generation !== pageGeneration || page !== "history") return;
      list.replaceChildren();
      if (!rows.length) {
        list.innerHTML = `<div class="empty-state">${icon("images")}<h2>İlk görüntünle başla</h2><p>Kaydettiğin, kopyaladığın ve paylaştığın görüntülerin işlemleri burada görünür.</p><button class="secondary">Alan seç</button></div>`;
        list.querySelector<HTMLButtonElement>("button")!.onclick = () => {
          changePage("capture");
          content.querySelector<HTMLButtonElement>("#capture-now")!.click();
        };
      }
      for (const row of rows) {
        const item = document.createElement(row.location ? "button" : "div");
        item.className = "history-row";
        const symbol =
          row.kind === "save"
            ? "file-image"
            : row.kind === "copy"
              ? "copy"
              : "link";
        item.innerHTML = `${icon(symbol)}<span class="history-detail"><strong></strong><small></small></span><time></time>${row.location ? icon("arrow-up-right") : ""}`;
        item.querySelector("strong")!.textContent =
          row.kind === "save"
            ? "Dosyaya kaydedildi"
            : row.kind === "copy"
              ? "Panoya kopyalandı"
              : "Bağlantı oluşturuldu";
        item.querySelector("small")!.textContent =
          row.location || "Görüntü pikselleri panoya kopyalandı.";
        const date = new Date(row.createdAt),
          time = item.querySelector("time")!;
        if (Number.isFinite(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = date.toLocaleString("tr", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
        if (item instanceof HTMLButtonElement)
          item.onclick = () => void api.open(row.location).catch(showError);
        list.append(item);
      }
      refreshIcons();
    } catch (error) {
      if (generation !== pageGeneration || page !== "history") return;
      list.textContent =
        "Geçmiş okunamadı. Yenile düğmesiyle tekrar deneyebilirsin.";
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
  changePage("capture");
  if (startupError) showError(startupError);
  if (native) {
    const banner = app.querySelector<HTMLElement>("#recording-banner")!;
    banner.innerHTML =
      '<span class="recording-dot" aria-hidden="true"></span><span class="banner-label"></span><button type="button" data-stop>Durdur</button><button type="button" data-open>Kaydı aç</button>';
    const label = banner.querySelector<HTMLElement>(".banner-label")!,
      stop = banner.querySelector<HTMLButtonElement>("[data-stop]")!;
    let checking = false,
      stopping = false;
    async function checkRecording() {
      if (checking || document.hidden) return;
      checking = true;
      try {
        const state = await invoke<{
          recording: boolean;
          pendingPath: string | null;
          elapsedSeconds: number;
          error: string | null;
        }>("recording_status");
        banner.hidden = !state.recording && !state.pendingPath && !state.error;
        banner.dataset.state = state.recording
          ? "recording"
          : state.error
            ? "error"
            : "pending";
        label.textContent = state.recording
          ? `Kayıt sürüyor · ${Math.floor(state.elapsedSeconds / 60)}:${String(state.elapsedSeconds % 60).padStart(2, "0")}`
          : state.pendingPath
            ? "Kaydın hazır. Dosyaya kaydet."
            : "Kayıt durdu. Ayrıntıları kontrol et.";
        stop.hidden = !state.recording;
        stop.disabled = stopping;
      } catch (error) {
        showError(error);
      } finally {
        checking = false;
      }
    }
    banner.querySelector<HTMLButtonElement>("[data-open]")!.onclick = () =>
      changePage("recording");
    stop.onclick = () => {
      if (stopping) return;
      stopping = true;
      stop.disabled = true;
      stop.textContent = "Durduruluyor…";
      void invoke("stop_recording")
        .catch(showError)
        .finally(() => {
          stopping = false;
          stop.textContent = "Durdur";
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
    await listen("history-changed", () => {
      if (page === "history") void renderHistory();
    });
  }
  try {
    const diagnostic = await api.status();
    if (diagnostic.shortcutError)
      showError(
        `Sistem kısayolu kaydedilemedi: ${diagnostic.shortcutError}. Ayarlar → Kısayollar bölümünden başka bir tuş seç.`,
      );
  } catch (error) {
    showError(error);
  }
}
