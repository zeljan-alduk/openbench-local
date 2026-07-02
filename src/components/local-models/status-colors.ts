/**
 * Shared pass-rate color scale. The ≥90 emerald / ≥60 amber / red
 * thresholds were previously duplicated in four components
 * (bench-table SummaryFooter + TagBar, multi-bench CompareRow,
 * history RunRow) — this is the single source now.
 */

export type PassTone = 'good' | 'mid' | 'bad' | 'none';

export function passTone(pct: number | null): PassTone {
  if (pct === null || !Number.isFinite(pct)) return 'none';
  if (pct >= 90) return 'good';
  if (pct >= 60) return 'mid';
  return 'bad';
}

/** Text color classes (light + dark) for a pass percentage. */
export function passTextClass(pct: number | null): string {
  switch (passTone(pct)) {
    case 'good':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'mid':
      return 'text-amber-600 dark:text-amber-400';
    case 'bad':
      return 'text-red-600 dark:text-red-400';
    case 'none':
      return 'text-fg-muted';
  }
}

/** Bar/fill color classes for a pass percentage (TagBar-style meters). */
export function passBarClass(pct: number | null): string {
  switch (passTone(pct)) {
    case 'good':
      return 'bg-emerald-500';
    case 'mid':
      return 'bg-amber-500';
    case 'bad':
      return 'bg-red-500';
    case 'none':
      return 'bg-border';
  }
}
