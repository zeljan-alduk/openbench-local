'use client';

/**
 * Capability chip — rounded outline pill with an inline SVG icon and
 * a colour-themed border + text. One per inferred capability:
 *
 *   👁  Vision     — amber
 *   🔧  Tool Use   — sky/blue
 *   ()  Reasoning  — emerald
 *   〘〙  Embedding  — violet
 *
 * Pure presentational; the inference happens in `capabilities.ts`.
 */

import type { CapabilityKind } from './capabilities';

const PALETTE: Readonly<Record<CapabilityKind, string>> = Object.freeze({
  vision:
    'border-amber-500/50 bg-amber-500/5 text-amber-700 dark:border-amber-400/40 dark:text-amber-300',
  tool_use: 'border-sky-500/50 bg-sky-500/5 text-sky-700 dark:border-sky-400/40 dark:text-sky-300',
  reasoning:
    'border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:border-emerald-400/40 dark:text-emerald-300',
  embedding:
    'border-violet-500/50 bg-violet-500/5 text-violet-700 dark:border-violet-400/40 dark:text-violet-300',
});

const LABELS: Readonly<Record<CapabilityKind, string>> = Object.freeze({
  vision: 'Vision',
  tool_use: 'Tool Use',
  reasoning: 'Reasoning',
  embedding: 'Embedding',
});

export function CapabilityChip({ kind }: { kind: CapabilityKind }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none ${PALETTE[kind]}`}
    >
      <Icon kind={kind} />
      {LABELS[kind]}
    </span>
  );
}

function Icon({ kind }: { kind: CapabilityKind }) {
  switch (kind) {
    case 'vision':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden fill="none">
          {/* Eye outline + pupil */}
          <path
            d="M1.5 8 C 3.5 4.5, 6 3, 8 3 C 10 3, 12.5 4.5, 14.5 8 C 12.5 11.5, 10 13, 8 13 C 6 13, 3.5 11.5, 1.5 8 Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case 'tool_use':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden fill="none">
          {/* Wrench */}
          <path
            d="M11.2 1.8 a 3.2 3.2 0 0 0 -3.5 4.4 L 2.4 11.4 a 1.4 1.4 0 0 0 2 2 l 5.2 -5.2 a 3.2 3.2 0 0 0 4.4 -3.5 l -1.9 1.9 -1.6 -0.4 -0.4 -1.6 z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'reasoning':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden fill="none">
          {/* (...) — parentheses with a centred dot, reading as "thinking" */}
          <path
            d="M5 3 C 3 5, 3 11, 5 13"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M11 3 C 13 5, 13 11, 11 13"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
        </svg>
      );
    case 'embedding':
      return (
        <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden fill="none">
          {/* Three dots in a vertical column — embedding-vector vibe. */}
          <circle cx="4" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="12" cy="8" r="1.4" fill="currentColor" />
        </svg>
      );
    default: {
      const _exhaust: never = kind;
      void _exhaust;
      return null;
    }
  }
}
