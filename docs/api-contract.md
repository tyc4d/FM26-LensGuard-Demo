# Runtime contract

Pydantic models: `backend/app/models.py`; TypeScript: `frontend/src/types.ts`.

- `GET /api/health`: Demo connection status and `runtime: mock|prototype`. Prototype mode includes upstream readiness, loaded state and errors; upstream failure does not change modes.
- `GET /api/scenarios`: three fixtures. In real mode only the selected user task and scenario ID are forwarded, not proposed values, malicious text or ground truth.
- `POST /api/run`: returns HTTP 202 initial `RunState`. Mock accepts existing JSON `{scenario_id, guard_enabled}`. Real requires multipart `image` (JPEG/PNG, <=10 MiB), `user_request` (1–4000 characters), `scenario_id`, `guard_enabled` (`true`/`false`), optional `source` (`camera`/`uploaded_image`), `capture_ms`.
- `GET /api/run/{id}`: full state.
- `GET /api/run/{id}/events`: named `runtime` SSE with complete immutable snapshots; backend UTC timestamps, reconnect replay via Last-Event-ID, heartbeat comments, terminal close.

Real sequence: frame.received → inference.started → inference.completed → action.parsed → provenance.attached → policy.evaluated (or policy.bypassed) → action.allowed/blocked/executed. Errors terminate with runtime.failed. No fake sleeps or text_extracted event. Stages after inference describe results already computed by the upstream request, not fabricated model progress.

Extra optional state fields: `runtime`, `raw_model_text`, `components`, `timings`, `runtime_metadata`. Old mock contracts remain usable. A parse failure preserves raw text, leaves action/outcome null, and terminates failed. Policy absence withholds execution. Native policy results remain under runtime_metadata.policy.native. Timing keys name their measured scope; browser roundtrip includes upload + request acceptance, server upload timing measures request-body receipt, not network-only latency.

The Prototype boundary is `POST /v1/analyze`: multipart image, user_request, scenario_id, mode=action_only. Response contract `lensguard-demo-v1` contains request_id, model, input, output (raw_text, parsed, proposed_action, native_action, diagnostics), provenance, policy, timing. No direct imports cross repositories. Image bytes are not retained in run snapshots or logs.

Transport provenance is real; semantic grounding is unavailable. No inferred region coordinates or verified camera-source claims are created. `attack_success` and corrected navigation `result` remain null in real mode. CONFIRM/WARN are conservatively rendered BLOCKED without claiming attack detection. All actions are simulated.

## Model schema failures

JSON syntax success is separate from action-schema validity. Prototype may return `parsed=false` with a decoded `candidate_action` and parser `diagnostics` (for example a reservation with `party_size: "N/A"`). The candidate is display-only: Demo keeps its values and marks `action.validation_status=invalid`; it never coerces missing/invalid values or executes the candidate, even with Guard OFF. Policy is explicitly not evaluated.

Valid outputs support both `tool/arguments` and Prototype `action/arguments` (including native_action). RESTAURANT_RESERVATION maps to restaurant_reservation, target_number to number; all other arguments are retained. Malformed mappings, alias conflicts and invalid schemas terminate with one runtime.failed SSE snapshot, status=failed and a specific error_code. UI shows invalid output / no valid action rather than waiting. Raw text and upstream diagnostics are retained.
