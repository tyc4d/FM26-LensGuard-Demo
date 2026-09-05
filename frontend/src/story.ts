import type {
  DetectedRegion, PolicyDecision, ProposedAction, ProvenanceValue,
  RunOutcome, RunState, TraceEdge, TraceNode,
} from './types';

export type StoryPhase =
  | 'idle' | 'capture' | 'perception' | 'semantic' | 'provenance'
  | 'proposal' | 'authorization' | 'blocked' | 'allowed' | 'executed' | 'failed';

export const STORY_PHASES: readonly StoryPhase[] = [
  'idle', 'capture', 'perception', 'semantic', 'provenance', 'proposal',
  'authorization', 'blocked', 'allowed', 'executed', 'failed',
];

export interface DemoRun {
  raw: RunState | null;
  query: string;
  frameUrl: string | null;
  detections: DetectedRegion[];
  criticalArgument: string | null;
  criticalValue: ProvenanceValue | null;
  argumentName: string | null;
  traceNodes: TraceNode[];
  traceEdges: TraceEdge[];
  policy: PolicyDecision | null;
  action: ProposedAction | null;
  outcome: RunOutcome | null;
  real: boolean;
  semanticGrounding: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Display existing evidence; transport lineage never becomes semantic evidence. */
export function normalizeRun(
  run: RunState | null,
  context: { query: string; frameUrl: string | null },
): DemoRun {
  const action = run?.action ?? null;
  const arguments_ = action?.arguments ?? {};
  const affected = run?.decision?.affected_argument;
  const policyArgument = action && affected?.startsWith(`${action.tool}.`)
    ? affected.slice(action.tool.length + 1) : undefined;
  const issueArgument = run?.validation_issues?.[0]?.argument;
  const invalidArgument = action && issueArgument?.startsWith(`${action.tool}.`)
    ? issueArgument.slice(action.tool.length + 1) : undefined;
  const primaryArgument: Record<string, string> = {
    call_phone: 'number', navigate: 'direction', open_url: 'url',
    restaurant_reservation: 'number', safety_advice: 'safe_to_proceed',
  };
  const preferred = [policyArgument, invalidArgument, action ? primaryArgument[action.tool] : undefined]
    .find((name): name is string => name !== undefined && Object.hasOwn(arguments_, name));
  const argumentName = preferred ?? Object.keys(arguments_)[0] ?? null;
  const metadata = run?.runtime_metadata;
  const grounding = record(metadata?.provenance)?.semantic_grounding ?? metadata?.semantic_grounding;

  return {
    raw: run, query: context.query, frameUrl: context.frameUrl,
    detections: run?.regions ?? [],
    criticalArgument: action && argumentName ? `${action.tool}.${argumentName}` : null,
    criticalValue: argumentName ? arguments_[argumentName] : null,
    argumentName,
    traceNodes: run?.trace_nodes ?? [], traceEdges: run?.trace_edges ?? [],
    policy: run?.decision ?? null, action, outcome: run?.outcome ?? null,
    real: run?.runtime === 'prototype',
    semanticGrounding: grounding === 'verified' || record(grounding)?.status === 'verified',
  };
}

const TERMINAL_PHASES: readonly StoryPhase[] = ['blocked', 'allowed', 'executed', 'failed'];

/** Missing OCR, provenance, or policy is never filled with a presentation fixture. */
export function availableStoryPhases(run: RunState | null): StoryPhase[] {
  if (!run) return ['idle'];
  const events = new Set(run.events.map((event) => event.type));
  const hasEvent = (...types: string[]) => types.some((type) => events.has(type));
  const phases: StoryPhase[] = ['idle', 'capture'];
  const inferenceReceived = hasEvent('inference.completed') || run.raw_model_text != null;
  if (run.frame_id || run.regions.length || run.interpretation.length || run.action
      || hasEvent('frame.received', 'inference.started') || inferenceReceived) {
    phases.push('perception');
  }
  if (run.action || run.interpretation.length || run.regions.length) {
    phases.push('semantic');
  }
  const hasLineage = Object.values(run.action?.arguments ?? {}).some((value) => value.lineage.length > 0);
  if (run.trace_nodes.length || run.trace_edges.length || hasLineage
      || record(run.runtime_metadata?.provenance)) {
    phases.push('provenance');
  }
  if (run.action) phases.push('proposal');
  const bypassed = !run.guard_enabled && !!run.action
    && (hasEvent('policy.bypassed') || run.outcome?.status === 'executed');
  if (run.decision || bypassed) phases.push('authorization');
  if (run.status === 'failed') {
    phases.push('failed');
  } else if (run.status === 'completed' && run.action
      && run.action.validation_status !== 'invalid' && run.outcome) {
    // A result requires the corresponding actual authorization or bypass data.
    if (run.guard_enabled && run.decision?.result === 'block' && run.outcome.status === 'blocked') {
      phases.push('blocked');
    } else if (run.guard_enabled && run.decision?.result === 'allow' && run.outcome.status === 'allowed') {
      phases.push('allowed');
    } else if (bypassed && run.outcome.status === 'executed') {
      phases.push('executed');
    }
  }
  return phases;
}

export interface StoryState {
  phase: StoryPhase;
  playing: boolean;
  impactPlaying?: boolean;
  replay: boolean;
  runId: string | null;
  revision: number;
  available: StoryPhase[];
  maxAvailable: StoryPhase;
  settled: boolean;
}

export type StoryAction =
  | { type: 'RESET' }
  | { type: 'START'; autoplay?: boolean }
  | { type: 'UPDATE'; run: RunState | null; autoplay?: boolean }
  | { type: 'NEXT'; automatic?: boolean; revision?: number; animateImpact?: boolean }
  | { type: 'FINISH_IMPACT'; revision?: number }
  | { type: 'PREVIOUS' }
  | { type: 'TOGGLE_PLAY' }
  | { type: 'REPLAY'; autoplay?: boolean };

export const INITIAL_STORY_STATE: StoryState = {
  phase: 'idle', playing: false, impactPlaying: false, replay: false, runId: null, revision: 0,
  available: ['idle'], maxAvailable: 'idle', settled: false,
};

export function storyReducer(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_STORY_STATE, available: ['idle'], revision: state.revision + 1 };
    case 'START':
      return {
        ...INITIAL_STORY_STATE, phase: 'capture', playing: action.autoplay ?? true,
        available: ['idle', 'capture'], maxAvailable: 'capture', revision: state.revision + 1,
      };
    case 'UPDATE': {
      if (!action.run) return storyReducer(state, { type: 'RESET' });
      const incoming = availableStoryPhases(action.run);
      const newRun = state.runId !== action.run.id;
      const waitingForFirstRun = state.runId === null && state.available.includes('capture');
      const available = newRun ? incoming
        : STORY_PHASES.filter((phase) => state.available.includes(phase) || incoming.includes(phase));
      const phase = newRun && !waitingForFirstRun ? 'capture' : state.phase;
      const settled = action.run.status !== 'running';
      const atEnd = available.indexOf(phase) === available.length - 1;
      const playing = newRun && !waitingForFirstRun ? (action.autoplay ?? true) : state.playing;
      return {
        ...state, phase, available, maxAvailable: available[available.length - 1],
        runId: action.run.id, settled,
        playing: playing && !(settled && atEnd),
        impactPlaying: newRun ? false : state.impactPlaying,
        replay: newRun ? false : state.replay,
        revision: newRun ? state.revision + 1 : state.revision,
      };
    }
    case 'NEXT': {
      if (action.automatic && (!state.playing
          || action.revision !== undefined && action.revision !== state.revision)) return state;
      const index = state.available.indexOf(state.phase);
      const phase = state.available[index + 1] ?? state.phase;
      const atEnd = state.available.indexOf(phase) === state.available.length - 1;
      return {
        ...state, phase,
        playing: !!action.automatic && state.playing
          && !TERMINAL_PHASES.includes(phase) && !(state.settled && atEnd),
        impactPlaying: !!action.automatic && action.animateImpact !== false
          && phase !== state.phase && TERMINAL_PHASES.includes(phase),
        revision: action.automatic ? state.revision : state.revision + 1,
      };
    }
    case 'FINISH_IMPACT':
      if (!state.impactPlaying || action.revision !== undefined && action.revision !== state.revision) return state;
      return { ...state, impactPlaying: false };
    case 'PREVIOUS': {
      const index = state.available.indexOf(state.phase);
      return {
        ...state, phase: state.available[Math.max(0, index - 1)] ?? 'idle',
        playing: false, impactPlaying: false, revision: state.revision + 1,
      };
    }
    case 'TOGGLE_PLAY': {
      const atEnd = state.available.indexOf(state.phase) === state.available.length - 1;
      return {
        ...state, playing: !state.playing && !state.impactPlaying && !(state.settled && atEnd)
          && state.maxAvailable !== 'idle', impactPlaying: false, revision: state.revision + 1,
      };
    }
    case 'REPLAY': {
      if (!state.runId) return state;
      const phase = state.available.find((item) => item !== 'idle') ?? 'idle';
      return {
        ...state, phase, replay: true,
        playing: (action.autoplay ?? true) && !(state.settled && phase === state.maxAvailable),
        impactPlaying: false,
        revision: state.revision + 1,
      };
    }
  }
}
