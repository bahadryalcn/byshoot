import { listen } from "@tauri-apps/api/event";
import { api, native } from "./bridge";
import type { Capture, CaptureAction, Settings } from "./contracts";
import { defaultSettings } from "./contracts";
import {
  rectBetween,
  screenPoint,
  moveRect,
  cropBounds,
  paintStroke,
  type Rect,
  type Point,
  type Stroke,
  type Tool,
} from "./drawing";
import "./editor.css";
import {
  placeEditorPanels,
  guideMonitor,
  interactionMonitor,
  placeMonitorPanel,
} from "./editor-layout";
import {
  captureViewportSize,
  waitForCaptureViewport,
} from "./capture-viewport";
import {
  createElement,
  MousePointer2,
  Pencil,
  Highlighter,
  MoveUpRight,
  Square,
  Circle,
  Type,
  CircleDot,
  Grid2X2,
  Undo2,
  Redo2,
  Copy,
  Save,
  Upload,
  Crop,
  X,
  type IconNode,
} from "lucide";

export async function mountEditor(
  container: HTMLElement,
  options: { demo?: boolean } = {},
) {
  const demo = options.demo || !native;
  container.innerHTML = `<section class="capture-editor" aria-label="Ekran görüntüsü düzenleyici"><canvas class="capture-canvas" aria-label="Alan seçmek veya çizmek için sürükleyin"></canvas><div class="capture-guide"><strong>${demo ? "DEMO · BYSHOOT" : "BYSHOOT"}</strong><span>Yakalamak istediğiniz alanı seçin</span><kbd>Esc</kbd><span>Vazgeç</span></div><div class="capture-dimensions"></div><div class="capture-tools" role="toolbar" aria-label="Çizim araçları"></div><div class="capture-actions" role="toolbar" aria-label="Görüntü işlemleri"></div><div class="capture-toast" role="status" aria-live="polite"></div><dialog class="capture-dialog"><form method="dialog"><h2>Görüntüyü paylaş</h2><p>Bu görüntü herkese açık bir bağlantıyla paylaşılır. Hassas bilgileri gizlediğinizden emin olun.</p><div><button value="cancel">Vazgeç</button><button value="upload" class="upload-confirm">Yükle ve bağlantı oluştur</button></div></form></dialog></section>`;
  const root = container.querySelector<HTMLElement>(".capture-editor")!,
    canvas = root.querySelector<HTMLCanvasElement>("canvas")!;
  const displayCtx = canvas.getContext("2d", { alpha: false })!;
  const frameCanvas = document.createElement("canvas"),
    ctx = frameCanvas.getContext("2d", { alpha: false })!;
  const tools = root.querySelector<HTMLElement>(".capture-tools")!,
    actions = root.querySelector<HTMLElement>(".capture-actions")!,
    guide = root.querySelector<HTMLElement>(".capture-guide")!,
    dimensions = root.querySelector<HTMLElement>(".capture-dimensions")!,
    toast = root.querySelector<HTMLElement>(".capture-toast")!,
    dialog = root.querySelector<HTMLDialogElement>("dialog")!;
  const dock = document.createElement("div");
  dock.className = "capture-dock";
  dock.hidden = true;
  root.append(dock);
  dock.append(tools, actions);
  let image = new Image(),
    capture: Capture | null = null,
    selection: Rect | null = null,
    strokes: Stroke[] = [],
    redo: Stroke[] = [],
    active: Stroke | null = null,
    tool: Tool = "select",
    color = "#fa5f55",
    width = 4,
    settings: Settings = defaultSettings,
    busy = false,
    loading = false,
    generation = 0,
    frame = 0;
  let drag: {
    kind: "select" | "move" | "resize" | "draw";
    start: Point;
    rect?: Rect;
    anchor?: Point;
  } | null = null;
  let guidePointer: Point | undefined;
  let dialogPointer: Point | undefined;
  // Track the initiating control as well as canvas interactions. Keyboard actions
  // retain the last interaction monitor instead of the virtual desktop center.
  root.addEventListener(
    "pointerdown",
    (e) => {
      if (!dialog.open && !noteDialog.open) guidePointer = point(e);
    },
    { capture: true },
  );
  const composed = document.createElement("canvas"),
    composedCtx = composed.getContext("2d")!;
  let cachedCapture: Capture | null = null,
    cachedStrokes: Stroke[] = [];
  const noteDialog = document.createElement("dialog");
  noteDialog.className = "capture-dialog";
  noteDialog.innerHTML =
    '<form method="dialog"><h2>Not ekle</h2><textarea aria-label="Not metni" placeholder="Notunuzu yazın…" rows="4" maxlength="2000"></textarea><div><button value="cancel">Vazgeç</button><button value="add" class="upload-confirm">Notu ekle</button></div></form>';
  root.append(noteDialog);
  async function addText(p: Point) {
    const token = generation;
    noteDialog.returnValue = "cancel";
    noteDialog.querySelector<HTMLTextAreaElement>("textarea")!.value = "";
    dialogPointer = p;
    noteDialog.showModal();
    layoutOverlays();
    noteDialog.querySelector<HTMLTextAreaElement>("textarea")!.focus();
    const result = await new Promise<string>((resolve) =>
      noteDialog.addEventListener(
        "close",
        () => resolve(noteDialog.returnValue),
        { once: true },
      ),
    );
    const value =
      noteDialog.querySelector<HTMLTextAreaElement>("textarea")!.value;
    if (token === generation && result === "add" && value.trim()) {
      strokes.push({ tool: "text", points: [p], color, width, text: value });
      redo = [];
      schedule();
    }
  }
  const labels: Array<[Tool, string, string, string]> = [
    ["select", "↖", "Seç / taşı", "V"],
    ["pen", "✎", "Kalem", "P"],
    ["highlight", "▰", "Vurgula", "H"],
    ["arrow", "↗", "Ok", "A"],
    ["rectangle", "□", "Dikdörtgen", "R"],
    ["ellipse", "○", "Elips", "O"],
    ["text", "T", "Not ekle", "T"],
    ["marker", "①", "Numara", "N"],
    ["pixelate", "▦", "Pikselleştir", "B"],
  ];
  const button = (label: string, title: string, fn: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.onclick = fn;
    return b;
  };
  const setTool = (next: Tool) => {
    tool = next;
    tools.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
    });
    canvas.style.cursor = tool === "select" ? "crosshair" : "crosshair";
  };
  const toolIcons: Record<Tool, IconNode> = {
    select: MousePointer2,
    pen: Pencil,
    highlight: Highlighter,
    arrow: MoveUpRight,
    rectangle: Square,
    ellipse: Circle,
    text: Type,
    marker: CircleDot,
    pixelate: Grid2X2,
  };
  const setIcon = (b: HTMLButtonElement, node: IconNode) => {
    b.textContent = "";
    b.append(
      createElement([
        node[0],
        { ...node[1], width: 16, height: 16, "stroke-width": 1.8 },
        node[2],
      ]),
    );
  };
  labels.forEach(([name, _icon, title, key]) => {
    const b = button("", `${title} (${key})`, () => setTool(name));
    setIcon(b, toolIcons[name]);
    b.dataset.tool = name;
    tools.append(b);
  });
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = color;
  colorInput.title = "Çizim rengi";
  colorInput.setAttribute("aria-label", "Çizim rengi");
  colorInput.oninput = () => (color = colorInput.value);
  tools.append(colorInput);
  const widthInput = document.createElement("input");
  widthInput.type = "range";
  widthInput.min = "1";
  widthInput.max = "12";
  widthInput.value = String(width);
  widthInput.title = "Çizgi kalınlığı";
  widthInput.setAttribute("aria-label", "Çizgi kalınlığı");
  widthInput.oninput = () => (width = Number(widthInput.value));
  tools.append(widthInput);
  const undoButton = button("↶", "Geri al (Ctrl/Cmd+Z)", () => undo()),
    redoButton = button("↷", "Yinele (Ctrl/Cmd+Shift+Z)", () => redoStroke());
  tools.append(undoButton, redoButton);
  setIcon(undoButton, Undo2);
  setIcon(redoButton, Redo2);
  const copyButton = button(
      "Kopyala",
      "Panoya kopyala (Ctrl/Cmd+C)",
      () => void execute("copy"),
    ),
    saveButton = button(
      "Kaydet",
      "Dosyaya kaydet (Ctrl/Cmd+S)",
      () => void execute("save"),
    ),
    uploadButton = button(
      "↑ Paylaş",
      "Bağlantıyla paylaş",
      () => void requestUpload(),
    );
  actions.append(
    button("Yeni alan", "Alanı yeniden seç", () => {
      selection = null;
      setTool("select");
      schedule();
    }),
    copyButton,
    saveButton,
    uploadButton,
    button("×", "Vazgeç (Esc)", () => void close()),
  );
  copyButton.classList.add("primary");
  [Crop, Copy, Save, Upload, X].forEach((icon, index) => {
    const b = actions.children[index] as HTMLButtonElement;
    const label = b.textContent!;
    setIcon(b, icon);
    if (index > 0 && index < 4) {
      const span = document.createElement("span");
      span.textContent = label.replace("↑ ", "");
      b.append(span);
    }
  });
  function show(message: string) {
    toast.textContent = message;
    toast.hidden = false;
    layoutOverlays();
  }
  function displayRect(): Rect {
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  function point(e: PointerEvent): Point {
    return screenPoint(
      { x: e.clientX, y: e.clientY },
      displayRect(),
      canvas.width,
      canvas.height,
    );
  }
  function cssMonitor(pointer = guidePointer) {
    const d = displayRect(),
      m = interactionMonitor(
        capture?.monitors ?? [],
        pointer,
        selection,
        capture?.activeMonitor,
        { width: canvas.width, height: canvas.height },
      );
    return {
      x: (m.x * d.width) / canvas.width,
      y: (m.y * d.height) / canvas.height,
      width: (m.width * d.width) / canvas.width,
      height: (m.height * d.height) / canvas.height,
    };
  }
  function layoutOverlays() {
    if (!capture) return;
    for (const panel of [dialog, noteDialog, toast]) {
      if (panel instanceof HTMLDialogElement ? !panel.open : panel.hidden)
        continue;
      const monitor = cssMonitor(
        panel instanceof HTMLDialogElement ? dialogPointer : guidePointer,
      );
      panel.style.maxInlineSize = Math.max(0, monitor.width - 32) + "px";
      panel.style.maxBlockSize = Math.max(0, monitor.height - 32) + "px";
      const p = placeMonitorPanel(
        monitor,
        { width: panel.offsetWidth, height: panel.offsetHeight },
        panel === toast ? "bottom" : "center",
      );
      panel.style.insetInlineStart = p.x + "px";
      panel.style.insetBlockStart = p.y + "px";
    }
  }
  function rebuild() {
    if (!capture) return;
    if (
      cachedCapture === capture &&
      cachedStrokes.length === strokes.length &&
      cachedStrokes.every((s, i) => s === strokes[i])
    )
      return;
    composedCtx.clearRect(0, 0, composed.width, composed.height);
    composedCtx.drawImage(image, 0, 0, composed.width, composed.height);
    strokes.forEach((s) => paintStroke(composedCtx, s));
    cachedCapture = capture;
    cachedStrokes = [...strokes];
  }
  function setLocked() {
    tools
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")
      .forEach((el) => (el.disabled = busy || loading));
    actions
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((el) => (el.disabled = busy || loading));
    undoButton.disabled = busy || loading || !strokes.length;
    redoButton.disabled = busy || loading || !redo.length;
  }
  function layoutPanels() {
    if (!selection) return;
    const d = displayRect();
    const r = {
      x: (selection.x * d.width) / canvas.width,
      y: (selection.y * d.height) / canvas.height,
      width: (selection.width * d.width) / canvas.width,
      height: (selection.height * d.height) / canvas.height,
    };
    const screens = capture?.monitors?.map((m) => ({
      x: (m.x * d.width) / canvas.width,
      y: (m.y * d.height) / canvas.height,
      width: (m.width * d.width) / canvas.width,
      height: (m.height * d.height) / canvas.height,
    }));
    const monitor = interactionMonitor(
      screens ?? [],
      undefined,
      r,
      capture?.activeMonitor,
      { width: root.clientWidth, height: root.clientHeight },
    );
    dock.style.maxInlineSize = Math.max(0, monitor.width - 16) + "px";
    dock.style.maxBlockSize = Math.max(0, monitor.height - 16) + "px";
    const placed = placeEditorPanels(
      r,
      { width: root.clientWidth, height: root.clientHeight },
      { width: dock.offsetWidth, height: dock.offsetHeight },
      { width: dimensions.offsetWidth, height: dimensions.offsetHeight },
      screens,
    );
    dock.style.insetInlineStart = placed.dock.x + "px";
    dock.style.insetBlockStart = placed.dock.y + "px";
    dimensions.style.insetInlineStart = placed.badge.x + "px";
    dimensions.style.insetBlockStart = placed.badge.y + "px";
  }
  function layoutGuide() {
    if (!capture) return;
    const d = displayRect();
    const monitor = guideMonitor(
      capture.monitors ?? [],
      guidePointer,
      capture.activeMonitor,
      { width: canvas.width, height: canvas.height },
    );
    guide.style.insetInlineStart =
      ((monitor.x + monitor.width / 2) * d.width) / canvas.width + "px";
    guide.style.insetBlockStart =
      (monitor.y * d.height) / canvas.height + 16 + "px";
    guide.style.maxInlineSize =
      Math.max(0, (monitor.width * d.width) / canvas.width - 32) + "px";
  }
  function render() {
    frame = 0;
    if (!capture) return;
    rebuild();
    ctx.drawImage(composed, 0, 0);
    if (active) paintStroke(ctx, active);
    ctx.save();
    ctx.fillStyle = "rgba(6,12,22,.56)";
    if (selection) {
      const r = selection;
      ctx.fillRect(0, 0, canvas.width, r.y);
      ctx.fillRect(0, r.y, r.x, r.height);
      ctx.fillRect(r.x + r.width, r.y, canvas.width - r.x - r.width, r.height);
      ctx.fillRect(
        0,
        r.y + r.height,
        canvas.width,
        canvas.height - r.y - r.height,
      );
      const scale = canvas.width / displayRect().width;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = scale;
      ctx.setLineDash([5 * scale, 4 * scale]);
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      ctx.setLineDash([]);
      ctx.fillStyle = "#fff";
      [
        [r.x, r.y],
        [r.x + r.width, r.y],
        [r.x, r.y + r.height],
        [r.x + r.width, r.y + r.height],
      ].forEach(([x, y]) =>
        ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale),
      );
      dimensions.textContent =
        Math.round(r.width) + " × " + Math.round(r.height) + " px";
    }
    ctx.restore();
    displayCtx.drawImage(frameCanvas, 0, 0);
    guide.hidden = !!selection;
    tools.hidden = actions.hidden = dimensions.hidden = !selection;
    if (!selection) layoutGuide();
    dock.hidden = !selection || !!(drag && drag.kind !== "draw");
    setLocked();
    if (selection) layoutPanels();
    layoutOverlays();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  function undo() {
    const s = strokes.pop();
    if (s) redo.push(s);
    schedule();
  }
  function redoStroke() {
    const s = redo.pop();
    if (s) strokes.push(s);
    schedule();
  }
  function inside(p: Point, r: Rect) {
    return (
      p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
    );
  }
  canvas.onpointerdown = (e) => {
    if (busy || !capture || e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = point(e);
    toast.hidden = true;
    if (selection && tool !== "select" && inside(p, selection)) {
      if (tool === "text") {
        canvas.releasePointerCapture(e.pointerId);
        void addText(p);
        return;
      }
      active = {
        tool: tool as Stroke["tool"],
        points: [p],
        color,
        width,
        number: strokes.filter((s) => s.tool === "marker").length + 1,
      };
      drag = { kind: "draw", start: p };
    } else if (selection && tool === "select") {
      const r = selection,
        threshold = (12 * canvas.width) / displayRect().width;
      const corners = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x, y: r.y + r.height },
        { x: r.x + r.width, y: r.y + r.height },
      ];
      const corner = corners.findIndex(
        (c) => Math.hypot(c.x - p.x, c.y - p.y) < threshold,
      );
      if (corner >= 0)
        drag = { kind: "resize", start: p, anchor: corners[3 - corner] };
      else if (inside(p, r)) drag = { kind: "move", start: p, rect: { ...r } };
      else {
        selection = null;
        drag = { kind: "select", start: p };
      }
    } else {
      selection = null;
      drag = { kind: "select", start: p };
    }
    schedule();
  };
  canvas.onpointermove = (e) => {
    const p = point(e);
    guidePointer = p;
    if (!selection) layoutGuide();
    if (!drag) return;
    if (drag.kind === "select") selection = rectBetween(drag.start, p);
    else if (drag.kind === "resize") selection = rectBetween(drag.anchor!, p);
    else if (drag.kind === "move")
      selection = moveRect(
        drag.rect!,
        { x: p.x - drag.start.x, y: p.y - drag.start.y },
        canvas.width,
        canvas.height,
      );
    else if (active) {
      if (active.tool === "pen" || active.tool === "highlight")
        active.points.push(p);
      else active.points = [drag.start, p];
    }
    schedule();
  };
  const end = () => {
    if (active) {
      strokes.push(active);
      active = null;
      redo = [];
    }
    drag = null;
    if (selection && (selection.width < 3 || selection.height < 3))
      selection = null;
    schedule();
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = () => {
    active = null;
    drag = null;
    schedule();
  };
  async function close(nativeClose = true) {
    const id = capture?.id;
    const token = ++generation;
    selection = null;
    strokes = [];
    redo = [];
    active = null;
    drag = null;
    if (noteDialog.open) noteDialog.close("cancel");
    if (dialog.open) dialog.close("cancel");
    dock.hidden = true;
    dimensions.hidden = true;
    if (nativeClose) await api.close(id);
    if (token !== generation) return;
    capture = null;
    cachedCapture = null;
    cachedStrokes = [];
    image.src = "";
    canvas.width = frameCanvas.width = composed.width = 1;
    canvas.height = frameCanvas.height = composed.height = 1;
    if (demo)
      container.innerHTML =
        '<div class="capture-demo-ended">Demo tamamlandı. Yeniden denemek için sayfayı yenileyin.</div>';
  }
  async function exported(useFileFormat = false) {
    if (!selection || !capture) throw new Error("Önce bir alan seçin.");
    rebuild();
    const r = cropBounds(selection, canvas.width, canvas.height);
    if (!r.width || !r.height) throw new Error("Geçerli bir alan seçin.");
    const out = document.createElement("canvas");
    out.width = r.width;
    out.height = r.height;
    out
      .getContext("2d")!
      .drawImage(
        composed,
        r.x,
        r.y,
        r.width,
        r.height,
        0,
        0,
        r.width,
        r.height,
      );
    return out.toDataURL(
      useFileFormat && settings.format === "jpeg" ? "image/jpeg" : "image/png",
      settings.jpegQuality / 100,
    );
  }
  async function execute(action: "copy" | "save" | "upload") {
    if (busy || loading) return;
    const token = generation;
    if (drag) end();
    busy = true;
    setLocked();
    root.classList.add("busy");
    try {
      const dataUrl = await exported(demo && action === "save");
      if (action === "copy") {
        if (demo) {
          const blob = await (await fetch(dataUrl)).blob();
          if (blob.type !== "image/png") {
            const bitmap = await createImageBitmap(blob);
            const png = document.createElement("canvas");
            png.width = bitmap.width;
            png.height = bitmap.height;
            png.getContext("2d")!.drawImage(bitmap, 0, 0);
            const pngBlob = await new Promise<Blob>((r) =>
              png.toBlob((b) => r(b!)),
            );
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": pngBlob }),
            ]);
          } else
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
        } else await api.copy(dataUrl);
        if (token !== generation) return;
        await close(demo);
      } else if (action === "save") {
        if (demo) {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `byshoot-${Date.now()}.${settings.format === "jpeg" ? "jpg" : "png"}`;
          a.click();
          await close();
        } else {
          const location = await api.save(dataUrl);
          if (token === generation && location) await close(false);
        }
      } else {
        if (demo)
          throw new Error(
            "Yükleme masaüstü uygulamasında kullanılabilir. Demo görüntüsü internete gönderilmedi.",
          );
        show("Görüntü yükleniyor…");
        const url = await api.upload(dataUrl);
        if (token !== generation) return;
        show(`Paylaşım bağlantısı: ${url}`);
        if (settings.closeAfterUpload) await close(false);
      }
    } catch (error) {
      if (token === generation)
        show(error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
      setLocked();
      root.classList.remove("busy");
    }
  }
  async function requestUpload() {
    if (busy || loading || !selection) return;
    const token = generation;
    if (demo) {
      show(
        "Bağlantıyla paylaşım masaüstü uygulamasında kullanılabilir. Demo görüntüsü internete gönderilmedi.",
      );
      return;
    }
    if (settings.uploadProvider === "lightshot") {
      show(
        "prnt.sc doğrudan yükleme bu sürümde kullanılamıyor. Ayarlar → Yükleme ve vekil sunucu bölümünde özel bir yükleme servisi ayarlayın veya görüntüyü kopyalayın.",
      );
      return;
    }
    if (!settings.uploadEndpoint) {
      show(
        "Önce Ayarlar → Yükleme ve vekil sunucu bölümünde bir yükleme servisi adresi ekleyin.",
      );
      return;
    }
    dialog.querySelector("p")!.textContent =
      "Görüntü ayarladığınız yükleme servisine gönderilecek: " +
      settings.uploadEndpoint +
      ". Oluşturulan bağlantıya erişebilen kişiler görüntüyü görebilir. Hassas bilgileri gizlediğinizden emin olun.";
    dialog.returnValue = "cancel";
    dialogPointer = guidePointer;
    dialog.showModal();
    layoutOverlays();
    const result = await new Promise<string>((resolve) =>
      dialog.addEventListener("close", () => resolve(dialog.returnValue), {
        once: true,
      }),
    );
    if (token === generation && result === "upload") await execute("upload");
  }
  function key(e: KeyboardEvent) {
    if (busy || loading) {
      e.preventDefault();
      return;
    }
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      dialog.open ||
      noteDialog.open
    )
      return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      if (!busy) void close();
    } else if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redoStroke();
      else undo();
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redoStroke();
    } else if (mod && ["s", "c"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      void execute(e.key.toLowerCase() === "s" ? "save" : "copy");
    } else if (!mod) {
      const entry = labels.find(
        (t) => t[3].toLowerCase() === e.key.toLowerCase(),
      );
      if (entry) {
        e.preventDefault();
        setTool(entry[0]);
      }
    }
  }
  window.addEventListener("keydown", key);
  window.addEventListener("resize", schedule);
  const panelObserver = new ResizeObserver(() => schedule());
  [dock, dialog, noteDialog, toast].forEach((panel) =>
    panelObserver.observe(panel),
  );
  setTool("select");
  async function load(action?: CaptureAction) {
    const token = ++generation;
    loading = true;
    let pendingId: string | undefined;
    try {
      const next = demo ? demoCapture() : await api.getCapture();
      pendingId = next.id;
      action = next.action ?? action ?? "region";
      const img = new Image();
      img.src = next.dataUrl;
      await img.decode();
      if (token !== generation) return;
      if (native) {
        await waitForCaptureViewport(next, root);
        if (token !== generation) return;
        const viewport = captureViewportSize(next);
        canvas.style.inlineSize = viewport.width + "px";
        canvas.style.blockSize = viewport.height + "px";
      }
      capture = next;
      guidePointer = undefined;
      image = img;
      toast.hidden = true;
      guide.querySelector("span")!.textContent =
        "Yakalamak istediğiniz alanı seçin";
      canvas.width = composed.width = frameCanvas.width = next.width;
      canvas.height = composed.height = frameCanvas.height = next.height;
      strokes = [];
      redo = [];
      selection = null;
      active = null;
      tool = "select";
      setTool("select");
      try {
        settings = await api.getSettings();
      } catch {
        settings = defaultSettings;
      }
      if (token !== generation) return;
      if (settings.rememberRegion) {
        try {
          const r = JSON.parse(
            localStorage.getItem("byshoot.lastRegion") || "null",
          ) as Rect | null;
          if (r) {
            const bounded = cropBounds(r, next.width, next.height);
            if (bounded.width > 2 && bounded.height > 2) selection = bounded;
          }
        } catch {
          /* invalid old region ignored */
        }
      }
      if (action !== "region")
        selection = { x: 0, y: 0, width: next.width, height: next.height };
      if (frame) cancelAnimationFrame(frame);
      render();
      if (native && next.id) {
        await api.present(next.id);
        if (token !== generation) return;
      }
      loading = false;
      setLocked();
      if (action === "fullscreenSave") await execute("save");
      else if (action === "fullscreenUpload") await requestUpload();
    } catch (error) {
      if (token !== generation) return;
      if (
        String(error).includes("No capture") ||
        String(error).includes("no capture") ||
        String(error).includes("Henüz ekran yakalanmadı")
      ) {
        guide.querySelector("span")!.textContent =
          "Yakalama kısayolu bekleniyor";
      } else {
        const message = "Ekran yakalanamadı: " + String(error);
        show(message);
        if (native && pendingId)
          await api.abort(pendingId, message).catch(() => {});
      }
    } finally {
      if (token === generation) {
        loading = false;
        schedule();
      }
    }
  }
  if (native)
    await listen<{ action: CaptureAction }>("capture-ready", (e) => {
      void load(e.payload.action);
    });
  // Persist the rectangle in screenshot pixel coordinates only after a real selection.
  canvas.addEventListener("pointerup", () => {
    if (settings.rememberRegion && selection)
      localStorage.setItem("byshoot.lastRegion", JSON.stringify(selection));
  });
  await load();
  void loading;
}

