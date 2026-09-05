import { expect, test, type Page } from '@playwright/test';
import type { ProposedAction, RunState } from '../src/types';

function prototypeRun(id: string, scenarioId = 'reservation-injection'): RunState {
  return {
    id, runtime: 'prototype', scenario_id: scenarioId, guard_enabled: true,
    status: 'running', stage: 'queued', frame_id: 'frame-test', regions: [], interpretation: [],
    action: null, decision: null, trace_nodes: [], trace_edges: [], outcome: null, events: [], error: null,
  };
}

function modelAction(tool: string, values: Record<string, string>, validationStatus: 'valid' | 'invalid' = 'valid'): ProposedAction {
  return {
    id: 'model-action', tool, status: 'proposed', validation_status: validationStatus,
    arguments: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
      id: key, value, source_type: 'model', source_id: 'infer-test', trust: 'untrusted', authority: ['none'], lineage: [],
    }])),
  };
}

async function uploadObservation(page: Page) {
  const bytes = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(bytes, 'base64') });
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
}

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
        raw_model_text: 'Unparseable real response', error: '無法解析模型輸出。',
      } });
    });
    await page.goto('/');
    await page.getByRole('textbox', { name: '你的請求' }).fill('幫我打電話訂這間餐廳');
    await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
    if (source === 'camera') {
      await page.getByRole('button', { name: '啟動相機', exact: true }).click();
      await expect(page.getByRole('button', { name: '停止相機', exact: true })).toBeVisible();
      await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).readyState >= 2 && (video as HTMLVideoElement).videoWidth > 0)).toBeTruthy();
    } else {
      const buffer = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: Buffer.from(buffer, 'base64') });
      await expect(page.getByRole('img', { name: '已上傳的觀察圖片：scene.png' })).toBeVisible();
    }
    expect(posts).toBe(0);
    await page.getByRole('button', { name: '開始分析' }).click();
    await expect(page.getByRole('alert')).toContainText('無法解析模型輸出');
    expect(posts).toBe(1);
    await page.getByText('查看技術細節', { exact: true }).click();
    await expect(page.getByText('Unparseable real response', { exact: true })).toBeVisible();
    await expect(page.locator('.camera-region')).toHaveCount(0);
  });
}

test('real mode cannot run with no image and never posts mock JSON', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'unloaded', prototype: { status: 'unloaded', model_loaded: false } } }));
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST') posts++; });
  await page.goto('/');
  await page.getByRole('textbox', { name: '你的請求' }).fill('幫我打電話訂這間餐廳');
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('alert')).toContainText('請先啟動相機或上傳圖片');
  expect(posts).toBe(0);
});

test('schema-invalid reservation ends SSE and shows candidate instead of waiting', async ({ page }) => {
  const initial = {id:'invalid-reservation',runtime:'prototype',scenario_id:'reservation-injection',guard_enabled:true,status:'running',stage:'queued',frame_id:null,regions:[],interpretation:[],action:null,decision:null,trace_nodes:[],trace_edges:[],outcome:null,events:[],error:null};
  const terminal = {...initial, status:'failed',stage:'runtime.failed',error_code:'model_schema_invalid',error:'用餐人數必須為大於零的整數。',
    action:{id:'candidate',tool:'restaurant_reservation',status:'proposed',validation_status:'invalid',arguments:Object.fromEntries(Object.entries({restaurant:'Example Bistro',number:'02-2345-6661',time:'N/A',party_size:'N/A'}).map(([key,value])=>[key,{id:key,value,source_type:'model',source_id:'infer-test',trust:'untrusted',authority:['none'],lineage:[]}]))},
    events:[{id:'invalid-reservation:1',timestamp:new Date().toISOString(),type:'runtime.failed',detail:'用餐人數必須為大於零的整數。'}]};
  await page.route('**/api/health', route => route.fulfill({json:{status:'ok',runtime:'prototype',model:'live',prototype:{status:'ready',model_loaded:true}}}));
  await page.route('**/api/run', route=>route.fulfill({status:202,json:initial}));
  await page.route('**/api/run/invalid-reservation/events', route=>route.fulfill({contentType:'text/event-stream',body:`event: runtime\nid: invalid-reservation:1\ndata: ${JSON.stringify(terminal)}\n\n`}));
  await page.goto('/');
  await page.getByRole('textbox', { name: '你的請求' }).fill('幫我打電話訂這間餐廳');
  const bytes=await page.evaluate(()=>document.createElement('canvas').toDataURL('image/png').split(',')[1]);
  await page.getByLabel('上傳觀察圖片').setInputFiles({name:'scene.png',mimeType:'image/png',buffer:Buffer.from(bytes,'base64')});
  await page.getByRole('img',{name:'已上傳的觀察圖片：scene.png'}).waitFor();
  await page.getByRole('button',{name:'開始分析'}).click();
  await expect(page.getByTestId('decision-result')).toContainText('模型輸出無效');
  await expect(page.getByRole('button',{name:'開始分析'})).toBeEnabled();
  await expect(page.locator('.action-expression')).toContainText('餐廳訂位');
  await page.getByText('查看技術細節',{exact:true}).click();
  await expect(page.locator('.action-status')).toContainText('行動格式無效');
  await expect(page.getByText(/未進行授權判定：/)).toBeVisible();
  await expect(page.getByText('等待分析',{exact:true})).toHaveCount(0);
});

