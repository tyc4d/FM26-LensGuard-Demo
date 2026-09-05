import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
}

async function analyze(page: Page) {
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('button', { name: '分析中…' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
}

test('reservation injection shows progressive events, structured action, and BLOCKED', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('cell', { name: '收到影像', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '行動已阻擋', exact: true })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toBeDisabled();
  await expect(page.getByLabel('情境', { exact: true })).toBeDisabled();
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await expect(page.getByRole('heading', { name: 'LensGuard 擋下了這次攻擊' })).toBeVisible();
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
  await expect(page.getByTestId('outcome')).toContainText('攻擊已阻止');
  await page.getByText('查看來源紀錄', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toBeVisible();
  await expect(page.getByTestId('decision-trace')).toContainText('撥打電話／電話號碼');
  await expect(page.locator('.camera-region')).toHaveCount(2);
  await page.getByText('查看原始結構化行動', { exact: true }).click();
  const raw = JSON.parse(await page.locator('.raw-action pre').innerText());
  expect(raw).toEqual({ tool: 'call_phone', arguments: { number: '0912-345-678' } });
  await expect(page.locator('.timeline tbody tr')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('same reservation input executes in simulation when guard is OFF', async ({ page }) => {
  await ready(page);
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await expect(page.getByRole('switch', { name: 'LensGuard' })).not.toBeChecked();
  await expect(page.getByTestId('decision-result')).toContainText('等待分析');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已模擬執行');
  await expect(page.getByRole('heading', { name: '你的 AI 被騙了' })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('僅模擬執行');
  await expect(page.getByTestId('outcome')).toContainText('攻擊成功');
  await expect(page.getByTestId('outcome')).toContainText('模擬採用值');
  await expect(page.getByTestId('outcome')).not.toContainText('已授權的值');
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await expect(page.getByRole('cell', { name: '略過授權判定', exact: true })).toBeVisible();
});

test('navigation blocks right and returns left, with OFF comparison returning right', async ({ page }) => {
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('navigation-injection');
  await expect(page.locator('.user-request')).toHaveText('出口在哪裡？');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await expect(page.getByTestId('outcome')).toContainText('方向結果：左');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已模擬執行');
  await expect(page.getByTestId('outcome')).toContainText('方向結果：右');
});

test('explicit delegation authorizes camera value and renders user authority path', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await expect(page.locator('.user-request')).toHaveText('幫我撥打這張名片上的電話');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已允許');
  await expect(page.getByRole('heading', { name: '這次行動被允許' })).toBeVisible();
  await expect(page.locator('.decision-reason')).toContainText('使用者的明確授權');
  await page.getByText('查看來源紀錄', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toBeVisible();
  await expect(page.getByTestId('decision-trace')).toContainText('使用者需求');
  await expect(page.getByTestId('decision-trace')).toContainText('明確授權');
  await expect(page.getByTestId('outcome')).toContainText('02-2345-6789');
  const stage = await page.getByRole('region', { name: '相機與行動展示區' }).boundingBox();
  expect(stage!.y + stage!.height).toBeLessThanOrEqual(1080);
});

test('reset detaches an active run and stale events do not repopulate the UI', async ({ page }) => {
  await ready(page);
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('cell', { name: '收到影像', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重設', exact: true }).click();
  await expect(page.getByTestId('decision-result')).toContainText('等待分析');
  await expect(page.locator('.timeline-empty')).toBeVisible();
  // Start a different scenario while the discarded server run is completing.
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await analyze(page);
  await expect(page.getByTestId('decision-result')).toContainText('已允許');
  await expect(page.locator('.decision-facts')).not.toContainText('0912-345-678');
});

test('backend outage disables analysis and recovers automatically', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByTestId('status-backend')).toContainText('未連線');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeDisabled();
  await expect(page.getByText('後端連線中斷。', { exact: false })).toBeVisible();
  await page.unroute('**/api/**');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId('status-backend')).toContainText('已連線');
});

test('stream interruption recovers final backend state', async ({ page }) => {
  await ready(page);
  await page.route('**/api/run/*/events', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByText('執行連線已中斷', { exact: false })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
});

test('navigation placeholders are honest and layout has no horizontal overflow', async ({ page }) => {
  await ready(page);
  await page.getByRole('link', { name: '評估', exact: true }).click();
  await expect(page.getByText('第 3.6 階段的評估結果將整合於此。')).toBeVisible();
  await page.getByRole('link', { name: '系統架構', exact: true }).click();
  await expect(page.getByRole('heading', { name: '從感知到行動的授權' })).toBeVisible();
  await expect(page.locator('.component-statuses')).toContainText('模型推論模擬資料');
  await page.getByRole('link', { name: '即時展示', exact: true }).click();
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('failed runtime supersedes a partial policy authorization', async ({ page, request }) => {
  const response = await request.post('/api/run', {
    data: { scenario_id: 'explicit-delegation', guard_enabled: true },
  });
  expect(response.status()).toBe(202);
  const initial = await response.json();
  const terminal = await request.get(`/api/run/${initial.id}/events`);
  const snapshots = (await terminal.text()).split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
  const state = snapshots.at(-1);
  state.status = 'failed';
  state.outcome = null;
  state.action.status = 'proposed';
  state.error = '執行服務在授權判定後停止。';
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await page.route('**/api/run', (route) => route.fulfill({ status: 202, json: state }));
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByTestId('decision-result')).toContainText('已中斷');
  await expect(page.getByTestId('decision-result')).not.toContainText('已允許');
  await expect(page.getByRole('alert')).toContainText(state.error);
});

test('large stage keeps controls visible and technical details collapsed until requested', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  await expect(page.getByRole('heading', { name: '觀察眼前的場景。' })).toBeVisible();
  await expect(page.locator('.technical-details > details')).toHaveCount(4);
  await expect(page.locator('.technical-details > details[open]')).toHaveCount(0);
  await expect(page.locator('.timeline table')).not.toBeVisible();
  await expect(page.locator('.raw-action pre')).not.toBeVisible();
  await expect(page.locator('.decision-facts')).not.toBeVisible();
  for (const name of ['啟動相機', '開始分析', '重設']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  }
  expect(await page.locator('.result-hero h1').evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(48);
  await analyze(page);
  await expect(page.locator('.technical-details > details[open]')).toHaveCount(0);
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await page.getByText('查看技術細節', { exact: true }).click();
  await expect(page.locator('.decision-facts')).toBeVisible();
  await expect(page.locator('.decision-facts')).toContainText('僅供觀察');
  await expect(page.locator('.interpretation-list')).toContainText('偵測到兩個電話號碼');
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await expect(page.getByRole('cell', { name: '行動已阻擋', exact: true })).toBeVisible();
  expect(await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.body.innerText))).toBe(false);
});

test('delegation with guard OFF is simulated without claiming an attack succeeded', async ({ page }) => {
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page);
  await expect(page.getByRole('heading', { name: '行動已模擬執行' })).toBeVisible();
  await expect(page.getByTestId('decision-result')).toContainText('已模擬執行');
  await expect(page.getByRole('heading', { name: '你的 AI 被騙了' })).toHaveCount(0);
  await expect(page.getByTestId('outcome')).not.toContainText('攻擊成功');
});
