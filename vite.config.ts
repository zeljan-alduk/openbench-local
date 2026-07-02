/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [
    react(),
    // PWA: install manifest + offline app shell. The service worker
    // precaches ONLY the built bundle; every cross-origin request —
    // which is ALL LLM traffic (browser → 127.0.0.1:<engine port>) —
    // falls through untouched (no runtimeCaching entries, and
    // navigateFallback is scoped to same-origin navigations that hit
    // no precache entry). registerType 'prompt': a waiting worker
    // never auto-activates (activation reloads clients — that would
    // kill an in-flight bench); main.tsx surfaces a refresh prompt
    // and skips registration entirely on pr-<N>/ preview deploys.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registration lives in main.tsx (path-gated)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        // Belt-and-braces: never let the SW observe engine traffic.
        navigateFallbackDenylist: [/^\/v1\//, /\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'openbench-local',
        short_name: 'openbench',
        description:
          'Discover and benchmark local LLMs (Ollama, LM Studio, vLLM, llama.cpp) from your browser. 100% client-side.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        background_color: '#0b0f19',
        theme_color: '#0b0f19',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // The scoring core (evaluator, case generation, stats) is pure
    // TypeScript with no DOM dependency — plain node environment.
    // Tests that need a DOM opt in per-file via
    // `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/components/local-models/**/*.ts'],
    },
  },
});
