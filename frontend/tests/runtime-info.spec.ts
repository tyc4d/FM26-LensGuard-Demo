import { expect, test } from '@playwright/test';
import type { Health } from '../src/types';

const health: Health = {
  status: 'ok', runtime: 'prototype', model: 'live',
  prototype: {
    model_id: 'Qwen/Qwen3-VL-8B-Instruct', model_profile: 'qwen3vl-8b',
    status: 'ready', model_loaded: true,
    gpu_memory: { name: 'NVIDIA GeForce RTX 4090', used_mib: 12288, total_mib: 24576 },
  },
};

test('runtime indicator follows health polling and hides memory after disconnection', async ({ page }) => {
  let response = structuredClone(health);
  let offline = false;
  await page.clock.install();
  await page.route('**/api/health', route => offline ? route.abort() : route.fulfill({ json: response }));
  await page.goto('/');
  const info = page.locator('.runtime-info');
  await expect(info).toContainText('Qwen3-VL 8B');
  await expect(info).toContainText('GPU VRAM 12.00 / 24.00 GiB');
  response.prototype!.gpu_memory!.used_mib = 16384;
  await page.clock.runFor(4100);
  await expect(info).toContainText('GPU VRAM 16.00 / 24.00 GiB');
  offline = true;
  await page.clock.runFor(4100);
  await expect(info).toContainText('Disconnected');
  await expect(info).toContainText('GPU VRAM —');
  await expect(info).not.toContainText('16.00');
  offline = false;
  response = { ...health, prototype: { ...health.prototype!, model_id: 'google/gemma-3-4b-it', model_profile: 'gemma3-4b' } };
  await page.clock.runFor(4100);
  await expect(info).toContainText('Gemma 3 4B');
  await expect(info).toContainText('GPU VRAM 12.00 / 24.00 GiB');
});

for (const state of ['mock', 'unloaded', 'loading', 'unavailable', 'missing-memory'] as const) {
  test(`runtime indicator handles ${state} without invented usage`, async ({ page }) => {
    const response: Health = state === 'mock' ? { status: 'ok', runtime: 'mock', model: 'mock' }
      : { ...health, prototype: { ...health.prototype!, status: state === 'missing-memory' ? 'ready' : state,
        model_loaded: state === 'missing-memory', gpu_memory: null } };
    await page.route('**/api/health', route => route.fulfill({ json: response }));
    await page.goto('/');
    const info = page.locator('.runtime-info');
    await expect(info).toContainText('GPU VRAM —');
    await expect(info).toContainText(state === 'mock' ? 'Mock' : state === 'unavailable' ? 'Model offline' : 'Qwen3-VL 8B');
    if (state === 'unloaded') await expect(info).toContainText('(not loaded)');
    if (state === 'loading') await expect(info).toContainText('(loading)');
  });
}

for (const width of [320, 1280]) {
  test(`runtime indicator remains compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.route('**/api/health', route => route.fulfill({ json: health }));
    await page.goto('/?debug');
    const info = page.locator('.runtime-info');
    await expect(info).toContainText('12.00');
    await expect(info).toBeInViewport({ ratio: 1 });
    await expect(info).toHaveCSS('font-size', '10px');
    const bounds = await info.boundingBox();
    const wordmark = await page.locator('.experience-wordmark').boundingBox();
    const stage = await page.locator('.demo-experience').boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(wordmark!.y + wordmark!.height);
    expect(bounds!.y + bounds!.height).toBeLessThan(stage!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
