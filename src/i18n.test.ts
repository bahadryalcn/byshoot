import { afterEach, describe, expect, it } from "vitest";
import {
  dateLocale,
  dictionaries,
  getLanguage,
  setLanguage,
  t,
} from "./i18n";

afterEach(() => setLanguage("tr"));

describe("i18n", () => {
  it("tr and en have exactly the same keys and no empty values", () => {
    expect(Object.keys(dictionaries.en).sort()).toEqual(
      Object.keys(dictionaries.tr).sort(),
    );
    for (const lang of ["tr", "en"] as const)
      for (const [key, value] of Object.entries(dictionaries[lang]))
        expect(value, `${lang}:${key}`).not.toBe("");
  });
  it("placeholders match between languages", () => {
    const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(dictionaries.tr) as Array<
      keyof typeof dictionaries.tr
    >)
      expect(names(dictionaries.en[key]), key).toEqual(
        names(dictionaries.tr[key]),
      );
  });
  it("switches language and interpolates", () => {
    expect(getLanguage()).toBe("tr");
    expect(t("rec.savedTo", { path: "a.mp4" })).toBe("Kaydedildi: a.mp4");
    setLanguage("en");
    expect(getLanguage()).toBe("en");
    expect(t("rec.savedTo", { path: "a.mp4" })).toBe("Saved: a.mp4");
    expect(dateLocale()).toBe("en-US");
  });
  it("leaves unknown placeholders intact", () => {
    expect(t("rec.savedTo")).toBe("Kaydedildi: {path}");
    expect(t("rec.savedTo", { other: "x" })).toBe("Kaydedildi: {path}");
  });
});
