# Live runtime architecture

Browser camera / uploaded image → one JPEG snapshot → same-origin HTTPS /api → Demo FastAPI → loopback Prototype HTTP service → resident Qwen3-VL 8B → existing action parser → deterministic authorization → simulated action → SSE UI.

`PrototypeRuntimeProvider` in the Demo translates the versioned HTTP contract into existing RunState snapshots. The Prototype owns model loading, preprocessing, prompts, parsing and policy. Neither repository imports the other. MockRuntimeProvider retains the deterministic scenario flow and is chosen only by explicit/default mock configuration.

The Prototype service reuses `create_local_provider('qwen3vl-8b')` and `invoke_phase3_5(ACTION_ONLY)` without editing benchmark implementation or configuration. It serializes inference, rejects concurrent compute workloads, lazily keeps one model resident, and never terminates other GPU processes. Reset only detaches the presentation; it does not cancel GPU generation.

The camera image and trusted user task are separate multipart fields. The existing action-only wrapper separates trusted task input from environmental evidence. Attack instructions must be in pixels, never pasted into the trusted task by scenario fixtures.

Automatic semantic evidence extraction is not wired. The trace therefore shows actual image → model → proposal transport lineage, plus scoped user delegation where applicable. Model values remain model-origin/untrusted; no camera region grounding is asserted. Existing Phase 2 thin gate decisions are preserved; non-ALLOW decisions withhold automatic execution. The business-card task has a narrow deterministic demo delegation rule, not a benchmark-policy modification. See README for its limitations.

Further Phase 3.6 integration belongs inside the Prototype service: supply an independent automatic perception implementation and immutable evidence registry, then invoke the stable grounding and authorization pipeline. Expose real evidence and policy through the existing HTTP response; never substitute model-generated trust labels for authority.

Evaluation remains a placeholder. A live model response, a withheld action, or a scoped delegation demonstration is not a measured defense success rate.

## Presentation layer

The cinematic frontend adds a data adapter and presentation state machine over the existing `RunState` snapshots. Model loading, prompts, parsing, policy, backend event ordering, and the runtime API are unchanged. `story.ts` normalizes existing fields for display, `usePresentation.ts` controls playback, and `useComparison.ts` collects the two comparison records through the existing run API.

| Display data | Actual source and limits |
| --- | --- |
| User request and frozen image | The submitted client request and captured frame URL; comparison retains the same request and frame for both calls. |
| Detections | `RunState.regions`; an empty list stays empty. No OCR boxes, confidence scores, or regions are synthesized. |
| Proposed action | `RunState.action`, including its existing argument values and validation status. Raw model values are preserved. |
| Highlighted argument | Prefer `decision.affected_argument`, then the first validation issue, when that argument exists; otherwise select the tool's primary existing argument or first existing field. Selection alone does not establish policy relevance or verified grounding. |
| Argument provenance | The selected `ProvenanceValue`, `trace_nodes`, and `trace_edges`. Source, trust, and authority are preserved; model-origin values do not become camera-origin values merely because an image was an input. |
| Semantic grounding | True only when runtime metadata explicitly reports `semantic_grounding` as verified. Transport lineage and scoped delegation do not imply semantic verification. |
| Authorization and result | `RunState.decision` and `RunState.outcome`. Missing or failed results remain missing or failed; no substitute decision is generated. |
| Runtime identity and diagnostics | The selected record's `runtime`, `runtime_metadata`, `raw_model_text`, and events remain available in the details drawer, including during cached replay. |

The presentation order is idle → capture → perception → semantic → provenance → proposal → authorization → the applicable blocked, allowed, executed, or failed result. Stage availability follows received fields and events. Perception may show actual inference progress with no detected regions, and the semantic stage presents received observations or proposed values without claiming verified grounding. Failed runs can reach failure directly after the supported explanatory stages, without inventing policy data. Completed result stages require matching actual authorization or bypass and outcome data.

One effect-owned timer advances available stages about every two seconds. A full sequence takes roughly twelve seconds after its data is available; inference can take longer. Playback waits when data is unavailable and stops at the terminal stage. New snapshots for the same run do not override the presenter's manual stage or pause; a new run starts a new presentation. Previous/next pauses playback, and reduced-motion preference defaults to manual control. Keyboard controls are Left/Right for previous/next, Space for play/pause, and R for current-record replay, except during text entry or while the details drawer is open. Opening the drawer pauses playback.

## Comparison and replay

**建立防護比較** captures once and saves the exact query, scenario, image Blob, and capture metadata. It submits two sequential requests using the existing API: guard off, then guard on. In prototype mode both requests upload the same image bytes; mock mode uses its configured fixtures and does not upload the image. These are independent runtime calls, so proposals may differ even with identical input. Each response keeps its own run ID, action, policy, failure, and outcome.

The unguarded story remains selected while the guarded request runs. After the first result, an explicit next step selects the guarded record; after the second result, playback stops and the comparison summary is shown. A failed half remains an analysis failure, never a fabricated bypass or successful defense. Capture or request errors that prevent collection leave an incomplete comparison visible as such.

**重播** and **R** replay the current cached record; **重播比較** starts again from the cached unguarded record and uses an explicit next step to reach the cached guarded record. These controls do not invoke inference or submit requests. This presentation replay is distinct from SSE `Last-Event-ID` recovery, which reconnects to the existing server run. Reset clears local presentation and comparison state and detaches the event stream; it does not cancel GPU generation or stop the camera.

Mock mode remains an explicit configuration choice, not an error recovery branch. Local backend configuration uses `LENSGUARD_RUNTIME=mock`; base `docker-compose.yml` also uses mock mode. The live Compose override selects `prototype`, including when persisted through root `.env` `COMPOSE_FILE`. A disconnected or failing Prototype service never silently substitutes fixture outcomes. Existing HTTPS and host-runtime setup remain documented in the [README](../README.md).
