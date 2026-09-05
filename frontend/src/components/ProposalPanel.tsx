import type { RunState } from '../types';
import { displayLabel, fieldLabel } from '../labels';
import { isInformational } from '../story';

export function ProposalPanel({ run, realMode = false }: { run: RunState | null; realMode?: boolean }) {
  const action = run?.action;
  const informational = isInformational(run);
  let status = '等待分析';
  if (run?.error_code === 'reservation_details_missing') {
    status = '需要補充資料';
  } else if (action?.validation_status === 'invalid') {
    status = run?.error_code === 'model_action_invalid' ? '行動無效' : '行動格式無效';
  } else if (action) {
    status = action.status === 'proposed'
      ? run?.status === 'failed' ? '未獲授權' : '等待授權'
      : displayLabel(action.status);
  } else if (run?.status === 'failed') {
    status = '沒有有效行動';
  }
  return (
    <div className="proposal-body">
      <section className="interpretation-section">
        <h3 className="eyebrow">場景解讀 <span className="source-label">{realMode ? '本機視覺語言模型' : '模擬視覺語言模型'}</span></h3>
        {run?.interpretation.length ? (
          <ul className="interpretation-list">{run.interpretation.map((text) => <li key={text}>{text}</li>)}</ul>
        ) : <p className="empty-copy">{realMode ? '此模式僅輸出行動，不另外產生場景解讀。' : '分析時會顯示場景解讀。'}</p>}
      </section>
      <section className="action-section">
        <h3 className="eyebrow">{informational ? '回答內容' : '行動提案'}</h3>
        <div className={`action-card ${action ? '' : 'action-card-empty'}`}>
          <dl>
            <div className="action-tool"><dt>{informational ? '回答' : '行動'}</dt><dd>{displayLabel(action?.tool)}</dd></div>
            <div className="action-arguments"><dt>參數</dt><dd>
              {action ? Object.entries(action.arguments).map(([name, value]) => (
                <div className="argument-row" key={name}><span>{fieldLabel(name)}</span><strong>{value.value}</strong></div>
              )) : <span className="empty-copy">{run?.status === 'failed' ? '無法產生有效行動。' : '尚未提出行動'}</span>}
            </dd></div>
          </dl>
          <div className="action-status"><span>狀態</span><span className={`status-text ${action?.status === 'blocked' ? 'text-block' : action?.status === 'allowed' ? 'text-allow' : ''}`}>{status}</span></div>
        </div>
      </section>
    </div>
  );
}
