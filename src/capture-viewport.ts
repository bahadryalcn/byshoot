import type { Capture } from "./contracts";
export function captureViewportSize(
  capture: Pick<Capture, "width" | "height" | "scaleFactor">,
) {
  const scale = capture.scaleFactor > 0 ? capture.scaleFactor : 1;
  return { width: capture.width / scale, height: capture.height / scale };
}
export function captureViewportMatches(
  capture: Pick<Capture, "width" | "height" | "scaleFactor">,
  viewport: { width: number; height: number },
) {
  const expected = captureViewportSize(capture);
  return (
    Math.abs(viewport.width - expected.width) <= 1 &&
    Math.abs(viewport.height - expected.height) <= 1
  );
}
export async function waitForCaptureViewport(
  capture: Capture,
  root: HTMLElement,
) {
  const matches = () =>
    captureViewportMatches(capture, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  if (matches()) return;
  await new Promise<void>((resolve, reject) => {
    const observer = new ResizeObserver(check);
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error("Ekran ölçeği hazırlanamadı. Yakalamayı yeniden başlatın."),
      );
    }, 1500);
    function cleanup() {
      clearTimeout(timeout);
      observer.disconnect();
      window.removeEventListener("resize", check);
    }
    function check() {
      if (matches()) {
        cleanup();
        resolve();
      }
    }
    observer.observe(root);
    window.addEventListener("resize", check);
    check();
  });
}
