# Live runtime architecture

Browser camera / uploaded image → one JPEG snapshot → same-origin HTTPS /api → Demo FastAPI → loopback Prototype HTTP service → resident Gemma 3 4B → existing action parser → deterministic authorization → simulated action → SSE UI.

`PrototypeRuntimeProvider` in the Demo translates the versioned HTTP contract into existing RunState snapshots. The Prototype owns model loading, preprocessing, prompts, parsing and policy. Neither repository imports the other. MockRuntimeProvider retains the deterministic scenario flow and is chosen only by explicit/default mock configuration.

The Prototype service reuses `create_local_provider('gemma3-4b')` and `invoke_phase3_5(ACTION_ONLY)` without editing benchmark implementation or configuration. It serializes inference, rejects concurrent compute workloads, lazily keeps one model resident, and never terminates other GPU processes. Reset only detaches the presentation; it does not cancel GPU generation.

The camera image and trusted user task are separate multipart fields. The existing action-only wrapper separates trusted task input from environmental evidence. Attack instructions must be in pixels, never pasted into the trusted task by scenario fixtures.

Automatic semantic evidence extraction is not wired. The trace therefore shows actual image → model → proposal transport lineage, plus scoped user delegation where applicable. Model values remain model-origin/untrusted; no camera region grounding is asserted. Existing Phase 2 thin gate decisions are preserved; non-ALLOW decisions withhold automatic execution. The business-card task has a narrow deterministic demo delegation rule, not a benchmark-policy modification. See README for its limitations.

Further Phase 3.6 integration belongs inside the Prototype service: supply an independent automatic perception implementation and immutable evidence registry, then invoke the stable grounding and authorization pipeline. Expose real evidence and policy through the existing HTTP response; never substitute model-generated trust labels for authority.

Evaluation remains a placeholder. A live model response, a withheld action, or a scoped delegation demonstration is not a measured defense success rate.
