'use client';

/**
 * Click-to-copy command pill. Used by the big CORS help panel and the
 * inline per-probe fix row.
 */

import { useState } from 'react';

export function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2 text-left font-mono text-[12px] text-fg hover:border-accent/50"
      title="Click to copy"
    >
      <span className="truncate">{command}</span>
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-fg-muted group-hover:text-accent">
        {copied ? 'Copied!' : 'Copy'}
      </span>
    </button>
  );
}
