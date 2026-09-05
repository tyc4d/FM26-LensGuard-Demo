import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const httpsEnabled = (process.env.VITE_HTTPS ?? env.VITE_HTTPS) === 'true';
  let https;
  // Production builds need no certificate; TLS is configured at nginx startup.
  if (command === 'serve' && httpsEnabled) {
    try {
      https = {
        cert: readFileSync(fileURLToPath(new URL('../certs/lensguard.pem', import.meta.url))),
        key: readFileSync(fileURLToPath(new URL('../certs/lensguard-key.pem', import.meta.url))),
      };
    } catch {
      throw new Error('HTTPS certificates are missing or unreadable. Run ./scripts/setup-https.sh from the repository root, then restart Vite.');
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      https,
      port: 5173,
      strictPort: true,
      proxy: { '/api': {
        target: process.env.API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      } },
    },
  };
});
