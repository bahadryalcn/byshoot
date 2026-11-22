export function recordedShortcut(
  key: string,
  modifiers: {
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  mac: boolean,
): string {
  return [
    ...(modifiers.ctrlKey ? [mac ? "Control" : "CommandOrControl"] : []),
    ...(modifiers.metaKey ? [mac ? "CommandOrControl" : "Super"] : []),
    ...(modifiers.altKey ? ["Alt"] : []),
    ...(modifiers.shiftKey ? ["Shift"] : []),
    key,
  ].join("+");
}

export interface KeyEventLike {
  key: string;
  code: string;
}
export interface ModifierState {
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * KeyboardEvent.code values that map 1:1 to global-hotkey key names
 * (global-hotkey 0.8 hotkey.rs accepts NUMPAD0-9, NUMPADADD, NUMPADSUBTRACT,
 * NUMPADMULTIPLY, NUMPADDIVIDE, NUMPADDECIMAL, NUMPADENTER, NUMPADEQUAL).
 */
const NUMPAD_CODES = new Set([
  "Numpad0",
  "Numpad1",
  "Numpad2",
  "Numpad3",
  "Numpad4",
  "Numpad5",
  "Numpad6",
  "Numpad7",
  "Numpad8",
  "Numpad9",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadMultiply",
  "NumpadDivide",
  "NumpadDecimal",
  "NumpadEnter",
  "NumpadEqual",
]);

/** Maps a keyboard event to a global-shortcut key name, or null if unsupported. */
export function shortcutKey(e: KeyEventLike): string | null {
  if (e.key === "PrintScreen") return "PrintScreen";
  // Numpad keys must never collapse into plain digits; keep their own names.
  if (e.code.startsWith("Numpad")) return NUMPAD_CODES.has(e.code) ? e.code : null;
  const key = e.code.startsWith("Key")
    ? e.code.slice(3)
    : e.code.startsWith("Digit")
      ? e.code.slice(5)
      : e.key === " "
        ? "Space"
        : e.key;
  return /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|PrintScreen|Space|Insert|Delete|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Tab|Enter|Backspace)$/.test(
    key,
  )
    ? key
    : null;
}

/** Only PrintScreen and F1-F24 may be used without a Ctrl/Alt/Meta modifier. */
export function shortcutNeedsModifier(key: string): boolean {
  return !(key === "PrintScreen" || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key));
}
export function hasShortcutModifier(m: ModifierState): boolean {
  return m.ctrlKey || m.metaKey || m.altKey;
}
export function isValidShortcut(key: string, m: ModifierState): boolean {
  return !shortcutNeedsModifier(key) || hasShortcutModifier(m);
}
/** Plain Tab (or Shift+Tab) keeps its focus-navigation role while recording. */
export function isFocusNavigationKey(e: KeyEventLike & ModifierState): boolean {
  return e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey;
}
