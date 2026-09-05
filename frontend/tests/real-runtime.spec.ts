import { expect, test } from '@playwright/test';

for (const source of ['camera', 'uploaded_image']) {
  test(`real mode sends one ${source} JPEG and preserves raw parse failure`, async ({ page }) => {
    await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'live', prototype: { status: 'ready', model_loaded: true } } }));
    let posts = 0;
    await page.route('**/api/run', async route => {
      posts++;
      const request = route.request();
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      const body = request.postDataBuffer()!;
      expect(body.includes(Buffer.from('image/jpeg'))).toBeTruthy();
      expect(body.includes(Buffer.from(source))).toBeTruthy();
      expect(body.includes(Buffer.from('幫我打電話訂這間餐廳'))).toBeTruthy();
      expect(body.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBeTruthy();
      await route.fulfill({ status: 202, json: {
        id: 'real-test', runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: true,
        status: 'failed', stage: 'runtime.failed', frame_id: 'frame-test', regions: [], interpretation: [],
        action: null, decision: null, trace_nodes: [], trace_edges: [], outcome: null, events: [],
        raw_model_text: 'Unparseable real response', error: 'Model output could not be parsed.',
      } });
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Run Analysis' })).toBeEnabled();
    if (source === 'camera') {
      await page.getByRole('button', { name: 'Start Camera', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Stop Camera', exact: true })).toBeVisible();
      await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).readyState >= 2 && (video as HTMLVideoElement).videoWidth > 0)).toBeTruthy();
    } else {
      const buffer = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.getByLabel('Upload observation image').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(buffer, 'base64') });
      await expect(page.getByRole('img', { name: 'Uploaded observation: scene.png' })).toBeVisible();
    }
    expect(posts).toBe(0);
    await page.getByRole('button', { name: 'Run Analysis' }).click();
    await expect(page.getByRole('alert')).toContainText('Model output could not be parsed');
    expect(posts).toBe(1);
    await page.getByText('Show technical trace', { exact: true }).click();
    await expect(page.getByText('Unparseable real response', { exact: true })).toBeVisible();
    await expect(page.locator('.camera-region')).toHaveCount(0);
  });
}

test('real mode cannot run with no image and never posts mock JSON', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'unloaded', prototype: { status: 'unloaded', model_loaded: false } } }));
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Run Analysis' }).click();
  await expect(page.getByRole('alert')).toContainText('Start the camera or upload an image');
  expect(posts).toBe(0);
});

test('schema-invalid reservation ends SSE and shows candidate instead of waiting', async ({ page }) => {
  const initial = {id:'invalid-reservation',runtime:'prototype',scenario_id:'reservation-injection',guard_enabled:true,status:'running',stage:'queued',frame_id:null,regions:[],interpretation:[],action:null,decision:null,trace_nodes:[],trace_edges:[],outcome:null,events:[],error:null};
  const terminal = {...initial, status:'failed',stage:'runtime.failed',error_code:'model_schema_invalid',error:'Model inference completed, but action schema validation failed: party_size must be a positive integer',
    action:{id:'candidate',tool:'restaurant_reservation',status:'proposed',validation_status:'invalid',arguments:Object.fromEntries(Object.entries({restaurant:'Example Bistro',number:'02-2345-6661',time:'N/A',party_size:'N/A'}).map(([key,value])=>[key,{id:key,value,source_type:'model',source_id:'infer-test',trust:'untrusted',authority:['none'],lineage:[]}]))},
    events:[{id:'invalid-reservation:1',timestamp:new Date().toISOString(),type:'runtime.failed',detail:'party_size must be a positive integer'}]};
  await page.route('**/api/health', route => route.fulfill({json:{status:'ok',runtime:'prototype',model:'live',prototype:{status:'ready',model_loaded:true}}}));
  await page.route('**/api/run', route=>route.fulfill({status:202,json:initial}));
  await page.route('**/api/run/invalid-reservation/events', route=>route.fulfill({contentType:'text/event-stream',body:`event: runtime\nid: invalid-reservation:1\ndata: ${JSON.stringify(terminal)}\n\n`}));
  await page.goto('/');
  const bytes=await page.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await page.getByLabel('Upload observation image').setInputFiles({name:'scene.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
  await page.getByRole('img',{name:'Uploaded observation: scene.png'}).waitFor();
  await page.getByRole('button',{name:'Run Analysis'}).click();
  await expect(page.getByTestId('decision-result')).toContainText('INVALID MODEL OUTPUT');
  await expect(page.getByRole('button',{name:'Run Analysis'})).toBeEnabled();
  await expect(page.locator('.action-expression')).toContainText('restaurant_reservation');
  await page.getByText('Show technical trace',{exact:true}).click();
  await expect(page.locator('.action-status')).toContainText('INVALID ACTION SCHEMA');
  await expect(page.getByText(/Authorization not evaluated:/)).toBeVisible();
  await expect(page.getByText('AWAITING ANALYSIS',{exact:true})).toHaveCount(0);
});
