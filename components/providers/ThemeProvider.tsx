"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/* ─────────────────────────────────────────────────────────────
   Context
   ───────────────────────────────────────────────────────────── */
type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

/* ─────────────────────────────────────────────────────────────
   Provider
   ───────────────────────────────────────────────────────────── */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  /* Read saved preference on mount (client only) */
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      const initial: Theme = saved ?? (prefersDark ? "dark" : "light");
      setThemeState(initial);
    } catch {
      /* localStorage may be unavailable in some environments */
    }
  }, []);

  /* Apply / remove .dark class on <html> */
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("theme", theme);
    } catch { /* ignore */ }
  }, [theme, mounted]);

  /* Toggle with smooth CSS transition */
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    root.classList.add("theme-transitioning");
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
    const id = setTimeout(
      () => root.classList.remove("theme-transitioning"),
      320
    );
    return () => clearTimeout(id);
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      const root = document.documentElement;
      root.classList.add("theme-transitioning");
      setThemeState(t);
      const id = setTimeout(
        () => root.classList.remove("theme-transitioning"),
        320
      );
      return () => clearTimeout(id);
    },
    []
  );

  return (
    <ThemeContext.Provider
      value={{ theme, isDark: theme === "dark", toggleTheme, setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
