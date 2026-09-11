import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
import type { RunState } from '../src/types';

export async function chooseScene(page: Page, id: string) {
  await page.getByRole('button', { name: 'LensGuard · Choose scene' }).click();
  await page.getByLabel('Scene', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Use scene' }).click();
}
export async function separate(page: Page) {
  await page.getByRole('button', { name: 'Start analysis', exact: true }).click();
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate', { timeout: 15_000 });
}
export async function finish(page: Page) {
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
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
  await page.getByLabel('Upload scene image').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(bytes, 'base64') });
  await expect(page.getByRole('img', { name: 'Uploaded scene image: scene.png' })).toBeVisible();
}
export async function prepareLive(page: Page, source: 'camera' | 'uploaded_image' = 'uploaded_image', scenario?: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'LensGuard · Choose scene' }).click();
  if (scenario) await page.getByLabel('Scene', { exact: true }).selectOption(scenario);
  await page.getByLabel('Your request').fill('Where is the emergency exit?');
  if (source === 'camera') {
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop camera', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).readyState >= 2)).toBeTruthy();
  } else await upload(page);
  await page.getByRole('button', { name: 'Use image' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose scene' })).not.toBeVisible();
}
