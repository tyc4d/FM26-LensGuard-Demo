import { expect, test } from '@playwright/test';
import type { Health, ModelProfile } from '../src/types';
import { backendRun, finish, prepareLive, requestGuard, separate } from './experience-helpers';

const NEMOTRON: ModelProfile = 'nemotron-nano-vl-8b';
const COSMOS: ModelProfile = 'cosmos-reason1-7b';
const health: Health = {
  status: 'ok', runtime: 'prototype', model: 'live',
  prototype: {
    status: 'ready', model_loaded: true, model_profile: COSMOS,
    model_id: 'nvidia/Cosmos-Reason1-7B', default_model: NEMOTRON,
    models: [
      { id: NEMOTRON, name: 'NVIDIA Nemotron Nano VL 8B', available: true },
      { id: COSMOS, name: 'NVIDIA Cosmos Reason1 7B', available: true },
    ],
    gpu_memory: { name: 'RTX 4090', used_mib: 16000, total_mib: 24564 },
  },
};

test('only NVIDIA models are selectable; health polling does not replace the visitor choice', async ({ page }) => {
  const response = structuredClone(health);
  let posts = 0;
  await page.clock.install();
  await page.route('**/api/health', route => route.fulfill({ json: response }));
  await page.route('**/api/run', route => { posts++; return route.abort(); });
  await page.goto('/');
  const selector = page.getByRole('combobox', { name: 'Inference model', exact: true });
  await expect(selector.locator('option')).toHaveText(['NVIDIA Nemotron Nano VL 8B', 'NVIDIA Cosmos Reason1 7B']);
  // A different visitor can have Cosmos resident while a new page defaults to Nemotron.
  await expect(selector).toHaveValue(NEMOTRON);
  await selector.selectOption(COSMOS);
  response.prototype!.model_profile = NEMOTRON;
  await page.clock.runFor(4100);
  await expect(selector).toHaveValue(COSMOS);
  expect(posts).toBe(0);
  await page.reload();
  await expect(selector).toHaveValue(NEMOTRON);
});

test('both comparison requests pin the chosen model and image; switching clears results and keeps the input', async ({ page, request }) => {
  const guarded = await backendRun(request);
  const baseline = await backendRun(request, guarded.scenario_id, false);
  const sent: { profile: string; guard: boolean; image: Buffer }[] = [];
  const releases: (() => void)[] = [];
  const gates = [0, 1].map(() => new Promise<void>(resolve => { releases.push(resolve); }));
  await page.route('**/api/health', route => route.fulfill({ json: health }));
  await page.route('**/api/run', async route => {
    const body = route.request().postDataBuffer()!;
    const profile = body.includes(Buffer.from(`name="model_profile"\r\n\r\n${COSMOS}`)) ? COSMOS : NEMOTRON;
    expect(body.includes(Buffer.from(`name="model_profile"\r\n\r\n${profile}`))).toBe(true);
    const guard = requestGuard(route.request());
    const index = sent.length;
    const start = body.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
    const end = body.indexOf(Buffer.from([0xff, 0xd9]), start) + 2;
    expect(start).toBeGreaterThan(0);
    sent.push({ profile, guard, image: body.subarray(start, end) });
    if (index < gates.length) await gates[index];
    await route.fulfill({ json: { ...(guard ? guarded : baseline), id: `selected-${index}`,
      runtime: 'prototype', model_profile: profile } });
  });
  await prepareLive(page);
  const selector = page.getByRole('combobox', { name: 'Inference model', exact: true });
  await selector.selectOption(COSMOS);
  const image = await page.locator('.scene-image').getAttribute('src');
  await page.getByRole('button', { name: 'Start analysis', exact: true }).click();
  try {
    await expect.poll(() => sent.length).toBe(1);
    await expect(selector).toBeDisabled();
    releases[0]();
    await expect.poll(() => sent.length).toBe(2);
    await expect(selector).toBeDisabled();
  } finally { releases.forEach(release => release()); }
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate');
  await finish(page);
  expect(sent.map(({ profile, guard }) => ({ profile, guard }))).toEqual([
    { profile: COSMOS, guard: true }, { profile: COSMOS, guard: false },
  ]);
  expect(sent[0].image.equals(sent[1].image)).toBe(true);
  await expect(selector).toBeEnabled();
  await selector.selectOption(NEMOTRON);
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
  expect(await page.locator('.scene-image').getAttribute('src')).toBe(image);
  await separate(page);
  expect(sent.slice(2).map(item => item.profile)).toEqual([NEMOTRON, NEMOTRON]);
});

