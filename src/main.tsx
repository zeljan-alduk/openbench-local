import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('No #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker — offline app shell only; all LLM traffic is
// cross-origin and passes through untouched. Registration is skipped
// on per-PR preview deploys (…/pr-<N>/…): one SW scope per origin
// would otherwise let a preview hijack the production shell (or vice
// versa) on GitHub Pages. registerType is 'prompt': a new version
// waits until the user confirms, so an in-flight bench is never
// killed by an auto-activating worker reloading the page.
if ('serviceWorker' in navigator && !/\/pr-\d+\//.test(window.location.pathname)) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (window.confirm('A new version of openbench-local is available. Reload now?')) {
          void updateSW(true);
        }
      },
    });
  });
}
