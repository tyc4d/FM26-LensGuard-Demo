import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { DemoRun, StoryPhase } from '../../story';
import type { TraceNode } from '../../types';
import { displayLabel, fieldLabel, traceLabel } from '../../labels';

interface DemoStageProps {
  phase: StoryPhase;
  run: DemoRun;
  playing: boolean;
  onImpactEnd?: () => void;
  children?: ReactNode;
}

const phaseNames: Record<StoryPhase, string> = {
  idle: '準備觀察', capture: '擷取當下', perception: '讀取場景', semantic: '形成理解',
  provenance: '追溯來源', proposal: '提出行動', authorization: '檢查授權',
  blocked: '防護結果', allowed: '授權結果', executed: '模擬結果', failed: '分析結果',
};

function itemStyle(index: number): CSSProperties {
  return { '--story-item': index } as CSSProperties;
}

function shortLabel(value: string, limit = 15) {
  const characters = Array.from(value);
  return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : value;
}

function sourceLabel(run: DemoRun) {
  const value = run.criticalValue;
  if (!value) return '尚無可追溯的值';
  if (value.source_type === 'model') return '模型產生・來源未驗證';
  if (value.source_type === 'camera') return run.real ? '相機觀察資料' : '相機來源・模擬範例';
  if (value.source_type === 'user') return '使用者提供';
  return '系統提供';
}

function authorityLabel(value: string | null | undefined) {
  if (!value) return '尚未提供';
  if (value === 'none' || value === 'NONE') return '無行動授權';
  return displayLabel(value);
}

function actualAuthority(run: DemoRun) {
  return run.policy?.source_authority ? authorityLabel(run.policy.source_authority)
    : run.criticalValue?.authority.length ? run.criticalValue.authority.map(authorityLabel).join('、') : '尚未提供';
}

function ProvenanceMetadata({ run }: { run: DemoRun }) {
  const value = run.criticalValue;
  if (!value) return null;
  const trust: Record<string, string> = { trusted: '受信任', untrusted: '未受信任', conditional: '有條件信任' };
  const entries = [
    ['來源識別', value.source_id], ['來源類型', displayLabel(value.source_type)],
    ['信任狀態', trust[value.trust] ?? value.trust], ['可用權限', value.authority.map(authorityLabel).join('、') || '尚未提供'],
  ];
  return <dl className="story-semantic-metadata" aria-label="關鍵值的來源與權限">{entries.map(([name, content], index) => <div key={name} style={itemStyle(index)}><dt>{name}</dt><dd title={content}>{content}</dd></div>)}</dl>;
}

function PolicyFacts({ run, final = false }: { run: DemoRun; final?: boolean }) {
  const affected = run.policy?.affected_argument || run.criticalArgument;
  return <dl className={final ? 'story-final-policy' : 'story-gate-facts'} aria-label={final ? '攔截依據' : '授權檢查資料'}>
    <div><dt>{final ? '攔下的參數' : '檢查的參數'}</dt><dd>{affected ? fieldLabel(affected) : '尚未提供'}</dd></div>
    <div><dt>需要的權限</dt><dd>{authorityLabel(run.policy?.required_authority)}</dd></div>
    <div><dt>實際的權限</dt><dd>{actualAuthority(run)}</dd></div>
  </dl>;
}

function SnapshotContents({ run, phase }: { run: DemoRun; phase: StoryPhase }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = imageSize ? Math.min(size.width / imageSize.width, size.height / imageSize.height) : 1;
  const width = imageSize ? imageSize.width * scale : size.width;
  const height = imageSize ? imageSize.height * scale : size.height;
  const showRegions = phase === 'perception' && (!run.frameUrl || imageSize !== null);
  return <div ref={viewport} className="story-frame-viewport">
    {run.frameUrl ? <img src={run.frameUrl} alt="本次分析使用的固定畫面" onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
      : <div className="story-scene-placeholder"><svg viewBox="0 0 100 70" aria-hidden="true"><rect x="9" y="8" width="82" height="54" rx="5" /><path d="m12 53 22-23 18 17 14-13 24 25M72 23h.1" /></svg><p>{run.real ? '本次未保留畫面預覽' : '模擬情境觀察'}</p></div>}
    {showRegions && <div className="story-region-plane" style={{ left: (size.width - width) / 2, top: (size.height - height) / 2, width, height }}>
      {run.detections.map((region, index) => <div key={region.id} className="story-region" data-kind={region.kind} style={{ ...itemStyle(index), left: `${region.bbox.x * 100}%`, top: `${region.bbox.y * 100}%`, width: `${region.bbox.width * 100}%`, height: `${region.bbox.height * 100}%` }}>
        <span>{run.real ? '回傳區域' : '模擬區域'} {index + 1}</span><p>{region.text}</p>
      </div>)}
    </div>}
  </div>;
}

