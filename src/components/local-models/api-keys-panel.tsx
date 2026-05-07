'use client';

import { useMemo, useState } from 'react';
import { type AuthMap, maskKey, useAuthStore } from './auth-store';

/**
 * API keys panel. Lets the user store an `Authorization: Bearer <key>`
 * header per `<host>:<port>` endpoint — required by LM Studio's API-key
 * mode, vLLM's `--api-key`, llama.cpp's `--api-key`, and any reverse
 * proxy fronting a local LLM.
 *
 * Keys live in localStorage in plaintext (mirrors how the rest of the
 * app's preferences are stored). They are NEVER serialised into
 * exported reports.
 *
 * Adding a key with the same host:port replaces the previous one.
 * Setting an empty key removes it (same effect as the Remove button).
 */

interface Props {
  readonly disabled?: boolean;
}

export function ApiKeysPanel({ disabled = false }: Props) {
  const { map, set, remove } = useAuthStore();
  const [hostInput, setHostInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo(() => Object.entries(map).sort(([a], [b]) => a.localeCompare(b)), [map]);

  const onAdd = () => {
    setError(null);
    const trimmedHost = hostInput.trim();
    const trimmedKey = keyInput.trim();
    if (trimmedHost === '') {
      setError('host:port is required.');
      return;
    }
    if (trimmedKey === '') {
      setError('API key is required.');
      return;
    }
    const parsed = parseHostPort(trimmedHost);
    if (parsed === null) {
      setError('Use `host:port` format, e.g. `localhost:1234` or `192.168.1.42:11434`.');
      return;
    }
    set(parsed.host, parsed.port, trimmedKey);
    setHostInput('');
    setKeyInput('');
  };

  return (
    <details className="group rounded-2xl border border-border bg-bg-elevated shadow-sm print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            API keys
          </p>
          <h2 className="mt-1 text-base font-semibold text-fg">
            {entries.length === 0
              ? 'Bearer tokens for engines that require them'
              : `${entries.length} key${entries.length === 1 ? '' : 's'} configured`}
          </h2>
          <p className="mt-1 hidden max-w-2xl text-xs leading-relaxed text-fg-muted group-open:block">
            LM Studio's API-key mode, vLLM <code className="font-mono">--api-key</code>,
            llama.cpp <code className="font-mono">--api-key</code>, or anything behind a reverse
            proxy. Keys are sent as <code className="font-mono">Authorization: Bearer …</code>{' '}
            on discovery + bench requests for that host:port. Stored in{' '}
            <code className="font-mono">localStorage</code> (plaintext); never exported.
          </p>
        </div>
        <span
          aria-hidden
          className="text-sm text-fg-muted transition-transform group-open:rotate-90"
        >
          ▸
        </span>
      </summary>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
        {entries.length === 0 ? (
          <p className="text-xs text-fg-faint">
            No keys configured. Add one below if your LLM server requires it.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map(([k, v]) => (
              <ApiKeyRow
                key={k}
                hostKey={k}
                masked={maskKey(v)}
                disabled={disabled}
                onRemove={() => {
                  const parsed = parseHostPort(k);
                  if (parsed !== null) remove(parsed.host, parsed.port);
                }}
              />
            ))}
          </ul>
        )}

        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-start">
          <input
            type="text"
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            disabled={disabled}
            placeholder="host:port (e.g. localhost:1234)"
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg disabled:opacity-50"
          />
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            disabled={disabled}
            placeholder="Bearer token"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 rounded-md border border-border bg-bg px-3 py-2 font-mono text-sm text-fg disabled:opacity-50"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {/* Surface the security note only at the moment of intent —
            once the user starts typing a key — so the panel stays
            quiet until it's actually relevant. */}
        {keyInput.trim().length > 0 ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
            <strong className="font-semibold">Security note.</strong> If you need stronger
            protection than plaintext <code className="font-mono">localStorage</code> (shared
            machine, untrusted browser extensions, etc.), front the engine with a reverse proxy
            that handles auth out-of-band — mTLS, an OAuth proxy, Tailscale Funnel with ACLs —
            rather than handing the browser a long-lived Bearer token.
          </p>
        ) : null}
        {error !== null ? (
          <p className="text-[12px] text-danger">{error}</p>
        ) : null}
      </div>
    </details>
  );
}

function ApiKeyRow({
  hostKey,
  masked,
  disabled,
  onRemove,
}: {
  hostKey: string;
  masked: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <code className="rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {hostKey}
        </code>
        <span className="font-mono text-[11px] text-fg-muted">{masked}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="rounded-md border border-border bg-bg px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        Remove
      </button>
    </li>
  );
}

function parseHostPort(s: string): { host: string; port: number } | null {
  const match = s.match(/^([^:\/\s]+):(\d{1,5})$/);
  if (match === null) return null;
  const [, host, portStr] = match;
  if (host === undefined || portStr === undefined) return null;
  const port = Number(portStr);
  if (port <= 0 || port > 65535) return null;
  return { host, port };
}

// Re-exported so the panel's host:port → AuthMap mapping stays
// internal but downstream tests / dev consoles can still inspect it.
export type { AuthMap };
