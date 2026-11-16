export const integerFormat = new Intl.NumberFormat("de-DE");
export const compactFormat = new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 });

// Identische Ausgabe bei Server-Rendering und Hydration in anderen Zeitzonen.
const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export function formatDate(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  return `${Math.floor(totalSeconds / 60)} min ${Math.floor(totalSeconds % 60)}s`;
}
