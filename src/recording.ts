import "./recording.css";
import { t } from "./i18n";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createElement,
  Video,
  Mic,
  Monitor,
  RefreshCw,
  Square,
  Download,
} from "lucide";

interface Sources {
  monitors: { id: number; name: string; width: number; height: number }[];
  audioDevices: string[];
  available: boolean;
  message: string | null;
}
interface Status {
  recording: boolean;
  paused: boolean;
  pendingPath: string | null;
  elapsedSeconds: number;
  error: string | null;
}
type Operation = "starting" | "stopping" | "saving" | "pausing" | "resuming" | null;
type Feedback = { text: string; tone: "neutral" | "success" | "error" };
const recordingDraft = { mode: "video", monitor: "", audio: "" };

export function elapsedLabel(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function mountRecording(container: HTMLElement): () => void {
  container.innerHTML = `<section class="recording-view" aria-labelledby="recording-heading">
  <header class="recording-heading"><h1 id="recording-heading">${t("rec.title")}</h1><p>${t("rec.subtitle")}</p></header>
  <fieldset class="recording-mode"><legend class="sr-only">${t("rec.modeLabel")}</legend>
   <label><input type="radio" name="recording-mode" value="video" checked><span data-icon="video"></span><span>${t("rec.modeVideo")}</span><small>MP4</small></label>
   <label><input type="radio" name="recording-mode" value="audio"><span data-icon="mic"></span><span>${t("rec.modeAudio")}</span><small>WAV</small></label>
  </fieldset>
  <div class="recording-fields">
   <label data-screen-label><span class="recording-field-label"><span data-icon="monitor"></span>${t("rec.screen")}</span><select data-screen aria-label="${t("rec.screenAria")}" disabled><option value="">${t("rec.screensLoading")}</option></select></label>
   <label data-region-label><span class="recording-field-label">${t("rec.area")}</span><select data-region><option value="full">${t("rec.areaFull")}</option><option value="selected">${t("rec.areaSelected")}</option></select><button type="button" data-pick hidden>${t("rec.pickArea")}</button><span data-region-size></span></label>
   <label><span class="recording-field-label"><span data-icon="mic"></span>${t("rec.audioInput")}</span><select data-audio aria-describedby="recording-audio-hint" disabled><option value="">${t("rec.noAudio")}</option></select></label>
  </div>
  <p id="recording-audio-hint" class="recording-input-hint"></p>
  <details class="recording-help"><summary>${t("rec.helpSummary")}</summary><p>${t("rec.helpBody")}</p></details>
  <div class="recording-controls">
   <div class="recording-state"><span class="recording-indicator" aria-hidden="true"></span><span data-state>${t("rec.state.preparing")}</span><output class="recording-clock" role="timer" aria-live="off" aria-label="${t("rec.clockLabel")}">00:00</output></div>
   <div class="recording-buttons">
    <button class="recording-primary" data-start disabled><span class="recording-button-dot" aria-hidden="true"></span><span data-start-label>${t("rec.start")}</span></button>
    <button class="recording-stop" data-stop hidden><span data-icon="square"></span><span data-stop-label>${t("rec.stop")}</span></button>
    <button class="recording-refresh" data-pause hidden>${t("rec.pause")}</button>
    <button class="recording-primary" data-save hidden><span data-icon="download"></span><span data-save-label>${t("rec.saveFile")}</span></button>
    <button class="recording-refresh" data-refresh aria-label="${t("rec.refreshAria")}"><span data-icon="refresh"></span><span data-refresh-label>${t("rec.refresh")}</span></button>
   </div>
  </div>
  <p class="recording-status" role="status" aria-live="polite" aria-atomic="true"></p>
  <details class="recording-recovery" hidden><summary>${t("rec.recoverySummary")}</summary><p>${t("rec.recoveryBody")}</p><code></code></details>
 </section>`;
  const root = container.querySelector<HTMLElement>(".recording-view")!;
  const icons = {
    video: Video,
    mic: Mic,
    monitor: Monitor,
    refresh: RefreshCw,
    square: Square,
    download: Download,
  };
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const svg = createElement(icons[el.dataset.icon as keyof typeof icons]);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("stroke-width", "1.7");
    el.replaceWith(svg);
  });
  const modes = [
    ...root.querySelectorAll<HTMLInputElement>('[name="recording-mode"]'),
  ];
  for (const input of modes)
    input.checked = input.value === recordingDraft.mode;
  const screen = root.querySelector<HTMLSelectElement>("[data-screen]")!;
  const regionMode = root.querySelector<HTMLSelectElement>("[data-region]")!;
  const pick = root.querySelector<HTMLButtonElement>("[data-pick]")!;
  const regionSize = root.querySelector<HTMLElement>("[data-region-size]")!;
  let region: { x: number; y: number; width: number; height: number } | null = null;
  let unlistenRegion: (() => void) | undefined;
  const audio = root.querySelector<HTMLSelectElement>("[data-audio]")!;
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;
  const stop = root.querySelector<HTMLButtonElement>("[data-stop]")!;
  const pause = root.querySelector<HTMLButtonElement>("[data-pause]")!;
  const save = root.querySelector<HTMLButtonElement>("[data-save]")!;
  const refresh = root.querySelector<HTMLButtonElement>("[data-refresh]")!;
  const message = root.querySelector<HTMLElement>(".recording-status")!;
  const clock = root.querySelector<HTMLOutputElement>(".recording-clock")!;
  const recovery = root.querySelector<HTMLDetailsElement>(
    ".recording-recovery",
  )!;
  const inputHint = root.querySelector<HTMLElement>(".recording-input-hint")!;
  const stateLabel = root.querySelector<HTMLElement>("[data-state]")!;
  let disposed = false,
    loadingSources = false,
    statusReady = false,
    polling = false;
  let operation: Operation = null,
    sources: Sources | null = null,
    feedback: Feedback | null = null;
  let status: Status = {
    recording: false,
    paused: false,
    pendingPath: null,
    elapsedSeconds: 0,
    error: null,
  };
  let previousNativeError: string | null = null;
  const native = isTauri();
  const mode = () => modes.find((input) => input.checked)!.value;
  const say = (text: string, tone: Feedback["tone"] = "neutral") => {
    feedback = { text, tone };
  };

  function render() {
    if (disposed) return;
    const pending = !!status.pendingPath;
    const locked = !!operation || status.recording || pending;
    const audioOnly = mode() === "audio";
    root.dataset.mode = mode();
    root.dataset.state =
      operation ??
      (status.recording ? "recording" : pending ? "pending" : "idle");
    root.setAttribute("aria-busy", String(!!operation || loadingSources));
    for (const input of modes) input.disabled = locked;
    screen.disabled = audio.disabled =
      locked || loadingSources || !sources?.available;
    root.querySelector<HTMLElement>("[data-screen-label]")!.hidden = audioOnly;
    root.querySelector<HTMLElement>("[data-region-label]")!.hidden = audioOnly;
    regionMode.disabled = locked || loadingSources || !sources?.available;
    pick.hidden = regionMode.value !== "selected";
    pick.disabled = regionMode.disabled;
    regionSize.textContent = region ? `${Math.round(region.width)} × ${Math.round(region.height)}` : "";
    start.hidden = status.recording || pending;
    start.disabled =
      !!operation ||
      loadingSources ||
      !statusReady ||
      !sources?.available ||
      (audioOnly ? !audio.value : !screen.value || (regionMode.value === "selected" && !region));
    stop.hidden = !status.recording;
    stop.disabled = !!operation;
    pause.hidden = !status.recording;
    pause.disabled = !!operation;
    pause.textContent = operation === "pausing" ? t("rec.pausing") : operation === "resuming" ? t("rec.resuming") : status.paused ? t("rec.resume") : t("rec.pause");
    save.hidden = !pending;
    save.disabled = !!operation;
    refresh.disabled =
      !native || !!operation || loadingSources || status.recording;
    root.querySelector("[data-start-label]")!.textContent =
      operation === "starting" ? t("rec.starting") : t("rec.start");
    root.querySelector("[data-stop-label]")!.textContent =
      operation === "stopping" ? t("rec.stopping") : t("rec.stop");
    root.querySelector("[data-save-label]")!.textContent =
      operation === "saving" ? t("rec.savingFile") : t("rec.saveFile");
    root.querySelector("[data-refresh-label]")!.textContent = loadingSources
      ? t("rec.refreshing")
      : t("rec.refresh");
    stateLabel.textContent =
      operation === "starting"
        ? t("rec.state.starting")
        : operation === "stopping"
          ? t("rec.state.stopping")
          : operation === "saving"
            ? t("rec.state.saving")
            : status.recording
              ? status.paused ? t("rec.state.paused") : t("rec.state.recording")
              : pending
                ? t("rec.state.pending")
                : !native
                  ? t("rec.state.desktopOnly")
                  : !statusReady || loadingSources
                    ? t("rec.state.preparing")
                    : !sources?.available
                      ? t("rec.state.unavailable")
                      : t("rec.state.ready");
    clock.textContent = elapsedLabel(status.elapsedSeconds);
    clock.hidden =
      pending || operation === "saving" || operation === "starting";
    const noInputs = !!sources && !sources.audioDevices.length;
    inputHint.textContent = loadingSources
      ? t("rec.hint.checking")
      : audioOnly && !audio.value
        ? noInputs
          ? t("rec.hint.noInputs")
          : t("rec.hint.pickInput")
        : !audio.value
          ? t("rec.hint.silent")
          : status.recording
            ? t("rec.hint.recordingInput")
            : "";
    inputHint.hidden = !inputHint.textContent;
    audio.setAttribute(
      "aria-invalid",
      String(audioOnly && !audio.value && !loadingSources),
    );
    root.querySelector<HTMLDetailsElement>(".recording-help")!.hidden =
      !!sources && !sources.audioDevices.length;
    message.textContent = feedback?.text ?? "";
    message.dataset.tone = feedback?.tone ?? "neutral";
    message.hidden = !feedback?.text;
    recovery.hidden = !pending;
    recovery.querySelector("code")!.textContent = status.pendingPath ?? "";
  }

  async function sync() {
    if (polling || disposed) return;
    polling = true;
    try {
      const next = await invoke<Status>("recording_status");
      if (disposed) return;
      const ended = status.recording && !next.recording;
      status = next;
      statusReady = true;
      if (next.pendingPath) {
        const recordedMode = /\.wav$/i.test(next.pendingPath)
          ? "audio"
          : "video";
        for (const input of modes) input.checked = input.value === recordedMode;
        recordingDraft.mode = recordedMode;
      }
      if (next.error && next.error !== previousNativeError)
        say(next.error, "error");
      else if (ended && !next.error)
        say(t("rec.stoppedSave"), "success");
      previousNativeError = next.error;
      render();
    } catch (e) {
      if (!disposed) {
        say(String(e), "error");
        render();
      }
    } finally {
      polling = false;
    }
  }

  async function load() {
    if (loadingSources || operation || status.recording) return;
    loadingSources = true;
    render();
    try {
      const next = await invoke<Sources>("recording_sources");
      if (disposed) return;
      const previousScreen = screen.value || recordingDraft.monitor,
        previousAudio = audio.value || recordingDraft.audio;
      sources = next;
      screen.replaceChildren(
        ...next.monitors.map(
          (m, i) =>
            new Option(
              `${i + 1}. ${m.name} · ${m.width} × ${m.height}`,
              String(m.id),
            ),
        ),
      );
      if (!next.monitors.length) screen.add(new Option(t("rec.noScreens"), ""));
      audio.replaceChildren(
        new Option(t("rec.noAudio"), ""),
        ...next.audioDevices.map((d) => new Option(d, d)),
      );
      if (next.monitors.some((m) => String(m.id) === previousScreen))
        screen.value = previousScreen;
      if (next.audioDevices.includes(previousAudio))
        audio.value = previousAudio;
      recordingDraft.monitor = screen.value;
      recordingDraft.audio = audio.value;
      if (next.message) say(next.message, "error");
      else if (!next.monitors.length && mode() === "video")
        say(
          t("rec.noScreensRefresh"),
          "error",
        );
      else if (!status.error) feedback = null;
    } catch (e) {
      if (!disposed) say(String(e), "error");
    } finally {
      loadingSources = false;
      render();
    }
  }

  async function action(
    kind: Exclude<Operation, null>,
    work: () => Promise<void>,
  ) {
    if (operation) return;
    const focusWasInside = root.contains(document.activeElement);
    operation = kind;
    feedback = null;
    render();
    try {
      await work();
    } catch (e) {
      if (!disposed) say(String(e), "error");
    } finally {
      await sync();
      operation = null;
      render();
      if (!disposed) {
        const target = status.recording
          ? stop
          : status.pendingPath
            ? save
            : start;
        if (
          focusWasInside &&
          (root.contains(document.activeElement) ||
            document.activeElement === document.body) &&
          !target.disabled
        )
          target.focus({ preventScroll: true });
      }
    }
  }

  start.onclick = () =>
    void action("starting", async () => {
      await invoke("start_recording", {
        options: {
          mode: mode(),
          monitorId: screen.value ? Number(screen.value) : null,
          audioDevice: audio.value || null,
          region: mode() === "video" && regionMode.value === "selected" ? region : null,
        },
      });
      if (!disposed) say(t("rec.started"));
    });
  stop.onclick = () =>
    void action("stopping", async () => {
      await invoke("stop_recording");
      if (!disposed) say(t("rec.stoppedSave"), "success");
    });
  pause.onclick = () => void action(status.paused ? "resuming" : "pausing", async () => {
    await invoke(status.paused ? "resume_recording" : "pause_recording");
  });
  save.onclick = () =>
    void action("saving", async () => {
      const path = await invoke<string | null>("save_recording");
      if (!disposed)
        say(
          path
            ? t("rec.savedTo", { path })
            : t("rec.saveCancelled"),
          path ? "success" : "neutral",
        );
    });
  refresh.onclick = () => void load();
  for (const input of modes)
    input.onchange = () => {
      recordingDraft.mode = mode();
      feedback = null;
      render();
    };
  audio.onchange = () => {
    recordingDraft.monitor = screen.value;
    recordingDraft.audio = audio.value;
    render();
  };
  screen.onchange = () => { region = null; recordingDraft.monitor = screen.value; render(); };
  regionMode.onchange = () => { region = null; render(); if (regionMode.value === "selected") pick.click(); };
  pick.onclick = () => { void invoke("open_recording_region", { monitorId: Number(screen.value) }).catch((error) => { say(String(error), "error"); render(); }); };
  let timer: ReturnType<typeof setInterval> | undefined;
  if (native) {
    void listen<[number, typeof region]>("recording-region", (event) => {
      if (event.payload[0] === Number(screen.value)) region = event.payload[1];
      render();
    }).then((unlisten) => { if (disposed) unlisten(); else unlistenRegion = unlisten; }).catch((error) => { say(String(error), "error"); render(); });
    void sync();
    void load();
    timer = setInterval(() => {
      if (!operation) void sync();
    }, 1000);
  } else {
    screen.replaceChildren(new Option(t("rec.screenDesktopOnly"), ""));
    say(t("rec.desktopOnlyNote"));
    render();
  }
  return () => {
    disposed = true;
    unlistenRegion?.();
    if (timer) clearInterval(timer);
  };
}
