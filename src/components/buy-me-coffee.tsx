/**
 * "Buy me a coffee" support button.
 *
 * Fixed top-left so it doesn't collide with the ThemeToggle (fixed
 * top-right). Brand-yellow pill mirroring the slika.ai dashboard. Hidden
 * in print/report exports.
 */

const COFFEE_URL = 'https://buymeacoffee.com/6txpkxt5kp';

export function BuyMeCoffee() {
  return (
    <a
      href={COFFEE_URL}
      target="_blank"
      rel="noreferrer"
      title="Buy me a coffee"
      aria-label="Buy me a coffee"
      className="fixed left-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[#FFDD00] px-3 py-1.5 text-[13px] font-semibold text-[#0D0C22] shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md print:hidden"
    >
      <CoffeeIcon />
      <span>Buy me a coffee</span>
    </a>
  );
}

function CoffeeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z" />
      <path d="M17 9h1a3 3 0 0 1 0 6h-1" />
      <path d="M6 2v2" />
    </svg>
  );
}
