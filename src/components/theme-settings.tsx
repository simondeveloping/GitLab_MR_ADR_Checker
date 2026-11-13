import { cookies } from "next/headers";

export async function ThemeSettings() {
  const storedTheme = (await cookies()).get("adr-review-theme")?.value;
  const darkModeEnabled = storedTheme === "dark";

  return (
    <form className="theme-switch-control" action="/api/theme" method="post">
      <input type="hidden" name="returnTo" value="/settings" />
      <span id="dark-mode-label">Dunkelmodus</span>
      <button
        className="ui-switch"
        type="submit"
        name="theme"
        value={darkModeEnabled ? "light" : "dark"}
        role="switch"
        aria-checked={darkModeEnabled}
        aria-labelledby="dark-mode-label"
        data-state={darkModeEnabled ? "checked" : "unchecked"}
        title={darkModeEnabled ? "Zum Hellmodus wechseln" : "Zum Dunkelmodus wechseln"}
      >
        <span className="ui-switch-thumb" data-state={darkModeEnabled ? "checked" : "unchecked"} />
      </button>
      <span className="sr-only" aria-live="polite">
        {darkModeEnabled ? "Dunkelmodus ist eingeschaltet" : "Dunkelmodus ist ausgeschaltet"}
      </span>
    </form>
  );
}