function MiniGraph({ run }: { run: DemoRun }) {
  const marker = `story-arrow-${useId().replace(/:/g, '')}`;
  const nodes = run.traceNodes.filter(node => node.id !== 'policy' && node.id !== 'outcome');
  const main = nodes.filter(node => node.source !== 'user');
  const users = nodes.filter(node => node.source === 'user');
  const positions = new Map<string, { x: number; y: number }>();
  const mainY = users.length ? 130 : 42;
  main.forEach((node, index) => positions.set(node.id, { x: 16 + index * 196, y: mainY }));
  users.forEach((node, index) => positions.set(node.id, { x: 16 + index * 196, y: 18 }));
  const edges = run.traceEdges.filter(edge => positions.has(edge.from) && positions.has(edge.to));
  const untrustedObservation = run.criticalValue?.source_type === 'camera'
    && run.criticalValue.trust === 'untrusted'
    && !run.criticalValue.authority.some(authority => authority === 'delegated' || authority === 'task');
  const width = Math.max(main.length, users.length, 1) * 196 + 12;
  const labelFor = (node: TraceNode) => node.id === 'value' || node.id === 'region' ? node.label : traceLabel(node.label);
  if (!nodes.length) {
    const lineage = run.criticalValue?.lineage || [];
    return lineage.length ? <div className="story-lineage-fallback"><p>關鍵值所附的來源鏈</p><ol>{lineage.map((entry, index) => <li key={`${index}-${entry}`} style={itemStyle(index)} title={entry}>{entry}</li>)}</ol><p>依本次回傳的來源鏈順序呈現；尚未提供節點連線圖。</p></div>
      : <div className="story-unavailable"><span className="story-rule-mark" aria-hidden="true">—</span><p>本次尚未提供來源紀錄。</p></div>;
  }
  return <div className="story-graph-wrap">
    <svg className="story-graph" viewBox={`0 0 ${width} ${mainY + 104}`} role="img" aria-label={`本次來源紀錄：${nodes.map(labelFor).join('、')}`}>
      <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="m1 1 5 3-5 3" fill="none" stroke="currentColor" /></marker></defs>
      {edges.map((edge, index) => {
        const from = positions.get(edge.from)!;
        const to = positions.get(edge.to)!;
        const startX = from.x + 172;
        const startY = from.y + 37;
        const endX = to.x - 5;
        const endY = to.y + 37;
        const path = `M${startX} ${startY} C${startX + 18} ${startY},${endX - 18} ${endY},${endX} ${endY}`;
        const sensitive = untrustedObservation && edge.from === 'value' && edge.to === 'argument';
        return <g key={`${edge.from}-${edge.to}`} data-sensitive={sensitive}>
          {sensitive && <title>未受信任的相機觀察值流向行動參數；尚需授權判定。</title>}
          <path className="story-graph-edge" style={itemStyle(index)} pathLength="1" markerEnd={`url(#${marker})`} d={path} />
          <path className="story-graph-pulse" style={itemStyle(index)} pathLength="1" d={path} aria-hidden="true" />
        </g>;
      })}
      {nodes.map((node, index) => {
        const position = positions.get(node.id)!;
        const label = labelFor(node);
        return <g key={node.id} className={`story-graph-node${node.source === 'user' ? ' story-graph-node--user' : ''}${node.id === 'value' ? ' story-graph-node--value' : ''}`} transform={`translate(${position.x},${position.y})`} style={itemStyle(index)}>
          <title>{label}・{displayLabel(node.type)}{node.source ? `・來源：${displayLabel(node.source)}` : ''}{node.id === 'value' && run.criticalValue ? `・來源識別：${run.criticalValue.source_id}・來源鏈：${run.criticalValue.lineage.join(' → ') || '尚未提供'}` : ''}</title>
          <rect width="172" height="74" rx="10" />
          <text x="86" y="30" className="story-node-label" textAnchor="middle">{shortLabel(label, 12)}</text>
          <text x="86" y="53" className="story-node-type" textAnchor="middle">{shortLabel(displayLabel(node.type), 13)}</text>
        </g>;
      })}
    </svg>
    <p className="story-graph-caption">{run.real && !run.semanticGrounding ? '影像 → 模型 → 提案；目前僅有傳輸來源，未驗證語意對應。' : run.real ? '依本次回傳的來源紀錄呈現。' : '此圖使用本次模擬情境的來源紀錄。'}</p>
    {untrustedObservation && <p className="story-graph-boundary-note">觀察值正流向行動參數；讀取資訊，不會自動取得行動權限。</p>}
  </div>;
}

