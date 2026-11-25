"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { messages } from "../messages/pt-br";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "margem:theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initial: Theme =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) return null;

  const isDark = ctx.theme === "dark";
  const label = isDark ? messages.theme.switchToLight : messages.theme.switchToDark;

  return (
    <button
      type="button"
      onClick={ctx.toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="rounded-md p-1.5 text-ink-muted transition-colors duration-fast ease-margem-out hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bic"
    >
      {isDark ? (
        <Sun className="h-4 w-4" strokeWidth={1.5} />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.5} />
      )}
    </button>
  );
}
