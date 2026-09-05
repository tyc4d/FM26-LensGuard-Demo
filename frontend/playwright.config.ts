import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const httpsEnabled = process.env.VITE_HTTPS === 'true';
const baseURL = `${httpsEnabled ? 'https' : 'http'}://localhost:5173`;

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
      command: `${process.env.PYTHON_BINARY || path.resolve('../backend/.venv/bin/python')} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: path.resolve('../backend'),
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1',
      env: { VITE_HTTPS: httpsEnabled ? 'true' : 'false' },
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