function ActionCard({ run }: { run: DemoRun }) {
  if (!run.action) return <div className="story-action-card story-action-card--empty"><span>尚未產生有效提案</span></div>;
  return <div className="story-action-card">
    <span className="story-overline">模型提出</span>
    <h3>{displayLabel(run.action.tool)}</h3>
    <span className="story-source-badge">來源：{sourceLabel(run)}</span>
    <dl>{Object.entries(run.action.arguments).map(([name, value], index) => <div key={name} data-critical={name === run.argumentName} style={itemStyle(index)}><dt>{fieldLabel(name)}</dt><dd title={value.value}>{value.value}</dd></div>)}</dl>
    {run.action.validation_status === 'invalid' && <p className="story-action-validation">這份提案尚未通過資料驗證</p>}
  </div>;
}

function FinalSymbol({ kind }: { kind: 'blocked' | 'allowed' | 'executed' | 'failed' }) {
  return <svg className="story-final-symbol" viewBox="0 0 100 100" aria-hidden="true">
    {kind === 'blocked' || kind === 'allowed' ? <>
      <path className="story-shield-outline" pathLength="1" d="M50 10 82 22v25c0 21-14 33-32 43C32 80 18 68 18 47V22Z" />
      {kind === 'allowed' ? <path className="story-symbol-stroke" d="m34 49 11 12 24-27" /> : <path className="story-symbol-stroke" d="M34 50h32" />}
    </> : kind === 'executed' ? <><circle cx="50" cy="50" r="37" /><path className="story-symbol-stroke" d="M28 50h42M55 35l15 15-15 15" /></> : <><circle cx="50" cy="50" r="37" /><path className="story-symbol-stroke" d="M50 28v26M50 67v3" /></>}
  </svg>;
}

