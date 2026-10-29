"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-options" role="group" aria-label="Farbschema">
      <button
        type="button"
        className={`theme-option${theme === "light" ? " is-selected" : ""}`}
        aria-pressed={theme === "light"}
        onClick={() => setTheme("light")}
      >
        <Sun size={17} /> Hell
      </button>
      <button
        type="button"
        className={`theme-option${theme === "dark" ? " is-selected" : ""}`}
        aria-pressed={theme === "dark"}
        onClick={() => setTheme("dark")}
      >
        <Moon size={17} /> Dunkel
      </button>
    </div>
  );
}
