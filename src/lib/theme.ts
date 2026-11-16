export type Theme = "light" | "dark";

export const THEME_COOKIE = "adr-review-theme";
export const THEME_MAX_AGE = 60 * 60 * 24 * 365;

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(value: unknown): Theme {
  return isTheme(value) ? value : "light";
}
