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

Transport provenance is real; semantic grounding is unavailable. No inferred region coordinates or verified camera-source claims are created. `attack_success` and corrected navigation `result` remain null in real mode. CONFIRM/WARN are conservatively rendered as **已阻擋** without claiming attack detection. All actions are simulated.

## Model schema failures

JSON syntax success is separate from action-schema validity. Prototype may return `parsed=false` with a decoded `candidate_action` and parser `diagnostics` (for example a reservation with `party_size: "N/A"`). The candidate is display-only: Demo keeps its values and marks `action.validation_status=invalid`; it never coerces missing/invalid values or executes the candidate, even with Guard OFF. Policy is explicitly not evaluated.

Valid outputs support both `tool/arguments` and Prototype `action/arguments` (including native_action). RESTAURANT_RESERVATION maps to restaurant_reservation, target_number to number; all other arguments are retained. Malformed mappings, alias conflicts and invalid schemas terminate with one runtime.failed SSE snapshot, status=failed and a specific error_code. UI shows invalid output / no valid action rather than waiting. Raw text and upstream diagnostics are retained.

## Unusable action values

Parser success does not guarantee that an argument can be used by the action layer. For example, `DIRECTION_ADVICE` with `direction: "未知"` passes the frozen action schema but cannot be normalized into a supported direction. The Prototype validates supported action arguments before policy evaluation and adds `output.validation_error` (string on failure, otherwise null). It preserves `parsed`, parser diagnostics, `native_action`, `candidate_action`, and `raw_text`; it returns null `proposed_action` and `policy` for this failure. No replacement direction is inferred.

The Demo terminates these runs with `error_code: model_action_invalid`, an invalid display-only action, and null decision/outcome even with Guard OFF. A genuine missing policy uses `error_code: policy_unavailable`. Failed proposals show a terminal state rather than pending authorization. Region detection and semantic grounding remain unavailable in the action-only runtime; an empty `regions` list is not a detector result.

Explicit Chinese directions are accepted by the Prototype demo adapter: for example, `向右` is passed to the gate as `RIGHT`. Raw/native/candidate output and the displayed proposed value remain Chinese; the normalized direction appears in `policy.native.critical_arguments.direction`. This does not supply missing evidence or bypass authorization. Whole-value matching rejects phrases such as `未知`, `不要向右` and `向左或向右`.

## Reservation completeness and editable tasks

In real mode the browser provides an editable request before submission. The reservation request starts empty and **清除請求** empties its draft; navigation and business-card tasks start with their original scenario wording and offer **使用情境預設**. A nonblank request is required. The displayed task is sent in the multipart `user_request` field, and the summary retains the submitted text throughout the run.

Drafts are retained independently per scenario until the page reloads. Edits discard the prior run and retain the selected image; **重設** discards the run while preserving the draft. Editing is disabled during submission and inference. None of these controls modify scenario fixtures or implicitly authorize an action. Mock requests remain unchanged.

`RunState.validation_issues` contains `{argument, kind, message}` entries, where `argument` uses the displayed tool/field path and `kind` is `missing` or `invalid`. Reservation proposals are checked for nonblank restaurant/number/time and a strict positive integer party size. Known placeholder values such as `N/A` are treated as missing. This Demo completeness check also catches `time: "N/A"` when the frozen parser accepts it as a string; original `parsed` and diagnostics remain untouched.

Missing-only proposals terminate with `reservation_details_missing` and display **需要補充資料**. Other invalid values use `model_schema_invalid` and a concise field-specific message. The original candidate is display-only, with null policy/outcome and no Guard OFF execution. No number/time defaults, type coercion, fabricated CALL, or guessed reservation data are introduced. Raw parser details, including their original error text, remain under `runtime_metadata.output.diagnostics` rather than being copied into the public error message.

Completeness and type validation do not establish semantic grounding: a model can still propose well-typed values absent from the user's request. The existing reservation policy continues to block execution.

## Display language

The Demo UI, scenario descriptions, public errors, authorization explanations and event details use Traditional Chinese (`zh-Hant`). API enum values, identifiers, tool/argument keys and submitted user requests retain their existing contract. The UI translates known field/tool/status labels without modifying their stored values.

Original model/parser content and `runtime_metadata.policy.reason` remain unchanged. Public copies of upstream errors are localized; original transport diagnostics are retained in `runtime_metadata.upstream_error`, and a health error retains its original text in `prototype.raw_error`. Both are available under the collapsed **原始服務錯誤** disclosure, including failures before any model output exists.
