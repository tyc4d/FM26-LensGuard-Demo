import { expect, test, type Page } from '@playwright/test';
import { closeDetails, finishStory, openDetails, openTechnical } from './presentation-helpers';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
}
async function analyze(page: Page) {
  await page.getByRole('button', { name: '開始分析' }).click();
  await finishStory(page);
}

test('reservation shows progressive backend events, then a held BLOCK stage and inspectable raw action', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toBeDisabled();
  await expect(page.getByLabel('情境', { exact: true })).toBeDisabled();
  await openDetails(page);
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await expect(page.getByRole('cell', { name: '收到影像', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '行動已阻擋', exact: true })).toHaveCount(0);
  await expect(page.locator('.timeline tbody tr')).toHaveCount(7);
  await finishStory(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'blocked');
  await expect(page.locator('.story-final')).toContainText('行動被攔下');
  await expect(page.getByRole('button', { name: '播放展示' })).toBeDisabled();
  await openTechnical(page);
  await expect(page.getByTestId('decision-result')).toContainText('已阻擋');
  await expect(page.getByTestId('outcome')).toContainText('攻擊已阻止');
  await page.getByText('查看來源紀錄', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toContainText('撥打電話／電話號碼');
  await page.getByText('查看原始結構化行動', { exact: true }).click();
  expect(JSON.parse(await page.locator('.raw-action pre').innerText())).toEqual({ tool: 'call_phone', arguments: { number: '0912-345-678' } });
  expect(errors).toEqual([]);
});

test('same reservation executes only in simulation with guard OFF', async ({ page }) => {
  await ready(page); await analyze(page);
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'idle');
  await analyze(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'executed');
  await expect(page.locator('.story-final')).toContainText('模擬執行');
  await openTechnical(page);
  await expect(page.getByTestId('outcome')).toContainText('攻擊成功');
  await expect(page.getByTestId('outcome')).toContainText('模擬採用值');
  await expect(page.getByTestId('outcome')).not.toContainText('已授權的值');
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await expect(page.getByRole('cell', { name: '略過授權判定', exact: true })).toBeVisible();
});

test('navigation preserves actual left result versus unguarded right result', async ({ page }) => {
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('navigation-injection');
  await expect(page.locator('.story-setup .user-request')).toContainText('出口在哪裡？');
  await analyze(page); await openTechnical(page);
  await expect(page.getByTestId('outcome')).toContainText('方向結果：左');
  await closeDetails(page);
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page); await openTechnical(page);
  await expect(page.getByTestId('outcome')).toContainText('方向結果：右');
});

test('explicit delegation ALLOW retains user authority and authorized value', async ({ page }) => {
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await analyze(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'allowed');
  await expect(page.locator('.story-final')).toContainText('授權成立');
  await openTechnical(page);
  await expect(page.getByTestId('decision-result')).toContainText('已允許');
  await expect(page.locator('.decision-reason')).toContainText('使用者的明確授權');
  await page.getByText('查看來源紀錄', { exact: true }).click();
  await expect(page.getByTestId('decision-trace')).toContainText('使用者需求');
  await expect(page.getByTestId('decision-trace')).toContainText('明確授權');
  await expect(page.getByTestId('outcome')).toContainText('02-2345-6789');
});

test('reset detaches active run and stale events never enter a different scenario', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: '開始分析' }).click();
  await openDetails(page);
  await page.getByText('查看事件時間軸', { exact: false }).click();
  await expect(page.getByRole('cell', { name: '收到影像', exact: true })).toBeVisible();
  await closeDetails(page);
  await page.getByRole('button', { name: '重設', exact: true }).click();
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'idle');
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await analyze(page); await openTechnical(page);
  await expect(page.getByTestId('decision-result')).toContainText('已允許');
  await expect(page.locator('.decision-facts')).not.toContainText('0912-345-678');
});

test('outage disables analysis and automatically recovers', async ({ page }) => {
  await page.route('**/api/**', route => route.abort('connectionrefused'));
  await page.goto('/');
  await expect(page.getByTestId('status-backend')).toContainText('未連線');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeDisabled();
  await expect(page.getByText('後端連線中斷', { exact: false })).toBeVisible();
  await page.unroute('**/api/**');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled({ timeout: 10_000 });
});

test('SSE interruption recovers backend final state without a fabricated result', async ({ page }) => {
  await ready(page);
  await page.route('**/api/run/*/events', route => route.abort('connectionrefused'));
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByText('執行連線已中斷', { exact: false })).toBeVisible();
  await finishStory(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'blocked');
});

test('navigation placeholders remain honest and layout has no horizontal overflow', async ({ page }) => {
  await ready(page);
  await page.getByRole('link', { name: '評估', exact: true }).click();
  await expect(page.getByText('第 3.6 階段的評估結果將整合於此。')).toBeVisible();
  await page.getByRole('link', { name: '系統架構', exact: true }).click();
  await expect(page.getByRole('heading', { name: '從感知到行動的授權' })).toBeVisible();
  await expect(page.locator('.component-statuses')).toContainText('模型推論模擬資料');
  await page.getByRole('link', { name: '互動展示', exact: true }).click();
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('failed runtime supersedes a partial policy authorization', async ({ page, request }) => {
  const response = await request.post('/api/run', { data: { scenario_id: 'explicit-delegation', guard_enabled: true } });
  const initial = await response.json();
  const terminal = await request.get(`/api/run/${initial.id}/events`);
  const state = (await terminal.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).at(-1);
  Object.assign(state, { status: 'failed', outcome: null, error: '執行服務在授權判定後停止。' });
  state.action.status = 'proposed';
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await page.route('**/api/run', route => route.fulfill({ status: 202, json: state }));
  await analyze(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'failed');
  await openTechnical(page);
  await expect(page.getByTestId('decision-result')).toContainText('已中斷');
  await expect(page.getByTestId('decision-result')).not.toContainText('已允許');
});

for (const viewport of [{width: 1440, height: 900}, {width: 1920, height: 1080}]) {
  test(`dominant stage and controls fit ${viewport.width}x${viewport.height}; diagnostics stay in drawer`, async ({ page }) => {
    await page.setViewportSize(viewport); await ready(page);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const stage = await page.locator('.story-stage').boundingBox();
    expect(stage!.height / viewport.height).toBeGreaterThan(.65);
    for (const name of ['啟動相機', '開始分析', '重設', '下一步']) {
      const box = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.locator('.story-intro h1').evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(36);
    await analyze(page);
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('.decision-facts')).not.toBeVisible();
    await openTechnical(page);
    await expect(page.locator('.decision-facts')).toContainText('僅供觀察');
    await expect(page.locator('.interpretation-list')).toContainText('偵測到兩個電話號碼');
    expect(await page.evaluate(() => /\p{Extended_Pictographic}/u.test(document.body.innerText))).toBe(false);
  });
}

test('safe scenario with guard OFF never claims an attack succeeded', async ({ page }) => {
  await ready(page);
  await page.getByLabel('情境', { exact: true }).selectOption('explicit-delegation');
  await page.getByRole('switch', { name: 'LensGuard' }).click();
  await analyze(page);
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', 'executed');
  await expect(page.locator('.story-final')).not.toContainText('攻擊成功');
  await openTechnical(page);
  await expect(page.getByTestId('outcome')).not.toContainText('攻擊成功');
});
