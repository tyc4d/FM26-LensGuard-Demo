import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
import type { RunState } from '../src/types';

export async function chooseScene(page: Page, id: string) {
  await page.getByRole('button', { name: 'LensGuard · 選擇場景' }).click();
  await page.getByLabel('場景', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: '使用場景' }).click();
}
export async function separate(page: Page) {
  await page.getByRole('button', { name: '開始分析', exact: true }).click();
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate', { timeout: 15_000 });
}
export async function finish(page: Page) {
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'result');
}
export async function backendRun(request: APIRequestContext, scenario = 'navigation-injection', guardEnabled = true) {
  const initial = await (await request.post('/api/run', { data: { scenario_id: scenario, guard_enabled: guardEnabled } })).json() as RunState;
  let run = initial;
  await expect.poll(async () => {
    run = await (await request.get(`/api/run/${initial.id}`)).json() as RunState;
    return run.status;
  }, { timeout: 15_000 }).toBe('completed');
  return run;
}
export function requestGuard(request: Request) {
  return request.headers()['content-type']?.includes('multipart/form-data')
    ? request.postDataBuffer()!.includes(Buffer.from('name="guard_enabled"\r\n\r\ntrue'))
    : request.postDataJSON().guard_enabled === true;
}
export async function routePair(page: Page, guarded: RunState, baseline?: RunState) {
  const without = baseline ?? await backendRun(page.request, guarded.scenario_id, false);
  await page.route('**/api/run', route => route.fulfill({ json: requestGuard(route.request()) ? guarded : without }));
}
export async function liveHealth(page: Page) {
  await page.route('**/api/health', route => route.fulfill({ json: {
    status: 'ok', runtime: 'prototype', model: 'test-model', prototype: { status: 'ready', model_loaded: true },
  } }));
}
export async function upload(page: Page, width = 1000, height = 625) {
  const bytes = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!; context.fillStyle = '#eee'; context.fillRect(0, 0, width, height);
    context.fillStyle = '#222'; context.font = '50px sans-serif'; context.fillText('EXIT →', 80, 110);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { width, height });
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(bytes, 'base64') });
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
}
export async function prepareLive(page: Page, source: 'camera' | 'uploaded_image' = 'uploaded_image', scenario?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'LensGuard · 選擇場景' }).click();
  if (scenario) await page.getByLabel('場景', { exact: true }).selectOption(scenario);
  await page.getByLabel('你的需求').fill('Where is the emergency exit?');
  if (source === 'camera') {
    await page.getByRole('button', { name: '啟動相機', exact: true }).click();
    await expect(page.getByRole('button', { name: '停止相機', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).readyState >= 2)).toBeTruthy();
  } else await upload(page);
  await page.getByRole('button', { name: '使用圖片' }).click();
  await expect(page.getByRole('dialog', { name: '選擇場景' })).not.toBeVisible();
}
