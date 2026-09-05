import { expect, test, type Page } from '@playwright/test';
import type { ProvenanceValue, RunState } from '../src/types';

const query = '請幫我預訂眼前這間餐廳，日期是 2026 年 9 月 6 日晚上 7 點，共 4 位；請先確認店家名稱和電話，再處理訂位。';
const restaurant = 'TACOS & TAPS 台北信義店 — 墨西哥餐酒館';

/** Representative API payloads exercise layout only; no model or policy is run. */
function result(kind: 'blocked' | 'allowed' | 'failed'): RunState {
  const id = `desktop-${kind}`;
  const value = (name: string, content: string): ProvenanceValue => ({
    id: `${id}-${name}`, value: content, source_type: 'model',
    source_id: 'infer_2a0b1506bb93422b87f44660a5f0ebb8', trust: 'untrusted',
    authority: kind === 'allowed' ? ['delegated'] : ['none'], lineage: ['image_upload', id],
  });
  const reservation = kind !== 'allowed';
  const tool = reservation ? 'restaurant_reservation' : 'call_phone';
  const argument = reservation ? 'restaurant' : 'number';
  return {
    id, runtime: 'prototype', scenario_id: 'reservation-injection', guard_enabled: true,
    status: kind === 'failed' ? 'failed' : 'completed', stage: `action.${kind}`,
    frame_id: 'frame_0002', regions: [], interpretation: [], error: kind === 'failed' ? '訂位資訊尚未完整：請在請求中提供明確的日期、時間與用餐人數，再重新分析。' : null,
    error_code: kind === 'failed' ? 'reservation_details_missing' : null,
    validation_issues: kind === 'failed' ? [
      { argument: 'restaurant_reservation.time', kind: 'missing', message: '請提供完整的日期與訂位時間。' },
      { argument: 'restaurant_reservation.party_size', kind: 'missing', message: '請提供大於零的用餐人數。' },
    ] : [],
    raw_model_text: JSON.stringify({ action: tool, arguments: { restaurant, number: '02-2345-6789', time: '2026-09-06 19:00', party_size: 4 } }),
    action: {
      id: `${id}-action`, tool, status: kind === 'failed' ? 'proposed' : kind,
      validation_status: kind === 'failed' ? 'invalid' : 'valid',
      arguments: reservation ? {
        restaurant: value('restaurant', restaurant), number: value('number', '02-2345-6789'),
        time: value('time', kind === 'failed' ? 'N/A' : '2026-09-06 19:00'),
        party_size: value('party_size', kind === 'failed' ? 'N/A' : '4'),
      } : { number: value('number', '02-2345-6789') },
    },
    decision: kind === 'failed' ? null : {
      result: kind === 'blocked' ? 'block' : 'allow', rule_id: 'layout_test_policy',
      affected_argument: `${tool}.${argument}`,
      source_authority: kind === 'allowed' ? 'USER_DELEGATED' : 'NONE',
      required_authority: 'USER_DELEGATED',
      reason: kind === 'blocked' ? '模型雖然讀出了餐廳資訊，但來源尚未取得控制這次訂位行動參數所需的使用者授權。' : '使用者已明確授權將這次觀察的餐廳電話用於本次模擬撥號。',
    },
    outcome: kind === 'failed' ? null : {
      status: kind, simulation_only: true, attack_success: null, result: null,
      detail: kind === 'blocked' ? '模型提出了訂位行動，但目前的展示授權規則尚未支援這項工具；系統保留提案供檢視，並在工具邊界前停止。' : '本次行動符合使用者授權，已允許模擬撥號；沒有實際撥打電話。',
    },
    trace_nodes: [
      { id: 'input', label: 'IMAGE', type: 'uploaded_image input', source: 'camera' },
      { id: 'model', label: 'LOCAL VLM', type: 'real inference', source: 'model' },
      { id: 'value', label: reservation ? restaurant : '02-2345-6789', type: 'model-derived; unverified', source: 'model' },
      { id: 'argument', label: `${tool}.${argument}`, type: 'action argument', source: 'model' },
    ],
    trace_edges: [{ from: 'input', to: 'model' }, { from: 'model', to: 'value' }, { from: 'value', to: 'argument' }],
    events: [{ id: `${id}:1`, type: 'inference.completed', timestamp: '2026-09-05T12:00:00Z', detail: '已收到本機模型輸出。' }],
  };
}

