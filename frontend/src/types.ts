export type SourceType = 'user' | 'camera' | 'model' | 'system';
export type Authority = 'task' | 'observation' | 'evidence' | 'delegated' | 'none';
export type SemanticRole = 'observation' | 'entity' | 'instruction' | 'instruction_derived' | 'unknown';
export type ValueUse = 'INFORMATIONAL_OUTPUT' | 'SIDE_EFFECT_ARGUMENT';
export interface GroundedClaim { predicate: string; value: string }
export interface Grounding { status: string; method?: string; [key: string]: unknown }
export interface UserDelegation {
  source: 'user'; tool: string; argument: string; semantic_role?: SemanticRole;
  predicate?: string; scope?: string; explicit?: boolean;
  target?: string; request_quote?: string;
}
export interface SemanticRegion {
  id: string; content: string; source: SourceType; semantic_role: SemanticRole;
  grounded_claim: GroundedClaim | null; grounding: Grounding | null;
  requested_behavior?: string | Record<string, unknown> | null;
  lineage: string[]; authority: 'EVIDENCE' | 'NONE';
  status: 'RETAIN' | 'DENY_INSTRUCTION_INFLUENCE' | 'UNSUPPORTED';
}
export interface FinalAnswer {
  text: string; value: string; grounded_claim: GroundedClaim | null; evidence_ids: string[];
  quoted_instruction_ids?: string[];
}

export interface ProvenanceValue {
  id: string;
  value: string;
  source_type: SourceType;
  source_id: string;
  trust: 'trusted' | 'untrusted' | 'conditional';
  authority: Authority[];
  lineage: string[];
  semantic_role?: SemanticRole;
  grounded_claim?: GroundedClaim | null;
  grounding?: Grounding | null;
  delegation?: UserDelegation | null;
}

export interface DetectedRegion {
  id: string;
  text: string;
  kind: 'scene_text' | 'instruction_like' | 'entity';
  bbox: { x: number; y: number; width: number; height: number };
  source: 'camera';
}

export interface ProposedAction {
  use?: ValueUse;
  validation_status?: 'valid' | 'invalid';
  id: string;
  tool: string;
  arguments: Record<string, ProvenanceValue>;
  status: 'proposed' | 'allowed' | 'blocked' | 'executed';
}

export interface PolicyDecision {
  use?: ValueUse;
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
  semantic_regions?: SemanticRegion[];
  retained_evidence_ids?: string[];
  denied_instruction_ids?: string[];
  user_intent?: Record<string, unknown>;
  delegation?: UserDelegation | null;
  final_answer?: FinalAnswer | null;
  argument_decisions?: Array<PolicyDecision & { value: string; source_id: string; semantic_role: SemanticRole }>;
  runtime?: 'mock' | 'prototype';
  error_code?: string | null;
  validation_issues?: Array<{ argument: string; kind: 'missing' | 'invalid'; message: string }>;
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
  prototype?: { model_profile?: string; status: string; model_loaded: boolean; error?: string | null; raw_error?: string | null } | null;
}

export interface CapturedFrame { blob: Blob; source: "camera" | "uploaded_image"; captureMs: number }
