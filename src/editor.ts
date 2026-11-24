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
  selectionHandles,
  hitHandle,
  resizeByHandle,
  handleCursor,
  isDegenerateStroke,
  type HandleId,
  type Rect,
  type Point,
  type Stroke,
  type Tool,
} from "./drawing";
import "./editor.css";
import { setLanguage, t } from "./i18n";
import {
  ANNOTATION_TEXT,
  StrokeHistory,
  hitTopmost,
  strokeBounds,
  translateStroke,
  type TextMeasure,
} from "./annotations";
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
  // Editor runs in its own webview: load the saved language before building UI.
  try {
    setLanguage((await api.getSettings()).language);
  } catch {
    /* keep default language */
  }
  container.innerHTML = `<section class="capture-editor" aria-label="${t("editor.label")}"><canvas class="capture-canvas" aria-label="${t("editor.canvasLabel")}"></canvas><div class="capture-guide"><strong>${demo ? "DEMO · BYSHOOT" : "BYSHOOT"}</strong><span>${t("editor.guideSelect")}</span><kbd>Esc</kbd><span>${t("editor.cancel")}</span></div><div class="capture-dimensions"></div><div class="capture-tools" role="toolbar" aria-label="${t("editor.toolsLabel")}"></div><div class="capture-actions" role="toolbar" aria-label="${t("editor.actionsLabel")}"></div><div class="capture-toast" role="status" aria-live="polite"></div><dialog class="capture-dialog"><form method="dialog"><h2>${t("editor.shareTitle")}</h2><p>${t("editor.shareDefaultBody")}</p><div><button value="cancel">${t("editor.cancel")}</button><button value="upload" class="upload-confirm">${t("editor.shareConfirm")}</button></div></form></dialog></section>`;
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
    hist = new StrokeHistory(),
    selected: Stroke | null = null,
    preview: Stroke | null = null,
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
    kind: "select" | "move" | "resize" | "draw" | "annotation";
    stroke?: Stroke;
    start: Point;
    rect?: Rect;
    handle?: HandleId;
  } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  // Round both corners so badge size equals export cropBounds size exactly.
  const snap = (r: Rect): Rect => {
    const x = Math.round(r.x),
      y = Math.round(r.y);
    return {
      x,
      y,
      width: Math.round(r.x + r.width) - x,
      height: Math.round(r.y + r.height) - y,
    };
  };
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
    `<form method="dialog"><h2>${t("annotation.addTitle")}</h2><textarea aria-label="${t("editor.noteLabel")}" placeholder="${t("editor.notePlaceholder")}" rows="4" maxlength="2000"></textarea><div><button value="cancel">${t("editor.cancel")}</button><button value="add" class="upload-confirm">${t("annotation.addConfirm")}</button></div></form>`;
  root.append(noteDialog);
  noteDialog
    .querySelector<HTMLTextAreaElement>("textarea")!
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        noteDialog.close("add");
      }
    });
  async function addText(p: Point, existing?: Stroke) {
    const token = generation;
    const area = noteDialog.querySelector<HTMLTextAreaElement>("textarea")!;
    noteDialog.returnValue = "cancel";
    area.value = existing?.text ?? "";
    noteDialog.querySelector("h2")!.textContent = existing
      ? ANNOTATION_TEXT.editNoteTitle
      : ANNOTATION_TEXT.addNoteTitle;
    noteDialog.querySelector(".upload-confirm")!.textContent = existing
      ? ANNOTATION_TEXT.editNoteConfirm
      : ANNOTATION_TEXT.addNoteConfirm;
    dialogPointer = p;
    noteDialog.showModal();
    layoutOverlays();
    area.focus();
    const result = await new Promise<string>((resolve) =>
      noteDialog.addEventListener(
        "close",
        () => resolve(noteDialog.returnValue),
        { once: true },
      ),
    );
    const value = area.value;
    if (token === generation && result === "add" && value.trim()) {
      if (existing) {
        const i = hist.strokes.indexOf(existing);
        if (i >= 0 && value !== existing.text) {
          const next = { ...existing, text: value };
          hist.replace(i, next);
          selected = next;
        }
      } else
        hist.add({
          tool: "text",
          points: [p],
          color,
          width,
          text: value,
          scale: capture?.scaleFactor || 1,
        });
      schedule();
    }
  }
  const toolLabels = (): Array<[Tool, string, string, string]> => [
    ["select", "↖", t("editor.tool.select"), "V"],
    ["pen", "✎", t("editor.tool.pen"), "P"],
    ["highlight", "▰", t("editor.tool.highlight"), "H"],
    ["arrow", "↗", t("editor.tool.arrow"), "A"],
    ["rectangle", "□", t("editor.tool.rectangle"), "R"],
    ["ellipse", "○", t("editor.tool.ellipse"), "O"],
    ["text", "T", t("editor.tool.text"), "T"],
    ["marker", "①", t("editor.tool.marker"), "N"],
    ["pixelate", "▦", t("editor.tool.pixelate"), "B"],
  ];
  const labels = toolLabels();
  const toolByCode = (code: string) =>
    labels.find((t) => code === "Key" + t[3]);
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
    if (next !== "select") selected = null;
    tools.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
    });
    canvas.style.cursor = "crosshair";
  };
  const hitThreshold = () => (12 * canvas.width) / displayRect().width;
  function updateCursor(p: Point) {
    if (!selection || tool !== "select") {
      canvas.style.cursor = "crosshair";
      return;
    }
    const h = hitHandle(selection, p, hitThreshold());
    if (!h && inside(p, selection) && strokeAt(p) >= 0) {
      canvas.style.cursor = "move";
      return;
    }
    canvas.style.cursor = handleCursor(
      h ?? (inside(p, selection) ? "move" : null),
    );
  }
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
  colorInput.title = t("editor.color");
  colorInput.setAttribute("aria-label", t("editor.color"));
  colorInput.oninput = () => (color = colorInput.value);
  colorInput.onchange = () => colorInput.blur();
  tools.append(colorInput);
  const widthInput = document.createElement("input");
  widthInput.type = "range";
  widthInput.min = "1";
  widthInput.max = "12";
  widthInput.value = String(width);
  widthInput.title = t("editor.width");
  widthInput.setAttribute("aria-label", t("editor.width"));
  widthInput.oninput = () => (width = Number(widthInput.value));
  widthInput.onchange = () => widthInput.blur();
  tools.append(widthInput);
  const undoButton = button("↶", t("editor.undo"), () => undo()),
    redoButton = button("↷", t("editor.redo"), () => redoStroke());
  tools.append(undoButton, redoButton);
  setIcon(undoButton, Undo2);
  setIcon(redoButton, Redo2);
  const copyButton = button(
      t("editor.copy"),
      t("editor.copyTitle"),
      () => void execute("copy"),
    ),
    saveButton = button(
      t("editor.save"),
      t("editor.saveTitle"),
      () => void execute("save"),
    ),
    uploadButton = button(
      t("editor.share"),
      t("editor.shareButtonTitle"),
      () => void requestUpload(),
    );
  const newAreaButton = button(
      t("editor.newArea"),
      t("editor.newAreaTitle"),
      () => {
        selection = null;
        setTool("select");
        schedule();
      },
    ),
    closeButton = button("×", t("editor.closeTitle"), () => void close());
  actions.append(
    newAreaButton,
    copyButton,
    saveButton,
    uploadButton,
    closeButton,
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
  function show(
    message: string,
    opts: { error?: boolean; link?: string } = {},
  ) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    if (opts.link) {
      const link = opts.link;
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t("editor.copy");
      b.onclick = () => {
        navigator.clipboard.writeText(link).then(
          () => (b.textContent = t("editor.copied")),
          () => (b.textContent = t("editor.copyFailed")),
        );
      };
      toast.append(b);
    } else if (!opts.error) {
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, 4000);
    }
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
  /** Strokes as shown: the dragged annotation is swapped for its preview. */
  function viewStrokes(): Stroke[] {
    if (!preview || !drag?.stroke) return hist.strokes;
    return hist.strokes.map((s) => (s === drag!.stroke ? preview! : s));
  }
  function rebuild() {
    if (!capture) return;
    const view = viewStrokes();
    if (
      cachedCapture === capture &&
      cachedStrokes.length === view.length &&
      cachedStrokes.every((s, i) => s === view[i])
    )
      return;
    composedCtx.clearRect(0, 0, composed.width, composed.height);
    composedCtx.drawImage(image, 0, 0, composed.width, composed.height);
    view.forEach((s) => paintStroke(composedCtx, s));
    cachedCapture = capture;
    cachedStrokes = [...view];
  }
  function setLocked() {
    tools
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")
      .forEach((el) => (el.disabled = busy || loading));
    actions
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((el) => (el.disabled = busy || loading));
    undoButton.disabled = busy || loading || !hist.canUndo;
    redoButton.disabled = busy || loading || !hist.canRedo;
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
      selectionHandles(r).forEach(({ x, y }) =>
        ctx.fillRect(x - 3 * scale, y - 3 * scale, 6 * scale, 6 * scale),
      );
      dimensions.textContent =
        Math.round(r.width) + " × " + Math.round(r.height) + " px";
    }
    const shown = selected && (preview ?? selected);
    const bounds = shown && strokeBounds(shown, measure);
    if (bounds) {
      const sc = canvas.width / displayRect().width;
      ctx.strokeStyle = "#4da3ff";
      ctx.lineWidth = 1.5 * sc;
      ctx.setLineDash([6 * sc, 4 * sc]);
      const pad = 3 * sc;
      ctx.strokeRect(
        bounds.x - pad,
        bounds.y - pad,
        bounds.width + pad * 2,
        bounds.height + pad * 2,
      );
      ctx.setLineDash([]);
    }
    ctx.restore();
    displayCtx.drawImage(frameCanvas, 0, 0);
    guide.hidden = !!selection;
    tools.hidden = actions.hidden = dimensions.hidden = !selection;
    if (!selection) layoutGuide();
    dock.hidden =
      !selection ||
      !!(drag && drag.kind !== "draw" && drag.kind !== "annotation");
    setLocked();
    if (selection) layoutPanels();
    layoutOverlays();
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }
  function undo() {
    if (hist.undo()) syncSelected();
    schedule();
  }
  function redoStroke() {
    if (hist.redo()) syncSelected();
    schedule();
  }
  function syncSelected() {
    if (selected && !hist.strokes.includes(selected)) selected = null;
  }
  const measureCtx = document.createElement("canvas").getContext("2d")!;
  const measure: TextMeasure = (text, font) => {
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  };
  function strokeAt(p: Point): number {
    return hitTopmost(hist.strokes, p, hitThreshold() / 2, measure);
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
      selected = null;
      if (tool === "text") {
        // The dialog opens during pointerdown. Prevent the original canvas
        // gesture's default focus step from stealing focus back from its input.
        e.preventDefault();
        canvas.releasePointerCapture(e.pointerId);
        void addText(p);
        return;
      }
      active = {
        tool: tool as Stroke["tool"],
        points: [p],
        color,
        width,
        number: hist.strokes.filter((s) => s.tool === "marker").length + 1,
        scale: capture.scaleFactor || 1,
      };
      drag = { kind: "draw", start: p };
    } else if (selection && tool === "select") {
      const r = selection,
        handle = hitHandle(r, p, hitThreshold()),
        hit = handle || !inside(p, r) ? -1 : strokeAt(p);
      if (handle) {
        selected = null;
        drag = { kind: "resize", start: p, rect: { ...r }, handle };
      } else if (hit >= 0) {
        selected = hist.strokes[hit];
        drag = { kind: "annotation", start: p, stroke: selected };
      } else if (inside(p, r)) {
        selected = null;
        drag = { kind: "move", start: p, rect: { ...r } };
      } else {
        selected = null;
        selection = null;
        drag = { kind: "select", start: p };
      }
    } else {
      selected = null;
      selection = null;
      drag = { kind: "select", start: p };
    }
    schedule();
  };
  canvas.onpointermove = (e) => {
    const p = point(e);
    guidePointer = p;
    if (!selection) layoutGuide();
    if (!drag) {
      updateCursor(p);
      return;
    }
    if (drag.kind === "select") selection = snap(rectBetween(drag.start, p));
    else if (drag.kind === "resize")
      selection = snap(resizeByHandle(drag.rect!, drag.handle!, p));
    else if (drag.kind === "move")
      selection = snap(
        moveRect(
          drag.rect!,
          { x: p.x - drag.start.x, y: p.y - drag.start.y },
          canvas.width,
          canvas.height,
        ),
      );
    else if (drag.kind === "annotation") {
      preview = translateStroke(drag.stroke!, {
        x: p.x - drag.start.x,
        y: p.y - drag.start.y,
      });
    } else if (active) {
      if (active.tool === "pen" || active.tool === "highlight")
        active.points.push(p);
      else active.points = [drag.start, p];
    }
    schedule();
  };
  const end = () => {
    if (active) {
      if (!isDegenerateStroke(active)) hist.add(active);
      active = null;
    }
    if (drag?.kind === "annotation" && preview) {
      // One history entry per drag, committed on release.
      const i = hist.strokes.indexOf(drag.stroke!);
      const moved = preview.points[0].x !== drag.stroke!.points[0].x ||
        preview.points[0].y !== drag.stroke!.points[0].y;
      if (i >= 0 && moved) {
        hist.replace(i, preview);
        selected = preview;
      }
    }
    preview = null;
    drag = null;
    if (selection && (selection.width < 3 || selection.height < 3))
      selection = null;
    schedule();
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = () => {
    active = null;
    preview = null;
    drag = null;
    schedule();
  };
  canvas.ondblclick = (e) => {
    if (busy || loading || !capture || tool !== "select" || !selection) return;
    const i = strokeAt(point(e as PointerEvent));
    const s = hist.strokes[i];
    if (s?.tool === "text") {
      selected = s;
      void addText(s.points[0], s);
    }
  };
  async function close(nativeClose = true) {
    const id = capture?.id;
    const token = ++generation;
    selection = null;
    hist.reset();
    selected = null;
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
        `<div class="capture-demo-ended">${t("editor.demoEnded")}</div>`;
  }
  async function exported(useFileFormat = false) {
    if (!selection || !capture) throw new Error(t("editor.selectAreaFirst"));
    rebuild();
    const r = cropBounds(selection, canvas.width, canvas.height);
    if (!r.width || !r.height) throw new Error(t("editor.invalidArea"));
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
          throw new Error(t("editor.uploadDemo"));
        show(t("editor.uploading"), { error: true });
        // bridge.ts will resolve to {url, copied, closed}; cast until it lands.
        const info = await api.upload(dataUrl);
        if (token !== generation) return;
        // Native side already closed the editor when closed is true.
        if (!info.closed)
          show(
            t(info.copied ? "editor.linkReadyCopied" : "editor.linkReady", {
              url: info.url,
            }),
            { link: info.url },
          );
      }
    } catch (error) {
      if (token === generation)
        show(error instanceof Error ? error.message : String(error), {
          error: true,
        });
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
      show(t("editor.shareDemo"), { error: true });
      return;
    }
    if (!settings.uploadEndpoint) {
      show(t("editor.noEndpoint"), { error: true });
      return;
    }
    dialog.querySelector("p")!.textContent = t("editor.shareBody", {
      endpoint: settings.uploadEndpoint,
    });
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
      if (e.key === "Escape" && !dialog.open && !noteDialog.open) {
        e.preventDefault();
        void close();
      } else if (!dialog.open && !noteDialog.open) e.preventDefault();
      return;
    }
    const t = e.target;
    const textual =
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLInputElement &&
        !["color", "range", "checkbox", "radio", "button"].includes(t.type));
    if (textual || dialog.open || noteDialog.open) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      e.preventDefault();
      if (selected && !drag) {
        selected = null;
        schedule();
      } else void close();
    } else if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selected &&
      !drag
    ) {
      e.preventDefault();
      const i = hist.strokes.indexOf(selected);
      selected = null;
      hist.remove(i);
      schedule();
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
      const entry = toolByCode(e.code);
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
  let guideKey: "editor.guideSelect" | "editor.waiting" = "editor.guideSelect";
  function setGuide(key: typeof guideKey) {
    guideKey = key;
    guide.querySelector("span")!.textContent = t(key);
  }
  // Re-apply the current language to every static label without touching DOM
  // structure or editor state (the capture webview is reused across languages).
  function applyLabels() {
    const setTitle = (el: HTMLElement, text: string) => {
      el.title = text;
      el.setAttribute("aria-label", text);
    };
    root.setAttribute("aria-label", t("editor.label"));
    canvas.setAttribute("aria-label", t("editor.canvasLabel"));
    tools.setAttribute("aria-label", t("editor.toolsLabel"));
    actions.setAttribute("aria-label", t("editor.actionsLabel"));
    const guideSpans = guide.querySelectorAll("span");
    guideSpans[0].textContent = t(guideKey);
    if (guideSpans[1]) guideSpans[1].textContent = t("editor.cancel");
    toolLabels().forEach(([name, , title, key]) => {
      const b = tools.querySelector<HTMLElement>(`[data-tool="${name}"]`);
      if (b) setTitle(b, `${title} (${key})`);
    });
    setTitle(colorInput, t("editor.color"));
    setTitle(widthInput, t("editor.width"));
    setTitle(undoButton, t("editor.undo"));
    setTitle(redoButton, t("editor.redo"));
    const setAction = (b: HTMLButtonElement, text: string, title: string) => {
      setTitle(b, title);
      const span = b.querySelector("span");
      if (span) span.textContent = text;
    };
    setAction(newAreaButton, t("editor.newArea"), t("editor.newAreaTitle"));
    setAction(copyButton, t("editor.copy"), t("editor.copyTitle"));
    setAction(saveButton, t("editor.save"), t("editor.saveTitle"));
    setAction(uploadButton, t("editor.share"), t("editor.shareButtonTitle"));
    setTitle(closeButton, t("editor.closeTitle"));
    const buttons = (d: HTMLDialogElement) =>
      d.querySelectorAll<HTMLButtonElement>("button");
    if (!dialog.open) {
      dialog.querySelector("h2")!.textContent = t("editor.shareTitle");
      dialog.querySelector("p")!.textContent = t("editor.shareDefaultBody");
    }
    const share = buttons(dialog);
    share[0].textContent = t("editor.cancel");
    share[1].textContent = t("editor.shareConfirm");
    if (!noteDialog.open) {
      noteDialog.querySelector("h2")!.textContent = t("annotation.addTitle");
      buttons(noteDialog)[1].textContent = t("annotation.addConfirm");
    }
    const area = noteDialog.querySelector<HTMLTextAreaElement>("textarea")!;
    area.setAttribute("aria-label", t("editor.noteLabel"));
    area.placeholder = t("editor.notePlaceholder");
    buttons(noteDialog)[0].textContent = t("editor.cancel");
  }
  async function refreshLanguage() {
    try {
      setLanguage((await api.getSettings()).language);
    } catch {
      return;
    }
    applyLabels();
  }
  async function load(action?: CaptureAction) {
    const token = ++generation;
    loading = true;
    if (noteDialog.open) noteDialog.close("cancel");
    if (dialog.open) dialog.close("cancel");
    let pendingId: string | undefined;
    try {
      const next = demo ? demoCapture() : await api.getCapture();
      pendingId = next.id;
      action = next.action ?? action ?? "region";
      const img = new Image();
      img.src = next.dataUrl;
      // A hidden WebView can stall decoding; never wait forever, or the
      // pending capture would swallow every later shortcut press.
      await Promise.race([
        img.decode(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(t("editor.viewportTimeout"))), 3000),
        ),
      ]);
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
      setGuide("editor.guideSelect");
      canvas.width = composed.width = frameCanvas.width = next.width;
      canvas.height = composed.height = frameCanvas.height = next.height;
      hist.reset();
      selected = null;
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
      // Settings may have changed since mount; keep labels in the saved language.
      setLanguage(settings.language);
      applyLabels();
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
        setGuide("editor.waiting");
      } else {
        const message = t("editor.captureFailed", { error: String(error) });
        show(message, { error: true });
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
  if (native) {
    await listen<{ action: CaptureAction }>("capture-ready", (e) => {
      void load(e.payload.action);
    });
    await listen("settings-changed", () => void refreshLanguage());
  }
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
  x.fillText(t("editor.demoTitle"), 160, 133);
  x.fillStyle = "#edf2f8";
  x.fillRect(120, 154, 240, 736);
  x.fillStyle = "#64778d";
  [
    t("editor.demoNav1"),
    t("editor.demoNav2"),
    t("editor.demoNav3"),
    t("editor.demoNav4"),
    t("editor.demoNav5"),
  ].forEach((s, i) => x.fillText(s, 150, 212 + i * 52));
  x.fillStyle = "#172638";
  x.font = "bold 40px sans-serif";
  x.fillText(t("editor.demoHeadline"), 420, 240);
  x.font = "20px sans-serif";
  x.fillStyle = "#687d94";
  x.fillText(t("editor.demoSub"), 420, 284);
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
  x.fillText(t("editor.demoHint"), 420, 810);
  return {
    dataUrl: c.toDataURL(),
    width: c.width,
    height: c.height,
    scaleFactor: 1,
  };
}
