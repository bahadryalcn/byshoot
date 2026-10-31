import type { CaptureAction, Settings } from "./contracts";
import { native } from "./bridge";
import "./settings.css";
import { recordedShortcut } from "./shortcuts";
import {
  createElement,
  Plus,
  X,
  Check,
  RotateCcw,
  LoaderCircle,
  type IconNode,
} from "lucide";

const copy = {
  tr: {
    title: "Ayarlar",
    subtitle: "Ekran yakalama, tam istediğin gibi.",
    general: "Genel",
    keys: "Kısayollar",
    file: "Dosya",
    upload: "Yükleme ve vekil sunucu",
    save: "Değişiklikleri kaydet",
    cancel: "Vazgeç",
    saved: "Ayarlar kaydedildi.",
    saving: "Kaydediliyor…",
    desktop:
      "Önizleme modu · Ekran yakalama, sistem kısayolları ve başlangıç ayarları için masaüstü uygulaması gerekir.",
    system: "Sistem",
    startupHint: "Tepside sessizce başlar.",
    behavior: "Yakalama davranışı",
    autoCopyLink: "Yüklemeden sonra bağlantıyı kopyala",
    closeAfterUpload: "Yükleme tamamlanınca düzenleyiciyi kapat",
    notifications: "Kopyalama ve kaydetme bildirimlerini göster",
    rememberRegion: "Son seçilen alanı hatırla",
    showCursor: "İmleci ekran görüntüsüne ekle",
    launchAtStartup: "Bilgisayar açıldığında başlat",
    language: "Uygulama dili",
    region: "Alan seç ve düzenle",
    fullscreenSave: "Tam ekranı hemen kaydet",
    fullscreenUpload: "Tam ekranı hemen yükle",
    keyHint:
      "Aynı işlem için birden fazla kısayol ekleyebilirsin. Bir kısayolu kaldırmak için × düğmesine bas. Liste boşsa işlem için kısayol kapalıdır.",
    add: "Kısayol ekle",
    record: "Tuşlara bas… (Esc: iptal)",
    disabled: "Kısayol atanmadı",
    duplicate: "Bu kısayol başka bir işleme atanmış.",
    format: "Görüntü biçimi",
    quality: "JPEG kalitesi",
    directory: "Varsayılan kayıt klasörü",
    directoryHint: "Boş bırakılırsa her kayıtta konum seçilir.",
    provider: "Yükleme hizmeti",
    endpoint: "Özel HTTPS yükleme adresi",
    proxy: "Vekil sunucu (isteğe bağlı)",
    proxyHint:
      "Örnek: http://sunucu:8080. Bu sürümde kullanıcı adı/parola içeren vekil sunucular desteklenmiyor.",
    disclosure:
      "Yüklenen ekran görüntüleri herkese açık bir bağlantı oluşturur. Hassas bilgileri önce gizle. Tam ekran yükleme kısayolu, tüm ekran için paylaşım onayını açar; varsayılan olarak kapalıdır.",
    endpointError:
      "Özel yükleme adresi geçerli bir HTTPS adresi olmalı; kullanıcı adı/parola içermemeli.",
    proxyError:
      "Kullanıcı adı/parola içermeyen geçerli bir HTTP veya HTTPS vekil sunucu adresi gir.",
    reset: "Değişiklikler geri alındı.",
    lightshot: "Lightshot · prnt.sc (bu sürümde kullanılamıyor)",
    custom: "Özel sunucu",
    nativeOnly: "Masaüstü uygulamasında kullanılabilir",
    fileHint:
      "PNG keskin metinler için uygundur. JPEG daha küçük dosya üretir.",
    enabled: "Etkin",
    failed: "Ayarlar kaydedilemedi. ",
  },
  en: {
    title: "Settings",
    subtitle: "Screen capture, your way.",
    general: "General",
    keys: "Shortcuts",
    file: "Files",
    upload: "Upload and proxy",
    save: "Save changes",
    cancel: "Cancel",
    saved: "Settings saved.",
    saving: "Saving…",
    desktop:
      "Preview mode · Screen capture, global shortcuts and startup settings require the desktop app.",
    system: "System",
    startupHint: "Starts quietly in the tray.",
    behavior: "Capture behavior",
    autoCopyLink: "Copy the link after upload",
    closeAfterUpload: "Close the editor after upload",
    notifications: "Show copy and save notifications",
    rememberRegion: "Remember the last selected area",
    showCursor: "Include the cursor in screenshots",
    launchAtStartup: "Launch at computer startup",
    language: "App language",
    region: "Select an area and annotate",
    fullscreenSave: "Save full screen immediately",
    fullscreenUpload: "Upload full screen immediately",
    keyHint:
      "Add several shortcuts for the same action. Press × to remove one. An empty list disables shortcuts for that action.",
    add: "Add shortcut",
    record: "Press keys… (Esc: cancel)",
    disabled: "No shortcut assigned",
    duplicate: "This shortcut is already assigned to another action.",
    format: "Image format",
    quality: "JPEG quality",
    directory: "Default save folder",
    directoryHint: "Leave empty to choose a location each time.",
    provider: "Upload service",
    endpoint: "Custom HTTPS upload URL",
    proxy: "Proxy server (optional)",
    proxyHint:
      "Example: http://server:8080. Proxy authentication is not supported in this version.",
    disclosure:
      "Uploaded screenshots create a public link. Hide sensitive information first. A full-screen upload shortcut opens confirmation for sharing the entire screen; it is disabled by default.",
    endpointError:
      "Enter a valid HTTPS upload URL without a username or password.",
    proxyError:
      "Enter a valid HTTP or HTTPS proxy URL without a username or password.",
    reset: "Changes discarded.",
    lightshot: "Lightshot · prnt.sc (unavailable in this version)",
    custom: "Custom server",
    nativeOnly: "Available in the desktop app",
    fileHint: "PNG keeps text sharp. JPEG produces smaller files.",
    enabled: "Enabled",
    failed: "Could not save settings. ",
  },
};
const clone = (s: Settings): Settings =>
  JSON.parse(JSON.stringify(s)) as Settings;
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const actions: CaptureAction[] = [
  "region",
  "fullscreenSave",
  "fullscreenUpload",
];
interface SettingsDraft {
  original: Settings;
  draft: Settings;
  active: string;
  busy: boolean;
  status: string;
  error: boolean;
  cleanup: () => void;
  refresh?: () => void;
}
const drafts = new WeakMap<HTMLElement, SettingsDraft>();
export function canonicalShortcut(value: string): string {
  const mac = /Mac/i.test(navigator.platform);
  return value
    .split("+")
    .map((p) => p.trim().toLowerCase())
    .map((p) =>
      p === "commandorcontrol"
        ? mac
          ? "meta"
          : "ctrl"
        : ["control", "ctrl"].includes(p)
          ? "ctrl"
          : ["command", "cmd", "super", "meta"].includes(p)
            ? "meta"
            : p === "option"
              ? "alt"
              : p,
    )
    .sort()
    .join("+");
}
export function mountSettings(
  container: HTMLElement,
  settings: Settings,
  onSave: (s: Settings) => Promise<void>,
): void {
  let state = drafts.get(container);
  if (!state) {
    state = {
      original: clone(settings),
      draft: clone(settings),
      active: "general",
      busy: false,
      status: "",
      error: false,
      cleanup: () => {},
    };
    drafts.set(container, state);
  }
  state.cleanup();
  // Retain local edits when navigating away; incoming saved settings are the new
  // baseline only if this draft has no edits of its own.
  if (
    JSON.stringify(state.original) !== JSON.stringify(settings) &&
    !state.busy
  ) {
    if (JSON.stringify(state.draft) === JSON.stringify(state.original))
      state.draft = clone(settings);
    state.original = clone(settings);
  }
  const session = state;
  let { original, draft, active, busy, status, error } = session,
    recording: CaptureAction | null = null,
    view: HTMLElement | undefined;
  let cleanup: () => void = () => {};
  const persist = () =>
    Object.assign(session, {
      original,
      draft,
      active,
      busy,
      status,
      error,
      cleanup,
    });
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(original);
  const t = () => copy[draft.language];
  function message(text: string, isError = false) {
    status = text;
    error = isError;
    persist();
    updateStatus();
  }
  function updateStatus() {
    const el = container.querySelector<HTMLElement>(".settings-status");
    if (el) {
      el.textContent =
        status ||
        (dirty()
          ? draft.language === "tr"
            ? "Kaydedilmemiş değişiklikler"
            : "Unsaved changes"
          : "");
      el.classList.toggle("is-error", error);
      el.classList.toggle("is-pending", !status && dirty());
    }
    container
      .querySelector(".settings-view")
      ?.setAttribute("data-dirty", String(dirty()));
  }
  function stopRecording() {
    cleanup();
    recording = null;
  }
  function render() {
    stopRecording();
    persist();
    const c = t();
    container.innerHTML = `<section class="settings-view"><header class="settings-heading"><h1>${c.title}</h1></header>${!native ? `<p class="settings-preview">${c.desktop}</p>` : ""}<div class="settings-tabs" role="tablist" aria-label="${c.title}">${(["general", "keys", "file", "upload"] as const).map((id) => `<button type="button" role="tab" id="settings-tab-${id}" aria-selected="${id === active}" aria-controls="settings-panel" tabindex="${id === active ? 0 : -1}" data-tab="${id}">${c[id]}</button>`).join("")}</div><form class="settings-form"><div id="settings-panel" role="tabpanel" aria-labelledby="settings-tab-${active}" class="settings-panel"></div><footer class="settings-footer"><p class="settings-status ${error ? "is-error" : ""}" role="status" aria-live="polite">${esc(status)}</p><div><button type="button" class="settings-cancel">${c.cancel}</button><button type="submit" class="settings-save" ${busy ? "disabled" : ""}>${busy ? c.saving : c.save}</button></div></footer></form></section>`;
    view = container.querySelector<HTMLElement>(".settings-view")!;
    view.setAttribute("aria-busy", String(busy));
    const panel = container.querySelector<HTMLElement>(".settings-panel")!;
    panel.tabIndex = 0;
    const toggle = (
      field: keyof Settings,
      disabled = false,
      hint = c.nativeOnly,
    ) =>
      `<label class="settings-toggle"><span>${c[field as keyof typeof c]}${hint && (field === "launchAtStartup" || disabled) ? `<small>${hint}</small>` : ""}</span><input type="checkbox" role="switch" data-field="${field}" ${draft[field] ? "checked" : ""} ${disabled ? "disabled" : ""}></label>`;
    if (active === "general")
      panel.innerHTML = `<h2>${c.system}</h2><div class="settings-toggle-list settings-startup">${toggle("launchAtStartup", !native, native ? c.startupHint : c.nativeOnly)}</div><h2>${c.behavior}</h2><div class="settings-toggle-list">${(["autoCopyLink", "closeAfterUpload", "notifications", "rememberRegion"] as const).map((k) => toggle(k)).join("")}${toggle("showCursor", !native || !/Win/i.test(navigator.platform), draft.language === "tr" ? "İmleç yakalama Windows masaüstü uygulamasında kullanılabilir" : "Cursor capture is available in the Windows desktop app")}</div><label class="settings-field">${c.language}<select data-field="language"><option value="tr" ${draft.language === "tr" ? "selected" : ""}>Türkçe</option><option value="en" ${draft.language === "en" ? "selected" : ""}>English</option></select></label>`;
    if (active === "keys")
      panel.innerHTML = `<h2>${c.keys}</h2><p class="settings-help">${c.keyHint}</p>${actions.map((a) => `<section class="settings-shortcut-row"><h3>${c[a]}</h3><div class="settings-key-list">${draft.shortcuts[a].map((key, i) => `<span class="settings-key"><kbd>${esc(key.replace("CommandOrControl", "Ctrl / ⌘"))}</kbd><button type="button" data-remove="${a}:${i}" aria-label="${esc(c[a] + " · " + key + " ×")}">×</button></span>`).join("") || `<span class="settings-help">${c.disabled}</span>`}<button type="button" class="settings-add" data-record="${a}" aria-label="${c[a]} · ${c.add}">+ ${c.add}</button></div></section>`).join("")}<p class="settings-disclosure">${c.disclosure}</p>`;
    if (active === "file")
      panel.innerHTML = `<h2>${c.file}</h2><p class="settings-help">${c.fileHint}</p><label class="settings-field">${c.format}<select data-field="format"><option value="png" ${draft.format === "png" ? "selected" : ""}>PNG</option><option value="jpeg" ${draft.format === "jpeg" ? "selected" : ""}>JPEG</option></select></label><label class="settings-field">${c.quality}<div class="settings-range"><input type="range" data-field="jpegQuality" min="1" max="100" value="${draft.jpegQuality}" ${draft.format === "png" ? "disabled" : ""}><output>${draft.jpegQuality}%</output></div></label><label class="settings-field">${c.directory}<input data-field="saveDirectory" value="${esc(draft.saveDirectory)}" placeholder="${/Mac/i.test(navigator.platform) ? "/Users/…/Pictures" : "C:\\Users\\…\\Pictures"}" ${!native ? "disabled" : ""}><small>${!native ? c.nativeOnly : c.directoryHint}</small></label>`;
    if (active === "upload")
      panel.innerHTML = `<h2>${c.upload}</h2>${draft.uploadProvider === "lightshot" ? `<p class="settings-preview">${draft.language === "tr" ? "Prnt.sc doğrudan yükleme için belgelenmiş bir API sunmuyor. Özel HTTPS sunucusu seçebilir veya görüntüyü kaydedip prnt.sc üzerinden yükleyebilirsin." : "Prnt.sc does not offer a documented direct upload API. Choose a custom HTTPS server, or save the image and upload it on prnt.sc."}</p>` : ""}<p class="settings-disclosure">${c.disclosure}</p><label class="settings-field">${c.provider}<select data-field="uploadProvider"><option value="lightshot" disabled ${draft.uploadProvider === "lightshot" ? "selected" : ""}>${c.lightshot}</option><option value="custom" ${draft.uploadProvider === "custom" ? "selected" : ""}>${c.custom}</option></select></label>${draft.uploadProvider === "custom" ? `<label class="settings-field">${c.endpoint}<input data-field="uploadEndpoint" type="url" placeholder="https://example.com/upload" value="${esc(draft.uploadEndpoint)}" required></label>` : ""}<label class="settings-field">${c.proxy}<input data-field="proxyUrl" type="password" autocomplete="off" placeholder="http://server:8080" value="${esc(draft.proxyUrl)}" ${!native ? "disabled" : ""}><small>${!native ? c.nativeOnly : c.proxyHint}</small></label>`;
    const focusTab = () =>
      container
        .querySelector<HTMLButtonElement>(`[data-tab="${active}"]`)!
        .focus();
    container
      .querySelectorAll<HTMLButtonElement>("[data-tab]")
      .forEach((btn) => {
        btn.onclick = () => {
          if (busy) return;
          active = btn.dataset.tab!;
          status = "";
          error = false;
          render();
          focusTab();
        };
        btn.onkeydown = (e) => {
          if (
            !busy &&
            ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
          ) {
            e.preventDefault();
            const ids = ["general", "keys", "file", "upload"];
            let i = ids.indexOf(active);
            i =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? 3
                  : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
            active = ids[i];
            status = "";
            error = false;
            render();
            focusTab();
          }
        };
      });
    container
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]")
      .forEach((input) =>
        input.addEventListener("input", () => {
          const field = input.dataset.field!;
          const value =
            input instanceof HTMLInputElement && input.type === "checkbox"
              ? input.checked
              : field === "jpegQuality"
                ? Number(input.value)
                : input.value;
          Object.assign(draft, { [field]: value });
          status = "";
          error = false;
          persist();
          if (["language", "format", "uploadProvider"].includes(field)) {
            render();
            container
              .querySelector<HTMLInputElement | HTMLSelectElement>(
                `[data-field="${field}"]`,
              )
              ?.focus();
          } else {
            input.removeAttribute("aria-invalid");
            input.removeAttribute("aria-describedby");
            if (field === "jpegQuality")
              panel.querySelector("output")!.textContent = `${value}%`;
            updateStatus();
          }
        }),
      );
    container
      .querySelectorAll<HTMLButtonElement>("[data-remove]")
      .forEach((btn) => {
        const [a, i] = btn.dataset.remove!.split(":");
        btn.setAttribute(
          "aria-label",
          `${draft.language === "tr" ? "Kısayolu kaldır" : "Remove shortcut"}: ${draft.shortcuts[a as CaptureAction][Number(i)]}`,
        );
        btn.title = btn.getAttribute("aria-label")!;
        btn.onclick = () => {
          draft.shortcuts[a as CaptureAction].splice(Number(i), 1);
          status = "";
          error = false;
          render();
          (
            container.querySelector<HTMLButtonElement>(
              `[data-remove="${a}:${i}"]`,
            ) ??
            container.querySelector<HTMLButtonElement>(`[data-record="${a}"]`)
          )?.focus();
        };
      });
    container
      .querySelectorAll<HTMLButtonElement>("[data-record]")
      .forEach(
        (btn) =>
          (btn.onclick = () =>
            record(btn.dataset.record as CaptureAction, btn)),
      );
    container.querySelector<HTMLButtonElement>(".settings-cancel")!.onclick =
      () => {
        draft = clone(original);
        status = t().reset;
        error = false;
        render();
      };
    const form = container.querySelector<HTMLFormElement>("form")!;
    form.noValidate = true;
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      stopRecording();
      try {
        validate();
        const submitted = clone(draft);
        busy = true;
        render();
        await onSave(submitted);
        original = clone(submitted);
        status = t().saved;
        error = false;
      } catch (err) {
        status =
          t().failed + (err instanceof Error ? err.message : String(err));
        error = true;
        if (
          status.includes(t().endpointError) ||
          status.includes(t().proxyError)
        )
          active = "upload";
        else if (status.includes(t().duplicate)) active = "keys";
      } finally {
        busy = false;
        persist();
        session.refresh?.();
      }
    };
    if (busy)
      container
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLButtonElement
        >("input,select,button")
        .forEach((control) => (control.disabled = true));
    const appendIcon = (selector: string, node: IconNode) =>
      container
        .querySelectorAll<HTMLButtonElement>(selector)
        .forEach((button) => {
          const icon = createElement([
            node[0],
            {
              ...node[1],
              width: 14,
              height: 14,
              "stroke-width": 1.8,
              "aria-hidden": "true",
            },
            node[2],
          ]);
          button.prepend(icon);
        });
    container
      .querySelectorAll<HTMLButtonElement>("[data-remove]")
      .forEach((button) => (button.textContent = ""));
    container
      .querySelectorAll<HTMLButtonElement>("[data-record]")
      .forEach((button) => (button.textContent = c.add));
    appendIcon("[data-remove]", X);
    appendIcon("[data-record]", Plus);
    appendIcon(".settings-cancel", RotateCcw);
    appendIcon(".settings-save", busy ? LoaderCircle : Check);
    updateStatus();
    const invalidField = error
      ? status.includes(c.endpointError)
        ? "uploadEndpoint"
        : status.includes(c.proxyError)
          ? "proxyUrl"
          : undefined
      : undefined;
    if (invalidField) {
      const input = container.querySelector<HTMLInputElement>(
        `[data-field="${invalidField}"]`,
      );
      const message = container.querySelector<HTMLElement>(".settings-status");
      if (input && message) {
        message.id = "settings-validation";
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", message.id);
        input.focus();
      }
    }
  }
  function validate() {
    const used = new Set<string>();
    for (const a of actions)
      for (const key of draft.shortcuts[a]) {
        const v = canonicalShortcut(key);
        if (used.has(v)) throw new Error(t().duplicate);
        used.add(v);
      }
    if (draft.uploadProvider === "custom") {
      try {
        const u = new URL(draft.uploadEndpoint);
        if (u.protocol !== "https:" || u.username || u.password) throw 0;
      } catch {
        throw new Error(t().endpointError);
      }
    }
    if (draft.proxyUrl) {
      try {
        const u = new URL(draft.proxyUrl);
        if (
          !["http:", "https:"].includes(u.protocol) ||
          !u.hostname ||
          u.username ||
          u.password
        )
          throw 0;
      } catch {
        throw new Error(t().proxyError);
      }
    }
  }
  function record(action: CaptureAction, button: HTMLButtonElement) {
    if (recording) {
      stopRecording();
      render();
      return;
    }
    if (draft.shortcuts[action].length >= 12) {
      message(
        draft.language === "tr"
          ? "Bir işlem için en fazla 12 kısayol eklenebilir."
          : "An action can have up to 12 shortcuts.",
        true,
      );
      return;
    }
    recording = action;
    button.textContent = t().record;
    button.classList.add("is-recording");
    button.setAttribute("aria-pressed", "true");
    button.focus();
    button.onblur = () => {
      stopRecording();
      button.textContent = t().add;
      button.classList.remove("is-recording");
      button.setAttribute("aria-pressed", "false");
    };
    const handler = (e: KeyboardEvent) => {
      if (!button.isConnected) {
        stopRecording();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        stopRecording();
        render();
        container
          .querySelector<HTMLButtonElement>(`[data-record="${action}"]`)
          ?.focus();
        return;
      }
      if (
        ["Control", "Shift", "Alt", "Meta", "Dead", "Unidentified"].includes(
          e.key,
        ) ||
        e.repeat
      )
        return;
      if (e.type === "keyup" && e.key !== "PrintScreen") return;
      const key =
        e.key === "PrintScreen"
          ? "PrintScreen"
          : e.code.startsWith("Key")
            ? e.code.slice(3)
            : e.code.startsWith("Digit")
              ? e.code.slice(5)
              : e.key === " "
                ? "Space"
                : e.key;
      if (
        !/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|PrintScreen|Space|Insert|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab|Enter|Backspace)$/.test(
          key,
        )
      ) {
        message(
          draft.language === "tr"
            ? "Bu tuş desteklenmiyor. Bir harf, işlev tuşu veya PrintScreen kullan."
            : "Use a letter, function key or PrintScreen.",
          true,
        );
        return;
      }
      const shortcut = recordedShortcut(
        key,
        e,
        /Mac/i.test(navigator.platform),
      );
      if (
        actions.some((a) =>
          draft.shortcuts[a].some(
            (k) => canonicalShortcut(k) === canonicalShortcut(shortcut),
          ),
        )
      ) {
        stopRecording();
        status = t().duplicate;
        error = true;
        render();
        container
          .querySelector<HTMLButtonElement>(`[data-record="${action}"]`)
          ?.focus();
        return;
      }
      draft.shortcuts[action].push(shortcut);
      stopRecording();
      status = "";
      error = false;
      render();
      container
        .querySelector<HTMLButtonElement>(`[data-record="${action}"]`)
        ?.focus();
    };
    container.addEventListener("keydown", handler, true);
    container.addEventListener("keyup", handler, true);
    cleanup = () => {
      container.removeEventListener("keydown", handler, true);
      container.removeEventListener("keyup", handler, true);
      cleanup = () => {};
    };
    persist();
  }
  session.refresh = () => {
    if (view?.isConnected && container.contains(view)) {
      ({ original, draft, active, busy, status, error } = session);
      render();
    }
  };
  render();
}