export function DemoStage({ phase, run, playing, onImpactEnd, children }: DemoStageProps) {
  const inputPhase = phase === 'idle' || phase === 'capture';
  const requestedFinal = ['blocked', 'allowed', 'executed', 'failed'].includes(phase);
  let finalKind: 'blocked' | 'allowed' | 'executed' | 'failed' = 'failed';
  if (run.raw?.status !== 'failed') {
    if (phase === 'blocked' && (run.outcome?.status === 'blocked' || run.policy?.result === 'block')) finalKind = 'blocked';
    if (phase === 'allowed' && (run.outcome?.status === 'allowed' || run.policy?.result === 'allow')) finalKind = 'allowed';
    if (phase === 'executed' && run.outcome?.status === 'executed') finalKind = 'executed';
  }
  const shownPhase = requestedFinal ? finalKind : phase;
  const hasValue = !!run.criticalValue;
  const showValue = hasValue && !['idle', 'capture', 'perception'].includes(phase);
  const missingDetails = run.raw?.error_code === 'reservation_details_missing';
  const finalHeading = finalKind === 'blocked' ? '資訊被讀取。\n行動被攔下。'
    : finalKind === 'allowed' ? '授權成立。\n這次行動被允許。'
    : finalKind === 'executed' ? '防護已略過。\n行動已模擬執行。'
    : missingDetails ? '資料還不完整。\n先補齊，再前進。' : '分析尚未完成。\n這次沒有執行行動。';
  const finalReason = finalKind === 'failed' ? run.raw?.error || '本次沒有可呈現的有效判定，請查看詳細資料。' : run.outcome?.detail || run.policy?.reason || '';
  return <section className="story-stage" data-phase={shownPhase} data-playing={playing} aria-label="逐步展示畫面" style={{ '--story-play-state': playing ? 'running' : 'paused' } as CSSProperties}>
    <header className="story-context">
      <span className="story-principle">讀取 <b>≠</b> 服從</span>
      <div className="story-query" title={run.query}><span>你的請求</span><p>{run.query || '準備好影像，再給 AI 一個任務。'}</p></div>
      <span className="story-phase-label">{phaseNames[shownPhase]}</span>
    </header>

    <div className="story-intro" hidden={!inputPhase}>
      <p className="story-overline">{phase === 'capture' ? '保留這一刻的觀察' : 'LensGuard・從感知到行動的防護'}</p>
      <h1>{phase === 'capture' ? <>把眼前的畫面，<br />交給 AI 讀取。</> : <>世界能為 AI 提供資訊，<br /><span>不該控制 AI。</span></>}</h1>
    </div>
    <div className="story-live-input" hidden={!inputPhase} inert={phase === 'capture'}>{children}</div>

    <figure className="story-scene" hidden={inputPhase} data-has-image={!!run.frameUrl}>
      <SnapshotContents key={run.frameUrl || 'no-frame'} run={run} phase={phase} />
      <figcaption>{run.real ? '本次輸入畫面' : '模擬情境'}{run.raw?.frame_id && <span>{run.raw.frame_id}</span>}</figcaption>
    </figure>

    <div className="story-value-token" hidden={!showValue} data-source={run.criticalValue?.source_type}>
      <span>{run.argumentName ? fieldLabel(run.argumentName) : '關鍵值'}</span>
      <strong title={run.criticalValue?.value}>{run.criticalValue?.value}</strong>
      <small><i aria-hidden="true" />{sourceLabel(run)}</small>
    </div>

    {!inputPhase && <div className="story-focus" key={shownPhase}>
      {phase === 'perception' && <div className="story-perception-copy">
        <p className="story-overline">01・觀察</p>
        <h2>先看見世界，<br />再理解內容。</h2>
        <p className="story-lead">{run.detections.length ? '場景中的文字，進入了分析流程。' : '影像已送入模型；本次未提供文字區域辨識。'}</p>
        <div className="story-evidence-note"><span className="story-dot" />{run.real ? run.semanticGrounding ? '依本次回傳區域呈現' : '模型推論；語意區域尚未對應' : '場景與區域來自模擬範例'}</div>
      </div>}
      {phase === 'semantic' && <div className="story-semantic-copy">
        <p className="story-overline">02・讀取</p>
        <h2>{hasValue ? '模型讀出了一個關鍵值。' : '有了觀察，還需要理解。'}</h2>
        <ProvenanceMetadata run={run} />
        <p className="story-lead">{hasValue ? '讀取這個值，不代表取得使用它的授權。' : run.raw?.status === 'running' ? '正在等候本機模型回覆。' : '模型尚未產生可用的行動值。'}</p>
        {!hasValue && <div className="story-empty-value">尚無關鍵值</div>}
      </div>}
      {phase === 'provenance' && <div className="story-provenance-copy">
        <p className="story-overline">03・追溯</p><h2>知道內容，<br />也要知道來源。</h2>
        <MiniGraph run={run} />
      </div>}
      {(phase === 'proposal' || phase === 'authorization') && <div className="story-proposal-copy">
        <p className="story-overline">{phase === 'proposal' ? '04・提案' : '04・提案 → 授權檢查'}</p>
        <h2>{phase === 'proposal' ? '一個值，正要變成行動。' : run.raw?.guard_enabled === false ? '這次示範，\n略過授權判定。' : '從資訊到行動，\n還需要授權。'}</h2>
        <div className="story-gate-crossing">
          <ActionCard run={run} />
          <div className="story-connection" aria-hidden="true"><span /><i /></div>
          <div className="story-gate" data-enabled={run.raw?.guard_enabled !== false}><svg viewBox="0 0 60 70" aria-hidden="true"><path d="M30 5 52 14v19c0 15-10 24-22 32C18 57 8 48 8 33V14Z" /><path d="M23 29h14v17H23ZM26 29v-4a4 4 0 0 1 8 0v4" /></svg><strong>LensGuard</strong><span>{run.raw?.guard_enabled === false ? '本次防護已關閉' : phase === 'authorization' ? '確認來源是否具有權限' : '授權邊界'}</span>
            {phase === 'authorization' && <><PolicyFacts run={run} /><p className="story-gate-status" data-result={run.policy?.result || 'pending'}>{run.raw?.guard_enabled === false ? '判定已略過' : run.policy ? run.policy.result === 'allow' ? '判定：允許' : '判定：拒絕' : '等待實際授權判定'}</p><p className="story-gate-reason">{run.policy?.reason || (run.raw?.guard_enabled === false ? '防護關閉，未套用授權規則。' : '收到規則判定後，才會呈現結果。')}</p></>}
          </div>
        </div>
        <p className="story-gate-question">{run.raw?.guard_enabled === false ? '未套用授權判定；請接續查看模擬結果。' : run.criticalValue?.authority.includes('delegated') ? '本次值附有使用者授權紀錄，仍依實際規則判定。' : '提供資訊的來源，有權決定這次行動嗎？'}</p>
      </div>}
      {requestedFinal && <div className="story-final" data-result={finalKind} onAnimationEnd={event => {
        if (playing && event.target === event.currentTarget && event.animationName === 'story-focus-enter') onImpactEnd?.();
      }}>
        <div className="story-final-visual">
          {finalKind !== 'failed' && <div className="story-result-impact" data-result={finalKind} aria-hidden="true"><span className="story-impact-card">行動提案<small>{run.action ? displayLabel(run.action.tool) : '尚未提供'}</small>{run.criticalValue && <span className="story-impact-value" title={run.criticalValue.value}>{run.criticalValue.value}</span>}</span><i className="story-impact-boundary" />{finalKind === 'blocked' && <i className="story-impact-ripple" />}</div>}
          <FinalSymbol kind={finalKind} />
          {finalKind !== 'failed' && <p className="story-impact-caption">{finalKind === 'blocked' ? '行動停在授權邊界' : finalKind === 'allowed' ? '授權通過，允許模擬行動' : '略過防護，模擬行動已執行'}</p>}
        </div>
        <div><p className="story-overline">{finalKind === 'blocked' ? 'LensGuard・行動已阻擋' : finalKind === 'allowed' ? 'LensGuard・行動已允許' : finalKind === 'executed' ? '模擬執行結果' : '分析尚未完成'}</p>
          <h2>{finalHeading}</h2><p className="story-final-reason">{finalReason}</p>
          {finalKind === 'blocked' && <PolicyFacts run={run} final />}
          {run.outcome?.simulation_only && finalKind !== 'failed' && <p className="story-no-side-effects">沒有發生外部副作用・本次行動僅為模擬</p>}
          {run.outcome?.simulation_only && run.outcome.attack_success === true && finalKind !== 'failed' && <p className="story-attack-success">模擬攻擊成功</p>}
          {finalKind !== 'failed' && <><p className="story-final-motto">讀取 <b>≠</b> 服從</p><p className="story-final-principle">世界能為 AI 提供資訊，<br className="story-mobile-break" />不該控制 AI。</p></>}
          {finalKind === 'failed' && run.raw?.validation_issues && <ul className="story-missing-fields">{run.raw.validation_issues.map(issue => <li key={issue.argument}>{fieldLabel(issue.argument)}：{issue.message}</li>)}</ul>}
        </div>
      </div>}
    </div>}
    <footer className="story-stage-footnote"><span><i className="story-dot" />{run.real ? '真實模型推論' : '模擬情境展示'}</span><span>所有外部行動皆為模擬</span></footer>
  </section>;
}
