"""Replaceable inference, provenance, and policy interface.

The current provider reads fixtures only. A Phase 3.6 adapter can implement this
protocol without changing the REST/SSE contract or frontend components. Camera
upload is deliberately absent in this demo; a real adapter must add an explicit
frame input contract before claiming to analyze the browser camera.
"""

import json
from pathlib import Path
from typing import Protocol

from pydantic import TypeAdapter

from .models import (
    DetectedRegion,
    PolicyDecision,
    ProposedAction,
    ProvenanceTrace,
    ProvenanceValue,
    RunOutcome,
    Scenario,
    TraceEdge,
    TraceNode,
)


class RuntimeProvider(Protocol):
    async def analyze_scene(self, scenario: Scenario) -> list[str]: ...

    async def extract_regions(self, scenario: Scenario) -> list[DetectedRegion]: ...

    async def propose_action(self, scenario: Scenario, run_id: str) -> ProposedAction: ...

    async def attach_provenance(
        self, scenario: Scenario, action: ProposedAction, frame_id: str
    ) -> ProvenanceTrace: ...

    async def evaluate_policy(
        self, scenario: Scenario, action: ProposedAction
    ) -> PolicyDecision: ...

    async def resolve_outcome(
        self,
        scenario: Scenario,
        guard_enabled: bool,
        decision: PolicyDecision | None,
    ) -> RunOutcome: ...


def load_scenarios(path: Path) -> dict[str, Scenario]:
    scenarios = TypeAdapter(list[Scenario]).validate_python(
        json.loads(path.read_text(encoding="utf-8"))
    )
    by_id = {scenario.id: scenario for scenario in scenarios}
    if len(by_id) != len(scenarios):
        raise ValueError("Scenario IDs must be unique")
    if not by_id:
        raise ValueError("At least one mock scenario is required")
    return by_id


class MockRuntimeProvider:
    """Deterministic demonstration behavior, never an external action executor.

    Delegation is supplied by the selected fixture. This intentionally does not
    claim that arbitrary natural-language delegation or policy is understood.
    All simulated authority decisions remain separate from instruction labels.
    """

    async def analyze_scene(self, scenario: Scenario) -> list[str]:
        return list(scenario.interpretation)

    async def extract_regions(self, scenario: Scenario) -> list[DetectedRegion]:
        return [region.model_copy(deep=True) for region in scenario.regions]

    async def propose_action(self, scenario: Scenario, run_id: str) -> ProposedAction:
        return ProposedAction(
            id=f"action_{run_id}",
            tool=scenario.tool,
            arguments={
                scenario.argument_name: ProvenanceValue(
                    id=f"value_{run_id}",
                    value=scenario.proposed_value,
                    source_type="model",
                    source_id=f"action_{run_id}",
                    trust="conditional",
                    authority=["none"],
                    lineage=[],
                )
            },
        )

    async def attach_provenance(
        self, scenario: Scenario, action: ProposedAction, frame_id: str
    ) -> ProvenanceTrace:
        action = action.model_copy(deep=True)
        value = action.arguments[scenario.argument_name]
        value.source_type = "camera"
        value.source_id = scenario.source_region_id
        value.trust = "conditional" if scenario.explicit_delegation else "untrusted"
        value.authority = ["observation"]
        value.lineage = [frame_id, scenario.source_region_id]
        nodes = [
            TraceNode(id="camera", label="CAMERA", type="source", source="camera"),
            TraceNode(id="region", label=scenario.source_region_id, type="visual region", source="camera"),
            TraceNode(id="value", label=value.value, type="derived value", source="camera"),
            TraceNode(id="argument", label=f"{action.tool}.{scenario.argument_name}", type="action argument", source="model"),
        ]
        edges = [
            TraceEdge(from_="camera", to="region"),
            TraceEdge(from_="region", to="value"),
            TraceEdge(from_="value", to="argument"),
        ]
        if scenario.explicit_delegation:
            value.authority.append("delegated")
            value.lineage.extend(["user_request", "delegation"])
            nodes.extend([
                TraceNode(id="user", label="USER REQUEST", type="task authority", source="user"),
                TraceNode(id="delegation", label="delegation", type="explicit authorization", source="user"),
            ])
            edges.extend([
                TraceEdge(from_="user", to="delegation"),
                TraceEdge(from_="delegation", to="value"),
            ])
        return ProvenanceTrace(action=action, nodes=nodes, edges=edges)

    async def evaluate_policy(
        self, scenario: Scenario, action: ProposedAction
    ) -> PolicyDecision:
        value = action.arguments[scenario.argument_name]
        affected_argument = f"{action.tool}.{scenario.argument_name}"
        delegated = "delegated" in value.authority
        return PolicyDecision(
            result="allow" if delegated else "block",
            rule_id="camera.argument.requires_delegation",
            affected_argument=affected_argument,
            reason=(
                f"Explicit user delegation permits this camera-derived value to bind {affected_argument} for this action."
                if delegated
                else "Camera-derived content attempted to bind a security-sensitive action argument without explicit user delegation."
            ),
            source_authority="DELEGATED" if delegated else "OBSERVATION_ONLY",
            required_authority=(
                "EXTERNAL_ACTION_TARGET" if action.tool == "call_phone" else "NAVIGATION_DIRECTION"
            ),
        )

    async def resolve_outcome(
        self,
        scenario: Scenario,
        guard_enabled: bool,
        decision: PolicyDecision | None,
    ) -> RunOutcome:
        if not guard_enabled:
            return RunOutcome(
                status="executed",
                attack_success=True if scenario.attack else None,
                result=scenario.proposed_value,
                detail="Proposed action executed in simulation. No external service was contacted.",
            )
        if decision is None:
            raise ValueError("An enabled guard requires a policy decision")
        if decision.result == "allow":
            return RunOutcome(
                status="allowed",
                attack_success=None,
                result=scenario.proposed_value,
                detail="Action authorized by explicit user delegation. Simulation only; no external service was contacted.",
            )
        safe_direction = scenario.ground_truth if scenario.tool == "navigate" else None
        return RunOutcome(
            status="blocked",
            attack_success=False if scenario.attack else None,
            result=safe_direction,
            detail=(
                f"Injected direction blocked. Mock safe result: {safe_direction}."
                if safe_direction
                else "Unauthorized camera-derived target blocked. No external action was executed."
            ),
        )
