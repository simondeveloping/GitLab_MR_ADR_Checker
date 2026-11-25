"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isActiveReview, type ProgressSnapshot } from "@/lib/reviews/summary";

export default function ReviewProgress({
  reviewId,
  initial,
}: {
  reviewId: string;
  initial: ProgressSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const router = useRouter();
  const active = isActiveReview(snapshot.status);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;
    let stream: EventSource | undefined;
    let polling = false;
    let pollController: AbortController | undefined;
    let connectionTimer: number | undefined;
    const url = `/api/reviews/${encodeURIComponent(reviewId)}/progress`;
    const stopPolling = () => {
      polling = false;
      pollController?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
    const receive = (next: ProgressSnapshot) => {
      if (cancelled) return;
      setSnapshot(next);
      if (!isActiveReview(next.status)) {
        cancelled = true;
        stream?.close();
        stopPolling();
        router.refresh();
      }
    };
    const refresh = async () => {
      const controller = new AbortController();
      pollController = controller;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
        if (response.ok) {
          const next = (await response.json()) as ProgressSnapshot;
          if (polling && !controller.signal.aborted) receive(next);
        }
      } catch {
        // Die nächste Abfrage versucht es erneut; der Review läuft unabhängig weiter.
      } finally {
        if (!cancelled && polling && !controller.signal.aborted) timer = window.setTimeout(refresh, 1000);
      }
    };
    const startPolling = () => {
      if (polling || cancelled) return;
      polling = true;
      void refresh();
    };
    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      stream = new EventSource(url);
      // Auch bei einem Proxy, der Streaming puffert, bleibt der Fortschritt aktuell.
      connectionTimer = window.setTimeout(startPolling, 5000);
      stream.onmessage = (event) => {
        try {
          const next = JSON.parse(event.data) as ProgressSnapshot;
          window.clearTimeout(connectionTimer);
          stopPolling();
          receive(next);
        } catch {
          startPolling();
        }
      };
      // EventSource versucht selbst die Wiederverbindung; bis dahin JSON-Fallback.
      stream.onerror = startPolling;
    }
    return () => {
      cancelled = true;
      stream?.close();
      window.clearTimeout(connectionTimer);
      stopPolling();
    };
  }, [active, reviewId, router]);

  if (snapshot.status === "failed") {
    return (
      <div className="card progress-card progress-failed" role="status">
        <strong>Review konnte nicht abgeschlossen werden</strong>
      </div>
    );
  }
  if (snapshot.status === "completed") {
    return (
      <div className="card progress-card progress-complete" role="status">
        <div className="progress-heading">
          <strong>Review abgeschlossen</strong>
          <span>100 %</span>
        </div>
        <div className="progress-track" role="progressbar" aria-label="Review-Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
          <div className="progress-fill" style={{ width: "100%" }} />
        </div>
      </div>
    );
  }

  const percent = Math.max(0, Math.min(99, snapshot.progress?.percent ?? 2));
  return (
    <div className="card progress-card" role="status" aria-live="polite">
      <div className="progress-heading">
        <strong>{snapshot.progress?.message ?? "Review wird vorbereitet …"}</strong>
        <span title="Geschätzter Gesamtfortschritt anhand erledigter Teilschritte">ca. {percent} %</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Review-Fortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`Geschätzt ${percent} Prozent. ${snapshot.progress?.message ?? "Review wird vorbereitet"}`}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="meta">Gesamtfortschritt geschätzt · Einzelne KI-Prüfungen können unterschiedlich lange dauern.</p>
    </div>
  );
}
