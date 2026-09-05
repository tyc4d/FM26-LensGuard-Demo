import { expect, test, type Page, type Request } from '@playwright/test';
import type { RunState } from '../src/types';
import { closeDetails, finishStory, openTechnical } from './presentation-helpers';

const query = '  請撥打眼前餐廳的電話，不要建立訂位。  ';

function pendingRun(id: string, guardEnabled = true): RunState {
  return {
    id, runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: guardEnabled,
    status: 'running', stage: 'inference.started', frame_id: `frame-${id}`,
    regions: [], interpretation: [], action: null, decision: null, outcome: null,
    trace_nodes: [], trace_edges: [], error: null,
    events: [{ id: `${id}:1`, type: 'inference.started', timestamp: new Date().toISOString(), detail: '正在執行本機模型。' }],
  };
}

function completedRun(id: string, guardEnabled = true): RunState {
  const status = guardEnabled ? 'blocked' : 'executed';
  return {
    ...pendingRun(id, guardEnabled), status: 'completed', stage: `action.${status}`,
    raw_model_text: '{"action":"CALL","arguments":{"target_number":"0912-345-678"}}',
    action: {
      id: `${id}-action`, tool: 'call_phone', status, validation_status: 'valid',
      arguments: { number: { id: `${id}-number`, value: '0912-345-678', source_type: 'model',
        source_id: id, trust: 'untrusted', authority: ['none'], lineage: ['image_upload', id] } },
    },
    decision: guardEnabled ? {
      result: 'block', rule_id: 'test.call.requires_authority', affected_argument: 'call_phone.number',
      reason: '這個電話號碼尚未取得本次行動所需的授權。',
      source_authority: 'OBSERVATION_ONLY', required_authority: 'EXTERNAL_ACTION_TARGET',
    } : null,
    outcome: { status, simulation_only: true, attack_success: null, result: null,
      detail: guardEnabled ? '已阻擋未獲授權的模擬撥號。' : '已略過防護，僅模擬執行撥號。' },
    trace_nodes: [
      { id: 'input', label: 'IMAGE', type: 'uploaded_image input', source: 'camera' },
      { id: 'model', label: 'LOCAL VLM', type: 'real inference', source: 'model' },
      { id: 'value', label: '0912-345-678', type: 'model-derived; unverified', source: 'model' },
      { id: 'argument', label: 'call_phone.number', type: 'action argument', source: 'model' },
    ],
    trace_edges: [{ from: 'input', to: 'model' }, { from: 'model', to: 'value' }, { from: 'value', to: 'argument' }],
    events: [
      { id: `${id}:1`, type: 'inference.completed', timestamp: new Date().toISOString(), detail: '已收到模型輸出。' },
      { id: `${id}:2`, type: guardEnabled ? 'policy.evaluated' : 'policy.bypassed', timestamp: new Date().toISOString(), detail: guardEnabled ? '授權檢查已完成。' : '本次略過授權。' },
      { id: `${id}:3`, type: `action.${status}`, timestamp: new Date().toISOString(), detail: '本次分析已完成。' },
    ],
  };
}

async function prepare(page: Page) {
  await page.route('**/api/health', route => route.fulfill({ json: {
    status: 'ok', runtime: 'prototype', model: 'live', prototype: { status: 'ready', model_loaded: true },
  } }));
  await page.goto('/');
  await page.getByRole('textbox', { name: '你的請求' }).fill(query);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f7f5ed'; context.fillRect(0, 0, 480, 320);
    context.fillStyle = '#20322b'; context.font = '30px sans-serif';
    context.fillText('ABC Bistro', 35, 100); context.fillText('0912-345-678', 35, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'cinematic.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：cinematic.png', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '開始分析', exact: false })).toBeEnabled();
}

async function keyboard(page: Page, key: string) {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.keyboard.press(key);
}

async function stepTo(page: Page, phase: string) {
  const stage = page.locator('.story-stage');
  for (let step = 0; step < 12; step++) {
    if (await stage.getAttribute('data-phase') === phase) return;
    await page.getByRole('button', { name: '下一步', exact: true }).click();
  }
  await expect(stage).toHaveAttribute('data-phase', phase);
}

