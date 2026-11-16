import { log } from "./trace.js";

/** Meldet abgearbeitete Einheiten, auch wenn deren Ergebnis ein Fehler ist. */
export function trackProgress(phase: string, total: number): () => void {
  let completed = 0;
  const emit = () => log.info("phase_progress", { phase, completed, total });
  emit();
  return () => {
    completed += 1;
    emit();
  };
}
