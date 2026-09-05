import type { StoryPhase } from '../../story';

const steps: { name: string; caption: string; phase: StoryPhase }[] = [
  { name: '觀察', caption: 'SEE', phase: 'capture' },
  { name: '讀取', caption: 'READ', phase: 'semantic' },
  { name: '追溯', caption: 'TRACE', phase: 'provenance' },
  { name: '提案', caption: 'DECIDE', phase: 'proposal' },
  { name: '防護', caption: 'PROTECT', phase: 'authorization' },
];

function stepFor(phase: StoryPhase) {
  if (phase === 'idle') return -1;
  if (phase === 'capture' || phase === 'perception') return 0;
  if (phase === 'semantic') return 1;
  if (phase === 'provenance') return 2;
  if (phase === 'proposal' || phase === 'authorization') return 3;
  return 4;
}

export function PipelineProgress({ phase, onSelect }: { phase: StoryPhase; onSelect?: (phase: StoryPhase) => void }) {
  const current = stepFor(phase);
  return <nav className="story-pipeline" aria-label="展示流程">
    <ol>{steps.map((step, index) => {
      const content = <><span className="story-step-number">{String(index + 1).padStart(2, '0')}</span><span className="story-step-name">{step.name}<span className="story-step-caption" lang="en">{step.caption}</span></span></>;
      return <li key={step.name} data-state={index < current ? 'complete' : index === current ? 'current' : 'upcoming'}>
        {onSelect
          ? <button type="button" onClick={() => onSelect(index === 4 && current === 4 ? phase : step.phase)} aria-current={index === current ? 'step' : undefined} aria-label={`第 ${index + 1} 步：${step.name}`}>{content}</button>
          : <span aria-current={index === current ? 'step' : undefined}>{content}</span>}
      </li>;
    })}</ol>
  </nav>;
}
