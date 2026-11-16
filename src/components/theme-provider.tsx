"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Theme } from "@/lib/theme";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  error: string | null;
} | null>(null);

export function ThemeProvider({ children, initialTheme }: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [error, setError] = useState<string | null>(null);
  const pendingSave = useRef(Promise.resolve());
  const revision = useRef(0);

  const changeTheme = useCallback((nextTheme: Theme) => {
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
    setError(null);
    const currentRevision = ++revision.current;

    // Schnelle Klicks wirken sofort. Cookie-Schreibvorgänge bleiben geordnet,
    // damit eine langsame Antwort keine neuere Auswahl überschreibt.
    pendingSave.current = pendingSave.current.then(async () => {
      try {
        const response = await fetch("/api/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: nextTheme }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error("Theme konnte nicht gespeichert werden.");
      } catch {
        if (revision.current === currentRevision) {
          setError("Farbschema ist aktiv, konnte aber nicht dauerhaft gespeichert werden. Bitte erneut auswählen.");
        }
      }
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme: changeTheme, error }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme muss innerhalb eines ThemeProvider verwendet werden.");
  return context;
}
