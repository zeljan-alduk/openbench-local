import { useEffect, useState } from 'react';

/**
 * One-time storage transparency notice.
 *
 * The app only writes to localStorage — never cookies, never third-party
 * trackers — and the data stays in the browser. Under GDPR / ePrivacy,
 * functional storage strictly necessary to deliver a service the user
 * explicitly requested is exempt from consent gates. We still surface a
 * dismissible notice so the data flow is visible up-front.
 *
 * Persisted dismissal: localStorage `openbench-local:notice-dismissed`.
 */

const DISMISS_KEY = 'openbench-local:notice-dismissed';

export function StorageNotice() {
  const [dismissed, setDismissed] = useState<boolean>(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(true);
    }
  }, []);

  const onDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode / quota — silently keep the in-memory dismissal */
    }
  };

  if (dismissed) return null;
  return (
    <div
      role="dialog"
      aria-label="Storage notice"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 print:hidden"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-bg-elevated p-4 shadow-lg sm:flex-row sm:items-start">
        <div className="flex-1 text-sm text-fg">
          <p className="font-medium">This site stores your settings locally in your browser.</p>
          <p className="mt-1 text-fg-muted">
            Discovered hosts, generation parameters, and custom eval cases are saved to{' '}
            <code className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-[12px]">
              localStorage
            </code>
            . Nothing is sent to a server — all benchmarking traffic stays between your browser and{' '}
            <span className="font-mono text-fg">127.0.0.1</span>. No cookies, no tracking, no
            analytics.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:shadow-md sm:self-auto"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
