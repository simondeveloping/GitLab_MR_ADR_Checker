/**
 * Begrenzte Parallelität für unabhängige Modellaufgaben.
 *
 * Sowohl die Regelextraktion (eine Aufgabe je ADR) als auch die Prüfung (eine
 * Aufgabe je Regel) bestehen aus voneinander unabhängigen Einheiten, die den
 * grössten Teil ihrer Laufzeit auf das Modellgateway warten. Sie nacheinander
 * abzuarbeiten verlängert die Wandzeit ohne Gegenwert; sie alle zugleich zu
 * starten überflutet das Gateway und provoziert 429-Antworten. Die Obergrenze
 * kommt deshalb aus der Konfiguration (`EXTRACTION_CONCURRENCY`,
 * `JUDGING_CONCURRENCY`).
 */

/**
 * Wendet `worker` auf alle `items` an, wobei nie mehr als `concurrency`
 * Aufgaben gleichzeitig laufen. Die Reihenfolge der Ergebnisse entspricht der
 * Eingabe, unabhängig davon, welche Aufgabe zuerst fertig wird.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => run(),
  );
  await Promise.all(workers);
  return results;
}
