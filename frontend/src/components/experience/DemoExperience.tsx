import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { STAGES, STAGE_NAMES, presentBaseline, presentProtectedOutcome, type Stage, type Presentation, type Piece } from '../../experience';
import type { RunState } from '../../types';

interface Props {
  stage: Stage;
  presentation: Presentation;
  baseline: RunState | null;
  showComparison: boolean;
  imageUrl: string | null;
  imageAlt: string;
  query: string;
  sourceLabel: string;
  busy: boolean;
  comparing: boolean;
  error: string | null;
  onChooseInput: () => void;
}

function Mark({ piece }: { piece: Piece }) {
  return <span className={`piece-mark piece-mark--${piece.disposition}`} aria-hidden="true">{piece.disposition === 'ignore' ? '×' : piece.disposition === 'unknown' ? '?' : '✓'}</span>;
}

const roleLabels: Record<Piece['label'], string> = {
  OBSERVATION: 'Observation', CONTACT: 'Contact information', INSTRUCTION: 'Injected instruction', QUOTED: 'Quoted text', UNRESOLVED: 'Unresolved',
};

export function DemoExperience({ stage, presentation, baseline, showComparison, imageUrl, imageAlt, query, sourceLabel, busy, comparing, error, onChooseInput }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 1000, height: 625 });
  const [imageSize, setImageSize] = useState({ width: 1000, height: 625 });
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setBounds({ width, height });
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(bounds.width / imageSize.width, bounds.height / imageSize.height);
  const planeStyle = stage === 'decide' || stage === 'result' ? bounds
    : { width: imageSize.width * scale, height: imageSize.height * scale };
  const { pieces, result } = presentation;
  // Focus the influence animation on selected evidence and actual denied content.
  // Unrelated evidence remains available in details, without an invented influence path.
  const useful = pieces.find(piece => piece.disposition === 'use' && piece.label === 'CONTACT')
    ?? pieces.find(piece => piece.disposition === 'use') ?? pieces.find(piece => piece.disposition === 'keep');
  const instruction = pieces.find(piece => piece.disposition === 'ignore');
  const focus = [useful, instruction].filter((piece): piece is Piece => !!piece);
  const relevant = pieces.filter(piece => piece === useful || ['ignore', 'unknown'].includes(piece.disposition));
  // Bound the presentation independently of OCR volume. Keep the useful evidence
  // and rejected instruction first; all original regions remain in the run/drawer.
  const displayed = [...focus, pieces.find(piece => piece.disposition === 'unknown')]
    .filter((piece): piece is Piece => !!piece).slice(0, 2);
  const extraRegions = relevant.length - displayed.length;
  const spatial = displayed.filter(piece => piece.bbox);
  const unlocated = displayed.filter(piece => !piece.bbox);
  const showPieces = stage === 'separate' || stage === 'decide';
  const longResult = result.heading.length > (/[\u3400-\u9fff]/u.test(result.heading) ? 4 : 12);
  const numericAnswer = /^[+\d ()-]+$/.test(result.heading);
  const without = presentBaseline(baseline);
  const withGuard = presentProtectedOutcome(presentation);
  const normalize = (value: string) => value.replace(/[\s()-]/g, '').toLocaleLowerCase();
  const sameOutcome = without.value !== null && withGuard.value !== null && without.kind === withGuard.kind
    && normalize(without.value) === normalize(withGuard.value);

  function decisionTop(index: number) {
    if (instruction && useful) return showComparison ? index === 1 ? 40 : 12 : index === 1 ? 59 : 24;
    return showComparison ? 25 : 40;
  }

  function pieceStyle(piece: Piece, index: number): CSSProperties {
    const focusIndex = focus.findIndex(item => item.id === piece.id);
    if (stage === 'decide') return {
      left: '10%', top: `${decisionTop(focusIndex)}%`,
      width: '44%', height: '16%', opacity: focusIndex < 0 ? 0 : 1,
      pointerEvents: focusIndex < 0 ? 'none' : undefined,
    };
    return piece.bbox ? {
      left: `${piece.bbox.x * 100}%`, top: `${piece.bbox.y * 100}%`,
      width: `${piece.bbox.width * 100}%`, height: `${piece.bbox.height * 100}%`,
    } : { left: '8%', top: `${unlocated.length === 1 ? 34 : 15 + index * 37}%`, width: '84%', height: '22%' };
  }
  function token(piece: Piece, index: number) {
    return <div key={piece.id} className={`semantic-piece${!piece.bbox ? ' semantic-piece--unlocated' : ''}`}
      data-disposition={piece.disposition} data-region-id={piece.id} style={pieceStyle(piece, index)}
      aria-label={`${roleLabels[piece.label]}: ${piece.content}`} aria-hidden={stage === 'decide' && !focus.includes(piece) ? true : undefined}>
      <span className="semantic-value">{(stage === 'decide' ? piece.value : piece.content).replace(/\s+/gu, ' ').trim()}</span>
      <span className="semantic-label">{stage === 'separate' && <Mark piece={piece} />}{stage === 'separate' ? roleLabels[piece.label] : piece.disposition === 'ignore' ? 'Unsafe instruction' : ['use', 'keep'].includes(piece.disposition) ? 'Usable information' : 'Unresolved'}</span>
    </div>;
  }

  return <section className="demo-experience" aria-label="LensGuard interactive demo">
    <div className="stage-index" aria-live="polite" aria-atomic="true"><span>{String(STAGES.indexOf(stage) + 1).padStart(2, '0')} <i>/ 04</i></span><strong>{STAGE_NAMES[STAGES.indexOf(stage)]}</strong></div>
    <div ref={viewport} className="central-stage" data-stage={stage} data-comparison={showComparison} aria-busy={busy}>
      <div className="scene-plane" style={planeStyle}>
        {imageUrl && <img className="scene-image" src={imageUrl} alt={imageAlt} aria-hidden={stage === 'result'}
          onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />}
        {showPieces && spatial.map(token)}
      </div>
      {!imageUrl && stage === 'input' && <button className="empty-scene" onClick={onChooseInput}><span className="empty-viewfinder" aria-hidden="true">⌜<i />⌟</span><span>Let the AI see the scene</span><small>Choose an image or start the camera</small></button>}
      {showPieces && unlocated.length > 0 && <div className="unlocated-evidence">{stage === 'separate' && <small className="extraction-caption">Extracted text</small>}{unlocated.map(token)}</div>}
      {stage === 'separate' && extraRegions > 0 && <small className="more-regions" title="Press D to view the full text.">{extraRegions} more items</small>}
      {stage === 'separate' && <div className="stage-message" role="status">{presentation.clean ? <><span className="confirmation">✓</span> No injected instructions detected.</> : !presentation.hasSemantics ? 'No text classifications available yet.' : pieces.some(piece => piece.disposition === 'unknown') ? 'Some text remains unresolved.' : null}</div>}
      {stage === 'decide' && <div className="decision-effects" aria-label="Information selection results">
        {focus.map((piece, index) => <div className="decision-effect" key={piece.id} data-disposition={piece.disposition}
          style={{ top: `${decisionTop(index) + 8}%` }}>
          <Mark piece={piece} /><span>{piece.disposition === 'ignore' ? 'Ignore' : piece.disposition === 'use' ? 'Use' : 'Keep'}</span>
        </div>)}
        {!focus.length && <p className="stage-empty-message">No usable information is available yet.</p>}
      </div>}
      {stage === 'decide' && showComparison && <div className="decision-comparison" aria-label="LensGuard result comparison">
        <div className="comparison-row" data-guard="off"><span>Without LensGuard{without.detail && <small>{without.detail}</small>}</span><strong title={without.text}>{without.text}</strong></div>
        <div className="comparison-row" data-guard="on"><span>With LensGuard{withGuard.detail && <small>{withGuard.detail}</small>}</span><strong title={withGuard.text}>{withGuard.text}</strong></div>
        <small>{sameOutcome ? 'Same output this time' : 'Same image and request'} · {baseline?.runtime === 'mock' ? 'Sample comparison' : 'Actual run results'}</small>
      </div>}
      {stage === 'result' && <div className="stage-result" data-long={longResult} data-has-value={!!result.value} role="status">
        {result.confirmed && <span className="result-check" aria-label="Confirmed">✓</span>}
        {result.value ? <><p className="result-kicker">{result.simulation && result.heading === 'Calling' ? 'Simulating a call' : result.heading}</p><h1 className="result-contact">{result.value}</h1></> : <h1 className={numericAnswer ? 'result-contact' : undefined}>{result.heading}</h1>}
        <p className="result-caption">{result.caption}</p>
        {result.note && <p className="result-note">{result.note}</p>}
      </div>}
      {stage === 'input' && imageUrl && <span className="scene-source">{sourceLabel}</span>}
      {busy && <div className="analysis-indicator" role="status">{comparing ? 'Comparing the unprotected result' : 'Reading the scene'}<span aria-hidden="true">…</span></div>}
    </div>
    <div className="stage-undertext">
      {error ? <p className="experience-error" role="alert">{error}</p> : stage === 'input' && <p className="scene-request">{query ? `“${query}”` : 'Choose a scene and enter your request.'}</p>}
    </div>
  </section>;
}
