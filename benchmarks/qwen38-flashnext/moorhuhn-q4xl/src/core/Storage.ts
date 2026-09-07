/**
 * Storage adapter. Uses localStorage when available (browser) and falls back
 * to an in-memory map (tests / privacy modes where localStorage throws).
 */
const memory = new Map<string, string>();

function backend(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__mm_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    }
  } catch {
    /* fall through */
  }
  return {
    getItem: (k) => (memory.has(k) ? (memory.get(k) as string) : null),
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
}

export const storage = {
  get(key: string): string | null {
    return backend().getItem(key);
  },
  set(key: string, value: string): void {
    try {
      backend().setItem(key, value);
    } catch {
      /* quota / private mode: keep running in memory */
      memory.set(key, value);
    }
  },
  remove(key: string): void {
    backend().removeItem(key);
    memory.delete(key);
  },
};
