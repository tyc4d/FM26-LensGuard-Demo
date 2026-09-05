import { expect, test, type Page, type Request } from '@playwright/test';
import type { RunState } from '../src/types';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function runState(id: string): RunState {
  return {
    id, runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: true,
    status: 'running', stage: 'queued', frame_id: null, regions: [], interpretation: [],
    action: null, decision: null, trace_nodes: [], trace_edges: [], outcome: null, events: [], error: null,
  };
}

function failedRun(id: string): RunState {
  return {
    ...runState(id), status: 'failed', stage: 'runtime.failed', error_code: 'model_output_parse_failed',
    error: 'Model output could not be parsed.', raw_model_text: `Raw output for ${id}`,
    events: [{ id: `${id}:1`, timestamp: new Date().toISOString(), type: 'runtime.failed', detail: 'Model output could not be parsed.' }],
  };
}

function multipartRequest(request: Request) {
  expect(request.headers()['content-type']).toContain('multipart/form-data');
  const field = request.postDataBuffer()!.toString('utf8').match(/name="user_request"\r\n\r\n([\s\S]*?)\r\n--/);
  expect(field).not.toBeNull();
  return field![1];
}

async function ready(page: Page, runtime: 'prototype' | 'mock' = 'prototype') {
  await page.route('**/api/health', route => route.fulfill({ json: {
    status: 'ok', runtime, model: runtime === 'prototype' ? 'unloaded' : 'mock',
    ...(runtime === 'prototype' ? { prototype: { status: 'unloaded', model_loaded: false } } : {}),
  } }));
  await page.goto('/');
  if (runtime === 'prototype') await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeDisabled();
  else await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
}

async function uploadObservation(page: Page) {
  const data = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await page.getByLabel('Upload observation image').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.getByRole('img', { name: 'Uploaded observation: scene.png' })).toBeVisible();
}