function capturedInput(request: Request) {
  const contentType = request.headers()['content-type'];
  expect(contentType).toContain('multipart/form-data');
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  expect(boundary).not.toBeNull();
  const body = request.postDataBuffer()!;
  const marker = Buffer.from('name="image"; filename="frame.jpg"\r\nContent-Type: image/jpeg\r\n\r\n');
  const offset = body.indexOf(marker);
  expect(offset).toBeGreaterThanOrEqual(0);
  const start = offset + marker.length;
  const end = body.indexOf(Buffer.from(`\r\n--${boundary![1] || boundary![2]}`), start);
  expect(end).toBeGreaterThan(start);
  const jpeg = body.subarray(start, end);
  expect(jpeg.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  const field = (name: string) => {
    const match = body.toString('utf8').match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
    expect(match).not.toBeNull();
    return match![1];
  };
  return { jpeg, query: field('user_request'), guard: field('guard_enabled'), source: field('source'), captureMs: field('capture_ms') };
}

test('keyboard pause survives late SSE; arrows and replay only present cached data', async ({ page }) => {
  await page.clock.install();
  const initial = pendingRun('late-keyboard');
  const terminal = completedRun(initial.id);
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let posts = 0;
  let streams = 0;
  let released = false;
  await page.route('**/api/run', route => { posts++; return route.fulfill({ status: 202, json: initial }); });
  await page.route(`**/api/run/${initial.id}`, route => route.fulfill({ json: released ? terminal : initial }));
  await page.route(`**/api/run/${initial.id}/events`, async route => {
    streams++;
    await gate;
    await route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\nid: ${initial.id}:3\ndata: ${JSON.stringify(terminal)}\n\n` });
  });
  await prepare(page);
  const stage = page.locator('.story-stage');
  await page.getByRole('button', { name: '開始分析' }).click();
  try {
    await expect.poll(() => streams).toBe(1);
    await expect(stage).toHaveAttribute('data-phase', 'capture');
    await expect(stage).toHaveAttribute('data-playing', 'true');
    await keyboard(page, 'Space');
    await expect(stage).toHaveAttribute('data-playing', 'false');
    await keyboard(page, 'ArrowRight');
    await expect(stage).toHaveAttribute('data-phase', 'perception');
    await keyboard(page, 'ArrowLeft');
    await expect(stage).toHaveAttribute('data-phase', 'capture');
    await keyboard(page, 'ArrowRight');
    released = true; finish();
    await expect(page.getByRole('button', { name: '重播', exact: true })).toBeEnabled();
    await page.clock.fastForward(6000);
    await expect(stage).toHaveAttribute('data-phase', 'perception');
    await expect(stage).toHaveAttribute('data-playing', 'false');
    await keyboard(page, 'Space');
    await expect(stage).toHaveAttribute('data-playing', 'true');
    await page.clock.fastForward(2100);
    await expect(stage).toHaveAttribute('data-phase', 'semantic');
    await keyboard(page, 'Space');
    await expect(stage).toHaveAttribute('data-playing', 'false');
    await openTechnical(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('r');
    await expect(stage).toHaveAttribute('data-phase', 'semantic');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await keyboard(page, 'r');
    await expect(stage).toHaveAttribute('data-phase', 'capture');
    await expect(page.getByText(/重播已取得的分析結果/)).toBeVisible();
    expect(posts).toBe(1);
  } finally { released = true; finish(); }
});

test('reduced motion starts manually and the terminal result stays on screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  let posts = 0;
  await page.route('**/api/run', route => { posts++; return route.fulfill({ status: 202, json: completedRun('manual') }); });
  await prepare(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  const stage = page.locator('.story-stage');
  await expect(page.getByRole('button', { name: '重播', exact: true })).toBeEnabled();
  await expect(stage).toHaveAttribute('data-phase', 'capture');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await page.clock.fastForward(10_000);
  await expect(stage).toHaveAttribute('data-phase', 'capture');
  await finishStory(page);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(page.locator('.story-final')).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '播放展示', exact: true })).toBeDisabled();
  await keyboard(page, 'Space');
  await page.clock.fastForward(30_000);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  expect(posts).toBe(1);
});

test('automatic terminal impact completes once and can be paused without losing the result', async ({ page }) => {
  await page.clock.install();
  let posts = 0;
  await page.route('**/api/run', route => { posts++; return route.fulfill({ status: 202, json: completedRun('terminal-impact') }); });
  await prepare(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  const stage = page.locator('.story-stage');
  await expect(page.getByRole('button', { name: '重播', exact: true })).toBeEnabled();
  await keyboard(page, 'Space');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await stepTo(page, 'authorization');

  await keyboard(page, 'Space');
  await page.clock.fastForward(2100);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'true');
  const final = page.locator('.story-final');
  await expect.poll(() => final.evaluate(element => element.getAnimations().some(animation =>
    animation instanceof CSSAnimation && animation.animationName === 'story-focus-enter' && animation.playState === 'running'
  ))).toBe(true);
  // CSS animationend, rather than another presentation step, settles the impact.
  await expect(stage).toHaveAttribute('data-playing', 'false', { timeout: 4000 });
  await expect(final).toHaveCSS('opacity', '1');
  await expect(final).toHaveCSS('transform', 'none');
  await page.clock.fastForward(20_000);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await expect(page.getByRole('button', { name: '播放展示', exact: true })).toBeDisabled();

  await keyboard(page, 'ArrowLeft');
  await expect(stage).toHaveAttribute('data-phase', 'authorization');
  await keyboard(page, 'Space');
  await page.clock.fastForward(2100);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'true');
  await keyboard(page, 'Space');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  await expect(final).toHaveCSS('opacity', '1');
  await expect(final).toHaveCSS('transform', 'none');
  await page.clock.fastForward(20_000);
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'false');

  await keyboard(page, 'ArrowLeft');
  await keyboard(page, 'ArrowRight');
  await expect(stage).toHaveAttribute('data-phase', 'blocked');
  await expect(stage).toHaveAttribute('data-playing', 'false');
  expect(await final.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
  expect(posts).toBe(1);
});

test('comparison reuses identical JPEG and query for both guard states, then replays without POSTs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const inputs: ReturnType<typeof capturedInput>[] = [];
  await page.route('**/api/run', route => {
    const input = capturedInput(route.request()); inputs.push(input);
    return route.fulfill({ status: 202, json: completedRun(`comparison-${inputs.length}`, input.guard === 'true') });
  });
  await prepare(page);
  await page.getByRole('button', { name: '建立防護比較', exact: false }).click();
  await expect.poll(() => inputs.length).toBe(2);
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toBeEnabled();
  expect(inputs.map(input => input.guard)).toEqual(['false', 'true']);
  expect(inputs.map(input => input.query)).toEqual([query, query]);
  expect(inputs.map(input => input.source)).toEqual(['uploaded_image', 'uploaded_image']);
  expect(inputs[1].jpeg).toEqual(inputs[0].jpeg);
  expect(inputs[1].captureMs).toBe(inputs[0].captureMs);
  await expect(page.locator('.story-query p')).toHaveJSProperty('textContent', query);
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toHaveAttribute('aria-checked', 'false');
  await stepTo(page, 'executed');
  await expect(page.locator('.story-final')).toHaveAttribute('data-result', 'executed');
  await page.getByRole('button', { name: /接著看同一份輸入開啟防護後的結果/ }).click();
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toHaveAttribute('aria-checked', 'true');
  await stepTo(page, 'blocked');
  await expect(page.getByRole('region', { name: '防護比較結果' })).toBeVisible();
  await page.getByRole('button', { name: /重播比較/ }).click();
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'capture');
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toHaveAttribute('aria-checked', 'false');
  await stepTo(page, 'executed');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await stepTo(page, 'blocked');
  expect(inputs).toHaveLength(2);
});

test('an invalid model proposal ends as failure without a block or allow result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const failed: RunState = {
    ...completedRun('invalid'), status: 'failed', stage: 'runtime.failed',
    action: { ...completedRun('invalid').action!, status: 'proposed', validation_status: 'invalid' },
    decision: null, outcome: null, error_code: 'model_schema_invalid', error: '模型提議的行動參數格式無效。',
    events: [{ id: 'invalid:1', type: 'runtime.failed', timestamp: new Date().toISOString(), detail: '模型提議的行動參數格式無效。' }],
  };
  await page.route('**/api/run', route => route.fulfill({ status: 202, json: failed }));
  await prepare(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('alert')).toContainText(failed.error!);
  await finishStory(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'failed');
  await expect(page.locator('.story-final')).toHaveAttribute('data-result', 'failed');
  await expect(page.locator('.story-final[data-result="blocked"], .story-final[data-result="allowed"]')).toHaveCount(0);
  await expect(page.locator('.story-final h2')).toContainText('這次沒有執行行動');
  await openTechnical(page);
  await expect(page.getByTestId('decision-result')).toContainText('模型輸出無效');
  await expect(page.getByTestId('outcome')).toHaveCount(0);
  await closeDetails(page);
});
