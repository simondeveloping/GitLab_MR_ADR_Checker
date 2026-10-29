"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ProgressSnapshot {
  status: "queued" | "running" | "completed" | "failed";
  progress?: {
    message: string;
    percent: number;
    updatedAt?: string;
    currentRule?: number;
    totalRules?: number;
  };
}

export default function ReviewProgress({
  reviewId,
  initial,
}: {
  reviewId: string;
  initial: ProgressSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const router = useRouter();
  const active = snapshot.status === "queued" || snapshot.status === "running";

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: number | undefined;
    let requestInFlight = false;
    const refresh = async () => {
      if (requestInFlight || cancelled) return;
      requestInFlight = true;
      try {
        const response = await fetch(
          `/api/reviews/${reviewId}/progress?t=${Date.now()}`,
          {
          cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
          },
        );
        if (response.ok) {
          const next = (await response.json()) as ProgressSnapshot;
          if (!cancelled) {
            setSnapshot(next);
            if (next.status !== "queued" && next.status !== "running") {
              router.refresh();
            }
          }
        }
      } catch {
        // Die nächste Abfrage versucht es erneut; der Review läuft unabhängig weiter.
      } finally {
        requestInFlight = false;
        if (!cancelled) timer = window.setTimeout(refresh, 2000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
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
        <div className="progress-track" aria-label="Fortschritt: 100 Prozent">
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
        <span>{percent} %</span>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Review-Fortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
