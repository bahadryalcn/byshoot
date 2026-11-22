import { it, expect } from "vitest";
import { defaultSettings, mergeSettings } from "./contracts";

it("returns defaults for missing or invalid input", () => {
  expect(mergeSettings(null)).toEqual(defaultSettings);
  expect(mergeSettings("x")).toEqual(defaultSettings);
  expect(mergeSettings({})).toEqual(defaultSettings);
});
it("migrates lightshot to custom", () => {
  expect(mergeSettings({ uploadProvider: "lightshot" }).uploadProvider).toBe(
    "custom",
  );
});
it("deep-merges shortcuts and keeps stored values", () => {
  const merged = mergeSettings({
    jpegQuality: 70,
    shortcuts: { region: ["F5"] },
  });
  expect(merged.jpegQuality).toBe(70);
  expect(merged.shortcuts.region).toEqual(["F5"]);
  expect(merged.shortcuts.fullscreenSave).toEqual(
    defaultSettings.shortcuts.fullscreenSave,
  );
});
it("ignores wrongly typed fields and does not share default references", () => {
  const merged = mergeSettings({
    jpegQuality: "high",
    language: "de",
    shortcuts: { region: "F5", fullscreenSave: [1, "F6"] },
  });
  expect(merged.jpegQuality).toBe(defaultSettings.jpegQuality);
  expect(merged.language).toBe("tr");
  expect(merged.shortcuts.region).toEqual(defaultSettings.shortcuts.region);
  expect(merged.shortcuts.fullscreenSave).toEqual(["F6"]);
  merged.shortcuts.region.push("X");
  expect(defaultSettings.shortcuts.region).not.toContain("X");
});
