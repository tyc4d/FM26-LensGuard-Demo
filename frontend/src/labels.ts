// Translate display labels only. API values, model output, and user input stay intact.
const labels: Record<string, string> = {
  call_phone: 'Call phone', navigate: 'Provide direction', provide_direction: 'Answer direction', open_url: 'Open URL',
  restaurant_reservation: 'Restaurant reservation', safety_advice: 'Safety advice', none: 'No action',
  answer_question: 'Answer question', phone_number: 'Phone number', scene_text: 'Scene text',
  proposed: 'Proposed', allowed: 'Allowed', blocked: 'Blocked', executed: 'Simulated',
  running: 'Running', completed: 'Completed', failed: 'Failed',
  ready: 'Ready', unloaded: 'Not loaded', loading: 'Loading', processing: 'Processing',
  unavailable: 'Unavailable', error: 'Error', warmed: 'Warmed up',
  user: 'User', camera: 'Camera', model: 'Model', system: 'System',
  task: 'Task authority', observation: 'Observation data', delegated: 'Explicit authorization',
  evidence: 'Supporting evidence', entity: 'Entity data', instruction: 'Embedded instruction', instruction_derived: 'Instruction-derived', unknown: 'Semantics unresolved',
  EVIDENCE: 'Supporting evidence', GROUNDED_EVIDENCE: 'Grounded scene information', USER_DELEGATED: 'Explicit user authorization',
  INFORMATIONAL_OUTPUT: 'Informational answer', SIDE_EFFECT_ARGUMENT: 'External action argument',
  RETAIN: 'Retain evidence', DENY_INSTRUCTION_INFLUENCE: 'Deny instruction influence', UNSUPPORTED: 'No supporting evidence',
  restaurant_reservation_phone: 'Restaurant reservation phone', card_phone: 'Business card phone', exit_direction: 'Exit direction',
  observed_restaurant: 'Observed restaurant', observed_card: 'Observed business card',
  DELEGATED: 'Explicit authorization', OBSERVATION_ONLY: 'Observation only', NONE: 'None',
  EXTERNAL_ACTION_TARGET: 'External action target authority', NAVIGATION_DIRECTION: 'Navigation direction authority',
  ALLOW: 'Allow', ALLOWED: 'Allowed', BLOCK: 'Block', BLOCKED: 'Blocked',
  DENY: 'Deny', WARN: 'Warning', CONFIRM: 'Confirmation required', EXECUTED: 'Simulated',
  BYPASS: 'Bypass authorization', BYPASSED: 'Authorization bypassed',
  CAMERA: 'Camera', IMAGE: 'Image', 'LOCAL VLM': 'Local vision-language model',
  'USER REQUEST': 'User request', delegation: 'Explicit authorization', 'No arguments': 'No arguments',
  source: 'Data source', 'visual region': 'Image region', 'derived value': 'Derived value',
  'action argument': 'Action argument', 'task authority': 'Task authority',
  'explicit authorization': 'Explicit authorization', 'policy decision': 'Policy decision',
  'simulation outcome': 'Simulation outcome', 'camera input': 'Camera input',
  'uploaded_image input': 'Uploaded image input', 'real inference': 'Real model inference',
  'model-derived; unverified': 'Model-derived; unverified', 'scoped delegation': 'Scoped delegation',
  'authorization / simulation': 'Authorization / simulation',
};

const fields: Record<string, string> = {
  number: 'Phone number', target_number: 'Phone number', restaurant: 'Restaurant', time: 'Reservation time',
  party_size: 'Party size', direction: 'Direction', destination: 'Destination', url: 'URL',
  advice: 'Advice', message: 'Message', reason: 'Reason', text: 'Text',
};

export function displayLabel(value: string | null | undefined): string {
  return value ? labels[value] ?? value : '—';
}

export function fieldLabel(path: string): string {
  if (fields[path]) return fields[path];
  if (labels[path]) return labels[path];
  const [tool, argument, ...rest] = path.split('.');
  if (['call_phone', 'navigate', 'provide_direction', 'open_url', 'restaurant_reservation', 'safety_advice', 'answer_question'].includes(tool) && argument && rest.length === 0) {
    return `${labels[tool]} / ${fields[argument] ?? argument}`;
  }
  return path;
}

export function traceLabel(value: string): string {
  return value.split(', ').map(part => labels[part] ?? fieldLabel(part)).join(', ');
}

const events: Record<string, string> = {
  queued: 'Awaiting analysis', 'frame.received': 'Image received',
  'inference.started': 'Model inference started', 'inference.completed': 'Model inference completed',
  'action.parsed': 'Action parsed', 'perception.scene_analyzed': 'Scene analyzed',
  'perception.text_extracted': 'Text extracted', 'model.action_proposed': 'Model proposed an action',
  'provenance.attached': 'Provenance attached', 'policy.evaluated': 'Authorization evaluated',
  'policy.bypassed': 'Authorization checks bypassed', 'action.allowed': 'Action allowed',
  'action.blocked': 'Action blocked', 'action.executed': 'Action simulated',
  'runtime.failed': 'Analysis failed', 'runtime.cancelled': 'Analysis cancelled',
};

export function eventLabel(value: string): string {
  return events[value] ?? value;
}

const timings: Record<string, string> = {
  frame_capture_ms: 'Image capture', demo_upload_receive_ms: 'Image upload received',
  prototype_inference_ms: 'Model inference', prototype_generation_ms: 'Model generation',
  prototype_parsing_and_metadata_ms: 'Parsing and metadata',
  prototype_policy_ms: 'Authorization evaluation', prototype_total_ms: 'Inference service total',
  prototype_request_ms: 'Inference service round trip', demo_runtime_ms: 'Analysis total',
  browser_upload_roundtrip_ms: 'Browser upload round trip', browser_total_ms: 'Browser total',
};

export function timingLabel(value: string): string {
  return timings[value] ?? value;
}

const scenarios: Record<string, string> = {
  'reservation-injection': 'Reservation prompt injection', 'navigation-injection': 'Navigation prompt injection',
  'explicit-delegation': 'Explicit user authorization',
  'clean-navigation': 'Clean exit observation', 'reservation-delegation': 'Restaurant phone delegation',
};

export function scenarioLabel(id: string, fallback: string): string {
  return scenarios[id] ?? fallback;
}

export function directionLabel(value: string): string {
  const directions: Record<string, string> = {
    LEFT: 'Left', RIGHT: 'Right', STRAIGHT: 'Straight ahead', BACK: 'Back',
    NORTH: 'North', SOUTH: 'South', EAST: 'East', WEST: 'West',
    NORTHEAST: 'Northeast', NORTHWEST: 'Northwest', SOUTHEAST: 'Southeast', SOUTHWEST: 'Southwest',
  };
  return directions[value.toUpperCase()] ?? value;
}
