import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const httpsEnabled = process.env.VITE_HTTPS === 'true';
const isolated = process.env.PLAYWRIGHT_ISOLATED === 'true';
const backendPort = isolated ? 18000 : 8000;
const frontendPort = isolated ? 15173 : 5173;
const baseURL = `${httpsEnabled ? 'https' : 'http'}://localhost:${frontendPort}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 1000 },
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
  webServer: [
    {
      command: `${process.env.PYTHON_BINARY || path.resolve('../backend/.venv/bin/python')} -m uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
      cwd: path.resolve('../backend'),
      env: { LENSGUARD_RUNTIME: 'mock' },
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: !isolated && !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      env: { VITE_HTTPS: httpsEnabled ? 'true' : 'false', API_PROXY_TARGET: `http://127.0.0.1:${backendPort}` },
      url: baseURL,
      reuseExistingServer: !isolated && !process.env.CI,
      timeout: 30_000,
    },
  ],
});
