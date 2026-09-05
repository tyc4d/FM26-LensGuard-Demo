import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __cameraGateResolve?: () => void;
    __cameraResolvedStream?: MediaStream;
  }
}

async function startCamera(page: Page) {
  await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
  await expect(page.getByTestId('status-camera')).toContainText('LIVE');
  await expect.poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => (
    element.videoWidth > 0 && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ))).toBe(true);
}

test('camera plays a real browser media stream and Stop Camera ends the tracks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-camera')).toContainText('OFF');
  await startCamera(page);

  const track = await page.locator('video').evaluateHandle((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).getVideoTracks()[0]
  ));
  expect(await track.evaluate((value) => value.readyState)).toBe('live');
  await expect(page.getByText('Mock regions · camera frames stay in this browser', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Stop Camera', exact: true }).click();
  await expect(page.getByTestId('status-camera')).toContainText('OFF');
  await expect(page.getByRole('button', { name: 'Start Camera', exact: true })).toBeVisible();
  expect(await track.evaluate((value) => value.readyState)).toBe('ended');
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.srcObject === null)).toBe(true);
  await track.dispose();
});

for (const failure of [
  { name: 'NotAllowedError', message: 'Camera permission was denied. Enable camera access in the browser and try again.' },
  { name: 'NotFoundError', message: 'No camera device was detected.' },
]) {
  test(`camera handles ${failure.name} while mock analysis remains available`, async ({ page }) => {
    await page.addInitScript((name) => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Test camera failure', name);
      };
    }, failure.name);
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
    await expect(page.locator('.camera-error')).toContainText(failure.message);
    await expect(page.getByTestId('status-camera')).toContainText('OFF');
    await expect(page.getByRole('button', { name: 'Start Camera', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Run Analysis', exact: false })).toBeEnabled();
  });
}

test('canceling a pending permission request stops its late-arriving camera stream', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise<void>((resolve) => { window.__cameraGateResolve = resolve; });
      const stream = await originalGetUserMedia(constraints);
      window.__cameraResolvedStream = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
  await expect(page.getByText('Waiting for camera', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop Camera', exact: true }).click();
  await page.evaluate(() => window.__cameraGateResolve?.());

  await expect.poll(() => page.evaluate(() => (
    window.__cameraResolvedStream?.getTracks().every((track) => track.readyState === 'ended')
  ))).toBe(true);
  await expect(page.getByTestId('status-camera')).toContainText('OFF');
  await expect(page.getByRole('button', { name: 'Start Camera', exact: true })).toBeVisible();
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.srcObject === null)).toBe(true);
});

test('Reset and navigation preserve the active camera while clearing analysis', async ({ page }) => {
  await page.goto('/');
  await startCamera(page);
  const streamId = await page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).id
  ));

  await page.getByRole('button', { name: 'Run Analysis', exact: false }).click();
  await expect(page.getByTestId('decision-result')).toContainText('BLOCKED');
  await expect(page.locator('.camera-region').first()).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByTestId('decision-result')).toContainText('PENDING');
  await expect(page.locator('.camera-region')).toHaveCount(0);
  await expect(page.getByTestId('status-camera')).toContainText('LIVE');

  await page.getByRole('link', { name: 'Architecture', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sensor-to-action authorization', exact: true })).toBeVisible();
  await expect(page.getByTestId('status-camera')).toContainText('LIVE');
  await page.getByRole('link', { name: 'Evaluation', exact: true }).click();
  await expect(page.getByText('Phase 3.6 evaluation results will be integrated here.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Live Demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Camera', exact: true })).toBeVisible();
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).id
  ))).toBe(streamId);
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).getVideoTracks()[0].readyState
  ))).toBe('live');
});

test('an ended camera track clears LIVE and offers recovery', async ({ page }) => {
  await page.goto('/');
  await startCamera(page);
  await page.locator('video').evaluate((element: HTMLVideoElement) => {
    const track = (element.srcObject as MediaStream).getVideoTracks()[0];
    track.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByTestId('status-camera')).toContainText('OFF');
  await expect(page.locator('.camera-error')).toContainText('camera stopped or was disconnected');
  await expect(page.getByRole('button', { name: 'Start Camera', exact: true })).toBeVisible();
});

test('switching camera preference replaces the stream and releases the previous tracks', async ({ page }) => {
  await page.goto('/');
  await startCamera(page);
  const originalTrack = await page.locator('video').evaluateHandle((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).getVideoTracks()[0]
  ));
  const originalStreamId = await page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).id
  ));

  await page.getByRole('combobox', { name: 'Select camera', exact: true }).selectOption('user');
  await expect(page.getByTestId('status-camera')).toContainText('LIVE');
  await expect.poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream | null)?.id
  ))).not.toBe(originalStreamId);
  expect(await originalTrack.evaluate((track) => track.readyState)).toBe('ended');
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => (
    (element.srcObject as MediaStream).getVideoTracks()[0].readyState
  ))).toBe('live');
  await originalTrack.dispose();
});
