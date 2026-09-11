import { expect, test } from '@playwright/test';
import { backendRun, finish, liveHealth, prepareLive, requestGuard, routePair, separate } from './experience-helpers';
import { presentBaseline } from '../src/experience';
import { comparisonReducer, INITIAL_COMPARISON } from '../src/useComparison';

test('an attacked image can return the same answer without protection; the UI reports it honestly', async ({ page, request }) => {
  const guarded = await backendRun(request);
  const baseline = await backendRun(request, 'clean-navigation', false);
  // Explicit response fixture: an unprotected model that still answers correctly.
  baseline.scenario_id = guarded.scenario_id;
  await routePair(page, guarded, baseline);
  await page.goto('/');
  await separate(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.semantic-label').filter({ hasText: 'Unsafe instruction' })).toBeVisible();
  await expect(page.locator('.comparison-row[data-guard="off"] strong')).toHaveText('Right');
  await expect(page.locator('.comparison-row[data-guard="on"] strong')).toHaveText('Right');
  await expect(page.locator('.decision-comparison')).toContainText('Same output this time');
});

for (const failure of ['transport', 'model', 'wrong-guard'] as const) {
  test(`baseline ${failure} failure preserves the protected result and never substitutes an answer`, async ({ page, request }) => {
    const guarded = await backendRun(request);
    let posts = 0;
    await page.route('**/api/run', route => {
      posts++;
      if (requestGuard(route.request())) return route.fulfill({ json: guarded });
      if (failure === 'transport') return route.fulfill({ status: 503, json: { detail: 'Comparison temporarily unavailable' } });
      return route.fulfill({ json: { ...guarded, id: 'failed-baseline', guard_enabled: failure === 'wrong-guard',
        status: failure === 'model' ? 'failed' : 'completed', error: 'Baseline failed' } });
    });
    await page.goto('/');
    await separate(page);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.comparison-row[data-guard="off"]')).toContainText('Result unavailable');
    await expect(page.locator('.comparison-row[data-guard="off"]')).not.toContainText('Left');
    await expect(page.locator('.comparison-row[data-guard="on"] strong')).toHaveText('Right');
    await expect(page.locator('.experience-error:visible')).toHaveCount(0);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'Right' })).toBeVisible();
    await page.keyboard.press('r');
    await separate(page);
    await finish(page);
    expect(posts).toBe(2);
  });
}

test('a failed first request releases the submission lock so ANALYZE can retry', async ({ page, request }) => {
  const guarded = await backendRun(request);
  const baseline = await backendRun(request, guarded.scenario_id, false);
  let posts = 0;
  await page.route('**/api/run', route => {
    posts++;
    return posts === 1 ? route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } })
      : route.fulfill({ json: requestGuard(route.request()) ? guarded : baseline });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start analysis', exact: true }).click();
  await expect(page.locator('.experience-error')).toContainText('Unable to complete the analysis. Please try again.');
  await separate(page);
  await finish(page);
  await expect(page.getByRole('heading', { name: 'Right' })).toBeVisible();
  expect(posts).toBe(3);
});

test('comparison rejects stale or mismatched runs and never treats partial output as an actual baseline', async ({ request }) => {
  const guarded = await backendRun(request);
  const baseline = await backendRun(request, guarded.scenario_id, false);
  const state = comparisonReducer(INITIAL_COMPARISON, { type: 'begin', input: { scenarioId: guarded.scenario_id, query: 'exit?', compare: true }, ignoreId: 'previous' });
  expect(comparisonReducer(state, { type: 'received', run: { ...guarded, id: 'previous' } })).toBe(state);
  expect(comparisonReducer(state, { type: 'received', run: { ...guarded, status: 'running' } })).toBe(state);
  expect(comparisonReducer(state, { type: 'received', run: { ...guarded, scenario_id: 'different' } }).phase).toBe('failed');
  const second = comparisonReducer(state, { type: 'received', run: guarded });
  expect(second.phase).toBe('without');
  expect(comparisonReducer(second, { type: 'failed' }).withGuard).toBe(guarded);
  for (const invalid of [guarded, { ...baseline, status: 'running' as const }, { ...baseline, status: 'failed' as const },
    { ...baseline, outcome: null }, { ...baseline, action: { ...baseline.action!, validation_status: 'invalid' as const } }]) {
    expect(presentBaseline(invalid).value).toBeNull();
  }
  expect(presentBaseline(baseline).text).toBe('Left');
});

test('live clean scene skips the baseline while keeping actual detected instructions and replay', async ({ page, request }) => {
  // Scene selection controls comparison only, never the backend classification.
  const guarded = { ...await backendRun(request), scenario_id: 'clean-navigation', runtime: 'prototype' as const };
  let posts = 0;
  await liveHealth(page);
  await page.route('**/api/run', route => {
    posts++;
    expect(requestGuard(route.request())).toBe(true);
    return route.fulfill({ json: guarded });
  });
  await prepareLive(page, 'uploaded_image', 'clean-navigation');
  await separate(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.decision-effect[data-disposition=ignore]')).toContainText('Ignore');
  await expect(page.locator('.decision-comparison')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Right' })).toBeVisible();
  await page.keyboard.press('r');
  await separate(page);
  await finish(page);
  expect(posts).toBe(1);
});
