import { describe, expect, test } from "bun:test";
import { isThemePreference, resolveTheme, THEME_PREFERENCES } from "./theme.ts";

describe("resolveTheme", () => {
  test("follows the OS preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  test("explicit preferences ignore the OS", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("isThemePreference", () => {
  test("accepts known preferences", () => {
    for (const preference of THEME_PREFERENCES) {
      expect(isThemePreference(preference)).toBe(true);
    }
  });
  test("rejects unknown or missing values", () => {
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });
});
