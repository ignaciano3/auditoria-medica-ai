"use client";

import { ui } from "@audit/lib/i18n";
import { useEffect, useState } from "react";
import {
  isThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme.ts";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons.tsx";

const ICONS = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
} as const;

const LABELS: Record<ThemePreference, string> = {
  light: ui.themeLight,
  dark: ui.themeDark,
  system: ui.themeSystem,
};

function applyTheme(preference: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(preference, prefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) setPreference(stored);
  }, []);

  useEffect(() => {
    if (!mounted || preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [mounted, preference]);

  function handleSelect(next: ThemePreference) {
    setPreference(next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <fieldset className="m-0 inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
      <legend className="sr-only">{ui.theme}</legend>
      {THEME_PREFERENCES.map((option) => {
        const Icon = ICONS[option];
        const active = mounted && preference === option;
        return (
          <button
            key={option}
            type="button"
            title={LABELS[option]}
            aria-label={LABELS[option]}
            aria-pressed={active}
            onClick={() => handleSelect(option)}
            className={`inline-flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              active
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </fieldset>
  );
}
