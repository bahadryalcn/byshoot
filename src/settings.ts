import type { CaptureAction, Settings } from "./contracts";
import { native } from "./bridge";
import "./settings.css";
import { setLanguage, t as tr, type I18nKey } from "./i18n";
import {
  recordedShortcut,
  shortcutKey,
  isValidShortcut,
  isFocusNavigationKey,
} from "./shortcuts";
import {
  createElement,
  Plus,
  X,
  Check,
  RotateCcw,
  LoaderCircle,
  type IconNode,
} from "lucide";

type SettingsKey = Extract<I18nKey, `settings.${string}`> extends `settings.${infer N}`
  ? N
  : never;
/** Copy for the settings page, always in the saved (not draft) language. */
const c = new Proxy({} as Record<SettingsKey, string>, {
  get: (_, key) => tr(`settings.${String(key)}` as I18nKey),
});
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
/** True when the settings page mounted in `container` has unsaved edits. */
export function hasUnsavedSettings(container: HTMLElement): boolean {
  const state = drafts.get(container);
  return (
    !!state && JSON.stringify(state.draft) !== JSON.stringify(state.original)
  );
}
/** Drops retained edits so the next mount starts from the saved settings. */
export function discardSettingsDraft(container: HTMLElement): void {
  drafts.get(container)?.cleanup();
  drafts.delete(container);
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
  const t = () => c;
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
        (dirty() ? c.unsaved : "");
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
    setLanguage(original.language);
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
      panel.innerHTML = `<h2>${c.system}</h2><div class="settings-toggle-list settings-startup">${toggle("launchAtStartup", !native, native ? c.startupHint : c.nativeOnly)}</div><h2>${c.behavior}</h2><div class="settings-toggle-list">${(["autoCopyLink", "closeAfterUpload", "notifications", "rememberRegion"] as const).map((k) => toggle(k)).join("")}${toggle("showCursor", !native || !/Win/i.test(navigator.platform), c.cursorHint)}</div><label class="settings-field">${c.language}<select data-field="language"><option value="tr" ${draft.language === "tr" ? "selected" : ""}>Türkçe</option><option value="en" ${draft.language === "en" ? "selected" : ""}>English</option></select></label>`;
    if (active === "keys")
      panel.innerHTML = `<h2>${c.keys}</h2><p class="settings-help">${c.keyHint}</p>${actions.map((a) => `<section class="settings-shortcut-row"><h3>${c[a]}</h3><div class="settings-key-list">${draft.shortcuts[a].map((key, i) => `<span class="settings-key"><kbd>${esc(key.replace("CommandOrControl", "Ctrl / ⌘"))}</kbd><button type="button" data-remove="${a}:${i}" aria-label="${esc(c[a] + " · " + key + " ×")}">×</button></span>`).join("") || `<span class="settings-help">${c.disabled}</span>`}<button type="button" class="settings-add" data-record="${a}" aria-label="${c[a]} · ${c.add}">+ ${c.add}</button></div></section>`).join("")}<p class="settings-disclosure">${c.disclosure}</p>`;
    if (active === "file")
      panel.innerHTML = `<h2>${c.file}</h2><p class="settings-help">${c.fileHint}</p><label class="settings-field">${c.format}<select data-field="format"><option value="png" ${draft.format === "png" ? "selected" : ""}>PNG</option><option value="jpeg" ${draft.format === "jpeg" ? "selected" : ""}>JPEG</option></select></label><label class="settings-field">${c.quality}<div class="settings-range"><input type="range" data-field="jpegQuality" min="1" max="100" value="${draft.jpegQuality}" ${draft.format === "png" ? "disabled" : ""}><output>${draft.jpegQuality}%</output></div></label><label class="settings-field">${c.directory}<input data-field="saveDirectory" value="${esc(draft.saveDirectory)}" placeholder="${/Mac/i.test(navigator.platform) ? "/Users/…/Pictures" : "C:\\Users\\…\\Pictures"}" ${!native ? "disabled" : ""}><small>${!native ? c.nativeOnly : c.directoryHint}</small></label>`;
    if (active === "upload")
      panel.innerHTML = `<h2>${c.upload}</h2><p class="settings-disclosure">${c.disclosure}</p><label class="settings-field">${c.provider}<select data-field="uploadProvider"><option value="custom" selected>${c.custom}</option></select><small>${c.lightshotNote}</small></label>${draft.uploadProvider === "custom" ? `<label class="settings-field">${c.endpoint}<input data-field="uploadEndpoint" type="url" placeholder="https://example.com/upload" value="${esc(draft.uploadEndpoint)}" required></label>` : ""}<label class="settings-field">${c.proxy}<input data-field="proxyUrl" type="text" autocomplete="off" spellcheck="false" placeholder="http://server:8080" value="${esc(draft.proxyUrl)}" ${!native ? "disabled" : ""}><small>${!native ? c.nativeOnly : c.proxyHint}</small></label>`;
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
          tr("settings.removeShortcut", { key: draft.shortcuts[a as CaptureAction][Number(i)] }),
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
        setLanguage(original.language);
        status = t().saved;
        error = false;
      } catch (err) {
        status =
          t().failed + (err instanceof Error ? err.message : String(err));
        error = true;
        if (
          status.includes(t().endpointError) ||
          status.includes(t().proxyError) ||
          status.includes(t().lightshotError)
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
    if ((draft.uploadProvider as string) !== "custom")
      throw new Error(t().lightshotError);
    if (draft.uploadEndpoint.trim()) {
      try {
        const u = new URL(draft.uploadEndpoint.trim());
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
        c.maxShortcuts,
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
      if (isFocusNavigationKey(e)) return;
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
      const key = shortcutKey(e);
      if (!key) {
        message(
          c.unsupportedKey,
          true,
        );
        return;
      }
      if (!isValidShortcut(key, e)) {
        message(t().shortcutModifier, true);
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
