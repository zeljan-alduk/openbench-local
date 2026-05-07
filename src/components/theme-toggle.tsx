import { useEffect, useState } from 'react';

/**
 * Theme toggle.
 *
 * Three states:
 *   - `light`  → forced light, ignores OS preference
 *   - `dark`   → forced dark
 *   - `system` → no class on <html>; falls back to the
 *                `prefers-color-scheme` media query in index.css
 *
 * Persisted in localStorage as `openbench-local:theme`. The flash-of-
 * wrong-theme problem is solved by an inline script in `index.html`
 * that applies the saved class *before* React mounts; this component
 * only handles user toggles after that.
 */

type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'openbench-local:theme';

function applyTheme(t: Theme): void {
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  if (t === 'light') html.classList.add('light');
  else if (t === 'dark') html.classList.add('dark');
}

function readTheme(): Theme {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* private mode / quota — fall through to default */
  }
  return 'system';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const set = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* private mode / quota — keep the in-memory choice for the session */
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="fixed right-4 top-4 z-30 flex items-center gap-0.5 rounded-full border border-border bg-bg-elevated p-1 shadow-sm print:hidden"
    >
      <ThemeButton
        active={theme === 'light'}
        onClick={() => set('light')}
        label="Light theme"
      >
        <SunIcon />
      </ThemeButton>
      <ThemeButton
        active={theme === 'system'}
        onClick={() => set('system')}
        label="Follow system theme"
      >
        <MonitorIcon />
      </ThemeButton>
      <ThemeButton
        active={theme === 'dark'}
        onClick={() => set('dark')}
        label="Dark theme"
      >
        <MoonIcon />
      </ThemeButton>
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors',
        active
          ? 'bg-accent text-accent-fg shadow-sm'
          : 'text-fg-muted hover:bg-bg-subtle hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