test('a baseline from a different model is unavailable while the protected result remains', async ({ page, request }) => {
  const guarded = await backendRun(request);
  const baseline = await backendRun(request, guarded.scenario_id, false);
  await page.route('**/api/health', route => route.fulfill({ json: health }));
  await page.route('**/api/run', route => route.fulfill({ json: requestGuard(route.request())
    ? { ...guarded, runtime: 'prototype', model_profile: NEMOTRON }
    : { ...baseline, runtime: 'prototype', model_profile: COSMOS } }));
  await prepareLive(page);
  await separate(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.comparison-row[data-guard="off"]')).toContainText('Result unavailable');
  await expect(page.locator('.comparison-row[data-guard="on"] strong')).toHaveText('Right');
});

test('an unavailable model disables analysis by button and keyboard; disconnection locks selection', async ({ page }) => {
  const response = structuredClone(health);
  response.prototype!.models![0].available = false;
  let offline = false;
  let posts = 0;
  await page.clock.install();
  await page.route('**/api/health', route => offline ? route.abort() : route.fulfill({ json: response }));
  await page.route('**/api/run', route => { posts++; return route.abort(); });
  await prepareLive(page);
  const selector = page.getByRole('combobox', { name: 'Inference model', exact: true });
  await expect(selector.locator(`option[value="${NEMOTRON}"]`)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Start analysis', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  expect(posts).toBe(0);
  await selector.selectOption(COSMOS);
  await expect(page.getByRole('button', { name: 'Start analysis', exact: true })).toBeEnabled();
  offline = true;
  await page.clock.runFor(4100);
  await expect(selector).toBeDisabled();
});

for (const width of [320, 1280]) {
  test(`model schema failure explains the cause and permits another model at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const message = 'The model returned an invalid response structure while selecting evidence. Try another model or run the analysis again.';
    const result = { ...await backendRun(request), model_profile: NEMOTRON, runtime: 'prototype',
      status: 'failed', error: message, error_code: 'model_schema_invalid', action: null, outcome: null,
      decision: null, final_answer: null, regions: [], semantic_regions: [] };
    await page.route('**/api/health', route => route.fulfill({ json: health }));
    await page.route('**/api/run', route => route.fulfill({ json: result }));
    await prepareLive(page);
    await page.getByRole('button', { name: 'Start analysis', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Try again', exact: true })).toBeVisible();
    await expect(page.locator('.result-caption')).toHaveText(message);
    await expect(page.locator('.result-caption')).toBeInViewport({ ratio: 1 });
    const stage = await page.locator('.central-stage').boundingBox();
    const note = await page.locator('.result-note').boundingBox();
    expect(note!.y + note!.height).toBeLessThan(stage!.y + stage!.height);
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeInViewport({ ratio: 1 });
    const selector = page.getByRole('combobox', { name: 'Inference model', exact: true });
    await expect(selector).toBeEnabled();
    await selector.selectOption(COSMOS);
    await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
    await expect(page.getByRole('button', { name: 'Start analysis', exact: true })).toBeEnabled();
  });

  test(`NVIDIA model selector fits at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await page.route('**/api/health', route => route.fulfill({ json: health }));
    await page.goto('/?debug');
    const selector = page.getByRole('combobox', { name: 'Inference model', exact: true });
    await expect(selector).toBeInViewport({ ratio: 1 });
    const info = await page.locator('.runtime-info').boundingBox();
    const stage = await page.locator('.demo-experience').boundingBox();
    expect(info!.y + info!.height).toBeLessThan(stage!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('nvidia-selector.png') });
  });
}
