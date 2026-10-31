import "./recording.css";
import { invoke, isTauri } from "@tauri-apps/api/core";
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
  pendingPath: string | null;
  elapsedSeconds: number;
  error: string | null;
}
type Operation = "starting" | "stopping" | "saving" | null;
type Feedback = { text: string; tone: "neutral" | "success" | "error" };
const recordingDraft = { mode: "video", monitor: "", audio: "" };

export function elapsedLabel(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function mountRecording(container: HTMLElement): () => void {
  container.innerHTML = `<section class="recording-view" aria-labelledby="recording-heading">
  <header class="recording-heading"><h1 id="recording-heading">Ses ve video kaydı</h1><p>Ekranınızı ya da yalnızca sesi dosyaya kaydedin.</p></header>
  <fieldset class="recording-mode"><legend class="sr-only">Kayıt türü</legend>
   <label><input type="radio" name="recording-mode" value="video" checked><span data-icon="video"></span><span>Ekran videosu</span><small>MP4</small></label>
   <label><input type="radio" name="recording-mode" value="audio"><span data-icon="mic"></span><span>Yalnız ses</span><small>WAV</small></label>
  </fieldset>
  <div class="recording-fields">
   <label data-screen-label><span class="recording-field-label"><span data-icon="monitor"></span>Ekran</span><select data-screen aria-label="Kaydedilecek ekran" disabled><option value="">Ekranlar okunuyor…</option></select></label>
   <label><span class="recording-field-label"><span data-icon="mic"></span>Ses girişi</span><select data-audio aria-describedby="recording-audio-hint" disabled><option value="">Ses olmadan</option></select></label>
  </div>
  <p id="recording-audio-hint" class="recording-input-hint"></p>
  <details class="recording-help"><summary>Sistem sesini nasıl kaydederim?</summary><p>Bilgisayarınızda sunulan Stereo Mix veya sanal ses kablosu girişini seçin. Yalnızca bu girişe yönlendirilen ses kaydedilir. Mikrofon seçimi yalnız o mikrofonu kaydeder.</p></details>
  <div class="recording-controls">
   <div class="recording-state"><span class="recording-indicator" aria-hidden="true"></span><span data-state>Kayıt hazırlanıyor</span><output class="recording-clock" role="timer" aria-live="off" aria-label="Kayıt süresi">00:00</output></div>
   <div class="recording-buttons">
    <button class="recording-primary" data-start disabled><span class="recording-button-dot" aria-hidden="true"></span><span data-start-label>Kaydı başlat</span></button>
    <button class="recording-stop" data-stop hidden><span data-icon="square"></span><span data-stop-label>Kaydı durdur</span></button>
    <button class="recording-primary" data-save hidden><span data-icon="download"></span><span data-save-label>Dosyaya kaydet</span></button>
    <button class="recording-refresh" data-refresh aria-label="Ekranları ve ses girişlerini yenile"><span data-icon="refresh"></span><span data-refresh-label>Yenile</span></button>
   </div>
  </div>
  <p class="recording-status" role="status" aria-live="polite" aria-atomic="true"></p>
  <details class="recording-recovery" hidden><summary>Kayıt geçici olarak korunuyor</summary><p>Kaydetmeyi iptal etseniz de bu dosya korunur.</p><code></code></details>
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
  const audio = root.querySelector<HTMLSelectElement>("[data-audio]")!;
  const start = root.querySelector<HTMLButtonElement>("[data-start]")!;
  const stop = root.querySelector<HTMLButtonElement>("[data-stop]")!;
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
    start.hidden = status.recording || pending;
    start.disabled =
      !!operation ||
      loadingSources ||
      !statusReady ||
      !sources?.available ||
      (audioOnly ? !audio.value : !screen.value);
    stop.hidden = !status.recording;
    stop.disabled = !!operation;
    save.hidden = !pending;
    save.disabled = !!operation;
    refresh.disabled =
      !native || !!operation || loadingSources || status.recording;
    root.querySelector("[data-start-label]")!.textContent =
      operation === "starting" ? "Başlatılıyor…" : "Kaydı başlat";
    root.querySelector("[data-stop-label]")!.textContent =
      operation === "stopping" ? "Durduruluyor…" : "Kaydı durdur";
    root.querySelector("[data-save-label]")!.textContent =
      operation === "saving" ? "Kaydediliyor…" : "Dosyaya kaydet";
    root.querySelector("[data-refresh-label]")!.textContent = loadingSources
      ? "Okunuyor…"
      : "Yenile";
    stateLabel.textContent =
      operation === "starting"
        ? "Kayıt başlatılıyor"
        : operation === "stopping"
          ? "Kayıt tamamlanıyor"
          : operation === "saving"
            ? "Dosya kaydediliyor"
            : status.recording
              ? "Kayıt sürüyor"
              : pending
                ? "Kaydedilmeyi bekliyor"
                : !native
                  ? "Masaüstü uygulamasında kullanılabilir"
                  : !statusReady || loadingSources
                    ? "Kayıt hazırlanıyor"
                    : !sources?.available
                      ? "Kayıt kullanılamıyor"
                      : "Kayda hazır";
    clock.textContent = elapsedLabel(status.elapsedSeconds);
    clock.hidden =
      pending || operation === "saving" || operation === "starting";
    const noInputs = !!sources && !sources.audioDevices.length;
    inputHint.textContent = loadingSources
      ? "Ses girişleri kontrol ediliyor…"
      : audioOnly && !audio.value
        ? noInputs
          ? "Ses girişi bulunamadı. Mikrofonunuzu bağlayıp Yenile’ye basın."
          : "Kaydı başlatmak için bir ses girişi seçin."
        : !audio.value
          ? "Video sessiz kaydedilir."
          : status.recording
            ? "Seçtiğiniz ses girişi kaydediliyor."
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
        say("Kayıt durdu. Dosyaya kaydedebilirsiniz.", "success");
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
      if (!next.monitors.length) screen.add(new Option("Ekran bulunamadı", ""));
      audio.replaceChildren(
        new Option("Ses olmadan", ""),
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
          "Ekran bulunamadı. Bağlantıyı kontrol edip Yenile’ye basın.",
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
        },
      });
      if (!disposed) say("Kayıt başladı. Bu pencereyi küçültebilirsiniz.");
    });
  stop.onclick = () =>
    void action("stopping", async () => {
      await invoke("stop_recording");
      if (!disposed) say("Kayıt durdu. Dosyaya kaydedebilirsiniz.", "success");
    });
  save.onclick = () =>
    void action("saving", async () => {
      const path = await invoke<string | null>("save_recording");
      if (!disposed)
        say(
          path
            ? `Kaydedildi: ${path}`
            : "Kaydetme iptal edildi. Kayıt korunuyor.",
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
  audio.onchange = screen.onchange = () => {
    recordingDraft.monitor = screen.value;
    recordingDraft.audio = audio.value;
    render();
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  if (native) {
    void sync();
    void load();
    timer = setInterval(() => {
      if (!operation) void sync();
    }, 1000);
  } else {
    screen.replaceChildren(new Option("Masaüstü uygulamasında seçilir", ""));
    say("Ses ve video kaydı Windows masaüstü uygulamasında kullanılabilir.");
    render();
  }
  return () => {
    disposed = true;
    if (timer) clearInterval(timer);
  };
}
