import { expect, test } from '@playwright/test';
import { backendRun, finish, liveHealth, prepareLive, separate, upload, requestGuard, routePair } from './experience-helpers';
import type { RunState } from '../src/types';

for (const source of ['camera', 'uploaded_image'] as const) {
  test(`one real ${source} snapshot is sent with the exact request; replay does not resubmit`, async ({ page, request }) => {
    const result = await backendRun(request);
    const baseline = await backendRun(request, result.scenario_id, false);
    const images: Buffer[] = [];
    let posts = 0;
    await liveHealth(page);
    await page.route('**/api/run', route => {
      posts++;
      const req = route.request(), body = req.postDataBuffer()!;
      expect(req.headers()['content-type']).toContain('multipart/form-data');
      expect(body.includes(Buffer.from('image/jpeg'))).toBe(true);
      expect(body.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
      expect(body.includes(Buffer.from(source))).toBe(true);
      expect(body.includes(Buffer.from('Where is the emergency exit?'))).toBe(true);
      expect(requestGuard(req)).toBe(posts === 1);
      const start = body.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
      const end = body.indexOf(Buffer.from([0xff, 0xd9]), start) + 2;
      images.push(body.subarray(start, end));
      return route.fulfill({ json: { ...(requestGuard(req) ? result : baseline), runtime: 'prototype' } });
    });
    await prepareLive(page, source);
    expect(posts).toBe(0);
    const imageUrl = await page.locator('.scene-image').getAttribute('src');
    await separate(page);
    expect(await page.locator('.scene-image').getAttribute('src')).toBe(imageUrl);
    await finish(page);
    await expect(page.getByRole('heading', { name: '右邊' })).toBeVisible();
    await page.keyboard.press('r');
    await separate(page);
    await finish(page);
    expect(posts).toBe(2);
    expect(images).toHaveLength(2);
    expect(images[0].equals(images[1])).toBe(true);
    await expect(page.locator('video')).toHaveCount(0);
  });
}

test('real text without coordinates is shown as extracted text, with no invented image highlights', async ({ page, request }) => {
  const result = await backendRun(request);
  await liveHealth(page);
  await routePair(page, { ...result, runtime: 'prototype', regions: [] });
  await prepareLive(page);
  await separate(page);
  await expect(page.locator('.scene-plane .semantic-piece')).toHaveCount(0);
  await expect(page.getByText('識別原文')).toBeVisible();
  await expect(page.locator('.semantic-piece--unlocated')).toHaveCount(2);
  await finish(page);
  await expect(page.getByRole('heading', { name: '右邊' })).toBeVisible();
});

test('portrait image keeps highlights inside its actual letterboxed bounds', async ({ page, request }) => {
  const result = await backendRun(request);
  await liveHealth(page);
  await routePair(page, { ...result, runtime: 'prototype' });
  await page.goto('/');
  await page.getByRole('button', { name: 'LensGuard · 選擇場景' }).click();
  await upload(page, 500, 1000);
  await page.getByRole('button', { name: '使用圖片' }).click();
  await expect.poll(async () => { const rect = await page.locator('.scene-plane').boundingBox(); return rect!.height / rect!.width; }).toBeCloseTo(2);
  const image = await page.locator('.scene-plane').boundingBox();
  await separate(page);
  await expect(page.locator('.semantic-piece').first()).toHaveCSS('scale', '1');
  const highlight = await page.locator('.semantic-piece').first().boundingBox();
  expect(highlight!.x).toBeCloseTo(image!.x + image!.width * result.regions[0].bbox.x, 0);
  expect(highlight!.width).toBeCloseTo(image!.width * result.regions[0].bbox.width, 0);
});

test('parse failures end with a retry and retain raw details, never a fabricated success', async ({ page, request }) => {
  const result = await backendRun(request);
  await liveHealth(page);
  await page.route('**/api/run', route => route.fulfill({ json: {
    ...result, runtime: 'prototype', status: 'failed', regions: [], semantic_regions: [], action: null,
    decision: null, outcome: null, final_answer: null, raw_model_text: 'invalid real response', error: 'Parse failed.',
  } }));
  await prepareLive(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('heading', { name: '再試一次' })).toBeVisible();
  await expect(page.locator('.result-check, .semantic-piece')).toHaveCount(0);
  await page.keyboard.press('d');
  await page.getByText('查看技術細節', { exact: true }).click();
  await expect(page.getByText('invalid real response', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重播' }).click();
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
});

test('pending SSE cannot skip ahead, duplicate submissions or invent results', async ({ page, request }) => {
  const result = await backendRun(request);
  const baseline = await backendRun(request, result.scenario_id, false);
  const initial: RunState = { ...result, status: 'running', stage: 'queued', regions: [], semantic_regions: [], action: null, decision: null, outcome: null, final_answer: null, events: [] };
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let posts = 0;
  await page.route('**/api/run', route => { posts++; return route.fulfill({ json: requestGuard(route.request()) ? initial : baseline }); });
  await page.route(`**/api/run/${result.id}`, route => route.fulfill({ json: initial }));
  await page.route(`**/api/run/${result.id}/events`, async route => {
    await ready;
    await route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\ndata: ${JSON.stringify(result)}\n\n` });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
  // Two events in one task exercise the submission lock before React rerenders.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  });
  try {
    await expect(page.getByRole('button', { name: '分析中', exact: true })).toBeDisabled();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
    await expect(page.locator('.semantic-piece, .stage-result')).toHaveCount(0);
    expect(posts).toBe(1);
  } finally { release(); }
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate');
  await finish(page);
  await expect(page.getByRole('heading', { name: '右邊' })).toBeVisible();
});

test('lost event stream recovers the completed backend snapshot', async ({ page, request }) => {
  const result = await backendRun(request);
  const baseline = await backendRun(request, result.scenario_id, false);
  await page.route('**/api/run', route => route.fulfill({ json: requestGuard(route.request()) ? { ...result, status: 'running', outcome: null, events: [] } : baseline }));
  await page.route(`**/api/run/${result.id}/events`, route => route.abort());
  await page.route(`**/api/run/${result.id}`, route => route.fulfill({ json: result }));
  await page.goto('/');
  await separate(page);
  await finish(page);
  await expect(page.getByRole('heading', { name: '右邊' })).toBeVisible();
});

test('no image, rejected upload, empty request and insecure camera cannot send analysis', async ({ page }) => {
  await liveHealth(page);
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeDisabled();
  await page.getByRole('button', { name: 'LensGuard · 選擇場景' }).click();
  await page.getByRole('button', { name: '啟動相機', exact: true }).click();
  await expect(page.locator('.camera-error')).toContainText('HTTPS');
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.camera-error').last()).toBeVisible();
  await page.getByLabel('你的需求').fill('');
  await expect(page.getByRole('button', { name: '使用圖片' })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('r');
  expect(posts).toBe(0);
});

test('editing a request clears old results while preserving the selected image', async ({ page, request }) => {
  const result = await backendRun(request);
  await liveHealth(page);
  await routePair(page, { ...result, runtime: 'prototype' });
  await prepareLive(page);
  await separate(page);
  await finish(page);
  const image = await page.locator('.scene-image').getAttribute('src');
  await page.keyboard.press('s');
  await page.getByLabel('你的需求').fill('Read the exit sign.');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('r');
  await expect(page.getByLabel('你的需求')).toHaveValue('Read the exit signr.');
  await page.keyboard.press('Escape');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
  expect(await page.locator('.scene-image').getAttribute('src')).toBe(image);
  await expect(page.locator('.stage-result, .semantic-piece')).toHaveCount(0);
});
