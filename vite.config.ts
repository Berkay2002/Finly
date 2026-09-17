/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

/**
 * Serves the Vercel functions in /api during `vite dev`, so the app sees the same endpoints locally.
 * Without these handlers a fetch to /api would fall through to Vite's file pipeline, which tries to
 * serve the function source as a client module. Vite does not merge .env files into process.env, so
 * the logo search key is read from the .env files here and passed to the function explicitly.
 */
function vercelApi(): Plugin {
  return {
    name: 'finly-vercel-api',
    configureServer(server) {
      const send = (res: import('node:http').ServerResponse, response: Response) => {
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        void response.text().then((body) => res.end(body));
      };
      server.middlewares.use('/api/rates', async (_req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/rates.ts')) as { GET: () => Promise<Response> };
          send(res, await mod.GET());
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
      server.middlewares.use('/api/quotes', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/quotes.ts')) as { GET: (request: Request) => Promise<Response> };
          send(res, await mod.GET(new Request(new URL(req.url ?? '/', 'http://localhost'))));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
      server.middlewares.use('/api/logo-search', async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/logo-search.ts')) as {
            GET: (request: Request, overrides?: { key?: string }) => Promise<Response>;
          };
          const env = loadEnv(server.config.mode, server.config.root, '');
          const url = new URL(req.url ?? '/', 'http://localhost');
          send(res, await mod.GET(new Request(url, { headers: { accept: 'application/json' } }), { key: env.LOGO_DEV_SECRET_KEY }));
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vercelApi(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Finly',
        short_name: 'Finly',
        description: 'Plan your monthly money: income, bills, savings and what is safe to spend.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f5f7fa',
        theme_color: '#f5f7fa',
        categories: ['finance', 'productivity'],
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The app shell answers every route; /api is live data and stays uncached.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          sync: ['convex/react', '@scure/bip39'],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
