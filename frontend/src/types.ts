export type SourceType = 'user' | 'camera' | 'model' | 'system';
export type Authority = 'task' | 'observation' | 'delegated' | 'none';

export interface ProvenanceValue {
  id: string;
  value: string;
  source_type: SourceType;
  source_id: string;
  trust: 'trusted' | 'untrusted' | 'conditional';
  authority: Authority[];
  lineage: string[];
}

export interface DetectedRegion {
  id: string;
  text: string;
  kind: 'scene_text' | 'instruction_like' | 'entity';
  bbox: { x: number; y: number; width: number; height: number };
  source: 'camera';
}

export interface ProposedAction {
  id: string;
  tool: string;
  arguments: Record<string, ProvenanceValue>;
  status: 'proposed' | 'allowed' | 'blocked' | 'executed';
}

export interface PolicyDecision {
  result: 'allow' | 'block';
  rule_id: string;
  affected_argument: string;
  reason: string;
  source_authority: string;
  required_authority: string;
}

export interface RuntimeEvent {
  id: string;
  timestamp: string;
  type: string;
  detail: string;
}

export interface TraceNode {
  id: string;
  label: string;
  type: string;
  source?: SourceType | null;
}

export interface TraceEdge { from: string; to: string }

export interface Scenario {
  id: string;
  name: string;
  description: string;
  user_request: string;
  interpretation: string[];
  regions: DetectedRegion[];
  tool: string;
  argument_name: string;
  proposed_value: string;
  source_region_id: string;
  ground_truth: string | null;
  explicit_delegation: boolean;
  attack: boolean;
}

export interface RunOutcome {
  status: 'allowed' | 'blocked' | 'executed';
  simulation_only: boolean;
  attack_success: boolean | null;
  result: string | null;
  detail: string;
}

export interface RunState {
  runtime?: 'mock' | 'prototype';
  raw_model_text?: string | null;
  timings?: Record<string, number>;
  components?: Record<string, string>;
  runtime_metadata?: Record<string, unknown>;
  id: string;
  scenario_id: string;
  guard_enabled: boolean;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  frame_id: string | null;
  regions: DetectedRegion[];
  interpretation: string[];
  action: ProposedAction | null;
  decision: PolicyDecision | null;
  trace_nodes: TraceNode[];
  trace_edges: TraceEdge[];
  outcome: RunOutcome | null;
  events: RuntimeEvent[];
  error: string | null;
}

export interface Health {
  status: 'ok';
  runtime: 'mock' | 'prototype';
  model: string;
  prototype?: { status: string; model_loaded: boolean; error?: string | null } | null;
}

export interface CapturedFrame { blob: Blob; source: "camera" | "uploaded_image"; captureMs: number }
