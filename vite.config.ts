import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const isStrictPolicyMode =
    process.env.STRICT_POLICY_MODE === '1' ||
    String(process.env.STRICT_POLICY_MODE || '').toLowerCase() === 'true';

  const manifestData = {
    id: '/',
    name: 'DevMind Studio',
    short_name: 'DevMind',
    description:
      'Desktop software engineering environment with offline IndexedDB code editing, extension host, and repository intelligence.',
    theme_color: '#1C1C1E',
    background_color: '#1C1C1E',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    icons: [
      {
        src: '/pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/pwa-maskable-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isStrictPolicyMode
        ? [
            {
              name: 'strict-policy-pwa-fallback',
              resolveId(id: string) {
                if (id === 'virtual:pwa-register' || id === 'virtual:pwa-register/react') {
                  return '\0virtual:pwa-register-fallback';
                }
                return null;
              },
              load(id: string) {
                if (id === '\0virtual:pwa-register-fallback') {
                  return 'export function registerSW() { return () => Promise.resolve(); }\n';
                }
                return null;
              },
              closeBundle(error?: Error): void {
                if (error) return;
                const distDir = path.resolve(import.meta.dirname, 'dist');
                if (fs.existsSync(distDir)) {
                  fs.writeFileSync(
                    path.join(distDir, 'manifest.webmanifest'),
                    JSON.stringify(manifestData, null, 2),
                    'utf8'
                  );
                }
              },
            },
          ]
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: [
                'icon.png',
                'apple-touch-icon.png',
                'pwa-192x192.png',
                'pwa-512x512.png',
                'pwa-maskable-512x512.png',
              ],
              manifest: manifestData,
              workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
                navigateFallback: '/index.html',
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                  {
                    urlPattern: ({ url, request }) =>
                      request.method === 'GET' &&
                      url.pathname.startsWith('/api/v1/') &&
                      !url.pathname.startsWith('/api/v1/events'),
                    handler: 'NetworkFirst',
                    options: {
                      cacheName: 'devmind-api-cache',
                      networkTimeoutSeconds: 4,
                      expiration: {
                        maxEntries: 60,
                        maxAgeSeconds: 60 * 60 * 24 * 7,
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'google-fonts-cache',
                      expiration: {
                        maxEntries: 10,
                        maxAgeSeconds: 60 * 60 * 24 * 365,
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                  {
                    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'gstatic-fonts-cache',
                      expiration: {
                        maxEntries: 10,
                        maxAgeSeconds: 60 * 60 * 24 * 365,
                      },
                      cacheableResponse: {
                        statuses: [0, 200],
                      },
                    },
                  },
                ],
              },
              devOptions: {
                enabled: true,
                type: 'module',
              },
            }),
          ]),
      {
        name: 'disable-hmr-client-ws',
        apply: 'serve',
        enforce: 'post',
        transform(code: string, id: string) {
          if (
            (id.includes('vite/dist/client/client.mjs') || id.includes('@vite/client')) &&
            code.includes('transport.connect(')
          ) {
            const patched = code
              .replace(
                /transport\.connect\([^\n;]*\);/g,
                '/* HMR WebSocket disabled in dev proxy environment */'
              )
              .replace(
                /else throw new SendBeforeConnectError\("send was called before connect"\);/g,
                'else return;'
              )
              .replace(
                /else throw new SendBeforeConnectError\("invoke was called before connect"\);/g,
                'else return;'
              )
              .replace(
                /ws\.send\(JSON\.stringify\(data\)\);/g,
                'if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));'
              );
            return {
              code: patched,
              map: null,
            };
          }
          return null;
        },
      },
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'react-core';
            }
            if (id.includes('node_modules/@firebase/firestore')) {
              return 'firebase-firestore';
            }
            if (id.includes('node_modules/@firebase/auth') || id.includes('node_modules/@firebase/storage')) {
              return 'firebase-auth-storage';
            }
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'firebase-core';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'ui-icons';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      hmr: false,
      ws: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
