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

import {
  shortcutKey,
  isValidShortcut,
  isFocusNavigationKey,
} from "./shortcuts";
const none = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
it("requires a modifier except for PrintScreen and F1-F24", () => {
  expect(isValidShortcut("A", none)).toBe(false);
  expect(isValidShortcut("A", { ...none, shiftKey: true })).toBe(false);
  expect(isValidShortcut("A", { ...none, ctrlKey: true })).toBe(true);
  expect(isValidShortcut("PrintScreen", none)).toBe(true);
  expect(isValidShortcut("F1", none)).toBe(true);
  expect(isValidShortcut("F24", none)).toBe(true);
  expect(isValidShortcut("F25", none)).toBe(false);
  expect(isValidShortcut("Space", none)).toBe(false);
});
it("maps Numpad keys to their own names, never to plain digits", () => {
  expect(shortcutKey({ key: "1", code: "Numpad1" })).toBe("Numpad1");
  expect(shortcutKey({ key: "1", code: "Digit1" })).toBe("1");
  expect(shortcutKey({ key: "0", code: "Numpad0" })).toBe("Numpad0");
  expect(shortcutKey({ key: "9", code: "Numpad9" })).toBe("Numpad9");
  expect(shortcutKey({ key: "+", code: "NumpadAdd" })).toBe("NumpadAdd");
  expect(shortcutKey({ key: "-", code: "NumpadSubtract" })).toBe(
    "NumpadSubtract",
  );
  expect(shortcutKey({ key: "*", code: "NumpadMultiply" })).toBe(
    "NumpadMultiply",
  );
  expect(shortcutKey({ key: "/", code: "NumpadDivide" })).toBe("NumpadDivide");
  expect(shortcutKey({ key: ".", code: "NumpadDecimal" })).toBe(
    "NumpadDecimal",
  );
  expect(shortcutKey({ key: "Enter", code: "NumpadEnter" })).toBe(
    "NumpadEnter",
  );
  expect(shortcutKey({ key: "=", code: "NumpadEqual" })).toBe("NumpadEqual");
  // Numpad keys the global-hotkey crate does not accept stay unsupported.
  expect(shortcutKey({ key: ",", code: "NumpadComma" })).toBeNull();
  expect(shortcutKey({ key: "(", code: "NumpadParenLeft" })).toBeNull();
  expect(shortcutKey({ key: "Insert", code: "Numpad0" })).toBe("Numpad0");
  expect(shortcutKey({ key: "End", code: "Numpad1" })).toBe("Numpad1");
  expect(shortcutKey({ key: "a", code: "KeyA" })).toBe("A");
  expect(shortcutKey({ key: " ", code: "Space" })).toBe("Space");
  expect(shortcutKey({ key: "PrintScreen", code: "PrintScreen" })).toBe(
    "PrintScreen",
  );
  expect(shortcutKey({ key: "€", code: "Digit4" })).toBe("4");
  expect(shortcutKey({ key: "Escape", code: "Escape" })).toBeNull();
});
it("requires a modifier for Numpad keys", () => {
  expect(isValidShortcut("Numpad1", none)).toBe(false);
  expect(isValidShortcut("NumpadAdd", { ...none, shiftKey: true })).toBe(false);
  expect(isValidShortcut("Numpad1", { ...none, ctrlKey: true })).toBe(true);
  expect(isValidShortcut("NumpadEnter", { ...none, altKey: true })).toBe(true);
  expect(isValidShortcut("NumpadDecimal", { ...none, metaKey: true })).toBe(
    true,
  );
});
it("leaves plain Tab to focus navigation", () => {
  const tab = { key: "Tab", code: "Tab", ...none };
  expect(isFocusNavigationKey(tab)).toBe(true);
  expect(isFocusNavigationKey({ ...tab, shiftKey: true })).toBe(true);
  expect(isFocusNavigationKey({ ...tab, ctrlKey: true })).toBe(false);
});
