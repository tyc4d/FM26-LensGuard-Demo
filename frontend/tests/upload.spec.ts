import { expect, test, type Page } from '@playwright/test';

async function chooseImage(page: Page, name = 'scene.png') {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#eee'; context.fillRect(0, 0, 640, 360);
    context.fillStyle = '#222'; context.font = '36px sans-serif';
    context.fillText('ABC Bistro', 50, 150);
    context.fillText('02-2345-6789', 50, 210);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
  await expect(page.getByRole('img', { name: `已上傳的觀察圖片：${name}`, exact: true })).toBeVisible();
}

test('image preview supports mock analysis and survives Reset and navigation', async ({ page }) => {
  await page.goto('/');
  const uploads: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST') uploads.push(request.url()); });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上傳圖片', exact: true }).click();
  await chooser;
  await chooseImage(page);
  expect(uploads).toHaveLength(0);
  await expect(page.getByText('上傳的圖片僅保留在此瀏覽器', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await expect(page.locator('.camera-region')).toHaveCount(2);
  await page.getByRole('button', { name: '重設', exact: true }).click();
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
  await expect(page.locator('.camera-region')).toHaveCount(0);
  await page.getByRole('link', { name: '系統架構', exact: true }).click();
  await page.getByRole('link', { name: '即時展示', exact: true }).click();
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
});

test('replacing and removing images releases object URLs and clears old analysis', async ({ page }) => {
  await page.goto('/');
  await chooseImage(page);
  const oldUrl = await page.locator('.uploaded-image').getAttribute('src');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await chooseImage(page, 'replacement.png');
  await expect(page.getByTestId('decision-result')).toContainText('等待分析');
  expect(await page.evaluate(async (url) => { try { await fetch(url!); return true; } catch { return false; } }, oldUrl)).toBe(false);
  const currentUrl = await page.locator('.uploaded-image').getAttribute('src');
  await page.getByRole('button', { name: '移除圖片' }).click();
  await expect(page.locator('.uploaded-image')).toHaveCount(0);
  await expect(page.getByText('相機已關閉', { exact: true })).toBeVisible();
  expect(await page.evaluate(async (url) => { try { await fetch(url!); return true; } catch { return false; } }, currentUrl)).toBe(false);
  await chooseImage(page, 'replacement.png');
});

test('upload stops the camera; starting camera switches back from the image', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '啟動相機' }).click();
  await expect(page.getByTestId('status-camera')).toContainText('使用中');
  const track = await page.locator('video').evaluateHandle((video: HTMLVideoElement) => (video.srcObject as MediaStream).getVideoTracks()[0]);
  await chooseImage(page);
  expect(await track.evaluate((value) => value.readyState)).toBe('ended');
  await expect(page.getByTestId('status-camera')).toContainText('已關閉');
  await page.getByRole('button', { name: '啟動相機' }).click();
  await expect(page.getByTestId('status-camera')).toContainText('使用中');
  await expect(page.locator('.uploaded-image')).toHaveCount(0);
});

test('invalid, oversized, and corrupt files preserve the previous preview', async ({ page }) => {
  await page.goto('/');
  await chooseImage(page);
  const fileInput = page.getByLabel('上傳觀察圖片');
  await fileInput.setInputFiles({ name: 'text.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
  await expect(page.getByRole('alert')).toContainText('請選擇 JPEG、PNG 或 WebP 圖片。');
  await fileInput.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('小於 10 MB');
  await fileInput.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.getByRole('alert')).toContainText('無法開啟此圖片');
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
});

test('upload works without a secure context or camera permission', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  await page.goto('/');
  await chooseImage(page);
  await page.getByRole('button', { name: '啟動相機' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTPS 或 localhost');
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
});
