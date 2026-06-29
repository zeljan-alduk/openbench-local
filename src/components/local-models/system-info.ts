/**
 * Best-effort host/system probe — everything the browser will tell us
 * about the machine it's running on, with graceful per-field fallback.
 *
 * Caveat worth surfacing in the UI: this describes the machine running
 * the *browser*, which is not necessarily the machine *serving the
 * model* (you can point openbench-local at a LAN / remote host). It's
 * still useful context for the tok/s numbers when they're the same box.
 *
 * Sources, all client-side, no network:
 *   - navigator.userAgentData.getHighEntropyValues → OS + arch (Chromium)
 *   - navigator.userAgent                          → OS + browser fallback
 *   - navigator.hardwareConcurrency                → logical CPU cores
 *   - navigator.deviceMemory                       → approx RAM (Chromium)
 *   - WebGL UNMASKED_RENDERER_WEBGL                → GPU name
 *   - navigator.gpu adapter info                   → GPU vendor/arch (WebGPU)
 */

export interface SystemInfo {
  readonly os: string | null;
  readonly arch: string | null;
  readonly cpuThreads: number | null;
  /** Approximate, and capped at 8 GB by the spec for privacy — read as "≥". */
  readonly memoryGB: number | null;
  readonly gpu: string | null;
  readonly gpuVendor: string | null;
  readonly webgpu: string | null;
  readonly browser: string | null;
  readonly screen: string | null;
}

interface UADataLike {
  readonly brands?: ReadonlyArray<{ readonly brand: string; readonly version: string }>;
  getHighEntropyValues?: (hints: readonly string[]) => Promise<{
    readonly platform?: string;
    readonly platformVersion?: string;
    readonly architecture?: string;
    readonly bitness?: string;
    readonly model?: string;
  }>;
}

export async function collectSystemInfo(): Promise<SystemInfo> {
  const nav = navigator as Navigator & {
    userAgentData?: UADataLike;
    deviceMemory?: number;
  };

  let os: string | null = null;
  let arch: string | null = null;
  let browser: string | null = null;

  const uaData = nav.userAgentData;
  if (uaData?.getHighEntropyValues !== undefined) {
    try {
      const he = await uaData.getHighEntropyValues([
        'platform',
        'platformVersion',
        'architecture',
        'bitness',
        'model',
      ]);
      os = joinTruthy([he.platform, prettyPlatformVersion(he.platform, he.platformVersion)], ' ');
      arch = joinTruthy([he.architecture, he.bitness ? `${he.bitness}-bit` : ''], ' ');
      if (he.model) arch = joinTruthy([arch, `· ${he.model}`], ' ');
    } catch {
      /* high-entropy denied — fall through to UA parsing */
    }
    browser = brandString(uaData.brands);
  }

  // Fallbacks from the UA string when Client Hints aren't available
  // (Firefox / Safari) or were denied.
  if (os === null || os.trim() === '') os = osFromUserAgent(nav.userAgent);
  if (browser === null || browser.trim() === '') browser = browserFromUserAgent(nav.userAgent);

  const { gpu, gpuVendor } = readWebglGpu();
  const webgpu = await readWebgpu();

  return {
    os: nullIfBlank(os),
    arch: nullIfBlank(arch),
    cpuThreads: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    gpu,
    gpuVendor,
    webgpu,
    browser: nullIfBlank(browser),
    screen:
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio ?? 1}×`
        : null,
  };
}

function readWebglGpu(): { gpu: string | null; gpuVendor: string | null } {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl === null) return { gpu: null, gpuVendor: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg
      ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string)
      : (gl.getParameter(gl.RENDERER) as string);
    const gpuVendor = dbg
      ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string)
      : (gl.getParameter(gl.VENDOR) as string);
    return { gpu: nullIfBlank(gpu), gpuVendor: nullIfBlank(gpuVendor) };
  } catch {
    return { gpu: null, gpuVendor: null };
  }
}

async function readWebgpu(): Promise<string | null> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
    if (gpu?.requestAdapter === undefined) return null;
    const adapter = (await gpu.requestAdapter()) as
      | {
          info?: { vendor?: string; architecture?: string; device?: string; description?: string };
          requestAdapterInfo?: () => Promise<{
            vendor?: string;
            architecture?: string;
            description?: string;
          }>;
        }
      | null;
    if (adapter === null) return null;
    const info = adapter.info ?? (await adapter.requestAdapterInfo?.());
    if (info === undefined) return 'available';
    return nullIfBlank(joinTruthy([info.vendor, info.architecture, info.description], ' · ')) ?? 'available';
  } catch {
    return null;
  }
}

// ── small UA helpers (fallbacks only) ───────────────────────────────────

function osFromUserAgent(ua: string): string | null {
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+[_.]\d+)/);
    return m ? `macOS ${m[1].replace('_', '.')}` : 'macOS';
  }
  if (/Android/.test(ua)) return 'Android';
  if (/(iPhone|iPad|iPod)/.test(ua)) return 'iOS / iPadOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

function browserFromUserAgent(ua: string): string | null {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] ?? ''}`.trim();
  if (/Chrome\//.test(ua)) return `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] ?? ''}`.trim();
  if (/Safari\//.test(ua)) return `Safari ${ua.match(/Version\/(\d+)/)?.[1] ?? ''}`.trim();
  return null;
}

function brandString(
  brands: ReadonlyArray<{ brand: string; version: string }> | undefined,
): string | null {
  if (brands === undefined) return null;
  const real = brands.find(
    (b) => !/Not.?A.?Brand/i.test(b.brand) && !/Chromium/i.test(b.brand),
  );
  const pick = real ?? brands.find((b) => !/Not.?A.?Brand/i.test(b.brand));
  return pick ? `${pick.brand} ${pick.version}` : null;
}

function prettyPlatformVersion(platform?: string, version?: string): string {
  if (!version) return '';
  // Windows reports the NT build family in platformVersion; 13+ = Win 11.
  if (platform === 'Windows') {
    const major = Number(version.split('.')[0]);
    return Number.isFinite(major) ? (major >= 13 ? '11' : '10') : version;
  }
  return version;
}

function joinTruthy(parts: ReadonlyArray<string | undefined>, sep: string): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(sep);
}

function nullIfBlank(s: string | null | undefined): string | null {
  return s === null || s === undefined || s.trim() === '' ? null : s;
}
