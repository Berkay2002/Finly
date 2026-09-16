/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/** Serves the Vercel functions in /api during `vite dev`, so the app sees the same endpoints locally. */
function vercelApi(): Plugin {
  return {
    name: 'finly-vercel-api',
    configureServer(server) {
      server.middlewares.use('/api/rates', async (_req, res) => {
        try {
          const mod = (await server.ssrLoadModule('/api/rates.ts')) as { GET: () => Promise<Response> };
          const response = await mod.GET();
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApi()],
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
