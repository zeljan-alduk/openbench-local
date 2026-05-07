import { useCallback, useEffect, useState } from 'react';

/**
 * Per-host API key store.
 *
 * LM Studio (recent versions), vLLM (`--api-key`), llama.cpp server
 * (`--api-key`) and any reverse proxy fronting a local LLM can require
 * an `Authorization: Bearer …` header. We store one key per
 * `<host>:<port>` pair in localStorage and inject it into every
 * discovery probe and every bench request that targets that endpoint.
 *
 * Keys are sensitive. We never serialise them into exported reports
 * (markdown / JSON / interactive HTML) and we never log them. The
 * storage notice surfaces that they live in localStorage in plaintext
 * so users can decide whether the keys they paste in are appropriate
 * for that.
 *
 * Storage key: `openbench-local:auth` → `Record<"<host>:<port>", string>`.
 *
 * Two surfaces exposed:
 *
 *   - `useAuthStore()` — React hook for the panel UI.
 *   - `readApiKey(host, port)` — plain function so non-React code
 *     (`discovery-direct.ts`, `bench-direct.ts`) can look up the key
 *     without dragging React into those modules.
 */

const STORAGE_KEY = 'openbench-local:auth';

export type AuthMap = Readonly<Record<string, string>>;

export function authKey(host: string, port: number): string {
  return `${host}:${port}`;
}

/** Plain (non-hook) read. Safe to call from anywhere; tolerates SSR. */
export function readApiKey(host: string, port: number): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as AuthMap;
    const key = parsed[authKey(host, port)];
    return typeof key === 'string' && key.length > 0 ? key : null;
  } catch {
    return null;
  }
}

function loadAll(): AuthMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    return JSON.parse(raw) as AuthMap;
  } catch {
    return {};
  }
}

function saveAll(map: AuthMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private mode / quota — keep the in-memory copy and hope */
  }
}

/** Mask a key for display: `sk-•••…•••3f7a`. Never log the raw value. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '•'.repeat(key.length);
  const tail = key.slice(-4);
  return `${key.slice(0, 3)}•••…•••${tail}`;
}

export function useAuthStore() {
  const [map, setMap] = useState<AuthMap>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMap(loadAll());
    setHydrated(true);
  }, []);

  const set = useCallback((host: string, port: number, value: string) => {
    setMap((prev) => {
      const next = { ...prev };
      const k = authKey(host, port);
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        delete next[k];
      } else {
        next[k] = trimmed;
      }
      saveAll(next);
      return next;
    });
  }, []);

  const remove = useCallback((host: string, port: number) => {
    setMap((prev) => {
      const next = { ...prev };
      delete next[authKey(host, port)];
      saveAll(next);
      return next;
    });
  }, []);

  const get = useCallback(
    (host: string, port: number): string | null => {
      const v = map[authKey(host, port)];
      return typeof v === 'string' && v.length > 0 ? v : null;
    },
    [map],
  );

  const has = useCallback(
    (host: string, port: number): boolean => get(host, port) !== null,
    [get],
  );

  return { hydrated, map, get, has, set, remove };
}
