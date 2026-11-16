/** Serialisiert unabhängige Vorgänge pro Schlüssel und gibt fertige Einträge frei. */
export function createKeyedQueue() {
  const pending = new Map<string, Promise<unknown>>();

  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = pending.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.then(() => undefined, () => undefined);
    pending.set(key, settled);
    void settled.then(() => {
      if (pending.get(key) === settled) pending.delete(key);
    });
    return next;
  };
}
