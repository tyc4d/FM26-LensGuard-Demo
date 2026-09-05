import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
}

async function analyze(page: Page) {
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Analyzing…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
}

test('reservation injection shows progressive events, structured action, and BLOCKED', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.getByText('Show event timeline', { exact: false }).click();
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByRole('cell', { name: 'frame.received', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'action.blocked', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toBeDisabled();
  await expect(page.getByLabel('Scenario', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED');
  await expect(page.getByRole('heading', { name: 'LensGuard 擋下了這次攻擊' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
  await expect(page.getByTestId('outcome')).toContainText('Prevented');
  await page.getByText('Show provenance trace', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toBeVisible();
  await expect(page.getByTestId('decision-trace')).toContainText('call_phone.number');
  await expect(page.locator('.camera-region')).toHaveCount(2);
  await page.getByText('Show raw structured action', { exact: true }).click();
  const raw = JSON.parse(await page.locator('.raw-action pre').innerText());
  expect(raw).toEqual({ tool: 'call_phone', arguments: { number: '0912-345-678' } });
  await expect(page.locator('.timeline tbody tr')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('same reservation input executes in simulation when guard is OFF', async ({ page }) => {
  await ready(page);
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await expect(page.getByRole('switch', { name: 'LensGuard' })).not.toBeChecked();
  await expect(page.getByTestId('decision-result')).toContainText('PENDING');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('EXECUTED');
  await expect(page.getByRole('heading', { name: '你的 AI 被騙了' })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('Simulation only');
  await expect(page.getByTestId('outcome')).toContainText('Successful');
  await expect(page.getByTestId('outcome')).toContainText('Simulated value');
  await expect(page.getByTestId('outcome')).not.toContainText('Authorized value');
  await page.getByText('Show event timeline', { exact: false }).click();
  await expect(page.getByRole('cell', { name: 'policy.bypassed', exact: true })).toBeVisible();
});

test('navigation blocks right and returns left, with OFF comparison returning right', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Scenario', { exact: true }).selectOption('navigation-injection');
  await expect(page.locator('.user-request')).toHaveText('出口在哪裡？');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED');
  await expect(page.getByTestId('outcome')).toContainText('Navigation result: left');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('EXECUTED');
  await expect(page.getByTestId('outcome')).toContainText('Navigation result: right');
});

test('explicit delegation authorizes camera value and renders user authority path', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  await page.getByLabel('Scenario', { exact: true }).selectOption('explicit-delegation');
  await expect(page.locator('.user-request')).toHaveText('幫我撥打這張名片上的電話');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('ALLOWED');
  await expect(page.getByRole('heading', { name: '這次行動被允許' })).toBeVisible();
  await expect(page.locator('.decision-reason')).toContainText('Explicit user delegation permits');
  await page.getByText('Show provenance trace', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toBeVisible();
  await expect(page.getByTestId('decision-trace')).toContainText('USER REQUEST');
  await expect(page.getByTestId('decision-trace')).toContainText('delegation');
  await expect(page.getByTestId('outcome')).toContainText('02-2345-6789');
  const stage = await page.getByRole('region', { name: 'Camera and action stage' }).boundingBox();
  expect(stage!.y + stage!.height).toBeLessThanOrEqual(1080);
});

test('reset detaches an active run and stale events do not repopulate the UI', async ({ page }) => {
  await ready(page);
  await page.getByText('Show event timeline', { exact: false }).click();
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByRole('cell', { name: 'frame.received', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('decision-result')).toContainText('PENDING');
  await expect(page.locator('.timeline-empty')).toBeVisible();
  // Start a different scenario while the discarded server run is completing.
  await page.getByLabel('Scenario', { exact: true }).selectOption('explicit-delegation');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('ALLOWED');
  await expect(page.locator('.decision-facts')).not.toContainText('0912-345-678');
});

test('backend outage disables analysis and recovers automatically', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByTestId('status-backend')).toContainText('DISCONNECTED');
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeDisabled();
  await expect(page.getByText('Backend disconnected.', { exact: false })).toBeVisible();
  await page.unroute('**/api/**');
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId('status-backend')).toContainText('CONNECTED');
});

test('stream interruption recovers final backend state', async ({ page }) => {
  await ready(page);
  await page.route('**/api/run/*/events', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByText('Runtime connection interrupted.', { exact: false })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
});

test('navigation placeholders are honest and layout has no horizontal overflow', async ({ page }) => {
  await ready(page);
  await page.getByRole('link', { name: 'Evaluation', exact: true }).click();
  await expect(page.getByText('Phase 3.6 evaluation results will be integrated here.')).toBeVisible();
  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sensor-to-action authorization' })).toBeVisible();
  await expect(page.locator('.component-statuses')).toContainText('VLM inferenceMOCK');
  await page.getByRole('link', { name: 'Live Demo', exact: true }).click();
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('failed runtime supersedes a partial policy authorization', async ({ page, request }) => {
  const response = await request.post('http://127.0.0.1:8000/api/run', {
    data: { scenario_id: 'explicit-delegation', guard_enabled: true },
  });
  const initial = await response.json();
  const terminal = await request.get(`http://127.0.0.1:8000/api/run/${initial.id}/events`);
  const snapshots = (await terminal.text()).split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
  const state = snapshots.at(-1);
  state.status = 'failed';
  state.outcome = null;
  state.action.status = 'proposed';
  state.error = 'The runtime stopped after policy evaluation.';
  await ready(page);
  await page.getByLabel('Scenario', { exact: true }).selectOption('explicit-delegation');
  await page.route('**/api/run', (route) => route.fulfill({ status: 202, json: state }));
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('INTERRUPTED');
  await expect(page.getByTestId('decision-result')).not.toContainText('ALLOWED');
  await expect(page.getByRole('alert')).toContainText(state.error);
});

test('large stage keeps controls visible and technical details collapsed until requested', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Observe the scene.' })).toBeVisible();
  await expect(page.locator('.technical-details > details')).toHaveCount(4);
  await expect(page.locator('.technical-details > details[open]')).toHaveCount(0);
  await expect(page.locator('.timeline table')).not.toBeVisible();
  await expect(page.locator('.raw-action pre')).not.toBeVisible();
  await expect(page.locator('.decision-facts')).not.toBeVisible();
  for (const name of ['Start Camera', 'Run Analysis', 'Reset']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  }
  expect(await page.locator('.result-hero h1').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(48);
  await analyze(page);
  await expect(page.locator('.technical-details > details[open]')).toHaveCount(0);
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED');
  await page.getByText('Show technical trace', { exact: true }).click();
  await expect(page.locator('.decision-facts')).toBeVisible();
  await expect(page.locator('.decision-facts')).toContainText('OBSERVATION_ONLY');
  await expect(page.locator('.interpretation-list')).toContainText('Two phone numbers detected');
  await page.getByText('Show event timeline', { exact: false }).click();
  await expect(page.getByRole('cell', { name: 'action.blocked', exact: true })).toBeVisible();
  expect(await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.body.innerText))).toBe(false);
});

test('delegation with guard OFF is simulated without claiming an attack succeeded', async ({ page }) => {
  await ready(page);
  await page.getByLabel('Scenario', { exact: true }).selectOption('explicit-delegation');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page);
  await expect(page.getByRole('heading', { name: '行動已模擬執行' })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('EXECUTED');
  await expect(page.getByRole('heading', { name: '你的 AI 被騙了' })).toHaveCount(0);
  await expect(page.getByTestId('outcome')).not.toContainText('Successful');
});
