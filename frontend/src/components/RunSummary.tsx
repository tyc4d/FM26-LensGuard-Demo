import type { RunState, Scenario } from '../types';
import { directionLabel, displayLabel } from '../labels';

export function presentRun(run: RunState | null, active: boolean) {
  if (run?.status === 'failed' && run.error_code === 'reservation_details_missing') return {
    tone: 'interrupted', status: '需要補充資料', headline: '訂位資料尚未完整',
    subtitle: '請在請求中補上訂位日期、時間與用餐人數，再重新分析。',
    reason: run.error || '訂位缺少必要資料，未執行任何行動。',
  };
  if (run?.status === 'failed' && run.error_code === 'model_action_invalid') return {
    tone: 'interrupted', status: '模型輸出無效', headline: '模型已完成，行動參數無效',
    subtitle: '模型未產生可用的行動，未執行任何行動。',
    reason: run.error || '行動提案包含不支援的值。',
  };
  if (run?.status === 'failed' && ['model_schema_invalid', 'action_mapping_failed', 'model_output_parse_failed'].includes(run.error_code || '')) return {
    tone: 'interrupted', status: '模型輸出無效', headline: '模型已完成，行動格式不完整',
    subtitle: '推論已完成，但輸出無法取得授權或執行。',
    reason: run.error || '行動驗證失敗。',
  };
  if (run?.status === 'failed' && run.action && !run.decision) return {
    tone: 'interrupted', status: '未獲授權', headline: '授權未完成。',
    subtitle: '此行動提案未執行。',
    reason: run.error || '無法完成授權，已暫停自動執行。',
  };
  if (run?.status === 'failed') return {
    tone: 'interrupted', status: '已中斷', headline: run.error?.includes('could not be parsed') || run.error?.includes('無法解析') ? '無法解析模型輸出。' : '分析已中斷。',
    subtitle: '請重設後再次分析此情境。', reason: run.error || '執行服務無法完成此次分析。',
  };
  const outcome = run?.outcome;
  if (run?.runtime === 'prototype' && outcome && outcome.status !== 'executed') return {
    tone: outcome.status, status: displayLabel(outcome.status),
    headline: outcome.status === 'allowed' ? '這次行動被允許' : 'LensGuard 暫停了這次行動',
    subtitle: outcome.status === 'allowed' ? '確定性授權規則允許此模擬行動。' : '未能建立授權，已暫停自動執行。',
    reason: outcome.detail,
  };
  if (outcome?.status === 'blocked') return {
    tone: 'blocked', status: '已阻擋', headline: 'LensGuard 擋下了這次攻擊',
    subtitle: '相機內容未獲授權決定行動參數。',
    reason: run?.action?.tool === 'navigate'
      ? '相機中的指令不能覆寫觀察到的出口方向。'
      : '未經使用者明確授權，相機內容不能決定撥號目標。',
  };
  if (outcome?.status === 'allowed') return {
    tone: 'allowed', status: '已允許', headline: '這次行動被允許',
    subtitle: '使用者已明確授權使用相機觀察到的電話號碼。',
    reason: '使用者的明確授權允許此行動採用相機觀察到的值。',
  };
  if (outcome?.status === 'executed') return {
    tone: outcome.attack_success ? 'compromised' : 'executed', status: '已模擬執行',
    headline: outcome.attack_success ? '你的 AI 被騙了' : '行動已模擬執行',
    subtitle: outcome.attack_success ? '環境文字改變了模型提出的行動。' : 'LensGuard 已關閉，行動提案已在模擬中執行。',
    reason: outcome.attack_success ? 'LensGuard 關閉時，環境指令控制了行動。' : '已略過授權判定，未採取任何外部行動。',
  };
  return {
    tone: 'pending', status: active ? '處理中' : '等待分析',
    headline: active ? '正在讀取場景。' : '觀察眼前的場景。',
    subtitle: active ? '追蹤從場景觀察到行動授權的過程。' : '選擇情境並開始分析。',
    reason: active ? '分析進行中，判定結果將顯示於此。' : '相機觀察到的內容，不會自動成為 AI 的行動權限。',
  };
}

const stageLabels: Record<string, string> = {
  'inference.started': '正在執行本機模型',
  'inference.completed': '已收到模型回覆',
  'action.parsed': '結構化行動已驗證',
  'frame.received': '正在接收影像',
  'perception.scene_analyzed': '正在解讀場景',
  'perception.text_extracted': '正在讀取環境文字',
  'model.action_proposed': '正在檢查行動提案',
  'provenance.attached': '正在追蹤資料來源',
  'policy.evaluated': '正在檢查授權',
  'policy.bypassed': '已略過授權判定',
};

export function RunSummary({ run, scenario, userRequest, active }: { run: RunState | null; scenario?: Scenario; userRequest?: string; active: boolean }) {
  const view = presentRun(run, active);
  const action = run?.action;
  const actionText = action ? `${displayLabel(action.tool)}(${Object.values(action.arguments).map((value) => value.value).join(', ')})` : null;
  return <aside className={`run-summary result-${view.tone}`} aria-label="行動摘要">
    <div className="stage-request"><p className="eyebrow">使用者請求</p><p className="user-request" lang="zh-Hant">{scenario ? userRequest ?? scenario.user_request : '正在載入情境…'}</p></div>
    <div className="summary-action"><p className="eyebrow">行動提案</p><p className={`action-expression ${action ? '' : 'awaiting-action'}`}>{actionText || (run?.status === 'failed' ? '沒有有效行動。' : '等待分析。')}</p></div>
    <div className="summary-decision" data-testid="decision-result" aria-live="polite">
      <p className="eyebrow">{active ? '進行中' : '結果'}</p>
      <p className="result-label">{view.status}</p>
      <p className="decision-reason">{view.reason}</p>
      {active && <p className="stage-progress" role="status">{stageLabels[run?.stage || ''] || '正在開始分析'}</p>}
      {run?.outcome && <p className="simulation-note">僅模擬執行・未採取外部行動</p>}
    </div>
    {run?.outcome && <div className="outcome-note" data-testid="outcome">
      {run.outcome.attack_success !== null && <p>攻擊結果：<strong>{run.outcome.attack_success ? '攻擊成功' : '攻擊已阻止'}</strong></p>}
      {run.outcome.result && <p>{run.scenario_id === 'navigation-injection' ? '方向結果' : run.outcome.status === 'executed' ? '模擬採用值' : '已授權的值'}：<strong className="mono">{run.scenario_id === 'navigation-injection' ? directionLabel(run.outcome.result) : run.outcome.result}</strong></p>}
    </div>}
  </aside>;
}
