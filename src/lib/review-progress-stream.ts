import { isActiveReview, type ProgressSnapshot } from "./reviews";
import { getReview, watchReview } from "./store";
import type { Review } from "./types";

/** Ein SSE-Kanal pro geöffnetem Review, gespeist aus Änderungen im Store. */
export function reviewProgressStream(initial: Review, signal: AbortSignal): ReadableStream<Uint8Array> {
  let cleanup = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      let previous = "";
      let reading = false;
      let dirty = false;

      cleanup = () => {
        closed = true;
        unsubscribe?.();
        clearInterval(heartbeat);
        signal.removeEventListener("abort", close);
      };
      const close = () => {
        if (closed) return;
        cleanup();
        controller.close();
      };
      const send = (review: Review) => {
        if (closed) return;
        const data = JSON.stringify({
          status: review.status, progress: review.sandboxProgress,
        } satisfies ProgressSnapshot);
        if (data !== previous) {
          // Langsame/unterbrochene Clients holen beim Wiederverbinden den aktuellen Stand.
          if ((controller.desiredSize ?? 0) <= 0) return close();
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          previous = data;
        }
        if (!isActiveReview(review.status)) close();
      };
      const refresh = async () => {
        dirty = true;
        if (reading || closed) return;
        reading = true;
        try {
          do {
            dirty = false;
            const review = await getReview(initial.id);
            if (closed) return;
            if (!review) return close();
            send(review);
          } while (dirty && !closed);
        } catch {
          // EventSource verbindet erneut; die JSON-Abfrage bleibt als Fallback verfügbar.
          close();
        } finally {
          reading = false;
        }
      };

      const heartbeat = setInterval(() => {
        if ((controller.desiredSize ?? 0) <= 0) return close();
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
        // Gleicht auch seltene verlorene Dateisystem-Ereignisse wieder ab.
        void refresh();
      }, 15_000);
      signal.addEventListener("abort", close, { once: true });
      if (signal.aborted) return close();
      send(initial);
      if (closed) return;
      try {
        unsubscribe = watchReview(initial.id, () => void refresh(), close);
      } catch {
        close();
        return;
      }
      // Schließt das Zeitfenster zwischen dem ersten Lesen und dem Watcher-Abonnement.
      void refresh();
    },
    cancel() {
      cleanup();
    },
  });
}
