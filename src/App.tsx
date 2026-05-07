import { LocalModelsShell } from './components/local-models/local-models-shell';
import { StorageNotice } from './components/storage-notice';
import { ThemeToggle } from './components/theme-toggle';

export function App() {
  return (
    <div className="relative overflow-hidden">
      <StorageNotice />
      <ThemeToggle />
      <div aria-hidden className="aldo-hero-blob print:hidden" />
      <PrintHeader />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mx-auto max-w-3xl text-center print:hidden">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-muted shadow-sm">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            <span className="text-fg-muted">Open source · runs in your browser · no signup</span>
          </p>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-fg sm:text-[2.6rem] sm:leading-[1.05]">
            Scan local models.
            <br className="hidden sm:block" />
            <span className="text-accent"> Rate them in seconds.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">
            The browser probes <span className="font-mono text-fg">127.0.0.1</span> (and any custom
            hosts you add) for any OpenAI-compatible LLM (Ollama, LM Studio, vLLM, llama.cpp), then
            runs an 18-case eval suite — instruction-following, JSON, reasoning, retrieval, native
            tool calls, and vision — streamed live as each case finishes.
          </p>
          <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] text-fg-muted">
            <Pill>100% client-side</Pill>
            <Pill>No API key</Pill>
            <Pill>Nothing leaves localhost</Pill>
            <Pill>18 eval cases · &lt;3 min</Pill>
            <Pill>MIT licensed</Pill>
          </ul>
        </header>

        <div className="mt-10">
          <LocalModelsShell />
        </div>

        <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-fg-muted print:hidden">
          <p>
            Open source under MIT.{' '}
            <a
              className="underline hover:text-fg"
              href="https://github.com/zeljan-alduk/openbench-local"
              target="_blank"
              rel="noreferrer"
            >
              github.com/zeljan-alduk/openbench-local →
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}

function PrintHeader() {
  const stamp = `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  return (
    <div className="hidden print:block print:mb-6 print:border-b print:border-black/30 print:pb-3 print:px-6 print:pt-6">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-muted">
        openbench-local · benchmark report
      </p>
      <p className="mt-1 text-[11px] text-fg-muted">Generated {stamp}</p>
    </div>
  );
}
