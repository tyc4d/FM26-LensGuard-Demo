import { expect, type Page } from '@playwright/test';

export async function openDetails(page: Page) {
  if (!await page.getByRole('dialog').isVisible()) await page.getByRole('button', { name: '檢視細節' }).click();
}
export async function openTechnical(page: Page) {
  await openDetails(page);
  if (!await page.locator('.technical-trace').evaluate(el => (el as HTMLDetailsElement).open))
    await page.getByText('查看技術細節', { exact: true }).click();
}
export async function closeDetails(page: Page) {
  if (await page.getByRole('dialog').isVisible()) await page.getByRole('button', { name: '關閉細節' }).click();
}
export async function finishStory(page: Page) {
  await closeDetails(page);
  await expect(page.getByRole('switch', { name: 'LensGuard' })).toBeEnabled({ timeout: 15_000 });
  const next = page.getByRole('button', { name: '下一步', exact: true });
  for (let i = 0; i < 10 && await next.isEnabled(); i++) await next.click();
  await expect(page.locator('.story-stage')).toHaveAttribute('data-phase', /blocked|allowed|executed|failed/);
}
