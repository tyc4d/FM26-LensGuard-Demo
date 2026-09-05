import { expect, test } from '@playwright/test';

test('incomplete reservation identifies missing details and keeps parser diagnostics collapsed', async ({ page }) => {
  const initial = { id: 'missing-reservation', runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: true,
    status: 'running', stage: 'queued', frame_id: null, regions: [], interpretation: [], action: null, decision: null,
    trace_nodes: [], trace_edges: [], outcome: null, events: [], error: null };
  const raw = '{"action":"RESTAURANT_RESERVATION","arguments":{"restaurant":"TACOS & TAPS","target_number":"02-2345-6789","time":"N/A","party_size":"N/A"}}';
  const parserError = "party_size Input should be a valid integer [input_value='N/A'] https://errors.pydantic.dev/2.13/v/int_type";
  const error = 'Reservation time is missing from the proposal. Party size is missing from the proposal. Check the user request, add the needed details, and analyze again.';
  const terminal = { ...initial, status: 'failed', stage: 'runtime.failed', error_code: 'reservation_details_missing', error,
    raw_model_text: raw, runtime_metadata: { output: { diagnostics: { schema_valid: false, error_message: parserError } } },
    validation_issues: [
      { argument: 'restaurant_reservation.time', kind: 'missing', message: 'Reservation time is missing from the proposal.' },
      { argument: 'restaurant_reservation.party_size', kind: 'missing', message: 'Party size is missing from the proposal.' },
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
  await page.getByLabel('Upload observation image').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await expect(page.getByRole('button', { name: 'Replace Image' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your request' }).fill('幫我打電話訂這間餐廳');
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('DETAILS REQUIRED');
  await expect(page.getByRole('heading', { name: '訂位資料尚未完整' })).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText('pydantic');
  await expect(page.getByRole('textbox', { name: 'Your request' })).toBeEnabled();
  await page.getByText('Show technical trace', { exact: true }).click();
  await expect(page.locator('.action-status')).toContainText('DETAILS REQUIRED');
  await expect(page.getByRole('list', { name: 'Action details to correct' })).toContainText('restaurant_reservation.time');
  await expect(page.getByRole('list', { name: 'Action details to correct' })).toContainText('restaurant_reservation.party_size');
  await expect(page.locator('.decision-facts')).toContainText('restaurant_reservation.time');
  await expect(page.locator('.decision-facts')).not.toContainText('restaurant_reservation.restaurant');
  await expect(page.getByText(parserError, { exact: false })).not.toBeVisible();
  await page.getByText('Parser and mapping diagnostics', { exact: true }).click();
  await expect(page.getByText(parserError, { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your request' }).fill('幫我訂這間餐廳，2026-09-06 晚上 7 點，4 位。');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('decision-result')).toContainText('PENDING');
  await expect(page.getByRole('button', { name: 'Replace Image' })).toBeVisible();
});
