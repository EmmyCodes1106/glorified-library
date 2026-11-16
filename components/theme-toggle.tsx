"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "glorified-theme";
const CHANGE_EVENT = "glorified-theme-change";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function readTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // storage can be unavailable in private browsing modes
  }
  return "system";
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readTheme() === "system") apply("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function choose(next: Theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // the visual switch still works when storage is unavailable
    }
    apply(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            aria-pressed={active}
            title={`${option.label} theme`}
            className={`btn btn-icon btn-sm !min-h-7 !w-7 rounded-md ${
              active
                ? "bg-surface text-brand shadow-card"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{option.label} theme</span>
          </button>
        );
      })}
    </div>
  );
}