test('edited request is submitted unchanged, locked during analysis, and editable for retry', async ({ page }) => {
  const customRequest = '  幫我訂這間餐廳，2026 年 9 月 6 日晚上 7 點，4 位。  ';
  const phoneRequest = '只撥打這間餐廳的電話，不要建立訂位。';
  const requests: string[] = [];
  const accept = deferred();
  const finish = deferred();
  let streamRequests = 0;
  const initial = runState('custom-request');
  const terminal = failedRun(initial.id);
  await page.route('**/api/run', async route => {
    requests.push(multipartRequest(route.request()));
    if (requests.length === 1) {
      await accept.promise;
      await route.fulfill({ status: 202, json: initial });
    } else {
      await route.fulfill({ status: 202, json: failedRun('phone-request') });
    }
  });
  await page.route(`**/api/run/${initial.id}`, route => route.fulfill({ json: initial }));
  await page.route(`**/api/run/${initial.id}/events`, async route => {
    streamRequests++;
    await finish.promise;
    await route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\nid: ${initial.id}:1\ndata: ${JSON.stringify(terminal)}\n\n` });
  });
  await ready(page);
  const editor = page.getByRole('textbox', { name: 'Your request' });
  await expect(editor).toHaveValue('');
  await uploadObservation(page);
  await editor.fill(customRequest);
  await expect(page.locator('.user-request')).toHaveJSProperty('textContent', customRequest);
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  try {
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toBe(customRequest);
    await expect(editor).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Clear request' })).toBeDisabled();
    accept.resolve();
    await expect.poll(() => streamRequests).toBe(1);
    await expect(editor).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
    await expect(page.locator('.user-request')).toHaveJSProperty('textContent', customRequest);
  } finally {
    accept.resolve();
    finish.resolve();
  }
  await expect(page.getByRole('alert')).toContainText(terminal.error!);
  await expect(editor).toBeEnabled();
  await page.getByText('Show technical trace', { exact: true }).click();
  await expect(page.getByText(terminal.raw_model_text!, { exact: true })).toBeVisible();
  await editor.fill(phoneRequest);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(terminal.raw_model_text!, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('decision-result')).toContainText('PENDING');
  await expect(page.locator('.action-expression')).toHaveText('Awaiting analysis.');
  await expect(page.locator('.user-request')).toHaveText(phoneRequest);
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toBe(phoneRequest);
  await expect(page.getByText('Raw output for phone-request', { exact: true })).toBeVisible();
});

test('scenario drafts stay independent and preserve exact delegation defaults until edited', async ({ page }) => {
  const reservationRequest = '請幫我訂明天晚上 7 點的座位，4 位。';
  const navigationRequest = '請指出圖片中的出口方向。';
  const delegationRequest = '幫我撥打這張名片上的電話';
  const requests: string[] = [];
  await page.route('**/api/run', route => {
    requests.push(multipartRequest(route.request()));
    return route.fulfill({ status: 202, json: { ...failedRun('delegation-request'), scenario_id: 'explicit-delegation' } });
  });
  await ready(page);
  const editor = page.getByRole('textbox', { name: 'Your request' });
  const selector = page.getByLabel('Scenario', { exact: true });
  await editor.fill(reservationRequest);
  await selector.selectOption('navigation-injection');
  await expect(editor).toHaveValue('出口在哪裡？');
  await editor.fill(navigationRequest);
  await selector.selectOption('explicit-delegation');
  await expect(editor).toHaveValue(delegationRequest);
  await expect(page.locator('.user-request')).toHaveText(delegationRequest);
  await expect(page.getByRole('button', { name: 'Use scenario default' })).toBeDisabled();
  await uploadObservation(page);
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toBe(delegationRequest);
  await expect(editor).toBeEnabled();
  await selector.selectOption('reservation-injection');
  await expect(editor).toHaveValue(reservationRequest);
  await editor.fill('');
  await selector.selectOption('navigation-injection');
  await expect(editor).toHaveValue(navigationRequest);
  await selector.selectOption('reservation-injection');
  await expect(editor).toHaveValue('');
  await expect(page.locator('.user-request')).toHaveJSProperty('textContent', '');
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeDisabled();
  await editor.fill(reservationRequest);
  await page.getByRole('button', { name: 'Clear request' }).click();
  await expect(editor).toHaveValue('');
  await selector.selectOption('navigation-injection');
  await expect(editor).toHaveValue(navigationRequest);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(editor).toHaveValue(navigationRequest);
});

test('blank requests cannot submit and the editor fits a phone viewport', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/run', route => { posts++; return route.fulfill({ status: 500 }); });
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const editor = page.getByRole('textbox', { name: 'Your request' });
  await editor.fill('  \n ');
  await expect(editor).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeDisabled();
  await expect(page.locator('#user-request-help')).toContainText('Enter a request before running analysis.');
  expect(posts).toBe(0);
  await editor.fill('Please show the phone number.\n' + 'A'.repeat(300));
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reset permits a new draft while a discarded response cannot restore the old request', async ({ page }) => {
  const oldRequest = '請幫我訂這間餐廳的位子。';
  const newRequest = '只撥打電話，不要建立訂位。';
  const release = deferred();
  const requests: string[] = [];
  const stale = failedRun('discarded-request');
  await page.route('**/api/run', async route => {
    requests.push(multipartRequest(route.request()));
    await release.promise;
    await route.fulfill({ status: 202, json: stale });
  });
  await ready(page);
  await uploadObservation(page);
  const editor = page.getByRole('textbox', { name: 'Your request' });
  await editor.fill(oldRequest);
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  try {
    await expect.poll(() => requests.length).toBe(1);
    await expect(editor).toBeDisabled();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(editor).toHaveValue(oldRequest);
    await editor.fill(newRequest);
    const response = page.waitForResponse('**/api/run');
    release.resolve();
    await (await response).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page.locator('.user-request')).toHaveText(newRequest);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(stale.raw_model_text!, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('decision-result')).toContainText('PENDING');
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
  } finally {
    release.resolve();
  }
});

test('mock scenarios retain fixed requests and JSON submissions without an editor', async ({ page }) => {
  const posts: unknown[] = [];
  await page.route('**/api/run', route => {
    expect(route.request().headers()['content-type']).toContain('application/json');
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 202, json: { ...failedRun('mock-request'), runtime: 'mock', scenario_id: 'explicit-delegation' } });
  });
  await ready(page, 'mock');
  await expect(page.getByRole('textbox', { name: 'Your request' })).toHaveCount(0);
  await expect(page.locator('.user-request')).toHaveText('幫我打電話訂這間餐廳');
  await page.getByLabel('Scenario', { exact: true }).selectOption('explicit-delegation');
  await expect(page.locator('.user-request')).toHaveText('幫我撥打這張名片上的電話');
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ scenario_id: 'explicit-delegation', guard_enabled: true });
});
