import { expect, test } from '@playwright/test';

test('same-origin API and progressive SSE work in a secure camera context', async ({ page, baseURL }) => {
  const apiRequests: string[] = [];
  const failures: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  page.on('console', (message) => { if (/mixed content/i.test(message.text())) failures.push(message.text()); });
  await page.goto('/');
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  const health = await page.evaluate(async () => (await fetch('/api/health')).json());
  expect(health.status).toBe('ok');
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('cell', { name: '收到影像', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '行動已阻擋', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
  await expect(page.locator('.timeline tbody tr')).toHaveCount(7);
  expect(apiRequests.some((url) => url.endsWith('/events'))).toBe(true);
  expect(apiRequests.every((url) => new URL(url).origin === new URL(baseURL!).origin)).toBe(true);
  expect(failures).toEqual([]);
});

test('insecure context gives a concise camera error', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  await page.goto('/');
  await page.getByRole('button', { name: '啟動相機' }).click();
  await expect(page.locator('.camera-error')).toHaveText('使用相機需要透過 HTTPS 或 localhost 開啟頁面。');
});
