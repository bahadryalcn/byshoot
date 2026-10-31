import { it, expect } from "vitest";
import { recordedShortcut } from "./shortcuts";
const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: true };
it("keeps Windows and Control shortcuts distinct", () => {
  expect(recordedShortcut("A", { ...base, metaKey: true }, false)).toBe(
    "Super+Shift+A",
  );
  expect(recordedShortcut("A", { ...base, ctrlKey: true }, false)).toBe(
    "CommandOrControl+Shift+A",
  );
});
it("keeps macOS Control, Command and combined chords distinct", () => {
  expect(recordedShortcut("A", { ...base, ctrlKey: true }, true)).toBe(
    "Control+Shift+A",
  );
  expect(recordedShortcut("A", { ...base, metaKey: true }, true)).toBe(
    "CommandOrControl+Shift+A",
  );
  expect(
    recordedShortcut("A", { ...base, ctrlKey: true, metaKey: true }, true),
  ).toBe("Control+CommandOrControl+Shift+A");
});