function demoCapture(): Capture {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1000;
  const x = c.getContext("2d")!;
  x.fillStyle = "#dce5ef";
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#f9fbfd";
  x.fillRect(120, 100, 1360, 790);
  x.fillStyle = "#172638";
  x.fillRect(120, 100, 1360, 54);
  x.font = "16px sans-serif";
  x.fillStyle = "#cad7e7";
  x.fillText(
    "byshoot   /   Örnek çalışma alanı — bu gerçek ekran görüntünüz değildir",
    160,
    133,
  );
  x.fillStyle = "#edf2f8";
  x.fillRect(120, 154, 240, 736);
  x.fillStyle = "#64778d";
  [
    "Çalışma alanı",
    "Genel bakış",
    "Dosyalar",
    "Paylaşımlar",
    "Ayarlar",
  ].forEach((s, i) => x.fillText(s, 150, 212 + i * 52));
  x.fillStyle = "#172638";
  x.font = "bold 40px sans-serif";
  x.fillText("Fikri göster. Birlikte netleştir.", 420, 240);
  x.font = "20px sans-serif";
  x.fillStyle = "#687d94";
  x.fillText("Alan seçin; oklar, şekiller ve notlarla anlatın.", 420, 284);
  x.fillStyle = "#e1e9f2";
  x.fillRect(420, 340, 990, 400);
  x.fillStyle = "#fff";
  x.fillRect(455, 375, 920, 330);
  x.strokeStyle = "#dde7f0";
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.moveTo(485, 425 + i * 50);
    x.lineTo(1340, 425 + i * 50);
    x.stroke();
  }
  x.strokeStyle = "#4779df";
  x.lineWidth = 5;
  x.beginPath();
  [
    [485, 635],
    [650, 560],
    [820, 590],
    [985, 455],
    [1150, 485],
    [1340, 395],
  ].forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
  x.stroke();
  x.fillStyle = "#64778d";
  x.font = "18px sans-serif";
  x.fillText(
    "DEMO · Hassas bilgiler için pikselleştirme aracını deneyin.",
    420,
    810,
  );
  return {
    dataUrl: c.toDataURL(),
    width: c.width,
    height: c.height,
    scaleFactor: 1,
  };
}
