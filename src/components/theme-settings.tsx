"use client";

import { useTheme } from "@/components/theme-provider";
import { Switch } from "@/components/ui/switch";

export function ThemeSettings() {
  const { theme, setTheme, error } = useTheme();
  const darkModeEnabled = theme === "dark";

  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <label className="settings-row-title" htmlFor="dark-mode">Dunkelmodus</label>
        <span className="settings-row-description" id="dark-mode-description">Dunkles Farbschema verwenden</span>
        {error ? <p className="interaction-error" role="alert">{error}</p> : null}
      </div>
      <Switch
        id="dark-mode"
        aria-describedby="dark-mode-description"
        checked={darkModeEnabled}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        title={darkModeEnabled ? "Zum Hellmodus wechseln" : "Zum Dunkelmodus wechseln"}
      />
      <span className="sr-only" role="status">
        {darkModeEnabled ? "Dunkelmodus ist eingeschaltet" : "Dunkelmodus ist ausgeschaltet"}
      </span>
    </div>
  );
}
