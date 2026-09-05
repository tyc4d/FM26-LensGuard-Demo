import { expect, test } from '@playwright/test';

test('incomplete reservation identifies missing details and keeps parser diagnostics collapsed', async ({ page }) => {
  const initial = { id: 'missing-reservation', runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: true,
    status: 'running', stage: 'queued', frame_id: null, regions: [], interpretation: [], action: null, decision: null,
    trace_nodes: [], trace_edges: [], outcome: null, events: [], error: null };
  const raw = '{"action":"RESTAURANT_RESERVATION","arguments":{"restaurant":"TACOS & TAPS","target_number":"02-2345-6789","time":"N/A","party_size":"N/A"}}';
  const parserError = "party_size Input should be a valid integer [input_value='N/A'] https://errors.pydantic.dev/2.13/v/int_type";
  const error = '提議中缺少訂位時間。 提議中缺少用餐人數。 請檢查使用者需求並補齊資料，再重新分析。';
  const terminal = { ...initial, status: 'failed', stage: 'runtime.failed', error_code: 'reservation_details_missing', error,
    raw_model_text: raw, runtime_metadata: { output: { diagnostics: { schema_valid: false, error_message: parserError } } },
    validation_issues: [
      { argument: 'restaurant_reservation.time', kind: 'missing', message: '提議中缺少訂位時間。' },
      { argument: 'restaurant_reservation.party_size', kind: 'missing', message: '提議中缺少用餐人數。' },
    ],
    action: { id: 'candidate', tool: 'restaurant_reservation', status: 'proposed', validation_status: 'invalid',
      arguments: Object.fromEntries(Object.entries({ restaurant: 'TACOS & TAPS', number: '02-2345-6789', time: 'N/A', party_size: 'N/A' })
        .map(([key, value]) => [key, { id: key, value, source_type: 'model', source_id: 'infer-test', trust: 'untrusted', authority: ['none'], lineage: [] }])) },
    events: [{ id: 'missing-reservation:1', timestamp: new Date().toISOString(), type: 'runtime.failed', detail: error }],
  };
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'live', prototype: { status: 'ready', model_loaded: true } } }));
  await page.route('**/api/run', route => route.fulfill({ status: 202, json: initial }));
  await page.route('**/api/run/missing-reservation/events', route => route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\nid: missing-reservation:1\ndata: ${JSON.stringify(terminal)}\n\n` }));
  await page.goto('/');
  const image = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('button', { name: '更換圖片' })).toBeVisible();
  await page.getByRole('textbox', { name: '你的請求' }).fill('幫我打電話訂這間餐廳');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('需要補充資料');
  await expect(page.getByRole('heading', { name: '訂位資料尚未完整' })).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText('pydantic');
  await expect(page.getByRole('textbox', { name: '你的請求' })).toBeEnabled();
  await page.getByText('查看技術細節', { exact: true }).click();
  await expect(page.locator('.action-status')).toContainText('需要補充資料');
  await expect(page.getByRole('list', { name: '待修正的行動資料' })).toContainText('餐廳訂位／訂位時間');
  await expect(page.getByRole('list', { name: '待修正的行動資料' })).toContainText('餐廳訂位／用餐人數');
  await expect(page.locator('.decision-facts')).toContainText('餐廳訂位／訂位時間');
  await expect(page.locator('.decision-facts')).not.toContainText('餐廳訂位／餐廳');
  await expect(page.getByText(parserError, { exact: false })).not.toBeVisible();
  await page.getByText('解析與對應診斷', { exact: true }).click();
  await expect(page.getByText(parserError, { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: '你的請求' }).fill('幫我訂這間餐廳，2026-09-06 晚上 7 點，4 位。');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('decision-result')).toContainText('等待分析');
  await expect(page.getByRole('button', { name: '更換圖片' })).toBeVisible();
});
