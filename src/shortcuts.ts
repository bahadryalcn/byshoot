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
