type Entry<T> = { value: T; expiresAt: number };

export function memoize<T>(
  fn: (key: string) => Promise<T>,
  ttlMs: number,
  clock: () => number = () => Date.now(),
): (key: string) => Promise<T> {
  const store = new Map<string, Entry<T>>();
  return async (key: string) => {
    const nowMs = clock();
    const hit = store.get(key);
    if (hit && hit.expiresAt > nowMs) return hit.value;
    const value = await fn(key);
    store.set(key, { value, expiresAt: nowMs + ttlMs });
    return value;
  };
}