async function prepare(page: Page, run: RunState) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/health', route => route.fulfill({ json: {
    status: 'ok', runtime: 'prototype', model: 'live',
    prototype: { status: 'ready', model_loaded: true, model_profile: 'qwen3vl-8b' },
  } }));
  await page.route('**/api/run', route => route.fulfill({ status: 202, json: run }));
  await page.goto('/');
  await page.getByRole('textbox', { name: '你的請求' }).fill(query);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#f8f4eb'; context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#26352c'; context.font = '28px sans-serif';
    context.fillText('TACOS & TAPS', 40, 120); context.fillText('02-2345-6789', 40, 180);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('上傳觀察圖片').setInputFiles({ name: 'reservation-layout.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByRole('img', { name: '已上傳的觀察圖片：reservation-layout.png', exact: true })).toBeVisible();
}

/** Bounding boxes alone miss clipping and overlapping absolutely positioned layers. */
async function assertReadableStage(page: Page, phase: string) {
  const problems = await page.evaluate(() => {
    const failures: string[] = [];
    const stage = document.querySelector<HTMLElement>('.story-stage')!;
    const stageBox = stage.getBoundingClientRect();
    const rect = (element: Element) => element.getBoundingClientRect();
    const visible = (element: Element) => rect(element).width > 0 && rect(element).height > 0
      && getComputedStyle(element).visibility !== 'hidden';
    const label = (element: Element) => element.className || element.tagName;
    const inside = (inner: DOMRect, outer: { left: number; right: number; top: number; bottom: number }) =>
      inner.left >= outer.left - 2 && inner.right <= outer.right + 2 && inner.top >= outer.top - 2 && inner.bottom <= outer.bottom + 2;
    const viewport = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
    if (!inside(stageBox, viewport)) failures.push('The main stage extends outside the viewport');
    if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('Page overflows horizontally');
    const controlSelectors = '.story-presenter-controls button, .reset-presentation, .inspect-button'
      + (stage.dataset.phase === 'idle' ? ', .story-live-input button, .story-live-input textarea' : '');
    for (const control of document.querySelectorAll(controlSelectors)) {
      if (!visible(control)) continue;
      if (!inside(rect(control), viewport)) failures.push(`Presenter control outside viewport: ${control.textContent}`);
      const box = rect(control);
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      if (!hit || !control.contains(hit)) failures.push(`Presenter control is covered: ${control.textContent}`);
    }
    const contentSelectors = [
      '.story-intro', '.story-live-input .camera-panel', '.story-setup',
      '.story-scene', '.story-value-token', '.story-perception-copy',
      '.story-semantic-heading', '.story-semantic-metadata', '.story-semantic-details > .story-lead',
      '.story-provenance-copy > .story-overline', '.story-provenance-copy > h2', '.story-graph-wrap',
      '.story-proposal-copy > .story-overline', '.story-proposal-copy > h2', '.story-action-card', '.story-action-validation', '.story-gate', '.story-gate-facts > div', '.story-gate-question',
      '.story-final-visual', '.story-final > div > .story-overline', '.story-final h2', '.story-final-reason',
      '.story-final-policy', '.story-no-side-effects', '.story-final-motto', '.story-final-principle', '.story-missing-fields',
    ];
    const content = contentSelectors.flatMap(selector => Array.from(stage.querySelectorAll(selector))).filter(visible);
    const context = rect(stage.querySelector('.story-context')!);
    const footnote = rect(stage.querySelector('.story-stage-footnote')!);
    const usable = { left: stageBox.left, right: stageBox.right, top: context.bottom, bottom: footnote.top };
    for (const element of content) {
      if (!inside(rect(element), usable)) failures.push(`Content clips the header, footer, or stage edge: ${label(element)}`);
      // A child can fit inside the stage while still being cropped by its focus
      // panel. A scrollable ancestor must not hide the current story or its CTA.
      for (let ancestor = element.parentElement; ancestor && ancestor !== stage; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.display === 'contents') continue;
        const box = rect(element), clip = rect(ancestor);
        const clipsX = /auto|scroll|hidden|clip/.test(style.overflowX) && (box.left < clip.left - 2 || box.right > clip.right + 2);
        const clipsY = /auto|scroll|hidden|clip/.test(style.overflowY) && (box.top < clip.top - 2 || box.bottom > clip.bottom + 2);
        if (clipsX || clipsY) failures.push(`Content clipped by ${label(ancestor)}: ${label(element)} (y=${box.top.toFixed(1)}–${box.bottom.toFixed(1)}; visible=${clip.top.toFixed(1)}–${clip.bottom.toFixed(1)})`);
      }
    }
    // These objects communicate separate ideas and must never cover each other.
    for (let i = 0; i < content.length; i++) for (let j = i + 1; j < content.length; j++) {
      const a = content[i], b = content[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ar = rect(a), br = rect(b);
      const overlapX = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
      const overlapY = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
      if (overlapX > 2 && overlapY > 2) failures.push(`Content overlaps: ${label(a)} / ${label(b)} (${overlapX.toFixed(1)} × ${overlapY.toFixed(1)}px; y=${ar.top.toFixed(1)}–${ar.bottom.toFixed(1)} / ${br.top.toFixed(1)}–${br.bottom.toFixed(1)})`);
    }
    const card = stage.querySelector<HTMLElement>('.story-action-card');
    if (card && visible(card)) {
      for (const row of card.querySelectorAll('dl > div')) {
        if (!inside(rect(row), rect(card))) failures.push(`Action argument hidden in card: ${row.textContent}`);
      }
    }
    return failures;
  });
  if (problems.length) {
    const path = test.info().outputPath(`layout-${phase}.png`);
    await page.screenshot({ path });
    await test.info().attach(`layout-${phase}`, { path, contentType: 'image/png' });
  }
  expect(problems, `Readable desktop layout at ${phase}`).toEqual([]);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }]) {
  for (const kind of ['blocked', 'allowed', 'failed'] as const) {
    test(`${viewport.width}×${viewport.height} ${kind}: every stage keeps content separate and controls visible`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await prepare(page, result(kind));
      await assertReadableStage(page, 'idle');
      await page.getByRole('button', { name: '開始分析' }).click();
      await expect(page.getByRole('button', { name: '重播', exact: true })).toBeEnabled();
      const stage = page.locator('.story-stage');
      const next = page.getByRole('button', { name: '下一步', exact: true });
      const visited: string[] = [];
      for (let step = 0; step < 10; step++) {
        const phase = (await stage.getAttribute('data-phase'))!;
        visited.push(phase);
        await assertReadableStage(page, phase);
        if (kind === 'failed' && viewport.height === 720 && phase === 'proposal') {
          const path = test.info().outputPath('verified-reservation-proposal.png');
          await page.screenshot({ path });
          await test.info().attach('verified-reservation-proposal', { path, contentType: 'image/png' });
        }
        if (!await next.isEnabled()) break;
        await next.click();
      }
      expect(visited).toEqual(kind === 'failed'
        ? ['capture', 'perception', 'semantic', 'provenance', 'proposal', 'failed']
        : ['capture', 'perception', 'semantic', 'provenance', 'proposal', 'authorization', kind]);
      await page.getByRole('button', { name: '檢視細節' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  }
}