test('policy failure replaces pending authorization with a terminal result', async ({ page }) => {
  const raw = '{"action":"CALL","arguments":{"target_number":"02-2345-6661"}}';
  const initial: RunState = {
    ...prototypeRun('policy-unavailable'), stage: 'provenance.attached',
    action: modelAction('call_phone', { number: '02-2345-6661' }), raw_model_text: raw,
  };
  const terminal: RunState = {
    ...initial, status: 'failed', stage: 'runtime.failed', error_code: 'policy_unavailable',
    error: '授權規則目前無法使用，已暫停自動執行。',
    events: [{ id: `${initial.id}:1`, timestamp: new Date().toISOString(), type: 'runtime.failed', detail: '授權規則目前無法使用。' }],
  };
  let publishFailure!: () => void;
  const failureReady = new Promise<void>(resolve => { publishFailure = resolve; });
  await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'live', prototype: { status: 'ready', model_loaded: true } } }));
  await page.route('**/api/run', route => route.fulfill({ status: 202, json: initial }));
  await page.route(`**/api/run/${initial.id}`, route => route.fulfill({ json: initial }));
  await page.route(`**/api/run/${initial.id}/events`, async route => {
    await failureReady;
    await route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\nid: ${initial.id}:1\ndata: ${JSON.stringify(terminal)}\n\n` });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: '你的請求' }).fill('幫我打電話訂這間餐廳');
  await uploadObservation(page);
  await page.getByText('查看技術細節', { exact: true }).click();
  await page.getByRole('button', { name: '開始分析' }).click();
  try {
    await expect(page.locator('.action-status')).toContainText('等待授權');
    await expect(page.getByRole('button', { name: '分析中…' })).toBeDisabled();
  } finally {
    publishFailure();
  }
  await expect(page.getByTestId('decision-result')).toContainText('未獲授權');
  await expect(page.locator('.action-status')).toContainText('未獲授權');
  await expect(page.getByText('等待授權', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('授權規則目前無法使用，已暫停自動執行。');
  await expect(page.locator('.decision-body')).toContainText('未進行判定');
  await expect(page.getByText(raw, { exact: true })).toBeVisible();
  await expect(page.getByTestId('outcome')).toHaveCount(0);
});

for (const guardEnabled of [true, false]) {
  test(`unsupported direction remains invalid with Guard ${guardEnabled ? '開啟' : '關閉'}`, async ({ page }) => {
    const raw = '{"action":"DIRECTION_ADVICE","arguments":{"direction":"未知","destination":"出口"}}';
    const initial = { ...prototypeRun(`unknown-direction-${guardEnabled}`, 'navigation-injection'), guard_enabled: guardEnabled };
    const terminal: RunState = {
      ...initial, status: 'failed', stage: 'runtime.failed', error_code: 'model_action_invalid',
      action: modelAction('navigate', { destination: '出口', direction: '未知' }, 'invalid'),
      raw_model_text: raw,
      error: '模型已完成推論，但提議的行動參數無法使用。請檢查提議內容；原始驗證訊息可在技術詳細資訊中查看。',
      runtime_metadata: { output: { parsed: true, schema_valid: true, validation_error: "unsupported direction: '未知'" } },
      events: [{ id: `${initial.id}:1`, timestamp: new Date().toISOString(), type: 'runtime.failed', detail: '模型已完成推論，但提議的行動參數無法使用。' }],
    };
    await page.route('**/api/health', route => route.fulfill({ json: { status: 'ok', runtime: 'prototype', model: 'live', prototype: { status: 'ready', model_loaded: true } } }));
    await page.route('**/api/run', route => route.fulfill({ status: 202, json: initial }));
    await page.route(`**/api/run/${initial.id}/events`, route => route.fulfill({ contentType: 'text/event-stream', body: `event: runtime\nid: ${initial.id}:1\ndata: ${JSON.stringify(terminal)}\n\n` }));
    await page.goto('/');
    await page.getByLabel('情境', { exact: true }).selectOption('navigation-injection');
    if (!guardEnabled) await page.getByRole('switch', { name: 'LensGuard' }).click();
    await uploadObservation(page);
    await page.getByRole('button', { name: '開始分析' }).click();
    await expect(page.getByTestId('decision-result')).toContainText('模型輸出無效');
    await expect(page.getByRole('heading', { name: '模型已完成，行動參數無效', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('提議的行動參數無法使用');
    await expect(page.locator('.action-expression')).toHaveText('提供方向(出口, 未知)');
    await expect(page.getByRole('button', { name: '開始分析' })).toBeEnabled();
    await page.getByText('查看技術細節', { exact: true }).click();
    await expect(page.locator('.action-status .status-text')).toHaveText('行動無效');
    await expect(page.locator('.decision-body')).toContainText('未進行判定');
    await expect(page.locator('.decision-body')).toContainText('提供方向／方向');
    await expect(page.locator('.decision-body')).not.toContainText('提供方向／目的地');
    await expect(page.locator('.decision-body')).not.toContainText('已略過授權');
    await expect(page.locator('.decision-body')).not.toContainText('將在模擬中執行');
    await expect(page.getByText(raw, { exact: true })).toBeVisible();
    await expect(page.getByText('等待授權', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('outcome')).toHaveCount(0);
  });
}
