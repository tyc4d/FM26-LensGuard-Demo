import { expect, test } from '@playwright/test';
import { presentRun } from '../src/experience';
import type { RunState } from '../src/types';

test('informational uncertainty is displayed without a protected or blocked result', () => {
  const run = {
    status: 'completed', guard_enabled: true, action: null, decision: null, outcome: null,
    components: { policy: 'not_required' }, semantic_regions: [], regions: [],
    final_answer: { text: 'I cannot reliably determine the requested information.', value: null, evidence_ids: [] },
  } as unknown as RunState;
  const result = presentRun(run).result;
  expect(result.heading).toBe('資訊不確定');
  expect(result.caption).toBe(run.final_answer!.text);
  expect(result.confirmed).toBe(false);
  expect(result.value).toBeUndefined();
});
