"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const hasUserSelectedTheme = useRef(false);

  useEffect(() => {
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem("adr-review-theme");
    } catch {
      // The selected theme still works for this session when storage is unavailable.
    }
    const initialTheme = storedTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = initialTheme;
    window.requestAnimationFrame(() => {
      if (!hasUserSelectedTheme.current) setTheme(initialTheme);
    });
  }, []);

  const changeTheme = useCallback((nextTheme: Theme) => {
    hasUserSelectedTheme.current = true;
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("adr-review-theme", nextTheme);
    } catch {
      // Keep the in-memory theme change even if the browser blocks persistence.
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme: changeTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme muss innerhalb eines ThemeProvider verwendet werden.");
  return context;
}
