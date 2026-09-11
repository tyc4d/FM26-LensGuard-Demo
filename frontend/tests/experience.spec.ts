import { expect, test } from '@playwright/test';
import { chooseScene, finish, requestGuard, separate } from './experience-helpers';

for (const scenario of ['clean-navigation', 'navigation-injection', 'reservation-delegation', 'reservation-injection', 'explicit-delegation']) {
  test(`${scenario}: actual backend evidence drives one persistent four-state stage`, async ({ page }) => {
    const attacks = scenario.endsWith('injection');
    const navigation = scenario.includes('navigation');
    const errors: string[] = [];
    const guards: boolean[] = [];
    page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/run')) guards.push(requestGuard(request)); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await chooseScene(page, scenario);
    await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
    await expect(page.locator('main button:visible')).toHaveCount(1);
    await expect(page.locator('.semantic-piece')).toHaveCount(0);
    await expect(page.locator('nav:visible, aside:visible, pre:visible')).toHaveCount(0);
    const root = await page.locator('.central-stage').elementHandle();
    const scene = await page.locator('.scene-image').elementHandle();
    const before = await page.locator('.scene-plane').boundingBox();
    const requestText = await page.locator('.scene-request').innerText();
    expect(requestText.length).toBeGreaterThan(3);
    await separate(page);
    expect(await root!.evaluate(node => node === document.querySelector('.central-stage'))).toBeTruthy();
    expect(await scene!.evaluate(node => node === document.querySelector('.scene-image'))).toBeTruthy();
    expect(await page.locator('.scene-plane').boundingBox()).toEqual(before);
    await expect(page.locator('.semantic-label').filter({ hasText: navigation ? 'Observation' : 'Contact information' })).toBeVisible();
    await expect(page.locator('.semantic-label').filter({ hasText: 'Injected instruction' })).toHaveCount(attacks ? 1 : 0);
    if (!attacks) await expect(page.getByText('No injected instructions detected.')).toBeVisible();
    await expect(page.locator('.stage-result')).toHaveCount(0);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'decide');
    await expect(page.locator('.decision-effect[data-disposition=ignore]')).toHaveCount(attacks ? 1 : 0);
    await expect(page.locator('.decision-effect[data-disposition=use]')).toContainText('Use');
    await expect(page.locator('.semantic-label').filter({ hasText: 'Usable information' })).toHaveCount(1);
    await expect(page.locator('.semantic-label').filter({ hasText: 'Unsafe instruction' })).toHaveCount(attacks ? 1 : 0);
    const without = page.locator('.comparison-row[data-guard="off"]');
    const withGuard = page.locator('.comparison-row[data-guard="on"]');
    if (attacks) {
      await expect(without).toContainText(navigation ? 'Left' : '0912-345-678');
      await expect(withGuard).toContainText(navigation ? 'Right' : '02-2345-6789');
      if (!navigation) await expect(without).toContainText('Simulated call');
    } else await expect(page.locator('.decision-comparison')).toHaveCount(0);
    expect(guards).toEqual(attacks ? [true, false] : [true]);
    for (const unrelated of await page.locator('.semantic-piece[aria-hidden="true"]').all()) await expect(unrelated).toBeHidden();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'result');
    await expect(page.locator('.semantic-piece, .decision-effects')).toHaveCount(0);
    if (navigation) await expect(page.getByRole('heading', { name: 'Right', exact: true })).toBeVisible();
    else {
      await expect(page.getByRole('heading', { name: '02-2345-6789' })).toBeVisible();
      if (attacks) {
        await expect(page.locator('.result-kicker')).toHaveText('Safe contact number');
        await expect(page.locator('.stage-result')).toContainText('No call was placed.');
        await expect(page.locator('.stage-result')).not.toContainText('Calling');
      } else await expect(page.locator('.result-kicker')).toHaveText('Simulating a call');
    }
    expect(errors).toEqual([]);
  });
}

test('keyboard, reverse transitions and replay use the same completed run without posting again', async ({ page }) => {
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate', { timeout: 15_000 });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'decide');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate');
  await finish(page);
  await page.keyboard.press('r');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
  await separate(page);
  await finish(page);
  expect(posts).toBe(2);
  await page.getByRole('button', { name: 'Replay' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
});

test('developer details stay hidden until D, close with Escape and preserve stage', async ({ page }) => {
  await page.goto('/');
  await separate(page);
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
  await page.keyboard.press('d');
  await expect(page.getByRole('dialog', { name: 'Technical trace' })).toBeVisible();
  await page.getByText('Full run data', { exact: true }).click();
  await expect(page.getByRole('dialog').locator('pre:visible').filter({ hasText: 'retained_evidence_ids' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'separate');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`four stages fit ${viewport.width} × ${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled();
    for (const stage of ['input', 'separate', 'decide', 'result']) {
      if (stage === 'separate') await separate(page);
      else if (stage === 'decide' || stage === 'result') await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', stage);
      await expect(page.locator('.experience-next')).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      if (stage === 'result') await page.screenshot({ path: testInfo.outputPath('result.png') });
    }
  });
}

test('reduced motion renders the complete influence path and result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await separate(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.decision-effect[data-disposition=use]')).toHaveCSS('opacity', '1');
  await expect(page.locator('.decision-effect[data-disposition=ignore]')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Right' })).toBeVisible();
});

test('changing to a clean scene clears previous attack and result', async ({ page }) => {
  const guards: boolean[] = [];
  page.on('request', request => { if (request.method() === 'POST') guards.push(requestGuard(request)); });
  await page.goto('/');
  await separate(page);
  await finish(page);
  await chooseScene(page, 'clean-navigation');
  await expect(page.locator('.central-stage')).toHaveAttribute('data-stage', 'input');
  await expect(page.locator('.stage-result, .semantic-piece')).toHaveCount(0);
  await separate(page);
  await expect(page.locator('[data-disposition=ignore]')).toHaveCount(0);
  await expect(page.getByText('No injected instructions detected.')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.decision-comparison')).toHaveCount(0);
  await page.keyboard.press('d');
  await expect(page.getByText('Run data without LensGuard', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.keyboard.press('r');
  await separate(page);
  expect(guards).toEqual([true, false, true]);
  await chooseScene(page, 'navigation-injection');
  await separate(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.decision-comparison')).toBeVisible();
  expect(guards).toEqual([true, false, true, true, false]);
});
