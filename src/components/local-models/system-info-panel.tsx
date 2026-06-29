import { useEffect, useState } from 'react';
import { collectSystemInfo, type SystemInfo } from './system-info';

/**
 * "This machine" panel — a compact, collapsible readout of the host the
 * browser is running on (OS, CPU threads, RAM, GPU). Useful context for
 * the tok/s numbers, since speed is hardware-bound.
 *
 * Everything is best-effort and client-side; fields the browser won't
 * expose render as "—". The model-serving host can differ from this
 * machine when you point at a remote engine — the header says so.
 */
export function SystemInfoPanel() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let live = true;
    collectSystemInfo().then((i) => {
      if (live) setInfo(i);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <details className="group rounded-2xl border border-border bg-bg-elevated shadow-sm print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-fg">This machine</h2>
          <span className="font-mono text-[11px] text-fg-muted">
            {info === null
              ? 'reading…'
              : compactLine(info)}
          </span>
        </div>
        <span aria-hidden className="text-fg-muted transition-transform group-open:rotate-90">
          ▸
        </span>
      </summary>
      <div className="border-t border-border px-5 py-4">
        <p className="mb-3 text-[11px] leading-relaxed text-fg-muted">
          What this browser reports about the device running it. This is{' '}
          <strong className="text-fg">not necessarily the model host</strong> — when you point at a
          remote/LAN engine, the serving hardware is elsewhere. All read locally; nothing is sent.
        </p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Stat label="OS" value={info?.os} />
          <Stat label="Architecture" value={info?.arch} />
          <Stat label="Browser" value={info?.browser} />
          <Stat
            label="CPU threads"
            value={info?.cpuThreads !== null && info?.cpuThreads !== undefined ? String(info.cpuThreads) : null}
          />
          <Stat
            label="Memory"
            value={info?.memoryGB !== null && info?.memoryGB !== undefined ? `≥ ${info.memoryGB} GB` : null}
            hint="reported in coarse steps for privacy"
          />
          <Stat label="Screen" value={info?.screen} />
          <Stat label="GPU" value={info?.gpu} span />
          <Stat label="GPU vendor" value={info?.gpuVendor} />
          <Stat label="WebGPU adapter" value={info?.webgpu} />
        </dl>
      </div>
    </details>
  );
}

function compactLine(i: SystemInfo): string {
  const bits = [
    i.os,
    i.cpuThreads !== null ? `${i.cpuThreads} threads` : null,
    i.memoryGB !== null ? `≥${i.memoryGB}GB` : null,
    gpuShort(i.gpu),
  ].filter((b): b is string => b !== null && b !== '');
  return bits.length > 0 ? bits.join(' · ') : 'limited info available';
}

function gpuShort(gpu: string | null): string | null {
  if (gpu === null) return null;
  // Trim the verbose "ANGLE (Vendor, Renderer Direct3D11 …)" wrapper Chrome
  // emits on Windows down to the renderer name in the middle.
  const angle = gpu.match(/ANGLE \([^,]+,\s*([^,(]+)/);
  const name = (angle?.[1] ?? gpu).trim();
  return name.length > 42 ? `${name.slice(0, 40)}…` : name;
}

function Stat({
  label,
  value,
  hint,
  span,
}: {
  label: string;
  value: string | null | undefined;
  hint?: string;
  span?: boolean;
}) {
  return (
    <div className={span ? 'col-span-2 sm:col-span-3' : ''}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-faint">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-mono text-[12px] text-fg" title={hint}>
        {value === null || value === undefined || value === '' ? (
          <span className="text-fg-faint">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
