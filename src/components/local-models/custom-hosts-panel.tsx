'use client';

/**
 * Custom-hosts input for /local-models discovery.
 *
 * Lets the visitor probe LAN/remote endpoints (e.g. an Ollama box on
 * 192.168.1.42, a vLLM rig on a separate workstation, an HTTPS LM
 * Studio behind a reverse proxy) on top of the default 127.0.0.1
 * scan. Hosts persist to localStorage so the chip list survives a
 * refresh.
 *
 * Browser caveat — surfaced inline so the user isn't surprised:
 *   - From an HTTPS page, `http://<lan-ip>` is mixed-content. Some
 *     browsers (Chrome with PNA permitted, Firefox in some configs)
 *     allow it; many block. Loopback is the special case.
 *   - `https://` upstreams always work if the cert is trusted.
 *   - Loading the page over `http://` removes the mixed-content gate
 *     entirely (deploy-time choice, not a UI fix).
 */

import { useCallback, useEffect, useState } from 'react';
import { parseHostSpec } from './discovery-direct';

const STORAGE_KEY = 'openbench-local:hosts';

interface Props {
  readonly hosts: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly disabled?: boolean;
}

export function CustomHostsPanel({ hosts, onChange, disabled }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(() => {
    const parsed = parseHostSpec(draft);
    if (parsed === null) {
      setError('Format: host, host:port, or http(s)://host[:port]');
      return;
    }
    if (hosts.includes(parsed.raw)) {
      setError('Already in the list');
      return;
    }
    setError(null);
    setDraft('');
    onChange([...hosts, parsed.raw]);
  }, [draft, hosts, onChange]);

  const remove = useCallback(
    (raw: string) => {
      onChange(hosts.filter((h) => h !== raw));
    },
    [hosts, onChange],
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      add();
    },
    [add],
  );

  return (
    <details className="group rounded-lg border border-border bg-bg">
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          Custom hosts
          {hosts.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-fg">
              {hosts.length}
            </span>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-fg-muted">
            Probe LAN / remote endpoints in addition to{' '}
            <span className="font-mono text-fg">127.0.0.1</span>.
          </p>
          <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-90">
            ▸
          </span>
        </div>
      </summary>

      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-center gap-2 border-t border-border px-4 pt-3"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error !== null) setError(null);
          }}
          disabled={disabled}
          placeholder="192.168.1.42  ·  10.0.0.5:11434  ·  https://gpu.lan:8443"
          className="min-w-0 flex-1 rounded border border-border bg-bg-elevated px-3 py-1.5 font-mono text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none disabled:opacity-50"
          aria-label="Add a custom host to probe"
          aria-invalid={error !== null}
        />
        <button
          type="submit"
          disabled={disabled || draft.trim().length === 0}
          className="rounded bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="px-4 pb-3">
        {error !== null ? (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{error}</p>
        ) : null}

        {hosts.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {hosts.map((h) => (
              <li key={h}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg">
                  {h}
                  <button
                    type="button"
                    onClick={() => remove(h)}
                    disabled={disabled}
                    aria-label={`Remove ${h}`}
                    className="text-fg-faint hover:text-fg disabled:opacity-50"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <details className="mt-3 text-[11px] text-fg-muted">
          <summary className="cursor-pointer hover:text-fg">
            Why might a host not respond?
          </summary>
          <div className="mt-2 space-y-1.5 pl-4">
            <p>
              <span className="font-semibold text-fg">Mixed content.</span> This page is served
              over HTTPS. Browsers silently block <code>http://</code> requests to non-loopback
              hosts. <code>https://</code> upstreams work if the cert is trusted; loopback is the
              special case (that's why <code>127.0.0.1</code> always works).
            </p>
            <p>
              <span className="font-semibold text-fg">Private Network Access.</span> Recent
              Chrome / Edge require a PNA preflight when an HTTPS page calls into a private IP.
              If your LLM doesn't reply with the right preflight headers, the browser drops the
              request.
            </p>
            <p>
              <span className="font-semibold text-fg">CORS.</span> Same as the localhost case —
              the LLM has to allow this page's origin. Recipes are below for the runtimes we
              know.
            </p>
          </div>
        </details>
      </div>
    </details>
  );
}

/** Read the persisted host list once on mount; write back on change. */
export function useStoredHosts(): {
  hosts: readonly string[];
  setHosts: (next: readonly string[]) => void;
} {
  const [hosts, setHostsState] = useState<readonly string[]>([]);
  // Only run once: rehydrate from localStorage in the browser.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
      if (valid.length > 0) setHostsState(valid);
    } catch {
      // Stored value was corrupt; ignore and start fresh.
    }
  }, []);
  const setHosts = useCallback((next: readonly string[]) => {
    setHostsState(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage quota / disabled — nothing actionable here.
    }
  }, []);
  return { hosts, setHosts };
}
